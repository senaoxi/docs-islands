import type { ResolvedLiminaConfig } from '#config/runner';
import {
  collectImportsFromFile,
  resolveInternalImport,
} from '#core/import-graph/context';
import { normalizeAbsolutePath } from '#utils/path';
import path from 'pathe';
import { getAutoScopeFilePackageRoot } from './auto-checker-file-roots';
import { capabilityDiscoveryExtensions } from './generated/file-extensions';
import { resolveBuildGraphImportAnalysis } from './import-analysis-context';
import type {
  AutoScope,
  AutoScopeProject,
  PrepareGeneratedTsconfigGraphOptions,
} from './types';

type ImportAnalysis = ReturnType<typeof resolveBuildGraphImportAnalysis>;

function addFileScopeEntry(options: {
  entryConfigPath: string;
  entryPathsByFileName: Map<string, Set<string>>;
  fileName: string;
}): void {
  const entries =
    options.entryPathsByFileName.get(options.fileName) ?? new Set();
  entries.add(options.entryConfigPath);
  options.entryPathsByFileName.set(options.fileName, entries);
}

function indexProjectFiles(options: {
  entryConfigPath: string;
  entryPathsByFileName: Map<string, Set<string>>;
  project: AutoScopeProject;
}): void {
  for (const fileName of options.project.fileNames) {
    addFileScopeEntry({ ...options, fileName });
  }
}

function indexScopeFiles(options: {
  entryPathsByFileName: Map<string, Set<string>>;
  scope: AutoScope;
}): void {
  for (const project of options.scope.projects) {
    indexProjectFiles({
      entryConfigPath: options.scope.entryConfigPath,
      entryPathsByFileName: options.entryPathsByFileName,
      project,
    });
  }
}

function createEntryPathsByFileName(
  scopes: readonly AutoScope[],
): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();
  for (const scope of scopes) {
    indexScopeFiles({ entryPathsByFileName: index, scope });
  }
  return index;
}

function isAutoRelativeSpecifier(specifier: string): boolean {
  return /^\.{1,2}(?:\/|$)/u.test(specifier);
}

function addExtensionCandidates(
  candidates: Set<string>,
  basePath: string,
): void {
  for (const extension of capabilityDiscoveryExtensions) {
    candidates.add(normalizeAbsolutePath(`${basePath}${extension}`));
    candidates.add(
      normalizeAbsolutePath(path.join(basePath, `index${extension}`)),
    );
  }
}

function addRelativeImportCandidates(options: {
  candidates: Set<string>;
  containingFile: string;
  specifier: string;
}): void {
  const basePath = path.resolve(
    path.dirname(options.containingFile),
    options.specifier,
  );
  if (path.extname(basePath)) {
    options.candidates.add(normalizeAbsolutePath(basePath));
    return;
  }
  addExtensionCandidates(options.candidates, basePath);
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
  if (isAutoRelativeSpecifier(options.specifier)) {
    addRelativeImportCandidates({ ...options, candidates });
  }
  return [...candidates];
}

function addCandidateTargetEntries(options: {
  currentEntryPath: string;
  dependencies: Set<string>;
  targetEntries: Iterable<string>;
}): void {
  for (const targetEntryPath of options.targetEntries) {
    if (targetEntryPath !== options.currentEntryPath) {
      options.dependencies.add(targetEntryPath);
    }
  }
}

function addTargetScopeDependencies(options: {
  candidatePaths: readonly string[];
  currentEntryPath: string;
  dependencies: Set<string>;
  entryPathsByFileName: ReadonlyMap<string, Set<string>>;
}): void {
  for (const candidatePath of options.candidatePaths) {
    addCandidateTargetEntries({
      currentEntryPath: options.currentEntryPath,
      dependencies: options.dependencies,
      targetEntries: options.entryPathsByFileName.get(candidatePath) ?? [],
    });
  }
}

