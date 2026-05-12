/**
 * Configuration and utility types
 */

export type ConsoleThemeValue =
  | 'red'
  | 'green'
  | 'yellow'
  | 'blue'
  | 'redBright';

export interface PrintOptions {
  theme?: ConsoleThemeValue;
  bold?: boolean;
}

/**
 * Build-time analysis providers.
 */
export type SiteDevToolsAnalysisProvider = 'claude' | 'doubao';
export type SiteDevToolsAnalysisDoubaoThinkingType = boolean;
export type SiteDevToolsAnalysisBuildReportCacheStrategy = 'exact' | 'fallback';

declare const SiteDevToolsAnalysisProviderBrand: unique symbol;
declare const SiteDevToolsAnalysisProviderType: unique symbol;
declare const SiteDevToolsAnalysisProviderKey: unique symbol;
declare const SiteDevToolsAnalysisBuildReportModelBrand: unique symbol;
declare const SiteDevToolsAnalysisBuildReportModelProvider: unique symbol;
declare const SiteDevToolsAnalysisBuildReportModelProviderKey: unique symbol;

export interface SiteDevToolsAnalysisBuildReportsCacheOptions {
  /**
   * Directory for persisted AI reports cache.
   * Relative paths are resolved from the docs root.
   *
   * @default '.vitepress/cache/site-devtools-reports'
   */
  dir?: string;
  /**
   * Cache lookup strategy.
   *
   * - 'exact': require a cacheKey match; regenerate on miss.
   * - 'fallback': reuse any cached report for the same target if present;
   *   regenerate only when no cached report exists.
   *
   * @default 'exact'
   */
  strategy?: SiteDevToolsAnalysisBuildReportCacheStrategy;
}

export type SiteDevToolsAnalysisBuildReportsCacheConfig =
  | false
  | true
  | SiteDevToolsAnalysisBuildReportsCacheOptions;

export interface SiteDevToolsAnalysisProviderBaseConfig {
  /**
   * Maximum time to wait for a single analysis request, in milliseconds.
   *
   * When omitted, defaults to `Infinity` and does not enforce a local timeout.
   *
   * @default Infinity
   */
  timeoutMs?: number;
}

export interface SiteDevToolsAnalysisProviderDisplayConfig
  extends SiteDevToolsAnalysisProviderBaseConfig {
  /**
   * Optional label shown in the debug console.
   */
  label?: string;
}

export interface SiteDevToolsAnalysisDoubaoProviderInput
  extends SiteDevToolsAnalysisProviderDisplayConfig {
  /**
   * Volcengine Ark API key used for ChatCompletions requests.
   */
  apiKey?: string;
  /**
   * Base URL for the Ark API endpoint.
   */
  baseUrl?: string;
}

export interface SiteDevToolsAnalysisClaudeProviderInput
  extends SiteDevToolsAnalysisProviderDisplayConfig {
  /**
   * Anthropic API key used for Messages requests.
   */
  apiKey?: string;
  /**
   * Base URL for the Anthropic Messages API endpoint.
   *
   * @default 'https://api.anthropic.com/v1'
   */
  baseUrl?: string;
}

interface SiteDevToolsAnalysisBuildReportModelBaseInput {
  /**
   * Marks this model as the default build-time AI report model.
   */
  default?: boolean;
  /**
   * Optional label shown in the debug console for the generated report.
   */
  label?: string;
  /**
   * Upper bound for generated output tokens in a single response.
   */
  maxTokens?: number;
  /**
   * Provider model used for this build-time analysis model.
   */
  model: string;
  /**
   * Sampling temperature for the generated analysis.
   * Lower values are more deterministic; higher values are more creative.
   */
  temperature?: number;
}

export type SiteDevToolsAnalysisBuildReportClaudeModelInput =
  SiteDevToolsAnalysisBuildReportModelBaseInput;

export interface SiteDevToolsAnalysisBuildReportDoubaoModelInput
  extends SiteDevToolsAnalysisBuildReportModelBaseInput {
  /**
   * Whether reasoning mode is enabled for this build-time analysis model.
   *
   * @default false
   */
  thinking?: SiteDevToolsAnalysisDoubaoThinkingType;
}

interface SiteDevToolsAnalysisBuildReportModelBaseConfig<
  Provider extends SiteDevToolsAnalysisProvider = SiteDevToolsAnalysisProvider,
