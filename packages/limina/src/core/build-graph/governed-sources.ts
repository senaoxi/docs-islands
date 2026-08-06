import {
  type CheckerProjectConfigCache,
  normalizeExtensions,
  parseCheckerProjectConfigForContext,
  resolveCheckerProjectExtensions,
} from '#checkers';
import type { ResolvedLiminaConfig } from '#config/runner';
import { uniqueCodeUnitSortedStrings as uniqueSortedStrings } from '#utils/collections';
import { normalizeAbsolutePath } from '#utils/path';
import { capabilityDiscoveryExtensions } from './generated/file-extensions';
import {
  collectConfirmedFrameworkCapabilities,
  partitionSourceFiles,
} from './source-capabilities';
import { isInsideNodeModules } from './source-projects';
import type {
  FrameworkCapabilityDescriptor,
  GovernedSourceUnit,
  SourceProject,
} from './types';

function createFrameworkCapabilities(options: {
  fileNames: readonly string[];
  packageRootDir: string;
  sourceConfigPath: string;
}): FrameworkCapabilityDescriptor[] {
  return collectConfirmedFrameworkCapabilities(
    partitionSourceFiles(options.fileNames),
  )
    .filter((family): family is FrameworkCapabilityDescriptor['family'] =>
      ['astro', 'svelte'].includes(family),
    )
    .map((family) => ({
      family,
      packageRootDir: options.packageRootDir,
      sourceConfigPath: options.sourceConfigPath,
    }));
}

export function createGovernedSourceUnit(options: {
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

  return {
    buildProjection: {
      dtsConfigPath: options.project.dtsConfigPath,
      kind: 'declaration-project',
    },
    configPath: options.project.configPath,
    declarationFileNames: [...options.project.fileNames],
    declarationReferences: options.project.references,
    frameworkCapabilities: createFrameworkCapabilities({
      fileNames: ownedFileNames,
      packageRootDir: options.project.packageRootDir,
      sourceConfigPath: options.project.configPath,
    }),
    frameworkSchedulingReferences: new Set(),
    ownedFileNames,
    packageRootDir: options.project.packageRootDir,
    primaryCheckerName: options.project.checkerName,
    primaryCheckerPreset: options.project.context.checkerPresets[0]!,
  };
}
