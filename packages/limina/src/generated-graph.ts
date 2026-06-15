import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'pathe';
import { glob } from 'tinyglobby';
import type ts from 'typescript';
import {
  type CheckerProjectParseContext,
  parseCheckerProjectConfigForContext,
  resolveCheckerProjectExtensions,
} from './checkers';
import { getActiveCheckers, type ResolvedLiminaConfig } from './config';
import {
  collectImportsFromFile,
  createFileOwnerLookup,
  createImportAnalysisContext,
  formatImportRecordLocation,
  resolveInternalImport,
} from './graph-context';
import {
  collectReferencePathInfosForConfig,
  createLiminaTsconfigSchemaPath,
  isOrdinarySourceTypecheckConfigPath,
  type JsonObject,
  readJsonConfig,
  resolveReferencePath,
} from './tsconfig';
import {
  normalizeAbsolutePath,
  toPosixPath,
  toRelativePath,
} from './utils/path';

const generatedRootDirName = '.limina';
const generatedTsconfigDir = path.join(generatedRootDirName, 'tsconfig');
const generatedDtsDir = path.join(generatedRootDirName, 'dts');
const generatedTsbuildinfoDir = path.join(generatedRootDirName, 'tsbuildinfo');
const generatedManifestPath = path.join(generatedRootDirName, 'manifest.json');

const sourceDiscoveryIgnore = [
  '**/.git/**',
  '**/.limina/**',
  '**/.tsbuild/**',
  '**/coverage/**',
  '**/dist/**',
  '**/node_modules/**',
];

export interface GeneratedCheckerManifest {
  preset: string;
  entry: string;
  roots: string[];
  sourceToBuild: Record<string, GeneratedBuildModuleManifest>;
  sourceToDts: Record<string, string>;
  dtsToSource: Record<string, string>;
}

export type GeneratedBuildModuleKind = 'project' | 'solution';

export interface GeneratedBuildModuleManifest {
  kind: GeneratedBuildModuleKind;
  path: string;
}

export interface GeneratedBuildModule {
  kind: GeneratedBuildModuleKind;
  path: string;
}

export interface GeneratedTsconfigGraphManifest {
  version: 1;
  generatedBy: 'limina';
  checkers: Record<string, GeneratedCheckerManifest>;
}

export interface GeneratedTsconfigGraphResult {
  changed: boolean;
  manifestPath: string;
  checkerEntries: Map<string, string>;
  sourceToBuild: Map<string, Map<string, GeneratedBuildModule>>;
  sourceToDts: Map<string, Map<string, string>>;
  dtsToSource: Map<string, Map<string, string>>;
  manifest: GeneratedTsconfigGraphManifest;
}

interface SourceProject {
  checkerName: string;
  configPath: string;
  context: CheckerProjectParseContext;
  dtsConfigPath: string;
  fileNames: string[];
  graphRules: string[];
  options: ts.CompilerOptions;
  references: Set<string>;
}

interface SolutionProject {
  buildConfigPath: string;
  checkerName: string;
  configPath: string;
  references: Set<string>;
}

interface CheckerSourceConfigCollection {
  buildModulesBySourcePath: Map<string, GeneratedBuildModule>;
  projectConfigPaths: Set<string>;
  rootConfigPaths: string[];
  solutionConfigPaths: Set<string>;
  solutionReferencesBySourcePath: Map<string, string[]>;
}

interface ImplicitRef {
  path: string;
  reason: string;
  targetConfigPath: string;
}

interface GeneratedGraphWriteContext {
  changed: boolean;
  expectedFiles: Set<string>;
  rootDir: string;
}

function normalizeWorkspaceGlob(value: string): string {
  return toPosixPath(value.trim());
}

function stringifyJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function formatUnknownValue(value: unknown): string {
  if (value === undefined) {
    return 'undefined';
  }

  return JSON.stringify(value);
}

function formatProblemList(problems: string[], fallback: string): string {
  return problems.join('\n\n') || fallback;
}

function createRelativePath(fromFile: string, toPath: string): string {
  const relativePath = toPosixPath(
    path.relative(path.dirname(fromFile), toPath),
  );

  return relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
}

function createDtsFileName(sourceFileName: string): string {
  return sourceFileName === 'tsconfig.json'
    ? 'tsconfig.dts.json'
    : sourceFileName.replace(/\.json$/u, '.dts.json');
}

function createSourceConfigScope(sourceConfigPath: string): string {
  const fileName = path.basename(sourceConfigPath);

  if (fileName === 'tsconfig.json') {
    return 'tsconfig';
  }

  return fileName.replace(/^tsconfig\./u, '').replace(/\.json$/u, '');
}

export function getGeneratedDtsConfigPath(options: {
  checkerName: string;
  rootDir: string;
  sourceConfigPath: string;
}): string {
  const relativeSourcePath = toRelativePath(
    options.rootDir,
    options.sourceConfigPath,
  );
  const relativeDir = path.dirname(relativeSourcePath);
  const dtsFileName = createDtsFileName(path.basename(relativeSourcePath));

  return normalizeAbsolutePath(
    path.join(
      options.rootDir,
      generatedTsconfigDir,
      'checkers',
      options.checkerName,
      'projects',
      relativeDir === '.' ? '' : relativeDir,
      dtsFileName,
    ),
  );
}

function getGeneratedSolutionBuildConfigPath(options: {
  checkerName: string;
  rootDir: string;
  sourceConfigPath: string;
}): string {
  const relativeSourcePath = toRelativePath(
    options.rootDir,
    options.sourceConfigPath,
  );
  const relativeDir = path.dirname(relativeSourcePath);

  return normalizeAbsolutePath(
    path.join(
      options.rootDir,
      generatedTsconfigDir,
      'checkers',
      options.checkerName,
      'solutions',
      relativeDir === '.' ? '' : relativeDir,
      'tsconfig.build.json',
    ),
  );
}

