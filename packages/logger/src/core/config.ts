// @ts-expect-error -- picomatch v4 does not ship TypeScript declarations.
import rawPicomatch from 'picomatch';

import {
  DEFAULT_RESOLVED_LEVELS,
  LOG_KIND_TO_LEVEL,
} from '../constants/levels';
import type {
  LoggerConfig,
  LoggerConfigRegistryEntry,
  LoggerContext,
  LoggerPluginMap,
  LoggerPresetConfig,
  LoggerRuleSetting,
  LoggerRuleUserConfig,
  LoggerScopeId,
  LoggerVisibilityLevel,
  LogKind,
  NormalizedLoggerConfig,
  NormalizedLoggerRule,
  ResolvedLoggerContext,
  ResolvedLoggerRule,
} from '../types';
import {
  normalizeActivePresetConfig,
  normalizeLoggerExtends,
  normalizeLoggerGroup,
  normalizeLoggerLevelsArray,
  normalizeLoggerMain,
  normalizeLoggerRuleEntryReference,
  normalizeLoggingPlugins,
  normalizePluginNamespace,
  normalizePresetConfigRuleName,
  normalizeResolvedLoggerRule,
  normalizeRuleBody,
} from './helper/normalize';
import {
  DEFAULT_LOGGER_SCOPE_ID,
  normalizeLoggerScopeId,
} from './helper/scope';

export const DEFAULT_LOGGER_CONFIG: LoggerConfig = {
  levels: ['info', 'success', 'warn', 'error'],
};

const GLOB_PATTERN_RE = /[!()*+?[\]{}]/;
const PLUGIN_RULE_REFERENCE_SEPARATOR = '/';

const picomatch = rawPicomatch as unknown as (
  pattern: string | readonly string[],
) => (value: string) => boolean;

let hasSyncedRuntimeDefinedDefaultLoggerConfig = false;

const CONTROLLED_LOGGER_CONFIG_ERROR =
  '@docs-islands/logger is controlled by loggerPlugin.vite({ config }). setLoggerConfig(...) and resetLoggerConfig() cannot be used in this runtime; update the loggerPlugin.vite({ config }) option in your bundler config instead.';
const createMissingScopedLoggerConfigError = (scopeId: LoggerScopeId): string =>
  `Logger config for scope "${scopeId}" is not registered in this runtime. Call setScopedLoggerConfig(scopeId, config) before creating a scoped logger.`;

declare const __DOCS_ISLANDS_DEFAULT_LOGGER_CONTROLLED__: boolean | undefined;
declare const __DOCS_ISLANDS_DEFAULT_LOGGER_CONFIG__:
  | LoggerConfig
  | null
  | undefined;

interface LoggerRuleEntry {
  reference: string;
  setting: LoggerRuleSetting | undefined;
  source: string;
}

const createPatternMatcher = (
  pattern: string,
  mode: 'group' | 'message',
): ((value: string) => boolean) => {
  if (
    (mode === 'group' || mode === 'message') &&
    !GLOB_PATTERN_RE.test(pattern)
  ) {
    return (value) => value === pattern;
  }

  const matcher = picomatch(pattern);

  return (value) => matcher(value);
};

const createNormalizedLoggerRule = (
  rule: ResolvedLoggerRule,
): NormalizedLoggerRule => ({
  ...(rule.group
    ? { groupMatcher: createPatternMatcher(rule.group, 'group') }
    : {}),
  label: rule.label,
  ...(rule.levels === undefined
    ? {}
    : { levels: normalizeLoggerLevelsArray(rule.levels) }),
  ...(rule.main ? { main: rule.main } : {}),
  ...(rule.message
    ? { messageMatcher: createPatternMatcher(rule.message, 'message') }
    : {}),
});

const createDefaultResolvedLevels = (): LoggerVisibilityLevel[] => [
  ...DEFAULT_RESOLVED_LEVELS,
];

const includesLoggerLevel = (
  levels: readonly LoggerVisibilityLevel[],
  level: LoggerVisibilityLevel,
): boolean => levels.includes(level);

export const isLoggerControlled = (): boolean => {
  if (typeof __DOCS_ISLANDS_DEFAULT_LOGGER_CONTROLLED__ === 'boolean') {
    return __DOCS_ISLANDS_DEFAULT_LOGGER_CONTROLLED__ === true;
  }
  return false;
};

