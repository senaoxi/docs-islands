import {
  CORE_RUNTIME_LOG_GROUPS,
  getFrameworkComponentManagerLogGroup,
  getFrameworkRenderStrategyLogGroup,
} from '@docs-islands/core/shared/constants/log-groups/runtime';
import { CORE_TRANSFORM_LOG_GROUPS } from '@docs-islands/core/shared/constants/log-groups/transform';
import type {
  LoggerPresetConfig,
  LoggerPresetPlugin,
  LoggerPresetRuleUserConfig,
} from 'logaria/types';
import { VITEPRESS_BUILD_LOG_GROUPS } from '../constants/log-groups/build';
import { VITEPRESS_CONFIG_LOG_GROUPS } from '../constants/log-groups/config';
import { VITEPRESS_HMR_LOG_GROUPS } from '../constants/log-groups/hmr';
import { VITEPRESS_PARSER_LOG_GROUPS } from '../constants/log-groups/parser';
import { VITEPRESS_PLUGIN_LOG_GROUPS } from '../constants/log-groups/plugin';
import { VITEPRESS_RESOLVER_LOG_GROUPS } from '../constants/log-groups/resolver';
import { VITEPRESS_RUNTIME_LOG_GROUPS } from '../constants/log-groups/runtime';
import { VITEPRESS_SITE_DEVTOOLS_LOG_GROUPS } from '../constants/log-groups/site-devtools';

const CORE_MAIN_NAME = '@docs-islands/core';
const VITEPRESS_MAIN_NAME = '@docs-islands/vitepress';

type PresetRules<TKey extends string> = Record<
  TKey,
  LoggerPresetRuleUserConfig
>;

const createPresetConfig = <
  const TRules extends Record<string, LoggerPresetRuleUserConfig>,
>(
  rules: TRules,
): LoggerPresetConfig<TRules> => {
  const recommendedRules = Object.fromEntries(
    Object.keys(rules).map((ruleName) => [ruleName, { levels: 'inherit' }]),
  ) as LoggerPresetConfig<TRules>['rules'];

  return {
    rules: recommendedRules,
  };
};

const buildRules: PresetRules<
  | 'browserBundle'
  | 'finalize'
  | 'mpaIntegration'
  | 'sharedClientRuntimeMetafile'
  | 'ssrBundle'
  | 'ssrIntegration'
  | 'transformHtml'
> = {
  browserBundle: {
    group: VITEPRESS_BUILD_LOG_GROUPS.frameworkBrowserBundle,
    main: VITEPRESS_MAIN_NAME,
  },
  finalize: {
    group: VITEPRESS_BUILD_LOG_GROUPS.frameworkBuildFinalize,
    main: VITEPRESS_MAIN_NAME,
  },
  mpaIntegration: {
    group: VITEPRESS_BUILD_LOG_GROUPS.frameworkMpaIntegration,
    main: VITEPRESS_MAIN_NAME,
  },
  sharedClientRuntimeMetafile: {
    group: VITEPRESS_BUILD_LOG_GROUPS.sharedClientRuntimeMetafile,
    main: VITEPRESS_MAIN_NAME,
  },
  ssrBundle: {
    group: VITEPRESS_BUILD_LOG_GROUPS.frameworkSsrBundle,
    main: VITEPRESS_MAIN_NAME,
  },
  ssrIntegration: {
    group: VITEPRESS_BUILD_LOG_GROUPS.frameworkBuildSsrIntegration,
    main: VITEPRESS_MAIN_NAME,
  },
  transformHtml: {
    group: VITEPRESS_BUILD_LOG_GROUPS.frameworkBuildTransformHtml,
    main: VITEPRESS_MAIN_NAME,
  },
};

const configRules: PresetRules<'nodeVersion'> = {
  nodeVersion: {
    group: VITEPRESS_CONFIG_LOG_GROUPS.nodeVersion,
    main: VITEPRESS_MAIN_NAME,
  },
};

const hmrRules: PresetRules<
  | 'markdownUpdate'
  | 'reactRuntimePrepare'
  | 'reactSsrOnlyRender'
  | 'viteAfterUpdate'
  | 'viteAfterUpdateRender'
> = {
  markdownUpdate: {
    group: VITEPRESS_HMR_LOG_GROUPS.markdownUpdate,
    main: VITEPRESS_MAIN_NAME,
  },
  reactRuntimePrepare: {
    group: VITEPRESS_HMR_LOG_GROUPS.reactRuntimePrepare,
    main: VITEPRESS_MAIN_NAME,
  },
  reactSsrOnlyRender: {
    group: VITEPRESS_HMR_LOG_GROUPS.reactSsrOnlyRender,
    main: VITEPRESS_MAIN_NAME,
  },
  viteAfterUpdate: {
    group: VITEPRESS_HMR_LOG_GROUPS.viteAfterUpdate,
    main: VITEPRESS_MAIN_NAME,
  },
  viteAfterUpdateRender: {
    group: VITEPRESS_HMR_LOG_GROUPS.viteAfterUpdateRender,
    main: VITEPRESS_MAIN_NAME,
  },
};

const parserRules: PresetRules<'framework' | 'react'> = {
  framework: {
    group: VITEPRESS_PARSER_LOG_GROUPS.framework,
    main: VITEPRESS_MAIN_NAME,
  },
  react: {
    group: VITEPRESS_PARSER_LOG_GROUPS.react,
    main: VITEPRESS_MAIN_NAME,
  },
};

const pluginRules: PresetRules<'renderingStrategies'> = {
  renderingStrategies: {
    group: VITEPRESS_PLUGIN_LOG_GROUPS.renderingStrategies,
    main: VITEPRESS_MAIN_NAME,
  },
};

