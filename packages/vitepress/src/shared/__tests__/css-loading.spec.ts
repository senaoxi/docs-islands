/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VITEPRESS_RUNTIME_LOG_GROUPS } from '../constants/log-groups/runtime';
import cssLoadingRuntime from '../runtime/css-loading';

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

afterEach(() => {
  document.head.innerHTML = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('cssLoadingRuntime', () => {
  it('logs duplicate CSS loading diagnostics through the light vitepress logger', async () => {
    vi.stubGlobal('__DEBUG__', true);
    const output = captureConsoleOutput();
    const link = document.createElement('link');

    link.rel = 'stylesheet';
    link.href = '/style.css';
    document.head.append(link);

    const result = await cssLoadingRuntime(['/style.css']);

    expect(result).toMatchObject({
      failedCount: 0,
      loadedCount: 1,
      success: true,
      timedOut: false,
      totalCount: 1,
    });
    expect(
      output.some(
        (message) =>
          message.includes('@docs-islands/vitepress') &&
          message.includes(VITEPRESS_RUNTIME_LOG_GROUPS.cssLoading) &&
          message.includes('Success rate: 1/1'),
      ),
    ).toBe(true);
    expect(
      output.some(
        (message) =>
          message.includes('@docs-islands/vitepress') &&
          message.includes(VITEPRESS_RUNTIME_LOG_GROUPS.cssLoading) &&
          message.includes('Detected and skipped 1 duplicate CSS files'),
      ),
    ).toBe(true);
  });
});
