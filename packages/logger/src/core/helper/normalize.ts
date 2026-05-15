import {
  DEFAULT_RESOLVED_LEVELS,
  ROOT_LOGGER_RULE_LABEL,
} from '../../constants/levels';
import type {
  LoggerConfig,
  LoggerPluginMap,
  LoggerPresetConfig,
  LoggerPresetPlugin,
  LoggerPresetRuleUserConfig,
  LoggerRuleSetting,
  LoggerRuleUserConfig,
  LoggerVisibilityLevel,
  ResolvedLoggerRule,
} from '../../types';

const GROUP_NAME_RE =
  /^[\da-z]+(?:[_-][\da-z]+)*(?:\.[\da-z]+(?:[_-][\da-z]+)*)*$/;
const PLUGIN_RULE_REFERENCE_SEPARATOR = '/';
const PLUGIN_CONFIG_KEYS = new Set(['rules']);
const PLUGIN_RULE_TEMPLATE_KEYS = new Set([
  'main',
  'group',
  'message',
  'levels',
]);
const RULE_BODY_KEYS = new Set(['main', 'group', 'message', 'levels']);
const RESOLVED_RULE_KEYS = new Set([
  'group',
  'label',
  'levels',
  'main',
  'message',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export const normalizeLoggerMain = (main: string): string => {
  const normalizedMain = main.trim();

  if (!normalizedMain) {
    throw new Error('Logger main must be a non-empty package name.');
  }

  return normalizedMain;
};

export const normalizeLoggerGroup = (group: string): string => {
  const normalizedGroup = group.trim();

  if (!normalizedGroup) {
    throw new Error('Logger group must be a non-empty string.');
  }

  if (
    !GROUP_NAME_RE.test(normalizedGroup) ||
    normalizedGroup.includes('@') ||
    normalizedGroup.includes(':')
  ) {
    throw new Error(
      `Logger group "${normalizedGroup}" must use lowercase dot namespaces without package identifiers.`,
    );
  }

  return normalizedGroup;
};

const normalizeStringValue = (
  value: string | undefined,
): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalizedValue = value.trim();

  return normalizedValue || undefined;
};

const normalizeLoggerRuleLabel = (label: string | undefined): string => {
  const normalizedLabel = normalizeStringValue(label);

  if (!normalizedLabel) {
    throw new Error('Every logger rule must provide a non-empty label.');
  }

  if (normalizedLabel === ROOT_LOGGER_RULE_LABEL) {
    throw new Error(
      `Logger rule label "${ROOT_LOGGER_RULE_LABEL}" is reserved for the root logging baseline.`,
    );
  }

  return normalizedLabel;
};

export const normalizeLoggerLevelsArray = (
  levels: LoggerVisibilityLevel[],
): LoggerVisibilityLevel[] => {
  if (!Array.isArray(levels)) {
    throw new TypeError(
      'The root-level "levels" field should either be undefined or filled with an array format.',
    );
  }

  const normalizedLevels: LoggerVisibilityLevel[] = [];
  const seenLevels = new Set<LoggerVisibilityLevel>();

  for (const level of levels) {
    if (!DEFAULT_RESOLVED_LEVELS.has(level)) {
      throw new TypeError(`Not supported to parse ${level}.`);
    }

    if (seenLevels.has(level)) {
      throw new TypeError(`Duplicate level ${level} are present.`);
    }

    seenLevels.add(level);
    normalizedLevels.push(level);
  }

  return normalizedLevels;
};

export const normalizeResolvedLoggerRule = (
  rule: ResolvedLoggerRule,
): ResolvedLoggerRule | undefined => {
  if (!isRecord(rule)) {
    throw new TypeError('Every resolved logger rule must be an object.');
  }

  const invalidKeys = Object.keys(rule).filter(
    (key) => !RESOLVED_RULE_KEYS.has(key),
  );

  if (invalidKeys.length > 0) {
    throw new Error(
      'Resolved logger rules only support "label", "main", "group", "message", and "levels".',
    );
  }

  const normalizedLabel = normalizeLoggerRuleLabel(rule.label as string);
  const normalizedMain =
    typeof rule.main === 'string' ? normalizeLoggerMain(rule.main) : undefined;
  const normalizedGroup =
    typeof rule.group === 'string'
      ? normalizeStringValue(rule.group)
      : undefined;
  const normalizedMessage =
    typeof rule.message === 'string'
      ? normalizeStringValue(rule.message)
      : undefined;
  const normalizedLevels =
    rule.levels === undefined
      ? undefined
      : (normalizeLoggerLevelsArray(rule.levels) ?? []);

  return {
    ...(normalizedGroup === undefined ? {} : { group: normalizedGroup }),
    label: normalizedLabel,
    ...(normalizedLevels === undefined ? {} : { levels: normalizedLevels }),
    ...(normalizedMain === undefined ? {} : { main: normalizedMain }),
    ...(normalizedMessage === undefined ? {} : { message: normalizedMessage }),
  };
};

export function normalizePluginNamespace(namespace: string): string {
  const normalizedNamespace = namespace.trim();

  if (!normalizedNamespace) {
    throw new Error('logger.plugins keys must be non-empty strings.');
  }

  if (normalizedNamespace.includes(PLUGIN_RULE_REFERENCE_SEPARATOR)) {
    throw new Error(
      `logger.plugins key "${normalizedNamespace}" cannot contain "${PLUGIN_RULE_REFERENCE_SEPARATOR}".`,
    );
  }

  return normalizedNamespace;
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

export function normalizeLoggerExtends(
  extendsReferences: LoggerConfig['extends'],
): string[] {
  if (extendsReferences === undefined) {
    return [];
  }

  if (!Array.isArray(extendsReferences)) {
    throw new TypeError(
      'logger.extends must be an array of "<plugin>/<config>" strings.',
    );
  }

  return extendsReferences.map((extendsReference) => {
    if (typeof extendsReference !== 'string') {
      throw new TypeError(
        'logger.extends must be an array of "<plugin>/<config>" strings.',
      );
    }

    const normalizedReference = extendsReference.trim();

    if (!normalizedReference) {
      throw new Error(
        'logger.extends must be an array of non-empty "<plugin>/<config>" strings.',
      );
    }

    return normalizedReference;
  });
}

function normalizePresetConfigName(
  namespace: string,
  configName: string,
): string {
  const normalizedConfigName = configName.trim();

  if (!normalizedConfigName) {
    throw new Error(
      `logger.plugins["${namespace}"].configs keys must be non-empty strings.`,
    );
  }

  return normalizedConfigName;
}

export function normalizePresetConfigRuleName(
  source: string,
  ruleName: string,
): string {
  const normalizedRuleName = ruleName.trim();

  if (!normalizedRuleName) {
    throw new Error(`${source} keys must be non-empty local rule names.`);
  }

  if (normalizedRuleName.includes(PLUGIN_RULE_REFERENCE_SEPARATOR)) {
    throw new Error(
      `${source} key "${normalizedRuleName}" must be a local plugin rule name without "${PLUGIN_RULE_REFERENCE_SEPARATOR}".`,
    );
  }

  return normalizedRuleName;
}

function normalizePluginRuleTemplate(
  namespace: string,
  ruleName: string,
  rule: LoggerPresetRuleUserConfig,
): LoggerPresetRuleUserConfig {
  if (!isRecord(rule)) {
    throw new Error(
      `logger.plugins["${namespace}"].rules["${ruleName}"] must be a rule scope template object.`,
    );
  }

  const invalidKeys = Object.keys(rule).filter(
    (key) => !PLUGIN_RULE_TEMPLATE_KEYS.has(key),
  );

  if (invalidKeys.length > 0) {
    throw new Error(
      `logger.plugins["${namespace}"].rules["${ruleName}"] only supports "main", "group", "message", and "levels".`,
    );
  }

  return rule;
}

export function normalizeRuleBody(
  ruleReference: string,
  setting: LoggerRuleSetting | undefined,
  source = 'logger.rules',
): Omit<ResolvedLoggerRule, 'label'> | null {
  if (setting === 'off') {
    return null;
  }

  if (!isRecord(setting)) {
    throw new Error(
      `${source}["${ruleReference}"] must be "off" or a rule object.`,
    );
  }

  const invalidKeys = Object.keys(setting).filter(
    (key) => !RULE_BODY_KEYS.has(key),
  );

  if (invalidKeys.length > 0) {
    throw new Error(
      `${source}["${ruleReference}"] rule objects only support "main", "group", "message", and "levels".`,
    );
  }

  if (!Object.hasOwn(setting, 'levels')) {
    throw new Error(
      `${source}["${ruleReference}"] rule objects must declare "levels".`,
    );
  }

  if (setting.levels !== 'inherit' && !Array.isArray(setting.levels)) {
    throw new Error(
      `${source}["${ruleReference}"].levels must be "inherit" or an array of logger visibility levels.`,
    );
  }

  const { levels, ...body } = setting as LoggerRuleUserConfig;

  return {
    ...body,
    ...(levels === 'inherit'
      ? {}
      : { levels: normalizeLoggerLevelsArray(levels) }),
  };
}

export function normalizeLoggingPlugins(
  plugins: LoggerConfig['plugins'],
): LoggerPluginMap {
  if (plugins === undefined) {
    return {};
  }

  if (!isRecord(plugins)) {
    throw new Error('logger.plugins must be an object map.');
  }

  const normalizedPlugins: LoggerPluginMap = {};

  for (const [rawNamespace, plugin] of Object.entries(plugins)) {
    const namespace = normalizePluginNamespace(rawNamespace);

    if (!isRecord(plugin) || !isRecord(plugin.rules)) {
      throw new Error(
        `logger.plugins["${namespace}"] must be a logger preset plugin with a rules object.`,
      );
    }

    if (Object.hasOwn(normalizedPlugins, namespace)) {
      throw new Error(`Duplicate logger.plugins key "${namespace}".`);
    }

    const normalizedRules: LoggerPresetPlugin['rules'] = {};

    for (const [rawRuleName, rule] of Object.entries(plugin.rules)) {
      const ruleName = normalizePresetConfigRuleName(
        `logger.plugins["${namespace}"].rules`,
        rawRuleName,
      );

      normalizedRules[ruleName] = normalizePluginRuleTemplate(
        namespace,
        ruleName,
        rule,
      );
    }

    const normalizedPlugin: LoggerPresetPlugin = {
      rules: normalizedRules,
    };

    if (plugin.configs !== undefined) {
      if (!isRecord(plugin.configs)) {
        throw new Error(
          `logger.plugins["${namespace}"].configs must be an object map.`,
        );
      }

      const normalizedConfigs: Record<string, LoggerPresetConfig> = {};

      for (const [rawConfigName, presetConfig] of Object.entries(
        plugin.configs,
      )) {
        const configName = normalizePresetConfigName(namespace, rawConfigName);

        if (Object.hasOwn(normalizedConfigs, configName)) {
          throw new Error(
            `Duplicate logger.plugins["${namespace}"].configs key "${configName}".`,
          );
        }

        normalizedConfigs[configName] = presetConfig as LoggerPresetConfig;
      }

      normalizedPlugin.configs = normalizedConfigs;
    }

    normalizedPlugins[namespace] = normalizedPlugin;
  }

  return normalizedPlugins;
}

export function normalizeActivePresetConfig(
  namespace: string,
  configName: string,
  presetConfig: unknown,
): LoggerPresetConfig {
  if (!isRecord(presetConfig)) {
    throw new Error(
      `logger.plugins["${namespace}"].configs["${configName}"] must be a logger preset config object.`,
    );
  }

  const invalidConfigKeys = Object.keys(presetConfig).filter(
    (key) => !PLUGIN_CONFIG_KEYS.has(key),
  );

  if (invalidConfigKeys.length > 0) {
    throw new Error(
      `logger.plugins["${namespace}"].configs["${configName}"] only supports "rules".`,
    );
  }

  if (presetConfig.rules !== undefined && !isRecord(presetConfig.rules)) {
    throw new Error(
      `logger.plugins["${namespace}"].configs["${configName}"].rules must be an object map.`,
    );
  }

  return presetConfig as LoggerPresetConfig;
}

export function normalizeLoggerRuleEntryReference(
  source: string,
  reference: string,
): string {
  const normalizedReference = reference.trim();

  if (!normalizedReference) {
    throw new Error(`${source} keys must be non-empty rule labels.`);
  }

  if (normalizedReference.includes(PLUGIN_RULE_REFERENCE_SEPARATOR)) {
    const { namespace, ruleName } =
      parsePluginRuleReference(normalizedReference);

    return `${namespace}/${ruleName}`;
  }

  return normalizeLoggerRuleLabel(normalizedReference);
}