function getGeneratedCheckerEntryPath(options: {
  checkerName: string;
  rootDir: string;
}): string {
  return normalizeAbsolutePath(
    path.join(
      options.rootDir,
      generatedTsconfigDir,
      'checkers',
      options.checkerName,
      'tsconfig.build.json',
    ),
  );
}

function getGeneratedOutDir(options: {
  checkerName: string;
  rootDir: string;
  sourceConfigPath: string;
}): string {
  const relativeSourcePath = toRelativePath(
    options.rootDir,
    options.sourceConfigPath,
  );
  const relativeDir = path.dirname(relativeSourcePath);

  return normalizeAbsolutePath(
    path.join(
      options.rootDir,
      generatedDtsDir,
      'checkers',
      options.checkerName,
      relativeDir === '.' ? '' : relativeDir,
      createSourceConfigScope(options.sourceConfigPath),
    ),
  );
}

function getGeneratedTsBuildInfoPath(options: {
  checkerName: string;
  rootDir: string;
  sourceConfigPath: string;
}): string {
  const relativeSourcePath = toRelativePath(
    options.rootDir,
    options.sourceConfigPath,
  );
  const relativeDir = path.dirname(relativeSourcePath);

  return normalizeAbsolutePath(
    path.join(
      options.rootDir,
      generatedTsbuildinfoDir,
      'checkers',
      options.checkerName,
      relativeDir === '.' ? '' : relativeDir,
      `${createSourceConfigScope(options.sourceConfigPath)}.tsbuildinfo`,
    ),
  );
}

function readGraphRules(
  config: ResolvedLiminaConfig,
  sourceConfigPath: string,
): string[] {
  const configObject = readJsonConfig(config, sourceConfigPath);
  const liminaOptions = configObject.liminaOptions;

  if (
    !liminaOptions ||
    typeof liminaOptions !== 'object' ||
    Array.isArray(liminaOptions)
  ) {
    return [];
  }

  const graphRules = (liminaOptions as { graphRules?: unknown }).graphRules;

  return Array.isArray(graphRules)
    ? [
        ...new Set(
          graphRules.filter(
            (label): label is string =>
              typeof label === 'string' && label.trim().length > 0,
          ),
        ),
      ].map((label) => label.trim())
    : [];
}

function addImplicitRefProblem(options: {
  config: ResolvedLiminaConfig;
  field: string;
  problems: string[];
  reason: string;
  sourceConfigPath: string;
  value?: unknown;
}): void {
  options.problems.push(
    [
      'Invalid Limina implicit reference:',
      `  config: ${toRelativePath(options.config.rootDir, options.sourceConfigPath)}`,
      `  field: ${options.field}`,
      ...(Object.hasOwn(options, 'value')
        ? [`  value: ${formatUnknownValue(options.value)}`]
        : []),
      `  reason: ${options.reason}`,
    ].join('\n'),
  );
}

function readImplicitRefs(
  config: ResolvedLiminaConfig,
  sourceConfigPath: string,
): { implicitRefs: ImplicitRef[]; problems: string[] } {
  const configObject = readJsonConfig(config, sourceConfigPath);
  const liminaOptions = configObject.liminaOptions;
  const problems: string[] = [];
  const implicitRefsByTarget = new Map<string, ImplicitRef>();

  if (liminaOptions === undefined) {
    return {
      implicitRefs: [],
      problems,
    };
  }

  if (!isPlainRecord(liminaOptions)) {
    addImplicitRefProblem({
      config,
      field: 'liminaOptions',
      problems,
      reason:
        'liminaOptions must be an object before implicitRefs can be read.',
      sourceConfigPath,
      value: liminaOptions,
    });
    return {
      implicitRefs: [],
      problems,
    };
  }

  const implicitRefs = liminaOptions.implicitRefs;

  if (implicitRefs === undefined) {
    return {
      implicitRefs: [],
      problems,
    };
  }

  if (!Array.isArray(implicitRefs)) {
    addImplicitRefProblem({
      config,
      field: 'liminaOptions.implicitRefs',
      problems,
      reason:
        'implicitRefs must be an array of objects with non-empty path and reason fields.',
      sourceConfigPath,
      value: implicitRefs,
    });
    return {
      implicitRefs: [],
      problems,
    };
  }

  for (const [index, entry] of implicitRefs.entries()) {
    const field = `liminaOptions.implicitRefs[${index}]`;

    if (!isPlainRecord(entry)) {
      addImplicitRefProblem({
        config,
        field,
        problems,
        reason:
          'implicitRefs entries must be objects with non-empty path and reason fields.',
        sourceConfigPath,
        value: entry,
      });
      continue;
    }

    const pathValue = entry.path;
    const reasonValue = entry.reason;

    if (!isNonEmptyString(pathValue)) {
      addImplicitRefProblem({
        config,
        field: `${field}.path`,
        problems,
        reason: 'implicitRefs path is required and must be a non-empty string.',
        sourceConfigPath,
        value: pathValue,
      });
      continue;
    }

    if (path.isAbsolute(pathValue)) {
      addImplicitRefProblem({
        config,
        field: `${field}.path`,
        problems,
        reason:
          'implicitRefs path must be relative to the tsconfig that declares it.',
        sourceConfigPath,
        value: pathValue,
      });
      continue;
    }

    if (!isNonEmptyString(reasonValue)) {
      addImplicitRefProblem({
        config,
        field: `${field}.reason`,
        problems,
        reason:
          'implicitRefs reason is required and must be a non-empty string.',
        sourceConfigPath,
        value: reasonValue,
      });
      continue;
    }

    const targetConfigPath = resolveReferencePath(
      sourceConfigPath,
      pathValue.trim(),
    );

    if (targetConfigPath === sourceConfigPath) {
      addImplicitRefProblem({
        config,
        field: `${field}.path`,
        problems,
        reason: 'implicitRefs must not reference the declaring tsconfig.',
        sourceConfigPath,
        value: pathValue,
      });
      continue;
    }

    if (!existsSync(targetConfigPath)) {
      addImplicitRefProblem({
        config,
        field: `${field}.path`,
        problems,
        reason:
          'implicitRefs path must point to an existing ordinary source tsconfig.',
        sourceConfigPath,
        value: pathValue,
      });
      continue;
    }

    if (!isOrdinarySourceTypecheckConfigPath(targetConfigPath)) {
      addImplicitRefProblem({
        config,
        field: `${field}.path`,
        problems,
        reason:
          'implicitRefs path must point to an ordinary source tsconfig*.json file, not a generated, declaration, build, base, or check config.',
        sourceConfigPath,
        value: pathValue,
      });
      continue;
    }

    if (implicitRefsByTarget.has(targetConfigPath)) {
      continue;
    }

    implicitRefsByTarget.set(targetConfigPath, {
      path: pathValue.trim(),
      reason: reasonValue.trim(),
      targetConfigPath,
    });
  }

  return {
    implicitRefs: [...implicitRefsByTarget.values()],
    problems,
  };
}