> {
  readonly [SiteDevToolsAnalysisBuildReportModelBrand]: true;
  readonly [SiteDevToolsAnalysisBuildReportModelProvider]: Provider;
  readonly [SiteDevToolsAnalysisBuildReportModelProviderKey]: string;
  /**
   * Marks this model as the default build-time AI report model.
   */
  default?: boolean;
  /**
   * Optional label shown in the debug console for the generated report.
   */
  label?: string;
  /**
   * Upper bound for generated output tokens in a single response.
   */
  maxTokens?: number;
  /**
   * Provider model used for this build-time analysis model.
   */
  model: string;
  /**
   * Sampling temperature for the generated analysis.
   * Lower values are more deterministic; higher values are more creative.
   */
  temperature?: number;
}

export type SiteDevToolsAnalysisBuildReportClaudeModelConfig =
  SiteDevToolsAnalysisBuildReportModelBaseConfig<'claude'>;

export interface SiteDevToolsAnalysisBuildReportDoubaoModelConfig
  extends SiteDevToolsAnalysisBuildReportModelBaseConfig<'doubao'> {
  /**
   * Whether reasoning mode is enabled for this build-time analysis model.
   *
   * @default false
   */
  thinking?: SiteDevToolsAnalysisDoubaoThinkingType;
}

export type SiteDevToolsAnalysisBuildReportModelConfig =
  | SiteDevToolsAnalysisBuildReportClaudeModelConfig
  | SiteDevToolsAnalysisBuildReportDoubaoModelConfig;

export interface SiteDevToolsAnalysisClaudeProviderConfig
  extends SiteDevToolsAnalysisClaudeProviderInput {
  readonly [SiteDevToolsAnalysisProviderBrand]: true;
  readonly [SiteDevToolsAnalysisProviderType]: 'claude';
  readonly [SiteDevToolsAnalysisProviderKey]: string;
  /**
   * Creates a Claude build report model bound to this provider config.
   */
  model: (
    config: SiteDevToolsAnalysisBuildReportClaudeModelInput,
  ) => SiteDevToolsAnalysisBuildReportClaudeModelConfig;
}

export interface SiteDevToolsAnalysisDoubaoProviderConfig
  extends SiteDevToolsAnalysisDoubaoProviderInput {
  readonly [SiteDevToolsAnalysisProviderBrand]: true;
  readonly [SiteDevToolsAnalysisProviderType]: 'doubao';
  readonly [SiteDevToolsAnalysisProviderKey]: string;
  /**
   * Creates a Doubao build report model bound to this provider config.
   */
  model: (
    config: SiteDevToolsAnalysisBuildReportDoubaoModelInput,
  ) => SiteDevToolsAnalysisBuildReportDoubaoModelConfig;
}

export type SiteDevToolsAnalysisProviderConfig =
  | SiteDevToolsAnalysisClaudeProviderConfig
  | SiteDevToolsAnalysisDoubaoProviderConfig;

/**
 * Runtime-normalized provider config. Users should configure
 * providers with `claude.provider(...)` or `doubao.provider(...)` instead.
 */
export interface SiteDevToolsAnalysisResolvedProviderInstanceBaseConfig
  extends SiteDevToolsAnalysisProviderBaseConfig {
  /**
   * Internal provider config key generated from the public helper API.
   *
   * @internal
   */
  key: string;
  /**
   * Optional label shown in the debug console.
   */
  label?: string;
  /**
   * Marks this provider instance as the default for its provider group.
   */
  default?: boolean;
}

/**
 * Runtime-normalized Doubao provider config.
 */
export interface SiteDevToolsAnalysisResolvedDoubaoConfig
  extends SiteDevToolsAnalysisResolvedProviderInstanceBaseConfig {
  /**
   * Volcengine Ark API key used for ChatCompletions requests.
   */
  apiKey?: string;
  /**
   * Base URL for the Ark API endpoint.
   */
  baseUrl?: string;
}

/**
 * Runtime-normalized Claude provider config.
 */
export interface SiteDevToolsAnalysisResolvedClaudeConfig
  extends SiteDevToolsAnalysisResolvedProviderInstanceBaseConfig {
  /**
   * Anthropic API key used for Messages requests.
   */
  apiKey?: string;
  /**
   * Base URL for the Anthropic Messages API endpoint.
   *
   * @default 'https://api.anthropic.com/v1'
   */
  baseUrl?: string;
}

interface SiteDevToolsAnalysisResolvedBuildReportModelBaseConfig<
  Provider extends SiteDevToolsAnalysisProvider = SiteDevToolsAnalysisProvider,
