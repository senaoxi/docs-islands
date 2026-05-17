/**
 * Integration Tests: Rule Scope Matching
 *
 * Tests Cases 1-7 from test-spec.md
 * - No scope restrictions (Cases 1-2)
 * - Main scope matching (Case 3)
 * - Group scope matching (Cases 4-6)
 * - Main and group combined (Case 7)
 */
import {
  createLogger,
  resetLoggerConfig,
  setLoggerConfig,
} from '@docs-islands/logger';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  expectConsoleMessages,
  expectNoConsoleMessages,
} from './helpers/log-assertions';

describe('Integration: Rule Scope Matching', () => {
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

  describe('No Scope Restrictions', () => {
    it('Case 1: Rule without scope restrictions matches all logs, inherits levels', () => {
      // Test with debug: false
      setLoggerConfig({
        debug: false,
        levels: ['warn', 'error'],
        rules: {
          Test1: { levels: 'inherit' },
          Test2: { levels: 'inherit' },
        },
      });

      const logger = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.case.a');
      logger.info('message A_a');
      logger.warn('message A_b_1');
      logger.warn('message A_b_2');
      logger.error('message A_c');

      expect(consoleLogSpy).toHaveBeenCalledTimes(0); // info is not in levels
      expect(consoleWarnSpy).toHaveBeenCalledTimes(2);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining(
          '@docs-islands/test[test.case.a]: message A_b_1',
        ),
      );
      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining(
          '@docs-islands/test[test.case.a]: message A_b_2',
        ),
      );
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('@docs-islands/test[test.case.a]: message A_c'),
      );

      // Reset for debug: true test
      consoleLogSpy.mockClear();
      consoleWarnSpy.mockClear();
      consoleErrorSpy.mockClear();
      resetLoggerConfig();

      // Test with debug: true
      setLoggerConfig({
        debug: true,
        levels: ['warn', 'error'],
        rules: {
          Test1: { levels: 'inherit' },
          Test2: { levels: 'inherit' },
        },
      });

      const logger2 = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.case.a');
      logger2.info('message A_a');
      logger2.warn('message A_b_1', { elapsedTimeMs: 1.23 });
      logger2.warn('message A_b_2', { elapsedTimeMs: 2.34 });
      logger2.error('message A_c', { elapsedTimeMs: 3.45 });

      expect(consoleLogSpy).toHaveBeenCalledTimes(0);
      expect(consoleWarnSpy).toHaveBeenCalledTimes(2);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringMatching(
          /^\[Test1\]\[Test2\].*@docs-islands\/test\[test\.case\.a\]: message A_b_1.*\d\.\d{2}ms$/,
        ),
      );
      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        2,
        expect.stringMatching(
          /^\[Test1\]\[Test2\].*@docs-islands\/test\[test\.case\.a\]: message A_b_2.*\d\.\d{2}ms$/,
        ),
      );
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringMatching(
          /^\[Test1\]\[Test2\].*@docs-islands\/test\[test\.case\.a\]: message A_c.*\d\.\d{2}ms$/,
        ),
      );
    });

    it('Case 2: Rule.levels overrides logging.levels, union of all matched rules', () => {
      // Test with debug: false
      setLoggerConfig({
        debug: false,
        levels: ['warn', 'error'],
        rules: {
          Test1: { levels: 'inherit' },
          Test2: { levels: ['warn', 'info'] },
        },
      });

      const logger = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.case.a');
      logger.info('message A_a');
      logger.warn('message A_b_1');
      logger.warn('message A_b_2');
      logger.error('message A_c');

      // info matches Test2 → console.log
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      expect(consoleLogSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('@docs-islands/test[test.case.a]: message A_a'),
      );

      // warn matches Test1 and Test2 → console.warn
      expect(consoleWarnSpy).toHaveBeenCalledTimes(2);
      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining(
          '@docs-islands/test[test.case.a]: message A_b_1',
        ),
      );
      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining(
          '@docs-islands/test[test.case.a]: message A_b_2',
        ),
      );

      // error matches Test1 → console.error
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('@docs-islands/test[test.case.a]: message A_c'),
      );

      // Reset for debug: true test
      consoleLogSpy.mockClear();
      consoleWarnSpy.mockClear();
      consoleErrorSpy.mockClear();
      resetLoggerConfig();

      // Test with debug: true
      setLoggerConfig({
        debug: true,
        levels: ['warn', 'error'],
        rules: {
          Test1: { levels: 'inherit' },
          Test2: { levels: ['warn', 'info'] },
        },
      });

      const logger2 = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.case.a');
      logger2.info('message A_a', { elapsedTimeMs: 1.23 });
      logger2.warn('message A_b_1', { elapsedTimeMs: 2.34 });
      logger2.warn('message A_b_2', { elapsedTimeMs: 3.45 });
      logger2.error('message A_c', { elapsedTimeMs: 4.56 });

      // info only matches Test2 → console.log
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      expect(consoleLogSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringMatching(
          /^\[Test2\].*@docs-islands\/test\[test\.case\.a\]: message A_a.*\d\.\d{2}ms$/,
        ),
      );

      // warn matches both Test1 and Test2 → console.warn
      expect(consoleWarnSpy).toHaveBeenCalledTimes(2);
      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringMatching(
          /^\[Test1\]\[Test2\].*@docs-islands\/test\[test\.case\.a\]: message A_b_1.*\d\.\d{2}ms$/,
        ),
      );
      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        2,
        expect.stringMatching(
          /^\[Test1\]\[Test2\].*@docs-islands\/test\[test\.case\.a\]: message A_b_2.*\d\.\d{2}ms$/,
        ),
      );

      // error only matches Test1 → console.error
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringMatching(
          /^\[Test1\].*@docs-islands\/test\[test\.case\.a\]: message A_c.*\d\.\d{2}ms$/,
        ),
      );
    });
  });

  describe('Main Scope Matching', () => {
    it('Case 3: Main scope matching with multiple rules', () => {
      // Test with debug: false
      setLoggerConfig({
        debug: false,
        levels: ['warn', 'error'],
        rules: {
          Test1: { levels: ['warn'] },
          Test2: { main: '@docs-islands/test', levels: 'inherit' },
          Test3: { levels: ['warn', 'info'], main: '@docs-islands/test_b' },
          Test4: { levels: ['error'], main: '@docs-islands/test_b' },
        },
      });

      const loggerA = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.case.a');
      const loggerB = createLogger({
        main: '@docs-islands/test_b',
      }).getLoggerByGroup('test.case.b');

      loggerA.info('message A_a');
      loggerA.warn('message A_b_1');
      loggerA.warn('message A_b_2');
      loggerA.error('message A_c');
      loggerB.info('message B_a');
      loggerB.warn('message B_b_1');
      loggerB.warn('message B_b_2');
      loggerB.error('message B_c');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy).toHaveBeenCalledTimes(4);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);

      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining(
          '@docs-islands/test[test.case.a]: message A_b_1',
        ),
      );
      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining(
          '@docs-islands/test[test.case.a]: message A_b_2',
        ),
      );
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('@docs-islands/test[test.case.a]: message A_c'),
      );
      expect(consoleLogSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining(
          '@docs-islands/test_b[test.case.b]: message B_a',
        ),
      );
      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        3,
        expect.stringContaining(
          '@docs-islands/test_b[test.case.b]: message B_b_1',
        ),
      );
      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        4,
        expect.stringContaining(
          '@docs-islands/test_b[test.case.b]: message B_b_2',
        ),
      );
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining(
          '@docs-islands/test_b[test.case.b]: message B_c',
        ),
      );

      // Reset for debug: true test
      consoleLogSpy.mockClear();
      consoleWarnSpy.mockClear();
      consoleErrorSpy.mockClear();
      resetLoggerConfig();

      // Test with debug: true
      setLoggerConfig({
        debug: true,
        levels: ['warn', 'error'],
        rules: {
          Test1: { levels: ['warn'] },
          Test2: { main: '@docs-islands/test', levels: 'inherit' },
          Test3: { levels: ['warn', 'info'], main: '@docs-islands/test_b' },
          Test4: { levels: ['error'], main: '@docs-islands/test_b' },
        },
      });

      const loggerA2 = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.case.a');
      const loggerB2 = createLogger({
        main: '@docs-islands/test_b',
      }).getLoggerByGroup('test.case.b');

      loggerA2.info('message A_a');
      loggerA2.warn('message A_b_1', { elapsedTimeMs: 1.23 });
      loggerA2.warn('message A_b_2', { elapsedTimeMs: 2.34 });
      loggerA2.error('message A_c', { elapsedTimeMs: 3.45 });
      loggerB2.info('message B_a', { elapsedTimeMs: 4.56 });
      loggerB2.warn('message B_b_1', { elapsedTimeMs: 5.67 });
      loggerB2.warn('message B_b_2', { elapsedTimeMs: 6.78 });
      loggerB2.error('message B_c', { elapsedTimeMs: 7.89 });

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy).toHaveBeenCalledTimes(4);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);

      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringMatching(
          /^\[Test1\]\[Test2\].*@docs-islands\/test\[test\.case\.a\]: message A_b_1.*\d\.\d{2}ms$/,
        ),
      );
      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        2,
        expect.stringMatching(
          /^\[Test1\]\[Test2\].*@docs-islands\/test\[test\.case\.a\]: message A_b_2.*\d\.\d{2}ms$/,
        ),
      );
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringMatching(
          /^\[Test2\].*@docs-islands\/test\[test\.case\.a\]: message A_c.*\d\.\d{2}ms$/,
        ),
      );
      expect(consoleLogSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringMatching(
          /^\[Test3\].*@docs-islands\/test_b\[test\.case\.b\]: message B_a.*\d\.\d{2}ms$/,
        ),
      );
      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        3,
        expect.stringMatching(
          /^\[Test1\]\[Test3\].*@docs-islands\/test_b\[test\.case\.b\]: message B_b_1.*\d\.\d{2}ms$/,
        ),
      );
      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        4,
        expect.stringMatching(
          /^\[Test1\]\[Test3\].*@docs-islands\/test_b\[test\.case\.b\]: message B_b_2.*\d\.\d{2}ms$/,
        ),
      );
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        2,
        expect.stringMatching(
          /^\[Test4\].*@docs-islands\/test_b\[test\.case\.b\]: message B_c.*\d\.\d{2}ms$/,
        ),
      );
    });
  });

  describe('Group Scope Matching', () => {
    it('Case 4: Group scope matching independent of main', () => {
      setLoggerConfig({
        debug: false,
        levels: ['warn', 'error'],
        rules: {
          Test1: { group: 'test.case.a', levels: 'inherit' },
        },
      });

      const loggerA = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.case.a');
      const loggerB = createLogger({
        main: '@docs-islands/test_b',
      }).getLoggerByGroup('test.case.a');
      const loggerAB = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.case.b');

      loggerA.info('message A_a');
      loggerA.warn('message A_b_1');
      loggerA.warn('message A_b_2');
      loggerA.error('message A_c');
      loggerB.info('message B_a');
      loggerB.warn('message B_b_1');
      loggerB.warn('message B_b_2');
      loggerB.error('message B_c');
      loggerAB.info('message A_B_a');
      loggerAB.warn('message A_B_b_1');
      loggerAB.warn('message A_B_b_2');
      loggerAB.error('message A_B_c');

      // Only test.case.a group should output (4 warn + 2 error)
      expect(consoleLogSpy).toHaveBeenCalledTimes(0);
      expect(consoleWarnSpy).toHaveBeenCalledTimes(4);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining(
          '@docs-islands/test[test.case.a]: message A_b_1',
        ),
      );
      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining(
          '@docs-islands/test[test.case.a]: message A_b_2',
        ),
      );
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('@docs-islands/test[test.case.a]: message A_c'),
      );
      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        3,
        expect.stringContaining(
          '@docs-islands/test_b[test.case.a]: message B_b_1',
        ),
      );
      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        4,
        expect.stringContaining(
          '@docs-islands/test_b[test.case.a]: message B_b_2',
        ),
      );
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining(
          '@docs-islands/test_b[test.case.a]: message B_c',
        ),
      );

      // Reset for debug: true test
      consoleLogSpy.mockClear();
      consoleWarnSpy.mockClear();
      consoleErrorSpy.mockClear();
      consoleDebugSpy.mockClear();
      resetLoggerConfig();

      setLoggerConfig({
        debug: true,
        levels: ['warn', 'error'],
        rules: {
          Test1: { group: 'test.case.a', levels: 'inherit' },
        },
      });

      const loggerA2 = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.case.a');
      const loggerB2 = createLogger({
        main: '@docs-islands/test_b',
      }).getLoggerByGroup('test.case.a');
      const loggerAB2 = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.case.b');

      loggerA2.info('message A_a');
      loggerA2.warn('message A_b_1', { elapsedTimeMs: 1.23 });
      loggerA2.warn('message A_b_2', { elapsedTimeMs: 2.34 });
      loggerA2.error('message A_c', { elapsedTimeMs: 3.45 });
      loggerB2.info('message B_a');
      loggerB2.warn('message B_b_1', { elapsedTimeMs: 4.56 });
      loggerB2.warn('message B_b_2', { elapsedTimeMs: 5.67 });
      loggerB2.error('message B_c', { elapsedTimeMs: 6.78 });
      loggerAB2.info('message A_B_a');
      loggerAB2.warn('message A_B_b_1');
      loggerAB2.warn('message A_B_b_2');
      loggerAB2.error('message A_B_c');

      expectNoConsoleMessages(consoleLogSpy, consoleDebugSpy);
      expectConsoleMessages(consoleWarnSpy, [
        '[Test1] @docs-islands/test[test.case.a]: message A_b_1 1.23ms',
        '[Test1] @docs-islands/test[test.case.a]: message A_b_2 2.34ms',
        '[Test1] @docs-islands/test_b[test.case.a]: message B_b_1 4.56ms',
        '[Test1] @docs-islands/test_b[test.case.a]: message B_b_2 5.67ms',
      ]);
      expectConsoleMessages(consoleErrorSpy, [
        '[Test1] @docs-islands/test[test.case.a]: message A_c 3.45ms',
        '[Test1] @docs-islands/test_b[test.case.a]: message B_c 6.78ms',
      ]);
    });

    it('Case 5: Group glob pattern matching with *', () => {
      // Test with debug: false
      setLoggerConfig({
        debug: false,
        levels: ['warn', 'error'],
        rules: {
          Test1: { group: 'test.case.b*', levels: 'inherit' },
          Test2: { group: 'test.case.*', levels: ['warn'] },
          Test3: { group: 'test.*', levels: ['info'] },
          Test4: { group: 'test.*', levels: ['error'] },
        },
      });

      const loggerA = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.case.a');
      const loggerB = createLogger({
        main: '@docs-islands/test_b',
      }).getLoggerByGroup('test.case.b_1');
      const loggerAB = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.case.b_2');
      const loggerABC = createLogger({
        main: '@docs-islands/test_c',
      }).getLoggerByGroup('test.c');

      loggerA.info('message A_a');
      loggerA.warn('message A_b_1');
      loggerA.warn('message A_b_2');
      loggerA.error('message A_c');
      loggerB.info('message B_a');
      loggerB.warn('message B_b_1');
      loggerB.warn('message B_b_2');
      loggerB.error('message B_c');
      loggerAB.info('message A_B_a');
      loggerAB.warn('message A_B_b_1');
      loggerAB.warn('message A_B_b_2');
      loggerAB.error('message A_B_c');
      loggerABC.info('message A_B_C_a');
      loggerABC.warn('message A_B_C_b_1');
      loggerABC.warn('message A_B_C_b_2');
      loggerABC.error('message A_B_C_c');

      expect(consoleLogSpy).toHaveBeenCalledTimes(4);
      expect(consoleWarnSpy).toHaveBeenCalledTimes(6);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(4);

      expect(consoleLogSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('@docs-islands/test[test.case.a]: message A_a'),
      );
      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining(
          '@docs-islands/test[test.case.a]: message A_b_1',
        ),
      );
      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining(
          '@docs-islands/test[test.case.a]: message A_b_2',
        ),
      );
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('@docs-islands/test[test.case.a]: message A_c'),
      );
      expect(consoleLogSpy).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining(
          '@docs-islands/test_b[test.case.b_1]: message B_a',
        ),
      );
      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        3,
        expect.stringContaining(
          '@docs-islands/test_b[test.case.b_1]: message B_b_1',
        ),
      );
      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        4,
        expect.stringContaining(
          '@docs-islands/test_b[test.case.b_1]: message B_b_2',
        ),
      );
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining(
          '@docs-islands/test_b[test.case.b_1]: message B_c',
        ),
      );
      expect(consoleLogSpy).toHaveBeenNthCalledWith(
        3,
        expect.stringContaining(
          '@docs-islands/test[test.case.b_2]: message A_B_a',
        ),
      );
      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        5,
        expect.stringContaining(
          '@docs-islands/test[test.case.b_2]: message A_B_b_1',
        ),
      );
      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        6,
        expect.stringContaining(
          '@docs-islands/test[test.case.b_2]: message A_B_b_2',
        ),
      );
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        3,
        expect.stringContaining(
          '@docs-islands/test[test.case.b_2]: message A_B_c',
        ),
      );
      expect(consoleLogSpy).toHaveBeenNthCalledWith(
        4,
        expect.stringContaining(
          '@docs-islands/test_c[test.c]: message A_B_C_a',
        ),
      );
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        4,
        expect.stringContaining(
          '@docs-islands/test_c[test.c]: message A_B_C_c',
        ),
      );

      // Reset for debug: true test
      consoleLogSpy.mockClear();
      consoleWarnSpy.mockClear();
      consoleErrorSpy.mockClear();
      resetLoggerConfig();

      // Test with debug: true
      setLoggerConfig({
        debug: true,
        levels: ['warn', 'error'],
        rules: {
          Test1: { group: 'test.case.b*', levels: 'inherit' },
          Test2: { group: 'test.case.*', levels: ['warn'] },
          Test3: { group: 'test.*', levels: ['info'] },
          Test4: { group: 'test.*', levels: ['error'] },
        },
      });

      const loggerA2 = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.case.a');
      const loggerB2 = createLogger({
        main: '@docs-islands/test_b',
      }).getLoggerByGroup('test.case.b_1');
      const loggerAB2 = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.case.b_2');
      const loggerABC2 = createLogger({
        main: '@docs-islands/test_c',
      }).getLoggerByGroup('test.c');

      loggerA2.info('message A_a', { elapsedTimeMs: 1.23 });
      loggerA2.warn('message A_b_1', { elapsedTimeMs: 2.34 });
      loggerA2.warn('message A_b_2', { elapsedTimeMs: 3.45 });
      loggerA2.error('message A_c', { elapsedTimeMs: 4.56 });
      loggerB2.info('message B_a', { elapsedTimeMs: 5.67 });
      loggerB2.warn('message B_b_1', { elapsedTimeMs: 6.78 });
      loggerB2.warn('message B_b_2', { elapsedTimeMs: 7.89 });
      loggerB2.error('message B_c', { elapsedTimeMs: 8.9 });
      loggerAB2.info('message A_B_a', { elapsedTimeMs: 9.01 });
      loggerAB2.warn('message A_B_b_1', { elapsedTimeMs: 10.12 });
      loggerAB2.warn('message A_B_b_2', { elapsedTimeMs: 11.23 });
      loggerAB2.error('message A_B_c', { elapsedTimeMs: 12.34 });
      loggerABC2.info('message A_B_C_a', { elapsedTimeMs: 13.45 });
      loggerABC2.warn('message A_B_C_b_1');
      loggerABC2.warn('message A_B_C_b_2');
      loggerABC2.error('message A_B_C_c', { elapsedTimeMs: 14.56 });

      expect(consoleLogSpy).toHaveBeenCalledTimes(4);
      expect(consoleWarnSpy).toHaveBeenCalledTimes(6);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(4);

      expect(consoleLogSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringMatching(
          /^\[Test3\].*@docs-islands\/test\[test\.case\.a\]: message A_a.*\d\.\d{2}ms$/,
        ),
      );
      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringMatching(
          /^\[Test2\].*@docs-islands\/test\[test\.case\.a\]: message A_b_1.*\d\.\d{2}ms$/,
        ),
      );
      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        2,
        expect.stringMatching(
          /^\[Test2\].*@docs-islands\/test\[test\.case\.a\]: message A_b_2.*\d\.\d{2}ms$/,
        ),
      );
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringMatching(
          /^\[Test4\].*@docs-islands\/test\[test\.case\.a\]: message A_c.*\d\.\d{2}ms$/,
        ),
      );
      expect(consoleLogSpy).toHaveBeenNthCalledWith(
        2,
        expect.stringMatching(
          /^\[Test3\].*@docs-islands\/test_b\[test\.case\.b_1\]: message B_a.*\d\.\d{2}ms$/,
        ),
      );
      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        3,
        expect.stringMatching(
          /^\[Test1\]\[Test2\].*@docs-islands\/test_b\[test\.case\.b_1\]: message B_b_1.*\d\.\d{2}ms$/,
        ),
      );
      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        4,
        expect.stringMatching(
          /^\[Test1\]\[Test2\].*@docs-islands\/test_b\[test\.case\.b_1\]: message B_b_2.*\d\.\d{2}ms$/,
        ),
      );
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        2,
        expect.stringMatching(
          /^\[Test1\]\[Test4\].*@docs-islands\/test_b\[test\.case\.b_1\]: message B_c.*\d\.\d{2}ms$/,
        ),
      );
      expect(consoleLogSpy).toHaveBeenNthCalledWith(
        3,
        expect.stringMatching(
          /^\[Test3\].*@docs-islands\/test\[test\.case\.b_2\]: message A_B_a.*\d\.\d{2}ms$/,
        ),
      );
      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        5,
        expect.stringMatching(
          /^\[Test1\]\[Test2\].*@docs-islands\/test\[test\.case\.b_2\]: message A_B_b_1.*\d\.\d{2}ms$/,
        ),
      );
      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        6,
        expect.stringMatching(
          /^\[Test1\]\[Test2\].*@docs-islands\/test\[test\.case\.b_2\]: message A_B_b_2.*\d\.\d{2}ms$/,
        ),
      );
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        3,
        expect.stringMatching(
          /^\[Test1\]\[Test4\].*@docs-islands\/test\[test\.case\.b_2\]: message A_B_c.*\d\.\d{2}ms$/,
        ),
      );
      expect(consoleLogSpy).toHaveBeenNthCalledWith(
        4,
        expect.stringMatching(
          /^\[Test3\].*@docs-islands\/test_c\[test\.c\]: message A_B_C_a.*\d\.\d{2}ms$/,
        ),
      );
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        4,
        expect.stringMatching(
          /^\[Test4\].*@docs-islands\/test_c\[test\.c\]: message A_B_C_c.*\d\.\d{2}ms$/,
        ),
      );
    });

    it('Case 6: When rules exist but no rule matches, no output', () => {
      // Test with debug: false
      setLoggerConfig({
        debug: false,
        levels: ['warn', 'error'],
        rules: {
          Test1: { group: 'test.case.a', levels: 'inherit' },
        },
      });

      const logger = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.case.b');
      logger.info('message A_a');
      logger.warn('message A_b');
      logger.error('message A_c');

      expect(consoleLogSpy).toHaveBeenCalledTimes(0);
      expect(consoleWarnSpy).toHaveBeenCalledTimes(0);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);

      // Reset for debug: true test
      consoleLogSpy.mockClear();
      consoleWarnSpy.mockClear();
      consoleErrorSpy.mockClear();
      resetLoggerConfig();

      // Test with debug: true
      setLoggerConfig({
        debug: true,
        levels: ['warn', 'error'],
        rules: {
          Test1: { group: 'test.case.a', levels: 'inherit' },
        },
      });

      const logger2 = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.case.b');
      logger2.info('message A_a');
      logger2.warn('message A_b');
      logger2.error('message A_c');

      // Should still have no output in debug mode
      expect(consoleLogSpy).toHaveBeenCalledTimes(0);
      expect(consoleWarnSpy).toHaveBeenCalledTimes(0);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
    });
  });

  describe('Main and Group Combined', () => {
    it('Case 7: Main and group together use AND matching', () => {
      setLoggerConfig({
        debug: false,
        levels: ['warn', 'error'],
        rules: {
          Test1: {
            main: '@docs-islands/test',
            group: 'test.case.a',
            levels: 'inherit',
          },
          Test2: {
            main: '@docs-islands/test_b',
            group: 'test.case.a',
            levels: ['warn'],
          },
        },
      });

      const loggerA = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.case.a');
      const loggerB = createLogger({
        main: '@docs-islands/test_b',
      }).getLoggerByGroup('test.case.a');
      const loggerC = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.case.b');

      loggerA.warn('message A_b');
      loggerA.error('message A_c');
      loggerB.warn('message B_b');
      loggerB.error('message B_c');
      loggerC.warn('message C_b');
      loggerC.error('message C_c');

      expect(consoleWarnSpy).toHaveBeenCalledTimes(2);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('@docs-islands/test[test.case.a]: message A_b'),
      );
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('@docs-islands/test[test.case.a]: message A_c'),
      );
      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining(
          '@docs-islands/test_b[test.case.a]: message B_b',
        ),
      );

      // Reset for debug: true test
      consoleLogSpy.mockClear();
      consoleWarnSpy.mockClear();
      consoleErrorSpy.mockClear();
      consoleDebugSpy.mockClear();
      resetLoggerConfig();

      setLoggerConfig({
        debug: true,
        levels: ['warn', 'error'],
        rules: {
          Test1: {
            main: '@docs-islands/test',
            group: 'test.case.a',
            levels: 'inherit',
          },
          Test2: {
            main: '@docs-islands/test_b',
            group: 'test.case.a',
            levels: ['warn'],
          },
        },
      });

      const loggerA2 = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.case.a');
      const loggerB2 = createLogger({
        main: '@docs-islands/test_b',
      }).getLoggerByGroup('test.case.a');
      const loggerC2 = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.case.b');

      loggerA2.warn('message A_b', { elapsedTimeMs: 1.23 });
      loggerA2.error('message A_c', { elapsedTimeMs: 2.34 });
      loggerB2.warn('message B_b', { elapsedTimeMs: 3.45 });
      loggerB2.error('message B_c');
      loggerC2.warn('message C_b');
      loggerC2.error('message C_c');

      expectNoConsoleMessages(consoleLogSpy, consoleDebugSpy);
      expectConsoleMessages(consoleWarnSpy, [
        '[Test1] @docs-islands/test[test.case.a]: message A_b 1.23ms',
        '[Test2] @docs-islands/test_b[test.case.a]: message B_b 3.45ms',
      ]);
      expectConsoleMessages(consoleErrorSpy, [
        '[Test1] @docs-islands/test[test.case.a]: message A_c 2.34ms',
      ]);
    });
  });
});
