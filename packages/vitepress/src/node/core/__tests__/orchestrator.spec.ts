/**
 * @vitest-environment node
 */
import { createLoggerScopeId } from '@docs-islands/logger/core/helper';
import type { PluginOption } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { react } from '../../adapters/react';
import { REACT_RUNTIME_BUNDLING_PLUGIN_NAME } from '../../constants/adapters/react/plugin-names';
import {
  FRAMEWORK_MARKDOWN_TRANSFORM_PLUGIN_NAME,
  INLINE_PAGE_RESOLUTION_PLUGIN_NAME,
  LOGGER_FACADE_PLUGIN_NAME,
  SITE_DEVTOOLS_OPTIONAL_DEPENDENCY_BOOTSTRAP_PLUGIN_NAME,
  SITE_DEVTOOLS_SOURCE_PLUGIN_NAME,
} from '../../constants/core/plugin-names';
import {
  type createVitePressLoggerFacadePlugin,
  VITEPRESS_LOGGER_MODULE_ID,
} from '../vite-plugin-logger-facade';
import { LOGGER_TREE_SHAKING_PLUGIN_NAME } from '../vite-plugin-logger-tree-shaking';

vi.mock('@vitejs/plugin-react-swc', () => ({
  default: vi.fn(() => ({
    name: 'mock-react-swc',
  })),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

function findPluginByName(
  plugins: PluginOption[] | undefined,
  name: string,
): any {
  if (!plugins) return null;
  for (const plugin of plugins) {
    if (Array.isArray(plugin)) {
      const found = findPluginByName(plugin, name);
      if (found) return found;
      continue;
    }
    if (plugin && typeof plugin === 'object' && 'name' in plugin) {
      if ((plugin as { name?: string }).name === name) {
        return plugin;
      }
    }
  }
  return null;
}

function findPluginIndexByName(
  plugins: PluginOption[] | undefined,
  name: string,
): number {
  if (!plugins) {
    return -1;
  }

  return plugins.findIndex(
    (plugin) =>
      plugin !== null &&
      plugin !== false &&
      plugin !== undefined &&
      !Array.isArray(plugin) &&
      typeof plugin === 'object' &&
      'name' in plugin &&
      (plugin as { name?: string }).name === name,
  );
}

async function resolvePublicLoggerVirtualId(
  plugins: PluginOption[] | undefined,
): Promise<unknown> {
  const plugin = findPluginByName(
    plugins,
    LOGGER_FACADE_PLUGIN_NAME,
  ) as ReturnType<typeof createVitePressLoggerFacadePlugin> | null;
  const resolveId = plugin?.resolveId;

  if (!resolveId) {
    return null;
  }

  return typeof resolveId === 'function'
    ? resolveId.call({} as never, VITEPRESS_LOGGER_MODULE_ID, undefined, {
        attributes: {},
        custom: {},
        isEntry: false,
      })
    : resolveId.handler.call(
        {} as never,
        VITEPRESS_LOGGER_MODULE_ID,
        undefined,
        {
          attributes: {},
          custom: {},
          isEntry: false,
        },
      );
}

describe('createDocsIslands', () => {
  it('creates readable collision-resistant logger scope ids', () => {
    const startedAt = Date.now();
    const firstScopeId = createLoggerScopeId();
    const secondScopeId = createLoggerScopeId();
    const finishedAt = Date.now();

    expect(firstScopeId).toMatch(
      /^docs-islands-logger-scope-[\da-z]+-[\da-f]{32}$/,
    );
    expect(secondScopeId).toMatch(
      /^docs-islands-logger-scope-[\da-z]+-[\da-f]{32}$/,
    );

    const firstTimestamp = firstScopeId.split('-')[4];
    const secondTimestamp = secondScopeId.split('-')[4];

    expect(Number.parseInt(firstTimestamp!, 36)).toBeGreaterThanOrEqual(
      startedAt,
    );
    expect(Number.parseInt(firstTimestamp!, 36)).toBeLessThanOrEqual(
      finishedAt,
    );
    expect(Number.parseInt(secondTimestamp!, 36)).toBeGreaterThanOrEqual(
      startedAt,
    );
    expect(Number.parseInt(secondTimestamp!, 36)).toBeLessThanOrEqual(
      finishedAt,
    );
    expect(firstScopeId).not.toBe(secondScopeId);
  });

  it('registers the React integration when applied', async () => {
    const { default: createDocsIslands } = await import('../orchestrator');

    const vitepressConfig: any = {};
    createDocsIslands({
      adapters: [react()],
    }).apply(vitepressConfig);

    expect(
      findPluginByName(
        vitepressConfig.vite?.plugins,
        INLINE_PAGE_RESOLUTION_PLUGIN_NAME,
      ),
    ).toBeTruthy();
    expect(
      findPluginByName(
        vitepressConfig.vite?.plugins,
        REACT_RUNTIME_BUNDLING_PLUGIN_NAME,
      ),
    ).toBeTruthy();
    expect(
      findPluginByName(
        vitepressConfig.vite?.plugins,
        FRAMEWORK_MARKDOWN_TRANSFORM_PLUGIN_NAME,
      ),
    ).toBeTruthy();
    expect(
      findPluginIndexByName(
        vitepressConfig.vite?.plugins,
        INLINE_PAGE_RESOLUTION_PLUGIN_NAME,
      ),
    ).toBeLessThan(
      findPluginIndexByName(
        vitepressConfig.vite?.plugins,
        FRAMEWORK_MARKDOWN_TRANSFORM_PLUGIN_NAME,
      ),
    );
    expect(
      findPluginIndexByName(
        vitepressConfig.vite?.plugins,
        FRAMEWORK_MARKDOWN_TRANSFORM_PLUGIN_NAME,
      ),
    ).toBeLessThan(
      findPluginIndexByName(
        vitepressConfig.vite?.plugins,
        REACT_RUNTIME_BUNDLING_PLUGIN_NAME,
      ),
    );
  });

  it('applies shared Vite logger config before adapter hooks run', async () => {
    const { default: createDocsIslands } = await import('../orchestrator');
    const defineSnapshots: Record<string, string>[] = [];
    const vitepressConfig: any = {
      base: '/docs/',
      cleanUrls: true,
    };

    createDocsIslands({
      adapters: [
        {
          apply(config) {
            defineSnapshots.push({ ...config.vite?.define });
          },
          framework: 'react',
        },
      ],
      logging: {
        levels: ['warn', 'error'],
      },
    }).apply(vitepressConfig);

    expect(defineSnapshots).toHaveLength(1);
    expect(defineSnapshots[0]!).toMatchObject({
      __BASE__: JSON.stringify('/docs/'),
      __CLEAN_URLS__: JSON.stringify(true),
    });
    expect(defineSnapshots[0]!).not.toHaveProperty(
      '__DOCS_ISLANDS_LOGGER_CONFIG__',
    );
    expect(
      findPluginByName(
        vitepressConfig.vite?.plugins,
        LOGGER_FACADE_PLUGIN_NAME,
      ),
    ).toBeTruthy();
    expect(
      findPluginByName(
        vitepressConfig.vite?.plugins,
        LOGGER_TREE_SHAKING_PLUGIN_NAME,
      ),
    ).toBeFalsy();
  });

  it('keeps loggerScopeId stable per createDocsIslands instance and isolated across instances', async () => {
    const { default: createDocsIslands } = await import('../orchestrator');

    const firstIslands = createDocsIslands({
      adapters: [react()],
    });
    const secondIslands = createDocsIslands({
      adapters: [react()],
    });
    const firstConfigA: any = {};
    const firstConfigB: any = {};
    const secondConfig: any = {};

    firstIslands.apply(firstConfigA);
    firstIslands.apply(firstConfigB);
    secondIslands.apply(secondConfig);

    await expect(
      resolvePublicLoggerVirtualId(firstConfigA.vite?.plugins),
    ).resolves.toBe(
      await resolvePublicLoggerVirtualId(firstConfigB.vite?.plugins),
    );
    await expect(
      resolvePublicLoggerVirtualId(firstConfigA.vite?.plugins),
    ).resolves.not.toBe(
      await resolvePublicLoggerVirtualId(secondConfig.vite?.plugins),
    );
  });

  it('throws when another createDocsIslands instance is applied to the same config', async () => {
    const { default: createDocsIslands } = await import('../orchestrator');
    const vitepressConfig: any = {};

    createDocsIslands({
      adapters: [
        {
          apply() {},
          framework: 'react',
        },
      ],
    }).apply(vitepressConfig);

    expect(() =>
      createDocsIslands({
        adapters: [
          {
            apply() {},
            framework: 'react',
          },
        ],
      }).apply(vitepressConfig),
    ).toThrow(
      'createDocsIslands() has already been applied to this VitePress config with a different logger scope.',
    );
  });

  it('registers site-devtools orchestration in core when enabled', async () => {
    const { default: createDocsIslands } = await import('../orchestrator');

    const vitepressConfig: any = {
      base: '/docs/',
    };

    createDocsIslands({
      adapters: [react()],
      siteDevtools: {},
    }).apply(vitepressConfig);

    expect(
      findPluginByName(
        vitepressConfig.vite?.plugins,
        SITE_DEVTOOLS_OPTIONAL_DEPENDENCY_BOOTSTRAP_PLUGIN_NAME,
      ),
    ).toBeTruthy();
    expect(
      findPluginByName(
        vitepressConfig.vite?.plugins,
        SITE_DEVTOOLS_SOURCE_PLUGIN_NAME,
      ),
    ).toBeTruthy();
  });

  it('does not register site-devtools orchestration in core when disabled', async () => {
    const { default: createDocsIslands } = await import('../orchestrator');

    const vitepressConfig: any = {};

    createDocsIslands({
      adapters: [react()],
    }).apply(vitepressConfig);

    expect(
      findPluginByName(
        vitepressConfig.vite?.plugins,
        SITE_DEVTOOLS_OPTIONAL_DEPENDENCY_BOOTSTRAP_PLUGIN_NAME,
      ),
    ).toBeNull();
    expect(
      findPluginByName(
        vitepressConfig.vite?.plugins,
        SITE_DEVTOOLS_SOURCE_PLUGIN_NAME,
      ),
    ).toBeNull();
  });

  it('throws when adapters is empty', async () => {
    const { default: createDocsIslands } = await import('../orchestrator');

    expect(() =>
      createDocsIslands({
        adapters: [],
      }),
    ).toThrow(
      'createDocsIslands() requires at least one adapter in the adapters array.',
    );
  });

  it('throws when the same framework adapter is registered twice', async () => {
    const { default: createDocsIslands } = await import('../orchestrator');

    expect(() =>
      createDocsIslands({
        adapters: [react(), react()],
      }),
    ).toThrow(
      'createDocsIslands() received multiple adapters for framework "react".',
    );
  });
});
