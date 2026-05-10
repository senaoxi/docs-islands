import type {
  ComponentBundleInfo,
  UsedSnippetContainerType,
} from '#dep-types/component';
import type {
  BundleAssetMetric,
  PageBuildMetrics,
  PageBuildRenderInstanceMetric,
  PageMetafile,
  RuntimeBundleMetric,
  SpaSyncComponentSideEffectMetric,
} from '#dep-types/page';
import type { RenderDirective } from '#dep-types/render';
import type { ConfigType } from '#dep-types/utils';
import { VITEPRESS_BUILD_LOG_GROUPS } from '#shared/constants/log-groups/build';
import {
  getHtmlOutputPathByPathname,
  getPathnameByPagePath,
} from '#shared/path';
import type { RenderController } from '@docs-islands/core/node/render-controller';
import {
  type ExtractedProps,
  transformSSRContainerIntegrationCode,
} from '@docs-islands/core/node/ssr-container-integration-processor';
import {
  ALLOWED_RENDER_DIRECTIVES,
  RENDER_STRATEGY_ATTRS,
  RENDER_STRATEGY_CONSTANTS,
} from '@docs-islands/core/shared/constants/render-strategy';
import { createElapsedLogOptions } from '@docs-islands/logger/helper';
import type { CheerioAPI } from 'cheerio';
import { load } from 'cheerio';
import fs from 'node:fs';
import { dirname, join, relative } from 'pathe';
import { normalizePath } from 'vite';
import type { DefaultTheme, UserConfig } from 'vitepress';
import type {
  RenderingModuleResolution,
  RenderingStaticPageResolver,
} from '../core/module-resolution';
import { getVitePressGroupLogger } from '../logger';
import { generateSiteDevToolsAiBuildReports } from '../site-devtools/ai-build-reports';
import type { UIFrameworkBuildAdapter } from './adapter';
import { buildUIFrameworkIntegrationInMPA } from './buildUIFrameworkIntegrationInMPA';
import { bundleUIComponentsForBrowser } from './bundleUIComponentsForBrowser';
import { bundleUIComponentsForSSR } from './bundleUIComponentsForSSR';
import {
  createPageMetafileArtifacts,
  injectPageMetafileReferences,
  resolveSiteDevToolsBuildReportPageContext,
} from './page-metafile';
import { getComponentBundleKey } from './shared';
import { getSharedClientRuntimeMetafile } from './shared-client-runtime';
const elapsedSince = (startTimeMs: number) =>
  createElapsedLogOptions(startTimeMs, Date.now());

const wrapBundleAssetMetrics = (
  metrics: BundleAssetMetric[],
  wrapBaseUrl: (value: string) => string,
): BundleAssetMetric[] =>
  metrics.map((metric) => ({
    ...metric,
    file: wrapBaseUrl(metric.file),
  }));

const wrapRuntimeBundleMetric = (
  metric: RuntimeBundleMetric | null,
  wrapBaseUrl: (value: string) => string,
): RuntimeBundleMetric | null => {
  if (!metric) {
    return null;
  }

  return {
    ...metric,
    entryFile: wrapBaseUrl(metric.entryFile),
    files: wrapBundleAssetMetrics(metric.files, wrapBaseUrl),
  };
};

