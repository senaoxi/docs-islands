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
  /**
   * Pre-filter switch for this rule.
   *
   * `false` makes the rule fully inactive: it does not match scope, does not
   * allow levels, and does not appear in debug labels.
   *
   * @default true
   */
  enabled?: boolean;
  /**
   * Logger group matcher.
   *
   * Plain strings are exact matches. Patterns containing glob magic use
   * picomatch, for example `runtime.react.*`, `test.case.?1`, or `task-[ab]`.
   */
  group?: string;
  /**
   * Stable unique identifier for this rule.
   *
   * When `logging.debug` is enabled, visible logs surface every contributing
   * rule label as `[LabelA][LabelB]` before the normal log prefix.
   */
  label: string;
  /**
   * Effective levels for this rule.
   *
   * When omitted, the rule inherits `logging.levels`. When present, it replaces
   * the root levels for this rule and contributes to the union with other
   * matching active rules.
   */
  levels?: LoggingVisibilityLevel[];
  /**
   * Exact package-name matcher, for example `@docs-islands/vitepress`.
   *
   * `main` does not use glob matching.
   */
  main?: string;
  /**
   * Log message matcher.
   *
   * Plain strings are exact matches. Patterns containing glob magic use
   * picomatch, for example `*timeout*`, `request *`, or `task-[ab]`.
   */
  message?: string;
}

export interface LoggingPresetRuleUserConfig {
  /**
   * Logger group matcher used by a logging preset rule.
   */
  group?: string;
  /**
   * Effective levels contributed by the preset rule.
   *
   * When omitted, the rule inherits `logging.levels`.
   */
  levels?: LoggingVisibilityLevel[];
  /**
   * Exact package-name matcher used by the preset rule.
   */
  main?: string;
  /**
   * Optional log message matcher used by the preset rule.
   */
  message?: string;
}

export interface LoggingPresetPlugin {
  /**
   * Plugin-exposed logging rules keyed by `<rule>` and consumed through
   * `logging.rules["<plugin>/<rule>"]`.
   */
  rules: Record<string, LoggingPresetRuleUserConfig>;
}

export interface LoggingPresetRuleOverrideUserConfig {
  /**
   * Pre-filter switch for this preset-backed rule.
   *
   * `false` disables the rule entirely after it inherits the preset matcher.
   */
  enabled?: boolean;
  /**
   * Effective levels contributed by this preset-backed rule override.
   *
   * When omitted, the preset rule keeps its own levels and then falls back to
   * `logging.levels` if needed.
   */
  levels?: LoggingVisibilityLevel[];
  /**
   * Optional message matcher override.
   *
   * `group` and `main` always inherit from the preset rule.
   */
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
   * When enabled, visible `error`, `warn`, `info`, and `success` logs include
   * contributing rule labels and a relative elapsed-time suffix such as
   * `12.34ms`. `debug` logs are visible by default only when `rules` are not
   * configured.
   *
   * @default false
   */
  debug?: boolean;
  /**
   * Root visibility levels.
   *
   * Without `rules`, this controls the visible non-debug levels. With `rules`,
   * it is the default effective levels for rules that omit `rule.levels`; it is
   * not a maximum that narrows explicit `rule.levels`.
   *
   * @default ['error', 'warn', 'info', 'success']
   */
  levels?: LoggingVisibilityLevel[];
  /**
   * Optional logging preset plugins, similar to ESLint plugins.
   *
   * The object key becomes the `<plugin>` namespace referenced by
   * `logging.rules["<plugin>/<rule>"]`.
   */
  plugins?: Record<string, LoggingPresetPlugin>;
  /**
   * Rule-mode visibility configuration.
   *
   * Supports two forms:
   *
   * - array: direct low-level logger rules
   * - object: plugin rule settings keyed by `<plugin>/<rule>`
   */
  rules?: LoggingRuleUserConfig[] | LoggingPresetRulesUserConfig;
}

declare module 'vitepress' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- must match upstream VitePress generic default for declaration merging
  interface UserConfig<ThemeConfig = any> {
    themeConfig?: ThemeConfig;
    siteDevtools?: SiteDevToolsUserConfig;
  }
}
