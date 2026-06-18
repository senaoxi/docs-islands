import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'pathe';
import { glob } from 'tinyglobby';
import type ts from 'typescript';
import {
  type CheckerProjectParseContext,
  getBuildCheckerSupportedExtensions,
  getCheckerAdapter,
  getCheckerExtensions,
  parseCheckerProjectConfigForContext,
  resolveCheckerProjectExtensions,
} from './checkers';
import {
  getActiveCheckers,
  type ResolvedCheckerConfig,
  type ResolvedLiminaConfig,
} from './config';
import {
  type GeneratedKnipPackageConfig,
  type GeneratedKnipPackageDiagnostic,
  prepareGeneratedKnipPackageConfigs,
  resolveGeneratedKnipPackageConfigs,
  resolveGeneratedKnipPackageDiagnostics,
} from './generated-knip';
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
import { collectWorkspacePackages } from './workspace';

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

export interface GeneratedProviderEdgeManifest {
  file: string;
  fromChecker: string;
  fromConfig: string;
  importedSpecifier: string;
  resolvedFile: string;
  toChecker: string;
  toConfig: string;
}

export interface GeneratedProviderEdge {
  file: string;
  fromChecker: string;
  fromConfigPath: string;
  importedSpecifier: string;
  resolvedFilePath: string;
  toChecker: string;
  toConfigPath: string;
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
  knip: {
    diagnostics: GeneratedKnipPackageDiagnostic[];
    packages: GeneratedKnipPackageConfig[];
  };
  providerEdges: GeneratedProviderEdgeManifest[];
}

export interface GeneratedTsconfigGraphResult {
  changed: boolean;
  checkers: ResolvedCheckerConfig[];
  manifestPath: string;
  checkerEntries: Map<string, string>;
  sourceToBuild: Map<string, Map<string, GeneratedBuildModule>>;
  sourceToDts: Map<string, Map<string, string>>;
  dtsToSource: Map<string, Map<string, string>>;
  generatedKnipConfigs: GeneratedKnipPackageConfig[];
  generatedKnipDiagnostics: GeneratedKnipPackageDiagnostic[];
  providerEdges: GeneratedProviderEdge[];
  manifest: GeneratedTsconfigGraphManifest;
}

