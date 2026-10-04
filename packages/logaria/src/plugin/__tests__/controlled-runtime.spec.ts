import { build } from 'esbuild';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

describe('bundler-controlled default scope', () => {
  it('guards every public default-scope mutation while keeping explicit scopes configurable', async () => {
    const result = await build({
      stdin: {
        resolveDir: process.cwd(),
        sourcefile: 'controlled-runtime.ts',
        loader: 'ts',
        contents:
          "export {setLoggerConfig,resetLoggerConfig} from './src/index.ts'; export {setScopedLoggerConfig,resetScopedLoggerConfig,shouldSuppressLog} from './src/core/index.ts'; export {DEFAULT_LOGGER_SCOPE_ID} from './src/core/helper/index.ts';",
      },
      bundle: true,
      write: false,
      platform: 'browser',
      format: 'iife',
      globalName: 'FixtureRuntime',
      define: {
        __DOCS_ISLANDS_DEFAULT_LOGGER_CONTROLLED__: 'true',
        __DOCS_ISLANDS_DEFAULT_LOGGER_CONFIG__: JSON.stringify({ levels: [] }),
      },
    });
    const context = vm.createContext({
      console: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    });
    vm.runInContext(result.outputFiles[0].text, context);
    const api = context.FixtureRuntime as typeof import('logaria') &
      typeof import('logaria/core') &
      typeof import('logaria/core/helper');
    const logContext = { main: 'fixture-app', group: 'build' };
    expect(api.shouldSuppressLog('info', logContext)).toBe(true);
    expect(() => api.setLoggerConfig({ levels: ['info'] })).toThrow(
      'controlled',
    );
    expect(() => api.resetLoggerConfig()).toThrow('controlled');
    for (const id of [api.DEFAULT_LOGGER_SCOPE_ID, '', '   ']) {
      expect(() => api.setScopedLoggerConfig(id, { levels: ['info'] })).toThrow(
        'controlled',
      );
      expect(() => api.resetScopedLoggerConfig(id)).toThrow('controlled');
    }
    expect(api.shouldSuppressLog('info', logContext)).toBe(true);
    api.setScopedLoggerConfig('fixture-host', { levels: ['info'] });
    expect(api.shouldSuppressLog('info', logContext, 'fixture-host')).toBe(
      false,
    );
    api.resetScopedLoggerConfig('fixture-host');
    expect(() =>
      api.shouldSuppressLog('info', logContext, 'fixture-host'),
    ).toThrow('not registered');
  });
});
