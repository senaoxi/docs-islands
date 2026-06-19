import path from 'pathe';
import type { ResolvedLiminaConfig } from '../config/runner';
import { createLiminaCore, type LiminaCore } from '../core';
import {
  collectImportsFromFile,
  createFileOwnerLookup,
  findPackageForFile,
  type ProjectInfo,
  resolveInternalImport,
} from '../core/import-graph/context';
import {
  findPackageForSpecifier,
  type WorkspacePackage,
} from '../core/workspace/actions';
import {
  createWorkspaceExportsResolutionIndex,
  type WorkspaceExportsResolutionProfile,
} from '../core/workspace/exports';
import {
  isPathInsideDirectory,
  normalizeAbsolutePath,
  toRelativePath,
} from '../utils/path';

export type DependencyGraphView = 'all' | 'artifact' | 'source';
export type DependencyGraphEdgeKind = 'artifact' | 'source';

export interface DependencyGraphNode {
  id: string;
  kind: 'package';
  name: string;
  path: string;
}

export interface DependencyGraphEvidence {
  importer: string;
  resolvedPath: string;
  specifier: string;
}

export interface DependencyGraphEdge {
  evidence: DependencyGraphEvidence[];
  from: string;
  kind: DependencyGraphEdgeKind;
  to: string;
}

export interface DependencyGraphDocument {
  edges: DependencyGraphEdge[];
  nodes: DependencyGraphNode[];
  rootDir: string;
  schemaVersion: 1;
  view: DependencyGraphView;
}

export interface CollectDependencyGraphOptions {
  core?: LiminaCore;
  view?: DependencyGraphView;
}

const defaultArtifactDirectories = ['dist'];

function createPackageNodeId(packageName: string): string {
  return `pkg:${packageName}`;
}

function configuredArtifactDirectories(): string[] {
  return defaultArtifactDirectories;
}

function matchesArtifactDirectory(
  targetPackage: WorkspacePackage,
  resolvedPath: string,
): boolean {
  return configuredArtifactDirectories().some((artifactDirectory) => {
    const artifactPath = normalizeAbsolutePath(
      path.join(targetPackage.directory, artifactDirectory),
    );

    return isPathInsideDirectory(resolvedPath, artifactPath);
  });
}

function createWorkspaceExportsResolutionProfiles(
  projects: ProjectInfo[],
): WorkspaceExportsResolutionProfile[] {
  return projects.map((project) => ({
    checkerPresets: project.checkerPresets,
    configPath: project.configPath,
    extensions: project.extensions,
    options: project.options,
    resolverConfigPath: project.resolverConfigPath,
  }));
}

async function collectDependencyGraphProjects(core: LiminaCore): Promise<{
  problems: string[];
  projects: ProjectInfo[];
}> {
  return core.tsconfig.getSourceGraphProjects();
}

function normalizeDependencyGraphView(
  view: DependencyGraphView | undefined,
): DependencyGraphView {
  return view ?? 'all';
}

