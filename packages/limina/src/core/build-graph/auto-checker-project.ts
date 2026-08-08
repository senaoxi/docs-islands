import {
  type CheckerProjectConfigCache,
  type CheckerProjectParseContext,
  getBuildCheckerSupportedExtensions,
  parseCheckerProjectConfigForContext,
  resolveCheckerProjectExtensions,
} from '#checkers';
import type { ResolvedLiminaConfig } from '#config/runner';
import { normalizeAbsolutePath } from '#utils/path';
import type { WorkspaceRegionPathIndex } from '../workspace/validated-context';
import {
  capabilityDiscoveryExtensions,
  getFileExtension,
} from './generated/file-extensions';
import {
  type FrameworkIntentHint,
  partitionSourceFiles,
} from './source-capabilities';
import type { AutoScopeProject } from './types';

type ParsedCheckerProject = ReturnType<
  typeof parseCheckerProjectConfigForContext
>;

interface NeutralProjectEvidence {
  context: CheckerProjectParseContext;
  fileNames: string[];
  parsed: ParsedCheckerProject;
  partition: ReturnType<typeof partitionSourceFiles>;
}

interface VueProjectEvidence {
  context: CheckerProjectParseContext;
  parsed: ParsedCheckerProject | undefined;
}

function parseNeutralProject(options: {
  config: ResolvedLiminaConfig;
  configPath: string;
  projectConfigCache?: CheckerProjectConfigCache;
}): NeutralProjectEvidence {
  const context: CheckerProjectParseContext = {
    checkerPresets: ['tsc'],
    extensions: capabilityDiscoveryExtensions,
  };
  const parsed = parseCheckerProjectConfigForContext({
    allowNoInputDiagnostics: true,
    cache: options.projectConfigCache,
    configPath: options.configPath,
    context,
    projectRootDir: options.config.rootDir,
  });
  const fileNames = parsed.fileNames.map(normalizeAbsolutePath).sort();
  return {
    context,
    fileNames,
    parsed,
    partition: partitionSourceFiles(fileNames),
  };
}

function isVueIntentHint(hint: FrameworkIntentHint): boolean {
  return hint.family === 'vue';
}

function hasVueCandidate(
  neutral: NeutralProjectEvidence,
  intentHints: readonly FrameworkIntentHint[],
): boolean {
  if (neutral.partition.vueFiles.length > 0) return true;
  return intentHints.some(isVueIntentHint);
}

function parseVueProject(options: {
  config: ResolvedLiminaConfig;
  configPath: string;
  enabled: boolean;
  projectConfigCache?: CheckerProjectConfigCache;
}): VueProjectEvidence {
  if (!options.enabled) {
    return {
      context: { checkerPresets: ['vue-tsc'], extensions: [] },
      parsed: undefined,
    };
  }
  const extensions = resolveCheckerProjectExtensions({
    configPath: options.configPath,
    preset: 'vue-tsc',
    projectRootDir: options.config.rootDir,
  });
  const context: CheckerProjectParseContext = {
    checkerPresets: ['vue-tsc'],
    extensions,
  };
  return {
    context,
    parsed: parseCheckerProjectConfigForContext({
      allowNoInputDiagnostics: true,
      cache: options.projectConfigCache,
      configPath: options.configPath,
      context,
      projectRootDir: options.config.rootDir,
    }),
  };
}

function getParsedFileNames(
  parsed: ParsedCheckerProject | undefined,
): readonly string[] {
  if (parsed === undefined) return [];
  return parsed.fileNames;
}

function collectVueFileNames(
  parsed: ParsedCheckerProject | undefined,
): string[] {
  const typeScriptExtensions = new Set(
    getBuildCheckerSupportedExtensions('tsc'),
  );
  return getParsedFileNames(parsed)
    .map(normalizeAbsolutePath)
    .filter((fileName) => !typeScriptExtensions.has(getFileExtension(fileName)))
    .sort();
}

function selectProjectContext(options: {
  neutral: NeutralProjectEvidence;
  vue: VueProjectEvidence;
  vueFileNames: readonly string[];
}): CheckerProjectParseContext {
  return options.vueFileNames.length > 0
    ? options.vue.context
    : options.neutral.context;
}

function selectProjectOptions(options: {
  neutral: NeutralProjectEvidence;
  vue: VueProjectEvidence;
}): ParsedCheckerProject['options'] {
  return options.vue.parsed?.options ?? options.neutral.parsed.options;
}

function getPackageRootForFile(options: {
  activatedRegions: WorkspaceRegionPathIndex;
  fallbackPackageRootDir: string;
  fileName: string;
}): string {
  const region = options.activatedRegions.findPackageForPath(options.fileName);
  return region === null ? options.fallbackPackageRootDir : region.directory;
}

export function createAutoScopeProject(options: {
  activatedRegions: WorkspaceRegionPathIndex;
  config: ResolvedLiminaConfig;
  configPath: string;
  intentHints: readonly FrameworkIntentHint[];
  packageRootDir: string;
  projectConfigCache?: CheckerProjectConfigCache;
}): AutoScopeProject {
  const neutral = parseNeutralProject(options);
  const vue = parseVueProject({
    ...options,
    enabled: hasVueCandidate(neutral, options.intentHints),
  });
  const vueFileNames = collectVueFileNames(vue.parsed);
  const fileNames = [
    ...new Set([...neutral.fileNames, ...vueFileNames]),
  ].sort();
  const filePartition = partitionSourceFiles(fileNames);
  filePartition.vueFiles = [
    ...new Set([...filePartition.vueFiles, ...vueFileNames]),
  ].sort();
  return {
    configPath: options.configPath,
    context: selectProjectContext({ neutral, vue, vueFileNames }),
    fileNames,
    filePartition,
    options: selectProjectOptions({ neutral, vue }),
    packageRootByFileName: new Map(
      fileNames.map((fileName) => [
        fileName,
        getPackageRootForFile({
          activatedRegions: options.activatedRegions,
          fallbackPackageRootDir: options.packageRootDir,
          fileName,
        }),
      ]),
    ),
    packageRootDir: options.packageRootDir,
  };
}
