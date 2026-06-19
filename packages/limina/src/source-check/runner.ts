import { existsSync } from 'node:fs';
import path from 'pathe';
import rawPicomatch from 'picomatch';
import {
  type CheckerProjectParseContext,
  normalizeExtensions,
} from '../checkers';
import { getActiveCheckers, type ResolvedLiminaConfig } from '../config/runner';
import { createLiminaCore, type LiminaCore } from '../core';
import {
  collectGeneratedSourceConfigPaths,
  type GeneratedTsconfigGraphResult,
} from '../core/build-graph/generated/runner';
import {
  collectImportsFromFile,
  formatImportRecordLocation,
  getTypecheckConfigPath,
  type ImportRecord,
  isDtsProjectConfig,
  isRelativeSpecifier,
  parseProject,
  type ProjectInfo,
  resolveInternalImport,
} from '../core/import-graph/context';
import {
  collectWorkspaceDependencyDeclarations,
  createWorkspaceDependencyKey,
  findPackageImportMatch,
  isBarePackageSpecifier,
  isDependencyAuthorized,
  isPackageImportSpecifier,
  isUrlOrDataOrFileSpecifier,
  isVirtualModuleSpecifier,
  type WorkspaceDependencyDeclaration,
} from '../core/packages/authority';
import {
  classifyResolvedPackageTarget,
  findOwnerForFile,
  type NearestPackageInfo,
} from '../core/packages/owners';
import {
  collectSourceGraphProjectExtensions,
  getRawReferencePaths,
  isOrdinaryTypecheckConfigPath,
  readJsonConfig,
} from '../core/tsconfig/actions';
import {
  getPackageRootSpecifier,
  type PackageOwner,
  type WorkspacePackage,
} from '../core/workspace/actions';
import type { LiminaFlowReporter } from '../flow';
import { isNodeBuiltinSpecifier } from '../graph-check/rules';
import { SourceLogger } from '../logger';
import {
  isPathInsideDirectory,
  normalizeAbsolutePath,
  normalizeSlashes,
  toRelativePath,
} from '../utils/path';
import {
  collectKnipSourceIssues,
  type KnipCliRunner,
  type KnipOwnerProject,
  type KnipSourceIssues,
} from './knip';
import {
  collectSourceKnipWorkspaceConfigs,
  createKnipSourceAnalysisGroups,
} from './knip-routing';
import {
  collectManifestSourceEntryPatterns,
  collectOwnerSourceModuleSets,
  collectUnusedDependencyIgnore,
  collectUnusedModuleConfig,
  createOwnerSourceFileKey,
  createPackageDependencyIssueKey,
  type OwnerSourceModuleSet,
} from './knip-unused';
import {
  formatSourceCheckHumanReport,
  SOURCE_ISSUE_CODES,
  type SourceCheckIssue,
  type SourceIssueReportOptions,
} from './report';
import {
  isInvalidWorkspacePattern,
  normalizeWorkspacePattern,
  toOwnerRelativeEntryPattern,
} from './workspace-patterns';

export interface RunSourceCheckOptions {
  clearScreen?: boolean;
  core?: LiminaCore;
  flow?: LiminaFlowReporter;
  flowDepth?: number;
  generatedGraphProvider?: () => Promise<GeneratedTsconfigGraphResult>;
  knipRunner?: KnipCliRunner;
  report?: SourceIssueReportOptions;
}

interface SourceProjectEntry {
  fileNames: string[];
  project: ProjectInfo;
}

interface TsconfigOwnershipIgnoreRule {
  matcher: (filePath: string) => boolean;
  owner: PackageOwner;
}

interface TsconfigOwnershipResolution {
  matchedOwnerConfigPaths: string[];
  searchedTsconfigPaths: string[];
  status: 'matched' | 'missing' | 'multiple' | 'unmatched';
  tsconfigPath: string | null;
}

const picomatch = rawPicomatch as unknown as (
  pattern: string,
  options?: { dot?: boolean; posixSlashes?: boolean },
) => (value: string) => boolean;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function formatUnknownValue(value: unknown): string {
  if (value === undefined) {
    return 'undefined';
  }

  return JSON.stringify(value);
}

function addProjectOwnerProblems(options: {
  config: ResolvedLiminaConfig;
  configPath: string;
  fileNames: string[];
  owners: PackageOwner[];
  problems: string[];
  role: 'declaration leaf' | 'typecheck companion';
}): void {
  const ownerPaths = new Map<string, PackageOwner>();
  const missingOwnerFiles: string[] = [];

  for (const fileName of options.fileNames) {
    const owner = findOwnerForFile(fileName, options.owners);

    if (!owner) {
      missingOwnerFiles.push(fileName);
      continue;
    }

    ownerPaths.set(owner.packageJsonPath, owner);
  }

  if (missingOwnerFiles.length > 0) {
    options.problems.push(
      [
        'Source file has no package owner:',
        `  ${options.role}: ${toRelativePath(options.config.rootDir, options.configPath)}`,
        '  files:',
        ...missingOwnerFiles
          .slice(0, 10)
          .map(
            (fileName) =>
              `    - ${toRelativePath(options.config.rootDir, fileName)}`,
          ),
        ...(missingOwnerFiles.length > 10
          ? [`    ...and ${missingOwnerFiles.length - 10} more`]
          : []),
        '  reason: every source file checked by Limina must be governed by the nearest package.json owner.',
      ].join('\n'),
    );
  }

  if (ownerPaths.size <= 1) {
    return;
  }

  options.problems.push(
    [
      'Tsconfig source file set mixes package owners:',
      `  ${options.role}: ${toRelativePath(options.config.rootDir, options.configPath)}`,
      '  owners:',
      ...[...ownerPaths.values()].map(
        (owner) =>
          `    - ${toRelativePath(options.config.rootDir, owner.packageJsonPath)}`,
      ),
      '  reason: non-aggregator tsconfig leaves and their companion typecheck configs must stay within one nearest package.json owner scope.',
    ].join('\n'),
  );
}