const getLoggerConfigRegistry = (): Map<
  LoggerScopeId,
  LoggerConfigRegistryEntry
> => {
  const loggerGlobal = globalThis as typeof globalThis & {
    __DOCS_ISLANDS_LOGGER_CONFIG_REGISTRY__?: Map<
      LoggerScopeId,
      LoggerConfigRegistryEntry
    >;
  };

  loggerGlobal.__DOCS_ISLANDS_LOGGER_CONFIG_REGISTRY__ ??= new Map();
  return loggerGlobal.__DOCS_ISLANDS_LOGGER_CONFIG_REGISTRY__;
};

const createLoggerConfigRegistryEntry = (
  config: LoggerConfig,
): LoggerConfigRegistryEntry => {
  return {
    compiledConfig: resolveLoggerConfig(config),
    config,
  };
};

const readDefaultRuntimeLoggerConfig = (): LoggerConfig | null | undefined => {
  if (typeof __DOCS_ISLANDS_DEFAULT_LOGGER_CONFIG__ === 'object') {
    return __DOCS_ISLANDS_DEFAULT_LOGGER_CONFIG__;
  }
  return undefined;
};

const applyScopedLoggerConfig = (
  scopeId: LoggerScopeId,
  config: LoggerConfig,
): void => {
  const normalizedScopeId = normalizeLoggerScopeId(scopeId);

  getLoggerConfigRegistry().set(
    normalizedScopeId,
    createLoggerConfigRegistryEntry(config),
  );
};

const syncRuntimeDefinedDefaultLoggerConfig = (): void => {
  const registry = getLoggerConfigRegistry();

  if (
    hasSyncedRuntimeDefinedDefaultLoggerConfig &&
    registry.has(DEFAULT_LOGGER_SCOPE_ID)
  ) {
    return;
  }

  if (registry.has(DEFAULT_LOGGER_SCOPE_ID)) {
    hasSyncedRuntimeDefinedDefaultLoggerConfig = true;
    return;
  }

  const runtimeDefinedDefaultLoggerConfig = readDefaultRuntimeLoggerConfig();

  hasSyncedRuntimeDefinedDefaultLoggerConfig = true;
  applyScopedLoggerConfig(
    DEFAULT_LOGGER_SCOPE_ID,
    runtimeDefinedDefaultLoggerConfig ?? DEFAULT_LOGGER_CONFIG,
  );
};

export const assertLoggerConfigRegisteredForScope = (
  scopeId?: LoggerScopeId,
): LoggerScopeId => {
  const normalizedScopeId = normalizeLoggerScopeId(scopeId);

  if (normalizedScopeId === DEFAULT_LOGGER_SCOPE_ID) {
    syncRuntimeDefinedDefaultLoggerConfig();
    return normalizedScopeId;
  }

  if (getLoggerConfigRegistry().has(normalizedScopeId)) {
    return normalizedScopeId;
  }

  throw new Error(createMissingScopedLoggerConfigError(normalizedScopeId));
};

const getCompiledLoggerConfigForScope = (
  scopeId?: LoggerScopeId,
): NormalizedLoggerConfig | null => {
  const normalizedScopeId = normalizeLoggerScopeId(scopeId);

  if (normalizedScopeId === DEFAULT_LOGGER_SCOPE_ID) {
    syncRuntimeDefinedDefaultLoggerConfig();
  }

  const registry = getLoggerConfigRegistry();

  if (!registry.has(normalizedScopeId)) {
    throw new Error(createMissingScopedLoggerConfigError(normalizedScopeId));
  }

  return registry.get(normalizedScopeId)?.compiledConfig ?? null;
};

const matchesLoggerRule = (
  rule: NormalizedLoggerRule,
  context: LoggerContext,
): boolean => {
  if (rule.main && rule.main !== context.main) {
    return false;
  }

  if (rule.groupMatcher && !rule.groupMatcher(context.group)) {
    return false;
  }

  if (rule.messageMatcher && !rule.messageMatcher(context.message)) {
    return false;
  }

  return true;
};

const getRuleEffectiveLevels = (
  rule: NormalizedLoggerRule,
  config: NormalizedLoggerConfig,
): readonly LoggerVisibilityLevel[] => {
  if (rule.levels !== undefined) {
    return rule.levels;
  }

  if (config.levels !== undefined) {
    return config.levels;
  }

  return createDefaultResolvedLevels();
};

