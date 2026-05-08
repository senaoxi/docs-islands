/**
 * Integration Tests: Enabled Gate
 *
 * Tests Cases 28-31 from test-spec.md
 * - Single disabled rule (Case 28)
 * - Disabled rule with active rules (Cases 29-30)
 * - All fields match but disabled (Case 31)
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

describe('Integration: Enabled Gate', () => {
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

  describe('Single Disabled Rule', () => {
    it('Case 28: Single disabled rule produces no output', () => {
      // Test with debug: false
      setLoggerConfig({
        debug: false,
        levels: ['warn', 'error'],
        rules: [
          { label: 'Test1', enabled: false, group: 'test.case.enabled.off' },
        ],
      });

      const logger = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.case.enabled.off');
      logger.warn('message A_w');
      logger.error('message A_e');

      expectNoConsoleMessages(
        consoleLogSpy,
        consoleWarnSpy,
        consoleErrorSpy,
        consoleDebugSpy,
      );

      // Test with debug: true as well
      consoleLogSpy.mockClear();
      consoleWarnSpy.mockClear();
      consoleErrorSpy.mockClear();
      resetLoggerConfig();

      setLoggerConfig({
        debug: true,
        levels: ['warn', 'error'],
        rules: [
          { label: 'Test1', enabled: false, group: 'test.case.enabled.off' },
        ],
      });

      const logger2 = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.case.enabled.off');
      logger2.warn('message A_w');
      logger2.error('message A_e');

      expectNoConsoleMessages(
        consoleLogSpy,
        consoleWarnSpy,
        consoleErrorSpy,
        consoleDebugSpy,
      );
    });
  });

  describe('Disabled Rule with Active Rules', () => {
    it('Case 29: Disabled rule does not contribute to level union or labels', () => {
      // Test with debug: false
      setLoggerConfig({
        debug: false,
        levels: ['warn', 'error'],
        rules: [
          {
            label: 'Test1',
            enabled: false,
            group: 'test.case.enabled.mix',
            levels: ['info', 'warn'],
          },
          { label: 'Test2', enabled: true, group: 'test.case.enabled.mix' },
        ],
      });

      const logger = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.case.enabled.mix');
      logger.info('message A_i');
      logger.warn('message A_w');
      logger.error('message A_e');

      // Only warn and error should output (from Test2 which inherits ['warn', 'error'])
      // info should NOT output because Test1 is disabled
      expectNoConsoleMessages(consoleLogSpy, consoleDebugSpy);
      expectConsoleMessages(consoleWarnSpy, [
        '@docs-islands/test[test.case.enabled.mix]: message A_w',
      ]);
      expectConsoleMessages(consoleErrorSpy, [
        '@docs-islands/test[test.case.enabled.mix]: message A_e',
      ]);

      // Reset for debug: true test
      consoleLogSpy.mockClear();
      consoleWarnSpy.mockClear();
      consoleErrorSpy.mockClear();
      resetLoggerConfig();

      // Test with debug: true
      setLoggerConfig({
        debug: true,
        levels: ['warn', 'error'],
        rules: [
          {
            label: 'Test1',
            enabled: false,
            group: 'test.case.enabled.mix',
            levels: ['info', 'warn'],
          },
          { label: 'Test2', enabled: true, group: 'test.case.enabled.mix' },
        ],
      });

      const logger2 = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.case.enabled.mix');
      logger2.info('message A_i');
      logger2.warn('message A_w', { elapsedTimeMs: 1.23 });
      logger2.error('message A_e', { elapsedTimeMs: 2.34 });

      expectNoConsoleMessages(consoleLogSpy, consoleDebugSpy);
      expectConsoleMessages(consoleWarnSpy, [
        '[Test2] @docs-islands/test[test.case.enabled.mix]: message A_w 1.23ms',
      ]);
      expectConsoleMessages(consoleErrorSpy, [
        '[Test2] @docs-islands/test[test.case.enabled.mix]: message A_e 2.34ms',
      ]);
    });

    it('Case 30: Disabled rule does not block active rules', () => {
      // Test with debug: false
      setLoggerConfig({
        debug: false,
        rules: [
          {
            label: 'Test1',
            enabled: false,
            group: 'test.case.enabled.exact',
            levels: ['error'],
          },
          {
            label: 'Test2',
            enabled: true,
            group: 'test.case.enabled.*',
            levels: ['error'],
          },
        ],
      });

      const logger = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.case.enabled.exact');
      logger.error('message A_e');

      // Test2 should match and output (Test1 is disabled)
      expectNoConsoleMessages(consoleLogSpy, consoleWarnSpy, consoleDebugSpy);
      expectConsoleMessages(consoleErrorSpy, [
        '@docs-islands/test[test.case.enabled.exact]: message A_e',
      ]);

      // Reset for debug: true test
      consoleLogSpy.mockClear();
      consoleErrorSpy.mockClear();
      resetLoggerConfig();

      // Test with debug: true
      setLoggerConfig({
        debug: true,
        rules: [
          {
            label: 'Test1',
            enabled: false,
            group: 'test.case.enabled.exact',
            levels: ['error'],
          },
          {
            label: 'Test2',
            enabled: true,
            group: 'test.case.enabled.*',
            levels: ['error'],
          },
        ],
      });

      const logger2 = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.case.enabled.exact');
      logger2.error('message A_e', { elapsedTimeMs: 1.23 });

      expectNoConsoleMessages(consoleLogSpy, consoleWarnSpy, consoleDebugSpy);
      expectConsoleMessages(consoleErrorSpy, [
        '[Test2] @docs-islands/test[test.case.enabled.exact]: message A_e 1.23ms',
      ]);
    });
  });

  describe('All Fields Match but Disabled', () => {
    it('Case 31: All fields match but enabled=false produces no output', () => {
      // Test with debug: false
      setLoggerConfig({
        debug: false,
        levels: ['warn', 'error'],
        rules: [
          {
            label: 'Test1',
            enabled: false,
            main: '@docs-islands/test',
            group: 'test.enabled.full.*',
            message: '*timeout*',
            levels: ['error'],
          },
        ],
      });

      const logger = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.enabled.full.1');
      logger.error('request timeout');

      expectNoConsoleMessages(
        consoleLogSpy,
        consoleWarnSpy,
        consoleErrorSpy,
        consoleDebugSpy,
      );

      // Test with debug: true as well
      consoleLogSpy.mockClear();
      consoleErrorSpy.mockClear();
      resetLoggerConfig();

      setLoggerConfig({
        debug: true,
        levels: ['warn', 'error'],
        rules: [
          {
            label: 'Test1',
            enabled: false,
            main: '@docs-islands/test',
            group: 'test.enabled.full.*',
            message: '*timeout*',
            levels: ['error'],
          },
        ],
      });

      const logger2 = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.enabled.full.1');
      logger2.error('request timeout');

      expectNoConsoleMessages(
        consoleLogSpy,
        consoleWarnSpy,
        consoleErrorSpy,
        consoleDebugSpy,
      );
    });
  });
});