> {
  /**
   * Internal stable identifier used to reference this build-time AI report model.
   *
   * @internal
   */
  id: string;
  /**
   * Provider group used by this build-time AI report model.
   */
  provider: Provider;
  /**
   * Internal provider config key used by this model.
   *
   * @internal
   */
  providerKey: string;
  /**
   * Marks this model as the default build-time AI report model.
   */
  default?: boolean;
  /**
   * Optional label shown in the debug console for the generated report.
   */
  label?: string;
  /**
   * Upper bound for generated output tokens in a single response.
   */
  maxTokens?: number;
  /**
   * Provider model used for this build-time analysis model.
   */
  model: string;
  /**
   * Sampling temperature for the generated analysis.
   * Lower values are more deterministic; higher values are more creative.
   */
  temperature?: number;
}

/**
 * Runtime-normalized Claude build report model config.
 */
export type SiteDevToolsAnalysisResolvedBuildReportClaudeModelConfig =
  SiteDevToolsAnalysisResolvedBuildReportModelBaseConfig<'claude'>;

/**
 * Runtime-normalized Doubao build report model config.
 */
export interface SiteDevToolsAnalysisResolvedBuildReportDoubaoModelConfig
  extends SiteDevToolsAnalysisResolvedBuildReportModelBaseConfig<'doubao'> {
  /**
   * Whether reasoning mode is enabled for this build-time analysis model.
   *
   * @default false
   */
  thinking?: SiteDevToolsAnalysisDoubaoThinkingType;
}

/**
 * Runtime-normalized build report model config.
 */
export type SiteDevToolsAnalysisResolvedBuildReportModelConfig =
  | SiteDevToolsAnalysisResolvedBuildReportClaudeModelConfig
  | SiteDevToolsAnalysisResolvedBuildReportDoubaoModelConfig;

export interface SiteDevToolsAnalysisBuildReportsPageContext {
  /**
   * VitePress page route, e.g. '/guide/getting-started'.
   */
  routePath: string;
  /**
   * Absolute file path of the page source.
   */
  filePath: string;
}

export interface SiteDevToolsAnalysisBuildReportsResolvePageContext {
  /**
   * Current eligible VitePress page being evaluated.
   */
  page: SiteDevToolsAnalysisBuildReportsPageContext;
  /**
   * All configured build-time AI report models.
   */
  models: readonly SiteDevToolsAnalysisBuildReportModelConfig[];
}

export interface SiteDevToolsAnalysisBuildReportsPageOverride {
  /**
   * Page-local cache behavior override.
   * When omitted, the global buildReports.cache setting is reused.
   * When an object is returned, unspecified fields inherit from the global
   * buildReports.cache object.
   */
  cache?: SiteDevToolsAnalysisBuildReportsCacheConfig;
  /**
   * Page-local chunk detail override.
   * When omitted, the global buildReports.includeChunks setting is reused.
   */
  includeChunks?: boolean;
  /**
   * Page-local module detail override.
   * When omitted, the global buildReports.includeModules setting is reused.
   */
  includeModules?: boolean;
  /**
   * Build report model used for this page.
   *
   * When omitted, the global default build report model is used.
   */
  model?: SiteDevToolsAnalysisBuildReportModelConfig;
}

/**
 * Runtime-normalized page override returned after resolving public
 * `resolvePage({ model })` selections.
 */
export interface SiteDevToolsAnalysisResolvedBuildReportsPageOverride {
  /**
   * Page-local cache behavior override.
   * When omitted, the global buildReports.cache setting is reused.
   * When an object is returned, unspecified fields inherit from the global
   * buildReports.cache object.
   */
  cache?: SiteDevToolsAnalysisBuildReportsCacheConfig;
  /**
   * Page-local chunk detail override.
   * When omitted, the global buildReports.includeChunks setting is reused.
   */
  includeChunks?: boolean;
  /**
   * Page-local module detail override.
   * When omitted, the global buildReports.includeModules setting is reused.
   */
  includeModules?: boolean;
  /**
   * Internal build report model id used for this page.
   *
   * @internal
   */
  modelId?: string;
  /**
   * True when resolvePage returned a model object that was not configured.
   *
   * @internal
   */
  invalidModelSelection?: boolean;
}

