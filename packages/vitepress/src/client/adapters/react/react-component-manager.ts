import type { PageBuildMetrics, PageMetafile } from '#dep-types/page';
import { VITEPRESS_RUNTIME_LOG_GROUPS } from '#shared/constants/log-groups/runtime';
import {
  createSiteDevToolsLogger,
  dispatchSiteDevToolsPageMetafileEvent,
  getSiteDevToolsNow,
} from '#shared/internal/devtools';
import { DocsComponentManager } from '@docs-islands/core/client';
import type { DocsComponentManagerInitializeOptions } from '@docs-islands/core/types/client';
import {
  createElapsedTimer,
  formatDebugMessage,
  formatErrorMessage,
} from '@docs-islands/logger/helper';
import { createLogger } from '@docs-islands/vitepress/logger';
import type React from 'react';
import { getCleanPathname } from '../../../shared/runtime';

const loggerInstance = createLogger({
  main: '@docs-islands/vitepress',
});
const Logger = loggerInstance.getLoggerByGroup(
  VITEPRESS_RUNTIME_LOG_GROUPS.reactComponentManager,
);
const DebugLogger = createSiteDevToolsLogger('react-component-manager');

type ReactComponentRecord = React.ComponentType<Record<string, string>>;

const summarizePageMetafile = (pageMetafile: PageMetafile | null) => ({
  componentCount: pageMetafile?.buildMetrics?.components.length ?? 0,
  cssBundleCount: pageMetafile?.cssBundlePaths.length ?? 0,
  hasLoaderScript: Boolean(pageMetafile?.loaderScript),
  hasSsrInjectScript: Boolean(pageMetafile?.ssrInjectScript),
  modulePreloadCount: pageMetafile?.modulePreloads.length ?? 0,
  totalEstimatedComponentBytes:
    pageMetafile?.buildMetrics?.totalEstimatedComponentBytes ?? 0,
});

export class ReactComponentManager {
  private readonly manager: DocsComponentManager<
    ReactComponentRecord,
    PageBuildMetrics
  >;
  private initializationMode: 'dev' | 'prod' | null = null;
  private reactLoadPromise: Promise<boolean> | null = null;
  private reactLoaded = false;
  private elapsed = createElapsedTimer();

  public constructor() {
    /**
     * Core now owns the generic docs-runtime responsibilities: page metafile loading,
     * runtime/component subscriptions, CSS synchronization, and loader-script orchestration.
     *
     * The React wrapper intentionally stays thin and only layers on React-specific runtime
     * loading plus the existing VitePress site-devtools hooks that users already rely on.
     */
    this.manager = new DocsComponentManager<
      ReactComponentRecord,
      PageBuildMetrics
    >({
      ensureFrameworkRuntime: () => this.loadReact(),
      framework: 'react',
      getCurrentPageId: () => getCleanPathname(),
      hooks: {
        onEvent: ({ level, message, payload }) => {
          switch (level) {
            case 'error': {
              DebugLogger.error(message, payload);
              break;
            }
            case 'warn': {
              DebugLogger.warn(message, payload);
              break;
            }
            default: {
              DebugLogger.info(message, payload);
            }
          }
        },
        onPageMetafileEvent: (detail) => {
          dispatchSiteDevToolsPageMetafileEvent(detail);
        },
      },
      isFrameworkRuntimeAvailable: () => this.isReactAvailable(),
      summarizePageMetafile,
    });
  }

  public async initialize(
    options: DocsComponentManagerInitializeOptions,
  ): Promise<void> {
    const canLogInitialization = globalThis.window !== undefined;
    const initializeStartedAt = getSiteDevToolsNow();

    await this.manager.initialize(options);

    if (!canLogInitialization || this.initializationMode) {
      return;
    }

    /**
     * Keep the historical React runtime success logs at the wrapper level.
     * The generic manager already reports a core "runtime initialized" event, but the
     * React-specific success message is part of the existing debugging/test contract.
     */
    this.initializationMode = options.mode;
    const initializeCompletedAt = getSiteDevToolsNow();
    Logger.debug(
      formatDebugMessage({
        context: 'react component manager initialization',
        decision:
          'record wrapper initialization state after shared runtime ready',
        summary: {
          mode: options.mode,
          pageId: getCleanPathname(),
          reactLoaded: this.reactLoaded || this.isReactAvailable(),
        },
        timingMs: Number(
          (initializeCompletedAt - initializeStartedAt).toFixed(2),
        ),
      }),
    );
    DebugLogger.info(
      options.mode === 'dev'
        ? 'runtime initialized in development'
        : 'runtime initialized in production',
      {
        mode: options.mode,
      },
    );
  }

  private isReactAvailable(): boolean {
    return (
      globalThis.window !== undefined &&
      globalThis.React !== undefined &&
      globalThis.ReactDOM !== undefined &&
      typeof globalThis.React.createElement === 'function' &&
      typeof globalThis.ReactDOM.createRoot === 'function' &&
      typeof globalThis.ReactDOM.hydrateRoot === 'function'
    );
  }

