/**
 * @vitest-environment node
 */
import { REACT_HMR_EVENT_NAMES } from '#shared/constants/react-hmr';
import {
  createEmptyCompilationContainer,
  RenderController,
} from '@docs-islands/core/node/render-controller';
import type { HmrContext, ModuleNode, Plugin, Rollup } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DIRNAME_VARIABLE_INJECTION_PLUGIN_NAME } from '../../constants/plugins/plugin-names';
import type { RenderingFrameworkParserManager } from '../../core/framework-parser';
import type { RenderingModuleResolution } from '../../core/module-resolution';
import { createDirnameVarInjectionPlugin } from '../vite-plugin-dirname-var-injection';
import { createFrameworkComponentHmrPlugin } from '../vite-plugin-framework-component-hmr';
import { createFrameworkMarkdownHmrPlugin } from '../vite-plugin-framework-markdown-hmr';
import { createFrameworkSpaSyncPlugin } from '../vite-plugin-framework-spa-sync';

const mockSuccess = vi.fn();

vi.mock('../../logger', () => ({
  getVitePressGroupLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    success: mockSuccess,
    warn: vi.fn(),
  }),
}));

afterEach(() => {
  vi.restoreAllMocks();
  mockSuccess.mockReset();
});

function getHotUpdateHandler(plugin: Plugin) {
  const hook = plugin.handleHotUpdate;

  if (!hook || typeof hook !== 'object' || !('handler' in hook)) {
    throw new Error(`Plugin ${plugin.name} does not expose handleHotUpdate`);
  }

  return hook.handler;
}

function callTransform(plugin: Plugin, code: string, id: string) {
  const hook = plugin.transform;

  if (!hook) {
    return null;
  }

  return typeof hook === 'function'
    ? hook.call({} as never, code, id)
    : hook.handler.call({} as never, code, id);
}

function callConfigResolved(plugin: Plugin, config: unknown) {
  const hook = plugin.configResolved;

  if (!hook) {
    return;
  }

  if (typeof hook === 'function') {
    hook.call({} as never, config as never);
    return;
  }

  hook.handler.call({} as never, config as never);
}

function callGenerateBundle(
  plugin: Plugin,
  bundle: Record<string, Rollup.OutputAsset | Rollup.OutputChunk>,
) {
  const hook = plugin.generateBundle;

  if (!hook) {
    return;
  }

  if (typeof hook === 'function') {
    hook.call({} as never, {} as never, bundle, false);
    return;
  }

  hook.handler.call({} as never, {} as never, bundle, false);
}

