/**
 * @vitest-environment node
 */
import { resetLoggerConfig } from 'logaria';
import {
  resetScopedLoggerConfig,
  resolveLoggerConfig,
  shouldSuppressLog,
} from 'logaria/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VITEPRESS_HMR_LOG_GROUPS } from '../../../../shared/constants/log-groups/hmr';
import { vitepress as vitepressLogger } from '../../../../shared/logger/presets';
import { LOGGER_FACADE_PLUGIN_NAME } from '../../../constants/core/plugin-names';
import {
  LOGGER_TREE_SHAKING_PLUGIN_NAME,
  setVitePressLoggerTreeShakingEnabled,
} from '../../../core/vite-plugin-logger-tree-shaking';

const mockWarn = vi.fn();
const TEST_LOGGER_SCOPE_ID = 'test-logger-scope';

vi.mock('#shared/logger', () => ({
  createLogger: () => ({
    getLoggerByGroup: () => ({
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      success: vi.fn(),
      warn: mockWarn,
    }),
  }),
}));

const hasPluginNamed = (
  plugins: { name?: string }[] | undefined,
  name: string,
): boolean => plugins?.some((plugin) => plugin.name === name) ?? false;

afterEach(() => {
  resetLoggerConfig();
  resetScopedLoggerConfig(TEST_LOGGER_SCOPE_ID);
  setVitePressLoggerTreeShakingEnabled(TEST_LOGGER_SCOPE_ID, false);
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('react logging config', () => {
  it('uses the public logger resolver for runtime logger config', () => {
    const resolved = resolveLoggerConfig({
      debug: true,
      levels: ['info', 'success', 'warn'],
      rules: {
        'runtime-react-rule': {
          group: 'runtime.react.*',
          levels: ['warn', 'success'],
          main: '@docs-islands/vitepress',
          message: '*ready*',
        },
      },
    });

    expect(resolved).toMatchObject({
      debug: true,
      levels: ['info', 'success', 'warn'],
    });
    expect(resolved.rules).toHaveLength(1);
    expect(resolved.rules?.[0]).toMatchObject({
      label: 'runtime-react-rule',
      levels: ['warn', 'success'],
      main: '@docs-islands/vitepress',
    });
    expect(resolved.rules?.[0]?.groupMatcher?.('runtime.react.render')).toBe(
      true,
    );
    expect(resolved.rules?.[0]?.groupMatcher?.('runtime.vue.render')).toBe(
      false,
    );
    expect(resolved.rules?.[0]?.messageMatcher?.('runtime ready')).toBe(true);
    expect(resolved.rules?.[0]?.messageMatcher?.('runtime pending')).toBe(
      false,
    );
  });

  it('applies the single VitePress preset plugin before runtime registration', async () => {
    const { applyDocsIslandsUserConfig } = await import('../../../core/config');
    const vitepressConfig: Record<string, any> = {};

    const resolved = applyDocsIslandsUserConfig(
      vitepressConfig as any,
      TEST_LOGGER_SCOPE_ID,
      {
        logging: {
          levels: ['warn'],
          plugins: {
            vitepress: vitepressLogger,
          },
          extends: ['vitepress/hmr'],
          rules: {
            'vitepress/markdownUpdate': 'off',
            'vitepress/viteAfterUpdate': {
              levels: ['error'],
            },
          },
        },
      },
    );

    expect(resolved.logging).toEqual({
      extends: ['vitepress/hmr'],
      levels: ['warn'],
      plugins: {
        vitepress: vitepressLogger,
      },
      rules: {
        'vitepress/markdownUpdate': 'off',
        'vitepress/viteAfterUpdate': {
          levels: ['error'],
        },
      },
    });

    expect(
      shouldSuppressLog(
        'warn',
        {
          group: VITEPRESS_HMR_LOG_GROUPS.viteAfterUpdate,
          main: '@docs-islands/vitepress',
          message: 'ready to update',
        },
        TEST_LOGGER_SCOPE_ID,
      ),
    ).toBe(true);
    expect(
      shouldSuppressLog(
        'error',
        {
          group: VITEPRESS_HMR_LOG_GROUPS.viteAfterUpdate,
          main: '@docs-islands/vitepress',
          message: 'ready to update',
        },
        TEST_LOGGER_SCOPE_ID,
      ),
    ).toBe(false);
  });

  it('auto-installs the managed logger facade without tree-shaking by default', async () => {
    const { applyDocsIslandsUserConfig, applyDocsIslandsViteBaseConfig } =
      await import('../../../core/config');
    const vitepressConfig: Record<string, any> = {};
    const resolved = applyDocsIslandsUserConfig(
      vitepressConfig as any,
      TEST_LOGGER_SCOPE_ID,
    );

    applyDocsIslandsViteBaseConfig(
      vitepressConfig as any,
      {
        base: '/',
        cleanUrls: false,
      } as any,
      {
        ...resolved,
        siteDevtoolsEnabled: false,
      },
    );

    expect(vitepressConfig.vite.define).not.toHaveProperty(
      '__DOCS_ISLANDS_LOGGER_CONFIG__',
    );
    expect(vitepressConfig.vite.define).not.toHaveProperty(
      '__DOCS_ISLANDS_LOGGER_SCOPE_ID__',
    );
    expect(
      hasPluginNamed(vitepressConfig.vite.plugins, LOGGER_FACADE_PLUGIN_NAME),
    ).toBe(true);
    expect(
      hasPluginNamed(
        vitepressConfig.vite.plugins,
        LOGGER_TREE_SHAKING_PLUGIN_NAME,
      ),
    ).toBe(false);
  });

  it('keeps the facade and installs tree-shaking when logging.treeshake is true', async () => {
    const { applyDocsIslandsUserConfig, applyDocsIslandsViteBaseConfig } =
      await import('../../../core/config');
    const vitepressConfig: Record<string, any> = {};
    const resolved = applyDocsIslandsUserConfig(
      vitepressConfig as any,
      TEST_LOGGER_SCOPE_ID,
      {
        logging: {
          treeshake: true,
        },
      },
    );

    expect(resolved.logging).toEqual({});
    expect(resolved.loggerTreeShakingEnabled).toBe(true);

    applyDocsIslandsViteBaseConfig(
      vitepressConfig as any,
      {
        base: '/',
        cleanUrls: false,
      } as any,
      {
        ...resolved,
        siteDevtoolsEnabled: false,
      },
    );

    expect(
      hasPluginNamed(vitepressConfig.vite.plugins, LOGGER_FACADE_PLUGIN_NAME),
    ).toBe(true);
    expect(
      hasPluginNamed(
        vitepressConfig.vite.plugins,
        LOGGER_TREE_SHAKING_PLUGIN_NAME,
      ),
    ).toBe(true);
  });

  it('rejects references to removed multi-namespace VitePress presets', () => {
    expect(() =>
      resolveLoggerConfig({
        plugins: {
          vitepress: vitepressLogger,
        },
        rules: {
          'hmr/viteAfterUpdate': {
            levels: 'inherit',
          },
        },
      }),
    ).toThrow(
      'logger.rules key "hmr/viteAfterUpdate" references unknown logger plugin "hmr".',
    );
  });
});
