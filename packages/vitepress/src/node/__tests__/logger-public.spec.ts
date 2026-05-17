import { resetScopedLoggerConfig } from '@docs-islands/logger/core';
import type { LoggerConfig } from '@docs-islands/logger/types';
import * as vitepressPublicModule from '@docs-islands/vitepress';
import * as publicLoggerModule from '@docs-islands/vitepress/logger';
import { createLogger } from '@docs-islands/vitepress/logger';
import loggerPreset, {
  vitepress as vitepressLogger,
} from '@docs-islands/vitepress/logger/presets';
import type { Plugin } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createVitePressLoggerFacadePlugin,
  createVitePressLoggerVirtualModuleId,
  VITEPRESS_LOGGER_MODULE_ID,
} from '../core/vite-plugin-logger-facade';

const TEST_RUNTIME_LOGGER_SCOPE_ID = 'logger-public-runtime-scope';

const callResolveId = async (plugin: Plugin, id: string): Promise<unknown> => {
  const hook = plugin.resolveId;

  if (!hook) {
    return null;
  }

  return typeof hook === 'function'
    ? hook.call({} as never, id, undefined, {
        attributes: {},
        custom: {},
        isEntry: false,
      })
    : hook.handler.call({} as never, id, undefined, {
        attributes: {},
        custom: {},
        isEntry: false,
      });
};

const callLoad = async (plugin: Plugin, id: string): Promise<unknown> => {
  const hook = plugin.load;

  if (!hook) {
    return null;
  }

  return typeof hook === 'function'
    ? hook.call({} as never, id)
    : hook.handler.call({} as never, id);
};

afterEach(() => {
  resetScopedLoggerConfig(TEST_RUNTIME_LOGGER_SCOPE_ID);
  vi.restoreAllMocks();
});

describe('public vitepress logger api', () => {
  it('exposes only the public runtime logger surface', () => {
    expect(publicLoggerModule).toHaveProperty('createLogger');
    expect(publicLoggerModule.createLogger).toBe(createLogger);
    expect(publicLoggerModule).not.toHaveProperty('formatDebugMessage');
    expect(publicLoggerModule).not.toHaveProperty('setLoggerConfig');
    expect(publicLoggerModule).not.toHaveProperty('emitRuntimeLog');
    expect(publicLoggerModule).not.toHaveProperty('LightGeneralLogger');
    expect(publicLoggerModule).not.toHaveProperty('ScopedLogger');
    expect(publicLoggerModule).not.toHaveProperty('default');
    expect(publicLoggerModule).not.toHaveProperty('getLoggerInstance');
    expect(publicLoggerModule).not.toHaveProperty('getVitePressLogger');
    expect(publicLoggerModule).not.toHaveProperty('loggerTreeShaking');
    expect(publicLoggerModule).not.toHaveProperty('resetLoggerConfig');
    expect(vitepressPublicModule).not.toHaveProperty('formatDebugMessage');
    expect(vitepressPublicModule).not.toHaveProperty('getLoggerInstance');
    expect(vitepressPublicModule).not.toHaveProperty('getVitePressLogger');
  });

  it('generates a scope-bound virtual logger facade in managed builds', async () => {
    const loggingConfig = {
      levels: ['info'],
      rules: {
        RuntimeAllowed: {
          group: 'runtime.allowed',
          levels: ['info'],
          main: '@docs-islands/vitepress',
        },
      },
    } satisfies LoggerConfig;
    const plugin = createVitePressLoggerFacadePlugin(
      TEST_RUNTIME_LOGGER_SCOPE_ID,
      loggingConfig,
    );

    const resolved = await callResolveId(plugin, VITEPRESS_LOGGER_MODULE_ID);

    expect(resolved).toBe(
      createVitePressLoggerVirtualModuleId(TEST_RUNTIME_LOGGER_SCOPE_ID),
    );
    const source = await callLoad(plugin, resolved as string);

    expect(typeof source).toBe('string');
    const sourceCode = source as string;

    expect(sourceCode).toContain(
      `const loggerScopeId = ${JSON.stringify(TEST_RUNTIME_LOGGER_SCOPE_ID)};`,
    );
    expect(sourceCode).toContain('setScopedLoggerConfig(loggerScopeId');
    expect(sourceCode).toContain(
      `const loggerConfig = ${JSON.stringify(loggingConfig)};`,
    );
    expect(sourceCode).toContain('createScopedLogger(options, loggerScopeId)');
    expect(sourceCode).not.toContain('__DOCS_ISLANDS_LOGGER_SCOPE_ID__');
    expect(sourceCode).not.toContain('__DOCS_ISLANDS_LOGGER_CONFIG__');
  });

  it('resolves the VitePress logger to the scope-bound facade', async () => {
    const plugin = createVitePressLoggerFacadePlugin(
      TEST_RUNTIME_LOGGER_SCOPE_ID,
    );

    const resolved = await callResolveId(plugin, VITEPRESS_LOGGER_MODULE_ID);

    const source = await callLoad(plugin, resolved as string);

    expect(typeof source).toBe('string');
    expect(source as string).toContain(
      'createScopedLogger(options, loggerScopeId)',
    );
    expect(source as string).not.toContain('formatDebugMessage');
    expect(source as string).not.toContain('shouldSuppressBaseLog');
  });

  it('throws when the public logger facade runs without a createDocsIslands scope', () => {
    expect(() =>
      createLogger({
        main: '@docs-islands/vitepress-docs',
      }),
    ).toThrowError(
      '@docs-islands/vitepress/logger must be resolved by createDocsIslands()',
    );
  });

  it('exposes the public logging preset plugins through the logger presets subpath', () => {
    expect(loggerPreset).toBe(vitepressLogger);
    expect(vitepressLogger.rules.viteAfterUpdate).toEqual({
      group: 'hmr.vite.after-update',
      main: '@docs-islands/vitepress',
    });
    expect(vitepressLogger.rules.renderValidation).toEqual({
      group: 'runtime.render.validation',
      main: '@docs-islands/core',
    });
    expect(vitepressLogger.configs?.recommended.rules).toHaveProperty(
      'viteAfterUpdate',
    );
    expect(vitepressLogger.configs?.hmr.rules).toHaveProperty(
      'viteAfterUpdate',
    );
  });
});