describe('node/plugins', () => {
  it('injects dirname references through the shared Vite transform plugin', () => {
    const plugin = createDirnameVarInjectionPlugin({
      name: DIRNAME_VARIABLE_INJECTION_PLUGIN_NAME,
      variableName: '__DIRNAME__',
    });

    const result = callTransform(
      plugin,
      'export const dir = __DIRNAME__;',
      '/workspace/src/demo.ts',
    );

    expect(result).toBe('export const dir = "/workspace/src";');
  });

  it('reuses the shared markdown HMR plugin to refresh framework import state', async () => {
    const framework = 'react';
    const renderController = new RenderController();
    const markdownModuleId = '/workspace/docs/page.md';
    renderController.setCompilationContainer(framework, markdownModuleId, {
      ...createEmptyCompilationContainer(),
      importsByLocalName: new Map([
        [
          'OldCard',
          {
            identifier: '/workspace/docs/components/OldCard.tsx',
            importedName: 'default',
          },
        ],
      ]),
    });

    const frameworkParserManager = {
      transformMarkdown: vi.fn(async () => {
        renderController.setCompilationContainer(framework, markdownModuleId, {
          ...createEmptyCompilationContainer(),
          importsByLocalName: new Map([
            [
              'NewCard',
              {
                identifier: '/workspace/docs/components/NewCard.tsx',
                importedName: 'default',
              },
            ],
          ]),
        });

        return {
          code: '# transformed',
          map: null,
        };
      }),
    } as unknown as RenderingFrameworkParserManager;
    const resolution = {
      createRuntimeResolver: vi.fn(() => ({})),
    } as unknown as RenderingModuleResolution;

    const plugin = createFrameworkMarkdownHmrPlugin({
      framework,
      frameworkParserManager,
      loggerScopeId: 'test-logger-scope',
      name: 'test:framework-markdown-hmr',
      renderController,
      resolution,
      siteConfig: {
        srcDir: '/workspace/docs',
      } as never,
      wsEvent: REACT_HMR_EVENT_NAMES.markdownPrepare,
    });
    const send = vi.fn();
    const ctx = {
      file: markdownModuleId,
      modules: [],
      read: vi.fn(async () => '# source'),
      server: {
        pluginContainer: {
          resolveId: vi.fn(),
        },
        ws: {
          send,
        },
      },
    } as unknown as HmrContext;

    await getHotUpdateHandler(plugin)(ctx);

    expect(mockSuccess).toHaveBeenCalledWith(
      '/page.md changed, container script content will be re-parsed...',
      expect.objectContaining({
        elapsedTimeMs: expect.any(Number),
      }),
    );
    expect(send).toHaveBeenCalledWith({
      type: 'custom',
      event: REACT_HMR_EVENT_NAMES.markdownPrepare,
      data: {
        updates: {
          NewCard: {
            path: '/components/NewCard.tsx',
            importedName: 'default',
            sourcePath: '/workspace/docs/components/NewCard.tsx',
          },
        },
        missingImports: ['OldCard'],
      },
    });
    await expect(ctx.read()).resolves.toBe('# transformed');
  });

  it('reuses the shared component HMR plugin to broadcast page-scoped updates', async () => {
    const framework = 'react';
    const renderController = new RenderController();
    renderController.setCompilationContainer(
      framework,
      '/workspace/docs/page.md',
      {
        ...createEmptyCompilationContainer(),
        importsByLocalName: new Map([
          [
            'FastCard',
            {
              identifier: '/workspace/docs/components/FastCard.tsx',
              importedName: 'default',
            },
          ],
          [
            'ServerCard',
            {
              identifier: '/workspace/docs/components/ServerCard.tsx',
              importedName: 'default',
            },
          ],
        ]),
        ssrOnlyComponentNames: new Set(['ServerCard']),
      },
    );

    const resolution = {
      createRuntimeResolver: vi.fn(() => ({
        resolveDocumentModuleIdToPagePath: vi
          .fn()
          .mockResolvedValue('/docs/guide/page'),
      })),
    } as unknown as RenderingModuleResolution;

    const plugin = createFrameworkComponentHmrPlugin({
      fastRefreshEvent: 'framework-fast-refresh',
      framework,
      name: 'test:framework-component-hmr',
      renderController,
      resolution,
      siteConfig: {
        base: '/docs/',
      } as never,
      ssrOnlyEvent: 'framework-ssr-only',
    });
    const fastModule = {
      id: '/workspace/docs/components/FastCard.tsx',
      importers: new Set<ModuleNode>(),
    } as ModuleNode;
    const serverOnlyModule = {
      id: '/workspace/docs/components/ServerCard.tsx',
      importers: new Set<ModuleNode>(),
    } as ModuleNode;
    const send = vi.fn();
    const ctx = {
      file: '/workspace/docs/components/FastCard.tsx',
      modules: [fastModule, serverOnlyModule],
      server: {
        pluginContainer: {
          resolveId: vi.fn(),
        },
        ws: {
          send,
        },
      },
    } as unknown as HmrContext;

    const result = await getHotUpdateHandler(plugin)(ctx);

    expect(send).toHaveBeenNthCalledWith(1, {
      type: 'custom',
      event: 'framework-fast-refresh',
      data: {
        updates: {
          '/guide/page': [
            {
              componentName: 'FastCard',
              importedName: 'FastCard',
              sourcePath: '/workspace/docs/components/FastCard.tsx',
            },
          ],
        },
      },
    });
    expect(send).toHaveBeenNthCalledWith(2, {
      type: 'custom',
      event: 'framework-ssr-only',
      data: {
        updates: {
          '/guide/page': [
            {
              componentName: 'ServerCard',
              importedName: 'ServerCard',
              sourcePath: '/workspace/docs/components/ServerCard.tsx',
            },
          ],
        },
      },
    });
    expect(result).toEqual([fastModule]);
  });

  it('captures page chunks through the shared spa-sync plugin', () => {
    const renderController = new RenderController();
    const plugin = createFrameworkSpaSyncPlugin({
      framework: 'react',
      isTrackedChunk(
        name,
        chunk,
      ): chunk is Rollup.OutputChunk & { facadeModuleId: string } {
        return name === 'assets/page.js' && chunk.type === 'chunk';
      },
      name: 'test:framework-spa-sync',
      renderController,
    });

    callConfigResolved(plugin, {
      build: {
        ssr: false,
      },
    });
    callGenerateBundle(plugin, {
      'assets/page.js': {
        type: 'chunk',
        facadeModuleId: '/workspace/docs/page.md',
        code: 'export {};',
      } as Rollup.OutputChunk & { facadeModuleId: string },
    });

    expect(
      renderController.getClientChunkByFacadeModuleId(
        'react',
        '/workspace/docs/page.md',
      ),
    ).toEqual({
      outputPath: 'assets/page.js',
      code: 'export {};',
    });
  });
});
