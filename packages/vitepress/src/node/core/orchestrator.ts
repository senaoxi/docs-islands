import { createLoggerScopeId } from 'logaria/core/helper';
import type { LoggerPluginMap } from 'logaria/types';
import type { PluginOption } from 'vite';
import type { DefaultTheme, UserConfig } from 'vitepress';
import {
  SupportUIFramework,
  type SupportUIFrameworkType,
} from '../constants/adapters';
import {
  SITE_DEVTOOLS_OPTIONAL_DEPENDENCY_BOOTSTRAP_PLUGIN_NAME,
  SITE_DEVTOOLS_SOURCE_PLUGIN_NAME,
} from '../constants/core/plugin-names';
import { applySiteDevToolsOptionalDependencyFallbacks } from '../site-devtools/optional-dependencies';
import { getSiteDevToolsVitePlugins } from '../site-devtools/vite-plugin-site-devtools';
import type {
  DocsIslandsResolvedUserConfig,
  DocsIslandsSharedOptions,
} from './config';
import {
  applyDocsIslandsUserConfig,
  applyDocsIslandsViteBaseConfig,
  assertCanApplyDocsIslandsLoggerScope,
} from './config';
import { resolveCurrentDependencyResolutionBase } from './dependency-resolution';
import { ensureVitepressViteConfig } from './integration-plugin';
import { resolveConfig } from './resolve-config';

export interface DocsIslandsAdapter {
  apply: (
    vitepressConfig: UserConfig<DefaultTheme.Config>,
    resolvedUserConfig: DocsIslandsResolvedUserConfig,
  ) => void;
  framework: SupportUIFrameworkType;
}

export interface DocsIslandsOptions<
  TPlugins extends LoggerPluginMap = LoggerPluginMap,
> extends DocsIslandsSharedOptions<TPlugins> {
  adapters: DocsIslandsAdapter[];
}

export interface DocsIslands {
  apply: (vitepressConfig: UserConfig<DefaultTheme.Config>) => void;
}

function validateAdapters(
  adapters: DocsIslandsAdapter[],
): DocsIslandsAdapter[] {
  if (adapters.length === 0) {
    throw new Error(
      'createDocsIslands() requires at least one adapter in the adapters array.',
    );
  }

  const frameworks = new Set<string>();

  for (const adapter of adapters) {
    if (frameworks.has(adapter.framework)) {
      throw new Error(
        `createDocsIslands() received multiple adapters for framework "${adapter.framework}".`,
      );
    } else if (!SupportUIFramework.includes(adapter.framework)) {
      throw new Error(
        `createDocsIslands() received unsupported adapters for framework "${adapter.framework}".`,
      );
    }

    frameworks.add(adapter.framework);
  }

  return adapters;
}

function hasVitePluginNamed(
  plugins: PluginOption[] | undefined,
  name: string,
): boolean {
  if (!plugins) {
    return false;
  }

  for (const plugin of plugins) {
    if (Array.isArray(plugin)) {
      if (hasVitePluginNamed(plugin, name)) {
        return true;
      }
      continue;
    }

    if (
      plugin &&
      typeof plugin === 'object' &&
      'name' in plugin &&
      plugin.name === name
    ) {
      return true;
    }
  }

  return false;
}

function getSiteDevToolsOrchestrationPlugins(
  vitepressConfig: UserConfig<DefaultTheme.Config>,
  resolvedUserConfig: DocsIslandsResolvedUserConfig,
): PluginOption[] {
  if (!resolvedUserConfig.siteDevtoolsEnabled) {
    return [];
  }

  const siteConfig = resolveConfig(vitepressConfig);

  return [
    {
      name: SITE_DEVTOOLS_OPTIONAL_DEPENDENCY_BOOTSTRAP_PLUGIN_NAME,
      enforce: 'pre',
      config(config) {
        applySiteDevToolsOptionalDependencyFallbacks(
          vitepressConfig,
          resolveCurrentDependencyResolutionBase(config.root),
        );
      },
    },
    ...getSiteDevToolsVitePlugins({
      base: siteConfig.base,
      enabled: true,
      pluginName: SITE_DEVTOOLS_SOURCE_PLUGIN_NAME,
    }),
  ];
}

function applySiteDevToolsOrchestration(
  vitepressConfig: UserConfig<DefaultTheme.Config>,
  resolvedUserConfig: DocsIslandsResolvedUserConfig,
): void {
  const viteConfig = ensureVitepressViteConfig(vitepressConfig);

  for (const plugin of getSiteDevToolsOrchestrationPlugins(
    vitepressConfig,
    resolvedUserConfig,
  )) {
    if (
      !Array.isArray(plugin) &&
      plugin &&
      typeof plugin === 'object' &&
      'name' in plugin &&
      typeof plugin.name === 'string' &&
      hasVitePluginNamed(viteConfig.plugins, plugin.name)
    ) {
      continue;
    }

    viteConfig.plugins!.push(plugin);
  }
}

export default function createDocsIslands<
  const TPlugins extends LoggerPluginMap = LoggerPluginMap,
>(options: DocsIslandsOptions<TPlugins>): DocsIslands {
  const adapters = validateAdapters([...options.adapters]);
  const loggerScopeId = createLoggerScopeId();

  return {
    apply(vitepressConfig) {
      assertCanApplyDocsIslandsLoggerScope(vitepressConfig, loggerScopeId);
      const resolvedUserConfig = applyDocsIslandsUserConfig(
        vitepressConfig,
        loggerScopeId,
        options,
      );
      applyDocsIslandsViteBaseConfig(
        vitepressConfig,
        resolveConfig(vitepressConfig),
        resolvedUserConfig,
      );

      for (const adapter of adapters) {
        adapter.apply(vitepressConfig, resolvedUserConfig);
      }

      applySiteDevToolsOrchestration(vitepressConfig, resolvedUserConfig);
    },
  };
}