function addRelativeImportOwnerProblem(options: {
  config: ResolvedLiminaConfig;
  importRecord: ImportRecord;
  owner: PackageOwner;
  problems: string[];
  resolvedFilePath: string;
  targetOwner: PackageOwner | null;
}): void {
  options.problems.push(
    [
      'Relative import escapes package owner scope:',
      `  package owner: ${toRelativePath(options.config.rootDir, options.owner.packageJsonPath)}`,
      `  file: ${formatImportRecordLocation(options.config.rootDir, options.importRecord)}`,
      `  imported specifier: ${options.importRecord.specifier}`,
      `  resolved file: ${toRelativePath(options.config.rootDir, options.resolvedFilePath)}`,
      ...(options.targetOwner
        ? [
            `  target owner: ${toRelativePath(options.config.rootDir, options.targetOwner.packageJsonPath)}`,
          ]
        : []),
      '  reason: relative source imports must not cross the nearest package.json owner boundary.',
    ].join('\n'),
  );
}

function addPackageImportAuthorizationProblem(options: {
  config: ResolvedLiminaConfig;
  dependencySpecifier?: string;
  importRecord: ImportRecord;
  owner: PackageOwner;
  packageName: string;
  problems: string[];
  workspacePackage: WorkspacePackage | null;
}): void {
  options.problems.push(
    [
      'Unauthorized bare package import:',
      `  package owner: ${toRelativePath(options.config.rootDir, options.owner.packageJsonPath)}`,
      `  file: ${formatImportRecordLocation(options.config.rootDir, options.importRecord)}`,
      `  imported specifier: ${options.importRecord.specifier}`,
      `  package: ${options.packageName}`,
      ...(options.dependencySpecifier
        ? [`  resolved dependency specifier: ${options.dependencySpecifier}`]
        : []),
      ...(options.workspacePackage
        ? [`  workspace package: ${options.workspacePackage.name}`]
        : []),
      '  reason: source imports must be authorized by the nearest package.json dependencies, devDependencies, peerDependencies, or optionalDependencies.',
    ].join('\n'),
  );
}

function addResolvedPackageWithoutNameProblem(options: {
  config: ResolvedLiminaConfig;
  importRecord: ImportRecord;
  owner: PackageOwner;
  packageInfo: NearestPackageInfo;
  problems: string[];
}): void {
  options.problems.push(
    [
      'Resolved package import has no package name:',
      `  package owner: ${toRelativePath(options.config.rootDir, options.owner.packageJsonPath)}`,
      `  file: ${formatImportRecordLocation(options.config.rootDir, options.importRecord)}`,
      `  imported specifier: ${options.importRecord.specifier}`,
      `  resolved package.json: ${toRelativePath(options.config.rootDir, options.packageInfo.packageJsonPath)}`,
      '  reason: source imports can only be authorized against a named package.json dependency.',
    ].join('\n'),
  );
}

function addPackageImportOtherOwnerProblem(options: {
  config: ResolvedLiminaConfig;
  importRecord: ImportRecord;
  owner: PackageOwner;
  problems: string[];
  targetOwner: PackageOwner;
  workspacePackage: WorkspacePackage | null;
}): void {
  options.problems.push(
    [
      'Package import resolves to another package owner:',
      `  package owner: ${toRelativePath(options.config.rootDir, options.owner.packageJsonPath)}`,
      `  file: ${formatImportRecordLocation(options.config.rootDir, options.importRecord)}`,
      `  imported specifier: ${options.importRecord.specifier}`,
      `  target owner: ${toRelativePath(options.config.rootDir, options.targetOwner.packageJsonPath)}`,
      ...(options.workspacePackage
        ? [`  workspace package: ${options.workspacePackage.name}`]
        : []),
      '  reason: #... package imports must not resolve to modules governed by another package.json owner.',
    ].join('\n'),
  );
}

function addPackageImportProblem(options: {
  config: ResolvedLiminaConfig;
  importRecord: ImportRecord;
  owner: PackageOwner;
  owners: PackageOwner[];
  packages: WorkspacePackage[];
  problems: string[];
  resolvedFilePath: string | null;
}): void {
  const match = findPackageImportMatch(
    options.owner.manifest.imports,
    options.importRecord.specifier,
  );

  if (!match) {
    options.problems.push(
      [
        'Unauthorized package import specifier:',
        `  package owner: ${toRelativePath(options.config.rootDir, options.owner.packageJsonPath)}`,
        `  file: ${formatImportRecordLocation(options.config.rootDir, options.importRecord)}`,
        `  imported specifier: ${options.importRecord.specifier}`,
        '  reason: #... package imports must match the nearest package.json imports field.',
      ].join('\n'),
    );
    return;
  }

  if (!options.resolvedFilePath) {
    options.problems.push(
      [
        'Unresolved package import specifier:',
        `  package owner: ${toRelativePath(options.config.rootDir, options.owner.packageJsonPath)}`,
        `  file: ${formatImportRecordLocation(options.config.rootDir, options.importRecord)}`,
        `  imported specifier: ${options.importRecord.specifier}`,
        '  reason: matched #... package imports must resolve to a file within the same package owner scope.',
      ].join('\n'),
    );
    return;
  }

  const target = classifyResolvedPackageTarget({
    owner: options.owner,
    owners: options.owners,
    packages: options.packages,
    resolvedFilePath: options.resolvedFilePath,
  });

  if (target.kind === 'current-owner') {
    return;
  }

  if (target.kind === 'other-owner') {
    addPackageImportOtherOwnerProblem({
      config: options.config,
      importRecord: options.importRecord,
      owner: options.owner,
      problems: options.problems,
      targetOwner: target.targetOwner,
      workspacePackage: target.workspacePackage,
    });
    return;
  }

  if (target.kind === 'artifact-package') {
    if (!target.packageInfo.name) {
      addResolvedPackageWithoutNameProblem({
        config: options.config,
        importRecord: options.importRecord,
        owner: options.owner,
        packageInfo: target.packageInfo,
        problems: options.problems,
      });
      return;
    }

    if (
      isDependencyAuthorized(options.owner.manifest, target.packageInfo.name)
    ) {
      return;
    }

    addPackageImportAuthorizationProblem({
      config: options.config,
      dependencySpecifier: target.packageInfo.name,
      importRecord: options.importRecord,
      owner: options.owner,
      packageName: target.packageInfo.name,
      problems: options.problems,
      workspacePackage: null,
    });
    return;
  }

  options.problems.push(
    [
      'Package import resolves outside package ownership:',
      `  package owner: ${toRelativePath(options.config.rootDir, options.owner.packageJsonPath)}`,
      `  file: ${formatImportRecordLocation(options.config.rootDir, options.importRecord)}`,
      `  imported specifier: ${options.importRecord.specifier}`,
      `  resolved file: ${toRelativePath(options.config.rootDir, options.resolvedFilePath)}`,
      '  reason: #... package imports must resolve to the current package owner or to a named artifact package dependency.',
    ].join('\n'),
  );
}