function createNodes(
  config: ResolvedLiminaConfig,
  workspacePackages: WorkspacePackage[],
): DependencyGraphNode[] {
  return workspacePackages
    .map((workspacePackage) => ({
      id: createPackageNodeId(workspacePackage.name),
      kind: 'package' as const,
      name: workspacePackage.name,
      path: toRelativePath(config.rootDir, workspacePackage.directory),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function addEdge(
  edgesByKey: Map<string, DependencyGraphEdge>,
  edge: Omit<DependencyGraphEdge, 'evidence'> & {
    evidence: DependencyGraphEvidence;
  },
): void {
  const edgeKey = `${edge.kind}\0${edge.from}\0${edge.to}`;
  const currentEdge = edgesByKey.get(edgeKey) ?? {
    evidence: [],
    from: edge.from,
    kind: edge.kind,
    to: edge.to,
  };
  const evidenceKey = `${edge.evidence.importer}\0${edge.evidence.specifier}\0${edge.evidence.resolvedPath}`;

  if (
    !currentEdge.evidence.some(
      (evidence) =>
        `${evidence.importer}\0${evidence.specifier}\0${evidence.resolvedPath}` ===
        evidenceKey,
    )
  ) {
    currentEdge.evidence.push(edge.evidence);
  }

  edgesByKey.set(edgeKey, currentEdge);
}

function sortEdges(edges: DependencyGraphEdge[]): DependencyGraphEdge[] {
  return edges
    .map((edge) => ({
      ...edge,
      evidence: [...edge.evidence].sort((left, right) => {
        const importerOrder = left.importer.localeCompare(right.importer);

        if (importerOrder !== 0) {
          return importerOrder;
        }

        const specifierOrder = left.specifier.localeCompare(right.specifier);

        return specifierOrder === 0
          ? left.resolvedPath.localeCompare(right.resolvedPath)
          : specifierOrder;
      }),
    }))
    .sort((left, right) => {
      const fromOrder = left.from.localeCompare(right.from);

      if (fromOrder !== 0) {
        return fromOrder;
      }

      const toOrder = left.to.localeCompare(right.to);

      return toOrder === 0 ? left.kind.localeCompare(right.kind) : toOrder;
    });
}

function resolveTargetPackage(options: {
  declaredTargetPackage: WorkspacePackage | null;
  graphResolvedFilePath: string | null;
  packages: WorkspacePackage[];
  resolvedFilePath: string;
}): WorkspacePackage | null {
  return (
    options.declaredTargetPackage ??
    (options.graphResolvedFilePath
      ? findPackageForFile(options.graphResolvedFilePath, options.packages)
      : null) ??
    findPackageForFile(options.resolvedFilePath, options.packages)
  );
}

function shouldUseWorkspaceExportResolution(options: {
  declaredTargetPackage: WorkspacePackage | null;
  resolvedFilePath: string | null;
}): boolean {
  if (!options.declaredTargetPackage) {
    return false;
  }

  return !options.resolvedFilePath;
}

function classifyEdge(options: {
  fileOwnerLookup: Map<string, string[]>;
  graphResolvedFilePath: string | null;
  resolvedFilePath: string;
  targetPackage: WorkspacePackage;
}): DependencyGraphEdgeKind | null {
  if (
    matchesArtifactDirectory(options.targetPackage, options.resolvedFilePath)
  ) {
    return 'artifact';
  }

  if (
    options.graphResolvedFilePath &&
    options.fileOwnerLookup.has(options.graphResolvedFilePath)
  ) {
    return 'source';
  }

  if (options.fileOwnerLookup.has(options.resolvedFilePath)) {
    return 'source';
  }

  return null;
}

export async function collectDependencyGraph(
  config: ResolvedLiminaConfig,
  options: CollectDependencyGraphOptions = {},
): Promise<DependencyGraphDocument> {
  const core = options.core ?? createLiminaCore(config);
  const view = normalizeDependencyGraphView(options.view);
  const checkerProjects = await collectDependencyGraphProjects(core);
  const problems = [...checkerProjects.problems];
  const workspacePackages = await core.workspace.getPackages();
  const workspaceExports = await createWorkspaceExportsResolutionIndex({
    config,
    packages: workspacePackages,
    profiles: createWorkspaceExportsResolutionProfiles(
      checkerProjects.projects,
    ),
  });

  problems.push(...workspaceExports.problems);

  if (problems.length > 0) {
    throw new Error(problems.join('\n\n'));
  }

  const fileOwnerLookup = createFileOwnerLookup(checkerProjects.projects);
  const importAnalysis = core.imports.context;
  const edgesByKey = new Map<string, DependencyGraphEdge>();

  for (const project of checkerProjects.projects) {
    for (const fileName of project.ownedFileNames) {
      const importerPackage = findPackageForFile(fileName, workspacePackages);

      if (!importerPackage) {
        continue;
      }

      for (const importRecord of collectImportsFromFile(
        fileName,
        config.rootDir,
        importAnalysis,
      )) {
        const declaredTargetPackage = findPackageForSpecifier(
          importRecord.specifier,
          workspacePackages,
        );
        const workspaceExportResolution =
          declaredTargetPackage &&
          workspaceExports.hasExports(declaredTargetPackage.name)
            ? workspaceExports.get(project.configPath, importRecord.specifier)
            : null;
        const internalResolvedFilePath = resolveInternalImport(
          importRecord.specifier,
          fileName,
          project.options,
          project,
          importAnalysis,
        );
        const useWorkspaceExportResolution = shouldUseWorkspaceExportResolution(
          {
            declaredTargetPackage,
            resolvedFilePath: internalResolvedFilePath,
          },
        );
        const resolvedFilePath =
          (useWorkspaceExportResolution
            ? workspaceExportResolution?.oxcResolvedFileName
            : null) ?? internalResolvedFilePath;

        if (!resolvedFilePath) {
          continue;
        }

        const graphResolvedFilePath =
          (useWorkspaceExportResolution
            ? workspaceExportResolution?.typeScriptResolvedFileName
            : null) ?? resolvedFilePath;
        const targetPackage = resolveTargetPackage({
          declaredTargetPackage: useWorkspaceExportResolution
            ? declaredTargetPackage
            : null,
          graphResolvedFilePath,
          packages: workspacePackages,
          resolvedFilePath,
        });

        if (!targetPackage || targetPackage.name === importerPackage.name) {
          continue;
        }

        const edgeKind = classifyEdge({
          fileOwnerLookup,
          graphResolvedFilePath,
          resolvedFilePath,
          targetPackage,
        });

        if (!edgeKind || (view !== 'all' && view !== edgeKind)) {
          continue;
        }

        addEdge(edgesByKey, {
          evidence: {
            importer: toRelativePath(config.rootDir, importRecord.filePath),
            resolvedPath: toRelativePath(config.rootDir, resolvedFilePath),
            specifier: importRecord.specifier,
          },
          from: createPackageNodeId(importerPackage.name),
          kind: edgeKind,
          to: createPackageNodeId(targetPackage.name),
        });
      }
    }
  }

  const nodes = createNodes(config, workspacePackages);

  return {
    edges: sortEdges([...edgesByKey.values()]),
    nodes,
    rootDir: '.',
    schemaVersion: 1,
    view,
  };
}

export function stringifyDependencyGraph(
  graph: DependencyGraphDocument,
): string {
  return `${JSON.stringify(graph, null, 2)}\n`;
}
