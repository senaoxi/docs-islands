import { resetScopedLoggerConfig, setScopedLoggerConfig } from 'logaria/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createRenderingModuleResolution,
  type RenderingModuleResolution,
} from '../module-resolution';

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

const callResolveId = (
  plugin: ReturnType<RenderingModuleResolution['createVitePlugin']>,
  id: string,
) => {
  const hook = plugin.resolveId;

  if (!hook) {
    return null;
  }

  return typeof hook === 'function'
    ? hook.call({} as never, id, undefined, {
        attributes: {},
        custom: {},
        isEntry: false,
      })
    : hook.handler.call({} as never, id, undefined, {
        attributes: {},
        custom: {},
        isEntry: false,
      });
};

const callConfigResolved = (
  plugin: ReturnType<RenderingModuleResolution['createVitePlugin']>,
  config: unknown,
) => {
  const hook = plugin.configResolved;

  if (!hook) {
    return;
  }

  if (typeof hook === 'function') {
    hook.call({} as never, config as never);
    return;
  }

  hook.handler.call({} as never, config as never);
};

const callHandleHotUpdate = async (
  plugin: ReturnType<RenderingModuleResolution['createVitePlugin']>,
  context: unknown,
) => {
  const hook = plugin.handleHotUpdate;

  if (!hook) {
    return;
  }

  if (typeof hook === 'function') {
    hook.call({} as never, context as never);
  } else {
    hook.handler.call({} as never, context as never);
  }
};

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
    setScopedLoggerConfig(TEST_LOGGER_SCOPE_ID, {});

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

    callConfigResolved(plugin, {
      vitepress: initialConfig,
    });

    const initialResolvedId = callResolveId(
      plugin,
      resolution.createInlinePageRequest(
        '/docs-islands/vitepress/core-concepts',
      ),
    );

    expect(initialResolvedId).toMatch(
      /packages\/vitepress\/docs\/en\/core-concepts\.md$/,
    );

    await callHandleHotUpdate(plugin, {
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
    });

    const refreshedResolvedId = callResolveId(
      plugin,
      resolution.createInlinePageRequest(
        '/docs-islands/vitepress/core-concepts',
      ),
    );

    expect(refreshedResolvedId).toMatch(
      /packages\/vitepress\/docs\/zh\/core-concepts\.md$/,
    );
  });
});
