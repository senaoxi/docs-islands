/**
 * @vitest-environment node
 */
import {
  resetScopedLoggerConfig,
  setResolvedScopedLoggerConfig as setLoggerConfigForScope,
} from '@docs-islands/logger/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRenderingModuleResolution } from '../module-resolution';

const TEST_LOGGER_SCOPE_ID = 'module-resolution-test-scope';
const getTestLoggerScopeId = () => TEST_LOGGER_SCOPE_ID;

vi.mock('#shared/logger', () => ({
  createLogger: () => ({
    getLoggerByGroup: () => ({
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      success: vi.fn(),
      warn: vi.fn(),
    }),
  }),
}));

afterEach(() => {
  resetScopedLoggerConfig(TEST_LOGGER_SCOPE_ID);
  vi.restoreAllMocks();
});

describe('rendering module resolution', () => {
  it('resolves routes and document module ids through the shared static resolver', () => {
    const resolution = createRenderingModuleResolution(getTestLoggerScopeId);
    const pageResolver = resolution.createStaticResolver({
      srcDir: 'packages/vitepress/docs',
      site: {
        base: '/docs-islands/vitepress/',
        cleanUrls: true,
      },
      pages: ['en/core-concepts.md', 'zh/core-concepts.md'],
      rewrites: {
        inv: {
          'core-concepts.md': 'en/core-concepts.md',
        },
        map: {
          'en/core-concepts.md': 'core-concepts.md',
        },
      },
    } as any);

    const markdownModuleId = pageResolver.resolvePagePathToDocumentModuleId(
      '/docs-islands/vitepress/core-concepts',
    );

    expect(markdownModuleId).toMatch(
      /packages\/vitepress\/docs\/en\/core-concepts\.md$/,
    );
    expect(
      pageResolver.resolveDocumentModuleIdToPagePath(markdownModuleId!),
    ).toBe('/docs-islands/vitepress/core-concepts');
  });

  it('refreshes cached route mappings when the shared vite plugin receives config updates', async () => {
    setLoggerConfigForScope(TEST_LOGGER_SCOPE_ID, undefined);

    const resolution = createRenderingModuleResolution(getTestLoggerScopeId);
    const plugin = resolution.createVitePlugin();
    const initialConfig = {
      srcDir: 'packages/vitepress/docs',
      site: {
        base: '/docs-islands/vitepress/',
        cleanUrls: true,
      },
      pages: ['en/core-concepts.md', 'zh/core-concepts.md'],
      rewrites: {
        inv: {
          'core-concepts.md': 'en/core-concepts.md',
        },
        map: {
          'en/core-concepts.md': 'core-concepts.md',
        },
      },
    };

    plugin.configResolved?.({
      vitepress: initialConfig,
    } as any);

    const resolveHandler = (plugin.resolveId as any).handler;
    const initialResolvedId = resolveHandler(
      resolution.createInlinePageRequest(
        '/docs-islands/vitepress/core-concepts',
      ),
    );

    expect(initialResolvedId).toMatch(
      /packages\/vitepress\/docs\/en\/core-concepts\.md$/,
    );

    await plugin.handleHotUpdate?.({
      server: {
        config: {
          vitepress: {
            ...initialConfig,
            rewrites: {
              inv: {
                'core-concepts.md': 'zh/core-concepts.md',
              },
              map: {
                'zh/core-concepts.md': 'core-concepts.md',
              },
            },
          },
        },
      },
    } as any);

    const refreshedResolvedId = resolveHandler(
      resolution.createInlinePageRequest(
        '/docs-islands/vitepress/core-concepts',
      ),
    );

    expect(refreshedResolvedId).toMatch(
      /packages\/vitepress\/docs\/zh\/core-concepts\.md$/,
    );
  });
});
