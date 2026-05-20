import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import type { ResolvedLatticeConfig } from './config';
import { normalizeAbsolutePath, toRelativePath } from './utils/path';

export type JsonObject = Record<string, unknown>;

const buildConfigFilePattern = /^tsconfig(?:\..+)?\.build\.json$/u;
const graphConfigFilePattern = /^tsconfig(?:\..+)?\.graph\.json$/u;
const tsconfigFilePattern = /^tsconfig(?:\..+)?\.json$/u;

export interface CollectTypecheckTargetProjectPathsOptions {
  rootConfigPath: string;
  rootDir: string;
}

export interface CollectTypecheckTargetProjectPathsResult {
  problems: string[];
  projectPaths: string[];
  targetProjectPaths: string[];
}

export function createFormatHost(rootDir: string): ts.FormatDiagnosticsHost {
  return {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => rootDir,
    getNewLine: () => '\n',
  };
}

function readJsonConfigFile(rootDir: string, configPath: string): JsonObject {
  const result = ts.readConfigFile(configPath, ts.sys.readFile);

  if (result.error) {
    throw new Error(
      ts.formatDiagnostic(result.error, createFormatHost(rootDir)),
    );
  }

  return result.config as JsonObject;
}

export function readJsonConfig(
  config: ResolvedLatticeConfig,
  configPath: string,
): JsonObject {
  return readJsonConfigFile(config.rootDir, configPath);
}

export function resolveProjectConfigPath(
  baseDirectory: string,
  value?: string,
): string {
  const candidate = value
    ? path.resolve(baseDirectory, value)
    : path.join(baseDirectory, 'tsconfig.json');

  if (existsSync(candidate) && statSync(candidate).isDirectory()) {
    return normalizeAbsolutePath(path.join(candidate, 'tsconfig.json'));
  }

  return normalizeAbsolutePath(candidate);
}

export function resolveReferencePath(
  configPath: string,
  referencePath: string,
): string {
  const absoluteReferencePath = path.resolve(
    path.dirname(configPath),
    referencePath,
  );

  if (path.extname(absoluteReferencePath) === '.json') {
    return normalizeAbsolutePath(absoluteReferencePath);
  }

  return normalizeAbsolutePath(
    path.join(absoluteReferencePath, 'tsconfig.json'),
  );
}

export function getRawReferencePaths(
  config: ResolvedLatticeConfig,
  configPath: string,
): string[] {
  return getRawReferencePathsForConfig(config.rootDir, configPath);
}

export function getRawReferencePathsForConfig(
  rootDir: string,
  configPath: string,
): string[] {
  const configObject = readJsonConfigFile(rootDir, configPath);

  return getReferencePathsFromConfigObject(configPath, configObject);
}

function getReferencePathsFromConfigObject(
  configPath: string,
  configObject: JsonObject,
): string[] {
  const references = configObject.references;

  if (!Array.isArray(references)) {
    return [];
  }

  return references.flatMap((reference) => {
    if (
      !reference ||
      typeof reference !== 'object' ||
      Array.isArray(reference) ||
      typeof (reference as { path?: unknown }).path !== 'string'
    ) {
      return [];
    }

    return [
      resolveReferencePath(configPath, (reference as { path: string }).path),
    ];
  });
}

function isNonEmptyStringArray(value: unknown): boolean {
  return Array.isArray(value) && value.some((item) => typeof item === 'string');
}

function hasOwnTypecheckInputs(configObject: JsonObject): boolean {
  // TypeScript implicitly includes files from the config directory when neither
  // "files" nor "include" is declared.
  if (
    !Object.hasOwn(configObject, 'files') &&
    !Object.hasOwn(configObject, 'include')
  ) {
    return true;
  }

  return (
    isNonEmptyStringArray(configObject.files) ||
    isNonEmptyStringArray(configObject.include)
  );
}

export function isBuildConfigPath(configPath: string): boolean {
  return buildConfigFilePattern.test(path.basename(configPath));
}

export function isGraphConfigPath(configPath: string): boolean {
  return graphConfigFilePattern.test(path.basename(configPath));
}

export function isOrdinaryTypecheckConfigPath(configPath: string): boolean {
  const fileName = path.basename(configPath);

  return (
    tsconfigFilePattern.test(fileName) &&
    !buildConfigFilePattern.test(fileName) &&
    !graphConfigFilePattern.test(fileName)
  );
}

