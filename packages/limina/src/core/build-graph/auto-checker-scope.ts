import {
  type CheckerProjectConfigCache,
  type CheckerProjectParseContext,
  parseCheckerProjectConfigForContext,
} from '#checkers';
import type { ResolvedLiminaConfig } from '#config/runner';
import { compareCodeUnits } from '#utils/collections';
import { normalizeAbsolutePath, toRelativePath } from '#utils/path';
import type { WorkspaceRegionPathIndex } from '../workspace/validated-context';
import { inspectFrameworkIntent } from './framework-intent';
import {
  capabilityDiscoveryExtensions,
  getFileExtension,
} from './generated/file-extensions';
import { createGeneratedGraphStructuredError } from './problems';
import {
  createAutoFrameworkEvidence,
  type FrameworkIntentHint,
  partitionSourceFiles,
} from './source-capabilities';
import {
  collectCheckerSourceConfigModules,
  createEmptySourceConfigCollection,
} from './source-config-collection';
import type { CollectAutoSourceConfigModulesOptions } from './source-config-collection-types';
import type { AutoCheckerPreset, AutoScope, AutoScopeProject } from './types';

function createAutoScopeProject(options: {
  config: ResolvedLiminaConfig;
  configPath: string;
  projectConfigCache?: CheckerProjectConfigCache;
}): AutoScopeProject {
  const context: CheckerProjectParseContext = {
    checkerPresets: ['tsc'],
    extensions: capabilityDiscoveryExtensions,
  };
  const parsed = parseCheckerProjectConfigForContext({
    cache: options.projectConfigCache,
    configPath: options.configPath,
    context,
    projectRootDir: options.config.rootDir,
  });
  return {
    configPath: options.configPath,
    context,
    fileNames: parsed.fileNames.map(normalizeAbsolutePath).sort(),
    filePartition: partitionSourceFiles(parsed.fileNames),
    options: parsed.options,
  };
}

function setAutoRootConfigPaths(scope: AutoScope): void {
  scope.collection.rootConfigPaths =
    scope.collection.buildModulesBySourcePath.has(scope.entryConfigPath)
      ? [scope.entryConfigPath]
      : [];
}

function collectAutoSourceConfigModules(
  options: CollectAutoSourceConfigModulesOptions,
): void {
  collectCheckerSourceConfigModules({
    activatedRegions: options.activatedRegions,
    checkerName: '__auto__',
    checkerPreset: 'tsc',
    collection: options.collection,
    config: options.config,
    discoveryExtensions: options.discoveryExtensions,
    problems: options.problems,
    projectConfigCache: options.projectConfigCache,
    seenConfigs: new Set(),
    sourceConfigPath: options.entryConfigPath,
    sourceConfigInspector: options.sourceConfigInspector,
  });
}

function createAutoScope(options: {
  activatedRegions: WorkspaceRegionPathIndex;
  config: ResolvedLiminaConfig;
  entryConfigPath: string;
  projectConfigCache?: CheckerProjectConfigCache;
}): AutoScope {
  const collection = createEmptySourceConfigCollection([
    options.entryConfigPath,
  ]);
  const problems: string[] = [];
  const intentHintsByConfigPath = new Map<string, FrameworkIntentHint[]>();
  collectAutoSourceConfigModules({
    activatedRegions: options.activatedRegions,
    collection,
    config: options.config,
    discoveryExtensions: capabilityDiscoveryExtensions,
    entryConfigPath: options.entryConfigPath,
    problems,
    projectConfigCache: options.projectConfigCache,
    sourceConfigInspector: ({ configObject, sourceConfigPath }) => {
      const inspection = inspectFrameworkIntent({
        config: options.config,
        configObject,
        configPath: sourceConfigPath,
      });
      intentHintsByConfigPath.set(sourceConfigPath, inspection.intentHints);
      problems.push(...inspection.problems);
    },
  });
  if (problems.length > 0) {
    throw createGeneratedGraphStructuredError({
      config: options.config,
      fallback: 'Failed to collect auto checker scope.',
      problems,
    });
  }

  const projects = [...collection.projectConfigPaths]
    .sort(compareCodeUnits)
    .map((configPath) =>
      createAutoScopeProject({
        config: options.config,
        configPath,
        projectConfigCache: options.projectConfigCache,
      }),
    );
  const projectByConfigPath = new Map(
    projects.map((project) => [project.configPath, project]),
  );
  const scope: AutoScope = {
    collection,
    entryConfigPath: options.entryConfigPath,
    frameworkEvidence: [...intentHintsByConfigPath.entries()]
      .sort(([left], [right]) => compareCodeUnits(left, right))
      .map(([configPath, intentHints]) =>
        createAutoFrameworkEvidence({
          configPath,
          fileNames: projectByConfigPath.get(configPath)?.fileNames,
          intentHints,
        }),
      ),
    projects,
  };
  setAutoRootConfigPaths(scope);
  return scope;
}

export function collectAutoScope(options: {
  activatedRegions: WorkspaceRegionPathIndex;
  config: ResolvedLiminaConfig;
  entryConfigPath: string;
  projectConfigCache?: CheckerProjectConfigCache;
}): AutoScope | null {
  const scope = createAutoScope(options);
  return scope.collection.projectConfigPaths.size > 0 ? scope : null;
}

function createUnsupportedExtensionProblem(options: {
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

function projectNeedsVue(options: {
  config: ResolvedLiminaConfig;
  entryConfigPath: string;
  project: AutoScopeProject;
}): boolean {
  const unsupportedFileName = [
    ...options.project.filePartition.astroFiles,
    ...options.project.filePartition.svelteFiles,
  ].sort(compareCodeUnits)[0];
  if (unsupportedFileName) {
    throw createGeneratedGraphStructuredError({
      config: options.config,
      fallback: 'Failed to classify auto checker scope.',
      problems: [
        createUnsupportedExtensionProblem({
          config: options.config,
          entryConfigPath: options.entryConfigPath,
          extension: getFileExtension(unsupportedFileName),
          fileName: unsupportedFileName,
        }),
      ],
    });
  }
  return options.project.filePartition.vueFiles.length > 0;
}

export function classifyAutoScope(options: {
  config: ResolvedLiminaConfig;
  scope: AutoScope;
}): AutoCheckerPreset {
  const needsVue = options.scope.projects.some((project) =>
    projectNeedsVue({
      config: options.config,
      entryConfigPath: options.scope.entryConfigPath,
      project,
    }),
  );
  return needsVue ? 'vue-tsc' : 'tsc';
}
