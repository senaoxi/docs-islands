import {
  checkPackage,
  createPackageFromTarballData,
  type Problem,
} from '@arethetypeswrong/core';
import { pack } from '@publint/pack';
import { init, parse } from 'es-module-lexer';
import { createElapsedTimer } from 'logaria/helper';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { builtinModules } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { publint } from 'publint';
import { formatMessage } from 'publint/utils';
import type {
  PackageAttwProfile,
  PackageCheckTarget,
  PackageCheckTool,
  PackageCheckToolSelection,
  ResolvedLiminaConfig,
  RuntimeEnvironment,
} from '../config';
import type { LiminaFlowReporter } from '../flow';
import { PackageLogger, clearCliScreen, formatErrorMessage } from '../logger';
import { toRelativePath } from '../utils/path';
import { getPackageRootSpecifier } from '../workspace';

interface DistPackageJson {
  dependencies?: Record<string, string>;
  exports?: Record<string, unknown>;
  name: string;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  private?: boolean;
}

export interface PublishedPackageBoundaryTarget {
  outDir: string;
  environment?:
    | RuntimeEnvironment
    | ((relativeFilePath: string) => RuntimeEnvironment);
  ignoredExternalPackages?: string[];
}

export interface PublishedPackageBoundaryViolation {
  environment: RuntimeEnvironment;
  filePath: string;
  message: string;
  specifier: string;
}

interface PackedPackageTarball {
  cleanup: () => Promise<void>;
  tarball: Buffer;
}

interface SelfSpecifierMatchers {
  exact: Set<string>;
  prefixes: string[];
}

export interface RunPackageCheckOptions {
  attwProfile?: PackageAttwProfile;
  clearScreen?: boolean;
  config: ResolvedLiminaConfig;
  cwd?: string;
  flow?: LiminaFlowReporter;
  flowDepth?: number;
  targetName?: string;
  tool?: PackageCheckToolSelection;
}

interface PlannedPackageCheckTarget {
  checks: PackageCheckTool[];
  label: string;
  outDir: string;
  rawTarget: PackageCheckTarget;
}

interface PackageCheckPlan {
  selectionReason: string;
  targets: PlannedPackageCheckTarget[];
}

const DEFAULT_PACKAGE_CHECKS: PackageCheckTool[] = [
  'publint',
  'attw',
  'boundary',
];
const PACKAGE_CHECK_TOOLS = new Set<PackageCheckTool>(DEFAULT_PACKAGE_CHECKS);
const ATTW_PROFILE_IGNORED_RESOLUTIONS: Record<PackageAttwProfile, string[]> = {
  strict: [],
  node16: [],
  'esm-only': ['node16-cjs'],
};
const nodeBuiltinSpecifiers = new Set(
  builtinModules.flatMap((specifier) =>
    specifier.startsWith('node:')
      ? [specifier, specifier.slice('node:'.length)]
      : [specifier, `node:${specifier}`],
  ),
);
const REQUIRED_PUBLIC_PACKAGE_FILES = ['README.md', 'LICENSE.md'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPackageCheckTool(value: string): value is PackageCheckTool {
  return PACKAGE_CHECK_TOOLS.has(value as PackageCheckTool);
}

function isRelativeOrAbsoluteSpecifier(specifier: string): boolean {
  return (
    specifier.startsWith('.') ||
    specifier.startsWith('/') ||
    specifier.startsWith('file:') ||
    specifier.startsWith('http:') ||
    specifier.startsWith('https:') ||
    specifier.startsWith('data:')
  );
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

function collectSelfSpecifierMatchers(
  packageName: string,
  exportsField: DistPackageJson['exports'],
): SelfSpecifierMatchers {
  const exact = new Set<string>([packageName]);
  const prefixes: string[] = [];

  if (!isRecord(exportsField)) {
    return {
      exact,
      prefixes,
    };
  }

  for (const exportKey of Object.keys(exportsField)) {
    if (exportKey === '.') {
      exact.add(packageName);
      continue;
    }

    if (!exportKey.startsWith('./')) {
      continue;
    }

    const normalizedSubpath = exportKey.slice('./'.length);

    if (normalizedSubpath.length === 0) {
      continue;
    }

    const wildcardIndex = normalizedSubpath.indexOf('*');

    if (wildcardIndex !== -1) {
      prefixes.push(
        `${packageName}/${normalizedSubpath.slice(0, wildcardIndex)}`,
      );
      continue;
    }

    exact.add(`${packageName}/${normalizedSubpath}`);
  }

  return {
    exact,
    prefixes,
  };
}

function isAllowedSelfSpecifier(
  specifier: string,
  matchers: SelfSpecifierMatchers,
): boolean {
  return (
    matchers.exact.has(specifier) ||
    matchers.prefixes.some((prefix) => specifier.startsWith(prefix))
  );
}

function normalizePublishedModulePath(relativeFilePath: string): string {
  return relativeFilePath.replaceAll('\\', '/');
}

function classifyRuntimeEnvironment(
  target: PublishedPackageBoundaryTarget,
  relativeFilePath: string,
): RuntimeEnvironment {
  if (typeof target.environment === 'function') {
    return target.environment(relativeFilePath);
  }

  if (target.environment) {
    return target.environment;
  }

  const normalizedPath = normalizePublishedModulePath(relativeFilePath);

  return normalizedPath.startsWith('node/') ||
    normalizedPath.startsWith('plugin/')
    ? 'node'
    : 'browser';
}

async function collectPublishedModuleFiles(
  directoryPath: string,
): Promise<string[]> {
  const entries = await readdir(directoryPath, {
    withFileTypes: true,
  });
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectPublishedModuleFiles(absolutePath)));
      continue;
    }

    if (/\.[cm]?js$/u.test(entry.name)) {
      files.push(absolutePath);
    }
  }

  return files;
}

