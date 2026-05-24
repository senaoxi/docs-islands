/**
 * @vitest-environment jsdom
 */
import { createLogger, resetLoggerConfig, setLoggerConfig } from 'logaria';
import {
  createScopedLogger as createLoggerWithScopeId,
  getScopedLoggerConfig as getLoggerConfigForScope,
  resetScopedLoggerConfig,
  setScopedLoggerConfig,
} from 'logaria/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VITEPRESS_RUNTIME_LOG_GROUPS } from '../constants/log-groups/runtime';
import {
  LOGGER_SPEC_CASE_COUNT,
  LOGGER_SPEC_ELAPSED,
  type LoggerSpecCase,
  loggerSpecCases,
} from './logger-test-cases';

const normalizeConsoleMessage = (value: unknown): string =>
  String(value).replaceAll('%c', '');

const captureConsoleOutput = (): string[] => {
  const output: string[] = [];
  const capture = (firstArg: unknown) => {
    output.push(normalizeConsoleMessage(firstArg));
  };

  vi.spyOn(console, 'debug').mockImplementation(capture);
  vi.spyOn(console, 'error').mockImplementation(capture);
  vi.spyOn(console, 'log').mockImplementation(capture);
  vi.spyOn(console, 'warn').mockImplementation(capture);

  return output;
};

const setStableElapsedClock = () => {
  const now = vi.spyOn(globalThis.performance, 'now');

  now.mockReturnValue(0);

  return now;
};

const runLoggerSpecCase = (
  specCase: LoggerSpecCase,
  debugOverride?: boolean,
): string[] => {
  const output = captureConsoleOutput();
  const now = setStableElapsedClock();

  setLoggerConfig({
    ...specCase.config,
    ...(debugOverride === undefined ? {} : { debug: debugOverride }),
  });
  now.mockReturnValue(Number.parseFloat(LOGGER_SPEC_ELAPSED));

  const loggers = Object.fromEntries(
    Object.entries(specCase.loggers).map(([name, fixture]) => [
      name,
      createLogger({
        main: fixture.main,
      }).getLoggerByGroup(fixture.group),
    ]),
  );

  for (const operation of specCase.operations) {
    if (operation.kind !== 'debug') {
      loggers[operation.logger]![operation.kind](operation.message, {
        elapsedTimeMs: Number.parseFloat(LOGGER_SPEC_ELAPSED),
      });
      continue;
    }

    loggers[operation.logger]![operation.kind](operation.message);
  }

  return output;
};

afterEach(() => {
  resetLoggerConfig();
  resetScopedLoggerConfig('browser-scope-a');
  resetScopedLoggerConfig('browser-scope-b');
  resetScopedLoggerConfig('browser-instant-output-scope');
  vi.restoreAllMocks();
});

