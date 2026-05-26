import { createLogger, resetLoggerConfig, setLoggerConfig } from 'logaria';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectConsoleMessages } from './helpers/log-assertions';

type DomLikeTestGlobal = typeof globalThis & {
  document?: unknown;
  window?: unknown;
};

describe('runtime console detection', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let originalWindow: unknown;
  let originalDocument: unknown;
  const domLikeGlobal = globalThis as DomLikeTestGlobal;

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    originalWindow = domLikeGlobal.window;
    originalDocument = domLikeGlobal.document;
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
    resetLoggerConfig();

    if (originalWindow === undefined) {
      delete domLikeGlobal.window;
    } else {
      domLikeGlobal.window = originalWindow;
    }

    if (originalDocument === undefined) {
      delete domLikeGlobal.document;
    } else {
      domLikeGlobal.document = originalDocument;
    }
  });

  it('keeps Node console formatting when DOM-like globals are present', () => {
    domLikeGlobal.window = {};
    domLikeGlobal.document = {};

    setLoggerConfig({
      levels: ['warn'],
    });

    createLogger({
      main: '@docs-islands/test',
    })
      .getLoggerByGroup('runtime.detect')
      .warn('node console');

    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy.mock.calls[0]).toHaveLength(1);
    expectConsoleMessages(consoleWarnSpy, [
      '@docs-islands/test[runtime.detect]: node console',
    ]);
  });
});
