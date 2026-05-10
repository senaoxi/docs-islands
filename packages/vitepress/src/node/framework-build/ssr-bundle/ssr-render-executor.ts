import type {
  ComponentBundleInfo,
  UsedSnippetContainerType,
} from '#dep-types/component';
import type { OutputChunk } from '#dep-types/rollup';
import { VITEPRESS_BUILD_LOG_GROUPS } from '#shared/constants/log-groups/build';
import { createElapsedLogOptions } from '@docs-islands/logger/helper';
import { pathToFileURL } from 'node:url';
import { resolve } from 'pathe';
import { getVitePressGroupLogger } from '../../logger';
import type { UIFrameworkBuildAdapter } from '../adapter';

const elapsedSince = (startTimeMs: number) =>
  createElapsedLogOptions(startTimeMs, Date.now());

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
  const renderStartedAt = Date.now();
  try {
    const frameworkSSRHtml = await adapter.renderToString(
      ssrModuleComponent,
      Object.fromEntries(usedSnippet.props),
    );
    usedSnippet.ssrHtml = frameworkSSRHtml;
    Logger.success(
      `Rendered ${adapter.framework} component ${componentName} for render ID: ${renderId}`,
      elapsedSince(renderStartedAt),
    );
    return frameworkSSRHtml;
  } catch (error) {
    Logger.error(
      `Error rendering component "${componentName}" for render ID ${renderId}: ${error}`,
      elapsedSince(renderStartedAt),
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
  const importStartedAt = Date.now();

  try {
    const ssrModule = await import(pathToFileURL(bundlePath).href);
    const ssrModuleComponent = ssrModule.default;

    if (!ssrModuleComponent) {
      Logger.warn(
        `Component "${ssrComponent.componentName}" not found in bundle`,
        elapsedSince(importStartedAt),
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
      `Failed to import SSR bundle for ${ssrComponent.componentName}: ${error}`,
      elapsedSince(importStartedAt),
    );
  }
}
