/**
 * @vitest-environment node
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { normalizePath, type PluginOption } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { claude, doubao } from '../../../../shared/site-devtools-models';
import { REACT_DEPENDENCY_BOOTSTRAP_PLUGIN_NAME } from '../../../constants/adapters/react/plugin-names';
import {
  FRAMEWORK_MARKDOWN_TRANSFORM_PLUGIN_NAME,
  INLINE_PAGE_RESOLUTION_PLUGIN_NAME,
  SITE_DEVTOOLS_OPTIONAL_DEPENDENCY_BOOTSTRAP_PLUGIN_NAME,
  SITE_DEVTOOLS_SOURCE_PLUGIN_NAME,
} from '../../../constants/core/plugin-names';

const mockError = vi.fn();
const mockWarn = vi.fn();

vi.mock('@vitejs/plugin-react-swc', () => ({
  default: vi.fn(() => ({
    name: 'mock-react-swc',
  })),
}));

vi.mock('#shared/logger', () => ({
  createLogger: () => ({
    getLoggerByGroup: () => ({
      error: mockError,
      warn: mockWarn,
      info: vi.fn(),
      success: vi.fn(),
      debug: vi.fn(),
    }),
  }),
}));

vi.mock('../../../logger', () => ({
  getVitePressGroupLogger: () => ({
    debug: vi.fn(),
    error: mockError,
    info: vi.fn(),
    success: vi.fn(),
    warn: mockWarn,
  }),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.doUnmock('@docs-islands/utils/general');
  delete (globalThis as { VITEPRESS_CONFIG?: unknown }).VITEPRESS_CONFIG;
  vi.resetModules();
});

function findPluginByName(
  plugins: PluginOption[] | undefined,
  name: string,
): any {
  if (!plugins) return null;
  for (const plugin of plugins) {
    if (Array.isArray(plugin)) {
      const found = findPluginByName(plugin, name);
      if (found) return found;
      continue;
    }
    if (plugin && typeof plugin === 'object' && 'name' in plugin) {
      if ((plugin as { name?: string }).name === name) {
        return plugin;
      }
    }
  }
  return null;
}

async function runReactDependencyBootstrapPlugin(
  vitepressConfig: { vite?: { plugins?: PluginOption[] } },
  root: string,
): Promise<void> {
  const plugin = findPluginByName(
    vitepressConfig.vite?.plugins,
    REACT_DEPENDENCY_BOOTSTRAP_PLUGIN_NAME,
  );

  expect(plugin).toBeTruthy();
  expect(plugin.config).toBeTypeOf('function');

  await plugin.config({
    root,
  });
}

async function runSiteDevToolsBootstrapPlugin(
  vitepressConfig: { vite?: { plugins?: PluginOption[] } },
  root: string,
): Promise<void> {
  const plugin = findPluginByName(
    vitepressConfig.vite?.plugins,
    SITE_DEVTOOLS_OPTIONAL_DEPENDENCY_BOOTSTRAP_PLUGIN_NAME,
  );

  expect(plugin).toBeTruthy();
  expect(plugin.config).toBeTypeOf('function');

  await plugin.config({
    root,
  });
}

function writeReactSwcPluginStub(root: string): void {
  const packageDir = path.join(
    root,
    'node_modules',
    '@vitejs',
    'plugin-react-swc',
  );
  fs.mkdirSync(packageDir, { recursive: true });
  fs.writeFileSync(
    path.join(packageDir, 'package.json'),
    JSON.stringify({
      exports: './index.js',
      name: '@vitejs/plugin-react-swc',
      type: 'module',
    }),
    'utf8',
  );
  fs.writeFileSync(
    path.join(packageDir, 'index.js'),
    'export default function reactPlugin() { return { name: "mock-react-swc" }; }\n',
    'utf8',
  );
}

function normalizeAliasReplacements(
  aliasEntries: { find: string; replacement: string }[] | undefined,
): { find: string; replacement: string }[] {
  return (aliasEntries ?? []).map((aliasEntry) => ({
    ...aliasEntry,
    replacement: normalizePath(aliasEntry.replacement),
  }));
}

async function applyReactDocsIslands(
  vitepressConfig: Record<string, any>,
  options?: {
    logging?: Record<string, unknown>;
    siteDevtools?: Record<string, unknown>;
  },
): Promise<void> {
  const { default: createDocsIslands } = await import(
    '../../../core/orchestrator'
  );
  const { react } = await import('..');

  createDocsIslands({
    adapters: [react()],
    ...options,
  }).apply(vitepressConfig as any);
}

describe('createDocsIslands + react adapter', () => {
  it('throws a clear error when React peer dependencies are missing', async () => {
    vi.doMock('@docs-islands/utils/general', async (importOriginal) => {
      const actual =
        await importOriginal<typeof import('@docs-islands/utils/general')>();

      return {
        ...actual,
        pkgExists: vi.fn((moduleName: string) => moduleName !== 'react-dom'),
      };
    });

    const vitepressRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'vitepress-react-missing-peer-'),
    );

    try {
      fs.writeFileSync(path.join(vitepressRoot, 'package.json'), '{}', 'utf8');

      const vitepressConfig: any = {};
      await applyReactDocsIslands(vitepressConfig);

      await expect(
        runReactDependencyBootstrapPlugin(vitepressConfig, vitepressRoot),
      ).rejects.toThrowError(
        'React rendering integration requires the following peer dependencies to be installed in the consumer project: react, react-dom, @vitejs/plugin-react-swc. Missing: react-dom.',
      );
    } finally {
      fs.rmSync(vitepressRoot, {
        force: true,
        recursive: true,
      });
    }
  });

  it('installs site-devtools fallback aliases when optional enhancement dependencies are missing', async () => {
    vi.doMock('@docs-islands/utils/general', async (importOriginal) => {
      const actual =
        await importOriginal<typeof import('@docs-islands/utils/general')>();

      return {
        ...actual,
        pkgExists: vi.fn((moduleName: string) => {
          if (['prettier', 'vue-json-pretty', 'shiki'].includes(moduleName)) {
            return false;
          }

          return true;
        }),
      };
    });

    const vitepressConfig: any = {};

    await applyReactDocsIslands(vitepressConfig, {
      siteDevtools: {},
    });
    const vitepressRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'vitepress-react-site-devtools-'),
    );

    try {
      fs.writeFileSync(path.join(vitepressRoot, 'package.json'), '{}', 'utf8');
      writeReactSwcPluginStub(vitepressRoot);
      await runSiteDevToolsBootstrapPlugin(vitepressConfig, vitepressRoot);

      const aliasEntries = vitepressConfig.vite?.resolve?.alias as
        | { find: string; replacement: string }[]
        | undefined;

      expect(normalizeAliasReplacements(aliasEntries)).toEqual(
        expect.arrayContaining([
          {
            find: 'vue-json-pretty',
            replacement: expect.stringMatching(
              /optional-deps\/vue-json-pretty\.ts$/,
            ),
          },
          {
            find: 'vue-json-pretty/lib/styles.css',
            replacement: expect.stringMatching(/optional-deps\/empty\.css$/),
          },
          {
            find: 'prettier/standalone',
            replacement: expect.stringMatching(
              /optional-deps\/prettier-standalone\.ts$/,
            ),
          },
          {
            find: 'prettier/plugins/babel',
            replacement: expect.stringMatching(
              /optional-deps\/prettier-plugin\.ts$/,
            ),
          },
          {
            find: 'prettier/plugins/estree',
            replacement: expect.stringMatching(
              /optional-deps\/prettier-plugin\.ts$/,
            ),
          },
          {
            find: 'prettier/plugins/html',
            replacement: expect.stringMatching(
              /optional-deps\/prettier-plugin\.ts$/,
            ),
          },
          {
            find: 'prettier/plugins/markdown',
            replacement: expect.stringMatching(
              /optional-deps\/prettier-plugin\.ts$/,
            ),
          },
          {
            find: 'prettier/plugins/postcss',
            replacement: expect.stringMatching(
              /optional-deps\/prettier-plugin\.ts$/,
            ),
          },
          {
            find: 'prettier/plugins/yaml',
            replacement: expect.stringMatching(
              /optional-deps\/prettier-plugin\.ts$/,
            ),
          },
          {
            find: 'shiki',
            replacement: expect.stringMatching(/optional-deps\/shiki\.ts$/),
          },
        ]),
      );
    } finally {
      fs.rmSync(vitepressRoot, {
        force: true,
        recursive: true,
      });
    }
  });

  it('uses the VitePress root as the dependency search base when it is available', async () => {
    vi.doMock('@docs-islands/utils/general', async (importOriginal) => {
      const actual =
        await importOriginal<typeof import('@docs-islands/utils/general')>();

      return {
        ...actual,
        pkgExists: vi.fn(() => true),
      };
    });
    const { pkgExists } = await import('@docs-islands/utils/general');
    const workspaceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'vitepress-react-root-search-'),
    );
    const vitepressRoot = path.join(workspaceRoot, 'docs');
    const srcDir = path.join(vitepressRoot, 'src');

    try {
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(path.join(vitepressRoot, 'package.json'), '{}', 'utf8');
      fs.writeFileSync(path.join(srcDir, 'package.json'), '{}', 'utf8');
      writeReactSwcPluginStub(vitepressRoot);

      (
        globalThis as { VITEPRESS_CONFIG?: { root?: string } }
      ).VITEPRESS_CONFIG = {
        root: vitepressRoot,
      };

      const vitepressConfig: any = {};
      await applyReactDocsIslands(vitepressConfig);
      await runReactDependencyBootstrapPlugin(vitepressConfig, srcDir);
      const resolvedVitepressRoot = fs.realpathSync(vitepressRoot);
      const resolvedSrcDir = fs.realpathSync(srcDir);
      const expectedResolutionBase = normalizePath(
        path.join(resolvedVitepressRoot, 'package.json'),
      );
      const unexpectedResolutionBase = normalizePath(
        path.join(resolvedSrcDir, 'package.json'),
      );

      expect(pkgExists).toHaveBeenCalledWith('react', expectedResolutionBase);
      expect(pkgExists).not.toHaveBeenCalledWith(
        'react',
        unexpectedResolutionBase,
      );
    } finally {
      fs.rmSync(workspaceRoot, {
        force: true,
        recursive: true,
      });
    }
  });

  it('merges root siteDevtools options into the VitePress config', async () => {
    const claudeUS = claude.provider({
      apiKey: 'claude-key',
    });
    const doubaoCN = doubao.provider({
      apiKey: 'test-key',
    });
    const claudeSonnet = claudeUS.model({
      label: 'Claude Sonnet',
      maxTokens: 4096,
      model: 'claude-sonnet-4-20250514',
      temperature: 0.2,
    });
    const doubaoPro = doubaoCN.model({
      label: 'Doubao Pro',
      maxTokens: 4096,
      model: 'doubao-seed-2-0-pro-260215',
      temperature: 0.1,
      thinking: true,
    });
    const vitepressConfig: any = {
      siteDevtools: {
        analysis: {
          providers: [],
        },
      },
    };

    await applyReactDocsIslands(vitepressConfig, {
      siteDevtools: {
        analysis: {
          providers: [claudeUS, doubaoCN],
          buildReports: {
            models: [claudeSonnet, doubaoPro],
          },
        },
      },
    });

    expect(vitepressConfig.siteDevtools.analysis?.providers?.[0]).toBe(
      claudeUS,
    );
    expect(vitepressConfig.siteDevtools.analysis?.providers?.[1]).toBe(
      doubaoCN,
    );
    expect(vitepressConfig.siteDevtools.analysis?.buildReports?.models).toEqual(
      [claudeSonnet, doubaoPro],
    );
    expect(vitepressConfig.vite?.worker?.format).toBe('es');
    expect(
      findPluginByName(
        vitepressConfig.vite?.plugins,
        INLINE_PAGE_RESOLUTION_PLUGIN_NAME,
      ),
    ).toBeTruthy();
    expect(
      findPluginByName(
        vitepressConfig.vite?.plugins,
        FRAMEWORK_MARKDOWN_TRANSFORM_PLUGIN_NAME,
      ),
    ).toBeTruthy();
  });

  it('does not install the siteDevtools sub-plugin when siteDevtools config is absent', async () => {
    const vitepressConfig: any = {};

    await applyReactDocsIslands(vitepressConfig);

    expect(vitepressConfig.vite?.worker?.format).toBeUndefined();
    expect(
      findPluginByName(
        vitepressConfig.vite?.plugins,
        SITE_DEVTOOLS_SOURCE_PLUGIN_NAME,
      ),
    ).toBeNull();
  });

  it('throws when multiple <script lang="react"> blocks exist in one html_block', async () => {
    const vitepressConfig: any = {};
    await applyReactDocsIslands(vitepressConfig);

    const plugin = findPluginByName(
      vitepressConfig.vite?.plugins,
      FRAMEWORK_MARKDOWN_TRANSFORM_PLUGIN_NAME,
    );
    expect(plugin).toBeTruthy();
    expect(plugin.transform?.handler).toBeTypeOf('function');

    const markdownWithInlineDoubleScripts = `<script lang="react">import A from './A'</script><script lang="react">import B from './B'</script>
<A />`;

    mockError.mockClear();

    await expect(
      plugin.transform.handler.call(
        {
          resolve: vi.fn(),
        },
        markdownWithInlineDoubleScripts,
        '/virtual/docs/double-script.md',
      ),
    ).rejects.toThrow(
      'Failed to parse /virtual/docs/double-script.md: framework "react" can contain only one <script lang="react"> element per file.',
    );

    expect(mockError).toHaveBeenCalledWith(
      'Failed to parse /virtual/docs/double-script.md: framework "react" can contain only one <script lang="react"> element per file.',
      expect.objectContaining({
        elapsedTimeMs: expect.any(Number),
      }),
    );
  });

  it('does not intercept __docs-islands/debug-ai in dev and still serves __docs-islands/debug-source', async () => {
    const vitepressConfig: any = {
      base: '/docs/',
    };

    await applyReactDocsIslands(vitepressConfig, {
      siteDevtools: {},
    });

    const plugin = findPluginByName(
      vitepressConfig.vite?.plugins,
      SITE_DEVTOOLS_SOURCE_PLUGIN_NAME,
    );
    expect(plugin).toBeTruthy();
    expect(plugin.configureServer).toBeTypeOf('function');

    let middleware:
      | ((
          req: { url?: string },
          res: {
            end: (chunk?: string | Buffer) => void;
            setHeader: (name: string, value: string) => void;
            statusCode: number;
          },
          next: () => void,
        ) => void)
      | undefined;

    plugin.configureServer({
      middlewares: {
        use(handler: typeof middleware) {
          middleware = handler;
        },
      },
      moduleGraph: {
        getModuleByUrl: vi.fn(),
      },
      pluginContainer: {
        resolveId: vi.fn(),
      },
      ssrLoadModule: vi.fn(),
      ws: {
        on: vi.fn(),
      },
    });

    expect(middleware).toBeTypeOf('function');

    const nextForAi = vi.fn();
    middleware?.(
      {
        url: '/docs/__docs-islands/debug-ai',
      },
      {
        end: vi.fn(),
        setHeader: vi.fn(),
        statusCode: 200,
      },
      nextForAi,
    );

    expect(nextForAi).toHaveBeenCalledTimes(1);

    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'vitepress-debug-source-'),
    );
    const tempFile = path.join(tempDir, 'debug-source.txt');
    const tempContent = 'debug source content';
    fs.writeFileSync(tempFile, tempContent, 'utf8');

    try {
      let responseBody = '';
      const setHeader = vi.fn();
      const nextForSource = vi.fn();
      const response = {
        end(chunk?: string | Buffer) {
          responseBody = chunk ? chunk.toString() : '';
        },
        setHeader,
        statusCode: 0,
      };

      middleware?.(
        {
          url: `/docs/__docs-islands/debug-source?path=${encodeURIComponent(tempFile)}`,
        },
        response,
        nextForSource,
      );

      expect(nextForSource).not.toHaveBeenCalled();
      expect(response.statusCode).toBe(200);
      expect(setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'text/plain; charset=utf-8',
      );
      expect(responseBody).toBe(tempContent);
    } finally {
      fs.rmSync(tempDir, {
        force: true,
        recursive: true,
      });
    }
  });
});
