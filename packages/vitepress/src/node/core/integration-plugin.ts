import type { ConfigType } from '#dep-types/utils';

import type { PluginOption } from 'vite';
import type { DefaultTheme, UserConfig } from 'vitepress';
import {
  FRAMEWORK_MARKDOWN_TRANSFORM_PLUGIN_NAME,
  INLINE_PAGE_RESOLUTION_PLUGIN_NAME,
} from '../constants/core/plugin-names';
import {
  createRenderingFrameworkMarkdownTransformPlugin,
  RenderingFrameworkParserManager as DefaultRenderingFrameworkParserManager,
  type RenderingFrameworkParser,
  type RenderingFrameworkParserManager,
} from './framework-parser';
import {
  createRenderingModuleResolution,
  type RenderingModuleResolution,
} from './module-resolution';
import { resolveConfig } from './resolve-config';

export interface RenderingIntegrationPluginContext {
  frameworkParserManager: RenderingFrameworkParserManager;
  loggerScopeId: string;
  vitepressConfig: UserConfig<DefaultTheme.Config>;
  siteConfig: ConfigType;
  resolution: RenderingModuleResolution;
}

export interface RenderingIntegrationPlugin<
  TContext extends
    RenderingIntegrationPluginContext = RenderingIntegrationPluginContext,
> {
  applyUserConfig?: (vitepressConfig: UserConfig<DefaultTheme.Config>) => void;
  createContext: (context: RenderingIntegrationPluginContext) => TContext;
  frameworkParsers?: (context: TContext) => RenderingFrameworkParser[];
  loggerScopeId: string;
  vitePlugins: (context: TContext) => PluginOption[];
  registerBuildHooks?: (context: TContext) => void;
}

export function ensureVitepressViteConfig(
  vitepressConfig: UserConfig<DefaultTheme.Config>,
): NonNullable<UserConfig<DefaultTheme.Config>['vite']> {
  if (!vitepressConfig.vite) {
    vitepressConfig.vite = {};
  }

  if (!vitepressConfig.vite.define) {
    vitepressConfig.vite.define = {};
  }

  if (!vitepressConfig.vite.optimizeDeps) {
    vitepressConfig.vite.optimizeDeps = {};
  }

  if (!vitepressConfig.vite.worker) {
    vitepressConfig.vite.worker = {};
  }

  if (!vitepressConfig.vite.optimizeDeps.exclude) {
    vitepressConfig.vite.optimizeDeps.exclude = [];
  }

  if (!vitepressConfig.vite.plugins) {
    vitepressConfig.vite.plugins = [];
  }

  return vitepressConfig.vite;
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

function createRenderingIntegrationContext(
  vitepressConfig: UserConfig<DefaultTheme.Config>,
  loggerScopeId: string,
): RenderingIntegrationPluginContext {
  const context = {
    frameworkParserManager: new DefaultRenderingFrameworkParserManager(
      () => loggerScopeId,
    ),
    loggerScopeId,
    vitepressConfig,
    siteConfig: resolveConfig(vitepressConfig),
    resolution: null as unknown as RenderingModuleResolution,
  } satisfies Omit<RenderingIntegrationPluginContext, 'resolution'> & {
    resolution: RenderingModuleResolution;
  };

  context.frameworkParserManager = new DefaultRenderingFrameworkParserManager(
    () => context.loggerScopeId,
  );
  context.resolution = createRenderingModuleResolution(
    () => context.loggerScopeId,
  );

  return context;
}

const renderingIntegrationContextCache = new WeakMap<
  UserConfig<DefaultTheme.Config>,
  RenderingIntegrationPluginContext
>();

function getOrCreateRenderingIntegrationContext(
  vitepressConfig: UserConfig<DefaultTheme.Config>,
  loggerScopeId: string,
): RenderingIntegrationPluginContext {
  const cachedContext = renderingIntegrationContextCache.get(vitepressConfig);

  if (cachedContext && cachedContext.loggerScopeId === loggerScopeId) {
    cachedContext.siteConfig = resolveConfig(vitepressConfig);
    return cachedContext;
  }

  const nextContext = createRenderingIntegrationContext(
    vitepressConfig,
    loggerScopeId,
  );
  renderingIntegrationContextCache.set(vitepressConfig, nextContext);

  return nextContext;
}

export function applyRenderingIntegrationPlugin<
  TContext extends RenderingIntegrationPluginContext,
>(
  vitepressConfig: UserConfig<DefaultTheme.Config>,
  plugin: RenderingIntegrationPlugin<TContext>,
): TContext {
  plugin.applyUserConfig?.(vitepressConfig);

  const baseContext = getOrCreateRenderingIntegrationContext(
    vitepressConfig,
    plugin.loggerScopeId,
  );
  const context = plugin.createContext(baseContext);

  const viteConfig = ensureVitepressViteConfig(vitepressConfig);
  if (
    !hasVitePluginNamed(viteConfig.plugins, INLINE_PAGE_RESOLUTION_PLUGIN_NAME)
  ) {
    viteConfig.plugins!.push(baseContext.resolution.createVitePlugin());
  }
  if (
    !hasVitePluginNamed(
      viteConfig.plugins,
      FRAMEWORK_MARKDOWN_TRANSFORM_PLUGIN_NAME,
    )
  ) {
    viteConfig.plugins!.push(
      createRenderingFrameworkMarkdownTransformPlugin({
        frameworkParserManager: baseContext.frameworkParserManager,
        resolution: baseContext.resolution,
      }),
    );
  }

  for (const frameworkParser of plugin.frameworkParsers?.(context) || []) {
    baseContext.frameworkParserManager.registerParser(frameworkParser);
  }

  plugin.registerBuildHooks?.(context);
  viteConfig.plugins!.push(...plugin.vitePlugins(context));

  return context;
}
