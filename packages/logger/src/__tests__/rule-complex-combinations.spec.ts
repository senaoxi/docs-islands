/**
 * Integration Tests: Rule Complex Combinations
 *
 * Tests Cases 16-23 from test-spec.md
 * - Message alone (Case 16)
 * - Main + message (Case 17)
 * - Group + message (Cases 18-19, 22)
 * - Main + group + message (Cases 20-21, 23)
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

describe('Integration: Rule Complex Combinations', () => {
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

  describe('Message Alone', () => {
    it('Case 16: Message alone as filter supports exact and match', () => {
      // Test with debug: false
      setLoggerConfig({
        debug: false,
        levels: ['warn'],
        rules: {
          Test1: { message: 'msg.exact.default', levels: 'inherit' },
          Test2: { message: 'msg.exact.explicit', levels: ['info'] },
          Test3: { message: 'msg.match.default.*', levels: 'inherit' },
          Test4: { message: 'msg.match.explicit.*', levels: ['error'] },
        },
      });

      const logger = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.case.message.cover');
      logger.warn('msg.exact.default');
      logger.info('msg.exact.explicit');
      logger.warn('msg.match.default.1');
      logger.error('msg.match.explicit.1');
      logger.info('msg.exact.default');
      logger.warn('msg.exact.explicit');
      logger.info('msg.match.default.1');
      logger.warn('msg.match.explicit.1');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy).toHaveBeenCalledTimes(2);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);

      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining(
          '@docs-islands/test[test.case.message.cover]: msg.exact.default',
        ),
      );
      expect(consoleLogSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining(
          '@docs-islands/test[test.case.message.cover]: msg.exact.explicit',
        ),
      );
      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining(
          '@docs-islands/test[test.case.message.cover]: msg.match.default.1',
        ),
      );
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining(
          '@docs-islands/test[test.case.message.cover]: msg.match.explicit.1',
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
        levels: ['warn'],
        rules: {
          Test1: { message: 'msg.exact.default', levels: 'inherit' },
          Test2: { message: 'msg.exact.explicit', levels: ['info'] },
          Test3: { message: 'msg.match.default.*', levels: 'inherit' },
          Test4: { message: 'msg.match.explicit.*', levels: ['error'] },
        },
      });

      const logger2 = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.case.message.cover');
      logger2.warn('msg.exact.default', { elapsedTimeMs: 1.23 });
      logger2.info('msg.exact.explicit', { elapsedTimeMs: 2.34 });
      logger2.warn('msg.match.default.1', { elapsedTimeMs: 3.45 });
      logger2.error('msg.match.explicit.1', { elapsedTimeMs: 4.56 });
      logger2.info('msg.exact.default');
      logger2.warn('msg.exact.explicit');
      logger2.info('msg.match.default.1');
      logger2.warn('msg.match.explicit.1');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy).toHaveBeenCalledTimes(2);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);

      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringMatching(
          /^\[Test1\].*@docs-islands\/test\[test\.case\.message\.cover\]: msg\.exact\.default.*\d\.\d{2}ms$/,
        ),
      );
      expect(consoleLogSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringMatching(
          /^\[Test2\].*@docs-islands\/test\[test\.case\.message\.cover\]: msg\.exact\.explicit.*\d\.\d{2}ms$/,
        ),
      );
      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        2,
        expect.stringMatching(
          /^\[Test3\].*@docs-islands\/test\[test\.case\.message\.cover\]: msg\.match\.default\.1.*\d\.\d{2}ms$/,
        ),
      );
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringMatching(
          /^\[Test4\].*@docs-islands\/test\[test\.case\.message\.cover\]: msg\.match\.explicit\.1.*\d\.\d{2}ms$/,
        ),
      );
    });
  });

  describe('Main + Message', () => {
    it('Case 17: Main + message combination supports exact and match', () => {
      // Test with debug: false
      setLoggerConfig({
        debug: false,
        levels: ['warn'],
        rules: {
          Test1: {
            main: '@docs-islands/test',
            message: 'main-message.exact.default',
            levels: 'inherit',
          },
          Test2: {
            main: '@docs-islands/test',
            message: 'main-message.exact.explicit',
            levels: ['error'],
          },
          Test3: {
            main: '@docs-islands/test',
            message: 'main-message.match.default.*',
            levels: 'inherit',
          },
          Test4: {
            main: '@docs-islands/test',
            message: 'main-message.match.explicit.*',
            levels: ['info'],
          },
        },
      });

      const loggerA = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.case.main.message');
      const loggerB = createLogger({
        main: '@docs-islands/test_b',
      }).getLoggerByGroup('test.case.main.message');

      loggerA.warn('main-message.exact.default');
      loggerA.error('main-message.exact.explicit');
      loggerA.warn('main-message.match.default.1');
      loggerA.info('main-message.match.explicit.1');
      loggerB.warn('main-message.exact.default');
      loggerB.error('main-message.exact.explicit');
      loggerB.warn('main-message.match.default.1');
      loggerB.info('main-message.match.explicit.1');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy).toHaveBeenCalledTimes(2);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);

      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining(
          '@docs-islands/test[test.case.main.message]: main-message.exact.default',
        ),
      );
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining(
          '@docs-islands/test[test.case.main.message]: main-message.exact.explicit',
        ),
      );
      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining(
          '@docs-islands/test[test.case.main.message]: main-message.match.default.1',
        ),
      );
      expect(consoleLogSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining(
          '@docs-islands/test[test.case.main.message]: main-message.match.explicit.1',
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
        levels: ['warn'],
        rules: {
          Test1: {
            main: '@docs-islands/test',
            message: 'main-message.exact.default',
            levels: 'inherit',
          },
          Test2: {
            main: '@docs-islands/test',
            message: 'main-message.exact.explicit',
            levels: ['error'],
          },
          Test3: {
            main: '@docs-islands/test',
            message: 'main-message.match.default.*',
            levels: 'inherit',
          },
          Test4: {
            main: '@docs-islands/test',
            message: 'main-message.match.explicit.*',
            levels: ['info'],
          },
        },
      });

      const loggerA2 = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.case.main.message');
      const loggerB2 = createLogger({
        main: '@docs-islands/test_b',
      }).getLoggerByGroup('test.case.main.message');

      loggerA2.warn('main-message.exact.default', { elapsedTimeMs: 1.23 });
      loggerA2.error('main-message.exact.explicit', { elapsedTimeMs: 2.34 });
      loggerA2.warn('main-message.match.default.1', { elapsedTimeMs: 3.45 });
      loggerA2.info('main-message.match.explicit.1', { elapsedTimeMs: 4.56 });
      loggerB2.warn('main-message.exact.default');
      loggerB2.error('main-message.exact.explicit');
      loggerB2.warn('main-message.match.default.1');
      loggerB2.info('main-message.match.explicit.1');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy).toHaveBeenCalledTimes(2);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);

      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringMatching(
          /^\[Test1\].*@docs-islands\/test\[test\.case\.main\.message\]: main-message\.exact\.default.*\d\.\d{2}ms$/,
        ),
      );
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringMatching(
          /^\[Test2\].*@docs-islands\/test\[test\.case\.main\.message\]: main-message\.exact\.explicit.*\d\.\d{2}ms$/,
        ),
      );
      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        2,
        expect.stringMatching(
          /^\[Test3\].*@docs-islands\/test\[test\.case\.main\.message\]: main-message\.match\.default\.1.*\d\.\d{2}ms$/,
        ),
      );
      expect(consoleLogSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringMatching(
          /^\[Test4\].*@docs-islands\/test\[test\.case\.main\.message\]: main-message\.match\.explicit\.1.*\d\.\d{2}ms$/,
        ),
      );
    });
  });

  describe('Group + Message', () => {
    it('Case 18: Group(exact) + message combination', () => {
      // Test with debug: false
      setLoggerConfig({
        debug: false,
        levels: ['warn'],
        rules: {
          Test1: {
            group: 'test.case.gx',
            message: 'group-exact-message-exact.default',
            levels: 'inherit',
          },
          Test2: {
            group: 'test.case.gx',
            message: 'group-exact-message-exact.explicit',
            levels: ['error'],
          },
          Test3: {
            group: 'test.case.gx',
            message: 'group-exact-message-match.default.*',
            levels: 'inherit',
          },
          Test4: {
            group: 'test.case.gx',
            message: 'group-exact-message-match.explicit.*',
            levels: ['info'],
          },
        },
      });

      const loggerA = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.case.gx');
      const loggerB = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.case.gy');

      loggerA.warn('group-exact-message-exact.default');
      loggerA.error('group-exact-message-exact.explicit');
      loggerA.warn('group-exact-message-match.default.1');
      loggerA.info('group-exact-message-match.explicit.1');
      loggerB.warn('group-exact-message-exact.default');
      loggerB.error('group-exact-message-exact.explicit');
      loggerB.warn('group-exact-message-match.default.1');
      loggerB.info('group-exact-message-match.explicit.1');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy).toHaveBeenCalledTimes(2);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);

      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining(
          '@docs-islands/test[test.case.gx]: group-exact-message-exact.default',
        ),
      );
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining(
          '@docs-islands/test[test.case.gx]: group-exact-message-exact.explicit',
        ),
      );
      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining(
          '@docs-islands/test[test.case.gx]: group-exact-message-match.default.1',
        ),
      );
      expect(consoleLogSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining(
          '@docs-islands/test[test.case.gx]: group-exact-message-match.explicit.1',
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
        levels: ['warn'],
        rules: {
          Test1: {
            group: 'test.case.gx',
            message: 'group-exact-message-exact.default',
            levels: 'inherit',
          },
          Test2: {
            group: 'test.case.gx',
            message: 'group-exact-message-exact.explicit',
            levels: ['error'],
          },
          Test3: {
            group: 'test.case.gx',
            message: 'group-exact-message-match.default.*',
            levels: 'inherit',
          },
          Test4: {
            group: 'test.case.gx',
            message: 'group-exact-message-match.explicit.*',
            levels: ['info'],
          },
        },
      });

      const loggerA2 = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.case.gx');
      const loggerB2 = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.case.gy');

      loggerA2.warn('group-exact-message-exact.default', {
        elapsedTimeMs: 1.23,
      });
      loggerA2.error('group-exact-message-exact.explicit', {
        elapsedTimeMs: 2.34,
      });
      loggerA2.warn('group-exact-message-match.default.1', {
        elapsedTimeMs: 3.45,
      });
      loggerA2.info('group-exact-message-match.explicit.1', {
        elapsedTimeMs: 4.56,
      });
      loggerB2.warn('group-exact-message-exact.default');
      loggerB2.error('group-exact-message-exact.explicit');
      loggerB2.warn('group-exact-message-match.default.1');
      loggerB2.info('group-exact-message-match.explicit.1');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy).toHaveBeenCalledTimes(2);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);

      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringMatching(
          /^\[Test1\].*@docs-islands\/test\[test\.case\.gx\]: group-exact-message-exact\.default.*\d\.\d{2}ms$/,
        ),
      );
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringMatching(
          /^\[Test2\].*@docs-islands\/test\[test\.case\.gx\]: group-exact-message-exact\.explicit.*\d\.\d{2}ms$/,
        ),
      );
      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        2,
        expect.stringMatching(
          /^\[Test3\].*@docs-islands\/test\[test\.case\.gx\]: group-exact-message-match\.default\.1.*\d\.\d{2}ms$/,
        ),
      );
      expect(consoleLogSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringMatching(
          /^\[Test4\].*@docs-islands\/test\[test\.case\.gx\]: group-exact-message-match\.explicit\.1.*\d\.\d{2}ms$/,
        ),
      );
    });

    it('Case 19: Group(match) + message combination', () => {
      // Test with debug: false
      setLoggerConfig({
        debug: false,
        levels: ['warn'],
        rules: {
          Test1: {
            group: 'test.case.gm*',
            message: 'group-match-message-exact.default',
            levels: 'inherit',
          },
          Test2: {
            group: 'test.case.gm*',
            message: 'group-match-message-exact.explicit',
            levels: ['error'],
          },
          Test3: {
            group: 'test.case.gm*',
            message: 'group-match-message-match.default.*',
            levels: 'inherit',
          },
          Test4: {
            group: 'test.case.gm*',
            message: 'group-match-message-match.explicit.*',
            levels: ['info'],
          },
        },
      });

      const loggerA = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.case.gm1');
      const loggerB = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.case.other');

      loggerA.warn('group-match-message-exact.default');
      loggerA.error('group-match-message-exact.explicit');
      loggerA.warn('group-match-message-match.default.1');
      loggerA.info('group-match-message-match.explicit.1');
      loggerB.warn('group-match-message-exact.default');
      loggerB.error('group-match-message-exact.explicit');
      loggerB.warn('group-match-message-match.default.1');
      loggerB.info('group-match-message-match.explicit.1');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy).toHaveBeenCalledTimes(2);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);

      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining(
          '@docs-islands/test[test.case.gm1]: group-match-message-exact.default',
        ),
      );
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining(
          '@docs-islands/test[test.case.gm1]: group-match-message-exact.explicit',
        ),
      );
      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining(
          '@docs-islands/test[test.case.gm1]: group-match-message-match.default.1',
        ),
      );
      expect(consoleLogSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining(
          '@docs-islands/test[test.case.gm1]: group-match-message-match.explicit.1',
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
        levels: ['warn'],
        rules: {
          Test1: {
            group: 'test.case.gm*',
            message: 'group-match-message-exact.default',
            levels: 'inherit',
          },
          Test2: {
            group: 'test.case.gm*',
            message: 'group-match-message-exact.explicit',
            levels: ['error'],
          },
          Test3: {
            group: 'test.case.gm*',
            message: 'group-match-message-match.default.*',
            levels: 'inherit',
          },
          Test4: {
            group: 'test.case.gm*',
            message: 'group-match-message-match.explicit.*',
            levels: ['info'],
          },
        },
      });

      const loggerA2 = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.case.gm1');
      const loggerB2 = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.case.other');

      loggerA2.warn('group-match-message-exact.default', {
        elapsedTimeMs: 1.23,
      });
      loggerA2.error('group-match-message-exact.explicit', {
        elapsedTimeMs: 2.34,
      });
      loggerA2.warn('group-match-message-match.default.1', {
        elapsedTimeMs: 3.45,
      });
      loggerA2.info('group-match-message-match.explicit.1', {
        elapsedTimeMs: 4.56,
      });
      loggerB2.warn('group-match-message-exact.default');
      loggerB2.error('group-match-message-exact.explicit');
      loggerB2.warn('group-match-message-match.default.1');
      loggerB2.info('group-match-message-match.explicit.1');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy).toHaveBeenCalledTimes(2);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);

      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringMatching(
          /^\[Test1\].*@docs-islands\/test\[test\.case\.gm1\]: group-match-message-exact\.default.*\d\.\d{2}ms$/,
        ),
      );
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringMatching(
          /^\[Test2\].*@docs-islands\/test\[test\.case\.gm1\]: group-match-message-exact\.explicit.*\d\.\d{2}ms$/,
        ),
      );
      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        2,
        expect.stringMatching(
          /^\[Test3\].*@docs-islands\/test\[test\.case\.gm1\]: group-match-message-match\.default\.1.*\d\.\d{2}ms$/,
        ),
      );
      expect(consoleLogSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringMatching(
          /^\[Test4\].*@docs-islands\/test\[test\.case\.gm1\]: group-match-message-match\.explicit\.1.*\d\.\d{2}ms$/,
        ),
      );
    });

    it('Case 22: Group exact matching with default and explicit levels', () => {
      // Test with debug: false
      setLoggerConfig({
        debug: false,
        levels: ['warn'],
        rules: {
          Test1: { group: 'test.only.exact.default', levels: 'inherit' },
          Test2: { group: 'test.only.exact.explicit', levels: ['error'] },
        },
      });

      const loggerA = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.only.exact.default');
      const loggerB = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.only.exact.explicit');

      loggerA.warn('group exact default');
      loggerA.error('group exact default');
      loggerB.warn('group exact explicit');
      loggerB.error('group exact explicit');

      expect(consoleLogSpy).toHaveBeenCalledTimes(0);
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);

      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining(
          '@docs-islands/test[test.only.exact.default]: group exact default',
        ),
      );
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining(
          '@docs-islands/test[test.only.exact.explicit]: group exact explicit',
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
        levels: ['warn'],
        rules: {
          Test1: { group: 'test.only.exact.default', levels: 'inherit' },
          Test2: { group: 'test.only.exact.explicit', levels: ['error'] },
        },
      });

      const loggerA2 = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.only.exact.default');
      const loggerB2 = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.only.exact.explicit');

      loggerA2.warn('group exact default', { elapsedTimeMs: 1.23 });
      loggerA2.error('group exact default');
      loggerB2.warn('group exact explicit');
      loggerB2.error('group exact explicit', { elapsedTimeMs: 2.34 });

      expect(consoleLogSpy).toHaveBeenCalledTimes(0);
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);

      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringMatching(
          /^\[Test1\].*@docs-islands\/test\[test\.only\.exact\.default\]: group exact default.*\d\.\d{2}ms$/,
        ),
      );
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringMatching(
          /^\[Test2\].*@docs-islands\/test\[test\.only\.exact\.explicit\]: group exact explicit.*\d\.\d{2}ms$/,
        ),
      );
    });
  });

  describe('Main + Group + Message', () => {
    it('Case 20: Main + group(exact) + message combination', () => {
      // Test with debug: false
      setLoggerConfig({
        debug: false,
        levels: ['warn'],
        rules: {
          Test1: {
            main: '@docs-islands/test',
            group: 'test.case.mgx',
            message: 'mgx-message-exact.default',
            levels: 'inherit',
          },
          Test2: {
            main: '@docs-islands/test',
            group: 'test.case.mgx',
            message: 'mgx-message-exact.explicit',
            levels: ['error'],
          },
          Test3: {
            main: '@docs-islands/test',
            group: 'test.case.mgx',
            message: 'mgx-message-match.default.*',
            levels: 'inherit',
          },
          Test4: {
            main: '@docs-islands/test',
            group: 'test.case.mgx',
            message: 'mgx-message-match.explicit.*',
            levels: ['info'],
          },
        },
      });

      const loggerA = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.case.mgx');
      const loggerB = createLogger({
        main: '@docs-islands/test_b',
      }).getLoggerByGroup('test.case.mgx');
      const loggerC = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.case.other');

      loggerA.warn('mgx-message-exact.default');
      loggerA.error('mgx-message-exact.explicit');
      loggerA.warn('mgx-message-match.default.1');
      loggerA.info('mgx-message-match.explicit.1');
      loggerB.warn('mgx-message-exact.default');
      loggerB.error('mgx-message-exact.explicit');
      loggerB.warn('mgx-message-match.default.1');
      loggerB.info('mgx-message-match.explicit.1');
      loggerC.warn('mgx-message-exact.default');
      loggerC.error('mgx-message-exact.explicit');
      loggerC.warn('mgx-message-match.default.1');
      loggerC.info('mgx-message-match.explicit.1');

      // Only loggerA should output (4 messages)
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy).toHaveBeenCalledTimes(2);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);

      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining(
          '@docs-islands/test[test.case.mgx]: mgx-message-exact.default',
        ),
      );
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining(
          '@docs-islands/test[test.case.mgx]: mgx-message-exact.explicit',
        ),
      );
      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining(
          '@docs-islands/test[test.case.mgx]: mgx-message-match.default.1',
        ),
      );
      expect(consoleLogSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining(
          '@docs-islands/test[test.case.mgx]: mgx-message-match.explicit.1',
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
        levels: ['warn'],
        rules: {
          Test1: {
            main: '@docs-islands/test',
            group: 'test.case.mgx',
            message: 'mgx-message-exact.default',
            levels: 'inherit',
          },
          Test2: {
            main: '@docs-islands/test',
            group: 'test.case.mgx',
            message: 'mgx-message-exact.explicit',
            levels: ['error'],
          },
          Test3: {
            main: '@docs-islands/test',
            group: 'test.case.mgx',
            message: 'mgx-message-match.default.*',
            levels: 'inherit',
          },
          Test4: {
            main: '@docs-islands/test',
            group: 'test.case.mgx',
            message: 'mgx-message-match.explicit.*',
            levels: ['info'],
          },
        },
      });

      const loggerA2 = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.case.mgx');
      const loggerB2 = createLogger({
        main: '@docs-islands/test_b',
      }).getLoggerByGroup('test.case.mgx');
      const loggerC2 = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.case.other');

      loggerA2.warn('mgx-message-exact.default', { elapsedTimeMs: 1.23 });
      loggerA2.error('mgx-message-exact.explicit', { elapsedTimeMs: 2.34 });
      loggerA2.warn('mgx-message-match.default.1', { elapsedTimeMs: 3.45 });
      loggerA2.info('mgx-message-match.explicit.1', { elapsedTimeMs: 4.56 });
      loggerB2.warn('mgx-message-exact.default');
      loggerB2.error('mgx-message-exact.explicit');
      loggerB2.warn('mgx-message-match.default.1');
      loggerB2.info('mgx-message-match.explicit.1');
      loggerC2.warn('mgx-message-exact.default');
      loggerC2.error('mgx-message-exact.explicit');
      loggerC2.warn('mgx-message-match.default.1');
      loggerC2.info('mgx-message-match.explicit.1');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy).toHaveBeenCalledTimes(2);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);

      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringMatching(
          /^\[Test1\].*@docs-islands\/test\[test\.case\.mgx\]: mgx-message-exact\.default.*\d\.\d{2}ms$/,
        ),
      );
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringMatching(
          /^\[Test2\].*@docs-islands\/test\[test\.case\.mgx\]: mgx-message-exact\.explicit.*\d\.\d{2}ms$/,
        ),
      );
      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        2,
        expect.stringMatching(
          /^\[Test3\].*@docs-islands\/test\[test\.case\.mgx\]: mgx-message-match\.default\.1.*\d\.\d{2}ms$/,
        ),
      );
      expect(consoleLogSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringMatching(
          /^\[Test4\].*@docs-islands\/test\[test\.case\.mgx\]: mgx-message-match\.explicit\.1.*\d\.\d{2}ms$/,
        ),
      );
    });

    it('Case 21: Main + group(match) + message combination', () => {
      // Test with debug: false
      setLoggerConfig({
        debug: false,
        levels: ['warn'],
        rules: {
          Test1: {
            main: '@docs-islands/test',
            group: 'test.case.mgm*',
            message: 'mgm-message-exact.default',
            levels: 'inherit',
          },
          Test2: {
            main: '@docs-islands/test',
            group: 'test.case.mgm*',
            message: 'mgm-message-exact.explicit',
            levels: ['error'],
          },
          Test3: {
            main: '@docs-islands/test',
            group: 'test.case.mgm*',
            message: 'mgm-message-match.default.*',
            levels: 'inherit',
          },
          Test4: {
            main: '@docs-islands/test',
            group: 'test.case.mgm*',
            message: 'mgm-message-match.explicit.*',
            levels: ['info'],
          },
        },
      });

      const loggerA = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.case.mgm1');
      const loggerB = createLogger({
        main: '@docs-islands/test_b',
      }).getLoggerByGroup('test.case.mgm1');
      const loggerC = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.case.other');

      loggerA.warn('mgm-message-exact.default');
      loggerA.error('mgm-message-exact.explicit');
      loggerA.warn('mgm-message-match.default.1');
      loggerA.info('mgm-message-match.explicit.1');
      loggerB.warn('mgm-message-exact.default');
      loggerB.error('mgm-message-exact.explicit');
      loggerB.warn('mgm-message-match.default.1');
      loggerB.info('mgm-message-match.explicit.1');
      loggerC.warn('mgm-message-exact.default');
      loggerC.error('mgm-message-exact.explicit');
      loggerC.warn('mgm-message-match.default.1');
      loggerC.info('mgm-message-match.explicit.1');

      // Only loggerA should output (4 messages)
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy).toHaveBeenCalledTimes(2);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);

      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining(
          '@docs-islands/test[test.case.mgm1]: mgm-message-exact.default',
        ),
      );
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining(
          '@docs-islands/test[test.case.mgm1]: mgm-message-exact.explicit',
        ),
      );
      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining(
          '@docs-islands/test[test.case.mgm1]: mgm-message-match.default.1',
        ),
      );
      expect(consoleLogSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining(
          '@docs-islands/test[test.case.mgm1]: mgm-message-match.explicit.1',
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
        levels: ['warn'],
        rules: {
          Test1: {
            main: '@docs-islands/test',
            group: 'test.case.mgm*',
            message: 'mgm-message-exact.default',
            levels: 'inherit',
          },
          Test2: {
            main: '@docs-islands/test',
            group: 'test.case.mgm*',
            message: 'mgm-message-exact.explicit',
            levels: ['error'],
          },
          Test3: {
            main: '@docs-islands/test',
            group: 'test.case.mgm*',
            message: 'mgm-message-match.default.*',
            levels: 'inherit',
          },
          Test4: {
            main: '@docs-islands/test',
            group: 'test.case.mgm*',
            message: 'mgm-message-match.explicit.*',
            levels: ['info'],
          },
        },
      });

      const loggerA2 = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.case.mgm1');
      const loggerB2 = createLogger({
        main: '@docs-islands/test_b',
      }).getLoggerByGroup('test.case.mgm1');
      const loggerC2 = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.case.other');

      loggerA2.warn('mgm-message-exact.default', { elapsedTimeMs: 1.23 });
      loggerA2.error('mgm-message-exact.explicit', { elapsedTimeMs: 2.34 });
      loggerA2.warn('mgm-message-match.default.1', { elapsedTimeMs: 3.45 });
      loggerA2.info('mgm-message-match.explicit.1', { elapsedTimeMs: 4.56 });
      loggerB2.warn('mgm-message-exact.default');
      loggerB2.error('mgm-message-exact.explicit');
      loggerB2.warn('mgm-message-match.default.1');
      loggerB2.info('mgm-message-match.explicit.1');
      loggerC2.warn('mgm-message-exact.default');
      loggerC2.error('mgm-message-exact.explicit');
      loggerC2.warn('mgm-message-match.default.1');
      loggerC2.info('mgm-message-match.explicit.1');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy).toHaveBeenCalledTimes(2);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);

      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringMatching(
          /^\[Test1\].*@docs-islands\/test\[test\.case\.mgm1\]: mgm-message-exact\.default.*\d\.\d{2}ms$/,
        ),
      );
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringMatching(
          /^\[Test2\].*@docs-islands\/test\[test\.case\.mgm1\]: mgm-message-exact\.explicit.*\d\.\d{2}ms$/,
        ),
      );
      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        2,
        expect.stringMatching(
          /^\[Test3\].*@docs-islands\/test\[test\.case\.mgm1\]: mgm-message-match\.default\.1.*\d\.\d{2}ms$/,
        ),
      );
      expect(consoleLogSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringMatching(
          /^\[Test4\].*@docs-islands\/test\[test\.case\.mgm1\]: mgm-message-match\.explicit\.1.*\d\.\d{2}ms$/,
        ),
      );
    });

    it('Case 23: Main + group(match) with default and explicit levels', () => {
      setLoggerConfig({
        debug: false,
        levels: ['warn'],
        rules: {
          Test1: {
            main: '@docs-islands/test',
            group: 'test.combo.match.default.*',
            levels: 'inherit',
          },
          Test2: {
            main: '@docs-islands/test',
            group: 'test.combo.match.explicit.*',
            levels: ['error'],
          },
        },
      });

      const loggerA = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.combo.match.default.1');
      const loggerB = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.combo.match.explicit.1');
      const loggerC = createLogger({
        main: '@docs-islands/test_b',
      }).getLoggerByGroup('test.combo.match.explicit.1');

      loggerA.warn('main group match default');
      loggerA.error('main group match default');
      loggerB.warn('main group match explicit');
      loggerB.error('main group match explicit');
      loggerC.error('main group match explicit');

      expect(consoleLogSpy).toHaveBeenCalledTimes(0);
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);

      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining(
          '@docs-islands/test[test.combo.match.default.1]: main group match default',
        ),
      );
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining(
          '@docs-islands/test[test.combo.match.explicit.1]: main group match explicit',
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
        levels: ['warn'],
        rules: {
          Test1: {
            main: '@docs-islands/test',
            group: 'test.combo.match.default.*',
            levels: 'inherit',
          },
          Test2: {
            main: '@docs-islands/test',
            group: 'test.combo.match.explicit.*',
            levels: ['error'],
          },
        },
      });

      const loggerA2 = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.combo.match.default.1');
      const loggerB2 = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.combo.match.explicit.1');
      const loggerC2 = createLogger({
        main: '@docs-islands/test_b',
      }).getLoggerByGroup('test.combo.match.explicit.1');

      loggerA2.warn('main group match default', { elapsedTimeMs: 1.23 });
      loggerA2.error('main group match default');
      loggerB2.warn('main group match explicit');
      loggerB2.error('main group match explicit', { elapsedTimeMs: 2.34 });
      loggerC2.error('main group match explicit');

      expectNoConsoleMessages(consoleLogSpy, consoleDebugSpy);
      expectConsoleMessages(consoleWarnSpy, [
        '[Test1] @docs-islands/test[test.combo.match.default.1]: main group match default 1.23ms',
      ]);
      expectConsoleMessages(consoleErrorSpy, [
        '[Test2] @docs-islands/test[test.combo.match.explicit.1]: main group match explicit 2.34ms',
      ]);
    });
  });
});