function validatePublishedSpecifier(options: {
  allowedExternalPackages: Set<string>;
  environment: RuntimeEnvironment;
  packageName: string;
  selfSpecifiers: SelfSpecifierMatchers;
  specifier: string;
}): string | null {
  const {
    allowedExternalPackages,
    environment,
    packageName,
    selfSpecifiers,
    specifier,
  } = options;

  if (isRelativeOrAbsoluteSpecifier(specifier)) {
    return null;
  }

  if (nodeBuiltinSpecifiers.has(specifier)) {
    if (environment === 'node') {
      return null;
    }

    return `browser/runtime output must not import Node builtin "${specifier}"`;
  }

  const packageRoot = getPackageRootSpecifier(specifier);

  if (packageRoot === packageName) {
    if (isAllowedSelfSpecifier(specifier, selfSpecifiers)) {
      return null;
    }

    return `self import "${specifier}" is not exposed by output package.json exports`;
  }

  if (allowedExternalPackages.has(packageRoot)) {
    return null;
  }

  return `"${specifier}" resolves to package "${packageRoot}" which is not listed in dependencies, peerDependencies, optionalDependencies, or self exports`;
}

function formatAttwProblem(problem: Problem): string {
  const resolutionKind =
    'resolutionKind' in problem
      ? ` [resolution: ${problem.resolutionKind}]`
      : '';
  const entrypoint =
    'entrypoint' in problem ? ` [entrypoint: ${problem.entrypoint}]` : '';

  switch (problem.kind) {
    case 'NoResolution': {
      return `No resolution${resolutionKind}${entrypoint}`;
    }
    case 'UntypedResolution': {
      return `Untyped resolution${resolutionKind}${entrypoint}`;
    }
    case 'FalseESM': {
      return `False ESM: ${problem.typesFileName} -> ${problem.implementationFileName}`;
    }
    case 'FalseCJS': {
      return `False CJS: ${problem.typesFileName} -> ${problem.implementationFileName}`;
    }
    case 'CJSResolvesToESM': {
      return `CJS resolves to ESM${resolutionKind}${entrypoint}`;
    }
    case 'FallbackCondition': {
      return `Fallback condition used${resolutionKind}${entrypoint}`;
    }
    case 'NamedExports': {
      return problem.isMissingAllNamed
        ? `Named exports missing: all named exports [types: ${problem.typesFileName}] [implementation: ${problem.implementationFileName}]`
        : `Named exports missing: ${problem.missing.join(', ') || '(none)'} [types: ${problem.typesFileName}] [implementation: ${problem.implementationFileName}]`;
    }
    case 'FalseExportDefault': {
      return `False export default [types: ${problem.typesFileName}] [implementation: ${problem.implementationFileName}]`;
    }
    case 'MissingExportEquals': {
      return `Missing export equals [types: ${problem.typesFileName}] [implementation: ${problem.implementationFileName}]`;
    }
    case 'InternalResolutionError': {
      return `Internal resolution error in ${problem.fileName} [option: ${problem.resolutionOption}] [module: ${problem.moduleSpecifier}]`;
    }
    case 'UnexpectedModuleSyntax': {
      return `Unexpected module syntax in ${problem.fileName}`;
    }
    case 'CJSOnlyExportsDefault': {
      return `CJS only exports default in ${problem.fileName}`;
    }
    default: {
      return `Unknown ATTW problem: ${JSON.stringify(problem)}`;
    }
  }
}