function isEmptyFilesArray(value: unknown): boolean {
  return Array.isArray(value) && value.length === 0;
}

function isReferenceOnlySolutionConfig(
  configObject: Record<string, unknown>,
): boolean {
  return (
    Object.hasOwn(configObject, 'references') &&
    !Object.hasOwn(configObject, 'include') &&
    (!Object.hasOwn(configObject, 'files') ||
      isEmptyFilesArray(configObject.files))
  );
}

function shouldSkipGovernedTsconfig(
  configObject: Record<string, unknown>,
): boolean {
  return isReferenceOnlySolutionConfig(configObject);
}

function getSourceGovernanceContext(
  config: ResolvedLiminaConfig,
  generatedGraph?: GeneratedTsconfigGraphResult,
): CheckerProjectParseContext {
  const checkers = generatedGraph?.checkers ?? getActiveCheckers(config);

  return {
    checkerPresets: [...new Set(checkers.map((checker) => checker.preset))],
    extensions: normalizeExtensions(
      checkers.flatMap((checker) => checker.extensions),
    ),
  };
}

function collectBareTsconfigPathCandidates(options: {
  filePath: string;
  rootDir: string;
}): string[] {
  const candidates: string[] = [];
  let currentDir = normalizeAbsolutePath(path.dirname(options.filePath));
  const rootDir = normalizeAbsolutePath(options.rootDir);

  while (isPathInsideDirectory(currentDir, rootDir)) {
    const candidate = normalizeAbsolutePath(
      path.join(currentDir, 'tsconfig.json'),
    );

    if (existsSync(candidate)) {
      candidates.push(candidate);
    }

    if (currentDir === rootDir) {
      break;
    }

    const parentDir = normalizeAbsolutePath(path.dirname(currentDir));

    if (parentDir === currentDir) {
      break;
    }

    currentDir = parentDir;
  }

  return candidates;
}

function collectReachableOrdinaryTypecheckConfigPaths(options: {
  config: ResolvedLiminaConfig;
  rootConfigPath: string;
}): string[] {
  const queue = getRawReferencePaths(options.config, options.rootConfigPath);
  const reachablePaths: string[] = [];
  const seen = new Set<string>();

  for (const configPath of queue) {
    const normalizedConfigPath = normalizeAbsolutePath(configPath);

    if (seen.has(normalizedConfigPath)) {
      continue;
    }

    seen.add(normalizedConfigPath);

    if (
      !existsSync(normalizedConfigPath) ||
      !isOrdinaryTypecheckConfigPath(normalizedConfigPath)
    ) {
      continue;
    }

    reachablePaths.push(normalizedConfigPath);
    queue.push(...getRawReferencePaths(options.config, normalizedConfigPath));
  }

  return reachablePaths;
}

function collectTsconfigOwnershipMatches(options: {
  config: ResolvedLiminaConfig;
  fileName: string;
  getProjectFileSet: (configPath: string) => Set<string>;
  rootConfigPath: string;
}): string[] {
  if (options.getProjectFileSet(options.rootConfigPath).has(options.fileName)) {
    return [options.rootConfigPath];
  }

  return collectReachableOrdinaryTypecheckConfigPaths({
    config: options.config,
    rootConfigPath: options.rootConfigPath,
  }).filter((configPath) =>
    options.getProjectFileSet(configPath).has(options.fileName),
  );
}

function resolveTsconfigOwnership(options: {
  config: ResolvedLiminaConfig;
  fileName: string;
  getProjectFileSet: (configPath: string) => Set<string>;
}): TsconfigOwnershipResolution {
  const candidatePaths = collectBareTsconfigPathCandidates({
    filePath: options.fileName,
    rootDir: options.config.rootDir,
  });
  const searchedTsconfigPaths: string[] = [];

  if (candidatePaths.length === 0) {
    return {
      matchedOwnerConfigPaths: [],
      searchedTsconfigPaths,
      status: 'missing',
      tsconfigPath: null,
    };
  }

  for (const candidatePath of candidatePaths) {
    searchedTsconfigPaths.push(candidatePath);

    const matchedOwnerConfigPaths = collectTsconfigOwnershipMatches({
      config: options.config,
      fileName: options.fileName,
      getProjectFileSet: options.getProjectFileSet,
      rootConfigPath: candidatePath,
    });

    if (matchedOwnerConfigPaths.length === 1) {
      return {
        matchedOwnerConfigPaths,
        searchedTsconfigPaths,
        status: 'matched',
        tsconfigPath: candidatePath,
      };
    }

    if (matchedOwnerConfigPaths.length > 1) {
      return {
        matchedOwnerConfigPaths,
        searchedTsconfigPaths,
        status: 'multiple',
        tsconfigPath: candidatePath,
      };
    }
  }

  return {
    matchedOwnerConfigPaths: [],
    searchedTsconfigPaths,
    status: 'unmatched',
    tsconfigPath: searchedTsconfigPaths.at(-1) ?? null,
  };
}

