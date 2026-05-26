import type {
  ComponentBundleInfo,
  UsedSnippetContainerType,
} from '#dep-types/component';
import type { OutputChunk } from '#dep-types/rollup';
import { VITEPRESS_BUILD_LOG_GROUPS } from '#shared/constants/log-groups/build';
import { createElapsedTimer, formatErrorMessage } from 'logaria/helper';
import { pathToFileURL } from 'node:url';
import { resolve } from 'pathe';
import { getVitePressGroupLogger } from '../../logger';
import type { UIFrameworkBuildAdapter } from '../adapter';

async function renderComponentForSnippet(
  ssrModuleComponent: unknown,
  renderId: string,
  usedSnippet: UsedSnippetContainerType,
  componentName: string,
  adapter: UIFrameworkBuildAdapter,
  loggerScopeId: string,
): Promise<string> {
  const Logger = getVitePressGroupLogger(
    VITEPRESS_BUILD_LOG_GROUPS.frameworkSsrBundle,
    loggerScopeId,
  );
  const renderElapsed = createElapsedTimer();
  try {
    const frameworkSSRHtml = await adapter.renderToString(
      ssrModuleComponent,
      Object.fromEntries(usedSnippet.props),
    );
    usedSnippet.ssrHtml = frameworkSSRHtml;
    Logger.success(
      `Rendered ${adapter.framework} component ${componentName} for render ID: ${renderId}`,
      renderElapsed(),
    );
    return frameworkSSRHtml;
  } catch (error) {
    const message = `failed to render component "${componentName}" for render ID ${renderId}: ${formatErrorMessage(error)}`;
    Logger.error(message, renderElapsed());
    throw new Error(message);
  }
}

async function processComponentRenders(
  ssrModuleComponent: unknown,
  ssrComponent: ComponentBundleInfo,
  usedSnippetContainer: Map<string, UsedSnippetContainerType>,
  adapter: UIFrameworkBuildAdapter,
  loggerScopeId: string,
  renderedComponents: Map<string, string>,
): Promise<void> {
  const pendingRenderIds = ssrComponent.pendingRenderIds;

  for (const [renderId, usedSnippet] of usedSnippetContainer) {
    if (pendingRenderIds.has(renderId)) {
      const html = await renderComponentForSnippet(
        ssrModuleComponent,
        renderId,
        usedSnippet,
        ssrComponent.componentName,
        adapter,
        loggerScopeId,
      );
      renderedComponents.set(renderId, html);
    }
  }
}

export async function executeSSRRender(
  chunk: OutputChunk,
  ssrComponents: ComponentBundleInfo[],
  ssrTempDir: string,
  adapter: UIFrameworkBuildAdapter,
  usedSnippetContainer: Map<string, UsedSnippetContainerType>,
  loggerScopeId: string,
  renderedComponents: Map<string, string>,
): Promise<void> {
  const Logger = getVitePressGroupLogger(
    VITEPRESS_BUILD_LOG_GROUPS.frameworkSsrBundle,
    loggerScopeId,
  );

  const ssrComponent = ssrComponents.find(
    (c) => c.componentName === chunk.name,
  );

  if (!ssrComponent) {
    return;
  }

  const bundlePath = resolve(ssrTempDir, chunk.fileName);
  const importElapsed = createElapsedTimer();
  let ssrModuleComponent: unknown;

  try {
    const ssrModule = await import(pathToFileURL(bundlePath).href);
    ssrModuleComponent = ssrModule.default;

    if (!ssrModuleComponent) {
      const message = `Component "${ssrComponent.componentName}" not found in SSR bundle`;
      Logger.error(message, importElapsed());
      throw new Error(message);
    }
  } catch (error) {
    const message = `failed to import SSR bundle for ${ssrComponent.componentName}: ${formatErrorMessage(error)}`;
    Logger.error(message, importElapsed());
    throw new Error(message);
  }

  await processComponentRenders(
    ssrModuleComponent,
    ssrComponent,
    usedSnippetContainer,
    adapter,
    loggerScopeId,
    renderedComponents,
  );
}