export const resolveLoggerContext = (
  context: LoggerContext,
  scopeId?: LoggerScopeId,
): ResolvedLoggerContext => {
  const config = getCompiledLoggerConfigForScope(scopeId);
  const baseEnabledLevels = config?.levels || createDefaultResolvedLevels();
  const baseDebugEnabled = config?.debug ?? false;
  const hasRules = config?.rules !== undefined;

  if (context.kind === 'debug') {
    return {
      appendElapsedTime: false,
      ruleLabels: [],
      suppress: hasRules || !baseDebugEnabled,
    };
  }

  const level = LOG_KIND_TO_LEVEL[context.kind];

  if (!hasRules) {
    return {
      appendElapsedTime: baseDebugEnabled,
      ruleLabels: [],
      suppress: !includesLoggerLevel(baseEnabledLevels, level),
    };
  }

  const matchedRules = (config.rules ?? []).filter((rule) =>
    matchesLoggerRule(rule, context),
  );
  const contributingRules = matchedRules.filter((rule) =>
    includesLoggerLevel(getRuleEffectiveLevels(rule, config), level),
  );

  return {
    appendElapsedTime: baseDebugEnabled && contributingRules.length > 0,
    ruleLabels: baseDebugEnabled
      ? contributingRules.map((rule) => rule.label)
      : [],
    suppress: contributingRules.length === 0,
  };
};

/**
 * Retrieves the raw logger configuration for a specific scope.
 *
 * @param scopeId - The identifier for the logger scope
 * @returns The raw logger configuration if registered for the scope, undefined otherwise
 */
export function getScopedLoggerConfig(
  scopeId: LoggerScopeId,
): LoggerConfig | undefined {
  const normalizedScopeId = normalizeLoggerScopeId(scopeId);

  if (normalizedScopeId === DEFAULT_LOGGER_SCOPE_ID) {
    syncRuntimeDefinedDefaultLoggerConfig();
  }

  const registry = getLoggerConfigRegistry();

  if (registry.has(normalizedScopeId)) {
    return registry.get(normalizedScopeId)?.config;
  }

  return undefined;
}

/**
 * Sets the logger configuration for a specific scope.
 *
 * The configuration will be normalized and compiled for runtime use. This method
 * is particularly useful for applying scope-specific logging rules that differ
 * from the default logger configuration.
 *
 * @param scopeId - The identifier for the logger scope
 * @param config - The logger configuration to apply for this scope
 * @throws {Error} If the logger is controlled by the vite plugin and config cannot be modified directly
 */
export function setScopedLoggerConfig(
  scopeId: LoggerScopeId,
  config: LoggerConfig,
): void {
  const normalizedScopeId = normalizeLoggerScopeId(scopeId);

  if (normalizedScopeId === DEFAULT_LOGGER_SCOPE_ID) {
    hasSyncedRuntimeDefinedDefaultLoggerConfig = true;
  }

  applyScopedLoggerConfig(normalizedScopeId, config);
}

/**
 * Resets the logger configuration for a specific scope to its initial state.
 *
 * After calling this function, the scope will use the default configuration
 * until a new configuration is applied via setScopedLoggerConfig().
 *
 * @param scopeId - The identifier for the logger scope to reset
 */
export function resetScopedLoggerConfig(scopeId: LoggerScopeId): void {
  const normalizedScopeId = normalizeLoggerScopeId(scopeId);

  if (normalizedScopeId === DEFAULT_LOGGER_SCOPE_ID) {
    hasSyncedRuntimeDefinedDefaultLoggerConfig = false;
  }

  getLoggerConfigRegistry().delete(normalizedScopeId);
}

/**
 * Updates the logger configuration for the default logger scope.
 *
 * This function is primarily intended for direct logger usage outside any runtime
 * with an injected logger scope (such as createDocsIslands()). It provides a simple
 * way to configure logging behavior for the application's default scope.
 *
 * When the logger is controlled by the vite plugin configuration, this method
 * cannot be used; instead, update the loggerPlugin.vite({ config }) option
 * in your bundler configuration.
 *
 * @param config - The logger configuration to apply globally
 * @throws {Error} If the logger is controlled by the vite plugin and config cannot be modified directly
 *
 * @example
 * ```ts
 * setLoggerConfig({
 *   levels: ['error', 'warn'],
 *   rules: {
 *     'build-info': { group: 'build', levels: ['info'] },
 *   },
 * });
 * ```
 */