describe('logger browser behavior', () => {
  it('keeps the markdown logger spec as the complete visibility baseline', () => {
    expect(loggerSpecCases).toHaveLength(LOGGER_SPEC_CASE_COUNT);
  });

  it.each(loggerSpecCases)('$name', (specCase) => {
    expect(runLoggerSpecCase(specCase)).toEqual(specCase.expected);
  });

  it.each(
    loggerSpecCases.filter((specCase) => specCase.expectedDebug !== undefined),
  )('$name with debug labels and elapsed time', (specCase) => {
    expect(runLoggerSpecCase(specCase, true)).toEqual(specCase.expectedDebug);
  });

  it('allows debug elapsed suffix to use a caller supplied duration', () => {
    const output = captureConsoleOutput();
    const now = setStableElapsedClock();

    setLoggerConfig({ debug: true });
    now.mockReturnValue(99);

    createLogger({
      main: '@docs-islands/vitepress',
    })
      .getLoggerByGroup(VITEPRESS_RUNTIME_LOG_GROUPS.reactDevRender)
      .success('Component Landing render completed (hydrate)', {
        elapsedTimeMs: 12.345,
      });

    expect(output).toEqual([
      `@docs-islands/vitepress[${VITEPRESS_RUNTIME_LOG_GROUPS.reactDevRender}]: Component Landing render completed (hydrate) 12.35ms`,
    ]);
  });

  it('reuses cached main and grouped logger instances for the same main', () => {
    const mainLogger = createLogger({
      main: '@docs-islands/vitepress',
    });
    const sameMainLogger = createLogger({
      main: '@docs-islands/vitepress',
    });
    const otherMainLogger = createLogger({
      main: '@docs-islands/core',
    });
    const groupLogger = mainLogger.getLoggerByGroup(
      VITEPRESS_RUNTIME_LOG_GROUPS.reactDevRender,
    );
    const sameGroupLogger = mainLogger.getLoggerByGroup(
      VITEPRESS_RUNTIME_LOG_GROUPS.reactDevRender,
    );
    const otherGroupLogger = mainLogger.getLoggerByGroup(
      VITEPRESS_RUNTIME_LOG_GROUPS.reactComponentManager,
    );
    const sameGroupNameDifferentMain = otherMainLogger.getLoggerByGroup(
      VITEPRESS_RUNTIME_LOG_GROUPS.reactDevRender,
    );

    expect(sameMainLogger).toBe(mainLogger);
    expect(groupLogger).toBe(sameGroupLogger);
    expect('info' in (mainLogger as object)).toBe(false);
    expect(groupLogger).not.toBe(mainLogger);
    expect(otherGroupLogger).not.toBe(groupLogger);
    expect(sameGroupNameDifferentMain).not.toBe(groupLogger);
  });

  it('isolates browser logger caches and configs across scopes', () => {
    const scopeA = 'browser-scope-a';
    const scopeB = 'browser-scope-b';

    setScopedLoggerConfig(scopeA, {
      rules: {
        'scope-a-only': {
          group: VITEPRESS_RUNTIME_LOG_GROUPS.reactDevRender,
          levels: ['info'],
          main: '@docs-islands/vitepress',
        },
      },
    });
    setScopedLoggerConfig(scopeB, {
      rules: {
        'scope-b-only': {
          group: VITEPRESS_RUNTIME_LOG_GROUPS.reactComponentManager,
          levels: ['warn'],
          main: '@docs-islands/vitepress',
        },
      },
    });

    const scopeALogger = createLoggerWithScopeId(
      {
        main: '@docs-islands/vitepress',
      },
      scopeA,
    );
    const scopeBLogger = createLoggerWithScopeId(
      {
        main: '@docs-islands/vitepress',
      },
      scopeB,
    );

    expect(scopeALogger).not.toBe(scopeBLogger);
    expect(
      scopeALogger.getLoggerByGroup(
        VITEPRESS_RUNTIME_LOG_GROUPS.reactDevRender,
      ),
    ).not.toBe(
      scopeBLogger.getLoggerByGroup(
        VITEPRESS_RUNTIME_LOG_GROUPS.reactDevRender,
      ),
    );
    expect(getLoggerConfigForScope(scopeA)).toEqual({
      rules: {
        'scope-a-only': {
          group: VITEPRESS_RUNTIME_LOG_GROUPS.reactDevRender,
          levels: ['info'],
          main: '@docs-islands/vitepress',
        },
      },
    });

    resetScopedLoggerConfig(scopeA);
    expect(getLoggerConfigForScope(scopeA)).toBeUndefined();
    expect(getLoggerConfigForScope(scopeB)).toEqual({
      rules: {
        'scope-b-only': {
          group: VITEPRESS_RUNTIME_LOG_GROUPS.reactComponentManager,
          levels: ['warn'],
          main: '@docs-islands/vitepress',
        },
      },
    });
  });

  it('keeps instant scoped logger output on the plain message body', () => {
    const scopeId = 'browser-instant-output-scope';
    const output = captureConsoleOutput();

    setScopedLoggerConfig(scopeId, {});

    createLoggerWithScopeId(
      {
        main: '@docs-islands/vitepress',
      },
      scopeId,
    )
      .getLoggerByGroup(VITEPRESS_RUNTIME_LOG_GROUPS.reactComponentManager)
      .warn('runtime warning', { elapsedTimeMs: 0 });

    expect(output).toEqual([
      `@docs-islands/vitepress[${VITEPRESS_RUNTIME_LOG_GROUPS.reactComponentManager}]: runtime warning`,
    ]);
  });
});