const resolverRules: PresetRules<'inlinePage'> = {
  inlinePage: {
    group: VITEPRESS_RESOLVER_LOG_GROUPS.inlinePage,
    main: VITEPRESS_MAIN_NAME,
  },
};

const runtimeRules: PresetRules<
  | 'coreReactComponentManager'
  | 'coreReactRenderStrategy'
  | 'reactClientLoader'
  | 'reactComponentManager'
  | 'reactDevContentUpdated'
  | 'reactDevMountFallback'
  | 'reactDevMountRender'
  | 'reactDevRender'
  | 'reactDevRuntimeLoader'
  | 'renderValidation'
> = {
  coreReactComponentManager: {
    group: getFrameworkComponentManagerLogGroup('react'),
    main: CORE_MAIN_NAME,
  },
  coreReactRenderStrategy: {
    group: getFrameworkRenderStrategyLogGroup('react'),
    main: CORE_MAIN_NAME,
  },
  reactClientLoader: {
    group: VITEPRESS_RUNTIME_LOG_GROUPS.reactClientLoader,
    main: VITEPRESS_MAIN_NAME,
  },
  reactComponentManager: {
    group: VITEPRESS_RUNTIME_LOG_GROUPS.reactComponentManager,
    main: VITEPRESS_MAIN_NAME,
  },
  reactDevContentUpdated: {
    group: VITEPRESS_RUNTIME_LOG_GROUPS.reactDevContentUpdated,
    main: VITEPRESS_MAIN_NAME,
  },
  reactDevMountFallback: {
    group: VITEPRESS_RUNTIME_LOG_GROUPS.reactDevMountFallback,
    main: VITEPRESS_MAIN_NAME,
  },
  reactDevMountRender: {
    group: VITEPRESS_RUNTIME_LOG_GROUPS.reactDevMountRender,
    main: VITEPRESS_MAIN_NAME,
  },
  reactDevRender: {
    group: VITEPRESS_RUNTIME_LOG_GROUPS.reactDevRender,
    main: VITEPRESS_MAIN_NAME,
  },
  reactDevRuntimeLoader: {
    group: VITEPRESS_RUNTIME_LOG_GROUPS.reactDevRuntimeLoader,
    main: VITEPRESS_MAIN_NAME,
  },
  renderValidation: {
    group: CORE_RUNTIME_LOG_GROUPS.renderValidation,
    main: CORE_MAIN_NAME,
  },
};

const siteDevtoolsRules: PresetRules<'aiBuildReports' | 'aiServer'> = {
  aiBuildReports: {
    group: VITEPRESS_SITE_DEVTOOLS_LOG_GROUPS.aiBuildReports,
    main: VITEPRESS_MAIN_NAME,
  },
  aiServer: {
    group: VITEPRESS_SITE_DEVTOOLS_LOG_GROUPS.aiServer,
    main: VITEPRESS_MAIN_NAME,
  },
};

const transformRules: PresetRules<
  'markdownComponentTags' | 'ssrContainerIntegration' | 'ssrCssInjection'
> = {
  markdownComponentTags: {
    group: CORE_TRANSFORM_LOG_GROUPS.transformComponentTags,
    main: CORE_MAIN_NAME,
  },
  ssrContainerIntegration: {
    group: CORE_TRANSFORM_LOG_GROUPS.ssrContainerIntegration,
    main: CORE_MAIN_NAME,
  },
  ssrCssInjection: {
    group: CORE_TRANSFORM_LOG_GROUPS.ssrCssInjection,
    main: CORE_MAIN_NAME,
  },
};

type VitePressLoggerRuleName =
  | (keyof typeof buildRules & string)
  | (keyof typeof configRules & string)
  | (keyof typeof hmrRules & string)
  | (keyof typeof parserRules & string)
  | (keyof typeof pluginRules & string)
  | (keyof typeof resolverRules & string)
  | (keyof typeof runtimeRules & string)
  | (keyof typeof siteDevtoolsRules & string)
  | (keyof typeof transformRules & string);

const vitepressRules: PresetRules<VitePressLoggerRuleName> = {
  ...buildRules,
  ...configRules,
  ...hmrRules,
  ...parserRules,
  ...pluginRules,
  ...resolverRules,
  ...runtimeRules,
  ...siteDevtoolsRules,
  ...transformRules,
};

type VitePressLoggerPresetConfig = LoggerPresetConfig<typeof vitepressRules>;

const toVitePressLoggerPresetConfig = <
  const TRules extends Record<string, LoggerPresetRuleUserConfig>,
>(
  rules: TRules,
): VitePressLoggerPresetConfig =>
  createPresetConfig(rules) as VitePressLoggerPresetConfig;

export const vitepress: LoggerPresetPlugin<typeof vitepressRules> = {
  configs: {
    build: toVitePressLoggerPresetConfig(buildRules),
    config: toVitePressLoggerPresetConfig(configRules),
    hmr: toVitePressLoggerPresetConfig(hmrRules),
    parser: toVitePressLoggerPresetConfig(parserRules),
    plugin: toVitePressLoggerPresetConfig(pluginRules),
    recommended: createPresetConfig(vitepressRules),
    resolver: toVitePressLoggerPresetConfig(resolverRules),
    runtime: toVitePressLoggerPresetConfig(runtimeRules),
    siteDevtools: toVitePressLoggerPresetConfig(siteDevtoolsRules),
    transform: toVitePressLoggerPresetConfig(transformRules),
  },
  rules: vitepressRules,
} satisfies LoggerPresetPlugin<typeof vitepressRules>;

export default vitepress;
