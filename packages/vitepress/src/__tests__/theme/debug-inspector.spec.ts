import { describe, expect, it } from 'vitest';
import {
  createMetafileLookup,
  type DebugWindow,
  getBuildMetricForRender,
  getCurrentPageCandidates,
  type PageMetafile,
  resolvePageMetafileState,
} from '../../../theme/debug-inspector';

const createPageMetafile = (
  overrides: Partial<PageMetafile>,
): PageMetafile => ({
  cssBundlePaths: [],
  loaderScript: '',
  modulePreloads: [],
  ssrInjectScript: '',
  ...overrides,
});

describe('debug-inspector build metric lookup', () => {
  const partialLandingMetric = {
    componentName: 'Landing',
    estimatedAssetBytes: 128,
    estimatedCssBytes: 1426,
    estimatedJsBytes: 4096,
    estimatedTotalBytes: 5650,
    files: [
      {
        bytes: 1426,
        file: '/docs-islands/vitepress/assets/Landing.Cvl0mg3D.css',
        type: 'css' as const,
      },
      {
        bytes: 128,
        file: '/docs-islands/vitepress/assets/react.CHdo91hT.svg',
        type: 'asset' as const,
      },
    ],
    modules: [],
  };

  const fullLandingMetric = {
    ...partialLandingMetric,
    modules: [
      {
        bytes: 1426,
        file: '/docs-islands/vitepress/assets/Landing.Cvl0mg3D.css',
        id: '.vitepress/cache/browser-component-entries/Landing.tsx',
        sourceAssetFile:
          '/docs-islands/vitepress/assets/debug-sources/Landing.tsx',
        sourcePath: '.vitepress/cache/browser-component-entries/Landing.tsx',
      },
      {
        bytes: 810,
        file: '/docs-islands/vitepress/assets/Landing.Cvl0mg3D.css',
        id: '/docs/Landing/src/App.css',
        sourceAssetFile: '/docs-islands/vitepress/assets/debug-sources/App.css',
        sourcePath: '/docs/Landing/src/App.css',
      },
      {
        bytes: 128,
        file: '/docs-islands/vitepress/assets/react.CHdo91hT.svg',
        id: 'docs/Landing/src/assets/react.svg',
        sourceAssetFile:
          '/docs-islands/vitepress/assets/debug-sources/react.svg',
        sourcePath: 'docs/Landing/src/assets/react.svg',
      },
    ],
  };

  it('prefers richer component metrics for component-name fallback', () => {
    const partialPageMetafile = createPageMetafile({
      buildMetrics: {
        components: [partialLandingMetric],
        totalEstimatedComponentBytes: partialLandingMetric.estimatedTotalBytes,
      },
    });
    const fullPageMetafile = createPageMetafile({
      buildMetrics: {
        components: [fullLandingMetric],
        totalEstimatedComponentBytes: fullLandingMetric.estimatedTotalBytes,
      },
    });

    const lookup = createMetafileLookup({
      allPageMetafiles: [partialPageMetafile, fullPageMetafile],
      currentPageMetafile: partialPageMetafile,
    });

    expect(
      getBuildMetricForRender(lookup, 'Landing', 'unknown-render-id'),
    ).toBe(fullLandingMetric);
  });

  it('prefers richer component metrics for render-id lookups', () => {
    const partialPageMetafile = createPageMetafile({
      buildMetrics: {
        components: [partialLandingMetric],
        spaSyncEffects: {
          components: [
            {
              blockingCssBytes: 1426,
              blockingCssCount: 1,
              blockingCssFiles: [
                {
                  bytes: 1426,
                  file: '/docs-islands/vitepress/assets/Landing.Cvl0mg3D.css',
                  type: 'css',
                },
              ],
              componentName: 'Landing',
              embeddedHtmlBytes: 0,
              embeddedHtmlPatches: [],
              renderDirectives: ['ssr:only'],
              renderIds: ['landing-render-id'],
              requiresCssLoadingRuntime: false,
            },
          ],
          enabledComponentCount: 1,
          enabledRenderCount: 1,
          totalBlockingCssBytes: 1426,
          totalBlockingCssCount: 1,
          totalEmbeddedHtmlBytes: 0,
          usesCssLoadingRuntime: false,
        },
        totalEstimatedComponentBytes: partialLandingMetric.estimatedTotalBytes,
      },
    });
    const fullPageMetafile = createPageMetafile({
      buildMetrics: {
        components: [fullLandingMetric],
        spaSyncEffects:
          partialPageMetafile.buildMetrics?.spaSyncEffects ?? null,
        totalEstimatedComponentBytes: fullLandingMetric.estimatedTotalBytes,
      },
    });

    const lookup = createMetafileLookup({
      allPageMetafiles: [partialPageMetafile, fullPageMetafile],
      currentPageMetafile: partialPageMetafile,
    });

    expect(
      getBuildMetricForRender(lookup, 'Landing', 'landing-render-id'),
    ).toBe(fullLandingMetric);
  });

  it('prefers an explicitly provided route pathname when resolving current page metafile', () => {
    const enPageMetafile: PageMetafile = {
      buildMetrics: {
        aiReports: [
          {
            generatedAt: '2026-04-03T00:00:00.000Z',
            provider: 'doubao',
            reportFile: '/docs/assets/page-metafiles/ai/pages/core-en.json',
            reportId: 'shared-report-id',
            reportLabel: 'Doubao',
          },
        ],
        components: [],
        spaSyncEffects: {
          components: [],
          enabledComponentCount: 2,
          enabledRenderCount: 2,
          totalBlockingCssBytes: 0,
          totalBlockingCssCount: 0,
          totalEmbeddedHtmlBytes: 0,
          usesCssLoadingRuntime: false,
        },
        totalEstimatedComponentBytes: 0,
      },
      cssBundlePaths: ['/docs/assets/site-devtools.css'],
      loaderScript: '/docs/assets/unified-loader.js',
      modulePreloads: ['/docs/assets/site-devtools.js'],
      pathname: '/guide/how-it-works',
      ssrInjectScript: '',
    };
    const zhPageMetafile: PageMetafile = {
      buildMetrics: {
        aiReports: [
          {
            generatedAt: '2026-04-03T00:00:00.000Z',
            provider: 'doubao',
            reportFile: '/docs/assets/page-metafiles/ai/pages/core-zh.json',
            reportId: 'shared-report-id',
            reportLabel: 'Doubao',
          },
        ],
        components: [],
        spaSyncEffects: {
          components: [],
          enabledComponentCount: 2,
          enabledRenderCount: 2,
          totalBlockingCssBytes: 0,
          totalBlockingCssCount: 0,
          totalEmbeddedHtmlBytes: 0,
          usesCssLoadingRuntime: false,
        },
        totalEstimatedComponentBytes: 0,
      },
      cssBundlePaths: ['/docs/assets/site-devtools.css'],
      loaderScript: '/docs/assets/unified-loader.js',
      modulePreloads: ['/docs/assets/site-devtools.js'],
      pathname: '/zh/guide/how-it-works',
      ssrInjectScript: '',
    };
    const debugWindow = {
      __PAGE_METAFILE__: {
        '/guide/how-it-works': enPageMetafile,
        '/zh/guide/how-it-works': zhPageMetafile,
      },
      __VP_SITE_DATA__: {
        base: '/docs-islands/vitepress/',
        cleanUrls: true,
      },
      location: {
        pathname: '/docs-islands/vitepress/guide/how-it-works',
      },
    } as unknown as DebugWindow;

    expect(
      getCurrentPageCandidates(debugWindow, '/zh/guide/how-it-works')[0],
    ).toBe('/zh/guide/how-it-works');
    expect(
      resolvePageMetafileState(debugWindow, '/zh/guide/how-it-works')
        .currentPageMetafile,
    ).toBe(zhPageMetafile);
  });

  it('ignores query parameters and hashes when resolving the current page metafile', () => {
    const pageMetafile: PageMetafile = {
      buildMetrics: {
        aiReports: [
          {
            generatedAt: '2026-04-04T00:00:00.000Z',
            provider: 'doubao',
            reportFile:
              '/docs/assets/page-metafiles/ai/pages/rendering-strategy.json',
            reportId: 'rendering-strategy-report-id',
            reportLabel: 'Doubao',
          },
        ],
        components: [],
        totalEstimatedComponentBytes: 0,
      },
      cssBundlePaths: [],
      loaderScript: '/docs/assets/unified-loader.js',
      modulePreloads: [],
      pathname: '/blog/rendering-strategy',
      ssrInjectScript: '',
    };
    const debugWindow = {
      __PAGE_METAFILE__: {
        '/blog/rendering-strategy': pageMetafile,
      },
      __VP_SITE_DATA__: {
        base: '/',
        cleanUrls: true,
      },
      location: {
        pathname: '/blog/rendering-strategy',
      },
    } as unknown as DebugWindow;

    expect(
      getCurrentPageCandidates(
        debugWindow,
        '/blog/rendering-strategy?site-devtools=1#overview',
      )[0],
    ).toBe('/blog/rendering-strategy');
    expect(
      resolvePageMetafileState(
        debugWindow,
        '/blog/rendering-strategy?site-devtools=1#overview',
      ).currentPageMetafile,
    ).toBe(pageMetafile);
  });
});