function formatConfigPathList(
  config: ResolvedLiminaConfig,
  configPaths: string[],
): string[] {
  if (configPaths.length === 0) {
    return ['    (none)'];
  }

  return configPaths
    .sort((left, right) =>
      toRelativePath(config.rootDir, left).localeCompare(
        toRelativePath(config.rootDir, right),
      ),
    )
    .map((configPath) => `    - ${toRelativePath(config.rootDir, configPath)}`);
}

function addNearestTsconfigOwnershipProblem(options: {
  config: ResolvedLiminaConfig;
  fileName: string;
  matchedOwnerConfigPaths: string[];
  problems: string[];
  reason: string;
  searchedTsconfigPaths: string[];
  tsconfigPath: string | null;
}): void {
  options.problems.push(
    [
      'Tsconfig search cannot determine module owner:',
      `  file: ${toRelativePath(options.config.rootDir, options.fileName)}`,
      ...(options.tsconfigPath
        ? [
            `  resolver tsconfig: ${toRelativePath(options.config.rootDir, options.tsconfigPath)}`,
          ]
        : []),
      '  searched tsconfigs:',
      ...formatConfigPathList(options.config, options.searchedTsconfigPaths),
      '  matched owner tsconfigs:',
      ...formatConfigPathList(options.config, options.matchedOwnerConfigPaths),
      `  reason: ${options.reason}`,
      '  fix: make one tsconfig.json between the module directory and workspace root include the module, or make its ordinary typecheck references reach exactly one owner tsconfig. If this module is intentionally loaded outside that shape, add a scoped source.tsconfigOwnership.ignore entry with a reason.',
    ].join('\n'),
  );
}

function collectTsconfigOwnershipIgnoreRules(options: {
  config: ResolvedLiminaConfig;
  owners: PackageOwner[];
  problems: string[];
}): TsconfigOwnershipIgnoreRule[] {
  const rawConfig = options.config.source?.tsconfigOwnership;
  const rules: TsconfigOwnershipIgnoreRule[] = [];

  if (rawConfig === undefined) {
    return rules;
  }

  if (!isPlainRecord(rawConfig)) {
    options.problems.push(
      [
        'Invalid tsconfig ownership config:',
        '  field: source.tsconfigOwnership',
        `  value: ${formatUnknownValue(rawConfig)}`,
        '  reason: tsconfigOwnership must be an object.',
      ].join('\n'),
    );
    return rules;
  }

  const rawIgnore = rawConfig.ignore;

  if (rawIgnore === undefined) {
    return rules;
  }

  if (!Array.isArray(rawIgnore)) {
    options.problems.push(
      [
        'Invalid tsconfig ownership ignore config:',
        '  field: source.tsconfigOwnership.ignore',
        `  value: ${formatUnknownValue(rawIgnore)}`,
        '  reason: ignore must be an array.',
      ].join('\n'),
    );
    return rules;
  }

  const ownerByName = new Map(
    options.owners
      .filter((owner): owner is PackageOwner & { name: string } =>
        Boolean(owner.name),
      )
      .map((owner) => [owner.name, owner]),
  );

  for (const [index, entry] of rawIgnore.entries()) {
    const field = `source.tsconfigOwnership.ignore[${index}]`;

    if (!isPlainRecord(entry)) {
      options.problems.push(
        [
          'Invalid tsconfig ownership ignore config:',
          `  field: ${field}`,
          `  value: ${formatUnknownValue(entry)}`,
          '  reason: ignore entries must be objects with non-empty owner, files, and reason fields.',
        ].join('\n'),
      );
      continue;
    }

    const ownerValue = entry.owner;
    const filesValue = entry.files;
    const reasonValue = entry.reason;

    if (typeof ownerValue !== 'string' || ownerValue.trim().length === 0) {
      options.problems.push(
        [
          'Invalid tsconfig ownership ignore config:',
          `  field: ${field}.owner`,
          `  value: ${formatUnknownValue(ownerValue)}`,
          '  reason: owner must be a non-empty package owner name.',
        ].join('\n'),
      );
      continue;
    }

    if (!Array.isArray(filesValue) || filesValue.length === 0) {
      options.problems.push(
        [
          'Invalid tsconfig ownership ignore config:',
          `  field: ${field}.files`,
          `  value: ${formatUnknownValue(filesValue)}`,
          '  reason: files must be a non-empty array of workspace-root-relative glob patterns.',
        ].join('\n'),
      );
      continue;
    }

    if (typeof reasonValue !== 'string' || reasonValue.trim().length === 0) {
      options.problems.push(
        [
          'Invalid tsconfig ownership ignore config:',
          `  field: ${field}.reason`,
          `  value: ${formatUnknownValue(reasonValue)}`,
          '  reason: reason must be a non-empty string.',
        ].join('\n'),
      );
      continue;
    }

    const ownerName = ownerValue.trim();
    const owner = ownerByName.get(ownerName);

    if (!owner) {
      options.problems.push(
        [
          'Invalid tsconfig ownership ignore config:',
          `  field: ${field}.owner`,
          `  owner: ${ownerName}`,
          '  reason: owner must name an existing package owner with a package.json name.',
        ].join('\n'),
      );
      continue;
    }

    for (const [fileIndex, fileValue] of filesValue.entries()) {
      const fileField = `${field}.files[${fileIndex}]`;

      if (typeof fileValue !== 'string' || fileValue.trim().length === 0) {
        options.problems.push(
          [
            'Invalid tsconfig ownership ignore config:',
            `  field: ${fileField}`,
            `  value: ${formatUnknownValue(fileValue)}`,
            '  reason: file patterns must be non-empty strings.',
          ].join('\n'),
        );
        continue;
      }

      const pattern = normalizeWorkspacePattern(fileValue);

      if (isInvalidWorkspacePattern(pattern)) {
        options.problems.push(
          [
            'Invalid tsconfig ownership ignore config:',
            `  field: ${fileField}`,
            `  file: ${pattern}`,
            '  reason: file patterns must be positive workspace-root-relative globs inside the workspace root.',
          ].join('\n'),
        );
        continue;
      }

      if (
        !toOwnerRelativeEntryPattern({
          config: options.config,
          owner,
          pattern,
        })
      ) {
        options.problems.push(
          [
            'Invalid tsconfig ownership ignore config:',
            `  field: ${fileField}`,
            `  owner: ${ownerName}`,
            `  file: ${pattern}`,
            '  reason: file patterns must stay inside the owner package directory.',
          ].join('\n'),
        );
        continue;
      }

      rules.push({
        matcher: picomatch(pattern, {
          dot: true,
          posixSlashes: true,
        }),
        owner,
      });
    }
  }

  return rules;
}