export function collectTypecheckTargetProjectPaths(
  options: CollectTypecheckTargetProjectPathsOptions,
): CollectTypecheckTargetProjectPathsResult {
  const rootConfigPath = normalizeAbsolutePath(options.rootConfigPath);
  const reportedCycles = new Set<string>();
  const seen = new Set<string>();
  const problems: string[] = [];
  const projectPaths: string[] = [];
  const targetProjectPaths: string[] = [];

  const formatConfigPath = (configPath: string): string =>
    toRelativePath(options.rootDir, configPath);

  const addCycleProblem = (referencePath: string, stack: string[]): void => {
    const cycleStartIndex = stack.indexOf(referencePath);
    const cyclePaths =
      cycleStartIndex === -1
        ? [...stack, referencePath]
        : [...stack.slice(cycleStartIndex), referencePath];
    const cycleKey = cyclePaths.join('\0');

    if (reportedCycles.has(cycleKey)) {
      return;
    }

    reportedCycles.add(cycleKey);
    problems.push(
      [
        'Circular reference in typecheck route:',
        `  cycle: ${cyclePaths.map(formatConfigPath).join(' -> ')}`,
        '  reason: ordinary tsconfig references used by lattice tsc must form an acyclic route.',
        '  fix: remove one reference from the cycle, or move shared options into extends instead of references.',
      ].join('\n'),
    );
  };

  const visitProject = (projectPath: string, stack: string[]): void => {
    if (stack.includes(projectPath)) {
      addCycleProblem(projectPath, stack);
      return;
    }

    if (seen.has(projectPath)) {
      return;
    }

    if (!existsSync(projectPath)) {
      problems.push(
        [
          'Typecheck route references a missing tsconfig:',
          `  config: ${formatConfigPath(projectPath)}`,
        ].join('\n'),
      );
      return;
    }

    if (!isOrdinaryTypecheckConfigPath(projectPath)) {
      problems.push(
        [
          'Invalid config in IDE/typecheck route:',
          `  config: ${formatConfigPath(projectPath)}`,
          '  reason: tsconfig.json may only reference ordinary tsconfig*.json files; tsconfig*.graph.json and tsconfig*.build.json belong to the build graph route.',
        ].join('\n'),
      );
      return;
    }

    seen.add(projectPath);
    projectPaths.push(projectPath);

    const configObject = readJsonConfigFile(options.rootDir, projectPath);
    const referencePaths = getReferencePathsFromConfigObject(
      projectPath,
      configObject,
    );

    if (referencePaths.length === 0 || hasOwnTypecheckInputs(configObject)) {
      targetProjectPaths.push(projectPath);
    }

    const nextStack = [...stack, projectPath];

    for (const referencePath of referencePaths) {
      if (
        isBuildConfigPath(referencePath) ||
        isGraphConfigPath(referencePath)
      ) {
        problems.push(
          [
            'Invalid reference in IDE/typecheck route:',
            `  from: ${formatConfigPath(projectPath)}`,
            `  to: ${formatConfigPath(referencePath)}`,
            '  reason: IDE/typecheck route references must stay on ordinary tsconfig*.json files; build graph configs are checked through tsconfig*.graph.json.',
          ].join('\n'),
        );
        continue;
      }

      if (!isOrdinaryTypecheckConfigPath(referencePath)) {
        problems.push(
          [
            'Invalid reference in IDE/typecheck route:',
            `  from: ${formatConfigPath(projectPath)}`,
            `  to: ${formatConfigPath(referencePath)}`,
            '  reason: referenced config must be an ordinary tsconfig*.json file.',
          ].join('\n'),
        );
        continue;
      }

      if (nextStack.includes(referencePath)) {
        addCycleProblem(referencePath, nextStack);
        continue;
      }

      visitProject(referencePath, nextStack);
    }
  };

  visitProject(rootConfigPath, []);

  if (problems.length === 0 && targetProjectPaths.length === 0) {
    problems.push(
      [
        'Typecheck route has no tsconfig targets:',
        `  root: ${toRelativePath(options.rootDir, rootConfigPath)}`,
        '  reason: lattice tsc runs ordinary tsconfig*.json files without references, plus configs that have references and their own source inputs.',
      ].join('\n'),
    );
  }

  return {
    problems,
    projectPaths,
    targetProjectPaths,
  };
}

export function collectGraphProjectPaths(
  config: ResolvedLatticeConfig,
): string[] {
  const rootGraphConfigPath = path.join(
    config.rootDir,
    config.config?.roots?.graph ?? 'tsconfig.graph.json',
  );
  const seen = new Set<string>();
  const orderedProjects: string[] = [];
  const queue = getRawReferencePaths(config, rootGraphConfigPath);

  for (const projectPath of queue) {
    seen.add(projectPath);
  }

  for (const projectPath of queue) {
    if (!projectPath || !existsSync(projectPath)) {
      continue;
    }

    orderedProjects.push(projectPath);

    for (const referencePath of getRawReferencePaths(config, projectPath)) {
      if (seen.has(referencePath)) {
        continue;
      }

      seen.add(referencePath);
      queue.push(referencePath);
    }
  }

  return orderedProjects;
}

export function parseProjectFileNames(
  config: ResolvedLatticeConfig,
  configPath: string,
  pattern = /\.(?:[cm]?tsx?|d\.[cm]?ts|json)$/u,
): string[] {
  const diagnostics: ts.Diagnostic[] = [];
  const parsed = ts.getParsedCommandLineOfConfigFile(
    configPath,
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
        diagnostics.push(diagnostic);
      },
    },
  );

  if (!parsed) {
    throw new Error(
      ts.formatDiagnosticsWithColorAndContext(
        diagnostics,
        createFormatHost(config.rootDir),
      ),
    );
  }

  if (parsed.errors.length > 0) {
    throw new Error(
      ts.formatDiagnosticsWithColorAndContext(
        parsed.errors,
        createFormatHost(config.rootDir),
      ),
    );
  }

  return parsed.fileNames
    .filter((fileName) => pattern.test(fileName))
    .map(normalizeAbsolutePath);
}

export function formatReferences(
  rootDir: string,
  references: Set<string>,
): string {
  if (references.size === 0) {
    return '(none)';
  }

  return [...references]
    .sort()
    .map((value) => toRelativePath(rootDir, value))
    .join(', ');
}
