import { describe, expect, it } from 'vitest';
import { claude, doubao } from '../../../shared/site-devtools-models';
import { resolveConfig } from '../resolve-config';

const resolveBuildReportsTestPage = () => false as const;

const createResolvedIdentity = (label: string, isDefault: boolean) => {
  const provider = claude.provider({
    apiKey: 'claude-key',
    baseUrl: 'https://api.anthropic.com/v1',
    label: `Claude ${label}`,
    timeoutMs: 120_000,
  });
  const model = provider.model({
    default: isDefault,
    label: `Claude Sonnet ${label}`,
    maxTokens: 4096,
    model: 'claude-sonnet-4-20250514',
    temperature: 0.2,
  });
  const config = resolveConfig({
    siteDevtools: {
      analysis: {
        providers: [provider],
        buildReports: {
          models: [model],
        },
      },
    },
  });

  return {
    modelId: config.siteDevtools.analysis?.buildReports?.models?.[0]?.id,
    providerKey: config.siteDevtools.analysis?.providers?.claude?.[0]?.key,
  };
};

describe('resolveConfig', () => {
  it('normalizes siteDevtools.analysis config in the resolved config object', () => {
    const claudeUS = claude.provider({
      apiKey: 'claude-key',
      baseUrl: 'https://api.anthropic.com/v1',
      label: 'Claude US',
      timeoutMs: 120_000,
    });
    const doubaoCN = doubao.provider({
      apiKey: 'test-key',
      baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      label: 'Doubao CN',
      timeoutMs: 90_000,
    });
    const claudeSonnet = claudeUS.model({
      label: 'Claude Sonnet',
      maxTokens: 2048,
      model: 'claude-sonnet-4-20250514',
      temperature: 0.2,
    });
    const doubaoPro = doubaoCN.model({
      default: true,
      label: 'Doubao Pro',
      maxTokens: 4096,
      model: 'doubao-seed-1-6',
      temperature: 0.1,
      thinking: true,
    });
    const config = resolveConfig({
      base: '/docs',
      siteDevtools: {
        analysis: {
          buildReports: {
            cache: {
              dir: '.vitepress/site-devtools-reports',
              strategy: 'fallback',
            },
            models: [claudeSonnet, doubaoPro],
            resolvePage: resolveBuildReportsTestPage,
          },
          providers: [claudeUS, doubaoCN],
        },
      },
    });

    expect(config.base).toBe('/docs/');
    expect(config.siteDevtools.analysis?.buildReports?.cache).toEqual({
      dir: expect.stringMatching(/site-devtools-reports$/),
      strategy: 'fallback',
    });
    expect(config.siteDevtools.analysis?.buildReports?.includeChunks).toBe(
      false,
    );
    expect(config.siteDevtools.analysis?.buildReports?.includeModules).toBe(
      false,
    );
    expect(config.siteDevtools.analysis?.buildReports?.resolvePage).toEqual(
      expect.any(Function),
    );
    expect(config.siteDevtools.analysis?.buildReports?.models?.[0]).toEqual({
      default: false,
      id: expect.stringMatching(/^claude-report-model-/),
      label: 'Claude Sonnet',
      maxTokens: 2048,
      model: 'claude-sonnet-4-20250514',
      provider: 'claude',
      providerKey: expect.stringMatching(/^claude-provider-/),
      temperature: 0.2,
    });
    expect(config.siteDevtools.analysis?.buildReports?.models?.[1]).toEqual({
      default: true,
      id: expect.stringMatching(/^doubao-report-model-/),
      label: 'Doubao Pro',
      maxTokens: 4096,
      model: 'doubao-seed-1-6',
      provider: 'doubao',
      providerKey: expect.stringMatching(/^doubao-provider-/),
      temperature: 0.1,
      thinking: true,
    });
    expect(config.siteDevtools.analysis?.providers?.claude?.[0]?.apiKey).toBe(
      'claude-key',
    );
    expect(config.siteDevtools.analysis?.providers?.claude?.[0]?.baseUrl).toBe(
      'https://api.anthropic.com/v1',
    );
    expect(config.siteDevtools.analysis?.providers?.claude?.[0]?.default).toBe(
      false,
    );
    expect(config.siteDevtools.analysis?.providers?.claude?.[0]?.key).toEqual(
      expect.stringMatching(/^claude-provider-/),
    );
    expect(config.siteDevtools.analysis?.providers?.claude?.[0]?.label).toBe(
      'Claude US',
    );
    expect(
      config.siteDevtools.analysis?.providers?.claude?.[0],
    ).not.toHaveProperty('model');
    expect(
      config.siteDevtools.analysis?.providers?.claude?.[0]?.timeoutMs,
    ).toBe(120_000);
    expect(config.siteDevtools.analysis?.providers?.doubao?.[0]?.apiKey).toBe(
      'test-key',
    );
    expect(config.siteDevtools.analysis?.providers?.doubao?.[0]?.baseUrl).toBe(
      'https://ark.cn-beijing.volces.com/api/v3',
    );
    expect(config.siteDevtools.analysis?.providers?.doubao?.[0]?.default).toBe(
      false,
    );
    expect(config.siteDevtools.analysis?.providers?.doubao?.[0]?.key).toEqual(
      expect.stringMatching(/^doubao-provider-/),
    );
    expect(config.siteDevtools.analysis?.providers?.doubao?.[0]?.label).toBe(
      'Doubao CN',
    );
    expect(
      config.siteDevtools.analysis?.providers?.doubao?.[0]?.timeoutMs,
    ).toBe(90_000);
    expect(config.siteDevtools).not.toHaveProperty('ai');
  });

  it('fills cache option defaults when cache is true', () => {
    const config = resolveConfig({
      siteDevtools: {
        analysis: {
          buildReports: {
            cache: true,
          },
        },
      },
    });

    expect(config.siteDevtools.analysis?.buildReports?.cache).toEqual({
      dir: expect.stringMatching(/\.vitepress\/cache\/site-devtools-reports$/),
      strategy: 'exact',
    });
  });

  it('keeps display labels and default selection out of internal identity', () => {
    expect(createResolvedIdentity('A', false)).toEqual(
      createResolvedIdentity('B', true),
    );
  });

  it('normalizes resolvePage model object selections to internal model ids', () => {
    const doubaoCN = doubao.provider({
      apiKey: 'test-key',
    });
    const defaultReview = doubaoCN.model({
      default: true,
      model: 'doubao-seed-2-0-pro-260215',
    });
    const perfReview = doubaoCN.model({
      model: 'doubao-seed-2-0-pro-260215',
      thinking: true,
    });
    const config = resolveConfig({
      siteDevtools: {
        analysis: {
          providers: [doubaoCN],
          buildReports: {
            models: [defaultReview, perfReview],
            resolvePage: ({ page }) =>
              page.routePath === '/guide/performance'
                ? { model: perfReview, includeChunks: true }
                : {},
          },
        },
      },
    });
    const models = config.siteDevtools.analysis?.buildReports?.models ?? [];
    const result = config.siteDevtools.analysis?.buildReports?.resolvePage?.({
      models,
      page: {
        filePath: '/docs/guide/performance.md',
        routePath: '/guide/performance',
      },
    });

    expect(result).toEqual({
      includeChunks: true,
      modelId: models[1]?.id,
    });
  });

  it('fills cache option defaults when cache config is enabled', () => {
    const config = resolveConfig({
      siteDevtools: {
        analysis: {
          buildReports: {
            cache: {},
          },
        },
      },
    });

    expect(config.siteDevtools.analysis?.buildReports?.cache).toEqual({
      dir: expect.stringMatching(/\.vitepress\/cache\/site-devtools-reports$/),
      strategy: 'exact',
    });
  });

  it('treats buildReports presence as enabled and defaults cache to true', () => {
    const config = resolveConfig({
      siteDevtools: {
        analysis: {
          buildReports: {},
        },
      },
    });

    expect(config.siteDevtools.analysis?.buildReports).toEqual({
      cache: {
        dir: expect.stringMatching(
          /\.vitepress\/cache\/site-devtools-reports$/,
        ),
        strategy: 'exact',
      },
      includeChunks: false,
      includeModules: false,
    });
  });
});