function isIgnoredTsconfigOwnershipModule(options: {
  config: ResolvedLiminaConfig;
  fileName: string;
  fileOwner: PackageOwner | null;
  ignoreRules: TsconfigOwnershipIgnoreRule[];
}): boolean {
  if (!options.fileOwner) {
    return false;
  }

  const fileOwner = options.fileOwner;
  const relativeFilePath = normalizeSlashes(
    toRelativePath(options.config.rootDir, options.fileName),
  );

  return options.ignoreRules.some(
    (rule) =>
      rule.owner.packageJsonPath === fileOwner.packageJsonPath &&
      isPathInsideDirectory(options.fileName, rule.owner.directory) &&
      rule.matcher(relativeFilePath),
  );
}

async function addTsconfigGovernanceProblems(options: {
  config: ResolvedLiminaConfig;
  configPaths: string[];
  generatedGraph: GeneratedTsconfigGraphResult;
  owners: PackageOwner[];
  problems: string[];
}): Promise<void> {
  const configPaths = options.configPaths;
  const context = getSourceGovernanceContext(
    options.config,
    options.generatedGraph,
  );
  const governanceUnitsByFile = new Map<
    string,
    Map<string, { configPaths: string[]; owner: PackageOwner }>
  >();
  const tsconfigOwnershipIgnoreRules = collectTsconfigOwnershipIgnoreRules({
    config: options.config,
    owners: options.owners,
    problems: options.problems,
  });
  const projectFileSetsByConfigPath = new Map<string, Set<string>>();
  const getProjectFileSet = (configPath: string): Set<string> => {
    const normalizedConfigPath = normalizeAbsolutePath(configPath);
    const cached = projectFileSetsByConfigPath.get(normalizedConfigPath);

    if (cached) {
      return cached;
    }

    const fileSet = new Set(
      parseProject(options.config, normalizedConfigPath, context).fileNames,
    );

    projectFileSetsByConfigPath.set(normalizedConfigPath, fileSet);
    return fileSet;
  };

  for (const configPath of configPaths) {
    const configObject = readJsonConfig(options.config, configPath);

    if (shouldSkipGovernedTsconfig(configObject)) {
      continue;
    }

    const owner = findOwnerForFile(configPath, options.owners);

    if (!owner) {
      options.problems.push(
        [
          'Tsconfig has no package owner:',
          `  config: ${toRelativePath(options.config.rootDir, configPath)}`,
          '  reason: every tsconfig*.json that governs modules must be assigned to its nearest package.json.',
        ].join('\n'),
      );
      continue;
    }

    const project = parseProject(options.config, configPath, context);
    const unitKey = configPath;
    projectFileSetsByConfigPath.set(configPath, new Set(project.fileNames));

    for (const fileName of project.fileNames) {
      const fileOwner = findOwnerForFile(fileName, options.owners);

      if (fileOwner?.packageJsonPath !== owner.packageJsonPath) {
        options.problems.push(
          [
            'Tsconfig source file set crosses package owner scope:',
            `  config: ${toRelativePath(options.config.rootDir, configPath)}`,
            `  package owner: ${toRelativePath(options.config.rootDir, owner.packageJsonPath)}`,
            `  file: ${toRelativePath(options.config.rootDir, fileName)}`,
            ...(fileOwner
              ? [
                  `  file owner: ${toRelativePath(options.config.rootDir, fileOwner.packageJsonPath)}`,
                ]
              : []),
            '  reason: every package-owned tsconfig*.json must govern only modules owned by the same nearest package.json.',
          ].join('\n'),
        );
      }

      const governanceUnits =
        governanceUnitsByFile.get(fileName) ??
        new Map<string, { configPaths: string[]; owner: PackageOwner }>();
      const governanceUnit = governanceUnits.get(unitKey) ?? {
        configPaths: [],
        owner,
      };

      governanceUnit.configPaths.push(configPath);
      governanceUnits.set(unitKey, governanceUnit);
      governanceUnitsByFile.set(fileName, governanceUnits);
    }
  }

  for (const [fileName, governanceUnits] of [
    ...governanceUnitsByFile.entries(),
  ].sort(([left], [right]) =>
    toRelativePath(options.config.rootDir, left).localeCompare(
      toRelativePath(options.config.rootDir, right),
    ),
  )) {
    const fileOwner = findOwnerForFile(fileName, options.owners);

    if (
      !isIgnoredTsconfigOwnershipModule({
        config: options.config,
        fileName,
        fileOwner,
        ignoreRules: tsconfigOwnershipIgnoreRules,
      })
    ) {
      const ownershipResolution = resolveTsconfigOwnership({
        config: options.config,
        fileName,
        getProjectFileSet,
      });

      if (ownershipResolution.status === 'missing') {
        addNearestTsconfigOwnershipProblem({
          config: options.config,
          fileName,
          matchedOwnerConfigPaths: ownershipResolution.matchedOwnerConfigPaths,
          problems: options.problems,
          reason:
            'no tsconfig.json was found between the module directory and the workspace root.',
          searchedTsconfigPaths: ownershipResolution.searchedTsconfigPaths,
          tsconfigPath: ownershipResolution.tsconfigPath,
        });
      } else if (ownershipResolution.status !== 'matched') {
        addNearestTsconfigOwnershipProblem({
          config: options.config,
          fileName,
          matchedOwnerConfigPaths: ownershipResolution.matchedOwnerConfigPaths,
          problems: options.problems,
          reason:
            ownershipResolution.status === 'unmatched'
              ? 'no tsconfig.json between the module directory and workspace root includes the module or reaches one ordinary typecheck config that includes it.'
              : 'the first matching tsconfig.json reaches multiple ordinary typecheck configs that include the module.',
          searchedTsconfigPaths: ownershipResolution.searchedTsconfigPaths,
          tsconfigPath: ownershipResolution.tsconfigPath,
        });
      }
    }

    if (governanceUnits.size <= 1) {
      continue;
    }

    const uniqueOwners = [
      ...new Set(
        [...governanceUnits.values()].map((unit) => unit.owner.packageJsonPath),
      ),
    ];

    options.problems.push(
      [
        'Source module belongs to multiple tsconfig governance units:',
        `  file: ${toRelativePath(options.config.rootDir, fileName)}`,
        '  configs:',
        ...[...governanceUnits.values()]
          .flatMap((unit) => unit.configPaths)
          .sort((left, right) =>
            toRelativePath(options.config.rootDir, left).localeCompare(
              toRelativePath(options.config.rootDir, right),
            ),
          )
          .map(
            (configPath) =>
              `    - ${toRelativePath(options.config.rootDir, configPath)}`,
          ),
        '  reason: a module may belong to only one ordinary typecheck tsconfig*.json governance unit.',
      ].join('\n'),
    );

    if (uniqueOwners.length <= 1) {
      continue;
    }

    options.problems.push(
      [
        'Source module belongs to multiple package owners:',
        `  file: ${toRelativePath(options.config.rootDir, fileName)}`,
        '  package owners:',
        ...uniqueOwners
          .sort((left, right) =>
            toRelativePath(options.config.rootDir, left).localeCompare(
              toRelativePath(options.config.rootDir, right),
            ),
          )
          .map(
            (packageJsonPath) =>
              `    - ${toRelativePath(options.config.rootDir, packageJsonPath)}`,
          ),
        '  reason: source ownership prohibits overlap between module sets governed by different package.json files.',
      ].join('\n'),
    );
  }
}