function addSourceReferenceConfigProblems(options: {
  config: ResolvedLiminaConfig;
  problems: string[];
  sourceConfigPath: string;
}): void {
  const configObject = readJsonConfig(options.config, options.sourceConfigPath);

  if (!Object.hasOwn(configObject, 'references')) {
    return;
  }

  if (isDefaultTsconfigPath(options.sourceConfigPath)) {
    return;
  }

  options.problems.push(
    [
      'Source typecheck config declares project references:',
      `  config: ${toRelativePath(options.config.rootDir, options.sourceConfigPath)}`,
      '  field: references',
      '  reason: source typecheck leaf configs must not hand-maintain project references; Limina infers static source edges and liminaOptions.implicitRefs documents dynamic or virtual edges.',
      '  fix: move IDE aggregation references to a solution-style tsconfig.json, or replace this source leaf reference with liminaOptions.implicitRefs.',
    ].join('\n'),
  );
}

function readRelativeTypeFiles(
  config: ResolvedLiminaConfig,
  sourceConfigPath: string,
): string[] {
  const configObject = readJsonConfig(config, sourceConfigPath);
  const compilerOptions = configObject.compilerOptions;

  if (
    !compilerOptions ||
    typeof compilerOptions !== 'object' ||
    Array.isArray(compilerOptions)
  ) {
    return [];
  }

  const types = (compilerOptions as { types?: unknown }).types;

  if (!Array.isArray(types)) {
    return [];
  }

  return types
    .filter(
      (typeName): typeName is string =>
        typeof typeName === 'string' &&
        (typeName.startsWith('./') || typeName.startsWith('../')),
    )
    .map((typeName) =>
      normalizeAbsolutePath(
        path.resolve(path.dirname(sourceConfigPath), typeName),
      ),
    );
}

function collectTypeRootCandidates(options: {
  rootDir: string;
  sourceConfigPath: string;
}): string[] {
  const candidates: string[] = [];
  let currentDir = path.dirname(options.sourceConfigPath);

  for (;;) {
    const nodeModulesDir = path.join(currentDir, 'node_modules');
    const nodeModulesTypesDir = path.join(nodeModulesDir, '@types');

    if (existsSync(nodeModulesDir)) {
      candidates.push(nodeModulesDir);
    }

    if (existsSync(nodeModulesTypesDir)) {
      candidates.push(nodeModulesTypesDir);
    }

    if (currentDir === options.rootDir) {
      break;
    }

    const parentDir = path.dirname(currentDir);

    if (parentDir === currentDir) {
      break;
    }

    currentDir = parentDir;
  }

  return [...new Set(candidates)];
}

function isDefaultTsconfigPath(configPath: string): boolean {
  return path.basename(configPath) === 'tsconfig.json';
}

function hasImplicitRefs(configObject: JsonObject): boolean {
  const liminaOptions = configObject.liminaOptions;

  return (
    isPlainRecord(liminaOptions) && Object.hasOwn(liminaOptions, 'implicitRefs')
  );
}

function isPureSolutionConfig(configObject: JsonObject): boolean {
  const allowedKeys = new Set([
    '$schema',
    'files',
    'liminaOptions',
    'references',
  ]);

  return (
    Array.isArray(configObject.references) &&
    Array.isArray(configObject.files) &&
    configObject.files.length === 0 &&
    Object.keys(configObject).every((key) => allowedKeys.has(key)) &&
    !hasImplicitRefs(configObject)
  );
}

function isEmptyLeafConfig(configObject: JsonObject): boolean {
  return (
    Array.isArray(configObject.files) &&
    configObject.files.length === 0 &&
    !Object.hasOwn(configObject, 'include')
  );
}

function createProjectBuildModule(options: {
  checkerName: string;
  rootDir: string;
  sourceConfigPath: string;
}): GeneratedBuildModule {
  return {
    kind: 'project',
    path: getGeneratedDtsConfigPath(options),
  };
}

function createSolutionBuildModule(options: {
  checkerName: string;
  rootDir: string;
  sourceConfigPath: string;
}): GeneratedBuildModule {
  return {
    kind: 'solution',
    path: getGeneratedSolutionBuildConfigPath(options),
  };
}

