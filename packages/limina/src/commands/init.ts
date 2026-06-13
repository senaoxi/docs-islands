import * as prompts from '@clack/prompts';
import { createElapsedTimer } from 'logaria/helper';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'pathe';
import { glob } from 'tinyglobby';
import { parse as parseYaml } from 'yaml';
import type { ResolvedLiminaConfig } from '../config';
import type { LiminaFlowReporter } from '../flow';
import { clearCliScreen, formatErrorMessage, InitLogger } from '../logger';
import { normalizeAbsolutePath, toRelativePath } from '../utils/path';
import {
  collectWorkspacePackages,
  type PackageManifest,
  readJsonFile,
} from '../workspace';

export interface RunInitOptions {
  clearScreen?: boolean;
  cwd?: string;
  flow?: LiminaFlowReporter;
  flowDepth?: number;
  yes?: boolean;
}

export interface RunInitResult {
  checkCommand: string;
  installRequired: boolean;
  rootDir: string;
  skippedFiles: string[];
  workspacePackageCount: number;
  writtenFiles: string[];
}

interface InitPromptOptions {
  yes?: boolean;
}

interface LiminaPackageMetadata {
  typescriptRange: string;
  versionRange: string;
}

const pnpmWorkspaceFileName = 'pnpm-workspace.yaml';
const liminaConfigFileName = 'limina.config.mjs';
const liminaCheckScriptName = 'limina:check';
const liminaCheckScriptValue = 'limina check';
const ignoredGlobPatterns = [
  '**/.git/**',
  '**/.limina/**',
  '**/.pnpm-store/**',
  '**/.tsbuild/**',
  '**/coverage/**',
  '**/dist/**',
  '**/node_modules/**',
];

function findPnpmWorkspaceRoot(startDir: string): string | null {
  let currentDir = path.resolve(startDir);

  while (true) {
    if (existsSync(path.join(currentDir, pnpmWorkspaceFileName))) {
      return normalizeAbsolutePath(currentDir);
    }

    const parentDir = path.dirname(currentDir);

    if (parentDir === currentDir) {
      return null;
    }

    currentDir = parentDir;
  }
}

function createInitConfig(rootDir: string): ResolvedLiminaConfig {
  return {
    configPath: path.join(rootDir, liminaConfigFileName),
    rootDir,
  };
}

function formatConfigPath(rootDir: string, configPath: string): string {
  return toRelativePath(rootDir, configPath);
}

function stringifyJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function createLiminaConfigContent(): string {
  return `import { defineConfig } from 'limina';

export default defineConfig({
  // Source tsconfig coverage used by graph, proof, and typecheck checks.
  config: {
    checkers: {
      typescript: {
        preset: 'tsc',
        include: [
          'tsconfig.json',
          'packages/**/tsconfig*.json',
        ],
        exclude: [
          '**/tsconfig*.dts.json',
          '**/tsconfig*.build.json',
          '**/tsconfig*.base.json',
          '**/tsconfig*.check.json',
        ],
      },
    },
  },
});
`;
}

async function confirmAction(
  options: InitPromptOptions,
  message: string,
): Promise<boolean> {
  if (options.yes) {
    return true;
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      `${message} Run limina init --yes to accept the default confirmation in non-interactive environments.`,
    );
  }

  const result = await prompts.confirm({
    initialValue: true,
    message,
  });

  if (prompts.isCancel(result)) {
    throw new Error('limina init canceled.');
  }

  return result;
}

async function writeTextFile(
  filePath: string,
  content: string,
  writtenFiles: string[],
): Promise<void> {
  await mkdir(path.dirname(filePath), {
    recursive: true,
  });
  await writeFile(filePath, content);
  writtenFiles.push(filePath);
}

function findPnpmWorkspacePath(startDir: string): string | null {
  const rootDir = findPnpmWorkspaceRoot(startDir);

  return rootDir ? path.join(rootDir, pnpmWorkspaceFileName) : null;
}

function resolveCatalogRange(
  range: string | undefined,
  packageName: string,
  packageManifestPath: string,
): string | null {
  if (!range) {
    return null;
  }

  if (!range.startsWith('catalog:')) {
    return range;
  }

  const workspacePath = findPnpmWorkspacePath(
    path.dirname(packageManifestPath),
  );

  if (!workspacePath || !existsSync(workspacePath)) {
    return null;
  }

  const parsed = parseYaml(readFileSync(workspacePath, 'utf8')) as {
    catalog?: Record<string, string>;
    catalogs?: Record<string, Record<string, string>>;
  } | null;
  const catalogName = range.slice('catalog:'.length);

  if (catalogName.length === 0 || catalogName === 'default') {
    return parsed?.catalog?.[packageName] ?? null;
  }

  return parsed?.catalogs?.[catalogName]?.[packageName] ?? null;
}

