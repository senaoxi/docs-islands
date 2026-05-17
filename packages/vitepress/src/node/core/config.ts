import type {
  ConfigType,
  LoggingUserConfig,
  SiteDevToolsAnalysisUserConfig,
  SiteDevToolsUserConfig,
} from '#dep-types/utils';
import { VITEPRESS_CONFIG_LOG_GROUPS } from '#shared/constants/log-groups/config';
import { setScopedLoggerConfig } from '@docs-islands/logger/core';
import { createElapsedTimer } from '@docs-islands/logger/helper';
import { LOGGER_TREE_SHAKING_PLUGIN_NAME } from '@docs-islands/logger/plugin';
import type { LoggerConfig, LoggerPluginMap } from '@docs-islands/logger/types';
import type { DefaultTheme, UserConfig } from 'vitepress';
import { LOGGER_FACADE_PLUGIN_NAME } from '../constants/core/plugin-names';
import { getVitePressGroupLogger } from '../logger';
import { mergeAnalysisConfig } from './config-merge-helpers';
import { ensureVitepressViteConfig } from './integration-plugin';
import { createVitePressLoggerFacadePlugin } from './vite-plugin-logger-facade';
import {
  createLoggerTreeShakingPlugin,
  setVitePressLoggerTreeShakingEnabled,
} from './vite-plugin-logger-tree-shaking';

const getConfigLogger = (scopeId: string) =>
  getVitePressGroupLogger(VITEPRESS_CONFIG_LOG_GROUPS.nodeVersion, scopeId);

export interface DocsIslandsSharedOptions<
  TPlugins extends LoggerPluginMap = LoggerPluginMap,
> {
  logging?: LoggingUserConfig<TPlugins>;
  siteDevtools?: SiteDevToolsUserConfig;
}

export interface DocsIslandsResolvedUserConfig {
  loggerScopeId: string;
  loggerTreeShakingEnabled: boolean;
  logging?: LoggerConfig;
  siteDevtoolsEnabled: boolean;
}

const mergeSiteDevToolsAnalysisConfig = (
  base: SiteDevToolsAnalysisUserConfig | undefined,
  override: SiteDevToolsAnalysisUserConfig | undefined,
): SiteDevToolsAnalysisUserConfig | undefined => {
  return mergeAnalysisConfig(base, override);
};

export const mergeSiteDevToolsConfig = (
  base: SiteDevToolsUserConfig | undefined,
  override: SiteDevToolsUserConfig | undefined,
): SiteDevToolsUserConfig | undefined => {
  if (!base && !override) {
    return undefined;
  }

  const mergedAnalysis = mergeSiteDevToolsAnalysisConfig(
    base?.analysis,
    override?.analysis,
  );

  return {
    ...base,
    ...override,
    ...(mergedAnalysis
      ? {
          analysis: mergedAnalysis,
        }
      : {}),
  };
};

function checkNodeVersion(nodeVersion: string): boolean {
  const currentVersion = nodeVersion.split('.');
  const major = Number.parseInt(currentVersion[0], 10);
  const minor = Number.parseInt(currentVersion[1], 10);

  return (
    (major === 20 && minor >= 19) || (major === 22 && minor >= 12) || major > 22
  );
}