function collectCheckerSourceConfigModules(options: {
  checkerName: string;
  collection: CheckerSourceConfigCollection;
  config: ResolvedLiminaConfig;
  excludedConfigPaths: Set<string>;
  problems: string[];
  sourceConfigPath: string;
  seenConfigs: Set<string>;
}): void {
  if (options.excludedConfigPaths.has(options.sourceConfigPath)) {
    return;
  }

  if (options.seenConfigs.has(options.sourceConfigPath)) {
    return;
  }

  options.seenConfigs.add(options.sourceConfigPath);

  const configObject = readJsonConfig(options.config, options.sourceConfigPath);
  const hasReferences = Object.hasOwn(configObject, 'references');

  if (hasReferences && !isDefaultTsconfigPath(options.sourceConfigPath)) {
    addSourceReferenceConfigProblems({
      config: options.config,
      problems: options.problems,
      sourceConfigPath: options.sourceConfigPath,
    });
    return;
  }

  if (
    hasReferences &&
    isDefaultTsconfigPath(options.sourceConfigPath) &&
    isPureSolutionConfig(configObject)
  ) {
    options.collection.solutionConfigPaths.add(options.sourceConfigPath);
    options.collection.buildModulesBySourcePath.set(
      options.sourceConfigPath,
      createSolutionBuildModule({
        checkerName: options.checkerName,
        rootDir: options.config.rootDir,
        sourceConfigPath: options.sourceConfigPath,
      }),
    );

    const referenceCollection = collectReferencePathInfosForConfig(
      options.config.rootDir,
      options.sourceConfigPath,
    );
    const referenceSourceConfigPaths: string[] = [];

    options.problems.push(...referenceCollection.problems);

    for (const reference of referenceCollection.references) {
      const referencePath = reference.resolvedPath;

      if (
        !existsSync(referencePath) ||
        !isOrdinarySourceTypecheckConfigPath(referencePath)
      ) {
        continue;
      }

      collectCheckerSourceConfigModules({
        checkerName: options.checkerName,
        collection: options.collection,
        config: options.config,
        excludedConfigPaths: options.excludedConfigPaths,
        problems: options.problems,
        sourceConfigPath: referencePath,
        seenConfigs: options.seenConfigs,
      });

      if (options.collection.buildModulesBySourcePath.has(referencePath)) {
        referenceSourceConfigPaths.push(referencePath);
      }
    }

    options.collection.solutionReferencesBySourcePath.set(
      options.sourceConfigPath,
      [...new Set(referenceSourceConfigPaths)].sort(),
    );

    return;
  }

  if (!isEmptyLeafConfig(configObject)) {
    options.collection.projectConfigPaths.add(options.sourceConfigPath);
    options.collection.buildModulesBySourcePath.set(
      options.sourceConfigPath,
      createProjectBuildModule({
        checkerName: options.checkerName,
        rootDir: options.config.rootDir,
        sourceConfigPath: options.sourceConfigPath,
      }),
    );
  }
}

function createGeneratedCompilerOptionOverrides(
  config: ResolvedLiminaConfig,
  project: SourceProject,
): Record<string, unknown> {
  const configObject = readJsonConfig(config, project.configPath);
  const compilerOptions = configObject.compilerOptions;
  const output: Record<string, unknown> = {};

  if (
    compilerOptions &&
    typeof compilerOptions === 'object' &&
    !Array.isArray(compilerOptions)
  ) {
    const types = (compilerOptions as { types?: unknown }).types;

    if (Array.isArray(types)) {
      output.types = types.filter(
        (typeName) =>
          typeof typeName !== 'string' ||
          (!typeName.startsWith('./') && !typeName.startsWith('../')),
      );
    }
  }

  const typeRoots = collectTypeRootCandidates({
    rootDir: config.rootDir,
    sourceConfigPath: project.configPath,
  });

  if (typeRoots.length > 0) {
    output.typeRoots = typeRoots.map((typeRoot) =>
      createRelativePath(project.dtsConfigPath, typeRoot),
    );
  }

  return output;
}

async function collectCheckerExcludedSourceConfigs(
  config: ResolvedLiminaConfig,
  exclude: string[],
): Promise<Set<string>> {
  if (exclude.length === 0) {
    return new Set();
  }

  const paths = await glob(exclude.map(normalizeWorkspaceGlob), {
    absolute: true,
    cwd: config.rootDir,
    ignore: sourceDiscoveryIgnore,
    onlyFiles: true,
  });

  return new Set(paths.map(normalizeAbsolutePath));
}

async function collectCheckerSourceConfigs(
  config: ResolvedLiminaConfig,
  checkerName: string,
  include: string[],
  exclude: string[],
): Promise<CheckerSourceConfigCollection> {
  const paths = await glob(include.map(normalizeWorkspaceGlob), {
    absolute: true,
    cwd: config.rootDir,
    ignore: [...sourceDiscoveryIgnore, ...exclude.map(normalizeWorkspaceGlob)],
    onlyFiles: true,
  });
  const sourcePaths = paths.map(normalizeAbsolutePath).sort();
  const invalidPaths = sourcePaths.filter(
    (sourcePath) => !isOrdinarySourceTypecheckConfigPath(sourcePath),
  );

  if (invalidPaths.length > 0) {
    throw new Error(
      [
        'Checker include matched reserved tsconfig files:',
        `  checker: ${checkerName}`,
        ...invalidPaths.map(
          (sourcePath) => `  - ${toRelativePath(config.rootDir, sourcePath)}`,
        ),
        '  reason: checker.include may only match ordinary source tsconfig*.json files.',
      ].join('\n'),
    );
  }

  const problems: string[] = [];
  const excludedConfigPaths = await collectCheckerExcludedSourceConfigs(
    config,
    exclude,
  );
  const collection: CheckerSourceConfigCollection = {
    buildModulesBySourcePath: new Map(),
    projectConfigPaths: new Set(),
    rootConfigPaths: [],
    solutionConfigPaths: new Set(),
    solutionReferencesBySourcePath: new Map(),
  };
  const seenConfigs = new Set<string>();

  for (const sourcePath of sourcePaths) {
    collectCheckerSourceConfigModules({
      checkerName,
      collection,
      config,
      excludedConfigPaths,
      problems,
      sourceConfigPath: sourcePath,
      seenConfigs,
    });
  }

  if (problems.length > 0) {
    throw new Error(
      formatProblemList(problems, 'Failed to collect checker source configs.'),
    );
  }

  collection.rootConfigPaths = [
    ...new Set(
      sourcePaths.filter((sourcePath) =>
        collection.buildModulesBySourcePath.has(sourcePath),
      ),
    ),
  ].sort();

  return collection;
}