function normalizeTargetChecks(target: PackageCheckTarget): PackageCheckTool[] {
  const checks = target.checks ?? DEFAULT_PACKAGE_CHECKS;
  const normalizedChecks: PackageCheckTool[] = [];

  for (const check of checks) {
    if (!isPackageCheckTool(check)) {
      throw new Error(
        `Invalid package check "${check}". Expected one of: publint, attw, boundary.`,
      );
    }

    if (!normalizedChecks.includes(check)) {
      normalizedChecks.push(check);
    }
  }

  return normalizedChecks;
}

function selectTargetChecks(
  target: PackageCheckTarget,
  requestedTool: PackageCheckToolSelection | undefined,
): PackageCheckTool[] {
  const configuredChecks = normalizeTargetChecks(target);

  if (!requestedTool || requestedTool === 'all') {
    return configuredChecks;
  }

  return configuredChecks.includes(requestedTool) ? [requestedTool] : [];
}

function findNearestPackageJsonPath(
  cwd: string,
  rootDir: string,
): string | undefined {
  const resolvedRootDir = path.resolve(rootDir);
  let currentDir = path.resolve(cwd);

  while (true) {
    const relativeToRoot = path.relative(resolvedRootDir, currentDir);
    const isWithinRoot =
      relativeToRoot === '' ||
      (relativeToRoot !== '..' &&
        !relativeToRoot.startsWith(`..${path.sep}`) &&
        !path.isAbsolute(relativeToRoot));

    if (!isWithinRoot) {
      return undefined;
    }

    const packageJsonPath = path.join(currentDir, 'package.json');

    if (existsSync(packageJsonPath)) {
      return packageJsonPath;
    }

    if (currentDir === resolvedRootDir) {
      return undefined;
    }

    const parentDir = path.dirname(currentDir);

    if (parentDir === currentDir) {
      return undefined;
    }

    currentDir = parentDir;
  }
}

function readCwdPackageName(cwd: string, rootDir: string): string | undefined {
  const packageJsonPath = findNearestPackageJsonPath(cwd, rootDir);

  if (!packageJsonPath) {
    return undefined;
  }

  try {
    const manifest = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      name?: unknown;
    };

    return typeof manifest.name === 'string' && manifest.name.trim()
      ? manifest.name.trim()
      : undefined;
  } catch (error) {
    throw new Error(
      `Unable to read package name from ${packageJsonPath}: ${formatErrorMessage(
        error,
      )}`,
    );
  }
}

function formatConfiguredTargetNames(targets: PackageCheckTarget[]): string {
  const names = targets
    .map((target) => target.name)
    .filter((name): name is string => Boolean(name));

  return names.length > 0 ? names.join(', ') : '(none)';
}

function resolveTargetOutDir(options: {
  config: ResolvedLiminaConfig;
  target: PackageCheckTarget;
  targetIndex: number;
}): string {
  const outDir = (options.target as { outDir?: unknown }).outDir;

  if (typeof outDir !== 'string' || outDir.trim().length === 0) {
    throw new Error(
      `Invalid package check target at packageChecks.targets[${options.targetIndex}].outDir. Expected a non-empty string.`,
    );
  }

  return path.resolve(options.config.rootDir, outDir);
}

