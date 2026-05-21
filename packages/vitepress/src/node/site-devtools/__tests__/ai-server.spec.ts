/**
 * @vitest-environment node
 */
import {
  resetScopedLoggerConfig,
  setScopedLoggerConfig,
} from '@docs-islands/logger/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SiteDevToolsAiAnalysisTarget } from '../../../shared/site-devtools-ai';
import {
  analyzeSiteDevToolsAiTarget,
  resolveSiteDevToolsAiCapabilities,
  type SiteDevToolsAiConfig,
} from '../ai-server';

const createAnalysisTarget = (
  overrides: Partial<SiteDevToolsAiAnalysisTarget> = {},
): SiteDevToolsAiAnalysisTarget => ({
  artifactKind: 'bundle-chunk',
  artifactLabel: 'app.js',
  content: 'console.log("hello")',
  displayPath: '/assets/app.js',
  language: 'js',
  ...overrides,
});
const TEST_LOGGER_SCOPE_ID = 'site-devtools-ai-server-test-scope';
const analyzeTestSiteDevToolsAiTarget = (
  options: Omit<
    Parameters<typeof analyzeSiteDevToolsAiTarget>[0],
    'loggerScopeId'
  > & {
    loggerScopeId?: string;
  },
) =>
  analyzeSiteDevToolsAiTarget({
    ...options,
    loggerScopeId: options.loggerScopeId ?? TEST_LOGGER_SCOPE_ID,
  });

afterEach(() => {
  resetScopedLoggerConfig(TEST_LOGGER_SCOPE_ID);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  setScopedLoggerConfig(TEST_LOGGER_SCOPE_ID, {});
});

describe('resolveSiteDevToolsAiCapabilities', () => {
  it('marks providers unavailable until they are configured', async () => {
    const capabilities = await resolveSiteDevToolsAiCapabilities();

    expect(capabilities.providers.claude?.available).toBe(false);
    expect(capabilities.providers.claude?.detail).toContain('claude.provider');
    expect(capabilities.providers.doubao?.available).toBe(false);
    expect(capabilities.providers.doubao?.detail).toContain('doubao.provider');
  });

  it('reads the configured Doubao model from buildReports.models', async () => {
    const capabilities = await resolveSiteDevToolsAiCapabilities({
      buildReports: {
        models: [
          {
            id: 'doubao-default',
            model: 'doubao-seed-1-6',
            provider: 'doubao',
            providerKey: 'cn',
          },
        ],
      },
      providers: {
        doubao: [
          {
            apiKey: 'test-key',
            baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
            default: true,
            key: 'cn',
          },
        ],
      },
    });

    expect(capabilities.providers.doubao?.available).toBe(true);
    expect(capabilities.providers.doubao?.model).toBe('doubao-seed-1-6');
  });

  it('reads the configured Claude model from buildReports.models', async () => {
    const capabilities = await resolveSiteDevToolsAiCapabilities({
      buildReports: {
        models: [
          {
            id: 'claude-default',
            model: 'claude-sonnet-4-20250514',
            provider: 'claude',
            providerKey: 'us',
          },
        ],
      },
      providers: {
        claude: [
          {
            apiKey: 'test-key',
            default: true,
            key: 'us',
          },
        ],
      },
    });

    expect(capabilities.providers.claude?.available).toBe(true);
    expect(capabilities.providers.claude?.model).toBe(
      'claude-sonnet-4-20250514',
    );
  });

  it('reports Claude configuration gaps and duplicate defaults', async () => {
    const missingKey = await resolveSiteDevToolsAiCapabilities({
      buildReports: {
        models: [
          {
            id: 'claude-default',
            model: 'claude-sonnet-4-20250514',
            provider: 'claude',
            providerKey: 'us',
          },
        ],
      },
      providers: {
        claude: [
          {
            key: 'us',
          },
        ],
      },
    });
    const missingModel = await resolveSiteDevToolsAiCapabilities({
      providers: {
        claude: [
          {
            apiKey: 'test-key',
            key: 'us',
          },
        ],
      },
    });
    const duplicateDefaults = await resolveSiteDevToolsAiCapabilities({
      buildReports: {
        models: [
          {
            id: 'claude-default',
            model: 'claude-sonnet-4-20250514',
            provider: 'claude',
            providerKey: 'us',
          },
        ],
      },
      providers: {
        claude: [
          {
            apiKey: 'first-key',
            default: true,
            key: 'first',
          },
          {
            apiKey: 'second-key',
            default: true,
            key: 'second',
          },
        ],
      },
    });

    expect(missingKey.providers.claude?.available).toBe(false);
    expect(missingKey.providers.claude?.detail).toContain('apiKey');
    expect(missingModel.providers.claude?.available).toBe(false);
    expect(missingModel.providers.claude?.detail).toContain(
      'Claude model configuration',
    );
    expect(duplicateDefaults.providers.claude?.available).toBe(true);
    expect(duplicateDefaults.providers.claude?.detail).toContain(
      'multiple defaults declared',
    );
  });
});

