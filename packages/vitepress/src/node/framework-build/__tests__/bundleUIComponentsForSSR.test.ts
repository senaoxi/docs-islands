import type {
  ComponentBundleInfo,
  UsedSnippetContainerType,
} from '#dep-types/component';
import type { ConfigType } from '#dep-types/utils';
import { resolveConfig } from '#shared/config';
import {
  resetScopedLoggerConfig,
  setResolvedScopedLoggerConfig as setLoggerConfigForScope,
} from '@docs-islands/logger/core';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'pathe';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { reactAdapter } from '../../adapters/react/adapter';
import { setVitePressLoggerTreeShakingEnabled } from '../../core/vite-plugin-logger-tree-shaking';
import { bundleUIComponentsForSSR } from '../bundleUIComponentsForSSR';

const TEST_LOGGER_SCOPE_ID = 'ssr-bundle-logger-tree-shaking-scope';

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

describe('bundleUIComponentsForSSR', () => {
  const defaultConfig = resolveConfig({});
  const resolveMockConfig = (config: ConfigType) => {
    const root = dirname(fileURLToPath(import.meta.url));
    const cacheDir = join(root, 'dist/.cache');
    const outDir = join(root, 'dist/multiple-components-for-ssr-outputs');
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

    return {
      ...config,
      root,
      cacheDir,
      outDir,
      srcDir: sourceDir,
      publicDir,
    };
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
  const ssrLoggerProbeComponentPath = join(
    reactComponentSource,
    'SsrLoggerProbe.tsx',
  );

  afterAll(() => {
    if (fs.existsSync(config.outDir)) {
      fs.rmSync(config.outDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    resetScopedLoggerConfig(TEST_LOGGER_SCOPE_ID);
    setVitePressLoggerTreeShakingEnabled(TEST_LOGGER_SCOPE_ID, false);
  });

  it('Verify that SSR meets expectations', async () => {
    const ssrComponents: ComponentBundleInfo[] = [
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
    ];

    const usedSnippetContainer = new Map<string, UsedSnippetContainerType>([
      [
        '8b05459e',
        {
          props: new Map(),
          renderId: '8b05459e',
          renderDirective: 'client:load',
          renderComponent: 'Landing',
          useSpaSyncRender: true,
        },
      ],
      [
        'ac62f9f7',
        {
          props: new Map([
            ['render-strategy', 'ssr:only'],
            ['component-name', 'ReactComp2'],
            ['page-title', 'Rendering Strategy'],
            ['render-count', '2'],
          ]),
          renderId: 'ac62f9f7',
          renderDirective: 'ssr:only',
          renderComponent: 'ReactComp2',
          useSpaSyncRender: true,
        },
      ],
      [
        'af2c1304',
        {
          props: new Map([
            ['render-strategy', 'client:load'],
            ['component-name', 'ReactComp3'],
            ['page-title', 'Rendering Strategy'],
            ['render-count', '3'],
          ]),
          renderId: 'af2c1304',
          renderDirective: 'client:load',
          renderComponent: 'ReactComp3',
          useSpaSyncRender: true,
        },
      ],
    ]);

    const expectedOutput = {
      '8b05459e':
        '<div class="landing"><div class="logo-container"><a href="https://vitepress.dev" target="_blank" rel="noreferrer"><img src="data:image/svg+xml,%3csvg%20width=&#x27;48&#x27;%20height=&#x27;48&#x27;%20viewBox=&#x27;0%200%2048%2048&#x27;%20fill=&#x27;none&#x27;%20xmlns=&#x27;http://www.w3.org/2000/svg&#x27;%3e%3cpath%20d=&#x27;M5.03628%207.87818C4.75336%205.83955%206.15592%203.95466%208.16899%203.66815L33.6838%200.0367403C35.6969%20-0.24977%2037.5581%201.1706%2037.841%203.20923L42.9637%2040.1218C43.2466%2042.1604%2041.8441%2044.0453%2039.831%2044.3319L14.3162%2047.9633C12.3031%2048.2498%2010.4419%2046.8294%2010.159%2044.7908L5.03628%207.87818Z&#x27;%20fill=&#x27;url(%23paint0_linear_1287_1214)&#x27;/%3e%3cpath%20d=&#x27;M6.85877%207.6188C6.71731%206.59948%207.41859%205.65703%208.42512%205.51378L33.9399%201.88237C34.9465%201.73911%2035.8771%202.4493%2036.0186%203.46861L41.1412%2040.3812C41.2827%2041.4005%2040.5814%2042.343%2039.5749%2042.4862L14.0601%2046.1176C13.0535%2046.2609%2012.1229%2045.5507%2011.9814%2044.5314L6.85877%207.6188Z&#x27;%20fill=&#x27;white&#x27;/%3e%3cpath%20d=&#x27;M33.1857%2014.9195L25.8505%2034.1576C25.6991%2034.5547%2025.1763%2034.63%2024.9177%2034.2919L12.3343%2017.8339C12.0526%2017.4655%2012.3217%2016.9339%2012.7806%2016.9524L22.9053%2017.3607C22.9698%2017.3633%2023.0344%2017.3541%2023.0956%2017.3337L32.5088%2014.1992C32.9431%2014.0546%2033.3503%2014.4878%2033.1857%2014.9195Z&#x27;%20fill=&#x27;url(%23paint1_linear_1287_1214)&#x27;/%3e%3cpath%20d=&#x27;M27.0251%2012.5756L19.9352%2015.0427C19.8187%2015.0832%2019.7444%2015.1986%2019.7546%2015.3231L20.3916%2023.063C20.4066%2023.2453%2020.5904%2023.3628%2020.7588%2023.2977L22.7226%2022.5392C22.9064%2022.4682%2023.1021%2022.6138%2023.0905%2022.8128L22.9102%2025.8903C22.8982%2026.0974%2023.1093%2026.2436%2023.295%2026.1567L24.4948%2025.5953C24.6808%2025.5084%2024.892%2025.6549%2024.8795%2025.8624L24.5855%2030.6979C24.5671%2031.0004%2024.9759%2031.1067%2025.1013%2030.8321L25.185%2030.6487L29.4298%2017.8014C29.5008%2017.5863%2029.2968%2017.3809%2029.0847%2017.454L27.0519%2018.1547C26.8609%2018.2205%2026.6675%2018.0586%2026.6954%2017.8561L27.3823%2012.8739C27.4103%2012.6712%2027.2163%2012.5091%2027.0251%2012.5756Z&#x27;%20fill=&#x27;url(%23paint2_linear_1287_1214)&#x27;/%3e%3cdefs%3e%3clinearGradient%20id=&#x27;paint0_linear_1287_1214&#x27;%20x1=&#x27;6.48163&#x27;%20y1=&#x27;1.9759&#x27;%20x2=&#x27;39.05&#x27;%20y2=&#x27;48.2064&#x27;%20gradientUnits=&#x27;userSpaceOnUse&#x27;%3e%3cstop%20stop-color=&#x27;%2349C7FF&#x27;/%3e%3cstop%20offset=&#x27;1&#x27;%20stop-color=&#x27;%23BD36FF&#x27;/%3e%3c/linearGradient%3e%3clinearGradient%20id=&#x27;paint1_linear_1287_1214&#x27;%20x1=&#x27;11.8848&#x27;%20y1=&#x27;16.4266&#x27;%20x2=&#x27;26.7246&#x27;%20y2=&#x27;31.4177&#x27;%20gradientUnits=&#x27;userSpaceOnUse&#x27;%3e%3cstop%20stop-color=&#x27;%2341D1FF&#x27;/%3e%3cstop%20offset=&#x27;1&#x27;%20stop-color=&#x27;%23BD34FE&#x27;/%3e%3c/linearGradient%3e%3clinearGradient%20id=&#x27;paint2_linear_1287_1214&#x27;%20x1=&#x27;21.8138&#x27;%20y1=&#x27;13.7046&#x27;%20x2=&#x27;26.2464&#x27;%20y2=&#x27;28.8069&#x27;%20gradientUnits=&#x27;userSpaceOnUse&#x27;%3e%3cstop%20stop-color=&#x27;%23FFEA83&#x27;/%3e%3cstop%20offset=&#x27;0.0833333&#x27;%20stop-color=&#x27;%23FFDD35&#x27;/%3e%3cstop%20offset=&#x27;1&#x27;%20stop-color=&#x27;%23FFA800&#x27;/%3e%3c/linearGradient%3e%3c/defs%3e%3c/svg%3e" class="logo" alt="VitePress logo"/></a><a href="https://react.dev" target="_blank" rel="noreferrer"><img src="/assets/react.CHdo91hT.svg" class="logo react" alt="React logo"/></a></div><h1>VitePress + React</h1><div class="card"><button>count is <!-- -->0</button></div></div>',
      ac62f9f7:
        '<div class="react-comp2-demo"><strong>2<!-- -->: Rendering Strategy: <!-- -->ssr:only</strong><ol><li><strong>Component Name:</strong> <span>ReactComp2</span></li><li><strong>Page Title:</strong> <span>Rendering Strategy</span></li><li><button class="rc2-button" type="button">Click Me!</button><strong>Pre-rendering Mode Only, React Instance Count:</strong> <span>0</span></li></ol></div>',
      af2c1304:
        '<div class="react-comp3-demo"><strong>3<!-- -->: Rendering Strategy: <!-- -->client:load</strong><ol><li><strong>Component Name:</strong> <span>ReactComp3</span></li><li><strong>Page Title:</strong> <span>Rendering Strategy</span></li><li><button class="rc3-button" type="button">Click Me!</button><strong>Pre-rendering Client Hydration Mode, React Instance Count:</strong> <span>0</span></li></ol></div>',
    };

    const { renderedComponents } = await bundleUIComponentsForSSR(
      config,
      ssrComponents,
      usedSnippetContainer,
      reactAdapter,
    );
    const actualOutput = Object.fromEntries(renderedComponents);
    expect(actualOutput).toEqual(expectedOutput);
  });

  it('renders multiple named exports from the same source file independently', async () => {
    const ssrComponents: ComponentBundleInfo[] = [
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
        renderDirectives: new Set(['ssr:only']),
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
          useSpaSyncRender: true,
        },
      ],
      [
        'beta-render-id',
        {
          props: new Map([['component-name', 'MultiExportBeta']]),
          renderId: 'beta-render-id',
          renderDirective: 'ssr:only',
          renderComponent: 'MultiExportBeta',
          useSpaSyncRender: true,
        },
      ],
    ]);

    const { renderedComponents } = await bundleUIComponentsForSSR(
      config,
      ssrComponents,
      usedSnippetContainer,
      reactAdapter,
    );

    expect(Object.fromEntries(renderedComponents)).toEqual({
      'alpha-render-id':
        '<div class="multi-export-card"><strong>MultiExportAlpha</strong><span>MultiExportAlpha</span></div>',
      'beta-render-id':
        '<div class="multi-export-card"><strong>MultiExportBeta</strong><span>MultiExportBeta</span></div>',
    });
  });

  it('tree-shakes suppressed static logger literals from SSR component bundles', async () => {
    setLoggerConfigForScope(TEST_LOGGER_SCOPE_ID, {
      levels: ['warn', 'error'],
    });
    setVitePressLoggerTreeShakingEnabled(TEST_LOGGER_SCOPE_ID, true);

    const ssrComponents: ComponentBundleInfo[] = [
      {
        componentName: 'SsrLoggerProbe',
        componentPath: ssrLoggerProbeComponentPath,
        importReference: {
          importedName: 'default',
          identifier: ssrLoggerProbeComponentPath,
        },
        pendingRenderIds: new Set(['ssr-logger-probe-render-id']),
        renderDirectives: new Set(['ssr:only']),
      },
    ];
    const usedSnippetContainer = new Map<string, UsedSnippetContainerType>([
      [
        'ssr-logger-probe-render-id',
        {
          props: new Map([['component-name', 'SsrLoggerProbe']]),
          renderId: 'ssr-logger-probe-render-id',
          renderDirective: 'ssr:only',
          renderComponent: 'SsrLoggerProbe',
          useSpaSyncRender: true,
        },
      ],
    ]);
    const bundledJavaScriptSnapshots: string[] = [];
    const originalRmSync = fs.rmSync;
    const rmSyncSpy = vi
      .spyOn(fs, 'rmSync')
      .mockImplementation((...args: Parameters<typeof fs.rmSync>) => {
        const [targetPath] = args;

        if (
          typeof targetPath === 'string' &&
          targetPath.includes('ssr-temp-')
        ) {
          bundledJavaScriptSnapshots.push(
            collectJavaScriptFiles(targetPath)
              .map((file) => fs.readFileSync(file, 'utf8'))
              .join('\n'),
          );
        }

        return originalRmSync(...args);
      });
    try {
      const { renderedComponents } = await bundleUIComponentsForSSR(
        config,
        ssrComponents,
        usedSnippetContainer,
        reactAdapter,
        TEST_LOGGER_SCOPE_ID,
      );

      expect(Object.fromEntries(renderedComponents)).toEqual({
        'ssr-logger-probe-render-id':
          '<div class="ssr-logger-probe"><strong>SsrLoggerProbe</strong></div>',
      });
    } finally {
      rmSyncSpy.mockRestore();
    }

    const bundledJavaScript = bundledJavaScriptSnapshots.join('\n');

    expect(bundledJavaScript).not.toContain('tree-shaking hidden ssr info');
    expect(bundledJavaScript).toContain('tree-shaking visible ssr warning');
  });
});
