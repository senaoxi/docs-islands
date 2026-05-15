/**
 * Integration Tests: Rule Message Matching
 *
 * Tests Cases 8-15 from test-spec.md
 * - Exact message matching (Case 8)
 * - Message glob patterns (Cases 9-12)
 * - Combined scope and message matching (Cases 10, 13-15)
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

describe('Integration: Rule Message Matching', () => {
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

  describe('Exact Message Matching', () => {
    it('Case 8: Exact message matching', () => {
      // Test with debug: false
      setLoggerConfig({
        debug: false,
        levels: ['warn', 'error'],
        rules: {
          Test1: { message: 'request timeout', levels: ['error'] },
          Test2: { message: 'slow query', levels: ['warn'] },
        },
      });

      const logger = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.case.message');
      logger.info('slow query');
      logger.warn('slow query');
      logger.warn('slow query 123');
      logger.error('request timeout');
      logger.error('request timeout on user api');

      expect(consoleLogSpy).toHaveBeenCalledTimes(0);
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);

      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining(
          '@docs-islands/test[test.case.message]: slow query',
        ),
      );
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining(
          '@docs-islands/test[test.case.message]: request timeout',
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
          Test1: { message: 'request timeout', levels: ['error'] },
          Test2: { message: 'slow query', levels: ['warn'] },
        },
      });

      const logger2 = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.case.message');
      logger2.info('slow query');
      logger2.warn('slow query', { elapsedTimeMs: 1.23 });
      logger2.warn('slow query 123');
      logger2.error('request timeout', { elapsedTimeMs: 2.34 });
      logger2.error('request timeout on user api');

      expect(consoleLogSpy).toHaveBeenCalledTimes(0);
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);

      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringMatching(
          /^\[Test2\].*@docs-islands\/test\[test\.case\.message\]: slow query.*\d\.\d{2}ms$/,
        ),
      );
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringMatching(
          /^\[Test1\].*@docs-islands\/test\[test\.case\.message\]: request timeout.*\d\.\d{2}ms$/,
        ),
      );
    });
  });

  describe('Message Glob Patterns', () => {
    it('Case 9: Message glob pattern with *', () => {
      // Test with debug: false
      setLoggerConfig({
        debug: false,
        rules: {
          Test1: { message: 'timeout:*', levels: ['warn'] },
          Test2: { message: '*database*', levels: ['error'] },
          Test3: { message: 'worker * finished', levels: ['info'] },
          Test4: { message: 'timeout:*', levels: ['error'] },
        },
      });

      const logger = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.case.message.match');
      logger.info('worker sync finished');
      logger.warn('timeout: fetch user');
      logger.error('primary database unavailable');
      logger.error('timeout: database unavailable');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);

      expect(consoleLogSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining(
          '@docs-islands/test[test.case.message.match]: worker sync finished',
        ),
      );
      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining(
          '@docs-islands/test[test.case.message.match]: timeout: fetch user',
        ),
      );
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining(
          '@docs-islands/test[test.case.message.match]: primary database unavailable',
        ),
      );
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining(
          '@docs-islands/test[test.case.message.match]: timeout: database unavailable',
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
        rules: {
          Test1: { message: 'timeout:*', levels: ['warn'] },
          Test2: { message: '*database*', levels: ['error'] },
          Test3: { message: 'worker * finished', levels: ['info'] },
          Test4: { message: 'timeout:*', levels: ['error'] },
        },
      });

      const logger2 = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.case.message.match');
      logger2.info('worker sync finished', { elapsedTimeMs: 1.23 });
      logger2.warn('timeout: fetch user', { elapsedTimeMs: 2.34 });
      logger2.error('primary database unavailable', { elapsedTimeMs: 3.45 });
      logger2.error('timeout: database unavailable', { elapsedTimeMs: 4.56 });

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);

      expect(consoleLogSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringMatching(
          /^\[Test3\].*@docs-islands\/test\[test\.case\.message\.match\]: worker sync finished.*\d\.\d{2}ms$/,
        ),
      );
      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringMatching(
          /^\[Test1\].*@docs-islands\/test\[test\.case\.message\.match\]: timeout: fetch user.*\d\.\d{2}ms$/,
        ),
      );
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringMatching(
          /^\[Test2\].*@docs-islands\/test\[test\.case\.message\.match\]: primary database unavailable.*\d\.\d{2}ms$/,
        ),
      );
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        2,
        expect.stringMatching(
          /^\[Test2\]\[Test4\].*@docs-islands\/test\[test\.case\.message\.match\]: timeout: database unavailable.*\d\.\d{2}ms$/,
        ),
      );
    });

    it('Case 11: Multiple message rules matching same message, label order', () => {
      setLoggerConfig({
        debug: false,
        rules: {
          Test1: { message: '*timeout*', levels: ['error'] },
          Test2: { message: 'request *', levels: ['error'] },
          Test3: { message: '*user*', levels: ['error'] },
        },
      });

      const logger = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.case.message.order');
      logger.error('request timeout user api');

      expectNoConsoleMessages(consoleLogSpy, consoleWarnSpy, consoleDebugSpy);
      expectConsoleMessages(consoleErrorSpy, [
        '@docs-islands/test[test.case.message.order]: request timeout user api',
      ]);

      // Reset for debug: true test
      consoleLogSpy.mockClear();
      consoleWarnSpy.mockClear();
      consoleErrorSpy.mockClear();
      consoleDebugSpy.mockClear();
      resetLoggerConfig();

      setLoggerConfig({
        debug: true,
        rules: {
          Test1: { message: '*timeout*', levels: ['error'] },
          Test2: { message: 'request *', levels: ['error'] },
          Test3: { message: '*user*', levels: ['error'] },
        },
      });

      const logger2 = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.case.message.order');
      logger2.error('request timeout user api', { elapsedTimeMs: 1.23 });

      expectNoConsoleMessages(consoleLogSpy, consoleWarnSpy, consoleDebugSpy);
      expectConsoleMessages(consoleErrorSpy, [
        '[Test1][Test2][Test3] @docs-islands/test[test.case.message.order]: request timeout user api 1.23ms',
      ]);
    });

    it('Case 12: message: "*" matches all messages', () => {
      // Test with debug: false
      setLoggerConfig({
        debug: false,
        rules: {
          Test1: { group: 'test.audit.*', message: '*', levels: ['error'] },
          Test2: {
            group: 'test.audit.login',
            message: '*failed*',
            levels: ['warn'],
          },
        },
      });

      const loggerA = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.audit.login');
      const loggerB = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.audit.logout');

      loggerA.warn('login failed');
      loggerA.error('login failed');
      loggerB.warn('logout failed');
      loggerB.error('logout failed');

      expect(consoleLogSpy).toHaveBeenCalledTimes(0);
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);

      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining(
          '@docs-islands/test[test.audit.login]: login failed',
        ),
      );
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining(
          '@docs-islands/test[test.audit.login]: login failed',
        ),
      );
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining(
          '@docs-islands/test[test.audit.logout]: logout failed',
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
        rules: {
          Test1: { group: 'test.audit.*', message: '*', levels: ['error'] },
          Test2: {
            group: 'test.audit.login',
            message: '*failed*',
            levels: ['warn'],
          },
        },
      });

      const loggerA2 = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.audit.login');
      const loggerB2 = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.audit.logout');

      loggerA2.warn('login failed', { elapsedTimeMs: 1.23 });
      loggerA2.error('login failed', { elapsedTimeMs: 2.34 });
      loggerB2.warn('logout failed');
      loggerB2.error('logout failed', { elapsedTimeMs: 3.45 });

      expect(consoleLogSpy).toHaveBeenCalledTimes(0);
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);

      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringMatching(
          /^\[Test2\].*@docs-islands\/test\[test\.audit\.login\]: login failed.*\d\.\d{2}ms$/,
        ),
      );
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringMatching(
          /^\[Test1\].*@docs-islands\/test\[test\.audit\.login\]: login failed.*\d\.\d{2}ms$/,
        ),
      );
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        2,
        expect.stringMatching(
          /^\[Test1\].*@docs-islands\/test\[test\.audit\.logout\]: logout failed.*\d\.\d{2}ms$/,
        ),
      );
    });

    it('Case 14: Exact and wildcard coexist', () => {
      setLoggerConfig({
        debug: false,
        rules: {
          Test1: { message: 'request timeout', levels: ['error'] },
          Test2: { message: '*timeout*', levels: ['error'] },
          Test3: { message: 'request *', levels: ['error'] },
        },
      });

      const logger = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.case.message.mix');
      logger.error('request timeout');
      logger.error('request timeout downstream');

      expectNoConsoleMessages(consoleLogSpy, consoleWarnSpy, consoleDebugSpy);
      expectConsoleMessages(consoleErrorSpy, [
        '@docs-islands/test[test.case.message.mix]: request timeout',
        '@docs-islands/test[test.case.message.mix]: request timeout downstream',
      ]);

      // Reset for debug: true test
      consoleLogSpy.mockClear();
      consoleWarnSpy.mockClear();
      consoleErrorSpy.mockClear();
      consoleDebugSpy.mockClear();
      resetLoggerConfig();

      setLoggerConfig({
        debug: true,
        rules: {
          Test1: { message: 'request timeout', levels: ['error'] },
          Test2: { message: '*timeout*', levels: ['error'] },
          Test3: { message: 'request *', levels: ['error'] },
        },
      });

      const logger2 = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.case.message.mix');
      logger2.error('request timeout', { elapsedTimeMs: 1.23 });
      logger2.error('request timeout downstream', { elapsedTimeMs: 2.34 });

      expectNoConsoleMessages(consoleLogSpy, consoleWarnSpy, consoleDebugSpy);
      expectConsoleMessages(consoleErrorSpy, [
        '[Test1][Test2][Test3] @docs-islands/test[test.case.message.mix]: request timeout 1.23ms',
        '[Test2][Test3] @docs-islands/test[test.case.message.mix]: request timeout downstream 2.34ms',
      ]);
    });
  });

  describe('Combined Scope and Message', () => {
    it('Case 10: Main + group + message can combine', () => {
      // Test with debug: false
      setLoggerConfig({
        debug: false,
        rules: {
          Test1: {
            main: '@docs-islands/test',
            group: 'test.api.*',
            message: 'retry *',
            levels: ['warn'],
          },
          Test2: {
            main: '@docs-islands/test',
            group: 'test.api.fetch',
            message: '*timeout*',
            levels: ['error'],
          },
          Test3: {
            group: 'test.api.fetch',
            message: '*timeout*',
            levels: ['warn'],
          },
        },
      });

      const loggerA = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.api.fetch');
      const loggerB = createLogger({
        main: '@docs-islands/test_b',
      }).getLoggerByGroup('test.api.fetch');
      const loggerC = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.api.update');

      loggerA.warn('retry request');
      loggerA.warn('request timeout');
      loggerA.error('request timeout');
      loggerB.warn('request timeout');
      loggerB.error('request timeout');
      loggerC.warn('retry request');
      loggerC.error('request timeout');

      expect(consoleWarnSpy).toHaveBeenCalledTimes(4);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining(
          '@docs-islands/test[test.api.fetch]: retry request',
        ),
      );
      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining(
          '@docs-islands/test[test.api.fetch]: request timeout',
        ),
      );
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining(
          '@docs-islands/test[test.api.fetch]: request timeout',
        ),
      );
      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        3,
        expect.stringContaining(
          '@docs-islands/test_b[test.api.fetch]: request timeout',
        ),
      );
      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        4,
        expect.stringContaining(
          '@docs-islands/test[test.api.update]: retry request',
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
        rules: {
          Test1: {
            main: '@docs-islands/test',
            group: 'test.api.*',
            message: 'retry *',
            levels: ['warn'],
          },
          Test2: {
            main: '@docs-islands/test',
            group: 'test.api.fetch',
            message: '*timeout*',
            levels: ['error'],
          },
          Test3: {
            group: 'test.api.fetch',
            message: '*timeout*',
            levels: ['warn'],
          },
        },
      });

      const loggerA2 = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.api.fetch');
      const loggerB2 = createLogger({
        main: '@docs-islands/test_b',
      }).getLoggerByGroup('test.api.fetch');
      const loggerC2 = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.api.update');

      loggerA2.warn('retry request', { elapsedTimeMs: 1.23 });
      loggerA2.warn('request timeout', { elapsedTimeMs: 2.34 });
      loggerA2.error('request timeout', { elapsedTimeMs: 3.45 });
      loggerB2.warn('request timeout', { elapsedTimeMs: 4.56 });
      loggerB2.error('request timeout');
      loggerC2.warn('retry request', { elapsedTimeMs: 5.67 });
      loggerC2.error('request timeout');

      expect(consoleWarnSpy).toHaveBeenCalledTimes(4);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringMatching(
          /^\[Test1\].*@docs-islands\/test\[test\.api\.fetch\]: retry request.*\d\.\d{2}ms$/,
        ),
      );
      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        2,
        expect.stringMatching(
          /^\[Test3\].*@docs-islands\/test\[test\.api\.fetch\]: request timeout.*\d\.\d{2}ms$/,
        ),
      );
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringMatching(
          /^\[Test2\].*@docs-islands\/test\[test\.api\.fetch\]: request timeout.*\d\.\d{2}ms$/,
        ),
      );
      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        3,
        expect.stringMatching(
          /^\[Test3\].*@docs-islands\/test_b\[test\.api\.fetch\]: request timeout.*\d\.\d{2}ms$/,
        ),
      );
      expect(consoleWarnSpy).toHaveBeenNthCalledWith(
        4,
        expect.stringMatching(
          /^\[Test1\].*@docs-islands\/test\[test\.api\.update\]: retry request.*\d\.\d{2}ms$/,
        ),
      );
    });

    it('Case 13: Main + group + message all together use strict AND', () => {
      // Test with debug: false
      setLoggerConfig({
        debug: false,
        levels: ['warn', 'error'],
        rules: {
          Test1: {
            main: '@docs-islands/test',
            group: 'test.payment.*',
            message: '*timeout*',
            levels: ['error'],
          },
        },
      });

      const loggerA = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.payment.charge');
      const loggerB = createLogger({
        main: '@docs-islands/test_b',
      }).getLoggerByGroup('test.payment.charge');
      const loggerC = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.payment.refund');

      loggerA.warn('request timeout');
      loggerA.error('request timeout');
      loggerA.error('request failed');
      loggerB.error('request timeout');
      loggerC.error('request success');

      expectNoConsoleMessages(consoleLogSpy, consoleWarnSpy, consoleDebugSpy);
      expectConsoleMessages(consoleErrorSpy, [
        '@docs-islands/test[test.payment.charge]: request timeout',
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
        rules: {
          Test1: {
            main: '@docs-islands/test',
            group: 'test.payment.*',
            message: '*timeout*',
            levels: ['error'],
          },
        },
      });

      const loggerA2 = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.payment.charge');
      const loggerB2 = createLogger({
        main: '@docs-islands/test_b',
      }).getLoggerByGroup('test.payment.charge');
      const loggerC2 = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.payment.refund');

      loggerA2.warn('request timeout');
      loggerA2.error('request timeout', { elapsedTimeMs: 1.23 });
      loggerA2.error('request failed');
      loggerB2.error('request timeout');
      loggerC2.error('request success');

      expectNoConsoleMessages(consoleLogSpy, consoleWarnSpy, consoleDebugSpy);
      expectConsoleMessages(consoleErrorSpy, [
        '[Test1] @docs-islands/test[test.payment.charge]: request timeout 1.23ms',
      ]);
    });

    it('Case 15: Scope matches but message does not = no output', () => {
      // Test with debug: false
      setLoggerConfig({
        debug: false,
        rules: {
          Test1: {
            group: 'test.notify.*',
            message: '*failed*',
            levels: ['warn'],
          },
          Test2: {
            group: 'test.notify.*',
            message: '*timeout*',
            levels: ['error'],
          },
        },
      });

      const logger = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.notify.email');
      logger.info('delivery failed');
      logger.warn('delivery success');
      logger.warn('delivery failed');
      logger.error('delivery failed');
      logger.error('request timeout');

      expectNoConsoleMessages(consoleLogSpy, consoleDebugSpy);
      expectConsoleMessages(consoleWarnSpy, [
        '@docs-islands/test[test.notify.email]: delivery failed',
      ]);
      expectConsoleMessages(consoleErrorSpy, [
        '@docs-islands/test[test.notify.email]: request timeout',
      ]);

      // Reset for debug: true test
      consoleLogSpy.mockClear();
      consoleWarnSpy.mockClear();
      consoleErrorSpy.mockClear();
      resetLoggerConfig();

      // Test with debug: true
      setLoggerConfig({
        debug: true,
        rules: {
          Test1: {
            group: 'test.notify.*',
            message: '*failed*',
            levels: ['warn'],
          },
          Test2: {
            group: 'test.notify.*',
            message: '*timeout*',
            levels: ['error'],
          },
        },
      });

      const logger2 = createLogger({
        main: '@docs-islands/test',
      }).getLoggerByGroup('test.notify.email');
      logger2.info('delivery failed');
      logger2.warn('delivery success');
      logger2.warn('delivery failed', { elapsedTimeMs: 1.23 });
      logger2.error('delivery failed');
      logger2.error('request timeout', { elapsedTimeMs: 2.34 });

      expectNoConsoleMessages(consoleLogSpy, consoleDebugSpy);
      expectConsoleMessages(consoleWarnSpy, [
        '[Test1] @docs-islands/test[test.notify.email]: delivery failed 1.23ms',
      ]);
      expectConsoleMessages(consoleErrorSpy, [
        '[Test2] @docs-islands/test[test.notify.email]: request timeout 2.34ms',
      ]);
    });
  });
});
