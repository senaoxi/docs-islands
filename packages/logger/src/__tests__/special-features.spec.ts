/**
 * Integration Tests: Special Features
 *
 * Tests Cases 26-27 from test-spec.md
 * - Success level in rule mode (Case 26)
 * - Picomatch operators ? and [] (Case 27)
 *
 * @vitest-environment node
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

describe('Integration: Special Features', () => {
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

  describe('Success Level', () => {
    it('Case 26: Success level in rule mode', () => {
      // Test with debug: false
      setLoggerConfig({
        debug: false,
        levels: ['success'],
        rules: [
          { label: 'Test1', group: 'test.success.default' },
          { label: 'Test2', message: '*completed*', levels: ['success'] },
        ],
      });

      const loggerA = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.success.default');
      const loggerB = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.success.other');

      loggerA.success('task done');
      loggerA.warn('task done');
      loggerB.success('job completed');
      loggerB.info('job completed');

      expectNoConsoleMessages(consoleWarnSpy, consoleErrorSpy, consoleDebugSpy);
      expectConsoleMessages(consoleLogSpy, [
        '@docs-islands/test[test.success.default]: task done',
        '@docs-islands/test[test.success.other]: job completed',
      ]);

      // Reset for debug: true test
      consoleLogSpy.mockClear();
      resetLoggerConfig();

      // Test with debug: true
      setLoggerConfig({
        debug: true,
        levels: ['success'],
        rules: [
          { label: 'Test1', group: 'test.success.default' },
          { label: 'Test2', message: '*completed*', levels: ['success'] },
        ],
      });

      const loggerA2 = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.success.default');
      const loggerB2 = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.success.other');

      loggerA2.success('task done', { elapsedTimeMs: 1.23 });
      loggerA2.warn('task done', { elapsedTimeMs: 1.23 });
      loggerB2.success('job completed', { elapsedTimeMs: 2.34 });
      loggerB2.info('job completed', { elapsedTimeMs: 2.34 });

      expectNoConsoleMessages(consoleWarnSpy, consoleErrorSpy, consoleDebugSpy);
      expectConsoleMessages(consoleLogSpy, [
        '[Test1] @docs-islands/test[test.success.default]: task done 1.23ms',
        '[Test2] @docs-islands/test[test.success.other]: job completed 2.34ms',
      ]);
    });
  });

  describe('Picomatch Operators', () => {
    it('Case 27: Picomatch operators ? and []', () => {
      // Test with debug: false
      setLoggerConfig({
        debug: false,
        rules: [
          { label: 'Test1', group: 'test.case.?1', levels: ['warn'] },
          { label: 'Test2', message: 'task-[ab]', levels: ['error'] },
        ],
      });

      const loggerA = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.case.a1');
      const loggerB = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.case.ab1');

      loggerA.warn('noop');
      loggerA.error('task-a');
      loggerA.error('task-c');
      loggerB.warn('noop');
      loggerB.error('task-b');

      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('@docs-islands/test[test.case.a1]: noop'),
      );
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('@docs-islands/test[test.case.a1]: task-a'),
      );
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('@docs-islands/test[test.case.ab1]: task-b'),
      );

      // Reset for debug: true test
      consoleWarnSpy.mockClear();
      consoleErrorSpy.mockClear();
      resetLoggerConfig();

      // Test with debug: true
      setLoggerConfig({
        debug: true,
        rules: [
          { label: 'Test1', group: 'test.case.?1', levels: ['warn'] },
          { label: 'Test2', message: 'task-[ab]', levels: ['error'] },
        ],
      });

      const loggerA2 = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.case.a1');
      const loggerB2 = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.case.ab1');

      loggerA2.warn('noop', { elapsedTimeMs: 1.23 });
      loggerA2.error('task-a', { elapsedTimeMs: 2.34 });
      loggerA2.error('task-c', { elapsedTimeMs: 3.45 });
      loggerB2.warn('noop', { elapsedTimeMs: 4.56 });
      loggerB2.error('task-b', { elapsedTimeMs: 5.67 });

      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringMatching(
          /^\[Test1\].*@docs-islands\/test\[test\.case\.a1\]: noop.*\d\.\d{2}ms$/,
        ),
      );
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringMatching(
          /^\[Test2\].*@docs-islands\/test\[test\.case\.a1\]: task-a.*\d\.\d{2}ms$/,
        ),
      );
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        2,
        expect.stringMatching(
          /^\[Test2\].*@docs-islands\/test\[test\.case\.ab1\]: task-b.*\d\.\d{2}ms$/,
        ),
      );
    });
  });
});
