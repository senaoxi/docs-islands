import type {
  ComponentBundleInfo,
  UsedSnippetContainerType,
} from '#dep-types/component';
import type { ConfigType } from '#dep-types/utils';
import { VITEPRESS_BUILD_LOG_GROUPS } from '#shared/constants/log-groups/build';
import { createElapsedLogOptions } from '@docs-islands/logger/helper';
import fs from 'node:fs';
import { join } from 'pathe';
import { getVitePressGroupLogger } from '../logger';
import type { UIFrameworkBuildAdapter } from './adapter';
import { createComponentEntryModules } from './shared';
import { orchestrateSSRBundle } from './ssr-bundle/ssr-bundle-orchestrator.js';

const elapsedSince = (startTimeMs: number) =>
  createElapsedLogOptions(startTimeMs, Date.now());

export async function bundleUIComponentsForSSR(
  config: ConfigType,
  ssrComponents: ComponentBundleInfo[],
  usedSnippetContainer: Map<string, UsedSnippetContainerType>,
  adapter: UIFrameworkBuildAdapter,
  loggerScopeId: string,
): Promise<{
  renderedComponents: Map<string, string>;
}> {
  const bundleStartedAt = Date.now();
  const Logger = getVitePressGroupLogger(
    VITEPRESS_BUILD_LOG_GROUPS.frameworkSsrBundle,
    loggerScopeId,
  );
  const { base, srcDir, assetsDir, cacheDir } = config;
  /**
   * Needs to be built concurrently with MPA mode.
   * Using the same directory will cause the latter to overwrite the former.
   * So we need to use a temporary directory for each build.
   */
  const ssrTempDir = join(cacheDir, `ssr-temp-${Date.now()}`);
  if (ssrComponents.length === 0) {
    return { renderedComponents: new Map() };
  }

  const preparedEntryModules = createComponentEntryModules({
    cacheDir,
    components: ssrComponents,
    namespace: 'ssr',
  });

  try {
    const renderedComponents = await orchestrateSSRBundle({
      srcDir,
      base,
      ssrTempDir,
      assetsDir,
      entryPoints: preparedEntryModules.entryPoints,
      adapter,
      loggerScopeId,
      ssrComponents,
      usedSnippetContainer,
    });

    return { renderedComponents };
  } catch (error) {
    Logger.error(
      `Failed to bundle ${adapter.framework} SSR components: ${error}`,
      elapsedSince(bundleStartedAt),
    );
    throw error;
  } finally {
    fs.rmSync(ssrTempDir, { recursive: true, force: true });
    fs.rmSync(preparedEntryModules.tempEntryDir, {
      recursive: true,
      force: true,
    });
  }
}