function createKnipOwnerProjects(options: {
  entryPatternsByOwnerName: Map<string, string[]>;
  ignoredModuleKeys: Set<string>;
  includeFiles: boolean;
  ownerModuleSets: OwnerSourceModuleSet[];
}): KnipOwnerProject[] {
  return options.ownerModuleSets.map((moduleSet) => ({
    directory: moduleSet.owner.directory,
    entryFiles: [
      ...new Set([
        ...(options.entryPatternsByOwnerName.get(
          moduleSet.owner.name as string,
        ) ?? []),
        ...collectManifestSourceEntryPatterns(moduleSet),
      ]),
    ].sort(),
    ignoreFiles: moduleSet.files
      .filter((filePath) =>
        options.ignoredModuleKeys.has(
          createOwnerSourceFileKey(moduleSet.owner.name as string, filePath),
        ),
      )
      .map((filePath) => toRelativePath(moduleSet.owner.directory, filePath))
      .sort(),
    projectFiles: options.includeFiles
      ? moduleSet.files
          .map((filePath) =>
            toRelativePath(moduleSet.owner.directory, filePath),
          )
          .sort()
      : [],
    virtualEntrySourceFiles: moduleSet.checkUnusedFiles ? [] : moduleSet.files,
  }));
}

function addUnusedDependencyProblems(options: {
  declarations: WorkspaceDependencyDeclaration[];
  ignoredDependencies: Set<string>;
  issues: SourceCheckIssue[];
  knipIssues: KnipSourceIssues;
}): void {
  const unusedDependencyIssueKeys = new Set(
    options.knipIssues.unusedWorkspaceDependencies.map((issue) =>
      createPackageDependencyIssueKey(
        issue.packageJsonPath,
        issue.dependencyName,
      ),
    ),
  );

  for (const declaration of options.declarations) {
    const dependencyKey = createWorkspaceDependencyKey(
      declaration.importer.name,
      declaration.dependencyName,
    );

    if (options.ignoredDependencies.has(dependencyKey)) {
      continue;
    }

    if (
      !unusedDependencyIssueKeys.has(
        createPackageDependencyIssueKey(
          declaration.packageJsonPath,
          declaration.dependencyName,
        ),
      )
    ) {
      continue;
    }

    options.issues.push({
      code: SOURCE_ISSUE_CODES.unusedWorkspaceDependency,
      dependencyName: declaration.dependencyName,
      ownerName: declaration.importer.name,
      packageJsonPath: declaration.packageJsonPath,
      sectionName: declaration.sectionName,
      specifier: declaration.specifier,
    });
  }
}

function addUnusedModuleProblems(options: {
  config: ResolvedLiminaConfig;
  ignoredModuleKeys: Set<string>;
  issues: SourceCheckIssue[];
  knipIssues: KnipSourceIssues;
  ownerModuleSets: OwnerSourceModuleSet[];
}): void {
  const moduleSetByFilePath = new Map<string, OwnerSourceModuleSet>();
  const reportedKeys = new Set<string>();

  for (const moduleSet of options.ownerModuleSets) {
    if (!moduleSet.checkUnusedFiles) {
      continue;
    }

    for (const filePath of moduleSet.files) {
      moduleSetByFilePath.set(filePath, moduleSet);
    }
  }

  for (const issue of options.knipIssues.unusedSourceFiles) {
    const filePath = normalizeAbsolutePath(issue.filePath);
    const moduleSet = moduleSetByFilePath.get(filePath);

    if (!moduleSet?.owner.name) {
      continue;
    }

    const issueKey = createOwnerSourceFileKey(moduleSet.owner.name, filePath);

    if (options.ignoredModuleKeys.has(issueKey) || reportedKeys.has(issueKey)) {
      continue;
    }

    reportedKeys.add(issueKey);

    options.issues.push({
      code: SOURCE_ISSUE_CODES.unusedModule,
      filePath,
      ownerDirectory: moduleSet.owner.directory,
      ownerName: moduleSet.owner.name,
      packageJsonPath: moduleSet.owner.packageJsonPath,
    });
  }
}