function readLiminaPackageMetadata(): LiminaPackageMetadata {
  const require = createRequire(import.meta.url);
  const manifestPath = require.resolve('limina/package.json');
  const manifest = readJsonFile<PackageManifest & { version?: string }>(
    manifestPath,
  );
  const versionRange = manifest.version ? `^${manifest.version}` : '^0.0.1';
  const rawTypeScriptRange =
    manifest.peerDependencies?.typescript ??
    manifest.devDependencies?.typescript ??
    manifest.dependencies?.typescript;
  const typescriptRange =
    resolveCatalogRange(rawTypeScriptRange, 'typescript', manifestPath) ??
    rawTypeScriptRange ??
    '^5.9.0';

  return {
    typescriptRange,
    versionRange,
  };
}

function hasDependency(
  manifest: PackageManifest,
  dependencyName: string,
): boolean {
  return Boolean(
    manifest.dependencies?.[dependencyName] ||
      manifest.devDependencies?.[dependencyName] ||
      manifest.optionalDependencies?.[dependencyName] ||
      manifest.peerDependencies?.[dependencyName],
  );
}

async function updateRootPackageJson(options: {
  metadata: LiminaPackageMetadata;
  prompt: InitPromptOptions;
  rootDir: string;
  skippedFiles: string[];
  writtenFiles: string[];
}): Promise<boolean> {
  const packageJsonPath = path.join(options.rootDir, 'package.json');
  let installRequired = false;

  if (!existsSync(packageJsonPath)) {
    const shouldCreate = await confirmAction(
      options.prompt,
      `No package.json found at ${formatConfigPath(options.rootDir, packageJsonPath)}. Create one?`,
    );

    if (!shouldCreate) {
      options.skippedFiles.push(packageJsonPath);
      return false;
    }

    const manifest: PackageManifest = {
      private: true,
      type: 'module',
      scripts: {
        [liminaCheckScriptName]: liminaCheckScriptValue,
      },
      devDependencies: {
        limina: options.metadata.versionRange,
        typescript: options.metadata.typescriptRange,
      },
    };

    await writeTextFile(
      packageJsonPath,
      stringifyJson(manifest),
      options.writtenFiles,
    );

    return true;
  }

  const manifest = readJsonFile<PackageManifest>(packageJsonPath);
  const scripts = {
    ...manifest.scripts,
  };
  let changed = false;

  if (
    scripts[liminaCheckScriptName] &&
    scripts[liminaCheckScriptName] !== liminaCheckScriptValue
  ) {
    const shouldOverwrite = await confirmAction(
      options.prompt,
      `Script "${liminaCheckScriptName}" already exists in package.json. Overwrite it?`,
    );

    if (shouldOverwrite) {
      scripts[liminaCheckScriptName] = liminaCheckScriptValue;
      changed = true;
    }
  } else if (!scripts[liminaCheckScriptName]) {
    scripts[liminaCheckScriptName] = liminaCheckScriptValue;
    changed = true;
  }

  if (!hasDependency(manifest, 'limina')) {
    manifest.devDependencies = {
      ...manifest.devDependencies,
      limina: options.metadata.versionRange,
    };
    installRequired = true;
    changed = true;
  }

  if (changed) {
    await writeTextFile(
      packageJsonPath,
      stringifyJson({
        ...manifest,
        scripts,
      }),
      options.writtenFiles,
    );
  }

  return installRequired;
}

async function collectReservedConfigConflicts(
  rootDir: string,
): Promise<string[]> {
  const conflicts = await glob(
    [
      'tsconfig*.build.json',
      '**/tsconfig*.build.json',
      'tsconfig*.dts.json',
      '**/tsconfig*.dts.json',
    ],
    {
      absolute: false,
      cwd: rootDir,
      ignore: ignoredGlobPatterns,
    },
  );

  return [...new Set(conflicts)].sort();
}

