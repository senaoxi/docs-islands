import type { Locator } from 'playwright-chromium';
import { expect } from 'vitest';

interface MatcherTimeoutOptions {
  timeout?: number;
}

interface ToPassOptions extends MatcherTimeoutOptions {
  intervals?: number[];
}

declare module 'vitest' {
  interface Assertion<T> {
    toBeAttached(
      this: Assertion<T>,
      options?: MatcherTimeoutOptions,
    ): Promise<void>;
    toBeVisible(
      this: Assertion<T>,
      options?: MatcherTimeoutOptions,
    ): Promise<void>;
    toHaveAttribute(
      this: Assertion<T>,
      name: string,
      expected: string | RegExp,
      options?: MatcherTimeoutOptions,
    ): Promise<void>;
    toHaveCount(
      this: Assertion<T>,
      expected: number,
      options?: MatcherTimeoutOptions,
    ): Promise<void>;
    toHaveText(
      this: Assertion<T>,
      expected: RegExp,
      options?: MatcherTimeoutOptions,
    ): Promise<void>;
    toPass(this: Assertion<T>, options?: ToPassOptions): Promise<void>;
  }
}

const DEFAULT_TIMEOUT = 5000;
const DEFAULT_INTERVALS = [100] as const;

const delay = async (duration: number): Promise<void> => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, duration);
  });
};

async function pollUntil<T>(
  read: () => Promise<T>,
  matches: (value: T) => boolean,
  options: {
    intervals?: readonly number[];
    timeout?: number;
  } = {},
): Promise<{ actual?: T; error?: unknown; pass: boolean }> {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const intervals =
    options.intervals && options.intervals.length > 0
      ? options.intervals
      : DEFAULT_INTERVALS;
  const deadline = Date.now() + timeout;
  let attempt = 0;
  let actual: T | undefined;
  let error: unknown;

  do {
    try {
      actual = await read();
      error = undefined;
      if (matches(actual)) {
        return { actual, pass: true };
      }
    } catch (candidateError) {
      error = candidateError;
    }

    const interval = intervals[Math.min(attempt, intervals.length - 1)] ?? 100;
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      break;
    }
    await delay(Math.min(interval, remaining));
    attempt += 1;
  } while (Date.now() <= deadline);

  return { actual, error, pass: false };
}

const renderError = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error);
};

const renderExpected = (expected: unknown): string => {
  return expected instanceof RegExp
    ? expected.toString()
    : JSON.stringify(expected);
};

expect.extend({
  async toBeAttached(received: Locator, options: MatcherTimeoutOptions = {}) {
    const result = await pollUntil(
      async () => await received.count(),
      (count) => count > 0,
      options,
    );

    return {
      pass: result.pass,
      message: () =>
        result.error
          ? `expected locator to be attached: ${renderError(result.error)}`
          : `expected locator to be attached, received count ${result.actual ?? 0}`,
    };
  },

  async toBeVisible(received: Locator, options: MatcherTimeoutOptions = {}) {
    const result = await pollUntil(
      async () => await received.isVisible(),
      (isVisible) => isVisible,
      options,
    );

    return {
      pass: result.pass,
      message: () =>
        result.error
          ? `expected locator to be visible: ${renderError(result.error)}`
          : 'expected locator to be visible',
    };
  },

  async toHaveAttribute(
    received: Locator,
    name: string,
    expected: string | RegExp,
    options: MatcherTimeoutOptions = {},
  ) {
    const result = await pollUntil(
      async () => await received.getAttribute(name),
      (actual) => {
        if (expected instanceof RegExp) {
          expected.lastIndex = 0;
          return expected.test(actual ?? '');
        }
        return actual === expected;
      },
      options,
    );

    return {
      pass: result.pass,
      message: () =>
        result.error
          ? `expected locator attribute ${name} to match ${renderExpected(expected)}: ${renderError(result.error)}`
          : `expected locator attribute ${name} to match ${renderExpected(expected)}, received ${renderExpected(result.actual)}`,
    };
  },

  async toHaveCount(
    received: Locator,
    expected: number,
    options: MatcherTimeoutOptions = {},
  ) {
    const result = await pollUntil(
      async () => await received.count(),
      (actual) => actual === expected,
      options,
    );

    return {
      pass: result.pass,
      message: () =>
        result.error
          ? `expected locator count to be ${expected}: ${renderError(result.error)}`
          : `expected locator count to be ${expected}, received ${result.actual}`,
    };
  },

  async toHaveText(
    received: Locator,
    expected: RegExp,
    options: MatcherTimeoutOptions = {},
  ) {
    const result = await pollUntil(
      async () => await received.textContent(),
      (actual) => {
        expected.lastIndex = 0;
        return expected.test(actual ?? '');
      },
      options,
    );

    return {
      pass: result.pass,
      message: () =>
        result.error
          ? `expected locator text to match ${expected}: ${renderError(result.error)}`
          : `expected locator text to match ${expected}, received ${renderExpected(result.actual)}`,
    };
  },

  async toPass(received: () => Promise<unknown>, options: ToPassOptions = {}) {
    const result = await pollUntil(
      async () => {
        await received();
        return true;
      },
      (passed) => passed,
      options,
    );

    return {
      pass: result.pass,
      message: () =>
        result.error
          ? `expected callback to pass: ${renderError(result.error)}`
          : 'expected callback to pass',
    };
  },
});
