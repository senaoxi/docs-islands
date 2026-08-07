import {
  type CheckerProjectConfigCache,
  isBuildCapablePreset,
  normalizeExtensions,
  parseCheckerProjectConfigForContext,
  resolveCheckerProjectExtensions,
} from '#checkers';
import type { ResolvedLiminaConfig } from '#config/runner';
import { uniqueCodeUnitSortedStrings as uniqueSortedStrings } from '#utils/collections';
import { normalizeAbsolutePath } from '#utils/path';
import type { WorkspaceRegionPathIndex } from '../workspace/validated-context';
import { getFrameworkFilePackageRoot } from './framework-file-root';
import { capabilityDiscoveryExtensions } from './generated/file-extensions';
import { getGeneratedLeafSolutionBuildConfigPath } from './generated/paths';
import { partitionSourceFiles } from './source-capabilities';
import { isInsideNodeModules } from './source-projects';
import type {
  FrameworkCapabilityDescriptor,
  GovernedSourceUnit,
  SourceProject,
} from './types';

function createBuildProjection(options: {
  declarationFileNames: readonly string[];
  config: ResolvedLiminaConfig;
  frameworkCapabilities: FrameworkCapabilityDescriptor[];
  project: SourceProject;
}): GovernedSourceUnit['buildProjection'] {
  if (!requiresFrameworkProjection(options)) {
    return {
      dtsConfigPath: options.project.dtsConfigPath,
      kind: 'declaration-project',
    };
  }
  const buildConfigPath = getGeneratedLeafSolutionBuildConfigPath({
    checkerName: options.project.checkerName,
    packageRootDir: options.project.packageRootDir,
    rootDir: options.config.rootDir,
    sourceConfigPath: options.project.configPath,
  });
  return options.declarationFileNames.length === 0
    ? { buildConfigPath, kind: 'transparent-solution' }
    : {
        buildConfigPath,
        dtsConfigPath: options.project.dtsConfigPath,
        kind: 'wrapped-project',
      };
}

function requiresFrameworkProjection(options: {
  frameworkCapabilities: readonly FrameworkCapabilityDescriptor[];
  project: SourceProject;
}): boolean {
  return (
    options.frameworkCapabilities.length > 0 &&
    isBuildCapablePreset(options.project.context.checkerPresets[0]!)
  );
}

function createDeclarationFileNames(project: SourceProject): string[] {
  if (!isBuildCapablePreset(project.context.checkerPresets[0]!)) {
    return [...project.fileNames];
  }
  return project.fileNames.filter(
    (fileName) => !fileName.endsWith('.astro') && !fileName.endsWith('.svelte'),
  );
}

function createFrameworkCapabilities(options: {
  activatedRegions: WorkspaceRegionPathIndex;
  fileNames: readonly string[];
  packageRootDir: string;
  preset: SourceProject['context']['checkerPresets'][number];
  sourceConfigPath: string;
}): FrameworkCapabilityDescriptor[] {
  if (!isBuildCapablePreset(options.preset)) return [];
  const partition = partitionSourceFiles(options.fileNames);
  const capabilities = [
    ['astro', partition.astroFiles],
    ['svelte', partition.svelteFiles],
  ] as const;
  return capabilities.flatMap(([family, fileNames]) => {
    if (fileNames.length === 0) return [];
    const packageRoots = uniqueSortedStrings(
      fileNames.map((fileName) =>
        getFrameworkFilePackageRoot({
          activatedRegions: options.activatedRegions,
          fallbackPackageRootDir: options.packageRootDir,
          fileName,
        }),
      ),
    );
    if (packageRoots.length !== 1) {
      throw new Error(
        `Framework capability spans multiple leaf package roots for ${family} at ${options.sourceConfigPath}.`,
      );
    }
    return [
      {
        family,
        packageRootDir: packageRoots[0]!,
        sourceConfigPath: options.sourceConfigPath,
      },
    ];
  });
}

export function createGovernedSourceUnit(options: {
  activatedRegions: WorkspaceRegionPathIndex;
  config: ResolvedLiminaConfig;
  project: SourceProject;
  projectConfigCache?: CheckerProjectConfigCache;
}): GovernedSourceUnit {
  const discoveryExtensions = normalizeExtensions([
    ...capabilityDiscoveryExtensions,
    ...resolveCheckerProjectExtensions({
      configPath: options.project.configPath,
      preset: options.project.context.checkerPresets[0]!,
      projectRootDir: options.config.rootDir,
    }),
  ]);
  const parsed = parseCheckerProjectConfigForContext({
    cache: options.projectConfigCache,
    configPath: options.project.configPath,
    context: {
      checkerPresets: [...options.project.context.checkerPresets],
      extensions: discoveryExtensions,
    },
    projectRootDir: options.config.rootDir,
  });
  const ownedFileNames = uniqueSortedStrings(
    parsed.fileNames
      .map(normalizeAbsolutePath)
      .filter((fileName) => !isInsideNodeModules(fileName)),
  );
  const frameworkCapabilities = createFrameworkCapabilities({
    activatedRegions: options.activatedRegions,
    fileNames: ownedFileNames,
    packageRootDir: options.project.packageRootDir,
    preset: options.project.context.checkerPresets[0]!,
    sourceConfigPath: options.project.configPath,
  });
  const declarationFileNames = createDeclarationFileNames(options.project);

  return {
    buildProjection: createBuildProjection({
      config: options.config,
      declarationFileNames,
      frameworkCapabilities,
      project: options.project,
    }),
    configPath: options.project.configPath,
    declarationFileNames,
    declarationReferences: options.project.references,
    frameworkCapabilities,
    frameworkSchedulingReferences: new Set(),
    ownedFileNames,
    packageRootDir: options.project.packageRootDir,
    primaryCheckerName: options.project.checkerName,
    primaryCheckerPreset: options.project.context.checkerPresets[0]!,
  };
}
