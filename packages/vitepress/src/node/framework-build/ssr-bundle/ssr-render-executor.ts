import type {
  ComponentBundleInfo,
  UsedSnippetContainerType,
} from '#dep-types/component';
import type { OutputChunk } from '#dep-types/rollup';
import { VITEPRESS_BUILD_LOG_GROUPS } from '#shared/constants/log-groups/build';
import {
  createElapsedTimer,
  formatErrorMessage,
} from '@docs-islands/logger/helper';
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
): Promise<string | null> {
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
    Logger.error(
      `failed to render component "${componentName}" for render ID ${renderId}: ${formatErrorMessage(error)}`,
      renderElapsed(),
    );
    return null;
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
      if (html) {
        renderedComponents.set(renderId, html);
      }
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

  try {
    const ssrModule = await import(pathToFileURL(bundlePath).href);
    const ssrModuleComponent = ssrModule.default;

    if (!ssrModuleComponent) {
      Logger.warn(
        `Component "${ssrComponent.componentName}" not found in bundle`,
        importElapsed(),
      );
      return;
    }

    await processComponentRenders(
      ssrModuleComponent,
      ssrComponent,
      usedSnippetContainer,
      adapter,
      loggerScopeId,
      renderedComponents,
    );
  } catch (error) {
    Logger.error(
      `failed to import SSR bundle for ${ssrComponent.componentName}: ${formatErrorMessage(error)}`,
      importElapsed(),
    );
  }
}