export function setLoggerConfig(config: LoggerConfig): void {
  if (isLoggerControlled()) {
    throw new Error(CONTROLLED_LOGGER_CONFIG_ERROR);
  }

  setScopedLoggerConfig(DEFAULT_LOGGER_SCOPE_ID, config);
}

/**
 * Resets the logger configuration for the default logger scope to its initial state.
 *
 * After calling this function, the default scope will revert to the built-in
 * default configuration until a new configuration is applied via setLoggerConfig().
 *
 * This function cannot be used when the logger is controlled by the vite plugin.
 *
 * @throws {Error} If the logger is controlled by the vite plugin and config cannot be modified directly
 */
export function resetLoggerConfig(): void {
  if (isLoggerControlled()) {
    throw new Error(CONTROLLED_LOGGER_CONFIG_ERROR);
  }

  resetScopedLoggerConfig(DEFAULT_LOGGER_SCOPE_ID);
}

/**
 * Determines whether a log message should be suppressed based on the current configuration.
 *
 * This function evaluates the log kind (info, warn, error, success, debug) against
 * the configured visibility levels and matching rules to determine if the message
 * should be output or filtered out.
 *
 * @param kind - The type of log message (info, warn, error, success, or debug)
 * @param options - The log context including group, main module name, and optional message pattern
 * @param scopeId - Optional logger scope identifier; uses default scope if not provided
 * @returns true if the log should be suppressed (not output), false if it should be shown
 *
 * @example
 * ```ts
 * // Suppress logs for a specific group
 * const suppress = shouldSuppressLog('info', {
 *   group: 'vitepress',
 *   main: 'build',
 *   message: 'Starting build',
 * });
 * ```
 */
export function shouldSuppressLog(
  kind: LogKind,
  options: {
    group: string;
    main: string;
    message?: string;
  },
  scopeId?: LoggerScopeId,
): boolean {
  return resolveLoggerContext(
    {
      group: normalizeLoggerGroup(options.group),
      kind,
      main: normalizeLoggerMain(options.main),
      message: options.message ?? '',
    },
    scopeId,
  ).suppress;
}

function parsePluginRuleReference(ruleReference: string): {
  namespace: string;
  ruleName: string;
} {
  const separatorIndex = ruleReference.indexOf(PLUGIN_RULE_REFERENCE_SEPARATOR);

  if (separatorIndex <= 0 || separatorIndex === ruleReference.length - 1) {
    throw new Error(
      `logger.rules key "${ruleReference}" must use "<plugin>/<rule>" format.`,
    );
  }

  const namespace = normalizePluginNamespace(
    ruleReference.slice(0, separatorIndex),
  );
  const ruleName = ruleReference.slice(separatorIndex + 1).trim();

  if (!ruleName) {
    throw new Error(
      `logger.rules key "${ruleReference}" must reference a non-empty plugin rule name.`,
    );
  }

  return {
    namespace,
    ruleName,
  };
}

function validatePluginRuleReference(
  plugins: LoggerPluginMap,
  ruleReference: string,
): {
  namespace: string;
  ruleName: string;
} {
  const { namespace, ruleName } = parsePluginRuleReference(ruleReference);
  const plugin = plugins[namespace];

  if (!plugin) {
    throw new Error(
      `logger.rules key "${ruleReference}" references unknown logger plugin "${namespace}".`,
    );
  }

  if (!Object.hasOwn(plugin.rules, ruleName)) {
    throw new Error(
      `logger.rules key "${ruleReference}" references unknown logger plugin rule "${ruleName}".`,
    );
  }

  return {
    namespace,
    ruleName,
  };
}

function setMergedRuleEntry(
  entries: Map<string, LoggerRuleEntry>,
  entry: LoggerRuleEntry,
): void {
  if (entry.setting === 'off') {
    entries.delete(entry.reference);
    return;
  }

  if (entries.has(entry.reference)) {
    const existEntry = entries.get(entry.reference);
    const existSetting = (existEntry?.setting ?? {}) as LoggerRuleUserConfig;
    const newSetting = (entry?.setting ?? {}) as LoggerRuleUserConfig;

    if (entry.reference.includes(PLUGIN_RULE_REFERENCE_SEPARATOR)) {
      const freezeSettingFields = new Set(['main', 'group']);
      for (const [key, val] of Object.entries(newSetting)) {
        if (freezeSettingFields.has(key)) {
          throw new Error(
            `The user rule cannot override "${entry.reference}" plugin rule's main and group fields.`,
          );
        }
        existSetting[key as keyof LoggerRuleUserConfig] = val;
      }
    } else {
      entry.setting = {
        ...existSetting,
        ...newSetting,
      };
    }
  } else {
    entries.set(entry.reference, entry);
  }
}