  private async performReactLoad(): Promise<boolean> {
    if (globalThis.window === undefined) {
      Logger.warn(
        'React can only be loaded in browser environment',
        this.elapsed(),
      );
      return false;
    }

    const loadUIFrameWorkElapsed = createElapsedTimer();

    try {
      Logger.debug(
        formatDebugMessage({
          context: 'react framework runtime load',
          decision: 'begin lazy React and ReactDOM imports',
          summary: {
            pageId: getCleanPathname(),
            reactAvailable: this.isReactAvailable(),
            reactLoaded: this.reactLoaded,
          },
          timingMs: 0,
        }),
      );
      DebugLogger.info('react runtime load started');

      /**
       * React is still loaded lazily from the wrapper so future UI frameworks can provide
       * their own runtime acquisition strategy without teaching the shared manager about them.
       */
      const [reactModule, reactDOMModule] = await Promise.all([
        import('react'),
        import('react-dom/client'),
      ]);

      globalThis.React = reactModule.default || reactModule;
      globalThis.ReactDOM = reactDOMModule.default || reactDOMModule;

      if (!this.isReactAvailable()) {
        Logger.error(
          'Failed to load React or ReactDOM',
          loadUIFrameWorkElapsed(),
        );
        return false;
      }

      this.reactLoaded = true;
      Logger.debug(
        formatDebugMessage({
          context: 'react framework runtime load',
          decision: 'mark React runtime ready after lazy imports resolved',
          summary: {
            pageId: getCleanPathname(),
            reactAvailable: this.isReactAvailable(),
            reactVersion: globalThis.React?.version ?? null,
          },
          timingMs: Number(loadUIFrameWorkElapsed().elapsedTimeMs.toFixed(2)),
        }),
      );
      DebugLogger.info('react runtime load completed', {
        durationMs: Number(loadUIFrameWorkElapsed().elapsedTimeMs.toFixed(2)),
        reactVersion: globalThis.React?.version ?? null,
      });
      return true;
    } catch (error) {
      Logger.error(
        `React lazy loading failed, message: ${formatErrorMessage(error)}`,
        loadUIFrameWorkElapsed(),
      );
      DebugLogger.error('react runtime load failed', {
        durationMs: Number(loadUIFrameWorkElapsed().elapsedTimeMs).toFixed(2),
        message: formatErrorMessage(error),
      });
      this.reactLoadPromise = null;
      return false;
    }
  }

  public async initializeInDev(): Promise<void> {
    await this.manager.initialize({
      mode: 'dev',
    });
  }

  public async initializeInProd(): Promise<void> {
    if (globalThis.window === undefined) {
      return;
    }

    /**
     * Production now relies on the hashed page metafile manifest emitted at build
     * time. The manifest index plus the current-page metafile meta tag are the
     * only supported sources of truth for preloads and route-transition data.
     */
    await this.manager.initialize({
      currentPageId: getCleanPathname(),
      mode: 'prod',
      mpa: import.meta.env.MPA,
      preferInjectedCurrentMeta: true,
      preloadCurrentPage: !import.meta.env.MPA,
    });
  }

  public async ensureFrameworkRuntime(): Promise<boolean> {
    return this.loadReact();
  }

  public async loadReact(): Promise<boolean> {
    if (this.reactLoaded || this.isReactAvailable()) {
      this.reactLoaded = true;
      return true;
    }

    if (this.reactLoadPromise) {
      return this.reactLoadPromise;
    }

    this.reactLoadPromise = this.performReactLoad();
    return this.reactLoadPromise;
  }

  public async loadPageMetafileIndex(): Promise<void> {
    await this.manager.loadPageMetafileIndex();
  }

  public async ensurePageMetafile(
    pathname: string,
    options?: {
      preferInjectedCurrentMeta?: boolean;
    },
  ): Promise<PageMetafile | null> {
    return this.manager.ensurePageMetafile(pathname, options);
  }

  public getAllInitialModulePreloadScripts(): string[] {
    return this.manager.getAllInitialModulePreloadScripts();
  }

  public getPageComponentInfo(pathname: string): PageMetafile | null {
    return this.manager.getPageComponentInfo(pathname);
  }

  public async loadPageComponents(pageId?: string): Promise<boolean> {
    return this.manager.loadPageComponents(pageId);
  }

  public async subscribeComponent(
    pageId: string,
    componentName: string,
    timeout?: number,
  ): Promise<boolean> {
    return this.manager.subscribeComponent(pageId, componentName, timeout);
  }

  public async subscribeRuntimeReady(timeout?: number): Promise<boolean> {
    return this.manager.subscribeRuntimeReady(timeout);
  }

  public notifyRuntimeReady(): void {
    this.manager.notifyRuntimeReady();
  }

  public notifyComponentLoaded(pageId: string, componentName: string): void {
    this.manager.notifyComponentLoaded(pageId, componentName);
  }

  public notifyComponentsLoaded(
    pageId: string,
    componentNames: string[],
  ): void {
    this.manager.notifyComponentsLoaded(pageId, componentNames);
  }

  public isComponentLoaded(key: string): boolean {
    return this.manager.isComponentLoaded(key);
  }

  public getComponent(
    pageId: string,
    componentName: string,
  ): ReactComponentRecord | null {
    return this.manager.getComponent(pageId, componentName);
  }

  public clearPageSubscriptions(pageId: string): void {
    this.manager.clearPageSubscriptions(pageId);
  }

  public reset(): void {
    this.manager.reset();
  }

  public destroy(): void {
    this.manager.destroy();
    this.reactLoadPromise = null;
    this.reactLoaded = false;
  }

  public isReactLoaded(): boolean {
    return this.reactLoaded && this.isReactAvailable();
  }
}

export const reactComponentManager: ReactComponentManager =
  new ReactComponentManager();