function createSourceProject(options: {
  checkerName: string;
  checkerPreset: SourceProject['context']['checkerPresets'][number];
  config: ResolvedLiminaConfig;
  sourceConfigPath: string;
}): SourceProject {
  const extensions = resolveCheckerProjectExtensions({
    configPath: options.sourceConfigPath,
    preset: options.checkerPreset,
    projectRootDir: options.config.rootDir,
  });
  const context: CheckerProjectParseContext = {
    checkerPresets: [options.checkerPreset],
    extensions,
  };
  const parsed = parseCheckerProjectConfigForContext({
    configPath: options.sourceConfigPath,
    context,
    projectRootDir: options.config.rootDir,
  });

  return {
    checkerName: options.checkerName,
    configPath: options.sourceConfigPath,
    context,
    dtsConfigPath: getGeneratedDtsConfigPath({
      checkerName: options.checkerName,
      rootDir: options.config.rootDir,
      sourceConfigPath: options.sourceConfigPath,
    }),
    fileNames: [
      ...new Set([
        ...parsed.fileNames.map(normalizeAbsolutePath),
        ...readRelativeTypeFiles(options.config, options.sourceConfigPath),
      ]),
    ].sort(),
    graphRules: readGraphRules(options.config, options.sourceConfigPath),
    options: parsed.options,
    references: new Set(),
  };
}

function createSolutionProject(options: {
  checkerName: string;
  collection: CheckerSourceConfigCollection;
  config: ResolvedLiminaConfig;
  sourceConfigPath: string;
}): SolutionProject {
  const referenceSourceConfigPaths =
    options.collection.solutionReferencesBySourcePath.get(
      options.sourceConfigPath,
    ) ?? [];

  return {
    buildConfigPath: getGeneratedSolutionBuildConfigPath({
      checkerName: options.checkerName,
      rootDir: options.config.rootDir,
      sourceConfigPath: options.sourceConfigPath,
    }),
    checkerName: options.checkerName,
    configPath: options.sourceConfigPath,
    references: new Set(
      referenceSourceConfigPaths
        .map(
          (sourceConfigPath) =>
            options.collection.buildModulesBySourcePath.get(sourceConfigPath)
              ?.path,
        )
        .filter((buildPath): buildPath is string => Boolean(buildPath)),
    ),
  };
}

function createDtsProjectsBySourcePath(
  projects: SourceProject[],
): Map<string, SourceProject[]> {
  const projectsBySourcePath = new Map<string, SourceProject[]>();

  for (const project of projects) {
    projectsBySourcePath.set(project.configPath, [
      ...(projectsBySourcePath.get(project.configPath) ?? []),
      project,
    ]);
  }

  return projectsBySourcePath;
}

function getDtsConfigPathForSourcePath(options: {
  checkerName: string;
  dtsProjectsBySourcePath: Map<string, SourceProject[]>;
  sourceConfigPath: string;
}): string | undefined {
  const candidates =
    options.dtsProjectsBySourcePath.get(options.sourceConfigPath) ?? [];

  return (
    candidates.find((project) => project.checkerName === options.checkerName)
      ?.dtsConfigPath ?? candidates[0]?.dtsConfigPath
  );
}