function addFileImportDependencies(options: {
  config: ResolvedLiminaConfig;
  currentEntryPath: string;
  dependencies: Set<string>;
  entryPathsByFileName: ReadonlyMap<string, Set<string>>;
  fileName: string;
  importAnalysis: ImportAnalysis;
  project: AutoScopeProject;
}): void {
  const importRecords = collectImportsFromFile(
    options.fileName,
    getAutoScopeFilePackageRoot(options.project, options.fileName),
    options.importAnalysis,
  );
  for (const importRecord of importRecords) {
    const resolvedFilePath = resolveInternalImport(
      importRecord.specifier,
      options.fileName,
      options.project.options,
      {
        ...options.project.context,
        configPath: options.project.configPath,
        resolverConfigPath: options.project.configPath,
      },
      options.importAnalysis,
    );
    addTargetScopeDependencies({
      candidatePaths: collectAutoImportCandidatePaths({
        containingFile: options.fileName,
        resolvedFilePath,
        specifier: importRecord.specifier,
      }),
      currentEntryPath: options.currentEntryPath,
      dependencies: options.dependencies,
      entryPathsByFileName: options.entryPathsByFileName,
    });
  }
}

function addProjectImportDependencies(options: {
  config: ResolvedLiminaConfig;
  currentEntryPath: string;
  dependencies: Set<string>;
  entryPathsByFileName: ReadonlyMap<string, Set<string>>;
  importAnalysis: ImportAnalysis;
  project: AutoScopeProject;
}): void {
  for (const fileName of options.project.fileNames) {
    addFileImportDependencies({ ...options, fileName });
  }
}

function isOtherKnownScope(options: {
  currentEntryPath: string;
  referencePath: string;
  scopeEntries: ReadonlySet<string>;
}): boolean {
  return (
    options.referencePath !== options.currentEntryPath &&
    options.scopeEntries.has(options.referencePath)
  );
}

function addSolutionReferenceDependencies(options: {
  currentEntryPath: string;
  dependencies: Set<string>;
  references: readonly string[];
  scopeEntries: ReadonlySet<string>;
}): void {
  for (const referencePath of options.references) {
    if (isOtherKnownScope({ ...options, referencePath })) {
      options.dependencies.add(referencePath);
    }
  }
}

function addSolutionDependencies(options: {
  dependencies: Set<string>;
  scope: AutoScope;
  scopeEntries: ReadonlySet<string>;
}): void {
  for (const references of options.scope.collection.solutionReferencesBySourcePath.values()) {
    addSolutionReferenceDependencies({
      currentEntryPath: options.scope.entryConfigPath,
      dependencies: options.dependencies,
      references,
      scopeEntries: options.scopeEntries,
    });
  }
}

function collectScopeDependencies(options: {
  config: ResolvedLiminaConfig;
  dependencies: Set<string>;
  entryPathsByFileName: ReadonlyMap<string, Set<string>>;
  importAnalysis: ImportAnalysis;
  scope: AutoScope;
  scopeEntries: ReadonlySet<string>;
}): void {
  addSolutionDependencies(options);
  for (const project of options.scope.projects) {
    addProjectImportDependencies({
      config: options.config,
      currentEntryPath: options.scope.entryConfigPath,
      dependencies: options.dependencies,
      entryPathsByFileName: options.entryPathsByFileName,
      importAnalysis: options.importAnalysis,
      project,
    });
  }
}

export function collectAutoScopeDependencies(options: {
  config: ResolvedLiminaConfig;
  importAnalysisContext?: PrepareGeneratedTsconfigGraphOptions['importAnalysisContext'];
  scopes: AutoScope[];
}): Map<string, Set<string>> {
  const dependenciesByEntry = new Map(
    options.scopes.map((scope) => [scope.entryConfigPath, new Set<string>()]),
  );
  const scopeEntries = new Set(
    options.scopes.map((scope) => scope.entryConfigPath),
  );
  const entryPathsByFileName = createEntryPathsByFileName(options.scopes);
  const importAnalysis = resolveBuildGraphImportAnalysis(options);
  for (const scope of options.scopes) {
    collectScopeDependencies({
      config: options.config,
      dependencies: dependenciesByEntry.get(scope.entryConfigPath)!,
      entryPathsByFileName,
      importAnalysis,
      scope,
      scopeEntries,
    });
  }
  return dependenciesByEntry;
}