function getTargetLabel(
  config: ResolvedLiminaConfig,
  target: PackageCheckTarget,
  outDir: string,
): string {
  return target.name ?? toRelativePath(config.rootDir, outDir);
}

function createTargetPlan(options: {
  config: ResolvedLiminaConfig;
  requestedTool: PackageCheckToolSelection | undefined;
  target: PackageCheckTarget;
  targetIndex: number;
}): PlannedPackageCheckTarget {
  const outDir = resolveTargetOutDir({
    config: options.config,
    target: options.target,
    targetIndex: options.targetIndex,
  });

  return {
    checks: selectTargetChecks(options.target, options.requestedTool),
    label: getTargetLabel(options.config, options.target, outDir),
    outDir,
    rawTarget: options.target,
  };
}

function createPackageCheckPlan(options: {
  config: ResolvedLiminaConfig;
  cwd: string;
  targetName?: string;
  tool?: PackageCheckToolSelection;
}): PackageCheckPlan {
  const targets = options.config.packageChecks?.targets ?? [];

  if (targets.length === 0) {
    throw new Error('No package check targets are configured.');
  }

  let selectedTargets: PackageCheckTarget[];
  let selectionReason: string;

  if (options.targetName) {
    selectedTargets = targets.filter(
      (target) => target.name === options.targetName,
    );

    if (selectedTargets.length === 0) {
      throw new Error(
        [
          `No package check target named "${options.targetName}" is configured.`,
          `Configured target names: ${formatConfiguredTargetNames(targets)}.`,
        ].join(' '),
      );
    }

    selectionReason = `--package "${options.targetName}" matched configured target name.`;
  } else {
    const cwdPackageName = readCwdPackageName(
      options.cwd,
      options.config.rootDir,
    );

    if (cwdPackageName) {
      selectedTargets = targets.filter(
        (target) => target.name === cwdPackageName,
      );

      if (selectedTargets.length > 0) {
        selectionReason = `nearest package.json name "${cwdPackageName}" matched configured target name.`;
      } else {
        selectedTargets = targets;
        selectionReason = `nearest package.json name "${cwdPackageName}" did not match configured target names; running all configured targets.`;
      }
    } else {
      selectedTargets = targets;
      selectionReason =
        'No package name was found from cwd up to the workspace root; running all configured targets.';
    }
  }

  return {
    selectionReason,
    targets: selectedTargets.map((target) =>
      createTargetPlan({
        config: options.config,
        requestedTool: options.tool,
        target,
        targetIndex: targets.indexOf(target),
      }),
    ),
  };
}

function logPackageCheckPlan(options: {
  config: ResolvedLiminaConfig;
  cwd: string;
  plan: PackageCheckPlan;
}): void {
  PackageLogger.info(
    [
      'Package check plan:',
      `  config: ${toRelativePath(
        options.config.rootDir,
        options.config.configPath,
      )}`,
      `  cwd: ${toRelativePath(options.config.rootDir, options.cwd)}`,
      `  selection: ${options.plan.selectionReason}`,
      '  targets:',
      ...options.plan.targets.map((target) =>
        [
          `    - ${target.label}`,
          `      outDir: ${toRelativePath(options.config.rootDir, target.outDir)}`,
          `      checks: ${
            target.checks.length > 0 ? target.checks.join(', ') : '(none)'
          }`,
        ].join('\n'),
      ),
    ].join('\n'),
  );
}

async function packOutputTarball(
  outDir: string,
): Promise<PackedPackageTarball> {
  const destination = await mkdtemp(path.join(tmpdir(), '__LIMINA_PACKAGE__'));
  const tarballPath = await pack(outDir, {
    destination,
    ignoreScripts: true,
    packageManager: 'pnpm',
  });
  const tarball = await readFile(tarballPath);

  return {
    cleanup: async () => {
      await rm(destination, {
        force: true,
        recursive: true,
      }).catch(() => null);
    },
    tarball,
  };
}

