/**
 * Integration Tests: Strict Specification Compliance
 *
 * Tests Cases 32-25 from test-spec.md
 * Strengthens boundary semantics that are easy to miss with broad substring
 * assertions in the case-by-case coverage suite.
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

describe('Integration: Strict Specification Compliance', () => {
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

  it('keeps main matching exact even when the rule value contains glob magic', () => {
    setLoggerConfig({
      debug: true,
      rules: {
        WildcardMain: { levels: ['warn'], main: '@docs-islands/*' },
        ExactMain: { levels: ['error'], main: '@docs-islands/test' },
      },
    });

    const logger = createLogger({
      main: '@docs-islands/test',
    }).getLoggerByGroup('test.case.main.literal');
    const literalLogger = createLogger({
      main: '@docs-islands/*',
    }).getLoggerByGroup('test.case.main.literal');

    logger.warn('wildcard should not match');
    logger.error('exact main match', { elapsedTimeMs: 1.23 });
    literalLogger.warn('literal wildcard main', { elapsedTimeMs: 2.34 });

    expectNoConsoleMessages(consoleLogSpy, consoleDebugSpy);
    expectConsoleMessages(consoleWarnSpy, [
      '[WildcardMain] @docs-islands/*[test.case.main.literal]: literal wildcard main 2.34ms',
    ]);
    expectConsoleMessages(consoleErrorSpy, [
      '[ExactMain] @docs-islands/test[test.case.main.literal]: exact main match 1.23ms',
    ]);
  });

  it('treats rules: {} as no rules configured after normalization', () => {
    setLoggerConfig({
      debug: false,
      rules: {},
    });

    const logger = createLogger({
      main: '@docs-islands/test',
    }).getLoggerByGroup('test.case.empty.rules');

    logger.debug('debug hidden');
    logger.info('info visible');
    logger.success('success visible');
    logger.warn('warn visible');
    logger.error('error visible');

    expectNoConsoleMessages(consoleDebugSpy);
    expectConsoleMessages(consoleLogSpy, [
      '@docs-islands/test[test.case.empty.rules]: info visible',
      '@docs-islands/test[test.case.empty.rules]: success visible',
    ]);
    expectConsoleMessages(consoleWarnSpy, [
      '@docs-islands/test[test.case.empty.rules]: warn visible',
    ]);
    expectConsoleMessages(consoleErrorSpy, [
      '@docs-islands/test[test.case.empty.rules]: error visible',
    ]);

    consoleLogSpy.mockClear();
    consoleWarnSpy.mockClear();
    consoleErrorSpy.mockClear();
    consoleDebugSpy.mockClear();
    resetLoggerConfig();

    setLoggerConfig({
      debug: true,
      rules: {},
    });

    const debugLogger = createLogger({
      main: '@docs-islands/test',
    }).getLoggerByGroup('test.case.empty.rules');

    debugLogger.debug('debug visible');
    debugLogger.info('info visible', { elapsedTimeMs: 1.23 });
    debugLogger.success('success visible', { elapsedTimeMs: 2.34 });
    debugLogger.warn('warn visible', { elapsedTimeMs: 3.45 });
    debugLogger.error('error visible', { elapsedTimeMs: 4.56 });

    expectConsoleMessages(consoleDebugSpy, [
      '@docs-islands/test[test.case.empty.rules]: debug visible',
    ]);
    expectConsoleMessages(consoleLogSpy, [
      '@docs-islands/test[test.case.empty.rules]: info visible 1.23ms',
      '@docs-islands/test[test.case.empty.rules]: success visible 2.34ms',
    ]);
    expectConsoleMessages(consoleWarnSpy, [
      '@docs-islands/test[test.case.empty.rules]: warn visible 3.45ms',
    ]);
    expectConsoleMessages(consoleErrorSpy, [
      '@docs-islands/test[test.case.empty.rules]: error visible 4.56ms',
    ]);
  });

  it('uses the default resolved levels when a rule and logging config omit levels', () => {
    setLoggerConfig({
      debug: true,
      rules: {
        DefaultLevels: { levels: 'inherit' },
      },
    });

    const logger = createLogger({
      main: '@docs-islands/test',
    }).getLoggerByGroup('test.case.default.levels');

    logger.debug('debug remains rule-suppressed');
    logger.info('info visible', { elapsedTimeMs: 1.23 });
    logger.success('success visible', { elapsedTimeMs: 2.34 });
    logger.warn('warn visible', { elapsedTimeMs: 3.45 });
    logger.error('error visible', { elapsedTimeMs: 4.56 });

    expectNoConsoleMessages(consoleDebugSpy);
    expectConsoleMessages(consoleLogSpy, [
      '[DefaultLevels] @docs-islands/test[test.case.default.levels]: info visible 1.23ms',
      '[DefaultLevels] @docs-islands/test[test.case.default.levels]: success visible 2.34ms',
    ]);
    expectConsoleMessages(consoleWarnSpy, [
      '[DefaultLevels] @docs-islands/test[test.case.default.levels]: warn visible 3.45ms',
    ]);
    expectConsoleMessages(consoleErrorSpy, [
      '[DefaultLevels] @docs-islands/test[test.case.default.levels]: error visible 4.56ms',
    ]);
  });

  it('prints labels only for rules that contribute the current level', () => {
    setLoggerConfig({
      debug: true,
      levels: ['error'],
      rules: {
        InheritedError: { levels: 'inherit' },
        WarnOnly: { levels: ['warn'] },
        WarnAndError: { levels: ['warn', 'error'] },
      },
    });

    const logger = createLogger({
      main: '@docs-islands/test',
    }).getLoggerByGroup('test.case.contributing.labels');

    logger.warn('warn path', { elapsedTimeMs: 1.23 });
    logger.error('error path', { elapsedTimeMs: 2.34 });

    expectNoConsoleMessages(consoleLogSpy, consoleDebugSpy);
    expectConsoleMessages(consoleWarnSpy, [
      '[WarnOnly][WarnAndError] @docs-islands/test[test.case.contributing.labels]: warn path 1.23ms',
    ]);
    expectConsoleMessages(consoleErrorSpy, [
      '[InheritedError][WarnAndError] @docs-islands/test[test.case.contributing.labels]: error path 2.34ms',
    ]);
  });
});