const wrapPageBuildMetrics = (
  metrics: PageBuildMetrics,
  wrapBaseUrl: (value: string) => string,
): PageBuildMetrics => ({
  ...metrics,
  components: metrics.components.map((componentMetric) => ({
    ...componentMetric,
    entryFile: wrapBaseUrl(componentMetric.entryFile),
    files: wrapBundleAssetMetrics(componentMetric.files, wrapBaseUrl),
    modules: componentMetric.modules.map((moduleMetric) => ({
      ...moduleMetric,
      file: wrapBaseUrl(moduleMetric.file),
      sourceAssetFile: moduleMetric.sourceAssetFile
        ? wrapBaseUrl(moduleMetric.sourceAssetFile)
        : undefined,
    })),
  })),
  loader: wrapRuntimeBundleMetric(metrics.loader, wrapBaseUrl),
  renderInstances: metrics.renderInstances?.map(
    (renderInstance): PageBuildRenderInstanceMetric => ({
      ...renderInstance,
      blockingCssFiles: wrapBundleAssetMetrics(
        renderInstance.blockingCssFiles,
        wrapBaseUrl,
      ),
    }),
  ),
  spaSyncEffects: metrics.spaSyncEffects
    ? {
        ...metrics.spaSyncEffects,
        pageClientChunkFile: metrics.spaSyncEffects.pageClientChunkFile
          ? wrapBaseUrl(metrics.spaSyncEffects.pageClientChunkFile)
          : undefined,
        components: metrics.spaSyncEffects.components.map(
          (component): SpaSyncComponentSideEffectMetric => ({
            ...component,
            blockingCssFiles: wrapBundleAssetMetrics(
              component.blockingCssFiles,
              wrapBaseUrl,
            ),
          }),
        ),
      }
    : null,
  ssrInject: wrapRuntimeBundleMetric(metrics.ssrInject, wrapBaseUrl),
});

const writeSpaSyncRenderedPageClientChunks = ({
  clientRuntimeFileName,
  framework,
  loggerScopeId,
  markdownModuleIdToSpaSyncRenderMap,
  outDir,
}: {
  clientRuntimeFileName: string;
  framework: string;
  loggerScopeId: string;
  markdownModuleIdToSpaSyncRenderMap: ReturnType<
    RenderController<PageBuildMetrics>['getMarkdownModuleIdToSpaSyncRenderMap']
  >;
  outDir: string;
}) => {
  if (markdownModuleIdToSpaSyncRenderMap.size === 0) {
    return;
  }

  const Logger = getVitePressGroupLogger(
    VITEPRESS_BUILD_LOG_GROUPS.frameworkBuildSsrIntegration,
    loggerScopeId,
  );

  for (const [
    markdownModuleId,
    spaSyncRender,
  ] of markdownModuleIdToSpaSyncRenderMap.entries()) {
    const transformStartedAt = Date.now();
    const { outputPath, code, renderIdToSpaSyncRenderMap } = spaSyncRender;
    const { code: transformedCode, stats } =
      transformSSRContainerIntegrationCode(
        code,
        (props: ExtractedProps) => {
          const renderId =
            props[RENDER_STRATEGY_CONSTANTS.renderId.toLowerCase()];
          if (
            typeof renderId === 'string' &&
            renderIdToSpaSyncRenderMap.has(renderId)
          ) {
            const { ssrHtml, ssrCssBundlePaths } =
              renderIdToSpaSyncRenderMap.get(renderId)!;
            return {
              clientRuntimeFileName,
              loggerScopeId,
              ssrCssBundlePaths,
              ssrHtml,
            };
          }
          return {
            clientRuntimeFileName,
            loggerScopeId,
            ssrCssBundlePaths: new Set(),
            ssrHtml: '',
          };
        },
        loggerScopeId,
      );

    if (stats.totalTransformations > 0) {
      Logger.success(
        `
          Complete ${stats.totalTransformations} pre-rendering injections for ${framework} page ${markdownModuleId}

          ${stats.transformedNodes.map((node) => `- Line ${node.line}, Column ${node.column}`).join('\n')}
        `,
        elapsedSince(transformStartedAt),
      );
      fs.writeFileSync(join(outDir, outputPath), transformedCode);
      continue;
    }

    Logger.info(
      `No transformations performed, preserve original code for ${framework} page ${markdownModuleId}.`,
      elapsedSince(transformStartedAt),
    );
  }
};

