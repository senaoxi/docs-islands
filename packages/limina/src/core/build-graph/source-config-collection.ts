import {
  collectReferencePathInfosForConfig,
  isLiminaSolutionConfig,
  isOrdinarySourceTypecheckConfigPath,
  type JsonObject,
  validateUserMaintainedLiminaTsconfigMetadata,
} from '#core/tsconfig/actions';
import { uniqueCodeUnitSortedStrings as uniqueSortedStrings } from '#utils/collections';
import { normalizeAbsolutePath } from '#utils/path';
import { existsSync } from 'node:fs';
import {
  createProjectBuildModule,
  createSolutionBuildModule,
} from './build-modules';
import {
  addSourceReferenceConfigProblems,
  readOutputOptions,
} from './generated/config-readers';
import { createGeneratedGraphStructuredError } from './problems';
import { parseSourceConfig } from './source-config-analysis';
import type {
  CollectCheckerSourceConfigsOptions,
  CollectionContext,
  ConfigVisit,
  SourceConfigAnalysis,
} from './source-config-collection-types';
import {
  getInvalidSolutionOutputProblem,
  getOutsideRegionProblem,
} from './source-config-problems';
import type { CheckerSourceConfigCollection } from './types';

function rejectOutsideActivatedRegion(options: ConfigVisit): boolean {
  if (options.activatedRegions.isSourceConfigPath(options.sourceConfigPath)) {
    return false;
  }
  options.problems.push(getOutsideRegionProblem(options));
  return true;
}

function shouldSkipConfigVisit(options: ConfigVisit): boolean {
  if (rejectOutsideActivatedRegion(options)) {
    return true;
  }
  return options.seenConfigs.has(options.sourceConfigPath);
}

function registerSourceConfig(options: ConfigVisit): string {
  options.seenConfigs.add(options.sourceConfigPath);
  const packageRootDir = options.activatedRegions.findPackageForPath(
    options.sourceConfigPath,
  )!.directory;
  options.collection.packageRootBySourcePath.set(
    options.sourceConfigPath,
    packageRootDir,
  );
  return packageRootDir;
}

function isCollectibleReference(referencePath: string): boolean {
  return (
    existsSync(referencePath) &&
    isOrdinarySourceTypecheckConfigPath(referencePath)
  );
}

function collectSolutionReference(options: {
  context: CollectionContext;
  fromConfigPath: string;
  referencePath: string;
  referenceSourceConfigPaths: string[];
}): void {
  if (!isCollectibleReference(options.referencePath)) {
    return;
  }
  collectCheckerSourceConfigModules({
    ...options.context,
    referencedFromConfigPath: options.fromConfigPath,
    sourceConfigPath: options.referencePath,
  });
  if (
    options.context.collection.buildModulesBySourcePath.has(
      options.referencePath,
    )
  ) {
    options.referenceSourceConfigPaths.push(options.referencePath);
  }
}

function collectSolutionReferences(options: ConfigVisit): string[] {
  const references = collectReferencePathInfosForConfig(
    options.config.rootDir,
    options.sourceConfigPath,
  );
  options.problems.push(...references.problems);
  const sourceConfigPaths: string[] = [];
  for (const reference of references.references) {
    collectSolutionReference({
      context: options,
      fromConfigPath: options.sourceConfigPath,
      referencePath: reference.resolvedPath,
      referenceSourceConfigPaths: sourceConfigPaths,
    });
  }
  return uniqueSortedStrings(sourceConfigPaths);
}

function collectSolutionConfig(
  options: ConfigVisit,
  packageRootDir: string,
  configObject: JsonObject,
): void {
  const outputOptions = readOutputOptions(
    options.config,
    options.sourceConfigPath,
    configObject,
  );
  options.problems.push(...outputOptions.problems);
  if (outputOptions.outputs) {
    options.problems.push(getInvalidSolutionOutputProblem(options));
  }
  options.collection.solutionConfigPaths.add(options.sourceConfigPath);
  options.collection.buildModulesBySourcePath.set(
    options.sourceConfigPath,
    createSolutionBuildModule({
      checkerName: options.checkerName,
      packageRootDir,
      rootDir: options.config.rootDir,
      sourceConfigPath: options.sourceConfigPath,
    }),
  );
  options.collection.solutionReferencesBySourcePath.set(
    options.sourceConfigPath,
    collectSolutionReferences(options),
  );
}

