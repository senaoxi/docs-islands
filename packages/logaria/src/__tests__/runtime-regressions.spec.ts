import { createLogger, resetLoggerConfig } from 'logaria';
import {
  createScopedLogger,
  getScopedLoggerConfig,
  resetScopedLoggerConfig,
  resolveLoggerConfig,
  setScopedLoggerConfig,
} from 'logaria/core';
import { formatDebugMessage, formatErrorMessage } from 'logaria/helper';
import type { LoggerPresetPlugin } from 'logaria/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

const scope = 'fixture-lifecycle';
afterEach(() => {
  vi.restoreAllMocks();
  resetScopedLoggerConfig(scope);
  resetLoggerConfig();
});

const createPreset = () =>
  ({
    rules: { build: { group: 'build' } },
    configs: { recommended: { rules: { build: { levels: ['warn'] } } } },
  }) satisfies LoggerPresetPlugin;

describe('preset resolution is independent of input reuse', () => {
  it('keeps a reusable preset unchanged after a rule override', () => {
    const preset = createPreset();
    const first = resolveLoggerConfig({
      plugins: { fixture: preset },
      extends: ['fixture/recommended'],
      rules: { 'fixture/build': { levels: ['error'] } },
    });
    expect(first.rules?.[0]?.levels).toEqual(['error']);
    expect(preset.configs.recommended.rules.build.levels).toEqual(['warn']);
    const second = resolveLoggerConfig({
      plugins: { fixture: preset },
      extends: ['fixture/recommended'],
    });
    expect(second.rules?.[0]?.levels).toEqual(['warn']);
  });

  it('accepts a frozen preset rule when applying an override', () => {
    const preset = createPreset();
    Object.freeze(preset.configs.recommended.rules.build.levels);
    Object.freeze(preset.configs.recommended.rules.build);
    const resolved = resolveLoggerConfig({
      plugins: { fixture: preset },
      extends: ['fixture/recommended'],
      rules: { 'fixture/build': { levels: ['error'] } },
    });
    expect(resolved.rules?.[0]?.levels).toEqual(['error']);
    expect(preset.configs.recommended.rules.build.levels).toEqual(['warn']);
  });
});

describe('scope reset releases logger reuse', () => {
  it('keeps reuse within a registered scope and releases it at reset', () => {
    setScopedLoggerConfig(scope, { levels: ['warn'] });
    const main = createScopedLogger({ main: 'fixture-app' }, scope);
    const logger = main.getLoggerByGroup('build');
    setScopedLoggerConfig(scope, { levels: ['error'] });
    expect(createScopedLogger({ main: 'fixture-app' }, scope)).toBe(main);
    expect(main.getLoggerByGroup('build')).toBe(logger);
    resetScopedLoggerConfig(scope);
    expect(getScopedLoggerConfig(scope)).toBeUndefined();
    expect(() => logger.warn('after reset')).toThrow('not registered');
    setScopedLoggerConfig(scope, { levels: ['warn'] });
    const next = createScopedLogger({ main: 'fixture-app' }, scope);
    expect(next).not.toBe(main);
    expect(next.getLoggerByGroup('build')).not.toBe(logger);
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    logger.warn('held reference reads the new config');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('releases default-scope reuse without invalidating held references', () => {
    const main = createLogger({ main: 'fixture-app' });
    const logger = main.getLoggerByGroup('build');
    resetLoggerConfig();
    expect(createLogger({ main: 'fixture-app' })).not.toBe(main);
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    logger.warn('default is lazily available');
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('formatters remain usable for hostile diagnostic values', () => {
  it('falls back when a summary getter throws', () => {
    const summary = Object.defineProperty({}, 'state', {
      enumerable: true,
      get() {
        throw new Error('fixture getter');
      },
    });
    expect(
      formatDebugMessage({ context: 'build', decision: 'inspect', summary }),
    ).toBe(
      'context=build | decision=inspect | summary=[unserializable summary] | timing=n/a',
    );
  });

  it('only reads values for the eight selected summary keys', () => {
    const read = vi.fn(() => 1);
    const summary = {};
    for (let index = 0; index < 100; index += 1) {
      Object.defineProperty(summary, `field${String(index).padStart(2, '0')}`, {
        enumerable: true,
        get: read,
      });
    }
    formatDebugMessage({ context: 'build', decision: 'inspect', summary });
    expect(read).toHaveBeenCalledTimes(8);
  });

  it('falls back when an Error message getter throws', () => {
    const error = Object.defineProperty(new Error('fixture'), 'message', {
      get() {
        throw new Error('fixture message getter');
      },
    });
    expect(formatErrorMessage(error)).toBe('Unknown error');
  });

  it('handles a proxy whose prototype lookup throws', () => {
    const value = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error('fixture proxy');
        },
      },
    );
    expect(formatErrorMessage(value)).toBe('Unknown error');
    expect(
      formatDebugMessage({
        context: 'build',
        decision: 'inspect',
        summary: value,
      }),
    ).toContain('summary=[unserializable summary]');
  });
});