function hasVitePluginNamed(
  plugins: NonNullable<UserConfig<DefaultTheme.Config>['vite']>['plugins'],
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

const LOGGER_SCOPE_STATE = Symbol.for('docs-islands.vitepress.loggerScopeId');

type VitePressConfigWithLoggerScopeState = NonNullable<
  UserConfig<DefaultTheme.Config>
> & {
  [LOGGER_SCOPE_STATE]?: string;
};

export function assertCanApplyDocsIslandsLoggerScope(
  vitepressConfig: UserConfig<DefaultTheme.Config>,
  loggerScopeId: string,
): void {
  const config = vitepressConfig as VitePressConfigWithLoggerScopeState;
  const existingLoggerScopeId = config[LOGGER_SCOPE_STATE];

  if (
    existingLoggerScopeId === undefined ||
    existingLoggerScopeId === loggerScopeId
  ) {
    config[LOGGER_SCOPE_STATE] = loggerScopeId;
    return;
  }

  throw new Error(
    'createDocsIslands() has already been applied to this VitePress config with a different logger scope. ' +
      'Use a single createDocsIslands({ adapters: [...] }) call for one VitePress config instead of applying multiple createDocsIslands() instances.',
  );
}

export function warnIfUnsupportedNodeVersion(loggerScopeId: string): void {
  const warningElapsed = createElapsedTimer();

  if (checkNodeVersion(process.versions.node)) {
    return;
  }

  getConfigLogger(loggerScopeId).warn(
    `You are using Node.js ${process.versions.node}. ` +
      `@docs-islands/vitepress requires Node.js version 20.19+ or 22.12+. ` +
      `Please upgrade your Node.js version.`,
    warningElapsed(),
  );
}

export function applyDocsIslandsUserConfig<
  TPlugins extends LoggerPluginMap = LoggerPluginMap,
>(
  vitepressConfig: UserConfig<DefaultTheme.Config>,
  loggerScopeId: string,
  options?: DocsIslandsSharedOptions<TPlugins>,
): DocsIslandsResolvedUserConfig {
  const { treeshake: loggerTreeShaking, ...loggerConfig } =
    options?.logging ?? {};
  const scopedLoggerConfig = loggerConfig as LoggerConfig<TPlugins>;

  // Complete the logger configuration initialization as early as possible to ensure subsequent logs are controlled.
  setScopedLoggerConfig(loggerScopeId, scopedLoggerConfig);

  warnIfUnsupportedNodeVersion(loggerScopeId);

  const loggerTreeShakingEnabled = loggerTreeShaking === true;
  setVitePressLoggerTreeShakingEnabled(loggerScopeId, loggerTreeShakingEnabled);

  const mergedSiteDevTools = mergeSiteDevToolsConfig(
    vitepressConfig.siteDevtools as SiteDevToolsUserConfig | undefined,
    options?.siteDevtools,
  );

  if (mergedSiteDevTools) {
    vitepressConfig.siteDevtools =
      mergedSiteDevTools as typeof vitepressConfig.siteDevtools;
  }

  return {
    loggerScopeId,
    loggerTreeShakingEnabled,
    logging: scopedLoggerConfig,
    siteDevtoolsEnabled: mergedSiteDevTools !== undefined,
  };
}

export function applyDocsIslandsViteBaseConfig(
  vitepressConfig: UserConfig<DefaultTheme.Config>,
  siteConfig: ConfigType,
  options: DocsIslandsResolvedUserConfig,
): void {
  assertCanApplyDocsIslandsLoggerScope(vitepressConfig, options.loggerScopeId);

  const viteConfig = ensureVitepressViteConfig(vitepressConfig);

  viteConfig.define!.__BASE__ = JSON.stringify(siteConfig.base);
  viteConfig.define!.__CLEAN_URLS__ = JSON.stringify(siteConfig.cleanUrls);

  /**
   * Do not pre-bundle @docs-islands/vitepress,
   * otherwise it will break the takeover capability of the controlled logger.
   */
  viteConfig.optimizeDeps!.exclude!.push('@docs-islands/vitepress');

  if (!hasVitePluginNamed(viteConfig.plugins, LOGGER_FACADE_PLUGIN_NAME)) {
    viteConfig.plugins!.push(
      createVitePressLoggerFacadePlugin(options.loggerScopeId, options.logging),
    );
  }

  if (
    options.loggerTreeShakingEnabled &&
    !hasVitePluginNamed(viteConfig.plugins, LOGGER_TREE_SHAKING_PLUGIN_NAME)
  ) {
    const loggerTreeShakingPlugin = createLoggerTreeShakingPlugin(
      options.loggerScopeId,
    );

    if (loggerTreeShakingPlugin) {
      viteConfig.plugins!.push(loggerTreeShakingPlugin);
    }
  }

  if (!options.siteDevtoolsEnabled) {
    return;
  }

  // Site DevTools source preview uses module workers that may code-split during
  // downstream Vite builds. The default IIFE worker output breaks that build.
  viteConfig.worker!.format = 'es';
}
