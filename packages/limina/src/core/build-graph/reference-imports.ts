import { collectImportsFromFile } from '#core/import-graph/context';
import { shouldInferDeclarationReferenceFromImportRecord } from '../import-graph/declaration-reference-evidence';
import { getFrameworkFilePackageRoot } from './framework-file-root';
import type {
  ReferenceImportContext,
  ReferenceImportOptions,
} from './reference-import-types';
import { addMappedReference } from './reference-recording';
import {
  addMissingOwnedDeclarationProviderProblem,
  createReferenceTarget,
  isValidReferenceTarget,
  resolveUsableProvider,
} from './reference-target-resolution';
import type { SourceProject } from './types';

export type { ReferenceImportContext } from './reference-import-types';

function addFallbackProviderProblem(options: {
  initialProblemCount: number;
  reference: ReferenceImportOptions;
}): void {
  if (options.reference.context.problems.length !== options.initialProblemCount)
    return;
  addMissingOwnedDeclarationProviderProblem(options.reference);
}

function processReferenceImport(options: ReferenceImportOptions): void {
  const initialProblemCount = options.context.problems.length;
  const provider = resolveUsableProvider(options);
  if (!provider) {
    addFallbackProviderProblem({ initialProblemCount, reference: options });
    return;
  }
  const target = createReferenceTarget({ base: options, provider });
  if (isValidReferenceTarget(options.project.configPath, target)) {
    addMappedReference({ base: options, target });
  }
}

function processProjectFileImports(options: {
  context: ReferenceImportContext;
  fileName: string;
  project: SourceProject;
}): void {
  const imports = collectImportsFromFile(
    options.fileName,
    getFrameworkFilePackageRoot({
      activatedRegions: options.context.activatedRegions,
      fallbackPackageRootDir: options.project.packageRootDir,
      fileName: options.fileName,
    }),
    options.context.importAnalysis,
  );
  for (const importRecord of imports) {
    if (shouldInferDeclarationReferenceFromImportRecord(importRecord)) {
      processReferenceImport({ ...options, importRecord });
    }
  }
}

export function processProjectReferenceImports(options: {
  context: ReferenceImportContext;
  project: SourceProject;
}): void {
  for (const fileName of options.project.ownedFileNames) {
    processProjectFileImports({ ...options, fileName });
  }
}