export interface SiteDevToolsAnalysisBuildReportsConfig {
  /**
   * Build-time AI report cache behavior.
   *
   * When omitted, defaults to `true`.
   *
   * - false: always regenerate reports during build.
   * - true: persist and reuse cached reports with default options.
   * - object: persist and reuse cached reports with custom options.
   *
   * @default true
   */
  cache?: SiteDevToolsAnalysisBuildReportsCacheConfig;
  /**
   * Explicit analysis models to execute during build.
   * When omitted or empty, build-time AI report generation is skipped.
   */
  models?: SiteDevToolsAnalysisBuildReportModelConfig[];
  /**
   * Resolves whether a specific eligible page should generate a build report.
   *
   * - return `undefined`, `null`, or `false`: skip build report generation
   *   for this page.
   * - return an object: generate a page report using the returned local overrides.
   *
   * When omitted, all eligible pages generate reports with the global defaults.
   */
  resolvePage?: (
    context: SiteDevToolsAnalysisBuildReportsResolvePageContext,
  ) => false | null | undefined | SiteDevToolsAnalysisBuildReportsPageOverride;
  /**
   * Includes chunk resource reports in the build output.
   *
   * @default false
   */
  includeChunks?: boolean;
  /**
   * Includes module source reports in the build output.
   *
   * @default false
   */
  includeModules?: boolean;
}

/**
 * Runtime-normalized build report resolvePage context.
 */
export interface SiteDevToolsAnalysisResolvedBuildReportsResolvePageContext {
  /**
   * Current eligible VitePress page being evaluated.
   */
  page: SiteDevToolsAnalysisBuildReportsPageContext;
  /**
   * All configured build-time AI report models.
   */
  models: readonly SiteDevToolsAnalysisResolvedBuildReportModelConfig[];
}

/**
 * Runtime-normalized buildReports config.
 */
export interface SiteDevToolsAnalysisResolvedBuildReportsConfig {
  /**
   * Build-time AI report cache behavior.
   */
  cache?: SiteDevToolsAnalysisBuildReportsCacheConfig;
  /**
   * Resolved analysis models to execute during build.
   */
  models?: SiteDevToolsAnalysisResolvedBuildReportModelConfig[];
  /**
   * Resolved page-level filter and override hook.
   */
  resolvePage?: (
    context: SiteDevToolsAnalysisResolvedBuildReportsResolvePageContext,
  ) =>
    | false
    | null
    | undefined
    | SiteDevToolsAnalysisResolvedBuildReportsPageOverride;
  /**
   * Includes chunk resource reports in the build output.
   *
   * @default false
   */
  includeChunks?: boolean;
  /**
   * Includes module source reports in the build output.
   *
   * @default false
   */
  includeModules?: boolean;
}

export interface SiteDevToolsAnalysisUserConfig {
  /**
   * Build-time analysis report generation for the debug console UI.
   */
  buildReports?: SiteDevToolsAnalysisBuildReportsConfig;
  providers?: SiteDevToolsAnalysisProviderConfig[];
}

/**
 * Runtime-normalized analysis config.
 */
export interface SiteDevToolsAnalysisResolvedUserConfig {
  /**
   * Build-time analysis report generation for the debug console UI.
   */
  buildReports?: SiteDevToolsAnalysisResolvedBuildReportsConfig;
  providers?: {
    claude?: SiteDevToolsAnalysisResolvedClaudeConfig[];
    doubao?: SiteDevToolsAnalysisResolvedDoubaoConfig[];
  };
}

export type SiteDevToolsAiProvider = SiteDevToolsAnalysisProvider;
export type SiteDevToolsAiDoubaoThinkingType =
  SiteDevToolsAnalysisDoubaoThinkingType;
export type SiteDevToolsAiProviderBaseConfig =
  SiteDevToolsAnalysisProviderBaseConfig;
export type SiteDevToolsAiProviderDisplayConfig =
  SiteDevToolsAnalysisProviderDisplayConfig;
export type SiteDevToolsAiClaudeProviderInput =
  SiteDevToolsAnalysisClaudeProviderInput;
export type SiteDevToolsAiDoubaoProviderInput =
  SiteDevToolsAnalysisDoubaoProviderInput;
export type SiteDevToolsAiClaudeConfig =
  SiteDevToolsAnalysisClaudeProviderConfig;
export type SiteDevToolsAiDoubaoConfig =
  SiteDevToolsAnalysisDoubaoProviderConfig;
export type SiteDevToolsAiProviderConfig = SiteDevToolsAnalysisProviderConfig;
export type SiteDevToolsAiBuildReportClaudeModelConfig =
  SiteDevToolsAnalysisBuildReportClaudeModelConfig;
export type SiteDevToolsAiBuildReportDoubaoModelConfig =
  SiteDevToolsAnalysisBuildReportDoubaoModelConfig;
export type SiteDevToolsAiBuildReportModelConfig =
  SiteDevToolsAnalysisBuildReportModelConfig;
export type SiteDevToolsAiBuildReportCacheStrategy =
  SiteDevToolsAnalysisBuildReportCacheStrategy;
export type SiteDevToolsAiBuildReportsCacheOptions =
  SiteDevToolsAnalysisBuildReportsCacheOptions;