const collectPageComponentBundles = ({
  $,
  elementsToRender,
  framework,
  id,
  importsByLocalName,
  loggerScopeId,
  renderController,
  resolvedId,
  srcDir,
}: {
  $: CheerioAPI;
  elementsToRender: ReturnType<CheerioAPI>;
  framework: string;
  id: string;
  importsByLocalName: Awaited<
    ReturnType<
      RenderController<PageBuildMetrics>['getCompilationContainerByMarkdownModuleId']
    >
  >['importsByLocalName'];
  loggerScopeId: string;
  renderController: RenderController<PageBuildMetrics>;
  resolvedId: string;
  srcDir: string;
}): {
  clientComponentsToBundle: Map<string, ComponentBundleInfo>;
  ssrComponentsToBundle: Map<string, ComponentBundleInfo>;
  usedSnippetContainer: Map<string, UsedSnippetContainerType>;
} => {
  const collectStartedAt = Date.now();
  const Logger = getVitePressGroupLogger(
    VITEPRESS_BUILD_LOG_GROUPS.frameworkBuildTransformHtml,
    loggerScopeId,
  );
  // Multiple islands on the same page can share one loader entry, so dedupe at the page boundary.
  const clientComponentsToBundle = new Map<string, ComponentBundleInfo>();
  const ssrComponentsToBundle = new Map<string, ComponentBundleInfo>();
  const usedSnippetContainer =
    renderController.getUsedSnippetContainerByMarkdownModuleId(
      framework,
      resolvedId,
    ) || new Map<string, UsedSnippetContainerType>();

  renderController.setUsedSnippetContainer(
    framework,
    resolvedId,
    usedSnippetContainer,
  );

  for (const el of elementsToRender.toArray()) {
    const $el = $(el);
    const renderId = $el.attr(RENDER_STRATEGY_CONSTANTS.renderId.toLowerCase());
    const componentName = $el.attr(
      RENDER_STRATEGY_CONSTANTS.renderComponent.toLowerCase(),
    );
    const renderDirective = ($el.attr(
      RENDER_STRATEGY_CONSTANTS.renderDirective.toLowerCase(),
    ) || 'ssr:only') as RenderDirective;

    if (
      !componentName ||
      !renderId ||
      !ALLOWED_RENDER_DIRECTIVES.includes(renderDirective)
    ) {
      continue;
    }

    const importReference = importsByLocalName.get(componentName);
    if (!importReference) {
      Logger.warn(
        `${framework} component "${componentName}" import not found for page ${id}.`,
        elapsedSince(collectStartedAt),
      );
      continue;
    }

    if (renderDirective !== 'client:only') {
      const componentBundleKey = getComponentBundleKey({
        componentName,
        importReference,
      });

      if (!ssrComponentsToBundle.has(componentBundleKey)) {
        ssrComponentsToBundle.set(componentBundleKey, {
          componentPath: importReference.identifier,
          componentName,
          importReference,
          pendingRenderIds: new Set(),
          renderDirectives: new Set(),
        });
      }

      const ssrComponentBundle = ssrComponentsToBundle.get(componentBundleKey);
      if (ssrComponentBundle) {
        ssrComponentBundle.pendingRenderIds.add(renderId);
        ssrComponentBundle.renderDirectives.add(renderDirective);
      }

      /**
       * Collect the current element's props during the transform phase so SSR output
       * and later client-side reconciliation share the same attribute snapshot.
       */
      const usedSnippet = usedSnippetContainer.get(renderId);
      if (usedSnippet) {
        const elementProps = new Map<string, string>();
        const attrs = $el.attr();
        if (attrs) {
          for (const [key, value] of Object.entries(attrs)) {
            if (!RENDER_STRATEGY_ATTRS.includes(key)) {
              elementProps.set(key, value);
            }
          }
        }
        usedSnippet.props = elementProps;
        usedSnippet.sourcePath = relative(srcDir, importReference.identifier);
      }
    }

    /**
     * Even for `ssr:only` components, we still generate static resources so SSR output,
     * page metadata, and downstream preload/caching behavior remain consistent.
     */
    const componentBundleKey = getComponentBundleKey({
      componentName,
      importReference,
    });
    if (!clientComponentsToBundle.has(componentBundleKey)) {
      clientComponentsToBundle.set(componentBundleKey, {
        componentPath: importReference.identifier,
        componentName,
        importReference,
        pendingRenderIds: new Set(),
        renderDirectives: new Set(),
      });
    }

    const componentBundle = clientComponentsToBundle.get(componentBundleKey);
    if (componentBundle) {
      componentBundle.pendingRenderIds.add(renderId);
      componentBundle.renderDirectives.add(renderDirective);
    }
  }

  return {
    clientComponentsToBundle,
    ssrComponentsToBundle,
    usedSnippetContainer,
  };
};

