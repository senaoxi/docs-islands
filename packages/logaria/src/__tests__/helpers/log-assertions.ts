import { expect } from 'vitest';

interface ConsoleSpy {
  mock: {
    calls: unknown[][];
  };
}

const ANSI_ESCAPE_RE =
  // eslint-disable-next-line no-control-regex -- test helper intentionally strips SGR color sequences.
  /\u001B\[[\d;]*m/g;

export const normalizeConsoleMessage = (value: unknown): string =>
  String(value).replaceAll(ANSI_ESCAPE_RE, '');

export const readConsoleMessages = (spy: ConsoleSpy): string[] =>
  spy.mock.calls.map(([message]) => normalizeConsoleMessage(message));

export const expectConsoleMessages = (
  spy: ConsoleSpy,
  expectedMessages: string[],
): void => {
  expect(readConsoleMessages(spy)).toEqual(expectedMessages);
};

export const expectNoConsoleMessages = (...spies: ConsoleSpy[]): void => {
  for (const spy of spies) {
    expectConsoleMessages(spy, []);
  }
};
