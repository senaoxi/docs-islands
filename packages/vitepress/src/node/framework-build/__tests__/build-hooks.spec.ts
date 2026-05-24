/**
 * @vitest-environment node
 */
import type { PageBuildMetrics } from '#dep-types/page';
import type { ConfigType } from '#dep-types/utils';
import {
  createEmptyCompilationContainer,
  RenderController,
} from '@docs-islands/core/node/render-controller';
import { RENDER_STRATEGY_CONSTANTS } from '@docs-islands/core/shared/constants/render-strategy';
import { resetScopedLoggerConfig, setScopedLoggerConfig } from 'logaria/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UIFrameworkBuildAdapter } from '../adapter';
import { registerUIFrameworkBuildHooks } from '../build-hooks';

const mocks = vi.hoisted(() => ({
  bundleBrowser: vi.fn(),
  bundleSSR: vi.fn(),
}));

vi.mock('../bundleUIComponentsForSSR', () => ({
  bundleUIComponentsForSSR: mocks.bundleSSR,
}));

vi.mock('../bundleUIComponentsForBrowser', () => ({
  bundleUIComponentsForBrowser: mocks.bundleBrowser,
}));

const TEST_LOGGER_SCOPE_ID = 'build-hooks-test-scope';
const markdownModuleId = '/project/docs/guide/page.md';
const htmlId = '/project/docs/.vitepress/dist/guide/page.html';

const createConfig = (): ConfigType =>
  ({
    assetsDir: 'assets',
    base: '/',
    cacheDir: '/project/docs/.vitepress/cache',
    cleanUrls: false,
    mpa: false,
    outDir: '/project/docs/.vitepress/dist',
    publicDir: '/project/docs/public',
    root: '/project/docs',
    siteDevtools: {},
    srcDir: '/project/docs',
    wrapBaseUrl: (value: string) => value,
  }) as ConfigType;

const createAdapter = (): UIFrameworkBuildAdapter => ({
  browserBundlerPlugins: () => [],
  clientEntryImportName: () => 'clientEntry',
  clientEntryModule: () => '/virtual/client-entry',
  createClientLoaderModuleSource: () => '',
  framework: 'react',
  renderToString: async () => '<div>unused</div>',
  ssrBundlerPlugins: () => [],
});

const createResolution = () =>
  ({
    createStaticResolver: () => ({
      resolvePagePathToDocumentModuleId: () => markdownModuleId,
    }),
  }) as any;

const createRenderController = () => {
  const renderController = new RenderController<PageBuildMetrics>();
  const compilationContainer = createEmptyCompilationContainer();

  compilationContainer.importsByLocalName.set('Demo', {
    identifier: '/project/docs/components/Demo.tsx',
    importedName: 'default',
  });
  renderController.setCompilationContainer(
    'react',
    markdownModuleId,
    compilationContainer,
  );

  return renderController;
};

const createHtml = (renderDirective: string) => `
<html>
  <head></head>
  <body>
    <div
      ${RENDER_STRATEGY_CONSTANTS.renderId.toLowerCase()}="demo-render-id"
      ${RENDER_STRATEGY_CONSTANTS.renderDirective.toLowerCase()}="${renderDirective}"
      ${RENDER_STRATEGY_CONSTANTS.renderComponent.toLowerCase()}="Demo"
      ${RENDER_STRATEGY_CONSTANTS.renderWithSpaSync.toLowerCase()}="true"
    ></div>
  </body>
</html>
`;

const runTransformHtml = async (
  renderDirective: string,
  renderController = createRenderController(),
) => {
  const vitepressConfig: any = {};

  registerUIFrameworkBuildHooks(
    vitepressConfig,
    createConfig(),
    createResolution(),
    renderController,
    {
      adapter: createAdapter(),
      loggerScopeId: TEST_LOGGER_SCOPE_ID,
      siteDevtoolsEnabled: false,
    },
  );

  return vitepressConfig.transformHtml(createHtml(renderDirective), htmlId, {
    page: 'guide/page.md',
    siteConfig: {},
  });
};

beforeEach(() => {
  mocks.bundleBrowser.mockReset();
  mocks.bundleSSR.mockReset();
  setScopedLoggerConfig(TEST_LOGGER_SCOPE_ID, {});
});

afterEach(() => {
  resetScopedLoggerConfig(TEST_LOGGER_SCOPE_ID);
});

describe('registerUIFrameworkBuildHooks', () => {
  it('rethrows SSR bundle failures from transformHtml', async () => {
    mocks.bundleSSR.mockRejectedValueOnce(new Error('ssr exploded'));

    await expect(runTransformHtml('ssr:only')).rejects.toThrow('ssr exploded');
    expect(mocks.bundleBrowser).not.toHaveBeenCalled();
  });

  it('rethrows browser bundle failures from transformHtml', async () => {
    mocks.bundleBrowser.mockRejectedValueOnce(new Error('browser exploded'));

    await expect(runTransformHtml('client:only')).rejects.toThrow(
      'browser exploded',
    );
  });
});
