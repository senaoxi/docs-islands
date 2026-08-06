import {
  type CheckerProjectParseContext,
  normalizeExtensions,
  resolveCheckerProjectExtensions,
} from '#checkers';
import type { ResolvedLiminaConfig } from '#config/runner';
import type {
  GeneratedTsconfigGraphResult,
  GovernedSourceUnit,
} from '#core/build-graph/runner';
import { uniqueValues } from '#utils/collections';
import { capabilityDiscoveryExtensions } from '../build-graph/generated/file-extensions';
import type {
  CheckerRouteSnapshot,
  CheckerRouteSnapshotCollection,
  CollectCheckerGraphProjectRoutesResult,
  CollectSourceGraphProjectExtensionsResult,
} from './action-types';
import { projectCheckerRoutesForProjection } from './checker-route-projection';
import { collectCheckerRouteSnapshot } from './checker-route-snapshot';
import { isDtsConfigPath } from './config-paths';

interface SourceExtensionState {
  projectContextsByPath: Map<string, CheckerProjectParseContext>;
  projectExtensionsByPath: Map<string, string[]>;
}

function hasGovernedSources(
  generatedGraph: GeneratedTsconfigGraphResult | undefined,
): generatedGraph is GeneratedTsconfigGraphResult {
  return (
    generatedGraph !== undefined &&
    generatedGraph.governedSources instanceof Map &&
    [...generatedGraph.governedSources.values()].some(
      (governedSources) => governedSources.size > 0,
    )
  );
}

function recordSourceExtensionProjection(
  snapshot: CheckerRouteSnapshotCollection,
): void {
  snapshot.metrics?.record({
    kind: 'source-extension',
    name: 'checker-route-projection',
    provider: 'checker-route-snapshot',
  });
}

function mergeProjectContext(options: {
  checkerPreset: CheckerRouteSnapshot['checkerPreset'];
  projectPath: string;
  routeExtensions: string[];
  state: SourceExtensionState;
}): void {
  const current = options.state.projectContextsByPath.get(options.projectPath);
  const context = current ?? { checkerPresets: [], extensions: [] };
  options.state.projectContextsByPath.set(options.projectPath, {
    checkerPresets: uniqueValues([
      ...context.checkerPresets,
      options.checkerPreset,
    ]),
    extensions: normalizeExtensions([
      ...context.extensions,
      ...options.routeExtensions,
    ]),
  });
  const existing = options.state.projectExtensionsByPath.get(
    options.projectPath,
  );
  options.state.projectExtensionsByPath.set(
    options.projectPath,
    normalizeExtensions([...(existing ?? []), ...options.routeExtensions]),
  );
}

function projectRouteExtensions(options: {
  config: ResolvedLiminaConfig;
  route: CollectCheckerGraphProjectRoutesResult['routes'][number];
  snapshot: CheckerRouteSnapshotCollection;
  state: SourceExtensionState;
}): void {
  for (const projectPath of options.route.projectPaths) {
    if (!isDtsConfigPath(projectPath)) {
      continue;
    }
    const extensions = resolveCheckerProjectExtensions({
      configPath: projectPath,
      preset: options.route.checkerPreset,
      projectRootDir: options.config.rootDir,
      virtualFiles: options.snapshot.generatedFiles,
    });
    mergeProjectContext({
      checkerPreset: options.route.checkerPreset,
      projectPath,
      routeExtensions: normalizeExtensions(extensions),
      state: options.state,
    });
  }
}

function projectGovernedSourceExtensions(options: {
  config: ResolvedLiminaConfig;
  generatedGraph: GeneratedTsconfigGraphResult;
  routes: CollectCheckerGraphProjectRoutesResult['routes'];
  state: SourceExtensionState;
}): void {
  const routedCheckerNames = new Set(
    options.routes.map((route) => route.checkerName),
  );
  for (const [checkerName, governedSources] of options.generatedGraph
    .governedSources) {
    if (!routedCheckerNames.has(checkerName)) continue;
    projectGovernedUnits({
      config: options.config,
      generatedFiles: options.generatedGraph.generatedFiles,
      governedSources,
      state: options.state,
    });
  }
}

function getGovernedProjectPath(unit: GovernedSourceUnit): string {
  return 'buildConfigPath' in unit.buildProjection
    ? unit.buildProjection.buildConfigPath
    : unit.buildProjection.dtsConfigPath;
}

function projectGovernedUnits(options: {
  config: ResolvedLiminaConfig;
  generatedFiles: ReadonlyMap<string, string>;
  governedSources: ReadonlyMap<string, GovernedSourceUnit>;
  state: SourceExtensionState;
}): void {
  for (const unit of options.governedSources.values()) {
    const extensions = normalizeExtensions([
      ...capabilityDiscoveryExtensions,
      ...resolveCheckerProjectExtensions({
        configPath: unit.configPath,
        preset: unit.primaryCheckerPreset,
        projectRootDir: options.config.rootDir,
        virtualFiles: options.generatedFiles,
      }),
    ]);
    mergeProjectContext({
      checkerPreset: unit.primaryCheckerPreset,
      projectPath: getGovernedProjectPath(unit),
      routeExtensions: extensions,
      state: options.state,
    });
  }
}

export function projectSourceGraphProjectExtensions(
  config: ResolvedLiminaConfig,
  snapshot: CheckerRouteSnapshotCollection,
  generatedGraph?: GeneratedTsconfigGraphResult,
): CollectSourceGraphProjectExtensionsResult {
  recordSourceExtensionProjection(snapshot);
  const routeCollection = projectCheckerRoutesForProjection(
    config,
    snapshot,
    'graph',
  );
  const state: SourceExtensionState = {
    projectContextsByPath: new Map(),
    projectExtensionsByPath: new Map(),
  };
  if (hasGovernedSources(generatedGraph)) {
    projectGovernedSourceExtensions({
      config,
      generatedGraph,
      routes: routeCollection.routes,
      state,
    });
  } else {
    for (const route of routeCollection.routes) {
      projectRouteExtensions({ config, route, snapshot, state });
    }
  }
  return {
    diagnostics: routeCollection.diagnostics,
    problems: routeCollection.problems,
    projectContextsByPath: state.projectContextsByPath,
    projectExtensionsByPath: state.projectExtensionsByPath,
  };
}

export function collectSourceGraphProjectExtensions(
  config: ResolvedLiminaConfig,
  generatedGraph?: GeneratedTsconfigGraphResult,
): CollectSourceGraphProjectExtensionsResult {
  return projectSourceGraphProjectExtensions(
    config,
    collectCheckerRouteSnapshot(config, generatedGraph),
    generatedGraph,
  );
}