function inferProjectReferences(
  config: ResolvedLiminaConfig,
  projects: SourceProject[],
  ownerProjects: SourceProject[] = projects,
): string[] {
  const problems: string[] = [];
  const importAnalysis = createImportAnalysisContext();
  const ownerLookup = createFileOwnerLookup(
    ownerProjects.map((project) => ({
      checkerPresets: project.context.checkerPresets,
      configPath: project.configPath,
      extensions: project.context.extensions,
      fileNames: project.fileNames,
      labels: project.graphRules,
      labelProblem: null,
      options: project.options,
      references: project.references,
      resolverConfigPath: project.configPath,
    })),
  );
  const localDtsProjectsBySourcePath = createDtsProjectsBySourcePath(projects);
  const dtsProjectsBySourcePath = createDtsProjectsBySourcePath(ownerProjects);

  for (const project of projects) {
    addSourceReferenceConfigProblems({
      config,
      problems,
      sourceConfigPath: project.configPath,
    });

    const implicitRefCollection = readImplicitRefs(config, project.configPath);

    problems.push(...implicitRefCollection.problems);

    for (const implicitRef of implicitRefCollection.implicitRefs) {
      const targetDtsConfigPath = getDtsConfigPathForSourcePath({
        checkerName: project.checkerName,
        dtsProjectsBySourcePath: localDtsProjectsBySourcePath,
        sourceConfigPath: implicitRef.targetConfigPath,
      });

      if (!targetDtsConfigPath) {
        problems.push(
          [
            'Unable to map Limina implicit reference to a generated declaration project:',
            `  config: ${toRelativePath(config.rootDir, project.configPath)}`,
            `  field: liminaOptions.implicitRefs`,
            `  reference: ${implicitRef.path}`,
            `  resolved: ${toRelativePath(config.rootDir, implicitRef.targetConfigPath)}`,
            '  reason: implicitRefs must point to an ordinary source tsconfig selected by the same checker.include set.',
          ].join('\n'),
        );
        continue;
      }

      project.references.add(targetDtsConfigPath);
    }
  }

  for (const project of projects) {
    for (const fileName of project.fileNames) {
      for (const importRecord of collectImportsFromFile(
        fileName,
        config.rootDir,
        importAnalysis,
      )) {
        const resolvedFilePath = resolveInternalImport(
          importRecord.specifier,
          fileName,
          project.options,
          {
            ...project.context,
            configPath: project.configPath,
            resolverConfigPath: project.configPath,
          },
          importAnalysis,
        );

        if (!resolvedFilePath) {
          continue;
        }

        const owners = ownerLookup.get(resolvedFilePath);

        if (!owners || owners.length === 0) {
          continue;
        }

        const targetSourceConfigPath =
          owners
            .filter((owner) => owner !== project.configPath)
            .sort(
              (left, right) =>
                path.dirname(right).length - path.dirname(left).length ||
                left.localeCompare(right),
            )[0] ?? null;

        if (!targetSourceConfigPath) {
          continue;
        }

        const targetDtsConfigPath = getDtsConfigPathForSourcePath({
          checkerName: project.checkerName,
          dtsProjectsBySourcePath,
          sourceConfigPath: targetSourceConfigPath,
        });

        if (!targetDtsConfigPath) {
          problems.push(
            [
              'Unable to map generated graph import to a declaration project:',
              `  importing config: ${toRelativePath(config.rootDir, project.configPath)}`,
              `  file: ${formatImportRecordLocation(config.rootDir, importRecord)}`,
              `  imported specifier: ${importRecord.specifier}`,
              `  resolved file: ${toRelativePath(config.rootDir, resolvedFilePath)}`,
            ].join('\n'),
          );
          continue;
        }

        if (
          isDeniedGeneratedReference(config, project, targetSourceConfigPath)
        ) {
          continue;
        }

        project.references.add(targetDtsConfigPath);
      }
    }
  }

  return problems;
}

function isDeniedGeneratedReference(
  config: ResolvedLiminaConfig,
  project: SourceProject,
  targetSourceConfigPath: string,
): boolean {
  const rules = config.graph?.rules;

  if (!rules) {
    return false;
  }

  for (const label of project.graphRules) {
    const denyRefs = rules[label]?.deny?.refs;

    if (!denyRefs) {
      continue;
    }

    for (const ref of denyRefs) {
      const deniedPath = normalizeAbsolutePath(
        path.resolve(config.rootDir, ref.path),
      );
      const deniedSourcePath = deniedPath.endsWith('.dts.json')
        ? normalizeAbsolutePath(deniedPath.replace(/\.dts\.json$/u, '.json'))
        : deniedPath;

      if (deniedSourcePath === targetSourceConfigPath) {
        return true;
      }
    }
  }

  return false;
}

function createGeneratedDtsConfig(
  config: ResolvedLiminaConfig,
  project: SourceProject,
): Record<string, unknown> {
  const liminaOptions: Record<string, unknown> = {
    generated: true,
    checker: project.checkerName,
    sourceConfig: createRelativePath(project.dtsConfigPath, project.configPath),
  };

  if (project.graphRules.length > 0) {
    liminaOptions.graphRules = project.graphRules;
  }

  return {
    $schema: createLiminaTsconfigSchemaPath(
      config.rootDir,
      project.dtsConfigPath,
    ),
    extends: [createRelativePath(project.dtsConfigPath, project.configPath)],
    files: project.fileNames.map((fileName) =>
      createRelativePath(project.dtsConfigPath, fileName),
    ),
    compilerOptions: {
      ...createGeneratedCompilerOptionOverrides(config, project),
      composite: true,
      incremental: true,
      noEmit: false,
      declaration: true,
      emitDeclarationOnly: true,
      declarationMap: false,
      rootDir: createRelativePath(
        project.dtsConfigPath,
        path.dirname(project.configPath),
      ),
      outDir: createRelativePath(
        project.dtsConfigPath,
        getGeneratedOutDir({
          checkerName: project.checkerName,
          rootDir: config.rootDir,
          sourceConfigPath: project.configPath,
        }),
      ),
      tsBuildInfoFile: createRelativePath(
        project.dtsConfigPath,
        getGeneratedTsBuildInfoPath({
          checkerName: project.checkerName,
          rootDir: config.rootDir,
          sourceConfigPath: project.configPath,
        }),
      ),
    },
    references: [...project.references].sort().map((referencePath) => ({
      path: createRelativePath(project.dtsConfigPath, referencePath),
    })),
    liminaOptions,
  };
}

function createGeneratedSolutionBuildConfig(
  config: ResolvedLiminaConfig,
  solution: SolutionProject,
): Record<string, unknown> {
  return {
    $schema: createLiminaTsconfigSchemaPath(
      config.rootDir,
      solution.buildConfigPath,
    ),
    files: [],
    references: [...solution.references].sort().map((referencePath) => ({
      path: createRelativePath(solution.buildConfigPath, referencePath),
    })),
    liminaOptions: {
      generated: true,
      checker: solution.checkerName,
      sourceConfig: createRelativePath(
        solution.buildConfigPath,
        solution.configPath,
      ),
    },
  };
}

function createCheckerBuildConfig(options: {
  checkerName: string;
  entryPath: string;
  references: string[];
  rootDir: string;
}): Record<string, unknown> {
  return {
    $schema: createLiminaTsconfigSchemaPath(options.rootDir, options.entryPath),
    files: [],
    references: options.references.sort().map((referencePath) => ({
      path: createRelativePath(options.entryPath, referencePath),
    })),
    liminaOptions: {
      generated: true,
      checker: options.checkerName,
    },
  };
}