interface SourceProject {
  checkerName: string;
  configPath: string;
  context: CheckerProjectParseContext;
  dtsConfigPath: string;
  fileNames: string[];
  graphRules: string[];
  ownedFileNames: string[];
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
  entryConfigPaths: Set<string>;
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

interface PreparedCheckerGraph {
  checker: ReturnType<typeof getActiveCheckers>[number];
  collection: CheckerSourceConfigCollection;
  entryPath: string;
  projects: SourceProject[];
  rootBuildPaths: string[];
  solutions: SolutionProject[];
}

interface InferredProjectReferenceCollection {
  problems: string[];
  providerEdges: GeneratedProviderEdge[];
}

type AutoCheckerPreset = 'tsc' | 'vue-tsc';

interface AutoScopeProject {
  configPath: string;
  context: CheckerProjectParseContext;
  fileNames: string[];
  options: ts.CompilerOptions;
}

interface AutoScope {
  collection: CheckerSourceConfigCollection;
  entryConfigPath: string;
  projects: AutoScopeProject[];
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

function isDefaultSourceTsconfigPath(configPath: string): boolean {
  return (
    isOrdinarySourceTypecheckConfigPath(configPath) &&
    isDefaultTsconfigPath(configPath)
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

  if (hasReferences && isDefaultTsconfigPath(options.sourceConfigPath)) {
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
  const includedPaths = await glob(include.map(normalizeWorkspaceGlob), {
    absolute: true,
    cwd: config.rootDir,
    ignore: sourceDiscoveryIgnore,
    onlyFiles: true,
  });
  const includedSourcePaths = includedPaths.map(normalizeAbsolutePath).sort();
  const invalidEntryPaths = includedSourcePaths.filter(
    (sourcePath) => !isDefaultSourceTsconfigPath(sourcePath),
  );

  if (invalidEntryPaths.length > 0) {
    throw new Error(
      [
        'Checker include matched non-entry tsconfig files:',
        `  checker: ${checkerName}`,
        ...invalidEntryPaths.map(
          (sourcePath) => `  - ${toRelativePath(config.rootDir, sourcePath)}`,
        ),
        '  reason: checker.include may only match tsconfig.json entry files; non-standard tsconfig.*.json files become Limina-managed only when referenced from a managed tsconfig.json entry.',
      ].join('\n'),
    );
  }

  const problems: string[] = [];
  const excludedConfigPaths = await collectCheckerExcludedSourceConfigs(
    config,
    exclude,
  );
  const sourcePaths = includedSourcePaths.filter(
    (sourcePath) => !excludedConfigPaths.has(sourcePath),
  );
  const collection: CheckerSourceConfigCollection = {
    buildModulesBySourcePath: new Map(),
    entryConfigPaths: new Set(sourcePaths),
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

function isAutoCheckerMode(config: ResolvedLiminaConfig): boolean {
  return (
    config.config?.checkers === undefined || config.config.checkers === 'auto'
  );
}

function createResolvedChecker(options: {
  include: string[];
  name: string;
  preset: AutoCheckerPreset;
  rootDir: string;
}): ResolvedCheckerConfig {
  return {
    exclude: [],
    extensions: getCheckerExtensions(
      {
        include: options.include,
        preset: options.preset,
      },
      {
        projectRootDir: options.rootDir,
      },
    ),
    include: options.include,
    name: options.name,
    preset: options.preset,
  };
}

async function collectAutoEntryConfigPaths(
  config: ResolvedLiminaConfig,
): Promise<string[]> {
  const paths = await glob('**/tsconfig.json', {
    absolute: true,
    cwd: config.rootDir,
    ignore: sourceDiscoveryIgnore,
    onlyFiles: true,
  });

  return paths
    .map(normalizeAbsolutePath)
    .filter(isDefaultSourceTsconfigPath)
    .sort((left, right) => left.localeCompare(right));
}

function createAutoScopeProject(
  config: ResolvedLiminaConfig,
  configPath: string,
): AutoScopeProject {
  const context: CheckerProjectParseContext = {
    checkerPresets: ['tsc'],
    extensions: capabilityDiscoveryExtensions,
  };
  const parsed = parseCheckerProjectConfigForContext({
    configPath,
    context,
    projectRootDir: config.rootDir,
  });

  return {
    configPath,
    context,
    fileNames: parsed.fileNames.map(normalizeAbsolutePath).sort(),
    options: parsed.options,
  };
}

function collectAutoScope(
  config: ResolvedLiminaConfig,
  entryConfigPath: string,
): AutoScope | null {
  const collection: CheckerSourceConfigCollection = {
    buildModulesBySourcePath: new Map(),
    entryConfigPaths: new Set([entryConfigPath]),
    projectConfigPaths: new Set(),
    rootConfigPaths: [],
    solutionConfigPaths: new Set(),
    solutionReferencesBySourcePath: new Map(),
  };
  const problems: string[] = [];

  collectCheckerSourceConfigModules({
    checkerName: '__auto__',
    collection,
    config,
    excludedConfigPaths: new Set(),
    problems,
    sourceConfigPath: entryConfigPath,
    seenConfigs: new Set(),
  });

  if (problems.length > 0) {
    throw new Error(
      formatProblemList(problems, 'Failed to collect auto checker scope.'),
    );
  }

  collection.rootConfigPaths = collection.buildModulesBySourcePath.has(
    entryConfigPath,
  )
    ? [entryConfigPath]
    : [];

  if (
    collection.projectConfigPaths.size === 0 &&
    collection.solutionConfigPaths.size === 0
  ) {
    return null;
  }

  return {
    collection,
    entryConfigPath,
    projects: [...collection.projectConfigPaths]
      .sort((left, right) => left.localeCompare(right))
      .map((sourceConfigPath) =>
        createAutoScopeProject(config, sourceConfigPath),
      ),
  };
}

function formatUnsupportedAutoScopeExtensionProblem(options: {
  config: ResolvedLiminaConfig;
  entryConfigPath: string;
  extension: string;
  fileName: string;
}): string {
  return [
    'Unsupported auto checker source file extension:',
    `  scope: ${toRelativePath(options.config.rootDir, options.entryConfigPath)}`,
    `  extension: ${options.extension}`,
    `  example: ${toRelativePath(options.config.rootDir, options.fileName)}`,
    '  reason: auto checker mode can only route TypeScript, JavaScript, JSON, and Vue source scopes.',
    '  fix: move this file to an explicit checker scope or configure config.checkers manually.',
  ].join('\n');
}

function classifyAutoScope(
  config: ResolvedLiminaConfig,
  scope: AutoScope,
): AutoCheckerPreset {
  const typescriptExtensions = new Set(
    getBuildCheckerSupportedExtensions('tsc'),
  );
  const vueExtensions = new Set(getBuildCheckerSupportedExtensions('vue-tsc'));
  let hasVueOnlyFile = false;

  for (const project of scope.projects) {
    for (const fileName of project.fileNames) {
      const extension = getFileExtension(fileName);

      if (!extension) {
        continue;
      }

      if (!vueExtensions.has(extension)) {
        throw new Error(
          formatUnsupportedAutoScopeExtensionProblem({
            config,
            entryConfigPath: scope.entryConfigPath,
            extension,
            fileName,
          }),
        );
      }

      if (!typescriptExtensions.has(extension)) {
        hasVueOnlyFile = true;
      }
    }
  }

  return hasVueOnlyFile ? 'vue-tsc' : 'tsc';
}

function isAutoRelativeSpecifier(specifier: string): boolean {
  return (
    specifier === '.' ||
    specifier === '..' ||
    specifier.startsWith('./') ||
    specifier.startsWith('../')
  );
}

function collectAutoImportCandidatePaths(options: {
  containingFile: string;
  resolvedFilePath: string | null;
  specifier: string;
}): string[] {
  const candidates = new Set<string>();

  if (options.resolvedFilePath) {
    candidates.add(normalizeAbsolutePath(options.resolvedFilePath));
  }

  if (!isAutoRelativeSpecifier(options.specifier)) {
    return [...candidates];
  }

  const basePath = path.resolve(
    path.dirname(options.containingFile),
    options.specifier,
  );

  if (path.extname(basePath)) {
    candidates.add(normalizeAbsolutePath(basePath));
    return [...candidates];
  }

  for (const extension of capabilityDiscoveryExtensions) {
    candidates.add(normalizeAbsolutePath(`${basePath}${extension}`));
    candidates.add(
      normalizeAbsolutePath(path.join(basePath, `index${extension}`)),
    );
  }

  return [...candidates];
}

function collectAutoScopeDependencies(
  config: ResolvedLiminaConfig,
  scopes: AutoScope[],
): Map<string, Set<string>> {
  const dependenciesByEntry = new Map(
    scopes.map((scope) => [scope.entryConfigPath, new Set<string>()]),
  );
  const scopeEntries = new Set(scopes.map((scope) => scope.entryConfigPath));
  const entryPathsByFileName = new Map<string, Set<string>>();
  const importAnalysis = createImportAnalysisContext();

  for (const scope of scopes) {
    for (const project of scope.projects) {
      for (const fileName of project.fileNames) {
        const entries = entryPathsByFileName.get(fileName) ?? new Set<string>();

        entries.add(scope.entryConfigPath);
        entryPathsByFileName.set(fileName, entries);
      }
    }
  }

  for (const scope of scopes) {
    const dependencies =
      dependenciesByEntry.get(scope.entryConfigPath) ?? new Set<string>();

    for (const references of scope.collection.solutionReferencesBySourcePath.values()) {
      for (const referencePath of references) {
        if (
          scopeEntries.has(referencePath) &&
          referencePath !== scope.entryConfigPath
        ) {
          dependencies.add(referencePath);
        }
      }
    }

    for (const project of scope.projects) {
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

          for (const candidatePath of collectAutoImportCandidatePaths({
            containingFile: fileName,
            resolvedFilePath,
            specifier: importRecord.specifier,
          })) {
            for (const targetEntryPath of entryPathsByFileName.get(
              candidatePath,
            ) ?? []) {
              if (targetEntryPath !== scope.entryConfigPath) {
                dependencies.add(targetEntryPath);
              }
            }
          }
        }
      }
    }
  }

  return dependenciesByEntry;
}

function promoteAutoScopes(
  kindsByEntry: Map<string, AutoCheckerPreset>,
  dependenciesByEntry: Map<string, Set<string>>,
): void {
  let changed = true;

  while (changed) {
    changed = false;

    for (const [entryConfigPath, dependencies] of dependenciesByEntry) {
      if (kindsByEntry.get(entryConfigPath) !== 'tsc') {
        continue;
      }

      for (const dependencyPath of dependencies) {
        if (kindsByEntry.get(dependencyPath) !== 'vue-tsc') {
          continue;
        }

        kindsByEntry.set(entryConfigPath, 'vue-tsc');
        changed = true;
        break;
      }
    }
  }
}

async function resolveAutoCheckers(
  config: ResolvedLiminaConfig,
): Promise<ResolvedCheckerConfig[]> {
  const entryConfigPaths = await collectAutoEntryConfigPaths(config);
  const scopes = entryConfigPaths
    .map((entryConfigPath) => collectAutoScope(config, entryConfigPath))
    .filter((scope): scope is AutoScope => Boolean(scope));
  const kindsByEntry = new Map(
    scopes.map((scope) => [
      scope.entryConfigPath,
      classifyAutoScope(config, scope),
    ]),
  );

  promoteAutoScopes(kindsByEntry, collectAutoScopeDependencies(config, scopes));

  const entriesByPreset = new Map<AutoCheckerPreset, string[]>();

  for (const [entryConfigPath, preset] of kindsByEntry) {
    entriesByPreset.set(preset, [
      ...(entriesByPreset.get(preset) ?? []),
      toPosixPath(toRelativePath(config.rootDir, entryConfigPath)),
    ]);
  }

  const checkers: ResolvedCheckerConfig[] = [];
  const typescriptEntries = entriesByPreset.get('tsc')?.sort() ?? [];
  const vueEntries = entriesByPreset.get('vue-tsc')?.sort() ?? [];

  if (typescriptEntries.length > 0) {
    checkers.push(
      createResolvedChecker({
        include: typescriptEntries,
        name: 'typescript',
        preset: 'tsc',
        rootDir: config.rootDir,
      }),
    );
  }

  if (vueEntries.length > 0) {
    checkers.push(
      createResolvedChecker({
        include: vueEntries,
        name: 'vue',
        preset: 'vue-tsc',
        rootDir: config.rootDir,
      }),
    );
  }

  return checkers;
}

async function resolveGeneratedGraphCheckers(
  config: ResolvedLiminaConfig,
): Promise<ResolvedCheckerConfig[]> {
  return isAutoCheckerMode(config)
    ? resolveAutoCheckers(config)
    : getActiveCheckers(config);
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
  const ownedFileNames = parsed.fileNames.map(normalizeAbsolutePath).sort();

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
        ...ownedFileNames,
        ...readRelativeTypeFiles(options.config, options.sourceConfigPath),
      ]),
    ].sort(),
    graphRules: readGraphRules(options.config, options.sourceConfigPath),
    ownedFileNames,
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

