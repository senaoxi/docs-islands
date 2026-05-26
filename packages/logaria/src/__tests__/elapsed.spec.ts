import { createLogger, resetLoggerConfig, setLoggerConfig } from 'logaria';
import { createElapsedTimer } from 'logaria/helper';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import {
  expectConsoleMessages,
  expectNoConsoleMessages,
} from './helpers/log-assertions';

describe('Integration: Elapsed Runtime Output', () => {
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
    resetLoggerConfig();
    vi.restoreAllMocks();
  });

  it('appends elapsed time produced by createElapsedTimer in debug runtime output', () => {
    vi.spyOn(globalThis.performance, 'now')
      .mockReturnValueOnce(10)
      .mockReturnValueOnce(52);

    setLoggerConfig({
      debug: true,
      rules: {
        Timer: { levels: ['info'] },
      },
    });

    const elapsed = createElapsedTimer();
    const logger = createLogger({
      main: '@docs-islands/test',
    }).getLoggerByGroup('test.elapsed.runtime');

    logger.info('timer finished', elapsed());

    expectConsoleMessages(consoleLogSpy, [
      '[Timer] @docs-islands/test[test.elapsed.runtime]: timer finished 42.00ms',
    ]);
    expectNoConsoleMessages(consoleWarnSpy, consoleErrorSpy, consoleDebugSpy);
  });
});
