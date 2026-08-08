import type {
  BuildCheckerName,
  CheckerExecutionKind,
  CheckerPreset,
  ResolvedCheckerConfig,
} from '#config/runner';
import type ts from 'typescript';

export interface CheckerCommandTarget {
  args: string[];
  command: string;
  label: string;
}

export interface CheckerCommandTargetOptions {
  checker: ResolvedCheckerConfig;
  commandOverride?: string;
  configPath: string;
  executionKind: CheckerExecutionKind;
  projectRootDir: string;
  watch?: boolean;
}

export interface CheckerProjectConfigParseOptions {
  allowNoInputDiagnostics?: boolean;
  configPath: string;
  extensions?: string[];
  projectRootDir: string;
  virtualFiles?: ReadonlyMap<string, string>;
}

export interface ParsedCheckerProjectConfig {
  extensions: string[];
  fileNames: string[];
  options: ts.CompilerOptions;
}

export interface CheckerProjectParseContext {
  checkerPresets: CheckerPreset[];
  extensions: string[];
}

export interface CheckerModuleResolutionMetricsRecorder {
  record(measurement: {
    readonly count?: number;
    readonly kind?: string;
    readonly name:
      | 'typescript-module-resolution-cache-hit'
      | 'typescript-module-resolution-cache-miss'
      | 'typescript-resolution';
    readonly provider?: string;
  }): void;
}

export interface CheckerModuleResolveOptions {
  compilerOptions: ts.CompilerOptions;
  containingFile: string;
  extensions: string[];
  metrics?: CheckerModuleResolutionMetricsRecorder;
  moduleResolutionCache?: ts.ModuleResolutionCache;
  specifier: string;
}

export interface ResolvedCheckerModuleName {
  isExternalLibraryImport: boolean;
  resolvedBy: 'checker-source' | 'typescript';
  resolvedFileName: string;
}

export interface CheckerAdapter {
  createCommandTarget: (
    options: CheckerCommandTargetOptions,
  ) => CheckerCommandTarget;
  extensions: (options: CheckerProjectConfigParseOptions) => string[];
  execution: CheckerExecutionKind;
  emitProjection: 'typescript' | 'vue-bounded';
  dependencies: CheckerDependencies;
  parseProjectConfig: (
    options: CheckerProjectConfigParseOptions,
  ) => ParsedCheckerProjectConfig;
  name: BuildCheckerName;
  resolveModuleName: (options: CheckerModuleResolveOptions) => string | null;
  sourceGraph: boolean;
}

export interface CheckerDependencies {
  analysisRuntimePackages: string[];
  checkerBinaryPackages: string[];
  checkerRuntimePeerPackages: string[];
}

export type CheckerDependencyCategory =
  | 'analysis-runtime'
  | 'checker-binary'
  | 'checker-runtime-peer';

export interface CheckerDependencyRequirement {
  category: CheckerDependencyCategory;
  packageName: string;
}

export interface MissingCheckerPeerDependency {
  checkerNames: string[];
  packageName: string;
  reason?: string;
}

export type CheckerPackageResolver = (options: {
  packageName: string;
  projectRootDir: string;
}) => string | undefined;

export interface VueLanguageCore {
  createParsedCommandLine: (
    tsModule: typeof ts,
    host: typeof ts.sys,
    configFileName: string,
  ) => {
    errors?: readonly ts.Diagnostic[];
    vueOptions?: unknown;
  };
  getAllExtensions: (vueOptions: unknown) => string[];
}

export type CheckerBuildEngine =
  | 'tsc'
  | 'tsgo'
  | 'vue-tsc'
  | 'typecheck-only'
  | 'unknown';

export type CheckerCapabilityFamily =
  | 'typescript-native'
  | 'vue'
  | 'svelte'
  | 'unknown';
