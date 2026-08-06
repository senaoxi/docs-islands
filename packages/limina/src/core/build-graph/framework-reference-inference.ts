import {
  collectImportsFromFile,
  formatImportRecordLocation,
} from '#core/import-graph/context';
import {
  compareCodeUnits,
  uniqueCodeUnitSortedStrings,
} from '#utils/collections';
import { normalizeAbsolutePath, toRelativePath } from '#utils/path';
import path from 'pathe';
import { classifyImportRuntimeEvidence } from '../import-analysis/evidence';
import type { ReferenceImportContext } from './reference-import-types';
import type {
  GeneratedBuildModule,
  GeneratedProviderEdge,
  GovernedSourceUnit,
  SourceProject,
} from './types';

export interface GovernedBuildOwner {
  buildModule: GeneratedBuildModule;
  checkerName: string;
}

type FrameworkImportRecord = Parameters<typeof formatImportRecordLocation>[1];

interface FrameworkImportOptions {
  buildOwnersByConfigPath: ReadonlyMap<string, GovernedBuildOwner>;
  context: ReferenceImportContext;
  fileName: string;
  importRecord: FrameworkImportRecord;
  project: SourceProject;
  source: GovernedSourceUnit;
}

interface OwnedResolution {
  filePath: string;
  owners: string[];
}

function getResolvedFilePath(
  resolution: { resolvedFileName: string } | null | undefined,
): string | null {
  return resolution?.resolvedFileName ?? null;
}

function isFrameworkFile(filePath: string): boolean {
  return filePath.endsWith('.astro') || filePath.endsWith('.svelte');
}

function chooseTargetConfig(options: {
  importingConfigPath: string;
  ownerConfigPaths: readonly string[];
}): string | null {
  return (
    [...options.ownerConfigPaths]
      .filter((configPath) => configPath !== options.importingConfigPath)
      .sort(
        (left, right) =>
          path.dirname(right).length - path.dirname(left).length ||
          compareCodeUnits(left, right),
      )[0] ?? null
  );
}

function selectOwnedResolution(options: {
  context: ReferenceImportContext;
  oxcResolvedFilePath: string | null;
  typeScriptResolvedFilePath: string | null;
}): OwnedResolution | null {
  const candidates = uniqueCodeUnitSortedStrings(
    [options.typeScriptResolvedFilePath, options.oxcResolvedFilePath].filter(
      (filePath): filePath is string => filePath !== null,
    ),
  );
  return (
    candidates
      .map((candidate) => {
        const filePath = normalizeAbsolutePath(candidate);
        return {
          filePath,
          owners: options.context.fileOwnerLookup.get(filePath) ?? [],
        };
      })
      .find(({ owners }) => owners.length > 0) ?? null
  );
}

function createProviderEdge(options: {
  context: ReferenceImportContext;
  importRecord: FrameworkImportRecord;
  resolvedFilePath: string;
  source: GovernedSourceUnit;
  targetCheckerName: string;
  targetConfigPath: string;
}): GeneratedProviderEdge {
  return {
    file: formatImportRecordLocation(
      options.context.config.rootDir,
      options.importRecord,
    ),
    fromChecker: options.source.primaryCheckerName,
    fromConfigPath: options.source.configPath,
    importedSpecifier: options.importRecord.specifier,
    resolvedFilePath: options.resolvedFilePath,
    toChecker: options.targetCheckerName,
    toConfigPath: options.targetConfigPath,
  };
}

function recordProviderEdge(
  context: ReferenceImportContext,
  edge: GeneratedProviderEdge,
): void {
  const key = JSON.stringify([
    edge.fromChecker,
    edge.fromConfigPath,
    edge.toChecker,
    edge.toConfigPath,
    edge.file,
    edge.importedSpecifier,
    edge.resolvedFilePath,
  ]);
  context.providerEdgesByKey.set(key, edge);
}

