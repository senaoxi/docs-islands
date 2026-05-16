/**
 * @vitest-environment node
 */
import type { PageMetafile } from '#dep-types/page';
import type { SiteDevToolsAnalysisBuildReportsPageContext } from '#dep-types/utils';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSiteDevToolsAiModuleReportKey } from '../../../shared/site-devtools-ai';
import { generateSiteDevToolsAiBuildReports as generateSiteDevToolsAiBuildReportsImpl } from '../ai-build-reports';

const { mockLoggerInfo, mockLoggerWarn } = vi.hoisted(() => ({
  mockLoggerInfo: vi.fn(),
  mockLoggerWarn: vi.fn(),
}));

vi.mock('../../logger', () => ({
  getVitePressGroupLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: mockLoggerInfo,
    success: vi.fn(),
    warn: mockLoggerWarn,
  }),
}));

const tempDirectories: string[] = [];
const TEST_DOUBAO_PROVIDER_ID = 'doubao-default';
const TEST_LOGGER_SCOPE_ID = 'site-devtools-ai-build-reports-test-scope';

const resolveAvailableDoubaoCapabilities = async () => ({
  ok: true as const,
  providers: {
    doubao: {
      available: true,
      detail: 'Available in test',
      model: 'doubao-test-model',
      provider: 'doubao' as const,
    },
  },
});

const createTempDirectory = (prefix = 'site-devtools-ai-build-reports-') => {
  const directoryPath = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirectories.push(directoryPath);
  return directoryPath;
};

const writeTextFile = (filePath: string, content: string) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
};

const createDeferred = <T = void>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return {
    promise,
    reject,
    resolve,
  };
};

const createDocsPageFilePath = (routePath: string) =>
  `${path.join(
    '/repo/docs',
    routePath.replace(/^\/+/, '').replace(/\/$/, '') || 'index',
  )}.md`;

const createPageMetafiles = (): Record<string, PageMetafile> => ({
  '/guide/getting-started': {
    buildMetrics: {
      components: [
        {
          componentName: 'DemoCard',
          entryFile: '/docs/assets/chunks/demo-card.js',
          estimatedAssetBytes: 1680,
          estimatedCssBytes: 120,
          estimatedJsBytes: 1560,
          estimatedTotalBytes: 1680,
          files: [
            {
              bytes: 1560,
              file: '/docs/assets/chunks/demo-card.js',
              type: 'js',
            },
          ],
          framework: 'react',
          modules: [
            {
              bytes: 920,
              file: '/docs/assets/chunks/demo-card.js',
              id: '/src/components/DemoCard.tsx',
              sourceAssetFile: '/docs/assets/sources/DemoCard.tsx',
              sourcePath: '/src/components/DemoCard.tsx',
            },
          ],
          renderDirectives: ['client:load'],
          sourcePath: '/repo/src/components/DemoCard.tsx',
        },
      ],
      framework: 'react',
      loader: null,
      renderInstances: [
        {
          blockingCssBytes: 0,
          blockingCssCount: 0,
          blockingCssFiles: [],
          componentName: 'DemoCard',
          embeddedHtmlBytes: 0,
          renderDirective: 'client:load',
          renderId: 'render-demo-card',
          sequence: 1,
          sourcePath: '/repo/src/components/DemoCard.tsx',
          useSpaSyncRender: false,
          usesCssLoadingRuntime: false,
        },
      ],
      spaSyncEffects: null,
      ssrInject: null,
      totalEstimatedComponentBytes: 1680,
    },
    cssBundlePaths: [],
    loaderScript: '',
    modulePreloads: [],
    pathname: '/guide/getting-started',
    ssrInjectScript: '',
  },
});

const createMultiPageMetafiles = (
  routePaths: string[],
): Record<string, PageMetafile> =>
  Object.fromEntries(
    routePaths.map((routePath) => {
      const pageMetafile = createPageMetafiles()['/guide/getting-started'];

      return [
        routePath,
        {
          ...pageMetafile,
          pathname: routePath,
        } satisfies PageMetafile,
      ];
    }),
  );

const flushPromises = () =>
  new Promise<void>((resolve) => {
    setImmediate(resolve);
  });

const createSpaSyncOnlyPageMetafile = (): PageMetafile => ({
  buildMetrics: {
    components: [],
    framework: 'react',
    loader: {
      entryFile: '/docs/assets/unified-loader.js',
      files: [
        {
          bytes: 1200,
          file: '/docs/assets/unified-loader.js',
          type: 'js',
        },
      ],
      totalBytes: 1200,
    },
    renderInstances: [
      {
        blockingCssBytes: 0,
        blockingCssCount: 0,
        blockingCssFiles: [],
        componentName: 'SiteDevToolsConsoleOverview',
        embeddedHtmlBytes: 4200,
        renderDirective: 'ssr:only',
        renderId: 'render-overview',
        sequence: 1,
        sourcePath: '/repo/src/components/SiteDevToolsConsoleOverview.tsx',
        useSpaSyncRender: true,
        usesCssLoadingRuntime: false,
      },
    ],
    spaSyncEffects: {
      components: [
        {
          blockingCssBytes: 0,
          blockingCssCount: 0,
          blockingCssFiles: [],
          componentName: 'SiteDevToolsConsoleOverview',
          embeddedHtmlPatches: [
            {
              bytes: 4200,
              html: '<section>overview</section>',
              renderId: 'render-overview',
            },
          ],
          embeddedHtmlBytes: 4200,
          renderDirectives: ['ssr:only'],
          renderIds: ['render-overview'],
          requiresCssLoadingRuntime: false,
        },
      ],
      enabledComponentCount: 1,
      enabledRenderCount: 1,
      pageClientChunkFile: '/docs/assets/guide/site-devtools.hash.js',
      totalBlockingCssBytes: 0,
      totalBlockingCssCount: 0,
      totalEmbeddedHtmlBytes: 4200,
      usesCssLoadingRuntime: false,
    },
    ssrInject: null,
    totalEstimatedComponentBytes: 0,
  },
  cssBundlePaths: ['/docs/assets/site-devtools.css'],
  loaderScript: '/docs/assets/unified-loader.js',
  modulePreloads: ['/docs/assets/SiteDevToolsConsoleDocs.js'],
  pathname: '/guide/site-devtools',
  ssrInjectScript: '',
});

const createSpaSyncOnlyPageMetafileWithPageClientChunk = (
  pageClientChunkFile: string,
): PageMetafile => {
  const pageMetafile = createSpaSyncOnlyPageMetafile();

  if (pageMetafile.buildMetrics?.spaSyncEffects) {
    pageMetafile.buildMetrics.spaSyncEffects.pageClientChunkFile =
      pageClientChunkFile;
  }

  return pageMetafile;
};

const createSpaSyncOnlyRootPageMetafile = (): PageMetafile => {
  const pageMetafile = createSpaSyncOnlyPageMetafile();

  pageMetafile.pathname = '/core-concepts';

  if (pageMetafile.buildMetrics?.spaSyncEffects) {
    delete pageMetafile.buildMetrics.spaSyncEffects.pageClientChunkFile;
  }

  return pageMetafile;
};

