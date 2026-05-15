import { VITEPRESS_RUNTIME_LOG_GROUPS } from '#shared/constants/log-groups/runtime';
import { RENDER_STRATEGY_CONSTANTS } from '@docs-islands/core/shared/constants/render-strategy';
import { GET_CLEAN_PATHNAME_RUNTIME } from '../../../shared/runtime';
import type { CreateUIFrameworkClientLoaderModuleSourceOptions } from '../../framework-build/adapter';

/**
 * React keeps ownership of the client loader runtime source so the generic
 * framework build layer does not need to understand React runtime bootstrapping
 * details.
 */
export function createReactClientLoaderModuleSource({
  base,
  cleanUrls,
  componentEntries,
}: CreateUIFrameworkClientLoaderModuleSourceOptions): string {
  const getCleanPathnameRuntime = GET_CLEAN_PATHNAME_RUNTIME.toString();
  const loaderEntries = componentEntries.map((entry) => ({
    componentName: entry.componentName,
    importedName: entry.loaderImportedName,
    modulePath: entry.modulePath,
  }));

  return `
import {
  formatDebugMessage as __docs_islands_format_debug__,
  formatErrorMessage as __docs_islands_format_error__
} from '@docs-islands/logger/helper';
import { createLogger } from '@docs-islands/vitepress/logger';

const Logger = createLogger({
  main: '@docs-islands/vitepress'
}).getLoggerByGroup('${VITEPRESS_RUNTIME_LOG_GROUPS.reactClientLoader}');
const __log_client_loader_debug__ = (payload) => {
  Logger.debug(__docs_islands_format_debug__(payload));
};
const __log_client_loader_error__ = (message, elapsedTimeMs = 0) => {
  Logger.error(message, { elapsedTimeMs });
};

const getPageId = ${getCleanPathnameRuntime};

const componentEntries = ${JSON.stringify(loaderEntries, null, 2)};

const resolveComponentExport = (module, importedName) => {
  if (importedName === 'default') {
    return module.default;
  }
  if (importedName === '*') {
    return module;
  }
  return module[importedName];
};

(async function() {
  const loadStartedAt =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  const pageId = getPageId(${JSON.stringify(base)}, ${JSON.stringify(cleanUrls)});

  const componentManager = window["${RENDER_STRATEGY_CONSTANTS.componentManager}"];
  if (!componentManager) {
    throw new Error('DocsComponentManager is not initialized');
  }

  await componentManager.subscribeRuntimeReady();
  const injectComponent = window["${RENDER_STRATEGY_CONSTANTS.injectComponent}"];
  if (!injectComponent) {
    throw new Error('ReactComponentRegistry is not initialized');
  }

  if (!injectComponent[pageId]) {
    injectComponent[pageId] = {};
  }

  /**
   * Before dynamically importing React components, make sure the framework
   * runtime has been attached globally. React component parsing still depends
   * on that runtime being ready before the emitted chunks execute.
   */
  await componentManager.ensureFrameworkRuntime();

  const loadResults = await Promise.allSettled(
    componentEntries.map(async ({ componentName: name, modulePath, importedName }) => {
      try {
        const module = await import(/* @vite-ignore */ modulePath);
        const Component = resolveComponentExport(module, importedName);
        if (!Component) {
          return { name, success: false };
        }

        if (!injectComponent[pageId][name]) {
          injectComponent[pageId][name] = {};
        }

        /**
         * In production, unlike development, we only need the resolved component
         * reference. HMR metadata such as source path or import name stays in
         * the dev runtime and should not leak into emitted page loaders.
         */
        injectComponent[pageId][name].component = Component;
        componentManager.notifyComponentLoaded(pageId, name);
        return { name, success: true };
      } catch (error) {
        __log_client_loader_error__(
          'Failed to load component ' + name + ': ' + __docs_islands_format_error__(error)
        );
        return { name, success: false };
      }
    })
  );

  const successCount = loadResults.filter(result =>
    result.status === 'fulfilled' && result.value.success
  ).length;

  __log_client_loader_debug__({
    context: 'react client loader',
    decision: 'register resolved components for the current page runtime',
    summary: {
      pageId,
      successCount,
      totalCount: componentEntries.length
    },
    timingMs: Number((((typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now()) - loadStartedAt)).toFixed(2))
  });
})();
  `.trim();
}