async function writeGeneratedJson(
  context: GeneratedGraphWriteContext,
  filePath: string,
  value: unknown,
): Promise<void> {
  const content = stringifyJson(value);

  context.expectedFiles.add(filePath);

  if (existsSync(filePath)) {
    const previousContent = await readFile(filePath, 'utf8');

    if (previousContent === content) {
      return;
    }
  }

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content);
  context.changed = true;
}

async function removeStaleGeneratedFiles(
  context: GeneratedGraphWriteContext,
): Promise<void> {
  const generatedFiles = await glob(
    [`${generatedTsconfigDir}/**/*.json`, `${generatedManifestPath}`],
    {
      absolute: true,
      cwd: context.rootDir,
      onlyFiles: true,
    },
  );

  for (const filePath of generatedFiles.map(normalizeAbsolutePath)) {
    if (context.expectedFiles.has(filePath)) {
      continue;
    }

    await rm(filePath, { force: true });
    context.changed = true;
  }
}

function createManifest(options: {
  checkerEntries: Map<string, string>;
  checkers: ReturnType<typeof getActiveCheckers>;
  projectsByChecker: Map<string, SourceProject[]>;
  rootDir: string;
  sourceToBuildByChecker: Map<string, Map<string, GeneratedBuildModule>>;
}): GeneratedTsconfigGraphManifest {
  const manifestCheckers: Record<string, GeneratedCheckerManifest> = {};

  for (const checker of options.checkers) {
    const projects = options.projectsByChecker.get(checker.name) ?? [];
    const entryPath = options.checkerEntries.get(checker.name);
    const sourceToBuildBySourcePath =
      options.sourceToBuildByChecker.get(checker.name) ?? new Map();

    if (!entryPath) {
      continue;
    }

    const sourceToBuild: Record<string, GeneratedBuildModuleManifest> = {};
    const sourceToDts: Record<string, string> = {};
    const dtsToSource: Record<string, string> = {};

    for (const [sourceConfigPath, buildModule] of sourceToBuildBySourcePath) {
      const sourcePath = toPosixPath(
        toRelativePath(options.rootDir, sourceConfigPath),
      );

      sourceToBuild[sourcePath] = {
        kind: buildModule.kind,
        path: toPosixPath(toRelativePath(options.rootDir, buildModule.path)),
      };
    }

    for (const project of projects) {
      const sourcePath = toPosixPath(
        toRelativePath(options.rootDir, project.configPath),
      );
      const dtsPath = toPosixPath(
        toRelativePath(options.rootDir, project.dtsConfigPath),
      );

      sourceToDts[sourcePath] = dtsPath;
      dtsToSource[dtsPath] = sourcePath;
    }

    manifestCheckers[checker.name] = {
      preset: checker.preset,
      entry: toPosixPath(toRelativePath(options.rootDir, entryPath)),
      roots: projects
        .map((project) =>
          toPosixPath(toRelativePath(options.rootDir, project.configPath)),
        )
        .sort(),
      sourceToBuild: Object.fromEntries(
        Object.entries(sourceToBuild).sort(([left], [right]) =>
          left.localeCompare(right),
        ),
      ),
      sourceToDts,
      dtsToSource,
    };
  }

  return {
    version: 1,
    generatedBy: 'limina',
    checkers: manifestCheckers,
  };
}

function createResult(options: {
  changed: boolean;
  manifest: GeneratedTsconfigGraphManifest;
  manifestPath: string;
  rootDir: string;
}): GeneratedTsconfigGraphResult {
  const checkerEntries = new Map<string, string>();
  const sourceToBuild = new Map<string, Map<string, GeneratedBuildModule>>();
  const sourceToDts = new Map<string, Map<string, string>>();
  const dtsToSource = new Map<string, Map<string, string>>();

  for (const [checkerName, checkerManifest] of Object.entries(
    options.manifest.checkers,
  )) {
    checkerEntries.set(
      checkerName,
      normalizeAbsolutePath(path.join(options.rootDir, checkerManifest.entry)),
    );

    sourceToBuild.set(
      checkerName,
      new Map(
        Object.entries(checkerManifest.sourceToBuild ?? {}).map(
          ([sourcePath, buildModule]) => [
            normalizeAbsolutePath(path.join(options.rootDir, sourcePath)),
            {
              kind: buildModule.kind,
              path: normalizeAbsolutePath(
                path.join(options.rootDir, buildModule.path),
              ),
            },
          ],
        ),
      ),
    );
    sourceToDts.set(
      checkerName,
      new Map(
        Object.entries(checkerManifest.sourceToDts).map(
          ([sourcePath, dtsPath]) => [
            normalizeAbsolutePath(path.join(options.rootDir, sourcePath)),
            normalizeAbsolutePath(path.join(options.rootDir, dtsPath)),
          ],
        ),
      ),
    );
    dtsToSource.set(
      checkerName,
      new Map(
        Object.entries(checkerManifest.dtsToSource).map(
          ([dtsPath, sourcePath]) => [
            normalizeAbsolutePath(path.join(options.rootDir, dtsPath)),
            normalizeAbsolutePath(path.join(options.rootDir, sourcePath)),
          ],
        ),
      ),
    );
  }

  return {
    changed: options.changed,
    manifestPath: options.manifestPath,
    checkerEntries,
    sourceToBuild,
    sourceToDts,
    dtsToSource,
    manifest: options.manifest,
  };
}

