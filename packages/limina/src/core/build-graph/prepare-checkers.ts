import type { CheckerProjectConfigCache } from '#checkers';
import type { ResolvedLiminaConfig } from '#config/runner';
import type { WorkspaceRegionPathIndex } from '../workspace/validated-context';
import { getGeneratedCheckerEntryPath } from './generated/paths';
import { createGovernedSourceUnit } from './governed-sources';
import { collectCheckerSourceConfigs } from './source-config-collection';
import { createSolutionProject, createSourceProject } from './source-projects';
import type {
  GovernedSourceUnit,
  PreparedCheckerGraph,
  ResolvedCheckerEntrySelection,
  SolutionProject,
  SourceProject,
} from './types';

function getPackageRootDir(options: {
  activatedRegions: WorkspaceRegionPathIndex;
  sourceConfigPath: string;
}): string {
  return options.activatedRegions.findPackageForPath(options.sourceConfigPath)!
    .directory;
}

function createCheckerSolutions(options: {
  activatedRegions: WorkspaceRegionPathIndex;
  collection: PreparedCheckerGraph['collection'];
  config: ResolvedLiminaConfig;
  projectConfigCache?: CheckerProjectConfigCache;
  selection: ResolvedCheckerEntrySelection;
}): ReturnType<typeof createSolutionProject>[] {
  return [...options.collection.solutionConfigPaths]
    .sort()
    .map((sourceConfigPath) =>
      createSolutionProject({
        checkerName: options.selection.checker.name,
        collection: options.collection,
        config: options.config,
        packageRootDir: getPackageRootDir({
          activatedRegions: options.activatedRegions,
          sourceConfigPath,
        }),
        sourceConfigPath,
      }),
    );
}

function getRootBuildPaths(
  collection: PreparedCheckerGraph['collection'],
): string[] {
  return collection.rootConfigPaths
    .map((sourceConfigPath) =>
      collection.buildModulesBySourcePath.get(sourceConfigPath),
    )
    .filter((module) => Boolean(module))
    .map((module) => module!.path);
}

function applyBuildProjections(options: {
  collection: PreparedCheckerGraph['collection'];
  governedSources: GovernedSourceUnit[];
}): void {
  for (const unit of options.governedSources) {
    const projection = unit.buildProjection;
    options.collection.buildModulesBySourcePath.set(
      unit.configPath,
      'buildConfigPath' in projection
        ? { kind: 'solution', path: projection.buildConfigPath }
        : { kind: 'project', path: projection.dtsConfigPath },
    );
  }
}

function getDeclarationProjects(options: {
  governedSources: GovernedSourceUnit[];
  primaryProjects: SourceProject[];
}): SourceProject[] {
  const declarationUnitsByConfigPath = new Map(
    options.governedSources.flatMap((unit) =>
      'dtsConfigPath' in unit.buildProjection
        ? [[unit.configPath, unit] as const]
        : [],
    ),
  );
  return options.primaryProjects.flatMap((project) => {
    const unit = declarationUnitsByConfigPath.get(project.configPath);
    return unit === undefined
      ? []
      : [{ ...project, fileNames: [...unit.declarationFileNames] }];
  });
}

function createProjectionSolutions(
  governedSources: GovernedSourceUnit[],
): SolutionProject[] {
  return governedSources.flatMap((unit) => {
    const projection = unit.buildProjection;
    if (!('buildConfigPath' in projection)) return [];
    return [
      {
        buildConfigPath: projection.buildConfigPath,
        checkerName: unit.primaryCheckerName,
        configPath: unit.configPath,
        packageRootDir: unit.packageRootDir,
        references: new Set([
          ...('dtsConfigPath' in projection ? [projection.dtsConfigPath] : []),
          ...unit.frameworkSchedulingReferences,
        ]),
      },
    ];
  });
}

export function prepareCheckerGraph(options: {
  activatedRegions: WorkspaceRegionPathIndex;
  config: ResolvedLiminaConfig;
  projectConfigCache?: CheckerProjectConfigCache;
  selection: ResolvedCheckerEntrySelection;
}): PreparedCheckerGraph {
  const collection = collectCheckerSourceConfigs({
    activatedRegions: options.activatedRegions,
    checkerName: options.selection.checker.name,
    checkerPreset: options.selection.checker.preset,
    config: options.config,
    entryConfigPaths: options.selection.selection.effectiveEntryPaths,
    projectConfigCache: options.projectConfigCache,
  });
  const primaryProjects = [...collection.projectConfigPaths]
    .sort()
    .map((sourceConfigPath) =>
      createSourceProject({
        checkerName: options.selection.checker.name,
        checkerPreset: options.selection.checker.preset,
        config: options.config,
        packageRootDir: getPackageRootDir({
          activatedRegions: options.activatedRegions,
          sourceConfigPath,
        }),
        projectConfigCache: options.projectConfigCache,
        sourceConfigPath,
      }),
    );
  const governedSources = primaryProjects.map((project) =>
    createGovernedSourceUnit({
      config: options.config,
      project,
      projectConfigCache: options.projectConfigCache,
    }),
  );
  applyBuildProjections({ collection, governedSources });
  const projects = getDeclarationProjects({
    governedSources,
    primaryProjects,
  });
  return {
    checker: options.selection.checker,
    collection,
    entryPath: getGeneratedCheckerEntryPath({
      checkerName: options.selection.checker.name,
      rootDir: options.config.rootDir,
    }),
    governedSources,
    primaryProjects,
    projects,
    rootBuildPaths: getRootBuildPaths(collection),
    solutions: [
      ...createCheckerSolutions({
        activatedRegions: options.activatedRegions,
        collection,
        config: options.config,
        selection: options.selection,
      }),
      ...createProjectionSolutions(governedSources),
    ],
  };
}

export function prepareCheckerGraphs(options: {
  activatedRegions: WorkspaceRegionPathIndex;
  config: ResolvedLiminaConfig;
  projectConfigCache?: CheckerProjectConfigCache;
  selections: ResolvedCheckerEntrySelection[];
}): PreparedCheckerGraph[] {
  return options.selections.map((selection) =>
    prepareCheckerGraph({ ...options, selection }),
  );
}