async function addKnipBackedSourceProblems(options: {
  config: ResolvedLiminaConfig;
  generatedGraph: GeneratedTsconfigGraphResult;
  knipRunner?: KnipCliRunner;
  ownerModuleSets: OwnerSourceModuleSet[];
  problems: string[];
  sourceIssues: SourceCheckIssue[];
  workspacePackages: WorkspacePackage[];
}): Promise<void> {
  if (options.config.source?.knip === false) {
    return;
  }

  const declarations = collectWorkspaceDependencyDeclarations(
    options.workspacePackages,
  );
  const knipWorkspaceConfigs = collectSourceKnipWorkspaceConfigs({
    config: options.config,
    problems: options.problems,
    workspacePackages: options.workspacePackages,
  });

  for (const diagnostic of options.generatedGraph.generatedKnipDiagnostics) {
    options.problems.push(
      [
        'Unsupported package build script for generated Knip tsconfig:',
        `  package: ${diagnostic.packageName ?? '<unnamed>'}`,
        `  package manifest: ${toRelativePath(options.config.rootDir, diagnostic.packageJsonPath)}`,
        ...(diagnostic.scriptName
          ? [`  script: ${diagnostic.scriptName}`]
          : []),
        ...(diagnostic.command ? [`  command: ${diagnostic.command}`] : []),
        `  reason: ${diagnostic.reason}`,
      ].join('\n'),
    );
  }

  const ignoredDependencies = collectUnusedDependencyIgnore({
    declarations,
    knipWorkspaceConfigs,
    problems: options.problems,
    workspacePackages: options.workspacePackages,
  });
  const unusedModuleConfig = collectUnusedModuleConfig({
    config: options.config,
    knipWorkspaceConfigs,
    ownerModuleSets: options.ownerModuleSets,
    problems: options.problems,
  });
  const requiredWorkspaceNames = new Set([
    ...declarations.map((declaration) => declaration.importer.name),
    ...options.ownerModuleSets.flatMap((moduleSet) =>
      moduleSet.owner.name ? [moduleSet.owner.name] : [],
    ),
    ...knipWorkspaceConfigs.keys(),
  ]);
  const analysisGroups = createKnipSourceAnalysisGroups({
    config: options.config,
    generatedGraph: options.generatedGraph,
    requiredWorkspaceNames,
    workspacePackages: options.workspacePackages,
  });

  if (options.problems.length > 0) {
    return;
  }

  const includeFiles = options.ownerModuleSets.length > 0;
  const needsDependencyAnalysis =
    options.workspacePackages.length > 0 && declarations.length > 0;
  const ownerProjects = createKnipOwnerProjects({
    entryPatternsByOwnerName: unusedModuleConfig.entryPatternsByOwnerName,
    ignoredModuleKeys: unusedModuleConfig.ignoredKeys,
    includeFiles,
    ownerModuleSets: options.ownerModuleSets,
  });

  if (!needsDependencyAnalysis && !includeFiles) {
    return;
  }

  const knipIssues = await collectKnipSourceIssues({
    analysisGroups,
    config: options.config,
    ignoredKeys: ignoredDependencies,
    includeFiles,
    knipRunner: options.knipRunner,
    ownerProjects: needsDependencyAnalysis || includeFiles ? ownerProjects : [],
    workspacePackages: options.workspacePackages,
  });

  addUnusedDependencyProblems({
    declarations,
    ignoredDependencies,
    issues: options.sourceIssues,
    knipIssues,
  });

  if (includeFiles) {
    addUnusedModuleProblems({
      config: options.config,
      ignoredModuleKeys: unusedModuleConfig.ignoredKeys,
      issues: options.sourceIssues,
      knipIssues,
      ownerModuleSets: options.ownerModuleSets,
    });
  }
}

async function createSourceProjectEntries(
  core: LiminaCore,
  projects: ProjectInfo[],
): Promise<SourceProjectEntry[]> {
  return Promise.all(
    projects
      .filter((project) => isDtsProjectConfig(project.configPath))
      .map(async (project) => {
        const typecheckConfigPath = getTypecheckConfigPath(project.configPath);
        const fileNames = new Set(project.fileNames);

        if (existsSync(typecheckConfigPath)) {
          for (const fileName of (
            await core.tsconfig.getProject(typecheckConfigPath, project)
          ).fileNames) {
            fileNames.add(fileName);
          }
        }

        return {
          fileNames: [...fileNames].sort(),
          project,
        };
      }),
  );
}