async function writeLiminaConfig(options: {
  prompt: InitPromptOptions;
  rootDir: string;
  skippedFiles: string[];
  writtenFiles: string[];
}): Promise<void> {
  const configPath = path.join(options.rootDir, liminaConfigFileName);

  if (existsSync(configPath)) {
    const shouldOverwrite = await confirmAction(
      options.prompt,
      `${liminaConfigFileName} already exists. Overwrite it?`,
    );

    if (!shouldOverwrite) {
      options.skippedFiles.push(configPath);
      return;
    }
  }

  await writeTextFile(
    configPath,
    createLiminaConfigContent(),
    options.writtenFiles,
  );
}

async function ensureGeneratedGraphGitignore(options: {
  rootDir: string;
  skippedFiles: string[];
  writtenFiles: string[];
}): Promise<void> {
  const gitignorePath = path.join(options.rootDir, '.gitignore');
  const entry = '.limina/';

  if (!existsSync(gitignorePath)) {
    await writeTextFile(gitignorePath, `${entry}\n`, options.writtenFiles);
    return;
  }

  const content = readFileSync(gitignorePath, 'utf8');

  if (content.split(/\r?\n/u).includes(entry)) {
    options.skippedFiles.push(gitignorePath);
    return;
  }

  const separator = content.endsWith('\n') || content.length === 0 ? '' : '\n';

  await writeTextFile(
    gitignorePath,
    `${content}${separator}${entry}\n`,
    options.writtenFiles,
  );
}

async function runInitInternal(
  options: RunInitOptions,
): Promise<RunInitResult> {
  const cwd = normalizeAbsolutePath(options.cwd ?? process.cwd());
  const rootDir = findPnpmWorkspaceRoot(cwd);

  if (!rootDir) {
    throw new Error(
      `Unable to run limina init from ${cwd}: no pnpm-workspace.yaml was found in this directory or its parents.`,
    );
  }

  const rootPackageJsonPath = path.join(rootDir, 'package.json');
  const rootPackageName = existsSync(rootPackageJsonPath)
    ? readJsonFile<PackageManifest>(rootPackageJsonPath).name
    : undefined;

  const shouldUseRoot = await confirmAction(
    options,
    `Use pnpm workspace ${rootPackageName ? `"${rootPackageName}" ` : ''}at ${rootDir}?`,
  );

  if (!shouldUseRoot) {
    throw new Error('limina init canceled.');
  }

  const reservedConflicts = await collectReservedConfigConflicts(rootDir);

  if (reservedConflicts.length > 0) {
    throw new Error(
      [
        'Unable to run limina init because reserved Limina tsconfig names already exist:',
        ...reservedConflicts.map((configPath) => `  - ${configPath}`),
        'reason: tsconfig*.build.json and tsconfig*.dts.json are Limina init output names; rename existing files before running init.',
      ].join('\n'),
    );
  }

  const config = createInitConfig(rootDir);
  const workspacePackages = (await collectWorkspacePackages(config)).filter(
    (workspacePackage) => workspacePackage.directory !== rootDir,
  );

  const metadata = readLiminaPackageMetadata();
  const writtenFiles: string[] = [];
  const skippedFiles: string[] = [];

  await writeLiminaConfig({
    prompt: options,
    rootDir,
    skippedFiles,
    writtenFiles,
  });
  await ensureGeneratedGraphGitignore({
    rootDir,
    skippedFiles,
    writtenFiles,
  });
  const installRequired = await updateRootPackageJson({
    metadata,
    prompt: options,
    rootDir,
    skippedFiles,
    writtenFiles,
  });

  return {
    checkCommand: 'pnpm limina:check',
    installRequired,
    rootDir,
    skippedFiles,
    workspacePackageCount: workspacePackages.length,
    writtenFiles,
  };
}

export async function runInit(
  options: RunInitOptions = {},
): Promise<RunInitResult> {
  if (options.clearScreen ?? true) {
    clearCliScreen();
  }

  const elapsed = createElapsedTimer();
  const task = options.flow?.start('init workspace', {
    depth: options.flowDepth ?? 0,
  });

  InitLogger.info('init started');

  try {
    const result = await runInitInternal(options);

    InitLogger.success(
      `init generated ${result.writtenFiles.length} files for ${result.workspacePackageCount} workspace packages.`,
      elapsed(),
    );

    if (result.installRequired) {
      InitLogger.info(
        'limina was added to devDependencies; run pnpm i before checking.',
      );
    }

    InitLogger.info(
      `next: ${result.installRequired ? 'pnpm i && ' : ''}${result.checkCommand}`,
    );
    task?.pass();

    return result;
  } catch (error) {
    InitLogger.error(`init failed: ${formatErrorMessage(error)}`, elapsed());
    task?.fail('init failed', { error });
    throw error;
  }
}
