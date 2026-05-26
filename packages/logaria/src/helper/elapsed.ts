import type { LoggerElapsedLogOptions } from '../types';

const readLoggerClockMs = (): number =>
  typeof globalThis.performance?.now === 'function'
    ? globalThis.performance.now()
    : Date.now();

const normalizeElapsedTimeMs = (elapsedTimeMs: number): number =>
  Number.isFinite(elapsedTimeMs) ? Math.max(0, elapsedTimeMs) : 0;

export const createElapsedLogOptions = (
  elapsedTimeMs: number,
): LoggerElapsedLogOptions => ({
  elapsedTimeMs: normalizeElapsedTimeMs(elapsedTimeMs),
});

/**
 * Creates a timer function that measures elapsed time from the moment of creation.
 *
 * Returns a function that, when called, returns an object containing the elapsed
 * time in milliseconds since the timer was created. This is useful for logging
 * operations with performance metrics.
 *
 * The timer uses high-resolution timing via `performance.now()` when available,
 * falling back to `Date.now()` for compatibility.
 *
 * @returns A function that returns elapsed time in milliseconds when called
 *
 * @example
 * ```ts
 * const timer = createElapsedTimer();
 *
 * // ... perform some operation ...
 *
 * logger.info('Operation completed', timer());
 * // Logs: "Operation completed" with elapsed time
 * ```
 */
export const createElapsedTimer = (): (() => LoggerElapsedLogOptions) => {
  const startTimeMs = readLoggerClockMs();

  return () => createElapsedLogOptions(readLoggerClockMs() - startTimeMs);
};

export const formatElapsedTime = (elapsedTimeMs: number): string => {
  const elapsedMs = normalizeElapsedTimeMs(elapsedTimeMs);

  return `${elapsedMs.toFixed(2)}ms`;
};