export async function runSourceCheckImpl(
  config: ResolvedLiminaConfig,
  options: {
    core?: LiminaCore;
    generatedGraphProvider?: () => Promise<GeneratedTsconfigGraphResult>;
    knipRunner?: KnipCliRunner;
    logSuccess?: boolean;
    report?: SourceIssueReportOptions;
  } = {},
): Promise<boolean> {
  const core = options.core ?? createLiminaCore(config);
  const generatedGraph = options.generatedGraphProvider
    ? await options.generatedGraphProvider()
    : await core.buildGraph.getGraph();
  const graphRoute = collectSourceGraphProjectExtensions(
    config,
    generatedGraph,
  );
  const projectPaths = [...graphRoute.projectExtensionsByPath.keys()].sort();
  const projects = await Promise.all(
    projectPaths.map((projectPath) =>
      core.tsconfig.getProject(
        projectPath,
        graphRoute.projectContextsByPath.get(projectPath),
      ),
    ),
  );
  const sourceProjectEntries = await createSourceProjectEntries(core, projects);
  const packages = await core.workspace.getPackages();
  const packageOwners = await core.workspace.getPackageOwners();
  const ownerModuleSets = collectOwnerSourceModuleSets({
    owners: packageOwners,
    sourceProjectEntries,
  });
  const importAnalysis = core.imports.context;
  const problems: string[] = [...graphRoute.problems];
  const sourceIssues: SourceCheckIssue[] = [];

  await addTsconfigGovernanceProblems({
    config,
    configPaths: collectGeneratedSourceConfigPaths(generatedGraph),
    generatedGraph,
    owners: packageOwners,
    problems,
  });
  await addKnipBackedSourceProblems({
    config,
    generatedGraph,
    knipRunner: options.knipRunner,
    ownerModuleSets,
    problems,
    sourceIssues,
    workspacePackages: packages,
  });

  for (const project of projects) {
    if (project.labelProblem) {
      problems.push(project.labelProblem);
    }

    if (!isDtsProjectConfig(project.configPath)) {
      continue;
    }

    addProjectOwnerProblems({
      config,
      configPath: project.configPath,
      fileNames: project.fileNames,
      owners: packageOwners,
      problems,
      role: 'declaration leaf',
    });

    const typecheckConfigPath = getTypecheckConfigPath(project.configPath);

    if (existsSync(typecheckConfigPath)) {
      addProjectOwnerProblems({
        config,
        configPath: typecheckConfigPath,
        fileNames: (
          await core.tsconfig.getProject(typecheckConfigPath, project)
        ).fileNames,
        owners: packageOwners,
        problems,
        role: 'typecheck companion',
      });
    }
  }

  for (const { fileNames, project } of sourceProjectEntries) {
    for (const filePath of fileNames) {
      const owner = findOwnerForFile(filePath, packageOwners);

      if (!owner) {
        continue;
      }

      for (const importRecord of collectImportsFromFile(
        filePath,
        config.rootDir,
        importAnalysis,
      )) {
        const resolvedFilePath = resolveInternalImport(
          importRecord.specifier,
          filePath,
          project.options,
          project,
          importAnalysis,
        );

        if (isRelativeSpecifier(importRecord.specifier)) {
          if (!resolvedFilePath) {
            continue;
          }

          const targetOwner = findOwnerForFile(resolvedFilePath, packageOwners);

          if (targetOwner?.packageJsonPath !== owner.packageJsonPath) {
            addRelativeImportOwnerProblem({
              config,
              importRecord,
              owner,
              problems,
              resolvedFilePath,
              targetOwner,
            });
          }

          continue;
        }

        if (isPackageImportSpecifier(importRecord.specifier)) {
          addPackageImportProblem({
            config,
            importRecord,
            owner,
            owners: packageOwners,
            packages,
            problems,
            resolvedFilePath,
          });
          continue;
        }

        if (
          isUrlOrDataOrFileSpecifier(importRecord.specifier) ||
          isVirtualModuleSpecifier(importRecord.specifier)
        ) {
          continue;
        }

        if (!isBarePackageSpecifier(importRecord.specifier)) {
          continue;
        }

        if (isNodeBuiltinSpecifier(importRecord.specifier)) {
          continue;
        }

        const fallbackPackageName = getPackageRootSpecifier(
          importRecord.specifier,
        );

        if (owner.name === fallbackPackageName) {
          continue;
        }

        if (resolvedFilePath) {
          const target = classifyResolvedPackageTarget({
            owner,
            owners: packageOwners,
            packages,
            resolvedFilePath,
          });

          if (target.kind === 'current-owner') {
            continue;
          }

          if (target.kind === 'other-owner') {
            const packageName =
              target.packageInfo.name ?? target.targetOwner.name;

            if (!packageName) {
              addResolvedPackageWithoutNameProblem({
                config,
                importRecord,
                owner,
                packageInfo: target.packageInfo,
                problems,
              });
              continue;
            }

            if (!isDependencyAuthorized(owner.manifest, packageName)) {
              addPackageImportAuthorizationProblem({
                config,
                importRecord,
                owner,
                packageName,
                problems,
                workspacePackage: target.workspacePackage,
              });
              continue;
            }

            continue;
          }

          if (target.kind === 'artifact-package') {
            if (!target.packageInfo.name) {
              addResolvedPackageWithoutNameProblem({
                config,
                importRecord,
                owner,
                packageInfo: target.packageInfo,
                problems,
              });
              continue;
            }

            if (
              isDependencyAuthorized(owner.manifest, target.packageInfo.name)
            ) {
              continue;
            }

            addPackageImportAuthorizationProblem({
              config,
              importRecord,
              owner,
              packageName: target.packageInfo.name,
              problems,
              workspacePackage: null,
            });
            continue;
          }
        }

        const workspacePackage =
          packages.find(
            (candidate) => candidate.name === fallbackPackageName,
          ) ?? null;

        if (isDependencyAuthorized(owner.manifest, fallbackPackageName)) {
          continue;
        }

        addPackageImportAuthorizationProblem({
          config,
          importRecord,
          owner,
          packageName: fallbackPackageName,
          problems,
          workspacePackage,
        });
      }
    }
  }

  if (problems.length > 0 || sourceIssues.length > 0) {
    SourceLogger.error(
      formatSourceCheckHumanReport({
        config,
        issues: sourceIssues,
        legacyProblems: problems,
        report: options.report,
      }),
    );
    return false;
  }

  if (options.logSuccess ?? true) {
    SourceLogger.success(
      `Checked ${sourceProjectEntries.length} source project owners; package scopes are valid.`,
    );
  }

  return true;
}