async function readDistPackageJson(options: {
  config?: ResolvedLiminaConfig;
  label?: string;
  packageJsonPath: string;
}): Promise<DistPackageJson> {
  if (!existsSync(options.packageJsonPath)) {
    throw new Error(
      `outDir package.json not found${
        options.label ? ` for ${options.label}` : ''
      } at ${
        options.config
          ? toRelativePath(options.config.rootDir, options.packageJsonPath)
          : options.packageJsonPath
      }. Run the package build first.`,
    );
  }

  return JSON.parse(
    await readFile(options.packageJsonPath, 'utf8'),
  ) as DistPackageJson;
}

async function assertPublicPackageMetadata(options: {
  config: ResolvedLiminaConfig;
  label: string;
  outDir: string;
  packageJsonPath: string;
}): Promise<void> {
  const manifest = await readDistPackageJson({
    config: options.config,
    label: options.label,
    packageJsonPath: options.packageJsonPath,
  });

  if (manifest.private === true) {
    return;
  }

  const missingFiles = REQUIRED_PUBLIC_PACKAGE_FILES.filter(
    (fileName) => !existsSync(path.join(options.outDir, fileName)),
  );

  if (missingFiles.length === 0) {
    return;
  }

  throw new Error(
    `publishable package output for ${options.label} at ${toRelativePath(
      options.config.rootDir,
      options.outDir,
    )} is missing required file(s): ${missingFiles.join(
      ', ',
    )}. Add them to the built output or set "private": true in the output package.json.`,
  );
}

async function runPublintCheck(options: {
  flow?: LiminaFlowReporter;
  flowDepth?: number;
  label: string;
  strict: boolean;
  tarball: Buffer;
}): Promise<boolean> {
  const task = options.flow?.start(`publint: ${options.label}`, {
    depth: options.flowDepth ?? 0,
  });

  PackageLogger.info(`publint started: ${options.label}`);
  const publintElapsed = createElapsedTimer();
  const { messages, pkg } = await publint({
    pack: { tarball: toArrayBuffer(options.tarball) },
    strict: options.strict,
  });

  if (messages.length === 0) {
    if (!options.flow?.interactive) {
      PackageLogger.success(
        `publint passed: ${options.label}`,
        publintElapsed(),
      );
    }

    task?.pass();
    return true;
  }

  for (const message of messages) {
    const rendered = formatMessage(message, pkg) ?? message.code;

    if (message.type === 'error') {
      PackageLogger.error(`[${options.label}] [publint] ${rendered}`);
      continue;
    }
    if (message.type === 'warning') {
      PackageLogger.warn(`[${options.label}] [publint] ${rendered}`);
      continue;
    }

    PackageLogger.info(`[${options.label}] [publint] ${rendered}`);
  }

  PackageLogger.error(
    `publint found ${messages.length} issue(s): ${options.label}`,
    publintElapsed(),
  );
  task?.fail(`publint found ${messages.length} issue(s): ${options.label}`);
  return false;
}

async function runAttwCheck(options: {
  flow?: LiminaFlowReporter;
  flowDepth?: number;
  label: string;
  profile: PackageAttwProfile;
  tarball: Buffer;
}): Promise<boolean> {
  const task = options.flow?.start(`attw: ${options.label}`, {
    depth: options.flowDepth ?? 0,
  });

  PackageLogger.info(
    `attw started: ${options.label} (profile: ${options.profile})`,
  );
  const attwElapsed = createElapsedTimer();
  const pkg = createPackageFromTarballData(options.tarball);
  const result = await checkPackage(pkg);

  if (!result.types) {
    PackageLogger.error(`[${options.label}] [attw] package has no types`);
    PackageLogger.error(`attw failed: ${options.label}`, attwElapsed());
    task?.fail(`attw failed: ${options.label}`);
    return false;
  }

  const ignoredResolutions = ATTW_PROFILE_IGNORED_RESOLUTIONS[options.profile];
  const problems = result.problems.filter((problem) => {
    if ('resolutionKind' in problem) {
      return !ignoredResolutions.includes(problem.resolutionKind);
    }
    return true;
  });

  if (problems.length === 0) {
    if (!options.flow?.interactive) {
      PackageLogger.success(`attw passed: ${options.label}`, attwElapsed());
    }

    task?.pass();
    return true;
  }

  for (const problem of problems) {
    PackageLogger.error(
      `[${options.label}] [attw] ${formatAttwProblem(problem)}`,
    );
  }

  PackageLogger.error(
    `attw found ${problems.length} problem(s): ${options.label}`,
    attwElapsed(),
  );
  task?.fail(`attw found ${problems.length} problem(s): ${options.label}`);
  return false;
}

