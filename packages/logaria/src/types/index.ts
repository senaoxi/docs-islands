/// <reference lib="dom" />

/** Available log kinds. */
export type LogKind = 'info' | 'success' | 'warn' | 'error' | 'debug';

/** Available console methods. */
export type ConsoleMethod = 'log' | 'warn' | 'error' | 'debug';

/** User-facing allowlist for non-debug log APIs. */
export type LoggerVisibilityLevel = 'error' | 'warn' | 'info' | 'success';

export type LoggerScopeId = string;

export type LoggerRuleLevelsUserConfig = 'inherit' | LoggerVisibilityLevel[];

export interface LoggerRuleUserConfig {
  group?: string;
  levels: LoggerRuleLevelsUserConfig;
  main?: string;
  message?: string;
}

export interface LoggerPresetRuleUserConfig {
  group?: string;
  levels?: LoggerRuleLevelsUserConfig;
  main?: string;
  message?: string;
}

export type LoggerRuleSetting = 'off' | LoggerRuleUserConfig;

export interface LoggerPresetConfig<
  TRules extends Record<string, LoggerPresetRuleUserConfig> = Record<
    string,
    LoggerPresetRuleUserConfig
  >,
> {
  rules?: Partial<Record<keyof TRules & string, LoggerRuleSetting>>;
}

export interface LoggerPresetPlugin<
  TRules extends Record<string, LoggerPresetRuleUserConfig> = Record<
    string,
    LoggerPresetRuleUserConfig
  >,
  TConfigs extends Record<string, LoggerPresetConfig<TRules>> = Record<
    string,
    LoggerPresetConfig<TRules>
  >,
> {
  configs?: TConfigs;
  rules: TRules;
}

export type LoggerPluginMap = Record<string, LoggerPresetPlugin>;

export type LoggerPresetRuleKey<TPlugins extends LoggerPluginMap> = {
  [Namespace in keyof TPlugins &
    string]: TPlugins[Namespace] extends LoggerPresetPlugin<infer TRules>
    ? `${Namespace}/${keyof TRules & string}`
    : never;
}[keyof TPlugins & string];

export type LoggerPresetConfigKey<TPlugins extends LoggerPluginMap> = {
  [Namespace in keyof TPlugins & string]: `${Namespace}/${keyof NonNullable<
    TPlugins[Namespace]['configs']
  > &
    string}`;
}[keyof TPlugins & string];

export type LoggerRulesUserConfig<
  TPlugins extends LoggerPluginMap = LoggerPluginMap,
> = Partial<Record<LoggerPresetRuleKey<TPlugins>, LoggerRuleSetting>> &
  Record<string, LoggerRuleSetting | undefined>;

export interface LoggerConfig<
  TPlugins extends LoggerPluginMap = LoggerPluginMap,
> {
  debug?: boolean;
  extends?: LoggerPresetConfigKey<TPlugins>[];
  levels?: LoggerVisibilityLevel[];
  plugins?: TPlugins;
  rules?: LoggerRulesUserConfig<TPlugins>;
}

export interface ResolvedLoggerRule {
  group?: string;
  label: string;
  levels?: LoggerVisibilityLevel[];
  main?: string;
  message?: string;
}

export interface DebugMessageOptions {
  context: string;
  decision: string;
  summary?: unknown;
  timingMs?: number | null;
}

export interface LoggerElapsedLogOptions {
  elapsedTimeMs: number;
}

export type LoggerLogOptions = LoggerElapsedLogOptions;

export interface CreateLoggerOptions {
  main: string;
}

export interface ScopedLogger {
  debug(message: string): void;
  error(message: string, options?: LoggerLogOptions): void;
  info(message: string, options?: LoggerLogOptions): void;
  success(message: string, options?: LoggerLogOptions): void;
  warn(message: string, options?: LoggerLogOptions): void;
}

export interface Logger {
  getLoggerByGroup(group: string): ScopedLogger;
}

export interface LoggerContext {
  group: string;
  kind: LogKind;
  main: string;
  message: string;
}

export interface NormalizedLoggerRule {
  groupMatcher?: (value: string) => boolean;
  label: string;
  levels?: LoggerVisibilityLevel[];
  main?: string;
  messageMatcher?: (value: string) => boolean;
}

export interface NormalizedLoggerConfig {
  debug?: boolean;
  levels: LoggerVisibilityLevel[];
  rules?: NormalizedLoggerRule[];
}

export interface LoggerConfigRegistryEntry {
  config: LoggerConfig | undefined;
  compiledConfig: NormalizedLoggerConfig | null;
}

export interface ResolvedLoggerContext {
  appendElapsedTime: boolean;
  ruleLabels: string[];
  suppress: boolean;
}

export interface LoggerTreeShakingSourceMap {
  file: string;
  mappings: string;
  names: string[];
  sources: string[];
  sourcesContent?: string[];
  toString(): string;
  toUrl(): string;
  version: number;
}

export interface LoggerTreeShakingTransformResult {
  code: string;
  map: LoggerTreeShakingSourceMap;
}

export type { ResolvedLoggerRule as LoggerRule };