function collectLeafConfig(
  options: ConfigVisit,
  packageRootDir: string,
  analysis: SourceConfigAnalysis,
): void {
  if (
    analysis.fileNames.length === 0 &&
    !Object.hasOwn(analysis.configObject, 'include')
  ) {
    return;
  }
  options.collection.projectConfigPaths.add(options.sourceConfigPath);
  options.collection.buildModulesBySourcePath.set(
    options.sourceConfigPath,
    createProjectBuildModule({
      checkerName: options.checkerName,
      packageRootDir,
      rootDir: options.config.rootDir,
      sourceConfigPath: options.sourceConfigPath,
    }),
  );
}

function collectValidConfig(options: {
  analysis: SourceConfigAnalysis;
  packageRootDir: string;
  visit: ConfigVisit;
}): void {
  if (
    isLiminaSolutionConfig({
      configObject: options.analysis.configObject,
      configPath: options.visit.sourceConfigPath,
      fileNames: options.analysis.fileNames,
    })
  ) {
    collectSolutionConfig(
      options.visit,
      options.packageRootDir,
      options.analysis.configObject,
    );
    return;
  }
  const outputOptions = readOutputOptions(
    options.visit.config,
    options.visit.sourceConfigPath,
    options.analysis.configObject,
  );
  options.visit.problems.push(...outputOptions.problems);
  collectLeafConfig(options.visit, options.packageRootDir, options.analysis);
}

function hasInvalidSourceReferences(
  configPath: string,
  analysis: SourceConfigAnalysis,
): boolean {
  return (
    Object.hasOwn(analysis.configObject, 'references') &&
    !isLiminaSolutionConfig({
      configObject: analysis.configObject,
      configPath,
      fileNames: analysis.fileNames,
    })
  );
}

export function collectCheckerSourceConfigModules(options: ConfigVisit): void {
  if (shouldSkipConfigVisit(options)) {
    return;
  }
  const packageRootDir = registerSourceConfig(options);
  collectParsedSourceConfig({ options, packageRootDir });
}

function collectParsedSourceConfig(options: {
  options: ConfigVisit;
  packageRootDir: string;
}): void {
  const analysis = parseSourceConfig(options.options);
  if (analysis === null) return;
  validateUserMaintainedLiminaTsconfigMetadata({
    configObject: analysis.configObject,
    configPath: options.options.sourceConfigPath,
  });
  if (hasInvalidSourceReferences(options.options.sourceConfigPath, analysis)) {
    addSourceReferenceConfigProblems({
      config: options.options.config,
      configObject: analysis.configObject,
      problems: options.options.problems,
      sourceConfigPath: options.options.sourceConfigPath,
    });
    return;
  }
  collectValidConfig({
    analysis,
    packageRootDir: options.packageRootDir,
    visit: options.options,
  });
}

export function createEmptySourceConfigCollection(
  entryConfigPaths: readonly string[],
): CheckerSourceConfigCollection {
  const normalizedEntries = uniqueSortedStrings(
    entryConfigPaths.map(normalizeAbsolutePath),
  );
  return {
    buildModulesBySourcePath: new Map(),
    entryConfigPaths: new Set(normalizedEntries),
    packageRootBySourcePath: new Map(),
    projectConfigPaths: new Set(),
    rootConfigPaths: [],
    solutionConfigPaths: new Set(),
    solutionReferencesBySourcePath: new Map(),
  };
}

export function collectCheckerSourceConfigs(
  options: CollectCheckerSourceConfigsOptions,
): CheckerSourceConfigCollection {
  const collection = createEmptySourceConfigCollection(
    options.entryConfigPaths,
  );
  const problems: string[] = [];
  const context: CollectionContext = {
    ...options,
    collection,
    problems,
    seenConfigs: new Set(),
  };
  for (const sourceConfigPath of collection.entryConfigPaths) {
    collectCheckerSourceConfigModules({ ...context, sourceConfigPath });
  }
  if (problems.length > 0) {
    throw createGeneratedGraphStructuredError({
      config: options.config,
      fallback: 'Failed to collect checker source configs.',
      problems,
    });
  }
  collection.rootConfigPaths = [...collection.entryConfigPaths].filter(
    (sourcePath) => collection.buildModulesBySourcePath.has(sourcePath),
  );
  return collection;
}