async function runBoundaryCheck(
  target: PublishedPackageBoundaryTarget,
  label: string,
  options: {
    flow?: LiminaFlowReporter;
    flowDepth?: number;
  } = {},
): Promise<boolean> {
  const task = options.flow?.start(`package boundary: ${label}`, {
    depth: options.flowDepth ?? 0,
  });

  PackageLogger.info(`package boundary started: ${label}`);
  const boundaryElapsed = createElapsedTimer();
  const violations = await auditPublishedPackageBoundaries(target);

  if (violations.length === 0) {
    if (!options.flow?.interactive) {
      PackageLogger.success(
        `package boundary passed: ${label}`,
        boundaryElapsed(),
      );
    }

    task?.pass();
    return true;
  }

  for (const violation of violations) {
    PackageLogger.error(
      `[${label}] [boundary] ${violation.filePath} (${violation.environment}) imports "${violation.specifier}": ${violation.message}`,
    );
  }

  PackageLogger.error(
    `package boundary found ${violations.length} issue(s): ${label}`,
    boundaryElapsed(),
  );
  task?.fail(`package boundary found ${violations.length} issue(s): ${label}`);
  return false;
}

async function runPackageCheckTarget(options: {
  attwProfile?: PackageAttwProfile;
  checks: PackageCheckTool[];
  config: ResolvedLiminaConfig;
  flow?: LiminaFlowReporter;
  flowDepth?: number;
  label: string;
  outDir: string;
  rawTarget: PackageCheckTarget;
}): Promise<boolean> {
  const target = {
    ...options.rawTarget,
    outDir: options.outDir,
  };
  const label = options.label;
  const outputPackageJsonPath = path.join(target.outDir, 'package.json');
  const task = options.flow?.start(`package target: ${label}`, {
    depth: options.flowDepth ?? 0,
  });

  let packedDist: PackedPackageTarball | undefined;

  try {
    await assertPublicPackageMetadata({
      config: options.config,
      label,
      outDir: target.outDir,
      packageJsonPath: outputPackageJsonPath,
    });

    if (options.checks.includes('publint') || options.checks.includes('attw')) {
      const packTask = options.flow?.start(`package tarball: ${label}`, {
        depth: (options.flowDepth ?? 0) + 1,
      });
      PackageLogger.info(`package tarball packing started: ${label}`);
      const packElapsed = createElapsedTimer();
      try {
        packedDist = await packOutputTarball(target.outDir);
      } catch (error) {
        PackageLogger.error(
          `package tarball failed: ${label}: ${formatErrorMessage(error)}`,
          packElapsed(),
        );
        packTask?.fail(`package tarball failed: ${label}`, { error });
        throw error;
      }
      if (!options.flow?.interactive) {
        PackageLogger.success(
          `package tarball packed: ${label}`,
          packElapsed(),
        );
      }

      packTask?.pass();
    }

    let passed = true;

    if (options.checks.includes('publint')) {
      passed =
        (await runPublintCheck({
          flow: options.flow,
          flowDepth: (options.flowDepth ?? 0) + 1,
          label,
          strict: target.publint?.strict ?? true,
          tarball: packedDist!.tarball,
        })) && passed;
    }

    if (options.checks.includes('attw')) {
      passed =
        (await runAttwCheck({
          flow: options.flow,
          flowDepth: (options.flowDepth ?? 0) + 1,
          label,
          profile: options.attwProfile ?? target.attw?.profile ?? 'esm-only',
          tarball: packedDist!.tarball,
        })) && passed;
    }

    if (options.checks.includes('boundary')) {
      passed =
        (await runBoundaryCheck(
          {
            ...target.boundary,
            outDir: target.outDir,
          },
          label,
          {
            flow: options.flow,
            flowDepth: (options.flowDepth ?? 0) + 1,
          },
        )) && passed;
    }

    if (passed) {
      if (!options.flow?.interactive) {
        PackageLogger.success(`package checks passed: ${label}`);
      }

      task?.pass();
    } else {
      PackageLogger.error(`package checks failed: ${label}`);
      task?.fail(`package checks failed: ${label}`);
    }

    return passed;
  } catch (error) {
    PackageLogger.error(
      `package checks failed: ${label}: ${formatErrorMessage(error)}`,
    );
    task?.fail(`package checks failed: ${label}`, { error });
    throw error;
  } finally {
    if (packedDist) {
      await packedDist.cleanup();
    }
  }
}

