/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PAGE_METAFILE_META_NAMES } from '../../shared/constants/page-metafile';
import { RENDER_STRATEGY_CONSTANTS } from '../../shared/constants/render-strategy';
import type { DocsInjectComponent } from '../../types/client';
import { DocsComponentManager } from '../docs-component-manager';

vi.mock('@docs-islands/utils/logger', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@docs-islands/utils/logger')>();

  return {
    ...actual,
    createLogger: () => ({
      getLoggerByGroup: () => ({
        debug: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        success: vi.fn(),
        warn: vi.fn(),
      }),
    }),
    formatErrorMessage: (error: unknown) =>
      error instanceof Error ? error.message : String(error),
  };
});

type TestComponent = () => string;
type TestRuntimeWindow = Window & {
  [RENDER_STRATEGY_CONSTANTS.componentManager]?: unknown;
  [RENDER_STRATEGY_CONSTANTS.injectComponent]?: DocsInjectComponent<TestComponent>;
  [RENDER_STRATEGY_CONSTANTS.pageMetafile]?: Record<string, unknown>;
};

const getTestRuntimeWindow = (): TestRuntimeWindow =>
  globalThis as unknown as TestRuntimeWindow;

describe('DocsComponentManager', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    const testWindow = getTestRuntimeWindow();

    testWindow[RENDER_STRATEGY_CONSTANTS.componentManager] = undefined;
    testWindow[RENDER_STRATEGY_CONSTANTS.injectComponent] = {};
    testWindow[RENDER_STRATEGY_CONSTANTS.pageMetafile] = {};
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    const testWindow = getTestRuntimeWindow();

    testWindow[RENDER_STRATEGY_CONSTANTS.componentManager] = undefined;
    testWindow[RENDER_STRATEGY_CONSTANTS.injectComponent] = {};
    testWindow[RENDER_STRATEGY_CONSTANTS.pageMetafile] = {};
  });

  it('loads the page metafile index and current page metafile into the shared cache', async () => {
    const pageMetafileEvents: {
      buildId?: string | null;
      kind: string;
      pageCount: number;
      pageId?: string;
    }[] = [];
    const fetchMock = vi.fn(async (input: string) => {
      if (input === '/docs/assets/page-metafiles/manifest.11111111.json') {
        return {
          ok: true,
          json: async () => ({
            buildId: 'cafefeed',
            pages: {
              '/guide/how-it-works': {
                file: '/docs/assets/page-metafiles/pages/guide/how-it-works.22222222.json',
                loaderScript: '/docs/assets/unified-loader.core.js',
                ssrInjectScript: '/docs/assets/ssr.core.js',
              },
              '/zh/': {
                file: '/docs/assets/page-metafiles/pages/zh/index.33333333.json',
                loaderScript: '/docs/assets/unified-loader.zh.js',
                ssrInjectScript: '',
              },
            },
            schemaVersion: 1,
          }),
        };
      }

      if (
        input ===
        '/docs/assets/page-metafiles/pages/guide/how-it-works.22222222.json'
      ) {
        return {
          ok: true,
          json: async () => ({
            buildId: 'cafefeed',
            buildMetrics: {
              components: [],
              framework: 'test',
              loader: null,
              spaSyncEffects: null,
              ssrInject: null,
              totalEstimatedComponentBytes: 0,
            },
            cssBundlePaths: ['/docs/assets/core.css'],
            loaderScript: '/docs/assets/unified-loader.core.js',
            modulePreloads: ['/docs/assets/core.module.js'],
            pathname: '/guide/how-it-works',
            schemaVersion: 1,
            ssrInjectScript: '/docs/assets/ssr.core.js',
          }),
        };
      }

      throw new Error(`Unexpected request: ${input}`);
    });

    vi.stubGlobal('fetch', fetchMock);
    document.head.innerHTML = `
      <meta name="${PAGE_METAFILE_META_NAMES.index}" content="/docs/assets/page-metafiles/manifest.11111111.json">
      <meta name="${PAGE_METAFILE_META_NAMES.current}" content="/docs/assets/page-metafiles/pages/guide/how-it-works.22222222.json">
    `;

    const manager = new DocsComponentManager<TestComponent>({
      ensureFrameworkRuntime: async () => true,
      framework: 'test',
      getCurrentPageId: () => '/guide/how-it-works',
      hooks: {
        onPageMetafileEvent: (detail) => {
          pageMetafileEvents.push({
            buildId: detail.buildId,
            kind: detail.kind,
            pageCount: detail.pageCount,
            pageId: detail.pageId,
          });
        },
      },
      isFrameworkRuntimeAvailable: () => true,
    });

    await manager.loadPageMetafileIndex();
    await manager.ensurePageMetafile('/guide/how-it-works', {
      preferInjectedCurrentMeta: true,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/docs/assets/page-metafiles/manifest.11111111.json',
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/docs/assets/page-metafiles/pages/guide/how-it-works.22222222.json',
    );
    expect(manager.getPageComponentInfo('/guide/how-it-works')).toMatchObject({
      buildId: 'cafefeed',
      loaderScript: '/docs/assets/unified-loader.core.js',
      pathname: '/guide/how-it-works',
    });
    expect(manager.getAllInitialModulePreloadScripts().toSorted()).toEqual([
      '/docs/assets/ssr.core.js',
      '/docs/assets/unified-loader.core.js',
      '/docs/assets/unified-loader.zh.js',
    ]);
    expect(
      getTestRuntimeWindow()[RENDER_STRATEGY_CONSTANTS.pageMetafile],
    ).toMatchObject({
      '/guide/how-it-works': expect.objectContaining({
        loaderScript: '/docs/assets/unified-loader.core.js',
      }),
    });
    expect(pageMetafileEvents).toContainEqual(
      expect.objectContaining({
        buildId: 'cafefeed',
        kind: 'page-loaded',
        pageCount: 1,
        pageId: '/guide/how-it-works',
      }),
    );
  });

  it('resolves runtime and component subscriptions through the shared window registry', async () => {
    const manager = new DocsComponentManager<TestComponent>({
      ensureFrameworkRuntime: async () => true,
      framework: 'test',
      getCurrentPageId: () => '/guide/how-it-works',
      isFrameworkRuntimeAvailable: () => true,
    });

    const runtimeReady = manager.subscribeRuntimeReady(500);

    await manager.initialize({
      mode: 'dev',
    });

    await expect(runtimeReady).resolves.toBe(true);

    const component = vi.fn(() => 'HeroCard');
    getTestRuntimeWindow()[RENDER_STRATEGY_CONSTANTS.injectComponent] = {
      '/guide/how-it-works': {
        HeroCard: {
          component,
        },
      },
    };

    const componentReady = manager.subscribeComponent(
      '/guide/how-it-works',
      'HeroCard',
      500,
    );
    manager.notifyComponentLoaded('/guide/how-it-works', 'HeroCard');

    await expect(componentReady).resolves.toBe(true);
    expect(manager.getComponent('/guide/how-it-works', 'HeroCard')).toBe(
      component,
    );
  });
});