const writeOutputAsset = (
  outDir: string,
  publicPath: string,
  content: string,
) =>
  writeTextFile(
    path.join(
      outDir,
      publicPath.replace(/^\/docs\/assets\//, 'assets/').replace(/^\/+/, ''),
    ),
    content,
  );

const createPageContexts = (
  pageMetafiles: Record<string, PageMetafile>,
): Record<string, { filePath: string; routePath: string }> =>
  Object.fromEntries(
    Object.keys(pageMetafiles).map((routePath) => [
      routePath,
      {
        filePath: createDocsPageFilePath(routePath),
        routePath,
      },
    ]),
  );

const normalizeTestAiConfig = (aiConfig: Record<string, any> | undefined) => {
  if (!aiConfig) {
    return aiConfig;
  }

  const normalizeProviderGroup = (
    provider: Record<string, any>,
    fallbackKey: string,
    index: number,
  ) => ({
    ...provider,
    default: provider.default === true,
    key:
      provider.key ||
      (index === 0 ? fallbackKey : `${fallbackKey}-${index + 1}`),
  });
  const providers = aiConfig.providers
    ? {
        ...aiConfig.providers,
        ...(Array.isArray(aiConfig.providers.claude)
          ? {
              claude: aiConfig.providers.claude.map(
                (provider: Record<string, any>, index: number) =>
                  normalizeProviderGroup(provider, 'claude-default', index),
              ),
            }
          : aiConfig.providers.claude
            ? {
                claude: [
                  normalizeProviderGroup(
                    aiConfig.providers.claude,
                    'claude-default',
                    0,
                  ),
                ],
              }
            : {}),
        ...(Array.isArray(aiConfig.providers.doubao)
          ? {
              doubao: aiConfig.providers.doubao.map(
                (provider: Record<string, any>, index: number) =>
                  normalizeProviderGroup(
                    provider,
                    TEST_DOUBAO_PROVIDER_ID,
                    index,
                  ),
              ),
            }
          : aiConfig.providers.doubao
            ? {
                doubao: [
                  normalizeProviderGroup(
                    aiConfig.providers.doubao,
                    TEST_DOUBAO_PROVIDER_ID,
                    0,
                  ),
                ],
              }
            : {}),
      }
    : aiConfig.providers;
  const getDefaultProviderKey = (provider: string) => {
    const providerConfigs =
      provider === 'claude' ? providers?.claude : providers?.doubao;

    return (
      providerConfigs?.find(
        (providerConfig: Record<string, any>) =>
          providerConfig.default === true,
      )?.key ??
      providerConfigs?.[0]?.key ??
      `${provider}-default`
    );
  };
  const buildReports = aiConfig.buildReports
    ? {
        ...aiConfig.buildReports,
        ...(Array.isArray(aiConfig.buildReports.models)
          ? {
              models: aiConfig.buildReports.models.map(
                (model: Record<string, any>, index: number) => {
                  const provider =
                    typeof model.provider === 'string'
                      ? model.provider
                      : 'doubao';
                  const providerKey =
                    model.providerKey ?? getDefaultProviderKey(provider);

                  return {
                    ...model,
                    id:
                      typeof model.id === 'string' && model.id.trim()
                        ? model.id
                        : `test-build-report-model-${index + 1}`,
                    provider,
                    providerKey,
                  };
                },
              ),
            }
          : {}),
      }
    : aiConfig.buildReports;

  if (typeof buildReports?.resolvePage === 'function') {
    const originalResolvePage = buildReports.resolvePage;

    buildReports.resolvePage = (context: Record<string, any>) =>
      originalResolvePage({
        ...context,
        ...context.page,
      });
  }

  return {
    ...aiConfig,
    ...(buildReports ? { buildReports } : {}),
    ...(providers ? { providers } : {}),
  };
};

const generateSiteDevToolsAiBuildReports = (
  options: Omit<
    Parameters<typeof generateSiteDevToolsAiBuildReportsImpl>[0],
    'aiConfig' | 'loggerScopeId'
  > & {
    aiConfig: Record<string, any>;
    loggerScopeId?: string;
  },
) =>
  generateSiteDevToolsAiBuildReportsImpl({
    ...options,
    aiConfig: normalizeTestAiConfig(options.aiConfig),
    loggerScopeId: options.loggerScopeId ?? TEST_LOGGER_SCOPE_ID,
  });

afterEach(() => {
  vi.restoreAllMocks();
  mockLoggerInfo.mockReset();
  mockLoggerWarn.mockReset();

  for (const directoryPath of tempDirectories.splice(0)) {
    fs.rmSync(directoryPath, { force: true, recursive: true });
  }
});

describe('generateSiteDevToolsAiBuildReports', () => {
  it('skips generation when build reports are disabled', async () => {
    const pageMetafiles = createPageMetafiles();
    const result = await generateSiteDevToolsAiBuildReports({
      aiConfig: {
        providers: {
          doubao: {
            apiKey: 'test-key',
            model: 'doubao-test-model',
          },
        },
      },
      assetsDir: 'assets',
      cacheDir: createTempDirectory('site-devtools-ai-cache-'),
      outDir: createTempDirectory(),
      pageMetafiles,
      wrapBaseUrl: (value) => `/docs${value}`,
    });

    expect(result.generatedReportCount).toBe(0);
    expect(result.executionCount).toBe(0);
    expect(result.providers).toEqual([]);
    expect(result.skippedReason).toContain('disabled');
    expect(
      pageMetafiles['/guide/getting-started'].buildMetrics?.components[0]
        .aiReports,
    ).toBeUndefined();
  });

  it('skips build-time AI report analysis when buildReports.models is omitted', async () => {
    const result = await generateSiteDevToolsAiBuildReports({
      aiConfig: {
        buildReports: {},
        providers: {
          doubao: {
            apiKey: 'test-key',
            model: 'doubao-test-model',
          },
        },
      },
      assetsDir: 'assets',
      cacheDir: createTempDirectory('site-devtools-ai-cache-'),
      outDir: createTempDirectory(),
      pageMetafiles: createPageMetafiles(),
      wrapBaseUrl: (value) => `/docs${value}`,
    });

    expect(result.executionCount).toBe(0);
    expect(result.generatedReportCount).toBe(0);
    expect(result.providers).toEqual([]);
    expect(result.skippedReason).toContain(
      'siteDevtools.analysis.buildReports.models',
    );
  });

  it('treats an explicit empty models list as no-op instead of running reports', async () => {
    const result = await generateSiteDevToolsAiBuildReports({
      aiConfig: {
        buildReports: {
          models: [],
        },
        providers: {
          doubao: {
            apiKey: 'test-key',
            model: 'doubao-test-model',
          },
        },
      },
      assetsDir: 'assets',
      cacheDir: createTempDirectory('site-devtools-ai-cache-'),
      outDir: createTempDirectory(),
      pageMetafiles: createPageMetafiles(),
      wrapBaseUrl: (value) => `/docs${value}`,
    });

    expect(result.executionCount).toBe(0);
    expect(result.generatedReportCount).toBe(0);
    expect(result.providers).toEqual([]);
    expect(result.skippedReason).toContain(
      'siteDevtools.analysis.buildReports.models',
    );
  });

  it('writes a single page build report and attaches page references to chunk and module entries', async () => {
    const outDir = createTempDirectory();
    const cacheDir = createTempDirectory('site-devtools-ai-cache-');
    const pageMetafiles = createPageMetafiles();
    const componentMetric =
      pageMetafiles['/guide/getting-started'].buildMetrics?.components[0];

    writeTextFile(
      path.join(outDir, 'assets/chunks/demo-card.js'),
      'export const DemoCard = () => "demo";',
    );
    writeTextFile(
      path.join(outDir, 'assets/sources/DemoCard.tsx'),
      'export function DemoCard() { return <div>demo</div>; }',
    );

    const result = await generateSiteDevToolsAiBuildReports({
      aiConfig: {
        buildReports: {
          includeChunks: true,
          includeModules: true,
          models: [
            {
              model: 'doubao-test-model',
              provider: 'doubao',
              thinking: true,
            },
          ],
        },
        providers: {
          doubao: {
            apiKey: 'test-key',
            model: 'doubao-test-model',
            thinking: true,
          },
        },
      },
      assetsDir: 'assets',
      cacheDir,
      dependencies: {
        analyzeTarget: async ({ provider, target }) => ({
          detail: `Generated in test for ${provider}`,
          model: 'doubao-test-model',
          result: `analysis:${target.displayPath}`,
        }),
        resolveCapabilities: async () => ({
          ok: true,
          providers: {
            doubao: {
              available: true,
              detail: 'Available in test',
              model: 'doubao-test-model',
              provider: 'doubao',
            },
          },
        }),
      },
      outDir,
      pageContexts: createPageContexts(pageMetafiles),
      pageMetafiles,
      wrapBaseUrl: (value) => `/docs${value}`,
    });

    const pageReportFiles = fs.readdirSync(
      path.join(outDir, 'assets/page-metafiles/ai/pages'),
    );
    const moduleKey = getSiteDevToolsAiModuleReportKey(
      '/docs/assets/chunks/demo-card.js',
      '/src/components/DemoCard.tsx',
    );

    expect(result.executionCount).toBe(1);
    expect(result.generatedReportCount).toBe(1);
    expect(result.providers).toEqual(['doubao']);
    expect(pageReportFiles).toHaveLength(1);
    expect(componentMetric?.aiReports?.chunkReports).toEqual({
      '/docs/assets/chunks/demo-card.js': [
        expect.objectContaining({
          provider: 'doubao',
          reportFile: expect.stringContaining(
            '/docs/assets/page-metafiles/ai/pages/',
          ),
          reportId: expect.any(String),
          reportLabel: expect.stringContaining('Doubao'),
        }),
      ],
    });
    expect(componentMetric?.aiReports?.moduleReports).toEqual({
      [moduleKey]: [
        expect.objectContaining({
          provider: 'doubao',
          reportFile: expect.stringContaining(
            '/docs/assets/page-metafiles/ai/pages/',
          ),
          reportId: expect.any(String),
          reportLabel: expect.stringContaining('Doubao'),
        }),
      ],
    });

    const pageReportPath = path.join(
      outDir,
      'assets/page-metafiles/ai/pages',
      pageReportFiles[0],
    );
    const pageReport = JSON.parse(fs.readFileSync(pageReportPath, 'utf8')) as {
      prompt: string;
      provider: string;
      reportId: string;
      reportLabel: string;
      result: string;
      target: { artifactKind: string; displayPath: string };
    };

    expect(pageReport.provider).toBe('doubao');
    expect(pageReport.reportId).toBeTruthy();
    expect(pageReport.reportLabel).toContain('Doubao');
    expect(pageReport.prompt).toContain('## Current Page Snapshot');
    expect(pageReport.prompt).toContain(
      'Prioritize build diagnosis over descriptive inventory.',
    );
    expect(pageReport.prompt).toContain(
      'Current Page Rendered React Components:',
    );
    expect(pageReport.prompt).toContain('Build Chunks (1 shown):');
    expect(pageReport.prompt).toContain('Chunk Modules:');
    expect(pageReport.prompt).toContain('Top Page Resources');
    expect(pageReport.prompt).toContain('Top Page Modules');
    expect(pageReport.result).toContain('/guide/getting-started');
    expect(pageReport.target.artifactKind).toBe('page-build');
    expect(pageReport.target.displayPath).toBe('/guide/getting-started');
    expect(
      fs.existsSync(path.join(outDir, 'assets/page-metafiles/ai/chunks')),
    ).toBe(false);
    expect(
      fs.existsSync(path.join(outDir, 'assets/page-metafiles/ai/modules')),
    ).toBe(false);
    expect(result.reusedReportCount).toBe(0);
  });

  it('dispatches page build report analysis in parallel across eligible pages', async () => {
    const outDir = createTempDirectory();
    const pageMetafiles = createMultiPageMetafiles([
      '/guide/getting-started',
      '/guide/advanced',
    ]);
    const firstPageRelease = createDeferred<void>();
    const analyzeTarget = vi.fn(async ({ target }) => {
      if (target.displayPath === '/guide/getting-started') {
        await firstPageRelease.promise;
      }

      return {
        detail: `Generated in test for ${target.displayPath}`,
        model: 'doubao-test-model',
        result: `analysis:${target.displayPath}`,
      };
    });

    writeTextFile(
      path.join(outDir, 'assets/chunks/demo-card.js'),
      'export const DemoCard = () => "demo";',
    );
    writeTextFile(
      path.join(outDir, 'assets/sources/DemoCard.tsx'),
      'export function DemoCard() { return <div>demo</div>; }',
    );

    const resultPromise = generateSiteDevToolsAiBuildReports({
      aiConfig: {
        buildReports: {
          cache: false,
          models: [
            {
              model: 'doubao-test-model',
              provider: 'doubao',
            },
          ],
        },
        providers: {
          doubao: {
            apiKey: 'test-key',
            model: 'doubao-test-model',
          },
        },
      },
      assetsDir: 'assets',
      cacheDir: createTempDirectory('site-devtools-ai-cache-'),
      dependencies: {
        analyzeTarget,
        resolveCapabilities: async () => ({
          ok: true,
          providers: {
            doubao: {
              available: true,
              detail: 'Available in test',
              model: 'doubao-test-model',
              provider: 'doubao',
            },
          },
        }),
      },
      outDir,
      pageMetafiles,
      wrapBaseUrl: (value) => `/docs${value}`,
    });

    await flushPromises();

    expect(analyzeTarget).toHaveBeenCalledTimes(2);
    expect(analyzeTarget).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        target: expect.objectContaining({
          displayPath: '/guide/getting-started',
        }),
      }),
    );
    expect(analyzeTarget).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        target: expect.objectContaining({
          displayPath: '/guide/advanced',
        }),
      }),
    );

    firstPageRelease.resolve();

    const result = await resultPromise;
    expect(result.generatedReportCount).toBe(2);
    expect(result.reusedReportCount).toBe(0);
  });

  it('uses resolvePage to select pages and apply page-local chunk, module, and cache overrides', async () => {
    const outDir = createTempDirectory();
    const vitepressCacheDir = createTempDirectory('site-devtools-ai-cache-');
    const pageReportCacheDir = createTempDirectory('page-report-cache-');
    const pageMetafiles = createPageMetafiles();
    const componentMetric =
      pageMetafiles['/guide/getting-started'].buildMetrics?.components[0];

    writeTextFile(
      path.join(outDir, 'assets/chunks/demo-card.js'),
      'export const DemoCard = () => "demo";',
    );
    writeTextFile(
      path.join(outDir, 'assets/sources/DemoCard.tsx'),
      'export function DemoCard() { return <div>demo</div>; }',
    );

    const resolvePage = vi.fn(({ routePath }: { routePath: string }) =>
      routePath === '/guide/getting-started'
        ? {
            cache: {
              dir: pageReportCacheDir,
              strategy: 'exact' as const,
            },
            includeChunks: true,
            includeModules: true,
          }
        : false,
    );

    const result = await generateSiteDevToolsAiBuildReports({
      aiConfig: {
        buildReports: {
          cache: false,
          includeChunks: false,
          includeModules: false,
          models: [
            {
              model: 'doubao-test-model',
              provider: 'doubao',
            },
          ],
          resolvePage,
        },
        providers: {
          doubao: {
            apiKey: 'test-key',
            model: 'doubao-test-model',
          },
        },
      },
      assetsDir: 'assets',
      cacheDir: vitepressCacheDir,
      dependencies: {
        analyzeTarget: async ({ provider, target }) => ({
          detail: `Generated in test for ${provider}`,
          model: 'doubao-test-model',
          result: `analysis:${target.displayPath}`,
        }),
        resolveCapabilities: async () => ({
          ok: true,
          providers: {
            doubao: {
              available: true,
              detail: 'Available in test',
              model: 'doubao-test-model',
              provider: 'doubao',
            },
          },
        }),
      },
      outDir,
      pageContexts: createPageContexts(pageMetafiles),
      pageMetafiles,
      wrapBaseUrl: (value) => `/docs${value}`,
    });

    const gettingStartedFilePath = createDocsPageFilePath(
      '/guide/getting-started',
    );

    expect(result.generatedReportCount).toBe(1);
    expect(resolvePage).toHaveBeenCalledTimes(1);
    expect(resolvePage).toHaveBeenCalledWith({
      filePath: gettingStartedFilePath,
      models: [
        expect.objectContaining({
          id: 'test-build-report-model-1',
          model: 'doubao-test-model',
          provider: 'doubao',
          providerKey: TEST_DOUBAO_PROVIDER_ID,
        }),
      ],
      page: {
        filePath: gettingStartedFilePath,
        routePath: '/guide/getting-started',
      },
      routePath: '/guide/getting-started',
    });
    expect(
      componentMetric?.aiReports?.chunkReports?.[
        '/docs/assets/chunks/demo-card.js'
      ]?.[0]?.reportFile,
    ).toContain('/docs/assets/page-metafiles/ai/pages/');
    expect(
      Object.keys(componentMetric?.aiReports?.moduleReports ?? {}),
    ).toHaveLength(1);
    expect(fs.readdirSync(path.join(pageReportCacheDir, 'pages'))).toHaveLength(
      1,
    );
  });

  it('keeps page-local cache directories isolated when resolvePage returns different dirs per page', async () => {
    const firstOutDir = createTempDirectory();
    const secondOutDir = createTempDirectory();
    const vitepressCacheDir = createTempDirectory('site-devtools-ai-cache-');
    const gettingStartedCacheDir = createTempDirectory(
      'getting-started-cache-',
    );
    const advancedCacheDir = createTempDirectory('advanced-cache-');
    const routePaths = ['/guide/getting-started', '/guide/advanced'];
    const firstPageMetafiles = createMultiPageMetafiles(routePaths);
    const secondPageMetafiles = createMultiPageMetafiles(routePaths);
    const analyzeTarget = vi.fn(async ({ target }) => ({
      detail: `Generated in test for ${target.displayPath}`,
      model: 'doubao-test-model',
      result: `analysis:${target.displayPath}`,
    }));
    const resolvePage = vi.fn(({ routePath }: { routePath: string }) => {
      if (routePath === '/guide/getting-started') {
        return {
          cache: {
            dir: gettingStartedCacheDir,
            strategy: 'exact' as const,
          },
        };
      }

      if (routePath === '/guide/advanced') {
        return {
          cache: {
            dir: advancedCacheDir,
            strategy: 'exact' as const,
          },
        };
      }

      return false;
    });

    for (const outDir of [firstOutDir, secondOutDir]) {
      writeTextFile(
        path.join(outDir, 'assets/chunks/demo-card.js'),
        'export const DemoCard = () => "demo";',
      );
      writeTextFile(
        path.join(outDir, 'assets/sources/DemoCard.tsx'),
        'export function DemoCard() { return <div>demo</div>; }',
      );
    }

    const firstResult = await generateSiteDevToolsAiBuildReports({
      aiConfig: {
        buildReports: {
          cache: false,
          models: [
            {
              model: 'doubao-test-model',
              provider: 'doubao',
            },
          ],
          resolvePage,
        },
        providers: {
          doubao: {
            apiKey: 'test-key',
            model: 'doubao-test-model',
          },
        },
      },
      assetsDir: 'assets',
      cacheDir: vitepressCacheDir,
      dependencies: {
        analyzeTarget,
        resolveCapabilities: async () => ({
          ok: true as const,
          providers: {
            doubao: {
              available: true,
              detail: 'Available in test',
              model: 'doubao-test-model',
              provider: 'doubao' as const,
            },
          },
        }),
      },
      outDir: firstOutDir,
      pageContexts: createPageContexts(firstPageMetafiles),
      pageMetafiles: firstPageMetafiles,
      wrapBaseUrl: (value) => `/docs${value}`,
    });

    const gettingStartedCacheFiles = fs.readdirSync(
      path.join(gettingStartedCacheDir, 'pages'),
    );
    const advancedCacheFiles = fs.readdirSync(
      path.join(advancedCacheDir, 'pages'),
    );

    expect(firstResult.generatedReportCount).toBe(2);
    expect(firstResult.reusedReportCount).toBe(0);
    expect(analyzeTarget).toHaveBeenCalledTimes(2);
    expect(gettingStartedCacheFiles).toHaveLength(1);
    expect(advancedCacheFiles).toHaveLength(1);
    expect(gettingStartedCacheFiles[0]).toContain('getting-started');
    expect(advancedCacheFiles[0]).toContain('advanced');

    const secondAnalyzeTarget = vi.fn(async () => {
      throw new Error('page-local exact caches should be reused');
    });

    const secondResult = await generateSiteDevToolsAiBuildReports({
      aiConfig: {
        buildReports: {
          cache: false,
          models: [
            {
              model: 'doubao-test-model',
              provider: 'doubao',
            },
          ],
          resolvePage,
        },
        providers: {
          doubao: {
            apiKey: 'test-key',
            model: 'doubao-test-model',
          },
        },
      },
      assetsDir: 'assets',
      cacheDir: vitepressCacheDir,
      dependencies: {
        analyzeTarget: secondAnalyzeTarget,
        resolveCapabilities: async () => ({
          ok: true as const,
          providers: {
            doubao: {
              available: false,
              detail: 'Provider should not be needed when exact cache hits',
              provider: 'doubao' as const,
            },
          },
        }),
      },
      outDir: secondOutDir,
      pageContexts: createPageContexts(secondPageMetafiles),
      pageMetafiles: secondPageMetafiles,
      wrapBaseUrl: (value) => `/docs${value}`,
    });

    expect(secondResult.generatedReportCount).toBe(0);
    expect(secondResult.reusedReportCount).toBe(2);
    expect(secondAnalyzeTarget).not.toHaveBeenCalled();
    expect(fs.readdirSync(path.join(gettingStartedCacheDir, 'pages'))).toEqual(
      gettingStartedCacheFiles,
    );
    expect(fs.readdirSync(path.join(advancedCacheDir, 'pages'))).toEqual(
      advancedCacheFiles,
    );
  });

  it('inherits the global cache strategy when resolvePage overrides only the cache dir', async () => {
    const firstOutDir = createTempDirectory();
    const secondOutDir = createTempDirectory();
    const vitepressCacheDir = createTempDirectory('site-devtools-ai-cache-');
    const pageReportCacheDir = createTempDirectory('page-report-cache-');
    const firstPageMetafiles = createPageMetafiles();
    const secondPageMetafiles = createPageMetafiles();
    const analyzeTarget = vi.fn(async ({ provider, target }) => ({
      detail: `Generated in test for ${provider}`,
      model: 'doubao-test-model',
      result: `analysis:${target.displayPath}`,
    }));
    const resolvePage = vi.fn(({ routePath }: { routePath: string }) =>
      routePath === '/guide/getting-started'
        ? {
            cache: {
              dir: pageReportCacheDir,
            },
          }
        : false,
    );

    for (const outDir of [firstOutDir, secondOutDir]) {
      writeTextFile(
        path.join(outDir, 'assets/chunks/demo-card.js'),
        'export const DemoCard = () => "demo";',
      );
      writeTextFile(
        path.join(outDir, 'assets/sources/DemoCard.tsx'),
        'export function DemoCard() { return <div>demo</div>; }',
      );
    }

    const firstResult = await generateSiteDevToolsAiBuildReports({
      aiConfig: {
        buildReports: {
          cache: {
            strategy: 'fallback',
          },
          models: [
            {
              model: 'doubao-test-model',
              provider: 'doubao',
              temperature: 0.2,
            },
          ],
          resolvePage,
        },
        providers: {
          doubao: {
            apiKey: 'test-key',
          },
        },
      },
      assetsDir: 'assets',
      cacheDir: vitepressCacheDir,
      dependencies: {
        analyzeTarget,
        resolveCapabilities: async () => ({
          ok: true as const,
          providers: {
            doubao: {
              available: true,
              detail: 'Available in test',
              model: 'doubao-test-model',
              provider: 'doubao' as const,
            },
          },
        }),
      },
      outDir: firstOutDir,
      pageContexts: createPageContexts(firstPageMetafiles),
      pageMetafiles: firstPageMetafiles,
      wrapBaseUrl: (value) => `/docs${value}`,
    });

    const secondResult = await generateSiteDevToolsAiBuildReports({
      aiConfig: {
        buildReports: {
          cache: {
            strategy: 'fallback',
          },
          models: [
            {
              model: 'doubao-test-model',
              provider: 'doubao',
              temperature: 0.7,
            },
          ],
          resolvePage,
        },
        providers: {
          doubao: {
            apiKey: 'test-key',
          },
        },
      },
      assetsDir: 'assets',
      cacheDir: vitepressCacheDir,
      dependencies: {
        analyzeTarget: vi.fn(async () => {
          throw new Error('page-local fallback cache should be reused');
        }),
        resolveCapabilities: async () => ({
          ok: true as const,
          providers: {
            doubao: {
              available: true,
              detail: 'Available in test',
              model: 'doubao-test-model',
              provider: 'doubao' as const,
            },
          },
        }),
      },
      outDir: secondOutDir,
      pageContexts: createPageContexts(secondPageMetafiles),
      pageMetafiles: secondPageMetafiles,
      wrapBaseUrl: (value) => `/docs${value}`,
    });

    expect(firstResult.generatedReportCount).toBe(1);
    expect(firstResult.reusedReportCount).toBe(0);
    expect(secondResult.generatedReportCount).toBe(0);
    expect(secondResult.reusedReportCount).toBe(1);
    expect(analyzeTarget).toHaveBeenCalledTimes(1);
    expect(resolvePage).toHaveBeenCalled();
    expect(fs.readdirSync(path.join(pageReportCacheDir, 'pages'))).toHaveLength(
      1,
    );
  });

  it('uses the default model for empty resolvePage overrides, resolves providerKey against grouped providers, and treats undefined/null/false as equivalent skips', async () => {
    const pageMetafiles = createMultiPageMetafiles([
      '/guide/default-model',
      '/guide/intl-model',
      '/guide/skip-false',
      '/guide/skip-null',
      '/guide/skip-undefined',
    ]);
    const analyzeTarget = vi.fn(async ({ config, target }) => ({
      model: 'doubao-test-model',
      result: `${target.displayPath}::${config.providers?.doubao?.[0]?.key}`,
    }));

    const result = await generateSiteDevToolsAiBuildReports({
      aiConfig: {
        buildReports: {
          models: [
            {
              default: true,
              id: 'default-model',
              model: 'doubao-test-model',
              provider: 'doubao',
              providerKey: 'cn',
            },
            {
              id: 'intl-model',
              model: 'doubao-test-model',
              provider: 'doubao',
              providerKey: 'intl',
            },
          ],
          resolvePage: ({
            page,
          }: {
            page: SiteDevToolsAnalysisBuildReportsPageContext;
          }) => {
            let result:
              | {
                  modelId?: string;
                }
              | boolean
              | null
              | undefined;

            switch (page.routePath) {
              case '/guide/default-model': {
                result = {};
                break;
              }
              case '/guide/intl-model': {
                result = {
                  modelId: 'intl-model',
                };
                break;
              }
              case '/guide/skip-false': {
                result = false;
                break;
              }
              case '/guide/skip-null': {
                result = null;
                break;
              }
              default: {
                break;
              }
            }

            return result;
          },
        },
        providers: {
          doubao: [
            {
              apiKey: 'test-key-cn',
              default: true,
              key: 'cn',
            },
            {
              apiKey: 'test-key-intl',
              key: 'intl',
            },
          ],
        },
      },
      assetsDir: 'assets',
      cacheDir: createTempDirectory('site-devtools-ai-cache-'),
      dependencies: {
        analyzeTarget,
        resolveCapabilities: async () => ({
          ok: true,
          providers: {
            doubao: {
              available: true,
              detail: 'Available in test',
              model: 'doubao-test-model',
              provider: 'doubao',
            },
          },
        }),
      },
      outDir: createTempDirectory(),
      pageContexts: createPageContexts(pageMetafiles),
      pageMetafiles,
      wrapBaseUrl: (value) => `/docs${value}`,
    });

    expect(result.executionCount).toBe(2);
    expect(result.generatedReportCount).toBe(2);
    expect(analyzeTarget).toHaveBeenCalledTimes(2);
    expect(
      analyzeTarget.mock.calls.map(
        ([options]) => options.config.providers?.doubao?.[0]?.key,
      ),
    ).toEqual(['cn', 'intl']);
    expect(
      pageMetafiles['/guide/default-model'].buildMetrics?.aiReports?.[0]
        ?.reportId,
    ).toBe('default-model');
    expect(
      pageMetafiles['/guide/intl-model'].buildMetrics?.aiReports?.[0]?.reportId,
    ).toBe('intl-model');
    expect(
      pageMetafiles['/guide/skip-false'].buildMetrics?.aiReports,
    ).toBeUndefined();
    expect(
      pageMetafiles['/guide/skip-null'].buildMetrics?.aiReports,
    ).toBeUndefined();
    expect(
      pageMetafiles['/guide/skip-undefined'].buildMetrics?.aiReports,
    ).toBeUndefined();
  });

  it('generates mixed Doubao and Claude reports with provider config metadata', async () => {
    const pageMetafiles = createMultiPageMetafiles([
      '/guide/doubao',
      '/guide/claude',
    ]);
    const analyzeTarget = vi.fn(async ({ config, provider, target }) => ({
      model:
        provider === 'claude'
          ? 'claude-sonnet-4-20250514'
          : 'doubao-test-model',
      result:
        provider === 'claude'
          ? `${target.displayPath}::${config.providers?.claude?.[0]?.key}`
          : `${target.displayPath}::${config.providers?.doubao?.[0]?.key}`,
    }));

    const result = await generateSiteDevToolsAiBuildReports({
      aiConfig: {
        buildReports: {
          models: [
            {
              default: true,
              id: 'doubao-default',
              model: 'doubao-test-model',
              provider: 'doubao',
              providerKey: 'cn',
            },
            {
              id: 'claude-intl',
              model: 'claude-sonnet-4-20250514',
              provider: 'claude',
              providerKey: 'intl',
            },
          ],
          resolvePage: ({
            page,
          }: {
            page: SiteDevToolsAnalysisBuildReportsPageContext;
          }) =>
            page.routePath === '/guide/claude'
              ? { modelId: 'claude-intl' }
              : {},
        },
        providers: {
          claude: [
            {
              apiKey: 'test-key-us',
              default: true,
              key: 'us',
            },
            {
              apiKey: 'test-key-intl',
              key: 'intl',
              label: 'Claude Intl',
            },
          ],
          doubao: [
            {
              apiKey: 'test-key-cn',
              default: true,
              key: 'cn',
            },
          ],
        },
      },
      assetsDir: 'assets',
      cacheDir: createTempDirectory('site-devtools-ai-cache-'),
      dependencies: {
        analyzeTarget,
        resolveCapabilities: async () => ({
          ok: true,
          providers: {
            claude: {
              available: true,
              detail: 'Claude available in test',
              model: 'claude-sonnet-4-20250514',
              provider: 'claude',
            },
            doubao: {
              available: true,
              detail: 'Doubao available in test',
              model: 'doubao-test-model',
              provider: 'doubao',
            },
          },
        }),
      },
      outDir: createTempDirectory(),
      pageContexts: createPageContexts(pageMetafiles),
      pageMetafiles,
      wrapBaseUrl: (value) => `/docs${value}`,
    });

    expect(result.executionCount).toBe(2);
    expect(result.generatedReportCount).toBe(2);
    expect(new Set(result.providers)).toEqual(new Set(['doubao', 'claude']));
    expect(analyzeTarget).toHaveBeenCalledTimes(2);
    expect(
      analyzeTarget.mock.calls.find(
        ([options]) => options.provider === 'claude',
      )?.[0].config.providers?.claude?.[0]?.key,
    ).toBe('intl');
    expect(pageMetafiles['/guide/doubao'].buildMetrics?.aiReports?.[0]).toEqual(
      expect.objectContaining({
        provider: 'doubao',
        reportId: 'doubao-default',
      }),
    );
    expect(pageMetafiles['/guide/claude'].buildMetrics?.aiReports?.[0]).toEqual(
      expect.objectContaining({
        provider: 'claude',
        providerLabel: 'Claude Intl',
        reportId: 'claude-intl',
        reportLabel: expect.stringContaining('Claude'),
      }),
    );
  });

  it('reuses cached Claude build reports and writes Claude report assets', async () => {
    const cacheDir = createTempDirectory('site-devtools-ai-claude-cache-');
    const firstPageMetafiles = createPageMetafiles();
    const secondPageMetafiles = createPageMetafiles();
    const firstOutDir = createTempDirectory();
    const secondOutDir = createTempDirectory();
    const analyzeTarget = vi.fn(async ({ target }) => ({
      detail: 'Claude generated in test',
      model: 'claude-sonnet-4-20250514',
      result: `analysis:${target.displayPath}`,
    }));
    const aiConfig = {
      buildReports: {
        cache: {
          dir: cacheDir,
        },
        models: [
          {
            default: true,
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
            default: true,
            key: 'us',
          },
        ],
      },
    };
    const dependencies = {
      analyzeTarget,
      resolveCapabilities: async () => ({
        ok: true as const,
        providers: {
          claude: {
            available: true,
            detail: 'Claude available in test',
            model: 'claude-sonnet-4-20250514',
            provider: 'claude' as const,
          },
        },
      }),
    };

    const firstResult = await generateSiteDevToolsAiBuildReports({
      aiConfig,
      assetsDir: 'assets',
      cacheDir: createTempDirectory('vitepress-cache-'),
      dependencies,
      outDir: firstOutDir,
      pageContexts: createPageContexts(firstPageMetafiles),
      pageMetafiles: firstPageMetafiles,
      wrapBaseUrl: (value) => `/docs${value}`,
    });
    const secondResult = await generateSiteDevToolsAiBuildReports({
      aiConfig,
      assetsDir: 'assets',
      cacheDir: createTempDirectory('vitepress-cache-'),
      dependencies,
      outDir: secondOutDir,
      pageContexts: createPageContexts(secondPageMetafiles),
      pageMetafiles: secondPageMetafiles,
      wrapBaseUrl: (value) => `/docs${value}`,
    });

    const reportReference =
      secondPageMetafiles['/guide/getting-started'].buildMetrics
        ?.aiReports?.[0];
    const reportPath = reportReference?.reportFile
      ? path.join(
          secondOutDir,
          reportReference.reportFile.replace(/^\/docs\//, ''),
        )
      : '';
    const reportPayload = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as {
      provider?: string;
      reportId?: string;
      result?: string;
    };

    expect(firstResult.generatedReportCount).toBe(1);
    expect(firstResult.reusedReportCount).toBe(0);
    expect(secondResult.generatedReportCount).toBe(0);
    expect(secondResult.reusedReportCount).toBe(1);
    expect(analyzeTarget).toHaveBeenCalledTimes(1);
    expect(reportReference).toEqual(
      expect.objectContaining({
        provider: 'claude',
        reportId: 'claude-default',
      }),
    );
    expect(reportPayload).toEqual(
      expect.objectContaining({
        provider: 'claude',
        reportId: 'claude-default',
        result: 'analysis:/guide/getting-started',
      }),
    );
  });

  it('reuses page reports across chunk and module references when detail expansion is enabled', async () => {
    const outDir = createTempDirectory();
    const cacheDir = createTempDirectory('site-devtools-ai-cache-');
    const pageMetafiles = createPageMetafiles();
    const componentMetric =
      pageMetafiles['/guide/getting-started'].buildMetrics?.components[0];

    writeTextFile(
      path.join(outDir, 'assets/chunks/demo-card.js'),
      'export const DemoCard = () => "demo";',
    );
    writeTextFile(
      path.join(outDir, 'assets/sources/DemoCard.tsx'),
      'export function DemoCard() { return <div>demo</div>; }',
    );

    const analyzeTarget = vi.fn(async ({ provider, target }) => ({
      detail: `Generated in test for ${provider}`,
      model: 'doubao-test-model',
      result: `analysis:${target.displayPath}`,
    }));

    const result = await generateSiteDevToolsAiBuildReports({
      aiConfig: {
        buildReports: {
          includeChunks: true,
          includeModules: true,
          models: [
            {
              model: 'doubao-test-model',
              provider: 'doubao',
            },
          ],
        },
        providers: {
          doubao: {
            apiKey: 'test-key',
            model: 'doubao-test-model',
          },
        },
      },
      assetsDir: 'assets',
      cacheDir,
      dependencies: {
        analyzeTarget,
        resolveCapabilities: async () => ({
          ok: true,
          providers: {
            doubao: {
              available: true,
              detail: 'Available in test',
              model: 'doubao-test-model',
              provider: 'doubao',
            },
          },
        }),
      },
      outDir,
      pageContexts: createPageContexts(pageMetafiles),
      pageMetafiles,
      wrapBaseUrl: (value) => `/docs${value}`,
    });

    const moduleKey = getSiteDevToolsAiModuleReportKey(
      '/docs/assets/chunks/demo-card.js',
      '/src/components/DemoCard.tsx',
    );
    const pageReportFiles = fs.readdirSync(
      path.join(outDir, 'assets/page-metafiles/ai/pages'),
    );
    const chunkReference =
      componentMetric?.aiReports?.chunkReports?.[
        '/docs/assets/chunks/demo-card.js'
      ]?.[0];
    const moduleReference =
      componentMetric?.aiReports?.moduleReports?.[moduleKey]?.[0];
    const pageReport = JSON.parse(
      fs.readFileSync(
        path.join(outDir, 'assets/page-metafiles/ai/pages', pageReportFiles[0]),
        'utf8',
      ),
    ) as {
      prompt: string;
      result: string;
      target: {
        artifactKind: string;
        displayPath: string;
      };
    };

    expect(result.executionCount).toBe(1);
    expect(result.generatedReportCount).toBe(1);
    expect(result.providers).toEqual(['doubao']);
    expect(pageReportFiles).toHaveLength(1);
    expect(analyzeTarget).toHaveBeenCalledTimes(1);
    expect(pageReport.target.artifactKind).toBe('page-build');
    expect(pageReport.target.displayPath).toBe('/guide/getting-started');
    expect(pageReport.prompt).toContain('## Current Page Snapshot');
    expect(pageReport.prompt).toContain(
      'Prioritize build diagnosis over descriptive inventory.',
    );
    expect(pageReport.prompt).toContain(
      'Diagnosis discipline: Prioritize dominant drivers and blocking paths over exhaustive inventory.',
    );
    expect(pageReport.prompt).toContain('- Components: 1');
    expect(pageReport.prompt).toContain(
      'Current Page Rendered React Components:',
    );
    expect(pageReport.prompt).toContain('- Dominant Page Cost Drivers');
    expect(pageReport.prompt).toContain(
      'Order ideas by expected impact and confidence.',
    );
    expect(pageReport.prompt).toContain(
      'Current Page Rendering Strategy Context:',
    );
    expect(pageReport.prompt).toContain('Render Order and Side Effects:');
    expect(pageReport.result).toBe('analysis:/guide/getting-started');
    expect(chunkReference?.reportFile).toContain(
      '/docs/assets/page-metafiles/ai/pages/',
    );
    expect(moduleReference?.reportFile).toContain(
      '/docs/assets/page-metafiles/ai/pages/',
    );
    expect(chunkReference?.reportFile).toBe(moduleReference?.reportFile);
    expect(chunkReference?.reportId).toBe(moduleReference?.reportId);
  });

  it('sanitizes local absolute filesystem paths before persisting cached page reports', async () => {
    const outDir = createTempDirectory();
    const cacheDir = createTempDirectory('site-devtools-ai-cache-');
    const pageMetafiles = createPageMetafiles();
    const componentMetric =
      pageMetafiles['/guide/getting-started'].buildMetrics?.components[0];

    if (!componentMetric) {
      throw new Error('Expected component metric to be present in test setup.');
    }

    componentMetric.modules = [
      {
        bytes: 920,
        file: '/docs/assets/chunks/demo-card.js',
        id: '\u0000/Users/alice/Project/docs-islands/packages/vitepress/src/components/DemoCard.tsx?commonjs-module',
        sourcePath:
          '/Users/alice/Project/docs-islands/packages/vitepress/src/components/DemoCard.tsx',
      },
    ];

    writeTextFile(
      path.join(outDir, 'assets/chunks/demo-card.js'),
      'export const DemoCard = () => "demo";',
    );

    await generateSiteDevToolsAiBuildReports({
      aiConfig: {
        buildReports: {
          cache: {
            dir: cacheDir,
            strategy: 'exact',
          },
          models: [
            {
              model: 'doubao-test-model',
              provider: 'doubao',
            },
          ],
        },
        providers: {
          doubao: {
            apiKey: 'test-key',
            model: 'doubao-test-model',
          },
        },
      },
      assetsDir: 'assets',
      cacheDir,
      dependencies: {
        analyzeTarget: async ({ target }) => ({
          detail: 'Generated in test',
          model: 'doubao-test-model',
          result: `analysis:${target.context?.moduleItems?.[0]?.id ?? 'missing'}`,
        }),
        resolveCapabilities: async () => ({
          ok: true,
          providers: {
            doubao: {
              available: true,
              detail: 'Available in test',
              model: 'doubao-test-model',
              provider: 'doubao',
            },
          },
        }),
      },
      outDir,
      pageMetafiles,
      root: '/Users/alice/Project/docs-islands/packages/vitepress/docs',
      wrapBaseUrl: (value) => `/docs${value}`,
    });

    const pageReportFiles = fs.readdirSync(
      path.join(outDir, 'assets/page-metafiles/ai/pages'),
    );
    const cachedReportFiles = fs.readdirSync(path.join(cacheDir, 'pages'));
    const pageReport = JSON.parse(
      fs.readFileSync(
        path.join(outDir, 'assets/page-metafiles/ai/pages', pageReportFiles[0]),
        'utf8',
      ),
    ) as {
      prompt: string;
      result: string;
      target: {
        context?: {
          moduleItems?: {
            id: string;
          }[];
        };
      };
    };
    const cachedReportPayload = JSON.parse(
      fs.readFileSync(
        path.join(cacheDir, 'pages', cachedReportFiles[0]),
        'utf8',
      ),
    ) as {
      report: {
        prompt: string;
        result: string;
        target: {
          context?: {
            moduleItems?: {
              id: string;
            }[];
          };
        };
      };
    };
    const cachedReport = cachedReportPayload.report;

    expect(pageReport.prompt).not.toContain('/Users/alice/');
    expect(pageReport.result).not.toContain('/Users/alice/');
    expect(pageReport.target.context?.moduleItems?.[0]?.id).not.toContain(
      '/Users/alice/',
    );
    expect(pageReport.target.context?.moduleItems?.[0]?.id).toContain(
      '/src/components/DemoCard.tsx?commonjs-module',
    );
    expect(cachedReport.prompt).not.toContain('/Users/alice/');
    expect(cachedReport.result).not.toContain('/Users/alice/');
    expect(cachedReport.target.context?.moduleItems?.[0]?.id).toContain(
      '/src/components/DemoCard.tsx?commonjs-module',
    );
  });

  it('deduplicates shared chunk and module metrics in page-grouped prompts', async () => {
    const outDir = createTempDirectory();
    const cacheDir = createTempDirectory('site-devtools-ai-cache-');
    const pageMetafiles: Record<string, PageMetafile> = {
      '/guide/shared-runtime': {
        buildMetrics: {
          components: [
            {
              componentName: 'AlphaCard',
              entryFile: '/docs/assets/chunks/alpha.js',
              estimatedAssetBytes: 0,
              estimatedCssBytes: 0,
              estimatedJsBytes: 350,
              estimatedTotalBytes: 350,
              files: [
                {
                  bytes: 100,
                  file: '/docs/assets/chunks/shared-runtime.js',
                  type: 'js',
                },
                {
                  bytes: 250,
                  file: '/docs/assets/chunks/alpha.js',
                  type: 'js',
                },
              ],
              framework: 'react',
              modules: [
                {
                  bytes: 100,
                  file: '/docs/assets/chunks/shared-runtime.js',
                  id: '/node_modules/react/jsx-runtime.js',
                },
                {
                  bytes: 250,
                  file: '/docs/assets/chunks/alpha.js',
                  id: '/src/components/AlphaCard.tsx',
                },
              ],
              renderDirectives: [],
              sourcePath: '/repo/src/components/AlphaCard.tsx',
            },
            {
              componentName: 'BetaCard',
              entryFile: '/docs/assets/chunks/beta.js',
              estimatedAssetBytes: 0,
              estimatedCssBytes: 0,
              estimatedJsBytes: 400,
              estimatedTotalBytes: 400,
              files: [
                {
                  bytes: 100,
                  file: '/docs/assets/chunks/shared-runtime.js',
                  type: 'js',
                },
                {
                  bytes: 300,
                  file: '/docs/assets/chunks/beta.js',
                  type: 'js',
                },
              ],
              framework: 'react',
              modules: [
                {
                  bytes: 100,
                  file: '/docs/assets/chunks/shared-runtime.js',
                  id: '/node_modules/react/jsx-runtime.js',
                },
                {
                  bytes: 300,
                  file: '/docs/assets/chunks/beta.js',
                  id: '/src/components/BetaCard.tsx',
                },
              ],
              renderDirectives: [],
              sourcePath: '/repo/src/components/BetaCard.tsx',
            },
          ],
          framework: 'react',
          loader: null,
          spaSyncEffects: null,
          ssrInject: null,
          totalEstimatedComponentBytes: 750,
        },
        cssBundlePaths: [],
        loaderScript: '',
        modulePreloads: [],
        pathname: '/guide/shared-runtime',
        ssrInjectScript: '',
      },
    };

    const analyzeTarget = vi.fn(async ({ provider, target }) => ({
      detail: `Generated in test for ${provider}`,
      model: 'doubao-test-model',
      result: `analysis:${target.displayPath}`,
    }));

    await generateSiteDevToolsAiBuildReports({
      aiConfig: {
        buildReports: {
          models: [
            {
              model: 'doubao-test-model',
              provider: 'doubao',
            },
          ],
        },
        providers: {
          doubao: {
            apiKey: 'test-key',
            model: 'doubao-test-model',
          },
        },
      },
      assetsDir: 'assets',
      cacheDir,
      dependencies: {
        analyzeTarget,
        resolveCapabilities: async () => ({
          ok: true,
          providers: {
            doubao: {
              available: true,
              detail: 'Available in test',
              model: 'doubao-test-model',
              provider: 'doubao',
            },
          },
        }),
      },
      outDir,
      pageMetafiles,
      wrapBaseUrl: (value) => `/docs${value}`,
    });

    expect(analyzeTarget).toHaveBeenCalledTimes(1);
    expect(analyzeTarget).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.objectContaining({
          artifactKind: 'page-build',
          bytes: 650,
          context: expect.objectContaining({
            artifactHeaderItems: expect.arrayContaining([
              expect.objectContaining({
                label: 'Chunk Resources',
                value: '3',
              }),
              expect.objectContaining({
                label: 'Module Sources',
                value: '3',
              }),
            ]),
            bundleSummaryItems: expect.arrayContaining([
              expect.objectContaining({
                label: 'Total',
                value: '650 B',
              }),
              expect.objectContaining({
                label: 'JS',
                value: '650 B',
              }),
            ]),
            chunkResourceItems: expect.arrayContaining([
              expect.objectContaining({
                file: '/docs/assets/chunks/shared-runtime.js',
                size: '100 B',
              }),
            ]),
            moduleItems: expect.arrayContaining([
              expect.objectContaining({
                file: '/docs/assets/chunks/shared-runtime.js',
                id: '/node_modules/react/jsx-runtime.js',
                renderedSize: '100 B',
              }),
            ]),
          }),
        }),
      }),
    );
  });

  it('treats includeChunks and includeModules as independent page prompt switches', async () => {
    const cases = [
      {
        includeChunks: false,
        includeModules: false,
        shouldContainChunks: false,
        shouldContainChunkModules: false,
        shouldContainComponentModules: false,
      },
      {
        includeChunks: true,
        includeModules: false,
        shouldContainChunks: true,
        shouldContainChunkModules: false,
        shouldContainComponentModules: false,
      },
      {
        includeChunks: false,
        includeModules: true,
        shouldContainChunks: false,
        shouldContainChunkModules: false,
        shouldContainComponentModules: true,
      },
      {
        includeChunks: true,
        includeModules: true,
        shouldContainChunks: true,
        shouldContainChunkModules: true,
        shouldContainComponentModules: false,
      },
    ] as const;

    for (const testCase of cases) {
      const outDir = createTempDirectory();
      const cacheDir = createTempDirectory('site-devtools-ai-cache-');
      const pageMetafiles = createPageMetafiles();
      const reportDir = path.join(outDir, 'assets/page-metafiles/ai/pages');

      writeTextFile(
        path.join(outDir, 'assets/chunks/demo-card.js'),
        'export const DemoCard = () => "demo";',
      );
      writeTextFile(
        path.join(outDir, 'assets/sources/DemoCard.tsx'),
        'export function DemoCard() { return <div>demo</div>; }',
      );

      await generateSiteDevToolsAiBuildReports({
        aiConfig: {
          buildReports: {
            includeChunks: testCase.includeChunks,
            includeModules: testCase.includeModules,
            models: [
              {
                model: 'doubao-test-model',
                provider: 'doubao',
              },
            ],
          },
          providers: {
            doubao: {
              apiKey: 'test-key',
              model: 'doubao-test-model',
            },
          },
        },
        assetsDir: 'assets',
        cacheDir,
        dependencies: {
          analyzeTarget: async ({ target }) => ({
            detail: 'Generated in test',
            model: 'doubao-test-model',
            result: `analysis:${target.displayPath}`,
          }),
          resolveCapabilities: async () => ({
            ok: true,
            providers: {
              doubao: {
                available: true,
                detail: 'Available in test',
                model: 'doubao-test-model',
                provider: 'doubao',
              },
            },
          }),
        },
        outDir,
        pageMetafiles,
        wrapBaseUrl: (value) => `/docs${value}`,
      });

      const [pageReportFile] = fs.readdirSync(reportDir);
      const pageReport = JSON.parse(
        fs.readFileSync(path.join(reportDir, pageReportFile), 'utf8'),
      ) as {
        prompt: string;
      };

      expect(pageReport.prompt).toContain(
        'Current Page Rendered React Components:',
      );

      if (testCase.shouldContainChunks) {
        expect(pageReport.prompt).toContain('Build Chunks (');
      } else {
        expect(pageReport.prompt).not.toContain('Build Chunks (');
      }

      if (testCase.shouldContainChunkModules) {
        expect(pageReport.prompt).toContain('Chunk Modules:');
      } else {
        expect(pageReport.prompt).not.toContain('Chunk Modules:');
      }

      if (testCase.shouldContainComponentModules) {
        expect(pageReport.prompt).toContain('Component Modules (');
      } else {
        expect(pageReport.prompt).not.toContain('Component Modules (');
      }
    }
  });

  it('only calls resolvePage for eligible docs-islands pages', async () => {
    const outDir = createTempDirectory();
    const cacheDir = createTempDirectory('site-devtools-ai-cache-');
    const pageMetafiles = {
      ...createPageMetafiles(),
      '/guide/plain-page': {
        buildMetrics: {
          components: [],
          framework: 'react',
          loader: null,
          spaSyncEffects: null,
          ssrInject: null,
          totalEstimatedComponentBytes: 0,
        },
        cssBundlePaths: [],
        loaderScript: '',
        modulePreloads: [],
        pathname: '/guide/plain-page',
        ssrInjectScript: '',
      } satisfies PageMetafile,
    };

    writeTextFile(
      path.join(outDir, 'assets/chunks/demo-card.js'),
      'export const DemoCard = () => "demo";',
    );
    writeTextFile(
      path.join(outDir, 'assets/sources/DemoCard.tsx'),
      'export function DemoCard() { return <div>demo</div>; }',
    );

    const analyzeTarget = vi.fn(async ({ provider, target }) => ({
      detail: `Generated in test for ${provider}`,
      model: 'doubao-test-model',
      result: `analysis:${target.displayPath}`,
    }));
    const resolvePage = vi.fn(({ routePath }: { routePath: string }) =>
      routePath === '/guide/getting-started' ? {} : false,
    );

    const result = await generateSiteDevToolsAiBuildReports({
      aiConfig: {
        buildReports: {
          resolvePage,
          models: [
            {
              model: 'doubao-test-model',
              provider: 'doubao',
            },
          ],
        },
        providers: {
          doubao: {
            apiKey: 'test-key',
            model: 'doubao-test-model',
          },
        },
      },
      assetsDir: 'assets',
      cacheDir,
      dependencies: {
        analyzeTarget,
        resolveCapabilities: async () => ({
          ok: true,
          providers: {
            doubao: {
              available: true,
              detail: 'Available in test',
              model: 'doubao-test-model',
              provider: 'doubao',
            },
          },
        }),
      },
      outDir,
      pageContexts: createPageContexts(pageMetafiles),
      pageMetafiles,
      wrapBaseUrl: (value) => `/docs${value}`,
    });

    const gettingStartedFilePath = createDocsPageFilePath(
      '/guide/getting-started',
    );

    expect(result.generatedReportCount).toBe(1);
    expect(resolvePage).toHaveBeenCalledTimes(1);
    expect(resolvePage).toHaveBeenCalledWith({
      filePath: gettingStartedFilePath,
      models: [
        expect.objectContaining({
          id: 'test-build-report-model-1',
          model: 'doubao-test-model',
          provider: 'doubao',
          providerKey: TEST_DOUBAO_PROVIDER_ID,
        }),
      ],
      page: {
        filePath: gettingStartedFilePath,
        routePath: '/guide/getting-started',
      },
      routePath: '/guide/getting-started',
    });
    expect(analyzeTarget).toHaveBeenCalledTimes(1);
    expect(analyzeTarget).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.objectContaining({
          artifactKind: 'page-build',
          displayPath: '/guide/getting-started',
        }),
      }),
    );
    expect(pageMetafiles['/guide/plain-page'].buildMetrics?.components).toEqual(
      [],
    );
  });

  it('generates page-grouped reports for docs-islands pages that only expose spa-sync page signals', async () => {
    const outDir = createTempDirectory();
    const cacheDir = createTempDirectory('site-devtools-ai-cache-');
    const pageMetafiles = {
      '/guide/site-devtools': createSpaSyncOnlyPageMetafile(),
    };

    writeTextFile(
      path.join(outDir, 'assets/unified-loader.js'),
      'export const loader = () => "loader";',
    );
    writeTextFile(
      path.join(outDir, 'assets/SiteDevToolsConsoleDocs.js'),
      'export const docs = () => "docs";',
    );
    writeTextFile(
      path.join(outDir, 'assets/site-devtools.css'),
      '.site-devtools { color: var(--vp-c-brand-1); }',
    );

    const analyzeTarget = vi.fn(async ({ provider, target }) => ({
      detail: `Generated in test for ${provider}`,
      model: 'doubao-test-model',
      result: `analysis:${target.displayPath}`,
    }));

    const result = await generateSiteDevToolsAiBuildReports({
      aiConfig: {
        buildReports: {
          models: [
            {
              model: 'doubao-test-model',
              provider: 'doubao',
            },
          ],
        },
        providers: {
          doubao: {
            apiKey: 'test-key',
            model: 'doubao-test-model',
          },
        },
      },
      assetsDir: 'assets',
      cacheDir,
      dependencies: {
        analyzeTarget,
        resolveCapabilities: async () => ({
          ok: true,
          providers: {
            doubao: {
              available: true,
              detail: 'Available in test',
              model: 'doubao-test-model',
              provider: 'doubao',
            },
          },
        }),
      },
      outDir,
      pageMetafiles,
      wrapBaseUrl: (value) => `/docs${value}`,
    });

    expect(result.generatedReportCount).toBe(1);
    expect(analyzeTarget).toHaveBeenCalledTimes(1);
    expect(analyzeTarget).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.objectContaining({
          artifactKind: 'page-build',
          displayPath: '/guide/site-devtools',
          context: expect.objectContaining({
            artifactHeaderItems: expect.arrayContaining([
              expect.objectContaining({
                label: 'Module Preloads',
                value: '1',
              }),
              expect.objectContaining({
                label: 'CSS Bundles',
                value: '1',
              }),
              expect.objectContaining({
                label: 'Embedded HTML',
                value: '4.1 KB',
              }),
            ]),
            pageSpaSyncSummaryItems: expect.arrayContaining([
              expect.objectContaining({
                label: 'Enabled Renders',
                value: '1',
              }),
              expect.objectContaining({
                label: 'HTML Patch Target',
                value: '/docs/assets/guide/site-devtools.hash.js',
              }),
            ]),
            pageRenderOrderItems: expect.arrayContaining([
              expect.objectContaining({
                renderId: 'render-overview',
                useSpaSyncRender: true,
                summaryItems: expect.arrayContaining([
                  expect.objectContaining({
                    label: 'spa:sync-render Side Effect',
                  }),
                ]),
              }),
            ]),
          }),
        }),
      }),
    );
    expect(
      pageMetafiles['/guide/site-devtools'].buildMetrics?.aiReports,
    ).toEqual([
      expect.objectContaining({
        provider: 'doubao',
        reportFile: expect.stringContaining(
          '/docs/assets/page-metafiles/ai/pages/site-devtools.',
        ),
      }),
    ]);
  });

  it('reuses exact cached reports when the cache key matches', async () => {
    const reportCacheDir = createTempDirectory('site-devtools-ai-cache-');
    const firstOutDir = createTempDirectory();
    const secondOutDir = createTempDirectory();
    const vitepressCacheDir = createTempDirectory('vitepress-cache-');
    const analyzeTarget = vi.fn(async ({ provider, target }) => ({
      detail: `Generated in test for ${provider}`,
      model: 'doubao-test-model',
      result: `analysis:${target.displayPath}`,
    }));

    for (const outDir of [firstOutDir, secondOutDir]) {
      writeTextFile(
        path.join(outDir, 'assets/chunks/demo-card.js'),
        'export const DemoCard = () => "demo";',
      );
      writeTextFile(
        path.join(outDir, 'assets/sources/DemoCard.tsx'),
        'export function DemoCard() { return <div>demo</div>; }',
      );
    }

    const firstResult = await generateSiteDevToolsAiBuildReports({
      aiConfig: {
        buildReports: {
          cache: {
            dir: reportCacheDir,
            strategy: 'exact',
          },
          models: [
            {
              model: 'doubao-test-model',
              provider: 'doubao',
            },
          ],
        },
        providers: {
          doubao: {
            apiKey: 'test-key',
            model: 'doubao-test-model',
          },
        },
      },
      assetsDir: 'assets',
      cacheDir: vitepressCacheDir,
      dependencies: {
        analyzeTarget,
        resolveCapabilities: async () => ({
          ok: true as const,
          providers: {
            doubao: {
              available: true,
              detail: 'Available in test',
              model: 'doubao-test-model',
              provider: 'doubao' as const,
            },
          },
        }),
      },
      outDir: firstOutDir,
      pageMetafiles: createPageMetafiles(),
      wrapBaseUrl: (value) => `/docs${value}`,
    });

    const secondResult = await generateSiteDevToolsAiBuildReports({
      aiConfig: {
        buildReports: {
          cache: {
            dir: reportCacheDir,
            strategy: 'exact',
          },
          models: [
            {
              model: 'doubao-test-model',
              provider: 'doubao',
            },
          ],
        },
        providers: {
          doubao: {
            apiKey: 'another-key',
            model: 'doubao-test-model',
          },
        },
      },
      assetsDir: 'assets',
      cacheDir: vitepressCacheDir,
      dependencies: {
        analyzeTarget: vi.fn(async () => {
          throw new Error('exact cache should be reused');
        }),
        resolveCapabilities: async () => ({
          ok: true as const,
          providers: {
            doubao: {
              available: false,
              detail: 'Provider should not be needed when exact cache hits',
              provider: 'doubao' as const,
            },
          },
        }),
      },
      outDir: secondOutDir,
      pageMetafiles: createPageMetafiles(),
      wrapBaseUrl: (value) => `/docs${value}`,
    });

    expect(firstResult.generatedReportCount).toBe(1);
    expect(firstResult.reusedReportCount).toBe(0);
    expect(secondResult.generatedReportCount).toBe(0);
    expect(secondResult.reusedReportCount).toBe(1);
    expect(analyzeTarget).toHaveBeenCalledTimes(1);
    expect(fs.readdirSync(path.join(reportCacheDir, 'pages'))).toHaveLength(1);
  });

  it('reuses exact cache when only the report label changes', async () => {
    const reportCacheDir = createTempDirectory('site-devtools-ai-cache-');
    const firstOutDir = createTempDirectory();
    const secondOutDir = createTempDirectory();
    const vitepressCacheDir = createTempDirectory('vitepress-cache-');
    const analyzeTarget = vi.fn(async ({ provider, target }) => ({
      detail: `Generated in test for ${provider}`,
      model: 'doubao-test-model',
      result: `analysis:${target.displayPath}`,
    }));

    for (const outDir of [firstOutDir, secondOutDir]) {
      writeTextFile(
        path.join(outDir, 'assets/chunks/demo-card.js'),
        'export const DemoCard = () => "demo";',
      );
      writeTextFile(
        path.join(outDir, 'assets/sources/DemoCard.tsx'),
        'export function DemoCard() { return <div>demo</div>; }',
      );
    }

    await generateSiteDevToolsAiBuildReports({
      aiConfig: {
        buildReports: {
          cache: {
            dir: reportCacheDir,
            strategy: 'exact',
          },
          models: [
            {
              label: 'Doubao Pro',
              model: 'doubao-test-model',
              provider: 'doubao',
            },
          ],
        },
        providers: {
          doubao: {
            apiKey: 'test-key',
            model: 'doubao-test-model',
          },
        },
      },
      assetsDir: 'assets',
      cacheDir: vitepressCacheDir,
      dependencies: {
        analyzeTarget,
        resolveCapabilities: async () => ({
          ok: true as const,
          providers: {
            doubao: {
              available: true,
              detail: 'Available in test',
              model: 'doubao-test-model',
              provider: 'doubao' as const,
            },
          },
        }),
      },
      outDir: firstOutDir,
      pageMetafiles: createPageMetafiles(),
      wrapBaseUrl: (value) => `/docs${value}`,
    });

    const secondResult = await generateSiteDevToolsAiBuildReports({
      aiConfig: {
        buildReports: {
          cache: {
            dir: reportCacheDir,
            strategy: 'exact',
          },
          models: [
            {
              label: 'Renamed Doubao Pro',
              model: 'doubao-test-model',
              provider: 'doubao',
            },
          ],
        },
        providers: {
          doubao: {
            apiKey: 'test-key',
            model: 'doubao-test-model',
          },
        },
      },
      assetsDir: 'assets',
      cacheDir: vitepressCacheDir,
      dependencies: {
        analyzeTarget: vi.fn(async () => {
          throw new Error('label-only changes should reuse exact cache');
        }),
        resolveCapabilities: async () => ({
          ok: true as const,
          providers: {
            doubao: {
              available: false,
              detail: 'Provider should not be needed when exact cache hits',
              provider: 'doubao' as const,
            },
          },
        }),
      },
      outDir: secondOutDir,
      pageMetafiles: createPageMetafiles(),
      wrapBaseUrl: (value) => `/docs${value}`,
    });

    const [pageReportFile] = fs.readdirSync(
      path.join(secondOutDir, 'assets/page-metafiles/ai/pages'),
    );
    const reusedReport = JSON.parse(
      fs.readFileSync(
        path.join(
          secondOutDir,
          'assets/page-metafiles/ai/pages',
          pageReportFile,
        ),
        'utf8',
      ),
    ) as {
      reportId: string;
      reportLabel: string;
    };

    expect(secondResult.generatedReportCount).toBe(0);
    expect(secondResult.reusedReportCount).toBe(1);
    expect(analyzeTarget).toHaveBeenCalledTimes(1);
    expect(fs.readdirSync(path.join(reportCacheDir, 'pages'))).toHaveLength(1);
    expect(reusedReport.reportLabel).toBe('Renamed Doubao Pro');
    expect(reusedReport.reportId).toBeTruthy();
  });

  it('reuses exact cache when only provider timeoutMs changes', async () => {
    const reportCacheDir = createTempDirectory('site-devtools-ai-cache-');
    const firstOutDir = createTempDirectory();
    const secondOutDir = createTempDirectory();
    const vitepressCacheDir = createTempDirectory('vitepress-cache-');
    const analyzeTarget = vi.fn(async ({ provider, target }) => ({
      detail: `Generated in test for ${provider}`,
      model: 'doubao-test-model',
      result: `analysis:${target.displayPath}`,
    }));

    for (const outDir of [firstOutDir, secondOutDir]) {
      writeTextFile(
        path.join(outDir, 'assets/chunks/demo-card.js'),
        'export const DemoCard = () => "demo";',
      );
      writeTextFile(
        path.join(outDir, 'assets/sources/DemoCard.tsx'),
        'export function DemoCard() { return <div>demo</div>; }',
      );
    }

    await generateSiteDevToolsAiBuildReports({
      aiConfig: {
        buildReports: {
          cache: {
            dir: reportCacheDir,
            strategy: 'exact',
          },
          models: [
            {
              model: 'doubao-test-model',
              provider: 'doubao',
            },
          ],
        },
        providers: {
          doubao: {
            apiKey: 'test-key',
            model: 'doubao-test-model',
            timeoutMs: 60_000,
          },
        },
      },
      assetsDir: 'assets',
      cacheDir: vitepressCacheDir,
      dependencies: {
        analyzeTarget,
        resolveCapabilities: async () => ({
          ok: true as const,
          providers: {
            doubao: {
              available: true,
              detail: 'Available in test',
              model: 'doubao-test-model',
              provider: 'doubao' as const,
            },
          },
        }),
      },
      outDir: firstOutDir,
      pageMetafiles: createPageMetafiles(),
      wrapBaseUrl: (value) => `/docs${value}`,
    });

    const secondResult = await generateSiteDevToolsAiBuildReports({
      aiConfig: {
        buildReports: {
          cache: {
            dir: reportCacheDir,
            strategy: 'exact',
          },
          models: [
            {
              model: 'doubao-test-model',
              provider: 'doubao',
            },
          ],
        },
        providers: {
          doubao: {
            apiKey: 'test-key',
            model: 'doubao-test-model',
            timeoutMs: 300_000,
          },
        },
      },
      assetsDir: 'assets',
      cacheDir: vitepressCacheDir,
      dependencies: {
        analyzeTarget: vi.fn(async () => {
          throw new Error('timeout-only changes should reuse exact cache');
        }),
        resolveCapabilities: async () => ({
          ok: true as const,
          providers: {
            doubao: {
              available: false,
              detail: 'Provider should not be needed when exact cache hits',
              provider: 'doubao' as const,
            },
          },
        }),
      },
      outDir: secondOutDir,
      pageMetafiles: createPageMetafiles(),
      wrapBaseUrl: (value) => `/docs${value}`,
    });

    expect(secondResult.generatedReportCount).toBe(0);
    expect(secondResult.reusedReportCount).toBe(1);
    expect(analyzeTarget).toHaveBeenCalledTimes(1);
  });

  it('treats cache: true as exact cache with default options', async () => {
    const vitepressCacheDir = createTempDirectory('vitepress-cache-');
    const firstOutDir = createTempDirectory();
    const secondOutDir = createTempDirectory();
    const analyzeTarget = vi.fn(async ({ provider, target }) => ({
      detail: `Generated in test for ${provider}`,
      model: 'doubao-test-model',
      result: `analysis:${target.displayPath}`,
    }));

    for (const outDir of [firstOutDir, secondOutDir]) {
      writeTextFile(
        path.join(outDir, 'assets/chunks/demo-card.js'),
        'export const DemoCard = () => "demo";',
      );
      writeTextFile(
        path.join(outDir, 'assets/sources/DemoCard.tsx'),
        'export function DemoCard() { return <div>demo</div>; }',
      );
    }

    await generateSiteDevToolsAiBuildReports({
      aiConfig: {
        buildReports: {
          cache: true,
          models: [
            {
              model: 'doubao-test-model',
              provider: 'doubao',
            },
          ],
        },
        providers: {
          doubao: {
            apiKey: 'test-key',
            model: 'doubao-test-model',
          },
        },
      },
      assetsDir: 'assets',
      cacheDir: vitepressCacheDir,
      dependencies: {
        analyzeTarget,
        resolveCapabilities: async () => ({
          ok: true as const,
          providers: {
            doubao: {
              available: true,
              detail: 'Available in test',
              model: 'doubao-test-model',
              provider: 'doubao' as const,
            },
          },
        }),
      },
      outDir: firstOutDir,
      pageMetafiles: createPageMetafiles(),
      wrapBaseUrl: (value) => `/docs${value}`,
    });

    const secondResult = await generateSiteDevToolsAiBuildReports({
      aiConfig: {
        buildReports: {
          cache: true,
          models: [
            {
              model: 'doubao-test-model',
              provider: 'doubao',
            },
          ],
        },
        providers: {
          doubao: {
            apiKey: 'changed-key',
            model: 'doubao-test-model',
          },
        },
      },
      assetsDir: 'assets',
      cacheDir: vitepressCacheDir,
      dependencies: {
        analyzeTarget: vi.fn(async () => {
          throw new Error('cache: true should reuse exact cache by default');
        }),
        resolveCapabilities: async () => ({
          ok: true as const,
          providers: {
            doubao: {
              available: false,
              detail:
                'Provider should not be needed when default exact cache hits',
              provider: 'doubao' as const,
            },
          },
        }),
      },
      outDir: secondOutDir,
      pageMetafiles: createPageMetafiles(),
      wrapBaseUrl: (value) => `/docs${value}`,
    });

    expect(secondResult.generatedReportCount).toBe(0);
    expect(secondResult.reusedReportCount).toBe(1);
    expect(analyzeTarget).toHaveBeenCalledTimes(1);
    expect(
      fs.readdirSync(
        path.join(vitepressCacheDir, 'site-devtools-reports', 'pages'),
      ),
    ).toHaveLength(1);
  });

  it('regenerates exact cached reports when the cache key changes', async () => {
    const reportCacheDir = createTempDirectory('site-devtools-ai-cache-');
    const firstOutDir = createTempDirectory();
    const secondOutDir = createTempDirectory();
    const vitepressCacheDir = createTempDirectory('vitepress-cache-');
    const analyzeTarget = vi
      .fn()
      .mockImplementationOnce(async ({ target }) => ({
        detail: 'initial run',
        model: 'doubao-test-model',
        result: `first:${target.displayPath}`,
      }))
      .mockImplementationOnce(async ({ target }) => ({
        detail: 'exact rerun',
        model: 'doubao-test-model',
        result: `exact:${target.displayPath}`,
      }));
    const dependencies = {
      analyzeTarget,
      resolveCapabilities: async () => ({
        ok: true as const,
        providers: {
          doubao: {
            available: true,
            detail: 'Available in test',
            model: 'doubao-test-model',
            provider: 'doubao' as const,
          },
        },
      }),
    };

    for (const outDir of [firstOutDir, secondOutDir]) {
      writeTextFile(
        path.join(outDir, 'assets/chunks/demo-card.js'),
        'export const DemoCard = () => "demo";',
      );
      writeTextFile(
        path.join(outDir, 'assets/sources/DemoCard.tsx'),
        'export function DemoCard() { return <div>demo</div>; }',
      );
    }

    await generateSiteDevToolsAiBuildReports({
      aiConfig: {
        buildReports: {
          cache: {
            dir: reportCacheDir,
            strategy: 'exact',
          },
          models: [
            {
              model: 'doubao-test-model',
              provider: 'doubao',
              temperature: 0.2,
            },
          ],
        },
        providers: {
          doubao: {
            apiKey: 'test-key',
          },
        },
      },
      assetsDir: 'assets',
      cacheDir: vitepressCacheDir,
      dependencies,
      outDir: firstOutDir,
      pageMetafiles: createPageMetafiles(),
      wrapBaseUrl: (value) => `/docs${value}`,
    });

    const exactResult = await generateSiteDevToolsAiBuildReports({
      aiConfig: {
        buildReports: {
          cache: {
            dir: reportCacheDir,
            strategy: 'exact',
          },
          models: [
            {
              model: 'doubao-test-model',
              provider: 'doubao',
              temperature: 0.7,
            },
          ],
        },
        providers: {
          doubao: {
            apiKey: 'test-key',
          },
        },
      },
      assetsDir: 'assets',
      cacheDir: vitepressCacheDir,
      dependencies,
      outDir: secondOutDir,
      pageMetafiles: createPageMetafiles(),
      wrapBaseUrl: (value) => `/docs${value}`,
    });

    expect(analyzeTarget).toHaveBeenCalledTimes(2);
    expect(exactResult.generatedReportCount).toBe(1);
    expect(exactResult.executionCount).toBe(1);
    expect(exactResult.providers).toEqual(['doubao']);
    expect(exactResult.reusedReportCount).toBe(0);
    expect(
      mockLoggerInfo.mock.calls.some(
        ([message]) =>
          typeof message === 'string' &&
          message.includes(
            'Exact build-time AI report cache miss for /guide/getting-started',
          ) &&
          message.includes(
            'provider snapshot changed (temperature: 0.2 -> 0.7)',
          ),
      ),
    ).toBe(true);
  });

  it('logs when exact cache is invalidated because the prompt changes', async () => {
    const reportCacheDir = createTempDirectory('site-devtools-ai-cache-');
    const firstOutDir = createTempDirectory();
    const secondOutDir = createTempDirectory();
    const vitepressCacheDir = createTempDirectory('vitepress-cache-');
    const analyzeTarget = vi
      .fn()
      .mockImplementationOnce(async ({ target }) => ({
        detail: 'initial run',
        model: 'doubao-test-model',
        result: `first:${target.displayPath}`,
      }))
      .mockImplementationOnce(async ({ target }) => ({
        detail: 'prompt rerun',
        model: 'doubao-test-model',
        result: `second:${target.displayPath}`,
      }));
    const dependencies = {
      analyzeTarget,
      resolveCapabilities: async () => ({
        ok: true as const,
        providers: {
          doubao: {
            available: true,
            detail: 'Available in test',
            model: 'doubao-test-model',
            provider: 'doubao' as const,
          },
        },
      }),
    };

    for (const outDir of [firstOutDir, secondOutDir]) {
      writeTextFile(
        path.join(outDir, 'assets/chunks/demo-card.js'),
        'export const DemoCard = () => "demo";',
      );
      writeTextFile(
        path.join(outDir, 'assets/sources/DemoCard.tsx'),
        'export function DemoCard() { return <div>demo</div>; }',
      );
    }

    await generateSiteDevToolsAiBuildReports({
      aiConfig: {
        buildReports: {
          cache: {
            dir: reportCacheDir,
            strategy: 'exact',
          },
          includeChunks: false,
          models: [
            {
              model: 'doubao-test-model',
              provider: 'doubao',
            },
          ],
        },
        providers: {
          doubao: {
            apiKey: 'test-key',
            model: 'doubao-test-model',
          },
        },
      },
      assetsDir: 'assets',
      cacheDir: vitepressCacheDir,
      dependencies,
      outDir: firstOutDir,
      pageMetafiles: createPageMetafiles(),
      wrapBaseUrl: (value) => `/docs${value}`,
    });

    const secondResult = await generateSiteDevToolsAiBuildReports({
      aiConfig: {
        buildReports: {
          cache: {
            dir: reportCacheDir,
            strategy: 'exact',
          },
          includeChunks: true,
          models: [
            {
              model: 'doubao-test-model',
              provider: 'doubao',
            },
          ],
        },
        providers: {
          doubao: {
            apiKey: 'test-key',
            model: 'doubao-test-model',
          },
        },
      },
      assetsDir: 'assets',
      cacheDir: vitepressCacheDir,
      dependencies,
      outDir: secondOutDir,
      pageMetafiles: createPageMetafiles(),
      wrapBaseUrl: (value) => `/docs${value}`,
    });

    expect(analyzeTarget).toHaveBeenCalledTimes(2);
    expect(secondResult.generatedReportCount).toBe(1);
    expect(secondResult.reusedReportCount).toBe(0);
    expect(
      mockLoggerInfo.mock.calls.some(
        ([message]) =>
          typeof message === 'string' &&
          message.includes(
            'Exact build-time AI report cache miss for /guide/getting-started',
          ) &&
          message.includes('analysis prompt changed') &&
          message.includes('Composition Detail:'),
      ),
    ).toBe(true);
  });

  it('reuses exact cache when only hashed asset filenames change inside the prompt', async () => {
    const reportCacheDir = createTempDirectory('site-devtools-ai-cache-');
    const firstOutDir = createTempDirectory();
    const secondOutDir = createTempDirectory();
    const vitepressCacheDir = createTempDirectory('vitepress-cache-');
    const firstPageClientChunkFile =
      '/docs/assets/guide/site-devtools.AAAA1111.js';
    const secondPageClientChunkFile =
      '/docs/assets/guide/site-devtools.BBBB2222.js';
    const pageMetafiles = {
      '/guide/site-devtools': createSpaSyncOnlyPageMetafileWithPageClientChunk(
        firstPageClientChunkFile,
      ),
    } satisfies Record<string, PageMetafile>;
    const analyzeTarget = vi.fn(async ({ provider, target }) => ({
      detail: `Generated in test for ${provider}`,
      model: 'doubao-test-model',
      result: `analysis:${target.displayPath}`,
    }));

    for (const [outDir, pageClientChunkFile] of [
      [firstOutDir, firstPageClientChunkFile],
      [secondOutDir, secondPageClientChunkFile],
    ] as const) {
      writeOutputAsset(
        outDir,
        pageClientChunkFile,
        'export const siteDevtoolsConsolePage = "static-page-client-chunk";',
      );
      writeOutputAsset(
        outDir,
        '/docs/assets/unified-loader.js',
        'export const loader = "loader";',
      );
      writeOutputAsset(
        outDir,
        '/docs/assets/site-devtools.css',
        '.site-devtools{display:block;}',
      );
      writeOutputAsset(
        outDir,
        '/docs/assets/SiteDevToolsConsoleDocs.js',
        'export const SiteDevToolsConsoleDocs = "docs";',
      );
    }

    const firstResult = await generateSiteDevToolsAiBuildReports({
      aiConfig: {
        buildReports: {
          cache: {
            dir: reportCacheDir,
            strategy: 'exact',
          },
          models: [
            {
              model: 'doubao-test-model',
              provider: 'doubao',
            },
          ],
        },
        providers: {
          doubao: {
            apiKey: 'test-key',
            model: 'doubao-test-model',
          },
        },
      },
      assetsDir: 'assets',
      cacheDir: vitepressCacheDir,
      dependencies: {
        analyzeTarget,
        resolveCapabilities: async () => ({
          ok: true as const,
          providers: {
            doubao: {
              available: true,
              detail: 'Available in test',
              model: 'doubao-test-model',
              provider: 'doubao' as const,
            },
          },
        }),
      },
      outDir: firstOutDir,
      pageMetafiles,
      wrapBaseUrl: (value) => `/docs${value}`,
    });

    const secondResult = await generateSiteDevToolsAiBuildReports({
      aiConfig: {
        buildReports: {
          cache: {
            dir: reportCacheDir,
            strategy: 'exact',
          },
          models: [
            {
              model: 'doubao-test-model',
              provider: 'doubao',
            },
          ],
        },
        providers: {
          doubao: {
            apiKey: 'test-key',
            model: 'doubao-test-model',
          },
        },
      },
      assetsDir: 'assets',
      cacheDir: vitepressCacheDir,
      dependencies: {
        analyzeTarget: vi.fn(async () => {
          throw new Error(
            'exact cache should be reused after hash normalization',
          );
        }),
        resolveCapabilities: async () => ({
          ok: true as const,
          providers: {
            doubao: {
              available: false,
              detail: 'Provider should not be needed when exact cache hits',
              provider: 'doubao' as const,
            },
          },
        }),
      },
      outDir: secondOutDir,
      pageMetafiles: {
        '/guide/site-devtools':
          createSpaSyncOnlyPageMetafileWithPageClientChunk(
            secondPageClientChunkFile,
          ),
      },
      wrapBaseUrl: (value) => `/docs${value}`,
    });

    expect(firstResult.generatedReportCount).toBe(1);
    expect(firstResult.reusedReportCount).toBe(0);
    expect(secondResult.generatedReportCount).toBe(0);
    expect(secondResult.reusedReportCount).toBe(1);
    expect(analyzeTarget).toHaveBeenCalledTimes(1);
    expect(
      mockLoggerInfo.mock.calls.some(
        ([message]) =>
          typeof message === 'string' &&
          message.includes(
            'Exact build-time AI report cache miss for /guide/site-devtools',
          ),
      ),
    ).toBe(false);
  });

  it('reuses exact cache across rebuilds for rewritten root pages without explicit page client chunk metadata', async () => {
    const reportCacheDir = createTempDirectory('site-devtools-ai-cache-');
    const firstOutDir = createTempDirectory();
    const secondOutDir = createTempDirectory();
    const vitepressCacheDir = createTempDirectory('vitepress-cache-');
    const firstPageClientChunkFile =
      '/docs/assets/core-concepts.md.AAAA1111.js';
    const secondPageClientChunkFile =
      '/docs/assets/core-concepts.md.BBBB2222.js';
    const pageMetafiles = {
      '/core-concepts': createSpaSyncOnlyRootPageMetafile(),
    } satisfies Record<string, PageMetafile>;
    const analyzeTarget = vi.fn(async ({ provider, target }) => ({
      detail: `Generated in test for ${provider}`,
      model: 'doubao-test-model',
      result: `analysis:${target.displayPath}`,
    }));

    writeOutputAsset(
      firstOutDir,
      firstPageClientChunkFile,
      'export const coreConceptsPage = "static-page-client-chunk";',
    );
    writeOutputAsset(
      firstOutDir,
      '/docs/assets/unified-loader.js',
      'export const loader = "loader";',
    );
    writeOutputAsset(
      firstOutDir,
      '/docs/assets/site-devtools.css',
      '.site-devtools{display:block;}',
    );
    writeOutputAsset(
      firstOutDir,
      '/docs/assets/SiteDevToolsConsoleDocs.js',
      'export const SiteDevToolsConsoleDocs = "docs";',
    );

    const firstResult = await generateSiteDevToolsAiBuildReports({
      aiConfig: {
        buildReports: {
          cache: {
            dir: reportCacheDir,
            strategy: 'exact',
          },
          models: [
            {
              model: 'doubao-test-model',
              provider: 'doubao',
            },
          ],
        },
        providers: {
          doubao: {
            apiKey: 'test-key',
            model: 'doubao-test-model',
          },
        },
      },
      assetsDir: 'assets',
      cacheDir: vitepressCacheDir,
      dependencies: {
        analyzeTarget,
        resolveCapabilities: async () => ({
          ok: true as const,
          providers: {
            doubao: {
              available: true,
              detail: 'Available in test',
              model: 'doubao-test-model',
              provider: 'doubao' as const,
            },
          },
        }),
      },
      outDir: firstOutDir,
      pageMetafiles,
      wrapBaseUrl: (value) => `/docs${value}`,
    });

    writeOutputAsset(
      secondOutDir,
      firstPageClientChunkFile,
      'export const staleCoreConceptsPage = "stale-page-client-chunk";',
    );
    writeOutputAsset(
      secondOutDir,
      secondPageClientChunkFile,
      'export const coreConceptsPage = "static-page-client-chunk";',
    );
    fs.utimesSync(
      path.join(secondOutDir, 'assets/core-concepts.md.AAAA1111.js'),
      new Date('2026-04-05T08:00:00.000Z'),
      new Date('2026-04-05T08:00:00.000Z'),
    );
    fs.utimesSync(
      path.join(secondOutDir, 'assets/core-concepts.md.BBBB2222.js'),
      new Date('2026-04-05T09:00:00.000Z'),
      new Date('2026-04-05T09:00:00.000Z'),
    );
    writeOutputAsset(
      secondOutDir,
      '/docs/assets/unified-loader.js',
      'export const loader = "loader";',
    );
    writeOutputAsset(
      secondOutDir,
      '/docs/assets/site-devtools.css',
      '.site-devtools{display:block;}',
    );
    writeOutputAsset(
      secondOutDir,
      '/docs/assets/SiteDevToolsConsoleDocs.js',
      'export const SiteDevToolsConsoleDocs = "docs";',
    );

    const secondResult = await generateSiteDevToolsAiBuildReports({
      aiConfig: {
        buildReports: {
          cache: {
            dir: reportCacheDir,
            strategy: 'exact',
          },
          models: [
            {
              model: 'doubao-test-model',
              provider: 'doubao',
            },
          ],
        },
        providers: {
          doubao: {
            apiKey: 'test-key',
            model: 'doubao-test-model',
          },
        },
      },
      assetsDir: 'assets',
      cacheDir: vitepressCacheDir,
      dependencies: {
        analyzeTarget: vi.fn(async () => {
          throw new Error(
            'exact cache should be reused for rewritten root pages after rebuild',
          );
        }),
        resolveCapabilities: async () => ({
          ok: true as const,
          providers: {
            doubao: {
              available: false,
              detail: 'Provider should not be needed when exact cache hits',
              provider: 'doubao' as const,
            },
          },
        }),
      },
      outDir: secondOutDir,
      pageContexts: {
        '/core-concepts': {
          filePath: '/repo/docs/en/core-concepts.md',
          routePath: '/core-concepts',
        },
      },
      pageMetafiles: {
        '/core-concepts': createSpaSyncOnlyRootPageMetafile(),
      },
      wrapBaseUrl: (value) => `/docs${value}`,
    });

    expect(firstResult.generatedReportCount).toBe(1);
    expect(firstResult.reusedReportCount).toBe(0);
    expect(secondResult.generatedReportCount).toBe(0);
    expect(secondResult.reusedReportCount).toBe(1);
    expect(analyzeTarget).toHaveBeenCalledTimes(1);
  });

  it('reuses cached reports in fallback mode even when the cache key changes', async () => {
    const reportCacheDir = createTempDirectory('site-devtools-ai-cache-');
    const firstOutDir = createTempDirectory();
    const secondOutDir = createTempDirectory();
    const vitepressCacheDir = createTempDirectory('vitepress-cache-');
    const analyzeTarget = vi.fn(async ({ provider, target }) => ({
      detail: `Generated in test for ${provider}`,
      model: 'doubao-test-model',
      result: `analysis:${target.displayPath}`,
    }));
    const dependencies = {
      analyzeTarget,
      resolveCapabilities: async () => ({
        ok: true as const,
        providers: {
          doubao: {
            available: true,
            detail: 'Available in test',
            model: 'doubao-test-model',
            provider: 'doubao' as const,
          },
        },
      }),
    };

    for (const outDir of [firstOutDir, secondOutDir]) {
      writeTextFile(
        path.join(outDir, 'assets/chunks/demo-card.js'),
        'export const DemoCard = () => "demo";',
      );
      writeTextFile(
        path.join(outDir, 'assets/sources/DemoCard.tsx'),
        'export function DemoCard() { return <div>demo</div>; }',
      );
    }

    const firstResult = await generateSiteDevToolsAiBuildReports({
      aiConfig: {
        buildReports: {
          cache: {
            dir: reportCacheDir,
            strategy: 'fallback',
          },
          includeChunks: true,
          models: [
            {
              model: 'doubao-test-model',
              provider: 'doubao',
              temperature: 0.2,
            },
          ],
        },
        providers: {
          doubao: {
            apiKey: 'test-key',
          },
        },
      },
      assetsDir: 'assets',
      cacheDir: vitepressCacheDir,
      dependencies,
      outDir: firstOutDir,
      pageMetafiles: createPageMetafiles(),
      wrapBaseUrl: (value) => `/docs${value}`,
    });

    const secondPageMetafiles = createPageMetafiles();
    const secondResult = await generateSiteDevToolsAiBuildReports({
      aiConfig: {
        buildReports: {
          cache: {
            dir: reportCacheDir,
            strategy: 'fallback',
          },
          includeChunks: true,
          models: [
            {
              model: 'doubao-test-model',
              provider: 'doubao',
              temperature: 0.7,
            },
          ],
        },
        providers: {
          doubao: {
            apiKey: 'test-key',
          },
        },
      },
      assetsDir: 'assets',
      cacheDir: vitepressCacheDir,
      dependencies: {
        ...dependencies,
        analyzeTarget: vi.fn(async () => {
          throw new Error('fallback cache should be reused');
        }),
      },
      outDir: secondOutDir,
      pageMetafiles: secondPageMetafiles,
      wrapBaseUrl: (value) => `/docs${value}`,
    });

    expect(firstResult.generatedReportCount).toBe(1);
    expect(firstResult.reusedReportCount).toBe(0);
    expect(analyzeTarget).toHaveBeenCalledTimes(1);
    expect(secondResult.generatedReportCount).toBe(0);
    expect(secondResult.executionCount).toBe(1);
    expect(secondResult.providers).toEqual(['doubao']);
    expect(secondResult.reusedReportCount).toBe(1);
    expect(
      mockLoggerInfo.mock.calls.some(
        ([message]) =>
          typeof message === 'string' &&
          message.includes(
            'Fallback build-time AI report cache reuse for /guide/getting-started',
          ) &&
          message.includes(
            'provider snapshot changed (temperature: 0.2 -> 0.7)',
          ),
      ),
    ).toBe(true);
    expect(
      secondPageMetafiles['/guide/getting-started'].buildMetrics?.components[0]
        .aiReports?.chunkReports?.['/docs/assets/chunks/demo-card.js']?.[0]
        ?.reportFile,
    ).toContain('/docs/assets/page-metafiles/ai/pages/');
  });

  it('finds fallback cache entries when the report model identity changes', async () => {
    const reportCacheDir = createTempDirectory('site-devtools-ai-cache-');
    const firstOutDir = createTempDirectory();
    const secondOutDir = createTempDirectory();
    const vitepressCacheDir = createTempDirectory('vitepress-cache-');
    const firstPageMetafiles = createPageMetafiles();
    const secondPageMetafiles = createPageMetafiles();
    const analyzeTarget = vi.fn(async ({ target }) => ({
      detail: 'Generated in test for the legacy model identity',
      model: 'doubao-test-model',
      result: `analysis:${target.displayPath}`,
    }));

    for (const outDir of [firstOutDir, secondOutDir]) {
      writeTextFile(
        path.join(outDir, 'assets/chunks/demo-card.js'),
        'export const DemoCard = () => "demo";',
      );
      writeTextFile(
        path.join(outDir, 'assets/sources/DemoCard.tsx'),
        'export function DemoCard() { return <div>demo</div>; }',
      );
    }

    const firstResult = await generateSiteDevToolsAiBuildReports({
      aiConfig: {
        buildReports: {
          cache: {
            dir: reportCacheDir,
            strategy: 'fallback',
          },
          models: [
            {
              id: 'legacy-report-model',
              model: 'doubao-test-model',
              provider: 'doubao',
            },
          ],
        },
        providers: {
          doubao: {
            apiKey: 'test-key',
          },
        },
      },
      assetsDir: 'assets',
      cacheDir: vitepressCacheDir,
      dependencies: {
        analyzeTarget,
        resolveCapabilities: resolveAvailableDoubaoCapabilities,
      },
      outDir: firstOutDir,
      pageMetafiles: firstPageMetafiles,
      wrapBaseUrl: (value) => `/docs${value}`,
    });
    const firstCacheFiles = fs.readdirSync(path.join(reportCacheDir, 'pages'));
    const secondAnalyzeTarget = vi.fn(async () => {
      throw new Error(
        'fallback cache should be found after the report identity changes',
      );
    });

    const secondResult = await generateSiteDevToolsAiBuildReports({
      aiConfig: {
        buildReports: {
          cache: {
            dir: reportCacheDir,
            strategy: 'fallback',
          },
          models: [
            {
              id: 'current-report-model',
              model: 'doubao-test-model',
              provider: 'doubao',
            },
          ],
        },
        providers: {
          doubao: {
            apiKey: 'test-key',
          },
        },
      },
      assetsDir: 'assets',
      cacheDir: vitepressCacheDir,
      dependencies: {
        analyzeTarget: secondAnalyzeTarget,
        resolveCapabilities: resolveAvailableDoubaoCapabilities,
      },
      outDir: secondOutDir,
      pageMetafiles: secondPageMetafiles,
      wrapBaseUrl: (value) => `/docs${value}`,
    });

    expect(firstResult.generatedReportCount).toBe(1);
    expect(firstResult.reusedReportCount).toBe(0);
    expect(firstCacheFiles).toHaveLength(1);
    expect(analyzeTarget).toHaveBeenCalledTimes(1);
    expect(secondAnalyzeTarget).not.toHaveBeenCalled();
    expect(secondResult.generatedReportCount).toBe(0);
    expect(secondResult.reusedReportCount).toBe(1);
    expect(fs.readdirSync(path.join(reportCacheDir, 'pages'))).toHaveLength(2);
    expect(
      secondPageMetafiles['/guide/getting-started'].buildMetrics?.aiReports?.[0]
        ?.reportId,
    ).toBe('current-report-model');
  });

  it('reuses exact cache by default when cache is omitted', async () => {
    const vitepressCacheDir = createTempDirectory('vitepress-cache-');
    const firstOutDir = createTempDirectory();
    const secondOutDir = createTempDirectory();
    const analyzeTarget = vi.fn(async ({ target }) => ({
      detail: 'initial run',
      model: 'doubao-test-model',
      result: `first:${target.displayPath}`,
    }));
    const dependencies = {
      analyzeTarget,
      resolveCapabilities: async () => ({
        ok: true as const,
        providers: {
          doubao: {
            available: true,
            detail: 'Available in test',
            model: 'doubao-test-model',
            provider: 'doubao' as const,
          },
        },
      }),
    };

    for (const outDir of [firstOutDir, secondOutDir]) {
      writeTextFile(
        path.join(outDir, 'assets/chunks/demo-card.js'),
        'export const DemoCard = () => "demo";',
      );
      writeTextFile(
        path.join(outDir, 'assets/sources/DemoCard.tsx'),
        'export function DemoCard() { return <div>demo</div>; }',
      );
    }

    await generateSiteDevToolsAiBuildReports({
      aiConfig: {
        buildReports: {
          models: [
            {
              model: 'doubao-test-model',
              provider: 'doubao',
            },
          ],
        },
        providers: {
          doubao: {
            apiKey: 'test-key',
            model: 'doubao-test-model',
          },
        },
      },
      assetsDir: 'assets',
      cacheDir: vitepressCacheDir,
      dependencies,
      outDir: firstOutDir,
      pageMetafiles: createPageMetafiles(),
      wrapBaseUrl: (value) => `/docs${value}`,
    });

    const defaultCacheResult = await generateSiteDevToolsAiBuildReports({
      aiConfig: {
        buildReports: {
          models: [
            {
              model: 'doubao-test-model',
              provider: 'doubao',
            },
          ],
        },
        providers: {
          doubao: {
            apiKey: 'test-key',
            model: 'doubao-test-model',
          },
        },
      },
      assetsDir: 'assets',
      cacheDir: vitepressCacheDir,
      dependencies: {
        ...dependencies,
        analyzeTarget: vi.fn(async () => {
          throw new Error(
            'default cache should be reused when cache is omitted',
          );
        }),
      },
      outDir: secondOutDir,
      pageMetafiles: createPageMetafiles(),
      wrapBaseUrl: (value) => `/docs${value}`,
    });

    expect(analyzeTarget).toHaveBeenCalledTimes(1);
    expect(defaultCacheResult.generatedReportCount).toBe(0);
    expect(defaultCacheResult.executionCount).toBe(1);
    expect(defaultCacheResult.providers).toEqual(['doubao']);
    expect(defaultCacheResult.reusedReportCount).toBe(1);
    expect(
      fs.readdirSync(
        path.join(vitepressCacheDir, 'site-devtools-reports', 'pages'),
      ),
    ).toHaveLength(1);
  });
});