function addMissingBuildOwnerProblem(options: {
  context: ReferenceImportContext;
  importRecord: FrameworkImportRecord;
  source: GovernedSourceUnit;
  targetConfigPath: string;
}): void {
  options.context.problems.push(
    [
      'Unable to schedule framework source dependency:',
      `  importing config: ${toRelativePath(options.context.config.rootDir, options.source.configPath)}`,
      `  file: ${formatImportRecordLocation(options.context.config.rootDir, options.importRecord)}`,
      `  target config: ${toRelativePath(options.context.config.rootDir, options.targetConfigPath)}`,
      '  reason: the imported governed source has no primary TypeScript build projection.',
    ].join('\n'),
  );
}

function resolveFrameworkImportResolution(
  options: FrameworkImportOptions,
): OwnedResolution | null {
  const pair = options.context.importAnalysis.resolveModulePair(
    options.importRecord.specifier,
    options.fileName,
    options.project.options,
    {
      ...options.project.context,
      configPath: options.source.configPath,
      resolverConfigPath: options.source.configPath,
    },
  );
  const evidence = classifyImportRuntimeEvidence({
    compilerOptions: options.project.options,
    containingFile: options.fileName,
    extensions: options.project.context.extensions,
    oxcResolvedFilePath: pair.oxc,
    specifier: options.importRecord.specifier,
    typeScriptResolution: pair.typescript,
  });
  if (evidence.classification === 'resource') return null;
  return selectOwnedResolution({
    context: options.context,
    oxcResolvedFilePath: pair.oxc,
    typeScriptResolvedFilePath: getResolvedFilePath(pair.typescript),
  });
}

function resolveFrameworkImportTarget(
  options: FrameworkImportOptions,
): { resolution: OwnedResolution; targetConfigPath: string } | null {
  const resolution = resolveFrameworkImportResolution(options);
  if (resolution === null) return null;
  const targetConfigPath = chooseTargetConfig({
    importingConfigPath: options.source.configPath,
    ownerConfigPaths: resolution.owners,
  });
  return targetConfigPath === null ? null : { resolution, targetConfigPath };
}

function processFrameworkImport(options: FrameworkImportOptions): void {
  const target = resolveFrameworkImportTarget(options);
  if (target === null) return;
  const { resolution, targetConfigPath } = target;
  const targetOwner = options.buildOwnersByConfigPath.get(targetConfigPath);
  if (targetOwner === undefined) {
    addMissingBuildOwnerProblem({ ...options, targetConfigPath });
    return;
  }
  options.source.frameworkSchedulingReferences.add(
    targetOwner.buildModule.path,
  );
  recordProviderEdge(
    options.context,
    createProviderEdge({
      ...options,
      resolvedFilePath: resolution.filePath,
      targetCheckerName: targetOwner.checkerName,
      targetConfigPath,
    }),
  );
}

function processFrameworkFile(
  options: Omit<FrameworkImportOptions, 'importRecord'>,
): void {
  const imports = collectImportsFromFile(
    options.fileName,
    options.context.config.rootDir,
    options.context.importAnalysis,
  );
  for (const importRecord of imports) {
    processFrameworkImport({ ...options, importRecord });
  }
}

function processFrameworkSource(options: {
  buildOwnersByConfigPath: ReadonlyMap<string, GovernedBuildOwner>;
  context: ReferenceImportContext;
  primaryProjectsByConfigPath: ReadonlyMap<string, SourceProject>;
  source: GovernedSourceUnit;
}): void {
  const project = options.primaryProjectsByConfigPath.get(
    options.source.configPath,
  );
  if (project === undefined) return;
  for (const fileName of options.source.ownedFileNames.filter(
    isFrameworkFile,
  )) {
    processFrameworkFile({ ...options, fileName, project });
  }
}

export function processFrameworkSchedulingReferences(options: {
  buildOwnersByConfigPath: ReadonlyMap<string, GovernedBuildOwner>;
  context: ReferenceImportContext;
  governedSources: readonly GovernedSourceUnit[];
  primaryProjectsByConfigPath: ReadonlyMap<string, SourceProject>;
}): void {
  for (const source of options.governedSources) {
    processFrameworkSource({ ...options, source });
  }
}