function parsePluginConfigReference(configReference: string): {
  configName: string;
  namespace: string;
} {
  const separatorIndex = configReference.indexOf(
    PLUGIN_RULE_REFERENCE_SEPARATOR,
  );

  if (separatorIndex <= 0 || separatorIndex === configReference.length - 1) {
    throw new Error(
      `logger.extends entry "${configReference}" must use "<plugin>/<config>" format.`,
    );
  }

  const namespace = normalizePluginNamespace(
    configReference.slice(0, separatorIndex),
  );
  const configName = configReference.slice(separatorIndex + 1).trim();

  if (!configName) {
    throw new Error(
      `logger.extends entry "${configReference}" must reference a non-empty plugin config name.`,
    );
  }

  return {
    configName,
    namespace,
  };
}

function expandLoggerExtends(
  plugins: LoggerPluginMap,
  extendsReferences: LoggerConfig['extends'],
): LoggerRuleEntry[] {
  const entries: LoggerRuleEntry[] = [];

  for (const extendsReference of normalizeLoggerExtends(extendsReferences)) {
    const { configName, namespace } =
      parsePluginConfigReference(extendsReference);
    const plugin = plugins[namespace];

    if (!plugin) {
      throw new Error(
        `logger.extends entry "${extendsReference}" references unknown logger plugin "${namespace}".`,
      );
    }

    if (!plugin.configs || !Object.hasOwn(plugin.configs, configName)) {
      throw new Error(
        `logger.extends entry "${extendsReference}" references unknown logger plugin config "${configName}".`,
      );
    }

    const rawPresetConfig = plugin.configs[configName];
    const presetConfig = normalizeActivePresetConfig(
      namespace,
      configName,
      rawPresetConfig,
    );
    const source = `logger.plugins["${namespace}"].configs["${configName}"].rules`;
    const normalizedConfigRules: LoggerPresetConfig['rules'] = {};

    for (const [rawRuleName, setting] of Object.entries(
      presetConfig.rules ?? {},
    )) {
      const ruleName = normalizePresetConfigRuleName(source, rawRuleName);

      if (Object.hasOwn(normalizedConfigRules, ruleName)) {
        throw new Error(`Duplicate ${source} key "${ruleName}".`);
      }

      if (!Object.hasOwn(plugin.rules, ruleName)) {
        throw new Error(
          `${source} key "${ruleName}" references unknown local plugin rule "${ruleName}".`,
        );
      }

      const ruleReference = `${namespace}/${ruleName}`;

      normalizeRuleBody(ruleReference, setting as LoggerRuleSetting, source);
      normalizedConfigRules[ruleName] = setting as LoggerRuleSetting;

      entries.push({
        reference: ruleReference,
        setting: setting as LoggerRuleEntry['setting'],
        source,
      });
    }
  }

  return entries;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readLoggerRuleEntries(
  rules: LoggerConfig['rules'],
  source: string,
): LoggerRuleEntry[] | undefined {
  if (rules === undefined) {
    return undefined;
  }

  if (Array.isArray(rules)) {
    throw new TypeError(`${source} must be an object map, not an array.`);
  }

  if (!isRecord(rules)) {
    throw new Error(`${source} must be an object map.`);
  }

  return Object.entries(rules).map(([reference, setting]) => {
    const normalizedReference = normalizeLoggerRuleEntryReference(
      source,
      reference,
    );

    return {
      reference: normalizedReference,
      setting: setting as LoggerRuleEntry['setting'],
      source,
    };
  });
}

function mergeLoggerRuleEntries<TPlugins extends LoggerPluginMap>(
  plugins: LoggerPluginMap,
  config: LoggerConfig<TPlugins>,
): LoggerRuleEntry[] {
  const mergedEntries = new Map<string, LoggerRuleEntry>();

  for (const entry of expandLoggerExtends(plugins, config.extends)) {
    setMergedRuleEntry(mergedEntries, entry);
  }

  const userEntries = readLoggerRuleEntries(config.rules, 'logger.rules') ?? [];

  for (const entry of userEntries) {
    if (entry.reference.includes(PLUGIN_RULE_REFERENCE_SEPARATOR)) {
      validatePluginRuleReference(plugins, entry.reference);
    }

    setMergedRuleEntry(mergedEntries, entry);
  }

  return [...mergedEntries.values()];
}

function expandPluginRule(
  plugins: LoggerPluginMap,
  entry: LoggerRuleEntry,
): ResolvedLoggerRule | undefined {
  const { reference: ruleReference, setting, source } = entry;
  const { namespace, ruleName } = validatePluginRuleReference(
    plugins,
    ruleReference,
  );
  const body = normalizeRuleBody(ruleReference, setting, source);

  if (!body) {
    return undefined;
  }

  const { group, main, message } = plugins[namespace].rules[ruleName];

  return {
    label: `${namespace}/${ruleName}`,
    ...(group === undefined ? {} : { group }),
    ...(main === undefined ? {} : { main }),
    ...(message === undefined ? {} : { message }),
    ...body,
  };
}

function expandCustomRule(
  entry: LoggerRuleEntry,
): ResolvedLoggerRule | undefined {
  const { reference: ruleReference, setting, source } = entry;
  const body = normalizeRuleBody(ruleReference, setting, source);

  if (!body) {
    return undefined;
  }

  return {
    label: ruleReference,
    ...body,
  };
}

function expandLoggerRules<TPlugins extends LoggerPluginMap>(
  plugins: LoggerPluginMap,
  config: LoggerConfig<TPlugins>,
): ResolvedLoggerRule[] | undefined {
  return mergeLoggerRuleEntries(plugins, config)
    .map((entry) =>
      entry.reference.includes(PLUGIN_RULE_REFERENCE_SEPARATOR)
        ? expandPluginRule(plugins, entry)
        : expandCustomRule(entry),
    )
    .filter((rule): rule is ResolvedLoggerRule => Boolean(rule));
}

function assertUniqueLoggerRuleLabels(
  rules: ResolvedLoggerRule[] | undefined,
): void {
  if (!rules || rules.length === 0) {
    return;
  }

  const seenLabels = new Set<string>();

  for (const rule of rules) {
    if (seenLabels.has(rule.label)) {
      throw new Error(
        `Logger rule label "${rule.label}" must be unique within logger.rules.`,
      );
    }

    seenLabels.add(rule.label);
  }
}

/**
 * Resolves a logger configuration object into the runtime matching shape.
 *
 * This function processes user-provided logger configuration by:
 * - Normalizing plugin definitions and merging plugin-based rule presets
 * - Expanding rule references to their full definitions
 * - Validating rule labels for uniqueness
 * - Normalizing log levels to a consistent format
 * - Creating matcher functions for group and message rules
 *
 * The resolved configuration is ready for runtime rule matching.
 *
 * @param config - The logger configuration object containing plugins, rules, levels, and debug settings
 * @returns A normalized and validated logger configuration ready for runtime use
 *
 * @example
 * ```ts
 * const resolved = resolveLoggerConfig({
 *   levels: ['error', 'warn'],
 *   rules: {
 *     'my-rule': { message: '*.test', levels: ['error'] },
 *   },
 * });
 * ```
 */
export function resolveLoggerConfig<
  TPlugins extends LoggerPluginMap = LoggerPluginMap,
>(config: LoggerConfig<TPlugins>): NormalizedLoggerConfig {
  const normalizedPlugins = normalizeLoggingPlugins(config.plugins);
  /**
   * The value of `levels` must be either `undefined` or a valid array format.
   * When the value is `undefined`, it means all logs are allowed.
   */
  const normalizedLevels =
    config.levels === undefined
      ? createDefaultResolvedLevels()
      : (normalizeLoggerLevelsArray(config.levels) ?? []);
  const resolvedRules = expandLoggerRules(normalizedPlugins, config)
    ?.map((rule) => normalizeResolvedLoggerRule(rule))
    .filter((rule): rule is ResolvedLoggerRule => Boolean(rule));

  assertUniqueLoggerRuleLabels(resolvedRules);

  return {
    ...(config.debug === undefined ? {} : { debug: config.debug }),
    levels: normalizedLevels,
    ...(resolvedRules && resolvedRules.length > 0
      ? {
          rules: resolvedRules.map((rule) => createNormalizedLoggerRule(rule)),
        }
      : {}),
  };
}