  return candidates.find(
    (project) => project.checkerName === options.checkerName,
  )?.dtsConfigPath;
}

function getDtsProjectsForSourcePath(options: {
  dtsProjectsBySourcePath: Map<string, SourceProject[]>;
  sourceConfigPath: string;
}): SourceProject[] {
  return options.dtsProjectsBySourcePath.get(options.sourceConfigPath) ?? [];
}

function isBuildCapableProject(project: SourceProject): boolean {
  const preset = project.context.checkerPresets[0];

  return preset ? getCheckerAdapter(preset)?.execution === 'build' : false;
}

function selectProviderProject(options: {
  resolvedFilePath: string;
  sourceCheckerName: string;
  targetProjects: SourceProject[];
}): SourceProject | null {
  const providerProjects = options.targetProjects
    .filter((project) => project.checkerName !== options.sourceCheckerName)
    .filter((project) =>
      project.ownedFileNames.includes(options.resolvedFilePath),
    )
    .filter(isBuildCapableProject)
    .sort((left, right) => left.checkerName.localeCompare(right.checkerName));

  return providerProjects[0] ?? null;
}

interface UnsupportedCrossCheckerProviderFile {
  extension: string;
  fileName: string;
  generatedConfigPath: string;
  sourceConfigPath: string;
}

function createSourceProjectKey(
  checkerName: string,
  configPath: string,
): string {
  return JSON.stringify([checkerName, configPath]);
}

function collectGeneratedDtsProjectClosure(options: {
  projectByDtsConfigPath: Map<string, SourceProject>;
  rootProject: SourceProject;
}): SourceProject[] {
  const closure: SourceProject[] = [];
  const seen = new Set<string>();
  const queue = [options.rootProject];

  for (;;) {
    const project = queue.shift();

    if (!project) {
      break;
    }

    if (seen.has(project.dtsConfigPath)) {
      continue;
    }

    seen.add(project.dtsConfigPath);
    closure.push(project);

    for (const referencePath of project.references) {
      const referenceProject =
        options.projectByDtsConfigPath.get(referencePath);

      if (!referenceProject || seen.has(referenceProject.dtsConfigPath)) {
        continue;
      }

      queue.push(referenceProject);
    }
  }

  return closure;
}

function collectUnsupportedCrossCheckerProviderFiles(options: {
  consumerProject: SourceProject;
  projectByDtsConfigPath: Map<string, SourceProject>;
  providerProject: SourceProject;
}): UnsupportedCrossCheckerProviderFile[] {
  const consumerPreset = options.consumerProject.context.checkerPresets[0];
  const supportedExtensions = new Set(
    consumerPreset
      ? [
          ...getBuildCheckerSupportedExtensions(consumerPreset),
          ...options.consumerProject.context.extensions,
        ]
      : options.consumerProject.context.extensions,
  );
  const unsupportedFiles: UnsupportedCrossCheckerProviderFile[] = [];

  for (const project of collectGeneratedDtsProjectClosure({
    projectByDtsConfigPath: options.projectByDtsConfigPath,
    rootProject: options.providerProject,
  })) {
    for (const fileName of project.fileNames) {
      const extension = getFileExtension(fileName);

      if (!extension || supportedExtensions.has(extension)) {
        continue;
      }

      unsupportedFiles.push({
        extension,
        fileName,
        generatedConfigPath: project.dtsConfigPath,
        sourceConfigPath: project.configPath,
      });
    }
  }

  return unsupportedFiles.sort(
    (left, right) =>
      left.generatedConfigPath.localeCompare(right.generatedConfigPath) ||
      left.extension.localeCompare(right.extension) ||
      left.fileName.localeCompare(right.fileName),
  );
}

function formatUnsupportedCrossCheckerProviderProblem(options: {
  config: ResolvedLiminaConfig;
  consumerProject: SourceProject;
  edge: GeneratedProviderEdge;
  providerProject: SourceProject;
  unsupportedFiles: UnsupportedCrossCheckerProviderFile[];
}): string {
  const consumerPreset =
    options.consumerProject.context.checkerPresets[0] ?? 'unknown';
  const providerPreset =
    options.providerProject.context.checkerPresets[0] ?? 'unknown';
  const unsupportedLines = options.unsupportedFiles.map((file) => [
    `  - generated config: ${toRelativePath(options.config.rootDir, file.generatedConfigPath)}`,
    `    source config: ${toRelativePath(options.config.rootDir, file.sourceConfigPath)}`,
    `    extension: ${file.extension}`,
    `    example: ${toRelativePath(options.config.rootDir, file.fileName)}`,
  ]);

  return [
    'Unsupported cross-checker declaration provider:',
    `  consumer checker: ${options.consumerProject.checkerName} (${consumerPreset})`,
    `  consumer config: ${toRelativePath(options.config.rootDir, options.consumerProject.configPath)}`,
    `  provider checker: ${options.providerProject.checkerName} (${providerPreset})`,
    `  provider config: ${toRelativePath(options.config.rootDir, options.providerProject.configPath)}`,
    `  file: ${options.edge.file}`,
    `  imported specifier: ${options.edge.importedSpecifier}`,
    `  resolved file: ${toRelativePath(options.config.rootDir, options.edge.resolvedFilePath)}`,
    '  unsupported provider files:',
    ...unsupportedLines.flat(),
    '  reason: cross-checker provider references must be buildable by the consumer checker across the entire generated declaration reference tree.',
    '  fix: cover the target source config with the consumer checker, or expose a TypeScript-only boundary that the consumer checker can build.',
  ].join('\n');
}

function addCrossCheckerProviderCompatibilityProblems(options: {
  config: ResolvedLiminaConfig;
  problems: string[];
  projects: SourceProject[];
  providerEdges: GeneratedProviderEdge[];
}): void {
  const projectBySourceKey = new Map(
    options.projects.map((project) => [
      createSourceProjectKey(project.checkerName, project.configPath),
      project,
    ]),
  );
  const projectByDtsConfigPath = new Map(
    options.projects.map((project) => [project.dtsConfigPath, project]),
  );

  for (const edge of options.providerEdges) {
    const consumerProject = projectBySourceKey.get(
      createSourceProjectKey(edge.fromChecker, edge.fromConfigPath),
    );
    const providerProject = projectBySourceKey.get(
      createSourceProjectKey(edge.toChecker, edge.toConfigPath),
    );

    if (!consumerProject || !providerProject) {
      continue;
    }

    const unsupportedFiles = collectUnsupportedCrossCheckerProviderFiles({
      consumerProject,
      projectByDtsConfigPath,
      providerProject,
    });

    if (unsupportedFiles.length === 0) {
      continue;
    }

    options.problems.push(
      formatUnsupportedCrossCheckerProviderProblem({
        config: options.config,
        consumerProject,
        edge,
        providerProject,
        unsupportedFiles,
      }),
    );
  }
}

function formatMissingCrossCheckerProviderProblem(options: {
  config: ResolvedLiminaConfig;
  importRecord: ReturnType<typeof collectImportsFromFile>[number];
  project: SourceProject;
  resolvedFilePath: string;
  targetProjects: SourceProject[];
  targetSourceConfigPath: string;
}): string {
  return [
    'Unable to resolve cross-checker declaration provider:',
    `  from checker: ${options.project.checkerName}`,
    `  from config: ${toRelativePath(options.config.rootDir, options.project.configPath)}`,
    `  file: ${formatImportRecordLocation(options.config.rootDir, options.importRecord)}`,
    `  imported specifier: ${options.importRecord.specifier}`,
    `  resolved file: ${toRelativePath(options.config.rootDir, options.resolvedFilePath)}`,
    `  candidate checker: ${options.targetProjects.map((project) => project.checkerName).join(', ')}`,
    `  target config: ${toRelativePath(options.config.rootDir, options.targetSourceConfigPath)}`,
    '  reason: cross-checker imports need a build-capable checker that owns the resolved file.',
    '  fix: cover the target source config with a build-capable checker preset such as tsc, tsgo, or vue-tsc.',
  ].join('\n');
}

function inferProjectReferences(
  config: ResolvedLiminaConfig,
  projects: SourceProject[],
  ownerProjects: SourceProject[] = projects,
): InferredProjectReferenceCollection {
  const problems: string[] = [];
  const providerEdgesByKey = new Map<string, GeneratedProviderEdge>();
  const importAnalysis = createImportAnalysisContext();
  const ownerLookup = createFileOwnerLookup(
    ownerProjects.map((project) => ({
      checkerPresets: project.context.checkerPresets,
      configPath: project.configPath,
      extensions: project.context.extensions,
      fileNames: project.ownedFileNames,
      labels: project.graphRules,
      labelProblem: null,
      ownedFileNames: project.ownedFileNames,
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
    for (const fileName of project.ownedFileNames) {
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
          const targetProjects = getDtsProjectsForSourcePath({
            dtsProjectsBySourcePath,
            sourceConfigPath: targetSourceConfigPath,
          }).filter(
            (targetProject) =>
              targetProject.checkerName !== project.checkerName,
          );

          if (targetProjects.length > 0) {
            const providerProject = selectProviderProject({
              resolvedFilePath,
              sourceCheckerName: project.checkerName,
              targetProjects,
            });

            if (!providerProject) {
              problems.push(
                formatMissingCrossCheckerProviderProblem({
                  config,
                  importRecord,
                  project,
                  resolvedFilePath,
                  targetProjects,
                  targetSourceConfigPath,
                }),
              );
              continue;
            }

            if (
              isDeniedGeneratedReference(
                config,
                project,
                targetSourceConfigPath,
              )
            ) {
              continue;
            }

            const providerEdge: GeneratedProviderEdge = {
              file: formatImportRecordLocation(config.rootDir, importRecord),
              fromChecker: project.checkerName,
              fromConfigPath: project.configPath,
              importedSpecifier: importRecord.specifier,
              resolvedFilePath,
              toChecker: providerProject.checkerName,
              toConfigPath: targetSourceConfigPath,
            };
            const providerEdgeKey = JSON.stringify([
              providerEdge.fromChecker,
              providerEdge.fromConfigPath,
              providerEdge.toChecker,
              providerEdge.toConfigPath,
              providerEdge.file,
              providerEdge.importedSpecifier,
              providerEdge.resolvedFilePath,
            ]);

            providerEdgesByKey.set(providerEdgeKey, providerEdge);
            project.references.add(providerProject.dtsConfigPath);
            continue;
          }

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

  return {
    problems,
    providerEdges: [...providerEdgesByKey.values()].sort(
      (left, right) =>
        left.fromChecker.localeCompare(right.fromChecker) ||
        left.fromConfigPath.localeCompare(right.fromConfigPath) ||
        left.toChecker.localeCompare(right.toChecker) ||
        left.toConfigPath.localeCompare(right.toConfigPath) ||
        left.file.localeCompare(right.file) ||
        left.importedSpecifier.localeCompare(right.importedSpecifier),
    ),
  };
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

function isSameOrParentDirectory(
  parentDirectory: string,
  childDirectory: string,
): boolean {
  const relativePath = path.relative(parentDirectory, childDirectory);

  return (
    relativePath === '' ||
    (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))
  );
}

function containsAllDirectories(
  parentDirectory: string,
  childDirectories: string[],
): boolean {
  for (const childDirectory of childDirectories) {
    if (!isSameOrParentDirectory(parentDirectory, childDirectory)) {
      return false;
    }
  }

  return true;
}

function getCommonSourceRootDir(project: SourceProject): string {
  const fileDirectories = project.fileNames.map((fileName) =>
    path.dirname(fileName),
  );

  if (fileDirectories.length === 0) {
    return path.dirname(project.configPath);
  }

  let commonDirectory = fileDirectories[0]!;

  while (!containsAllDirectories(commonDirectory, fileDirectories)) {
    const parentDirectory = path.dirname(commonDirectory);

    if (parentDirectory === commonDirectory) {
      return commonDirectory;
    }

    commonDirectory = parentDirectory;
  }

  return commonDirectory;
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
        getCommonSourceRootDir(project),
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
    [
      `${generatedTsconfigDir}/**/*.json`,
      `${generatedRootDirName}/knip/**/*.json`,
      `${generatedManifestPath}`,
    ],
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
  generatedKnipDiagnostics: GeneratedKnipPackageDiagnostic[];
  generatedKnipPackageConfigs: GeneratedKnipPackageConfig[];
  projectsByChecker: Map<string, SourceProject[]>;
  providerEdges: GeneratedProviderEdge[];
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
    knip: {
      diagnostics: options.generatedKnipDiagnostics,
      packages: options.generatedKnipPackageConfigs,
    },
    providerEdges: options.providerEdges.map((edge) => ({
      file: edge.file,
      fromChecker: edge.fromChecker,
      fromConfig: toPosixPath(
        toRelativePath(options.rootDir, edge.fromConfigPath),
      ),
      importedSpecifier: edge.importedSpecifier,
      resolvedFile: toPosixPath(
        toRelativePath(options.rootDir, edge.resolvedFilePath),
      ),
      toChecker: edge.toChecker,
      toConfig: toPosixPath(toRelativePath(options.rootDir, edge.toConfigPath)),
    })),
  };
}

function createResult(options: {
  changed: boolean;
  checkers: ResolvedCheckerConfig[];
  manifest: GeneratedTsconfigGraphManifest;
  manifestPath: string;
  rootDir: string;
}): GeneratedTsconfigGraphResult {
  const checkerEntries = new Map<string, string>();
  const sourceToBuild = new Map<string, Map<string, GeneratedBuildModule>>();
  const sourceToDts = new Map<string, Map<string, string>>();
  const dtsToSource = new Map<string, Map<string, string>>();
  const providerEdges = options.manifest.providerEdges.map((edge) => ({
    file: edge.file,
    fromChecker: edge.fromChecker,
    fromConfigPath: normalizeAbsolutePath(
      path.join(options.rootDir, edge.fromConfig),
    ),
    importedSpecifier: edge.importedSpecifier,
    resolvedFilePath: normalizeAbsolutePath(
      path.join(options.rootDir, edge.resolvedFile),
    ),
    toChecker: edge.toChecker,
    toConfigPath: normalizeAbsolutePath(
      path.join(options.rootDir, edge.toConfig),
    ),
  }));

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
    checkers: options.checkers,
    manifestPath: options.manifestPath,
    checkerEntries,
    sourceToBuild,
    sourceToDts,
    dtsToSource,
    generatedKnipConfigs: resolveGeneratedKnipPackageConfigs({
      configs: options.manifest.knip?.packages ?? [],
      rootDir: options.rootDir,
    }),
    generatedKnipDiagnostics: resolveGeneratedKnipPackageDiagnostics({
      diagnostics: options.manifest.knip?.diagnostics ?? [],
      rootDir: options.rootDir,
    }),
    providerEdges,
    manifest: options.manifest,
  };
}

export function collectGeneratedSourceConfigPaths(
  generatedGraph: GeneratedTsconfigGraphResult,
): string[] {
  return [
    ...new Set(
      [...generatedGraph.sourceToBuild.values()].flatMap((sourceToBuild) => [
        ...sourceToBuild.keys(),
      ]),
    ),
  ].sort((left, right) => left.localeCompare(right));
}

export function collectGeneratedProjectSourceConfigPaths(
  generatedGraph: GeneratedTsconfigGraphResult,
): string[] {
  return [
    ...new Set(
      [...generatedGraph.sourceToDts.values()].flatMap((sourceToDts) => [
        ...sourceToDts.keys(),
      ]),
    ),
  ].sort((left, right) => left.localeCompare(right));
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

function addOverlappingCheckerEntryProblems(options: {
  checkerCollectionsByName: Map<string, CheckerSourceConfigCollection>;
  checkers: ReturnType<typeof getActiveCheckers>;
  problems: string[];
  rootDir: string;
}): void {
  const checkerNamesByEntryPath = new Map<string, string[]>();

  for (const checker of options.checkers) {
    const collection = options.checkerCollectionsByName.get(checker.name);

    if (!collection) {
      continue;
    }

    for (const entryConfigPath of collection.entryConfigPaths) {
      checkerNamesByEntryPath.set(entryConfigPath, [
        ...(checkerNamesByEntryPath.get(entryConfigPath) ?? []),
        checker.name,
      ]);
    }
  }

  for (const [entryConfigPath, checkerNames] of checkerNamesByEntryPath) {
    const uniqueCheckerNames = [...new Set(checkerNames)].sort((left, right) =>
      left.localeCompare(right),
    );

    if (uniqueCheckerNames.length < 2) {
      continue;
    }

    options.problems.push(
      [
        'Duplicate Limina checker entry:',
        `  entry config: ${toRelativePath(options.rootDir, entryConfigPath)}`,
        `  checkers: ${uniqueCheckerNames.join(', ')}`,
        '  reason: checker.include/checker.exclude entry sets must not overlap; capability overlap is allowed only after tsconfig.json references are expanded.',
        '  fix: narrow config.checkers.<checker>.include or config.checkers.<checker>.exclude so each tsconfig.json entry belongs to one checker.',
      ].join('\n'),
    );
  }
}

const capabilityDiscoveryExtensions = [
  '.cts',
  '.d.cts',
  '.d.mts',
  '.d.ts',
  '.js',
  '.jsx',
  '.json',
  '.mjs',
  '.mts',
  '.svelte',
  '.ts',
  '.tsx',
  '.vue',
];

const checkerPresetSuggestionsByExtension = new Map<string, string[]>([
  ['.svelte', ['svelte-check']],
  ['.vue', ['vue-tsc']],
]);

function getFileExtension(fileName: string): string {
  const baseName = path.basename(fileName);

  if (baseName.endsWith('.d.cts')) {
    return '.d.cts';
  }

  if (baseName.endsWith('.d.mts')) {
    return '.d.mts';
  }

  if (baseName.endsWith('.d.ts')) {
    return '.d.ts';
  }

  return path.extname(baseName);
}

function formatUnsupportedSourceConfigExtensionsProblem(options: {
  config: ResolvedLiminaConfig;
  fileNamesByExtension: Map<string, string[]>;
  projects: SourceProject[];
  sourceConfigPath: string;
}): string {
  const checkerLabels = options.projects
    .map((project) => {
      const preset = project.context.checkerPresets[0] ?? 'unknown';

      return `${project.checkerName} (${preset})`;
    })
    .sort((left, right) => left.localeCompare(right));
  const extensionLines = [...options.fileNamesByExtension.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([extension, fileNames]) => {
      const suggestions =
        checkerPresetSuggestionsByExtension.get(extension)?.join(', ') ??
        'a checker preset that supports this extension';

      return [
        `  - extension: ${extension}`,
        `    example: ${toRelativePath(options.config.rootDir, fileNames[0]!)}`,
        `    suggested checker: ${suggestions}`,
      ];
    });

  return [
    'Source config contains files unsupported by its checker coverage:',
    `  config: ${toRelativePath(options.config.rootDir, options.sourceConfigPath)}`,
    `  checkers: ${checkerLabels.join(', ')}`,
    '  unsupported files:',
    ...extensionLines,
    '  reason: every file reached by an effective source config must be supported by at least one checker preset that covers that config.',
    '  fix: add a checker with a matching capability through another tsconfig.json entry that references this source config, or move the files to a config covered by that checker.',
  ].join('\n');
}

function addUnsupportedSourceConfigExtensionProblems(options: {
  config: ResolvedLiminaConfig;
  problems: string[];
  projects: SourceProject[];
}): void {
  const projectsBySourceConfigPath = createDtsProjectsBySourcePath(
    options.projects,
  );

  for (const [sourceConfigPath, projects] of projectsBySourceConfigPath) {
    const neutralContext: CheckerProjectParseContext = {
      checkerPresets: ['tsc'],
      extensions: capabilityDiscoveryExtensions,
    };
    const neutralParsed = parseCheckerProjectConfigForContext({
      configPath: sourceConfigPath,
      context: neutralContext,
      projectRootDir: options.config.rootDir,
    });
    const supportedExtensions = new Set(
      projects.flatMap((project) => [
        ...project.context.extensions,
        ...project.fileNames.map(getFileExtension).filter(Boolean),
      ]),
    );
    const unsupportedFilesByExtension = new Map<string, string[]>();

    for (const fileName of neutralParsed.fileNames.map(normalizeAbsolutePath)) {
      const extension = getFileExtension(fileName);

      if (!extension || supportedExtensions.has(extension)) {
        continue;
      }

      unsupportedFilesByExtension.set(extension, [
        ...(unsupportedFilesByExtension.get(extension) ?? []),
        fileName,
      ]);
    }

    if (unsupportedFilesByExtension.size === 0) {
      continue;
    }

    options.problems.push(
      formatUnsupportedSourceConfigExtensionsProblem({
        config: options.config,
        fileNamesByExtension: unsupportedFilesByExtension,
        projects,
        sourceConfigPath,
      }),
    );
  }
}

export async function prepareGeneratedTsconfigGraph(
  config: ResolvedLiminaConfig,
): Promise<GeneratedTsconfigGraphResult> {
  const checkers = await resolveGeneratedGraphCheckers(config);
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
  const providerEdges: GeneratedProviderEdge[] = [];
  const writeContext: GeneratedGraphWriteContext = {
    changed: false,
    expectedFiles: new Set(),
    rootDir: config.rootDir,
  };
  const problems: string[] = [];

  const preparedCheckers = await Promise.all(
    checkers.map(async (checker): Promise<PreparedCheckerGraph> => {
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

      const rootBuildPaths = collection.rootConfigPaths
        .map(
          (sourceConfigPath) =>
            collection.buildModulesBySourcePath.get(sourceConfigPath)?.path,
        )
        .filter((buildPath): buildPath is string => Boolean(buildPath));

      return {
        checker,
        collection,
        entryPath: getGeneratedCheckerEntryPath({
          checkerName: checker.name,
          rootDir: config.rootDir,
        }),
        projects,
        rootBuildPaths,
        solutions,
      };
    }),
  );

  for (const preparedChecker of preparedCheckers) {
    checkerCollectionsByName.set(
      preparedChecker.checker.name,
      preparedChecker.collection,
    );
    projectsByChecker.set(
      preparedChecker.checker.name,
      preparedChecker.projects,
    );
    solutionsByChecker.set(
      preparedChecker.checker.name,
      preparedChecker.solutions,
    );
    sourceToBuildByChecker.set(
      preparedChecker.checker.name,
      preparedChecker.collection.buildModulesBySourcePath,
    );
    rootBuildPathsByChecker.set(
      preparedChecker.checker.name,
      preparedChecker.rootBuildPaths,
    );
    checkerEntries.set(preparedChecker.checker.name, preparedChecker.entryPath);
  }

  addOverlappingCheckerEntryProblems({
    checkerCollectionsByName,
    checkers,
    problems,
    rootDir: config.rootDir,
  });
  addDuplicateCheckerOwnershipProblems({
    checkerCollectionsByName,
    checkers,
    problems,
    rootDir: config.rootDir,
  });

  const allProjects = [...projectsByChecker.values()].flat();

  addUnsupportedSourceConfigExtensionProblems({
    config,
    problems,
    projects: allProjects,
  });

  const inferredReferenceCollections = await Promise.all(
    checkers.map((checker) =>
      inferProjectReferences(
        config,
        projectsByChecker.get(checker.name) ?? [],
        allProjects,
      ),
    ),
  );

  for (const collection of inferredReferenceCollections) {
    problems.push(...collection.problems);
    providerEdges.push(...collection.providerEdges);
  }

  addCrossCheckerProviderCompatibilityProblems({
    config,
    problems,
    projects: allProjects,
    providerEdges,
  });

  providerEdges.sort(
    (left, right) =>
      left.fromChecker.localeCompare(right.fromChecker) ||
      left.fromConfigPath.localeCompare(right.fromConfigPath) ||
      left.toChecker.localeCompare(right.toChecker) ||
      left.toConfigPath.localeCompare(right.toConfigPath) ||
      left.file.localeCompare(right.file) ||
      left.importedSpecifier.localeCompare(right.importedSpecifier),
  );

  if (problems.length > 0) {
    throw new Error(
      formatProblemList(
        problems,
        'Failed to prepare generated tsconfig graph.',
      ),
    );
  }

  const workspacePackages = await collectWorkspacePackages(config);
  const generatedKnip = prepareGeneratedKnipPackageConfigs({
    config,
    sourceToBuildByChecker,
    workspacePackages,
  });

  await Promise.all(
    checkers.map(async (checker) => {
      const checkerName = checker.name;
      const projects = projectsByChecker.get(checkerName) ?? [];
      const entryPath = checkerEntries.get(checkerName);
      const solutions = solutionsByChecker.get(checkerName) ?? [];
      const rootBuildPaths = rootBuildPathsByChecker.get(checkerName) ?? [];

      if (!entryPath) {
        return;
      }

      await Promise.all([
        ...projects.map((project) =>
          writeGeneratedJson(
            writeContext,
            project.dtsConfigPath,
            createGeneratedDtsConfig(config, project),
          ),
        ),
        ...solutions.map((solution) =>
          writeGeneratedJson(
            writeContext,
            solution.buildConfigPath,
            createGeneratedSolutionBuildConfig(config, solution),
          ),
        ),
        writeGeneratedJson(
          writeContext,
          entryPath,
          createCheckerBuildConfig({
            checkerName,
            entryPath,
            references: rootBuildPaths,
            rootDir: config.rootDir,
          }),
        ),
      ]);
    }),
  );

  await Promise.all(
    generatedKnip.configs.map((entry) =>
      writeGeneratedJson(writeContext, entry.configPath, entry.content),
    ),
  );

  const manifest = createManifest({
    checkerEntries,
    checkers,
    generatedKnipDiagnostics: generatedKnip.diagnostics,
    generatedKnipPackageConfigs: generatedKnip.configs.map(
      (entry) => entry.config,
    ),
    projectsByChecker,
    providerEdges,
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
    checkers,
    manifest,
    manifestPath,
    rootDir: config.rootDir,
  });
}
