export type RuntimeEnvironment = 'browser' | 'node' | string;

export type BuiltinTaskName =
  | 'checker:build'
  | 'checker:typecheck'
  | 'graph:prepare'
  | 'graph:check'
  | 'package:check'
  | 'proof:check'
  | 'release:check'
  | 'source:check';

export type PipelineStep =
  | string
  | {
      args?: string[];
      command: string;
      cwd?: string;
      env?: Record<string, string>;
      type: 'command';
    }
  | {
      name: BuiltinTaskName;
      type: 'task';
    };

export type BuildCheckerName = 'tsc' | 'tsgo' | 'vue-tsc';
export type FrameworkCheckerName = 'svelte-check' | 'astro';
export type CheckerName = BuildCheckerName | FrameworkCheckerName;

/** Internal parser/CLI compatibility aliases. Config does not expose presets. */
export type BuiltinCheckerPreset = CheckerName;
export type CheckerPreset = CheckerName;
export type BuildCheckerPreset = BuildCheckerName;
export type CheckerExecutionKind = 'build' | 'typecheck';

export interface CheckerScope {
  exclude?: string[];
  include: string[];
}

export type CheckerConfig = CheckerScope;

export interface AutoCheckerConfig {
  exclude?: string[];
  mode: 'auto';
  useTsgo?: boolean;
}

export type CheckerConfigMode =
  | AutoCheckerConfig
  | Partial<Record<CheckerName, CheckerScope>>;

export type VueImportParser = 'compiler-sfc' | 'heuristic';

export interface ImportAnalysisConfig {
  vue?: VueImportParser;
}

export interface ResolvedCheckerConfig {
  exclude: string[];
  extensions: string[];
  include: string[];
  name: CheckerName;
}