export async function auditPublishedPackageBoundaries(
  target: PublishedPackageBoundaryTarget,
): Promise<PublishedPackageBoundaryViolation[]> {
  const manifestPath = path.join(target.outDir, 'package.json');
  const manifest = await readDistPackageJson({
    packageJsonPath: manifestPath,
  });
  const allowedExternalPackages = new Set<string>([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
    ...(target.ignoredExternalPackages ?? []),
  ]);
  const selfSpecifiers = collectSelfSpecifierMatchers(
    manifest.name,
    manifest.exports,
  );
  const publishedFiles = await collectPublishedModuleFiles(target.outDir);
  const violations: PublishedPackageBoundaryViolation[] = [];

  await init;

  for (const filePath of publishedFiles) {
    const relativeFilePath = path.relative(target.outDir, filePath);
    const environment = classifyRuntimeEnvironment(target, relativeFilePath);
    const source = await readFile(filePath, 'utf8');
    const [importSpecifiers] = parse(source);

    for (const importSpecifier of importSpecifiers) {
      if (!importSpecifier.n) {
        continue;
      }

      const message = validatePublishedSpecifier({
        allowedExternalPackages,
        environment,
        packageName: manifest.name,
        selfSpecifiers,
        specifier: importSpecifier.n,
      });

      if (!message) {
        continue;
      }

      violations.push({
        environment,
        filePath: relativeFilePath,
        message,
        specifier: importSpecifier.n,
      });
    }
  }

  return violations.toSorted((left, right) => {
    if (left.filePath === right.filePath) {
      return left.specifier.localeCompare(right.specifier);
    }

    return left.filePath.localeCompare(right.filePath);
  });
}

export async function runPackageCheck(
  options: RunPackageCheckOptions,
): Promise<boolean> {
  if (options.clearScreen ?? true) {
    clearCliScreen();
  }

  const elapsed = createElapsedTimer();
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const task = options.flow?.start('package check', {
    depth: options.flowDepth ?? 0,
  });

  try {
    PackageLogger.info('package check started');

    const plan = createPackageCheckPlan({
      config: options.config,
      cwd,
      targetName: options.targetName,
      tool: options.tool,
    });

    logPackageCheckPlan({
      config: options.config,
      cwd,
      plan,
    });

    const runnableTargets = plan.targets.filter(
      (target) => target.checks.length > 0,
    );

    if (runnableTargets.length === 0) {
      throw new Error(
        options.tool && options.tool !== 'all'
          ? `No package check targets have "${options.tool}" enabled.`
          : 'No package checks are enabled.',
      );
    }

    let passed = true;

    for (const target of runnableTargets) {
      passed =
        (await runPackageCheckTarget({
          attwProfile: options.attwProfile,
          checks: target.checks,
          config: options.config,
          flow: options.flow,
          flowDepth: (options.flowDepth ?? 0) + 1,
          label: target.label,
          outDir: target.outDir,
          rawTarget: target.rawTarget,
        })) && passed;
    }

    if (passed) {
      if (!options.flow?.interactive) {
        PackageLogger.success('package check finished', elapsed());
      }

      task?.pass();
    } else {
      PackageLogger.error('package check finished with failures', elapsed());
      task?.fail('package check finished with failures');
    }

    return passed;
  } catch (error) {
    PackageLogger.error(
      `package check failed: ${formatErrorMessage(error)}`,
      elapsed(),
    );
    task?.fail('package check failed', { error });
    throw error;
  }
}
