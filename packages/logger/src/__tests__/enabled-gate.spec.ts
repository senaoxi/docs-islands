/**
 * Integration Tests: Off Rule Overrides
 *
 * @vitest-environment node
 */
import {
  createLogger,
  resetLoggerConfig,
  setLoggerConfig,
} from '@docs-islands/logger';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import {
  expectConsoleMessages,
  expectNoConsoleMessages,
} from './helpers/log-assertions';

describe('Integration: Off Rule Overrides', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleDebugSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleDebugSpy.mockRestore();
    resetLoggerConfig();
  });

  it('falls back to default rule-less behavior when every rule is off', () => {
    setLoggerConfig({
      levels: ['warn', 'error'],
      rules: {
        Test1: 'off',
      },
    });

    const logger = createLogger({
      main: '@docs-islands/test',
    }).getLoggerByGroup('test.case.off.fallback');

    logger.info('message A_i');
    logger.warn('message A_w');
    logger.error('message A_e');

    expectNoConsoleMessages(consoleLogSpy, consoleDebugSpy);
    expectConsoleMessages(consoleWarnSpy, [
      '@docs-islands/test[test.case.off.fallback]: message A_w',
    ]);
    expectConsoleMessages(consoleErrorSpy, [
      '@docs-islands/test[test.case.off.fallback]: message A_e',
    ]);

    consoleWarnSpy.mockClear();
    consoleErrorSpy.mockClear();
    resetLoggerConfig();

    setLoggerConfig({
      debug: true,
      levels: ['warn', 'error'],
      rules: {
        Test1: 'off',
      },
    });

    const debugLogger = createLogger({
      main: '@docs-islands/test',
    }).getLoggerByGroup('test.case.off.fallback');

    debugLogger.debug('message A_d');
    debugLogger.warn('message A_w', { elapsedTimeMs: 1.23 });
    debugLogger.error('message A_e', { elapsedTimeMs: 2.34 });

    expectConsoleMessages(consoleDebugSpy, [
      '@docs-islands/test[test.case.off.fallback]: message A_d',
    ]);
    expectConsoleMessages(consoleWarnSpy, [
      '@docs-islands/test[test.case.off.fallback]: message A_w 1.23ms',
    ]);
    expectConsoleMessages(consoleErrorSpy, [
      '@docs-islands/test[test.case.off.fallback]: message A_e 2.34ms',
    ]);
  });

  it('deletes an extended plugin rule without creating a disabled rule label', () => {
    setLoggerConfig({
      debug: true,
      levels: ['warn', 'error'],
      plugins: {
        test: {
          configs: {
            recommended: {
              rules: {
                exact: {
                  levels: 'inherit',
                },
                glob: {
                  levels: ['error'],
                },
              },
            },
          },
          rules: {
            exact: {
              group: 'test.case.off.exact',
              main: '@docs-islands/test',
            },
            glob: {
              group: 'test.case.off.*',
              main: '@docs-islands/test',
            },
          },
        },
      },
      extends: ['test/recommended'],
      rules: {
        'test/exact': 'off',
      },
    });

    const logger = createLogger({
      main: '@docs-islands/test',
    }).getLoggerByGroup('test.case.off.exact');

    logger.warn('message A_w');
    logger.error('message A_e', { elapsedTimeMs: 1.23 });

    expectNoConsoleMessages(consoleLogSpy, consoleDebugSpy, consoleWarnSpy);
    expectConsoleMessages(consoleErrorSpy, [
      '[test/glob] @docs-islands/test[test.case.off.exact]: message A_e 1.23ms',
    ]);
  });

  it('does not treat off as a lower-priority deny rule', () => {
    setLoggerConfig({
      debug: true,
      levels: ['warn', 'error'],
      rules: {
        ExactDisabled: 'off',
        GlobActive: {
          group: 'test.case.off.*',
          levels: 'inherit',
        },
      },
    });

    const logger = createLogger({
      main: '@docs-islands/test',
    }).getLoggerByGroup('test.case.off.exact');

    logger.warn('message A_w', { elapsedTimeMs: 1.23 });
    logger.error('message A_e', { elapsedTimeMs: 2.34 });

    expectNoConsoleMessages(consoleLogSpy, consoleDebugSpy);
    expectConsoleMessages(consoleWarnSpy, [
      '[GlobActive] @docs-islands/test[test.case.off.exact]: message A_w 1.23ms',
    ]);
    expectConsoleMessages(consoleErrorSpy, [
      '[GlobActive] @docs-islands/test[test.case.off.exact]: message A_e 2.34ms',
    ]);
  });
});
