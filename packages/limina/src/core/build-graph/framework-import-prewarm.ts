import type { ResolvedLiminaConfig } from '#config/runner';
import type { ImportAnalysisContext } from '#core/import-graph/context';
import { compareCodeUnits } from '#utils/collections';
import type { WorkspaceRegionPathIndex } from '../workspace/validated-context';
import { getAutoScopeFilePackageRoot } from './auto-checker-file-roots';
import { getFrameworkFilePackageRoot } from './framework-file-root';
import type { GeneratedGraphPreparationState } from './prepare-state';
import { createGeneratedGraphStructuredError } from './problems';
import type { AutoScope } from './types';

interface FrameworkImportPrewarmRequest {
  filePath: string;
  packageRootDir: string;
}

function isFrameworkFile(filePath: string): boolean {
  return filePath.endsWith('.astro') || filePath.endsWith('.svelte');
}

function compareRequests(
  left: FrameworkImportPrewarmRequest,
  right: FrameworkImportPrewarmRequest,
): number {
  return (
    compareCodeUnits(left.filePath, right.filePath) ||
    compareCodeUnits(left.packageRootDir, right.packageRootDir)
  );
}

function registerGovernedSourcePrewarmRequests(options: {
  activatedRegions: WorkspaceRegionPathIndex;
  requestsByKey: Map<string, FrameworkImportPrewarmRequest>;
  source: {
    ownedFileNames: readonly string[];
    packageRootDir: string;
  };
}): void {
  for (const filePath of options.source.ownedFileNames.filter(
    isFrameworkFile,
  )) {
    const request = {
      filePath,
      packageRootDir: getFrameworkFilePackageRoot({
        activatedRegions: options.activatedRegions,
        fallbackPackageRootDir: options.source.packageRootDir,
        fileName: filePath,
      }),
    };
    options.requestsByKey.set(JSON.stringify(request), request);
  }
}

function collectFrameworkImportPrewarmRequests(
  state: GeneratedGraphPreparationState,
  activatedRegions: WorkspaceRegionPathIndex,
): FrameworkImportPrewarmRequest[] {
  const requestsByKey = new Map<string, FrameworkImportPrewarmRequest>();
  for (const sources of state.governedSourcesByChecker.values()) {
    for (const source of sources) {
      registerGovernedSourcePrewarmRequests({
        activatedRegions,
        requestsByKey,
        source,
      });
    }
  }
  return [...requestsByKey.values()].sort(compareRequests);
}

function collectAutoFrameworkImportPrewarmRequests(
  scopes: readonly AutoScope[],
): FrameworkImportPrewarmRequest[] {
  const requestsByKey = new Map<string, FrameworkImportPrewarmRequest>();
  const requests = scopes.flatMap((scope) =>
    scope.projects.flatMap((project) =>
      [
        ...project.filePartition.astroFiles,
        ...project.filePartition.svelteFiles,
      ].map((filePath) => ({
        filePath,
        packageRootDir: getAutoScopeFilePackageRoot(project, filePath),
      })),
    ),
  );
  for (const request of requests) {
    requestsByKey.set(JSON.stringify(request), request);
  }
  return [...requestsByKey.values()].sort(compareRequests);
}

function formatThrownError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

async function prewarmFrameworkImports(options: {
  config: ResolvedLiminaConfig;
  importAnalysis: ImportAnalysisContext;
  requests: readonly FrameworkImportPrewarmRequest[];
}): Promise<void> {
  const prewarmImportsFromFile = options.importAnalysis.prewarmImportsFromFile;
  if (prewarmImportsFromFile === undefined) return;
  const results = await Promise.allSettled(
    options.requests.map((request) =>
      prewarmImportsFromFile(request.filePath, request.packageRootDir),
    ),
  );
  const problems = results.flatMap((result) =>
    result.status === 'rejected' ? [formatThrownError(result.reason)] : [],
  );
  if (problems.length > 0) {
    throw createGeneratedGraphStructuredError({
      config: options.config,
      fallback: 'Failed to prewarm framework import analysis.',
      problems,
    });
  }
}

export async function prewarmAutoFrameworkImports(options: {
  config: ResolvedLiminaConfig;
  importAnalysis: ImportAnalysisContext;
  scopes: readonly AutoScope[];
}): Promise<void> {
  await prewarmFrameworkImports({
    config: options.config,
    importAnalysis: options.importAnalysis,
    requests: collectAutoFrameworkImportPrewarmRequests(options.scopes),
  });
}

export async function prewarmGeneratedFrameworkImports(options: {
  activatedRegions: WorkspaceRegionPathIndex;
  config: ResolvedLiminaConfig;
  importAnalysis: ImportAnalysisContext;
  state: GeneratedGraphPreparationState;
}): Promise<void> {
  await prewarmFrameworkImports({
    config: options.config,
    importAnalysis: options.importAnalysis,
    requests: collectFrameworkImportPrewarmRequests(
      options.state,
      options.activatedRegions,
    ),
  });
}