function addDuplicateCheckerOwnershipProblems(options: {
  checkerCollectionsByName: Map<string, CheckerSourceConfigCollection>;
  checkers: ReturnType<typeof getActiveCheckers>;
  problems: string[];
  rootDir: string;
}): void {
  const ownersByPresetAndSourcePath = new Map<
    string,
    {
      checkerNames: string[];
      preset: string;
      sourceConfigPath: string;
    }
  >();

  for (const checker of options.checkers) {
    const collection = options.checkerCollectionsByName.get(checker.name);

    if (!collection) {
      continue;
    }

    for (const sourceConfigPath of collection.buildModulesBySourcePath.keys()) {
      const key = JSON.stringify([checker.preset, sourceConfigPath]);
      const ownership = ownersByPresetAndSourcePath.get(key) ?? {
        checkerNames: [],
        preset: checker.preset,
        sourceConfigPath,
      };

      ownership.checkerNames.push(checker.name);
      ownersByPresetAndSourcePath.set(key, ownership);
    }
  }

  for (const ownership of ownersByPresetAndSourcePath.values()) {
    const checkerNames = [...new Set(ownership.checkerNames)].sort(
      (left, right) => left.localeCompare(right),
    );

    if (checkerNames.length < 2) {
      continue;
    }

    options.problems.push(
      [
        'Duplicate Limina checker ownership:',
        `  preset: ${ownership.preset}`,
        `  source config: ${toRelativePath(options.rootDir, ownership.sourceConfigPath)}`,
        `  checkers: ${checkerNames.join(', ')}`,
        '  reason: checkers with the same preset must not govern the same source tsconfig after solution references are expanded.',
        '  fix: narrow config.checkers.<checker>.include or config.checkers.<checker>.exclude so only one checker owns this tsconfig for the preset.',
      ].join('\n'),
    );
  }
}

export async function prepareGeneratedTsconfigGraph(
  config: ResolvedLiminaConfig,
): Promise<GeneratedTsconfigGraphResult> {
  const checkers = getActiveCheckers(config);
  const checkerCollectionsByName = new Map<
    string,
    CheckerSourceConfigCollection
  >();
  const projectsByChecker = new Map<string, SourceProject[]>();
  const rootBuildPathsByChecker = new Map<string, string[]>();
  const solutionsByChecker = new Map<string, SolutionProject[]>();
  const checkerEntries = new Map<string, string>();
  const sourceToBuildByChecker = new Map<
    string,
    Map<string, GeneratedBuildModule>
  >();
  const writeContext: GeneratedGraphWriteContext = {
    changed: false,
    expectedFiles: new Set(),
    rootDir: config.rootDir,
  };
  const problems: string[] = [];

  for (const checker of checkers) {
    const collection = await collectCheckerSourceConfigs(
      config,
      checker.name,
      checker.include,
      checker.exclude,
    );
    const projects = [...collection.projectConfigPaths]
      .sort()
      .map((sourceConfigPath) =>
        createSourceProject({
          checkerName: checker.name,
          checkerPreset: checker.preset,
          config,
          sourceConfigPath,
        }),
      );
    const solutions = [...collection.solutionConfigPaths]
      .sort()
      .map((sourceConfigPath) =>
        createSolutionProject({
          checkerName: checker.name,
          collection,
          config,
          sourceConfigPath,
        }),
      );

    checkerCollectionsByName.set(checker.name, collection);
    projectsByChecker.set(checker.name, projects);
    solutionsByChecker.set(checker.name, solutions);
    sourceToBuildByChecker.set(
      checker.name,
      collection.buildModulesBySourcePath,
    );
    rootBuildPathsByChecker.set(
      checker.name,
      collection.rootConfigPaths
        .map(
          (sourceConfigPath) =>
            collection.buildModulesBySourcePath.get(sourceConfigPath)?.path,
        )
        .filter((buildPath): buildPath is string => Boolean(buildPath)),
    );
    checkerEntries.set(
      checker.name,
      getGeneratedCheckerEntryPath({
        checkerName: checker.name,
        rootDir: config.rootDir,
      }),
    );
  }

  addDuplicateCheckerOwnershipProblems({
    checkerCollectionsByName,
    checkers,
    problems,
    rootDir: config.rootDir,
  });

  const allProjects = [...projectsByChecker.values()].flat();

  for (const projects of projectsByChecker.values()) {
    problems.push(...inferProjectReferences(config, projects, allProjects));
  }

  if (problems.length > 0) {
    throw new Error(
      formatProblemList(
        problems,
        'Failed to prepare generated tsconfig graph.',
      ),
    );
  }

  for (const [checkerName, projects] of projectsByChecker) {
    const entryPath = checkerEntries.get(checkerName);
    const solutions = solutionsByChecker.get(checkerName) ?? [];
    const rootBuildPaths = rootBuildPathsByChecker.get(checkerName) ?? [];

    if (!entryPath) {
      continue;
    }

    for (const project of projects) {
      await writeGeneratedJson(
        writeContext,
        project.dtsConfigPath,
        createGeneratedDtsConfig(config, project),
      );
    }

    for (const solution of solutions) {
      await writeGeneratedJson(
        writeContext,
        solution.buildConfigPath,
        createGeneratedSolutionBuildConfig(config, solution),
      );
    }

    await writeGeneratedJson(
      writeContext,
      entryPath,
      createCheckerBuildConfig({
        checkerName,
        entryPath,
        references: rootBuildPaths,
        rootDir: config.rootDir,
      }),
    );
  }

  const manifest = createManifest({
    checkerEntries,
    checkers,
    projectsByChecker,
    rootDir: config.rootDir,
    sourceToBuildByChecker,
  });
  const manifestPath = normalizeAbsolutePath(
    path.join(config.rootDir, generatedManifestPath),
  );

  await writeGeneratedJson(writeContext, manifestPath, manifest);
  await removeStaleGeneratedFiles(writeContext);

  return createResult({
    changed: writeContext.changed,
    manifest,
    manifestPath,
    rootDir: config.rootDir,
  });
}