describe('analyzeSiteDevToolsAiTarget', () => {
  it('passes Doubao thinking, temperature and max tokens to chat completions', async () => {
    const fetchMock = vi.fn(async (_input: string, init?: RequestInit) => {
      expect(init?.method).toBe('POST');
      expect(init?.headers).toEqual({
        Authorization: 'Bearer test-key',
        'Content-Type': 'application/json',
      });

      const requestBody = JSON.parse(String(init?.body)) as {
        max_tokens?: number;
        thinking?: {
          type?: string;
        };
        temperature?: number;
      };

      expect(requestBody.thinking?.type).toBe('enabled');
      expect(requestBody.temperature).toBe(0.1);
      expect(requestBody.max_tokens).toBe(2048);

      return Response.json(
        {
          choices: [
            {
              message: {
                content: 'analysis result',
              },
            },
          ],
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
          status: 200,
        },
      );
    });

    vi.stubGlobal('fetch', fetchMock);

    const result = await analyzeTestSiteDevToolsAiTarget({
      config: {
        buildReports: {
          models: [
            {
              id: 'doubao-default',
              maxTokens: 2048,
              model: 'doubao-seed-2-0-pro-260215',
              provider: 'doubao',
              providerKey: 'cn',
              temperature: 0.1,
              thinking: true,
            },
          ],
        },
        providers: {
          doubao: [
            {
              apiKey: 'test-key',
              default: true,
              key: 'cn',
            },
          ],
        },
      },
      provider: 'doubao',
      target: createAnalysisTarget(),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      model: 'doubao-seed-2-0-pro-260215',
      result: 'analysis result',
    });
  });

  it('uses provider timeoutMs for Doubao requests', async () => {
    const fetchMock = vi.fn(
      (_input: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => {
              reject(new DOMException('Aborted', 'AbortError'));
            },
            { once: true },
          );
        }),
    );

    vi.stubGlobal('fetch', fetchMock);

    const caughtError = await analyzeTestSiteDevToolsAiTarget({
      config: {
        buildReports: {
          models: [
            {
              id: 'doubao-default',
              model: 'doubao-seed-2-0-pro-260215',
              provider: 'doubao',
              providerKey: 'cn',
            },
          ],
        },
        providers: {
          doubao: [
            {
              apiKey: 'test-key',
              default: true,
              key: 'cn',
              timeoutMs: 5,
            },
          ],
        },
      },
      provider: 'doubao',
      target: createAnalysisTarget({
        artifactKind: 'bundle-module',
        artifactLabel: 'component.ts',
        content: 'export const value = 1;',
        displayPath: '/src/component.ts',
        language: 'ts',
      }),
    }).then(
      () => null,
      (error: unknown) => error as Error,
    );

    expect(caughtError).toBeInstanceOf(Error);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(caughtError?.message).toContain('Doubao analysis timed out.');
    expect(caughtError?.message).toContain('Trace ');
    expect(caughtError?.message).toContain('bundle-module /src/component.ts');
    expect(caughtError?.message).toContain('timeout 5 ms');
  });

  it('uses the first Doubao provider entry when no default is configured', async () => {
    const fetchMock = vi.fn(async (_input: string, init?: RequestInit) => {
      expect(init?.headers).toEqual({
        Authorization: 'Bearer first-key',
        'Content-Type': 'application/json',
      });

      return Response.json(
        {
          choices: [
            {
              message: {
                content: 'analysis result',
              },
            },
          ],
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
          status: 200,
        },
      );
    });

    vi.stubGlobal('fetch', fetchMock);

    const result = await analyzeTestSiteDevToolsAiTarget({
      config: {
        buildReports: {
          models: [
            {
              id: 'doubao-default',
              model: 'doubao-seed-2-0-pro-260215',
              provider: 'doubao',
              providerKey: 'cn',
            },
          ],
        },
        providers: {
          doubao: [
            {
              apiKey: 'first-key',
              key: 'first',
            },
            {
              apiKey: 'second-key',
              key: 'second',
            },
          ],
        },
      },
      provider: 'doubao',
      target: createAnalysisTarget(),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.result).toBe('analysis result');
  });

  it('passes Claude headers and Messages body, then parses text blocks', async () => {
    const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
      expect(input).toBe('https://gateway.example/v1/messages');
      expect(init?.method).toBe('POST');
      expect(init?.headers).toEqual({
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': 'test-key',
      });

      const requestBody = JSON.parse(String(init?.body)) as {
        max_tokens?: number;
        messages?: {
          content?: string;
          role?: string;
        }[];
        model?: string;
        system?: string;
        temperature?: number;
      };

      expect(requestBody.max_tokens).toBe(4096);
      expect(requestBody.messages?.[0]?.role).toBe('user');
      expect(requestBody.messages?.[0]?.content).toContain('## Role');
      expect(requestBody.model).toBe('claude-sonnet-4-20250514');
      expect(requestBody.system).toContain(
        'frontend performance and bundling engineer',
      );
      expect(requestBody.temperature).toBe(0.2);

      return Response.json(
        {
          content: [
            {
              text: 'analysis',
              type: 'text',
            },
            {
              text: 'result',
              type: 'text',
            },
          ],
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
          status: 200,
        },
      );
    });

    vi.stubGlobal('fetch', fetchMock);

    const result = await analyzeTestSiteDevToolsAiTarget({
      config: {
        buildReports: {
          models: [
            {
              id: 'claude-default',
              model: 'claude-sonnet-4-20250514',
              provider: 'claude',
              providerKey: 'us',
              temperature: 0.2,
            },
          ],
        },
        providers: {
          claude: [
            {
              apiKey: 'test-key',
              baseUrl: 'https://gateway.example/v1',
              default: true,
              key: 'us',
            },
          ],
        },
      },
      provider: 'claude',
      target: createAnalysisTarget(),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      model: 'claude-sonnet-4-20250514',
      result: 'analysis\nresult',
    });
  });

  it('keeps the Claude API version fixed internally', async () => {
    const fetchMock = vi.fn(async (_input: string, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({
        'anthropic-version': '2023-06-01',
      });

      return Response.json(
        {
          content: [
            {
              text: 'ok',
              type: 'text',
            },
          ],
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
          status: 200,
        },
      );
    });

    vi.stubGlobal('fetch', fetchMock);

    const config = {
      buildReports: {
        models: [
          {
            id: 'claude-default',
            model: 'claude-sonnet-4-20250514',
            provider: 'claude',
            providerKey: 'us',
          },
        ],
      },
      providers: {
        claude: [
          {
            anthropicVersion: '2099-01-01',
            apiKey: 'test-key',
            default: true,
            key: 'us',
          },
        ],
      },
    } as unknown as SiteDevToolsAiConfig;

    await analyzeTestSiteDevToolsAiTarget({
      config,
      provider: 'claude',
      target: createAnalysisTarget(),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('uses Claude provider timeoutMs for requests', async () => {
    const fetchMock = vi.fn(
      (_input: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => {
              reject(new DOMException('Aborted', 'AbortError'));
            },
            { once: true },
          );
        }),
    );

    vi.stubGlobal('fetch', fetchMock);

    const caughtError = await analyzeTestSiteDevToolsAiTarget({
      config: {
        buildReports: {
          models: [
            {
              id: 'claude-default',
              model: 'claude-sonnet-4-20250514',
              provider: 'claude',
              providerKey: 'us',
            },
          ],
        },
        providers: {
          claude: [
            {
              apiKey: 'test-key',
              default: true,
              key: 'us',
              timeoutMs: 5,
            },
          ],
        },
      },
      provider: 'claude',
      target: createAnalysisTarget({
        artifactKind: 'bundle-module',
        artifactLabel: 'component.ts',
        content: 'export const value = 1;',
        displayPath: '/src/component.ts',
        language: 'ts',
      }),
    }).then(
      () => null,
      (error: unknown) => error as Error,
    );

    expect(caughtError).toBeInstanceOf(Error);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(caughtError?.message).toContain('Claude analysis timed out.');
    expect(caughtError?.message).toContain('Trace ');
    expect(caughtError?.message).toContain('bundle-module /src/component.ts');
    expect(caughtError?.message).toContain('timeout 5 ms');
  });

  it('surfaces Claude HTTP errors', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json(
        {
          error: {
            message: 'rate limited',
            type: 'rate_limit_error',
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
          status: 429,
        },
      ),
    );

    vi.stubGlobal('fetch', fetchMock);

    await expect(
      analyzeTestSiteDevToolsAiTarget({
        config: {
          buildReports: {
            models: [
              {
                id: 'claude-default',
                model: 'claude-sonnet-4-20250514',
                provider: 'claude',
                providerKey: 'us',
              },
            ],
          },
          providers: {
            claude: [
              {
                apiKey: 'test-key',
                default: true,
                key: 'us',
              },
            ],
          },
        },
        provider: 'claude',
        target: createAnalysisTarget(),
      }),
    ).rejects.toThrow('rate limited');
  });

  it('rejects empty Claude responses', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json(
        {
          content: [],
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
          status: 200,
        },
      ),
    );

    vi.stubGlobal('fetch', fetchMock);

    await expect(
      analyzeTestSiteDevToolsAiTarget({
        config: {
          buildReports: {
            models: [
              {
                id: 'claude-default',
                model: 'claude-sonnet-4-20250514',
                provider: 'claude',
                providerKey: 'us',
              },
            ],
          },
          providers: {
            claude: [
              {
                apiKey: 'test-key',
                default: true,
                key: 'us',
              },
            ],
          },
        },
        provider: 'claude',
        target: createAnalysisTarget(),
      }),
    ).rejects.toThrow('Claude returned an empty analysis result.');
  });
});
