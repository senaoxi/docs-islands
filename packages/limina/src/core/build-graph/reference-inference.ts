import type { ResolvedLiminaConfig } from '#config/runner';
import { compareCodeUnits } from '#utils/collections';
import { createManagedOutputDeclarationLookup } from '../import-graph/managed-output-provider';
import type { WorkspaceRegionPathIndex } from '../workspace/validated-context';
import {
  type GovernedBuildOwner,
  processFrameworkSchedulingReferences,
} from './framework-reference-inference';
import { addImplicitProjectReferences } from './implicit-references';
import { resolveBuildGraphImportAnalysis } from './import-analysis-context';
import {
  createDtsProjectsBySourcePath,
  createManagedOutputProjectContexts,
} from './project-indexes';
import {
  processProjectReferenceImports,
  type ReferenceImportContext,
} from './reference-imports';
import type {
  GeneratedBuildModule,
  GeneratedProviderEdge,
  GovernedSourceUnit,
  InferredProjectReferenceCollection,
  PrepareGeneratedTsconfigGraphOptions,
  SourceProject,
} from './types';

function createOwnerLookup(
  governedSources: readonly GovernedSourceUnit[],
): Map<string, string[]> {
  const ownersByFile = new Map<string, string[]>();
  for (const unit of governedSources) {
    addGovernedSourceOwners(ownersByFile, unit);
  }
  return ownersByFile;
}

function addGovernedSourceOwners(
  ownersByFile: Map<string, string[]>,
  unit: GovernedSourceUnit,
): void {
  for (const fileName of unit.ownedFileNames) {
    const owners = ownersByFile.get(fileName) ?? [];
    owners.push(unit.configPath);
    ownersByFile.set(fileName, owners);
  }
}

function createPrimaryProjectsByConfigPath(
  projects: readonly SourceProject[],
): Map<string, SourceProject> {
  return new Map(projects.map((project) => [project.configPath, project]));
}

function createGovernedBuildOwners(options: {
  governedSources: readonly GovernedSourceUnit[];
  sourceToBuildByChecker: ReadonlyMap<
    string,
    ReadonlyMap<string, GeneratedBuildModule>
  >;
}): Map<string, GovernedBuildOwner> {
  const owners = new Map<string, GovernedBuildOwner>();
  for (const unit of options.governedSources) {
    const buildModule = getGovernedBuildModule({ ...options, unit });
    if (buildModule === undefined) continue;
    owners.set(unit.configPath, {
      buildModule,
      checkerName: unit.primaryCheckerName,
    });
  }
  return owners;
}

function getGovernedBuildModule(options: {
  sourceToBuildByChecker: ReadonlyMap<
    string,
    ReadonlyMap<string, GeneratedBuildModule>
  >;
  unit: GovernedSourceUnit;
}): GeneratedBuildModule | undefined {
  return options.sourceToBuildByChecker
    .get(options.unit.primaryCheckerName)
    ?.get(options.unit.configPath);
}

function compareProviderEdges(
  left: GeneratedProviderEdge,
  right: GeneratedProviderEdge,
): number {
  const comparisons = [
    compareCodeUnits(left.fromChecker, right.fromChecker),
    compareCodeUnits(left.fromConfigPath, right.fromConfigPath),
    compareCodeUnits(left.toChecker, right.toChecker),
    compareCodeUnits(left.toConfigPath, right.toConfigPath),
    compareCodeUnits(left.file, right.file),
    compareCodeUnits(left.importedSpecifier, right.importedSpecifier),
  ];
  return comparisons.find((comparison) => comparison !== 0) ?? 0;
}

function addImplicitReferences(options: {
  config: ResolvedLiminaConfig;
  localDtsProjectsBySourcePath: Map<string, SourceProject[]>;
  problems: string[];
  projects: SourceProject[];
}): void {
  for (const project of options.projects) {
    addImplicitProjectReferences({
      config: options.config,
      localDtsProjectsBySourcePath: options.localDtsProjectsBySourcePath,
      problems: options.problems,
      project,
    });
  }
}

function processReferenceImports(options: {
  context: ReferenceImportContext;
  projects: SourceProject[];
}): void {
  for (const project of options.projects) {
    processProjectReferenceImports({ context: options.context, project });
  }
}

export function inferProjectReferences(options: {
  activatedRegions: WorkspaceRegionPathIndex;
  config: ResolvedLiminaConfig;
  governedSources: GovernedSourceUnit[];
  importAnalysisContext?: PrepareGeneratedTsconfigGraphOptions['importAnalysisContext'];
  ownerGovernedSources?: GovernedSourceUnit[];
  ownerProjects?: SourceProject[];
  primaryProjects: SourceProject[];
  projects: SourceProject[];
  sourceToBuildByChecker: ReadonlyMap<
    string,
    ReadonlyMap<string, GeneratedBuildModule>
  >;
}): InferredProjectReferenceCollection {
  const ownerProjects = options.ownerProjects ?? options.projects;
  const ownerGovernedSources =
    options.ownerGovernedSources ?? options.governedSources;
  const problems: string[] = [];
  const providerEdgesByKey = new Map<string, GeneratedProviderEdge>();
  const localDtsProjectsBySourcePath = createDtsProjectsBySourcePath(
    options.projects,
  );
  addImplicitReferences({
    config: options.config,
    localDtsProjectsBySourcePath,
    problems,
    projects: options.projects,
  });
  const context: ReferenceImportContext = {
    activatedRegions: options.activatedRegions,
    config: options.config,
    dtsProjectsBySourcePath: createDtsProjectsBySourcePath(ownerProjects),
    fileOwnerLookup: createOwnerLookup(ownerGovernedSources),
    importAnalysis: resolveBuildGraphImportAnalysis(options),
    managedOutputLookup: createManagedOutputDeclarationLookup(
      createManagedOutputProjectContexts(ownerProjects),
    ),
    problems,
    providerEdgesByKey,
  };
  processReferenceImports({ context, projects: options.projects });
  processFrameworkSchedulingReferences({
    buildOwnersByConfigPath: createGovernedBuildOwners({
      governedSources: ownerGovernedSources,
      sourceToBuildByChecker: options.sourceToBuildByChecker,
    }),
    context,
    governedSources: options.governedSources,
    primaryProjectsByConfigPath: createPrimaryProjectsByConfigPath(
      options.primaryProjects,
    ),
  });
  return {
    problems,
    providerEdges: [...providerEdgesByKey.values()].sort(compareProviderEdges),
  };
}
