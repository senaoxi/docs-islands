/**
 * Integration Tests: Default Behavior
 *
 * Tests Cases 24-25 from test-spec.md
 * - Behavior when no rules are configured
 * - Debug mode vs non-debug mode
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

describe('Integration: Default Behavior', () => {
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

  describe('No Rules Configured', () => {
    it('Case 24: No rules with debug=false outputs default levels', () => {
      setLoggerConfig({
        debug: false,
      });

      const logger = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.case.default');
      logger.debug('message A_d');
      logger.info('message A_i');
      logger.success('message A_s');
      logger.warn('message A_w');
      logger.error('message A_e');

      expectNoConsoleMessages(consoleDebugSpy);
      expectConsoleMessages(consoleLogSpy, [
        '@docs-islands/test[test.case.default]: message A_i',
        '@docs-islands/test[test.case.default]: message A_s',
      ]);
      expectConsoleMessages(consoleWarnSpy, [
        '@docs-islands/test[test.case.default]: message A_w',
      ]);
      expectConsoleMessages(consoleErrorSpy, [
        '@docs-islands/test[test.case.default]: message A_e',
      ]);
    });

    it('Case 25: No rules with debug=true outputs all levels with elapsed time', () => {
      setLoggerConfig({
        debug: true,
      });

      const logger = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.case.default');
      logger.debug('message A_d');
      logger.info('message A_i', { elapsedTimeMs: 1.23 });
      logger.success('message A_s', { elapsedTimeMs: 2.34 });
      logger.warn('message A_w', { elapsedTimeMs: 3.45 });
      logger.error('message A_e', { elapsedTimeMs: 4.56 });

      expectConsoleMessages(consoleDebugSpy, [
        '@docs-islands/test[test.case.default]: message A_d',
      ]);
      expectConsoleMessages(consoleLogSpy, [
        '@docs-islands/test[test.case.default]: message A_i 1.23ms',
        '@docs-islands/test[test.case.default]: message A_s 2.34ms',
      ]);
      expectConsoleMessages(consoleWarnSpy, [
        '@docs-islands/test[test.case.default]: message A_w 3.45ms',
      ]);
      expectConsoleMessages(consoleErrorSpy, [
        '@docs-islands/test[test.case.default]: message A_e 4.56ms',
      ]);
    });
  });
});