export type SiteDevToolsAiBuildReportsCacheConfig =
  SiteDevToolsAnalysisBuildReportsCacheConfig;
export type SiteDevToolsAiBuildReportsPageContext =
  SiteDevToolsAnalysisBuildReportsPageContext;
export type SiteDevToolsAiBuildReportsResolvePageContext =
  SiteDevToolsAnalysisBuildReportsResolvePageContext;
export type SiteDevToolsAiBuildReportsPageOverride =
  SiteDevToolsAnalysisBuildReportsPageOverride;
export type SiteDevToolsAiBuildReportsConfig =
  SiteDevToolsAnalysisBuildReportsConfig;
export type SiteDevToolsAiUserConfig = SiteDevToolsAnalysisUserConfig;
/** Runtime-normalized internal alias. */
export type SiteDevToolsAiResolvedClaudeConfig =
  SiteDevToolsAnalysisResolvedClaudeConfig;
/** Runtime-normalized internal alias. */
export type SiteDevToolsAiResolvedDoubaoConfig =
  SiteDevToolsAnalysisResolvedDoubaoConfig;
/** Runtime-normalized internal alias. */
export type SiteDevToolsAiResolvedBuildReportClaudeModelConfig =
  SiteDevToolsAnalysisResolvedBuildReportClaudeModelConfig;
/** Runtime-normalized internal alias. */
export type SiteDevToolsAiResolvedBuildReportDoubaoModelConfig =
  SiteDevToolsAnalysisResolvedBuildReportDoubaoModelConfig;
/** Runtime-normalized internal alias. */
export type SiteDevToolsAiResolvedBuildReportModelConfig =
  SiteDevToolsAnalysisResolvedBuildReportModelConfig;
/** Runtime-normalized internal alias. */
export type SiteDevToolsAiResolvedBuildReportsConfig =
  SiteDevToolsAnalysisResolvedBuildReportsConfig;
/** Runtime-normalized internal alias. */
export type SiteDevToolsAiResolvedBuildReportsPageOverride =
  SiteDevToolsAnalysisResolvedBuildReportsPageOverride;
/** Runtime-normalized internal alias. */
export type SiteDevToolsAiResolvedUserConfig =
  SiteDevToolsAnalysisResolvedUserConfig;

export interface SiteDevToolsUserConfig {
  /**
   * Analysis integration for Site DevTools.
   */
  analysis?: SiteDevToolsAnalysisUserConfig;
}

/**
 * Runtime-normalized Site DevTools config.
 */
export interface SiteDevToolsResolvedUserConfig {
  /**
   * Resolved analysis integration for Site DevTools.
   */
  analysis?: SiteDevToolsAnalysisResolvedUserConfig;
}

export type LoggingVisibilityLevel = 'error' | 'warn' | 'info' | 'success';

export interface LoggingRuleUserConfig {
  enabled?: boolean;
  group?: string;
  /**
   * Stable unique identifier for this rule.
   *
   * When `logging.debug` is enabled, emitted logs surface the matched rule label
   * as `[rule:<label>]` before the message body so it is clear which rule won.
   */
  label: string;
  levels?: LoggingVisibilityLevel[];
  main?: string;
  message?: string;
}

export interface LoggingPresetRuleUserConfig {
  group?: string;
  levels?: LoggingVisibilityLevel[];
  main?: string;
  message?: string;
}

export interface LoggingPresetPlugin {
  rules: Record<string, LoggingPresetRuleUserConfig>;
}

export interface LoggingPresetRuleOverrideUserConfig {
  enabled?: boolean;
  levels?: LoggingVisibilityLevel[];
  message?: string;
}

export type LoggingPresetRuleSetting =
  | false
  | 'off'
  | LoggingPresetRuleOverrideUserConfig;

export type LoggingPresetRulesUserConfig = Record<
  string,
  LoggingPresetRuleSetting
>;

export interface LoggingUserConfig {
  /**
   * Global debug gate for project-owned debug logs.
   *
   * When omitted, debug logs stay disabled.
   */
  debug?: boolean;
  levels?: LoggingVisibilityLevel[];
  plugins?: Record<string, LoggingPresetPlugin>;
  rules?: LoggingRuleUserConfig[] | LoggingPresetRulesUserConfig;
}

export interface ConfigType {
  root: string;
  outDir: string;
  base: string;
  srcDir: string;
  assetsDir: string;
  mpa: boolean;
  publicDir: string;
  cacheDir: string;
  cleanUrls: boolean;
  siteDevtools: SiteDevToolsResolvedUserConfig;
  wrapBaseUrl: (path: string) => string;
}
