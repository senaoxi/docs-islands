/**
 * @vitest-environment node
 */
import {
  createElapsedLogOptions,
  createElapsedTimer,
  formatElapsedTime,
} from '@docs-islands/logger/helper';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('elapsed helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('normalizes direct elapsed log options', () => {
    expect(createElapsedLogOptions(5.678)).toEqual({
      elapsedTimeMs: 5.678,
    });
    expect(createElapsedLogOptions(-1)).toEqual({
      elapsedTimeMs: 0,
    });
    expect(createElapsedLogOptions(Number.NaN)).toEqual({
      elapsedTimeMs: 0,
    });
  });

  it('creates an elapsed timer from the logger clock', () => {
    vi.spyOn(globalThis.performance, 'now')
      .mockReturnValueOnce(10)
      .mockReturnValueOnce(52);

    const elapsed = createElapsedTimer();

    expect(elapsed()).toEqual({
      elapsedTimeMs: 42,
    });
  });

  it('formats elapsed time with fixed precision', () => {
    expect(formatElapsedTime(5)).toBe('5.00ms');
    expect(formatElapsedTime(5.678)).toBe('5.68ms');
    expect(formatElapsedTime(-1)).toBe('0.00ms');
    expect(formatElapsedTime(Number.NaN)).toBe('0.00ms');
  });
});
