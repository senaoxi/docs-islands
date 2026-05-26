import type {
  ComponentBundleInfo,
  UsedSnippetContainerType,
} from '#dep-types/component';
import type { ConfigType } from '#dep-types/utils';
import {
  resetScopedLoggerConfig,
  setScopedLoggerConfig as setLoggerConfigForScope,
} from 'logaria/core';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'pathe';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { reactAdapter } from '../../adapters/react/adapter';
import { resolveConfig } from '../../core/resolve-config';
import { setVitePressLoggerTreeShakingEnabled } from '../../core/vite-plugin-logger-tree-shaking';
import type { UIFrameworkBuildAdapter } from '../adapter';
import { bundleUIComponentsForBrowser } from '../bundleUIComponentsForBrowser';

const TEST_LOGGER_SCOPE_ID = 'browser-bundle-logger-tree-shaking-scope';

const collectJavaScriptFiles = (directory: string): string[] => {
  if (!fs.existsSync(directory)) {
    return [];
  }

  const files: string[] = [];

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...collectJavaScriptFiles(entryPath));
      continue;
    }

    if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) {
      files.push(entryPath);
    }
  }

  return files;
};

describe('bundleUIComponentsForBrowser', () => {
  const defaultConfig = resolveConfig({});
  const resolveMockConfig = (config: ConfigType) => {
    const root = dirname(fileURLToPath(import.meta.url));
    const cacheDir = join(root, 'dist/.cache');
    const outDir = join(root, 'dist/multiple-components-for-browser-outputs');
    const sourceDir = join(root, 'source');
    const publicDir = join(root, 'source/public');

    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }
    if (!fs.existsSync(sourceDir)) {
      fs.mkdirSync(sourceDir, { recursive: true });
    }
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }

    return { ...config, root, cacheDir, outDir, srcDir: sourceDir, publicDir };
  };

  const config = resolveMockConfig(defaultConfig);
  const reactComponentSource = join(
    config.srcDir,
    '/rendering-strategy-comps/react',
  );
  const multiExportComponentPath = join(
    reactComponentSource,
    'MultiExportComponents.tsx',
  );
  const loggerProbeComponentPath = join(
    reactComponentSource,
    'LoggerProbe.tsx',
  );

  const clientComponents: ComponentBundleInfo[] = [
    {
      componentName: 'Landing',
      componentPath: join(reactComponentSource, 'Landing.tsx'),
      importReference: {
        importedName: 'Landing',
        identifier: join(reactComponentSource, 'Landing.tsx'),
      },
      pendingRenderIds: new Set(['8b05459e']),
      renderDirectives: new Set(['client:load']),
    },
    {
      componentName: 'ReactComp2',
      componentPath: join(reactComponentSource, 'ReactComp2.tsx'),
      importReference: {
        importedName: 'ReactComp2',
        identifier: join(reactComponentSource, 'ReactComp2.tsx'),
      },
      pendingRenderIds: new Set(['ac62f9f7']),
      renderDirectives: new Set(['ssr:only']),
    },
    {
      componentName: 'ReactComp3',
      componentPath: join(reactComponentSource, 'ReactComp3.tsx'),
      importReference: {
        importedName: 'default',
        identifier: join(reactComponentSource, 'ReactComp3.tsx'),
      },
      pendingRenderIds: new Set(['af2c1304']),
      renderDirectives: new Set(['client:load']),
    },
    {
      componentName: 'ReactComp4',
      componentPath: join(reactComponentSource, 'ReactComp4.tsx'),
      importReference: {
        importedName: 'default',
        identifier: join(reactComponentSource, 'ReactComp4.tsx'),
      },
      pendingRenderIds: new Set(['59f81efc']),
      renderDirectives: new Set(['client:visible']),
    },
  ];
  const usedSnippetContainer = new Map<string, UsedSnippetContainerType>([
    [
      '8b05459e',
      {
        props: new Map(),
        renderId: '8b05459e',
        renderDirective: 'client:load',
        renderComponent: 'Landing',
        ssrHtml: '...',
        useSpaSyncRender: true,
      },
    ],
    [
      'ac62f9f7',
      {
        props: new Map([['render-strategy', 'ssr:only']]),
        renderId: 'ac62f9f7',
        renderDirective: 'ssr:only',
        renderComponent: 'ReactComp2',
        ssrHtml: '...',
        useSpaSyncRender: true,
      },
    ],
    [
      'af2c1304',
      {
        props: new Map([['render-strategy', 'client:load']]),
        renderId: 'af2c1304',
        renderDirective: 'client:load',
        renderComponent: 'ReactComp3',
        ssrHtml: '...',
        useSpaSyncRender: true,
      },
    ],
    [
      '59f81efc',
      {
        props: new Map([['render-strategy', 'client:visible']]),
        renderId: '59f81efc',
        renderDirective: 'client:visible',
        renderComponent: 'ReactComp4',
        ssrHtml:
          '<div class="react-comp4-demo"><strong>4: Rendering Strategy: client:visible</strong><ol><li><strong>Component Name:</strong> <span>ReactComp4</span></li><li><strong>Page Title:</strong> <span>Rendering Strategy</span></li><li><button style="padding:5px;border-radius:8px;font-size:14px;margin-right:8px;background-color:#56a8ab;color:#9ee2d3;border:none" type="button">Click Me!</button><strong>Pre-rendering Client Visible Hydration Mode, React Instance Count:</strong> <span>0</span></li></ol></div>',
        useSpaSyncRender: false,
      },
    ],
  ]);

  afterAll(() => {
    if (fs.existsSync(config.outDir)) {
      fs.rmSync(config.outDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    resetScopedLoggerConfig(TEST_LOGGER_SCOPE_ID);
    setVitePressLoggerTreeShakingEnabled(TEST_LOGGER_SCOPE_ID, false);
  });

  beforeEach(() => {
    setLoggerConfigForScope(TEST_LOGGER_SCOPE_ID, {});
  });

  it('should correctly bundle browser assets and validate their contents', async () => {
    const {
      buildMetrics,
      loaderScript,
      modulePreloads,
      cssBundlePaths,
      ssrInjectScript,
    } = await bundleUIComponentsForBrowser(
      config,
      clientComponents,
      usedSnippetContainer,
      reactAdapter,
      TEST_LOGGER_SCOPE_ID,
    );

    const allBundlePaths = [
      loaderScript,
      ...modulePreloads,
      ...cssBundlePaths,
      ssrInjectScript,
    ].filter(Boolean);

    expect(
      allBundlePaths.length,
      'Should generate some bundle files',
    ).toBeGreaterThan(0);

    for (const bundlePath of allBundlePaths) {
      const fullPath = join(config.outDir, bundlePath);
      expect(
        fs.existsSync(fullPath),
        `Asset file should exist at: ${fullPath}`,
      ).toBe(true);
    }

    expect(
      cssBundlePaths.length,
      'CSS bundle paths should not be empty',
    ).toBeGreaterThan(0);

    const clientComponentNames = clientComponents
      .filter(
        (component) =>
          !(
            component.renderDirectives.has('ssr:only') &&
            component.renderDirectives.size === 1
          ) && component.pendingRenderIds.size > 0,
      )
      .map((component) => component.componentName);

    expect(buildMetrics.framework).toBe('react');
    expect(buildMetrics.loader?.totalBytes ?? 0).toBeGreaterThan(0);
    expect(buildMetrics.components.length).toBe(clientComponentNames.length);
    expect(buildMetrics.spaSyncEffects?.enabledComponentCount ?? 0).toBe(3);
    expect(buildMetrics.spaSyncEffects?.enabledRenderCount ?? 0).toBe(3);
    expect(
      buildMetrics.spaSyncEffects?.totalEmbeddedHtmlBytes ?? 0,
    ).toBeGreaterThan(0);
    expect(buildMetrics.totalEstimatedComponentBytes).toBeGreaterThan(0);
    const uniquePageFileBytes = [
      ...buildMetrics.components
        .flatMap((componentMetric) => componentMetric.files)
        .reduce((fileMetricMap, fileMetric) => {
          const existingMetric = fileMetricMap.get(fileMetric.file);

          if (!existingMetric || existingMetric.bytes < fileMetric.bytes) {
            fileMetricMap.set(fileMetric.file, fileMetric);
          }

          return fileMetricMap;
        }, new Map<string, (typeof buildMetrics.components)[number]['files'][number]>()),
    ].reduce((sum, [, fileMetric]) => sum + fileMetric.bytes, 0);
    expect(buildMetrics.totalEstimatedComponentBytes).toBe(uniquePageFileBytes);
    for (const componentMetric of buildMetrics.components) {
      expect(componentMetric.files.length).toBeGreaterThan(0);
      expect(componentMetric.estimatedTotalBytes).toBeGreaterThan(0);
      expect(componentMetric.sourcePath.length).toBeGreaterThan(0);
    }
    const cssSourceModule = buildMetrics.components
      .flatMap((componentMetric) => componentMetric.modules)
      .find(
        (moduleMetric) =>
          moduleMetric.file.endsWith('.css') &&
          moduleMetric.sourcePath?.endsWith('rc3.css'),
      );
    expect(
      cssSourceModule,
      'CSS chunk resources should collect source modules for Module Source preview',
    ).toBeDefined();
    expect(cssSourceModule?.sourceAssetFile).toContain('/debug-sources/');
    expect(
      buildMetrics.components
        .flatMap((componentMetric) => componentMetric.modules)
        .some(
          (moduleMetric) =>
            moduleMetric.file.endsWith('.css') &&
            moduleMetric.id.includes('browser-component-entries') &&
            moduleMetric.id.endsWith('.tsx'),
        ),
      'CSS chunk resources should only expose real style source modules',
    ).toBe(false);
    const assetSourceModule = buildMetrics.components
      .flatMap((componentMetric) => componentMetric.modules)
      .find(
        (moduleMetric) =>
          moduleMetric.file.endsWith('.svg') &&
          moduleMetric.sourcePath?.endsWith('react.svg'),
      );
    expect(
      assetSourceModule,
      'Asset chunk resources should collect source modules for Module Source preview',
    ).toBeDefined();
    expect(assetSourceModule?.sourceAssetFile).toContain('/debug-sources/');
    expect(
      buildMetrics.spaSyncEffects?.components.find(
        (component) => component.componentName === 'Landing',
      )?.embeddedHtmlBytes ?? 0,
    ).toBeGreaterThan(0);
    expect(
      buildMetrics.spaSyncEffects?.components
        .find((component) => component.componentName === 'Landing')
        ?.embeddedHtmlPatches.some(
          (patch) => patch.renderId === '8b05459e' && patch.html === '...',
        ) ?? false,
    ).toBe(true);

    expect(
      typeof ssrInjectScript,
      'ssrInjectScript should be a string path',
    ).toBe('string');
    const fullSsrInjectScriptPath = join(config.outDir, ssrInjectScript);
    const ssrInjectScriptContent = fs.readFileSync(
      fullSsrInjectScriptPath,
      'utf8',
    );

    const checkInjectSSR = [...usedSnippetContainer.values()].filter(
      (usedSnippet) => usedSnippet.ssrHtml && !usedSnippet.useSpaSyncRender,
    );

    expect(
      checkInjectSSR.length,
      'There should be components to check for SSR injection',
    ).toBeGreaterThan(0);
    for (const usedSnippet of checkInjectSSR) {
      expect(
        ssrInjectScriptContent,
        `ssrInjectScript should contain the HTML for renderId ${usedSnippet.renderId}`,
      ).to.include(usedSnippet.ssrHtml as string);
    }

    expect(typeof loaderScript, 'loaderScript should be a string path').toBe(
      'string',
    );
    const fullLoaderScriptPath = join(config.outDir, loaderScript);
    const loaderScriptContent = fs.readFileSync(fullLoaderScriptPath, 'utf8');

    expect(
      clientComponentNames.length,
      'There should be client component names to check in loader script',
    ).toBeGreaterThan(0);
    for (const componentName of clientComponentNames) {
      expect(
        loaderScriptContent,
        `loaderScript should include the component name: ${componentName}`,
      ).to.include(componentName);
    }

    expect(
      loaderScriptContent,
      'loaderScript should resolve the global component manager before registering components',
    ).to.include('__COMPONENT_MANAGER__');

    expect(
      loaderScriptContent,
      'loaderScript should subscribe to runtime readiness before accessing injected components',
    ).to.include('subscribeRuntimeReady');

    expect(
      loaderScriptContent,
      'loaderScript should read the injected component registry after runtime readiness resolves',
    ).to.include('__INJECT_COMPONENT__');

    expect(
      loaderScriptContent,
      'loaderScript should notify the resolved component manager instance',
    ).to.include('notifyComponentLoaded');
  });

  it('should keep multiple named exports from the same source file as distinct client entries', async () => {
    const clientComponents: ComponentBundleInfo[] = [
      {
        componentName: 'MultiExportAlpha',
        componentPath: multiExportComponentPath,
        importReference: {
          importedName: 'MultiExportAlpha',
          identifier: multiExportComponentPath,
        },
        pendingRenderIds: new Set(['alpha-render-id']),
        renderDirectives: new Set(['client:load']),
      },
      {
        componentName: 'MultiExportBeta',
        componentPath: multiExportComponentPath,
        importReference: {
          importedName: 'MultiExportBeta',
          identifier: multiExportComponentPath,
        },
        pendingRenderIds: new Set(['beta-render-id']),
        renderDirectives: new Set(['client:load']),
      },
    ];
    const usedSnippetContainer = new Map<string, UsedSnippetContainerType>([
      [
        'alpha-render-id',
        {
          props: new Map([['component-name', 'MultiExportAlpha']]),
          renderId: 'alpha-render-id',
          renderDirective: 'client:load',
          renderComponent: 'MultiExportAlpha',
          ssrHtml:
            '<div class="multi-export-card"><strong>MultiExportAlpha</strong><span>MultiExportAlpha</span></div>',
          useSpaSyncRender: true,
        },
      ],
      [
        'beta-render-id',
        {
          props: new Map([['component-name', 'MultiExportBeta']]),
          renderId: 'beta-render-id',
          renderDirective: 'client:load',
          renderComponent: 'MultiExportBeta',
          ssrHtml:
            '<div class="multi-export-card"><strong>MultiExportBeta</strong><span>MultiExportBeta</span></div>',
          useSpaSyncRender: true,
        },
      ],
    ]);

    const { buildMetrics, loaderScript } = await bundleUIComponentsForBrowser(
      config,
      clientComponents,
      usedSnippetContainer,
      reactAdapter,
      TEST_LOGGER_SCOPE_ID,
    );
    const loaderScriptContent = fs.readFileSync(
      join(config.outDir, loaderScript),
      'utf8',
    );

    expect(buildMetrics.components).toHaveLength(2);
    expect(
      buildMetrics.components.map((metric) => metric.componentName),
    ).toEqual(['MultiExportAlpha', 'MultiExportBeta']);
    expect(
      new Set(buildMetrics.components.map((metric) => metric.entryFile)).size,
    ).toBe(2);
    expect(
      buildMetrics.components.every(
        (metric) =>
          metric.sourcePath ===
          'rendering-strategy-comps/react/MultiExportComponents.tsx',
      ),
    ).toBe(true);
    expect(loaderScriptContent).toContain('MultiExportAlpha');
    expect(loaderScriptContent).toContain('MultiExportBeta');
  });

  it('tree-shakes suppressed static logger literals from browser bundles', async () => {
    setLoggerConfigForScope(TEST_LOGGER_SCOPE_ID, {
      levels: ['warn', 'error'],
    });
    setVitePressLoggerTreeShakingEnabled(TEST_LOGGER_SCOPE_ID, true);

    const clientComponents: ComponentBundleInfo[] = [
      {
        componentName: 'LoggerProbe',
        componentPath: loggerProbeComponentPath,
        importReference: {
          importedName: 'default',
          identifier: loggerProbeComponentPath,
        },
        pendingRenderIds: new Set(['logger-probe-render-id']),
        renderDirectives: new Set(['client:load']),
      },
    ];
    const usedSnippetContainer = new Map<string, UsedSnippetContainerType>([
      [
        'logger-probe-render-id',
        {
          props: new Map([['component-name', 'LoggerProbe']]),
          renderId: 'logger-probe-render-id',
          renderDirective: 'client:load',
          renderComponent: 'LoggerProbe',
          ssrHtml:
            '<div class="logger-probe"><strong>LoggerProbe</strong></div>',
          useSpaSyncRender: true,
        },
      ],
    ]);

    await bundleUIComponentsForBrowser(
      config,
      clientComponents,
      usedSnippetContainer,
      reactAdapter,
      TEST_LOGGER_SCOPE_ID,
    );

    const bundledJavaScript = collectJavaScriptFiles(config.outDir)
      .map((file) => fs.readFileSync(file, 'utf8'))
      .join('\n');

    expect(bundledJavaScript).not.toContain('tree-shaking hidden browser info');
    expect(bundledJavaScript).toContain('tree-shaking visible browser warning');
  });

  it('tree-shakes suppressed static logger literals from Vite-bundled runtime modules', async () => {
    setLoggerConfigForScope(TEST_LOGGER_SCOPE_ID, {
      levels: ['warn', 'error'],
    });
    setVitePressLoggerTreeShakingEnabled(TEST_LOGGER_SCOPE_ID, true);

    const runtimeLoggerAdapter: UIFrameworkBuildAdapter = {
      browserBundlerPlugins: () => reactAdapter.browserBundlerPlugins(),
      buildModulePreloadPaths: (options) =>
        reactAdapter.buildModulePreloadPaths(options),
      clientEntryImportName: () => reactAdapter.clientEntryImportName(),
      clientEntryModule: () => reactAdapter.clientEntryModule(),
      createClientLoaderModuleSource: () => `
import { createLogger } from '@docs-islands/vitepress/logger';

const logger = createLogger({ main: '@acme/runtime-module' }).getLoggerByGroup('userland.runtime-module');

logger.info('tree-shaking hidden runtime module info');
logger.warn('tree-shaking visible runtime module warning');
      `,
      framework: reactAdapter.framework,
      renderToString: (...args) => reactAdapter.renderToString(...args),
      ssrBundlerPlugins: () => reactAdapter.ssrBundlerPlugins(),
    };
    const clientComponents: ComponentBundleInfo[] = [
      {
        componentName: 'MultiExportAlpha',
        componentPath: multiExportComponentPath,
        importReference: {
          importedName: 'MultiExportAlpha',
          identifier: multiExportComponentPath,
        },
        pendingRenderIds: new Set(['runtime-module-render-id']),
        renderDirectives: new Set(['client:load']),
      },
    ];
    const usedSnippetContainer = new Map<string, UsedSnippetContainerType>([
      [
        'runtime-module-render-id',
        {
          props: new Map([['component-name', 'MultiExportAlpha']]),
          renderId: 'runtime-module-render-id',
          renderDirective: 'client:load',
          renderComponent: 'MultiExportAlpha',
          ssrHtml:
            '<div class="multi-export-card"><strong>MultiExportAlpha</strong><span>MultiExportAlpha</span></div>',
          useSpaSyncRender: true,
        },
      ],
    ]);

    const { loaderScript } = await bundleUIComponentsForBrowser(
      config,
      clientComponents,
      usedSnippetContainer,
      runtimeLoggerAdapter,
      TEST_LOGGER_SCOPE_ID,
    );
    const loaderScriptContent = fs.readFileSync(
      join(config.outDir, loaderScript),
      'utf8',
    );

    expect(loaderScriptContent).not.toContain(
      'tree-shaking hidden runtime module info',
    );
    expect(loaderScriptContent).toContain(
      'tree-shaking visible runtime module warning',
    );
  });
});