export interface RegisterUIFrameworkBuildHooksOptions {
  adapter: UIFrameworkBuildAdapter;
  loggerScopeId: string;
  preloadFrameworkRuntimeOnEveryPage?: boolean;
  siteDevtoolsEnabled: boolean;
}

// Complex build orchestration function that coordinates multiple build phases
// eslint-disable-next-line max-lines-per-function
export function registerUIFrameworkBuildHooks(
  vitepressConfig: UserConfig<DefaultTheme.Config>,
  config: ConfigType,
  resolution: RenderingModuleResolution,
  renderController: RenderController<PageBuildMetrics>,
  options: RegisterUIFrameworkBuildHooksOptions,
): void {
  const {
    adapter,
    loggerScopeId,
    preloadFrameworkRuntimeOnEveryPage = false,
    siteDevtoolsEnabled,
  } = options;
  const { framework } = adapter;
  const { assetsDir, mpa, srcDir, wrapBaseUrl } = config;
  let pageResolver: RenderingStaticPageResolver | null = null;

  const preHtmlTransform = vitepressConfig.transformHtml?.bind(vitepressConfig);
  /**
   * Preload framework runtimes plus the shared client runtime so the page can begin
   * resolving adapter-wide dependencies before the actual per-page loader executes.
   */
  const injectFrameworkModulePreload = async ($: CheerioAPI) => {
    const { fileName } = await getSharedClientRuntimeMetafile(loggerScopeId);
    const frameworkModulePreloads =
      (await adapter.buildModulePreloadPaths?.({
        assetsDir,
      })) ?? [];
    const preloadPaths = [
      ...frameworkModulePreloads,
      join('/', assetsDir, `chunks/${fileName}`),
    ];

    if (preloadPaths.length === 0) {
      return;
    }

    $('head').append(
      preloadPaths
        .map(
          (src) =>
            `<link rel="modulepreload" href="${wrapBaseUrl(src)}" crossorigin>`,
        )
        .join('\n'),
    );
  };

  // Complex HTML transformation hook that coordinates SSR integration and metrics collection
  // eslint-disable-next-line complexity
  vitepressConfig.transformHtml = async (html, id, ctx) => {
    const pendingResolvedId = join('/', ctx.page.replace('.md', ''));
    const Logger = getVitePressGroupLogger(
      VITEPRESS_BUILD_LOG_GROUPS.frameworkBuildTransformHtml,
      loggerScopeId,
    );
    const transformedHtml = preHtmlTransform
      ? await Promise.resolve(preHtmlTransform(html, id, ctx))
      : html;
    const $ = load(transformedHtml ? transformedHtml.toString() : '');

    if (!pageResolver) {
      pageResolver = resolution.createStaticResolver(ctx.siteConfig);
    }
    const resolvedId =
      pageResolver.resolvePagePathToDocumentModuleId(pendingResolvedId) ||
      pendingResolvedId;

    if (
      !renderController.hasCompilationContainerByMarkdownModuleId(
        framework,
        resolvedId,
      )
    ) {
      if (!mpa && preloadFrameworkRuntimeOnEveryPage) {
        await injectFrameworkModulePreload($);
      }
      return $.html();
    }

    const compilationContainer =
      await renderController.getCompilationContainerByMarkdownModuleId(
        framework,
        resolvedId,
      );
    const importsByLocalName = compilationContainer.importsByLocalName;

    if (importsByLocalName.size === 0) {
      if (!mpa && preloadFrameworkRuntimeOnEveryPage) {
        await injectFrameworkModulePreload($);
      }
      return $.html();
    }

    const elementsToRender = $(
      `[${RENDER_STRATEGY_CONSTANTS.renderComponent.toLowerCase()}]`,
    );

    if (elementsToRender.length === 0) {
      if (!mpa && preloadFrameworkRuntimeOnEveryPage) {
        await injectFrameworkModulePreload($);
      }
      return $.html();
    }

    const pageUsesFramework = elementsToRender.length > 0;
    const clientScripts = new Set<string>();
    const {
      clientComponentsToBundle,
      ssrComponentsToBundle,
      usedSnippetContainer,
    } = collectPageComponentBundles({
      $,
      elementsToRender,
      framework,
      id,
      importsByLocalName,
      loggerScopeId,
      renderController,
      resolvedId,
      srcDir,
    });

    const pageMetafile: PageMetafile = {
      cssBundlePaths: [],
      loaderScript: '',
      modulePreloads: [],
      ssrInjectScript: '',
    };

    // Complete SSR first to enable `spa:sync-render` optimizations in the client script.
    if (ssrComponentsToBundle.size > 0) {
      const ssrBundleStartedAt = Date.now();
      try {
        const { renderedComponents } = await bundleUIComponentsForSSR(
          config,
          [...ssrComponentsToBundle.values()],
          usedSnippetContainer,
          adapter,
          loggerScopeId,
        );

        for (const [renderId, html] of renderedComponents.entries()) {
          const targetElement = $(
            `[${RENDER_STRATEGY_CONSTANTS.renderId.toLowerCase()}="${renderId}"]`,
          );
          if (targetElement) {
            targetElement.html(html);
            Logger.success(
              `Injected ${framework} SSR HTML for render ID: ${renderId}`,
              elapsedSince(ssrBundleStartedAt),
            );
          }
        }
      } catch (error) {
        Logger.error(
          `Failed to bundle and render ${framework} SSR components for page ${id}, error: ${error}`,
          elapsedSince(ssrBundleStartedAt),
        );
      }
    }

    if (clientComponentsToBundle.size > 0) {
      const clientBundleStartedAt = Date.now();
      try {
        const {
          buildMetrics,
          cssBundlePaths,
          loaderScript,
          modulePreloads,
          ssrInjectScript,
        } = await bundleUIComponentsForBrowser(
          config,
          [...clientComponentsToBundle.values()],
          usedSnippetContainer,
          adapter,
          loggerScopeId,
        );

        for (const [, usedSnippet] of usedSnippetContainer) {
          if (usedSnippet.ssrCssBundlePaths) {
            const wrapCssBundlePaths = new Set<string>();
            for (const cssBundlePath of usedSnippet.ssrCssBundlePaths) {
              wrapCssBundlePaths.add(wrapBaseUrl(cssBundlePath));
            }
            usedSnippet.ssrCssBundlePaths = wrapCssBundlePaths;
          }
        }

        pageMetafile.buildMetrics = wrapPageBuildMetrics(
          buildMetrics,
          wrapBaseUrl,
        );

        if (loaderScript) {
          clientScripts.add(loaderScript);

          // Inject page-required preload scripts at build time to accelerate subsequent script loading.
          if (modulePreloads.length > 0) {
            const preloadTags = modulePreloads
              .map((src) => {
                pageMetafile.modulePreloads.push(wrapBaseUrl(src));
                return `<link rel="modulepreload" href="${wrapBaseUrl(src)}">`;
              })
              .join('\n');
            $('head').append(preloadTags);
          }
          if (ssrInjectScript) {
            pageMetafile.ssrInjectScript = wrapBaseUrl(ssrInjectScript);
            $('head').append(`
              <link rel="modulepreload" href="${wrapBaseUrl(ssrInjectScript)}" crossorigin>
            `);
          }
          if (cssBundlePaths.length > 0) {
            const cssBundleTags = cssBundlePaths
              .map((src) => {
                pageMetafile.cssBundlePaths.push(wrapBaseUrl(src));
                return `<link data-vrite-css-bundle="${wrapBaseUrl(src)}" rel="stylesheet" href="${wrapBaseUrl(src)}" crossorigin>`;
              })
              .join('\n');
            $('head').append(cssBundleTags);
          }
          pageMetafile.loaderScript = wrapBaseUrl(loaderScript);
          $('head').append(`
            <link rel="modulepreload" href="${wrapBaseUrl(loaderScript)}" crossorigin>
          `);
        }
      } catch (error) {
        Logger.error(
          `Failed to bundle ${framework} components for page ${id}, error: ${error}`,
          elapsedSince(clientBundleStartedAt),
        );
      }
    }

    if (
      pageMetafile.loaderScript ||
      pageMetafile.modulePreloads.length > 0 ||
      pageMetafile.cssBundlePaths.length > 0 ||
      pageMetafile.ssrInjectScript
    ) {
      renderController.setPageMetafile(ctx.page, pageMetafile);
    }

    if (clientScripts.size > 0) {
      if (mpa) {
        const { entryPoint, modulePreloads } =
          await buildUIFrameworkIntegrationInMPA(
            config,
            adapter,
            loggerScopeId,
          );
        if (modulePreloads.length > 0) {
          const preloadTags = modulePreloads
            .map(
              (src) => `<link rel="modulepreload" href="${wrapBaseUrl(src)}">`,
            )
            .join('\n');
          $('head').append(preloadTags);
        }
        if (entryPoint) {
          $('head').append(
            `<script type="module" src="${wrapBaseUrl(entryPoint)}"></script>`,
          );
        }
      }

      const scriptTags = [...clientScripts]
        .map(
          (src) => `<script src="${wrapBaseUrl(src)}" type="module"></script>`,
        )
        .join('\n');
      $('head').append(scriptTags);
    }

    // Keep the fast path cheap by skipping framework preloads unless the adapter
    // explicitly opts into site-wide runtime preloads or the page actually uses the framework.
    if (!mpa && (pageUsesFramework || preloadFrameworkRuntimeOnEveryPage)) {
      await injectFrameworkModulePreload($);
    }

    return $.html();
  };

  vitepressConfig.buildEnd = async () => {
    const buildFinalizeStartedAt = Date.now();
    const {
      assetsDir,
      cacheDir,
      cleanUrls,
      outDir,
      root,
      siteDevtools,
      srcDir,
    } = config;
    const metafileDir = join(outDir, assetsDir);
    const Logger = getVitePressGroupLogger(
      VITEPRESS_BUILD_LOG_GROUPS.frameworkBuildFinalize,
      loggerScopeId,
    );
    const { content, fileName } =
      await getSharedClientRuntimeMetafile(loggerScopeId);
    const clientRuntimeFilePath = join(metafileDir, `chunks/${fileName}`);
    fs.writeFileSync(clientRuntimeFilePath, content);
    let pageMetafileReferences: {
      currentPagePublicPathByHtmlPath: Map<string, string>;
      indexPublicPath: string;
    } | null = null;

    const transformedPageMetafileMap =
      renderController.getTransformedPageMetafile(cleanUrls);
    const markdownModuleIdToSpaSyncRenderMap =
      renderController.getMarkdownModuleIdToSpaSyncRenderMap(framework);
    const pageContexts = Object.fromEntries(
      Object.keys(transformedPageMetafileMap).map((pageId) => [
        pageId,
        resolveSiteDevToolsBuildReportPageContext({
          cleanUrls,
          pageId,
          pageResolver,
          srcDir,
        }),
      ]),
    );
    const pageIdByNormalizedMarkdownModuleId = new Map<string, string>(
      Object.entries(pageContexts).map(([pageId, pageContext]) => [
        pageContext.filePath,
        pageId,
      ]),
    );

    if (markdownModuleIdToSpaSyncRenderMap.size > 0) {
      for (const [
        markdownModuleId,
        spaSyncRender,
      ] of markdownModuleIdToSpaSyncRenderMap.entries()) {
        const normalizedMarkdownModuleId = normalizePath(
          markdownModuleId,
        ).replace(/[#?].*$/, '');
        const pagePath = relative(srcDir, normalizedMarkdownModuleId);
        const derivedPageId = getPathnameByPagePath(pagePath, cleanUrls);
        const pageId = transformedPageMetafileMap[derivedPageId]
          ? derivedPageId
          : (pageIdByNormalizedMarkdownModuleId.get(
              normalizedMarkdownModuleId,
            ) ?? derivedPageId);
        const pageMetafile = transformedPageMetafileMap[pageId];

        if (!pageMetafile?.buildMetrics?.spaSyncEffects) {
          continue;
        }

        pageMetafile.buildMetrics.spaSyncEffects.pageClientChunkFile =
          wrapBaseUrl(join('/', spaSyncRender.outputPath));
      }
    }

    writeSpaSyncRenderedPageClientChunks({
      clientRuntimeFileName: fileName,
      framework,
      loggerScopeId,
      markdownModuleIdToSpaSyncRenderMap,
      outDir,
    });

    if (Object.keys(transformedPageMetafileMap).length > 0) {
      if (siteDevtoolsEnabled) {
        await generateSiteDevToolsAiBuildReports({
          aiConfig: siteDevtools.analysis,
          assetsDir,
          cacheDir,
          loggerScopeId,
          outDir,
          pageContexts,
          pageMetafiles: transformedPageMetafileMap,
          root,
          wrapBaseUrl,
        });
      }

      const pageMetafileArtifacts = createPageMetafileArtifacts({
        assetsDir,
        pageMetafiles: transformedPageMetafileMap,
        wrapBaseUrl,
      });

      for (const pageMetafileAsset of pageMetafileArtifacts.pages) {
        const pageMetafileFilePath = join(
          metafileDir,
          pageMetafileAsset.filePath,
        );
        fs.mkdirSync(dirname(pageMetafileFilePath), { recursive: true });
        fs.writeFileSync(pageMetafileFilePath, pageMetafileAsset.content);
      }

      const pageMetafileManifestFilePath = join(
        metafileDir,
        pageMetafileArtifacts.manifest.filePath,
      );
      fs.mkdirSync(dirname(pageMetafileManifestFilePath), { recursive: true });
      fs.writeFileSync(
        pageMetafileManifestFilePath,
        pageMetafileArtifacts.manifest.content,
      );

      pageMetafileReferences = {
        currentPagePublicPathByHtmlPath: new Map(
          pageMetafileArtifacts.pages.map((pageMetafileAsset) => [
            getHtmlOutputPathByPathname(
              pageMetafileAsset.pathname,
              cleanUrls,
            ).replaceAll('\\', '/'),
            pageMetafileAsset.publicPath,
          ]),
        ),
        indexPublicPath: pageMetafileArtifacts.manifest.publicPath,
      };
    }

    if (pageMetafileReferences) {
      injectPageMetafileReferences({
        ...pageMetafileReferences,
        outDir,
      });

      Logger.info(
        `Generated hashed page metafile manifest with ${Object.keys(transformedPageMetafileMap).length} ${framework} pages`,
        elapsedSince(buildFinalizeStartedAt),
      );
    }
  };
}
