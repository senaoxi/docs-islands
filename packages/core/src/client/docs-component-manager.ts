import { createLogger } from '@docs-islands/utils/logger';
import { createElapsedTimer, formatErrorMessage } from 'logaria/helper';
import type { LoggerElapsedLogOptions } from 'logaria/types';
import { getFrameworkComponentManagerLogGroup } from '../shared/constants/log-groups/runtime';
import { PAGE_METAFILE_META_NAMES } from '../shared/constants/page-metafile';
import { RENDER_STRATEGY_CONSTANTS } from '../shared/constants/render-strategy';
import type {
  DocsComponentManagerHooks,
  DocsComponentManagerInitializeOptions,
  DocsComponentRecord,
  DocsInjectComponent,
} from '../types/client';
import type { PageMetafile, PageMetafileManifest } from '../types/page';
import {
  ensureModulePreloads,
  prefetchScripts,
  synchronizePageCssBundles,
} from './dom';

declare const __BASE__: string | undefined;

interface ComponentSubscription {
  reject: (error: Error) => void;
  resolve: (value: boolean) => void;
  elapsed: () => LoggerElapsedLogOptions;
}

interface RuntimeSubscription {
  reject: (error: Error) => void;
  resolve: (value: boolean) => void;
  elapsed: () => LoggerElapsedLogOptions;
}

export interface DocsComponentManagerOptions<TBuildMetrics = unknown> {
  ensureFrameworkRuntime: () => Promise<boolean>;
  framework: string;
  getCurrentPageId: () => string;
  hooks?: DocsComponentManagerHooks<TBuildMetrics>;
  isFrameworkRuntimeAvailable: () => boolean;
  resolveRequestUrl?: (targetUrl: string) => string;
  summarizePageMetafile?: (
    pageMetafile: PageMetafile<TBuildMetrics> | null,
  ) => Record<string, unknown>;
}

type DocsRuntimeWindow<TComponent> = Window & {
  [RENDER_STRATEGY_CONSTANTS.componentManager]?: unknown;
  [RENDER_STRATEGY_CONSTANTS.injectComponent]?: DocsInjectComponent<TComponent>;
};

const loggerInstance = createLogger({
  main: '@docs-islands/core',
});

export class DocsComponentManager<TComponent, TBuildMetrics = unknown> {
  private readonly loadedComponents = new Map<
    string,
    DocsComponentRecord<TComponent>
  >();
  private readonly loadingPageMetafiles = new Map<
    string,
    Promise<PageMetafile<TBuildMetrics> | null>
  >();
  private readonly subscriptions = new Map<string, ComponentSubscription[]>();
  private readonly runtimeSubscriptions: RuntimeSubscription[] = [];
  private readonly Logger;
  private isInitialized = false;
  private readonly options: DocsComponentManagerOptions<TBuildMetrics>;
  private pageMetafile: Record<string, PageMetafile<TBuildMetrics>> = {};
  private pageMetafileBuildId: string | null = null;
  private pageMetafileIndex: PageMetafileManifest['pages'] = {};
  private pageMetafileIndexLoaded = false;

  public constructor(options: DocsComponentManagerOptions<TBuildMetrics>) {
    this.options = options;
    this.Logger = loggerInstance.getLoggerByGroup(
      getFrameworkComponentManagerLogGroup(options.framework),
    );
    this.ensureGlobalBindings();
  }

  private emitEvent(
    level: 'error' | 'info' | 'warn',
    message: string,
    payload?: unknown,
    elapsed?: () => LoggerElapsedLogOptions,
  ): void {
    if (level === 'error') {
      this.Logger.error(message, elapsed?.());
    } else {
      this.Logger[level](message, elapsed?.());
    }
    this.options.hooks?.onEvent?.({
      level,
      message,
      payload,
      scope: getFrameworkComponentManagerLogGroup(this.options.framework),
    });
  }

  private summarizePageMetafile(
    pageMetafile: PageMetafile<TBuildMetrics> | null,
  ): Record<string, unknown> {
    if (this.options.summarizePageMetafile) {
      return this.options.summarizePageMetafile(pageMetafile);
    }

    const buildMetrics = pageMetafile?.buildMetrics as
      | {
          components?: unknown[];
          totalEstimatedComponentBytes?: number;
        }
      | undefined;

    return {
      componentCount: buildMetrics?.components?.length ?? 0,
      cssBundleCount: pageMetafile?.cssBundlePaths.length ?? 0,
      hasLoaderScript: Boolean(pageMetafile?.loaderScript),
      hasSsrInjectScript: Boolean(pageMetafile?.ssrInjectScript),
      modulePreloadCount: pageMetafile?.modulePreloads.length ?? 0,
      totalEstimatedComponentBytes:
        buildMetrics?.totalEstimatedComponentBytes ?? 0,
    };
  }

  private getRuntimeWindow(): DocsRuntimeWindow<TComponent> | null {
    if (globalThis.window === undefined) {
      return null;
    }

    return globalThis.window as unknown as DocsRuntimeWindow<TComponent>;
  }

  private getWindowPageMetafiles(
    runtimeWindow: DocsRuntimeWindow<TComponent>,
  ): Record<string, PageMetafile<TBuildMetrics>> {
    return (
      (
        runtimeWindow as unknown as {
          [RENDER_STRATEGY_CONSTANTS.pageMetafile]?: Record<
            string,
            PageMetafile<TBuildMetrics>
          >;
        }
      )[RENDER_STRATEGY_CONSTANTS.pageMetafile] || {}
    );
  }

  private setWindowPageMetafiles(
    runtimeWindow: DocsRuntimeWindow<TComponent>,
    pageMetafiles: Record<string, PageMetafile<TBuildMetrics>>,
  ): void {
    (
      runtimeWindow as unknown as {
        [RENDER_STRATEGY_CONSTANTS.pageMetafile]?: Record<
          string,
          PageMetafile<TBuildMetrics>
        >;
      }
    )[RENDER_STRATEGY_CONSTANTS.pageMetafile] = pageMetafiles;
  }

  private defaultResolveRequestUrl(targetUrl: string): string {
    const baseUrl = typeof __BASE__ === 'string' ? __BASE__ : '/';

    if (/^(?:[a-z]+:)?\/\//i.test(targetUrl) || targetUrl.startsWith('/')) {
      return targetUrl;
    }

    return baseUrl.endsWith('/')
      ? `${baseUrl}${targetUrl}`
      : `${baseUrl}/${targetUrl}`;
  }

  private resolveRequestUrl(targetUrl: string): string {
    return (
      this.options.resolveRequestUrl?.(targetUrl) ??
      this.defaultResolveRequestUrl(targetUrl)
    );
  }

  private emitPageMetafileEvent(
    detail: Parameters<
      NonNullable<
        DocsComponentManagerHooks<TBuildMetrics>['onPageMetafileEvent']
      >
    >[0],
  ): void {
    this.options.hooks?.onPageMetafileEvent?.(detail);
  }

  private setupGlobalComponents(): void {
    const runtimeWindow = this.getRuntimeWindow();

    if (
      runtimeWindow &&
      !runtimeWindow[RENDER_STRATEGY_CONSTANTS.injectComponent]
    ) {
      runtimeWindow[RENDER_STRATEGY_CONSTANTS.injectComponent] = {};
    }
  }

  private setupComponentManager(): void {
    const runtimeWindow = this.getRuntimeWindow();

    if (
      runtimeWindow &&
      !runtimeWindow[RENDER_STRATEGY_CONSTANTS.componentManager]
    ) {
      runtimeWindow[RENDER_STRATEGY_CONSTANTS.componentManager] = this;
    }
  }

  private ensureGlobalBindings(): void {
    this.setupComponentManager();
    this.setupGlobalComponents();
  }

  private getInjectedPageMetafileUrl(metaName: string): string | null {
    const runtimeWindow = this.getRuntimeWindow();
    if (!runtimeWindow) {
      return null;
    }

    const injectedValue = runtimeWindow.document
      .querySelector(`meta[name="${metaName}"]`)
      ?.getAttribute('content')
      ?.trim();

    return injectedValue || null;
  }

  private syncPageMetafileCacheFromWindow(): void {
    const runtimeWindow = this.getRuntimeWindow();
    if (runtimeWindow) {
      this.pageMetafile = this.getWindowPageMetafiles(runtimeWindow);
    }
  }

  private resetPageMetafileState(): void {
    this.pageMetafile = {};
    this.pageMetafileBuildId = null;
    this.pageMetafileIndex = {};
    this.pageMetafileIndexLoaded = true;

    const runtimeWindow = this.getRuntimeWindow();
    if (runtimeWindow) {
      this.setWindowPageMetafiles(runtimeWindow, {});
    }

    this.emitPageMetafileEvent({
      buildId: null,
      kind: 'state-reset',
      pageCount: 0,
      pageMetafile: null,
    });
  }

  private cachePageMetafile(
    pathname: string,
    pageMetafile: PageMetafile<TBuildMetrics>,
  ): void {
    const runtimeWindow = this.getRuntimeWindow();

    if (runtimeWindow) {
      const cachedPageMetafiles = this.getWindowPageMetafiles(runtimeWindow);

      cachedPageMetafiles[pathname] = pageMetafile;
      this.setWindowPageMetafiles(runtimeWindow, cachedPageMetafiles);
      this.pageMetafile = cachedPageMetafiles;
    } else {
      this.pageMetafile[pathname] = pageMetafile;
    }

    this.emitPageMetafileEvent({
      buildId: pageMetafile.buildId ?? this.pageMetafileBuildId,
      kind: 'page-loaded',
      pageCount: Object.keys(this.pageMetafile).length,
      pageId: pathname,
      pageMetafile,
    });
  }

  private async loadPageMetafile(
    pathname: string,
    requestUrl: string,
  ): Promise<PageMetafile<TBuildMetrics> | null> {
    try {
      const response = await fetch(this.resolveRequestUrl(requestUrl));

      if (!response.ok) {
        throw new Error(
          `Page metafile request failed with status ${response.status}`,
        );
      }

      const pageMetafile =
        (await response.json()) as PageMetafile<TBuildMetrics>;

      if (
        this.pageMetafileBuildId &&
        typeof pageMetafile.buildId === 'string' &&
        pageMetafile.buildId !== this.pageMetafileBuildId
      ) {
        this.emitEvent('warn', 'page metafile build mismatch detected', {
          buildId: pageMetafile.buildId,
          expectedBuildId: this.pageMetafileBuildId,
          pageId: pathname,
        });
      }

      this.cachePageMetafile(pathname, pageMetafile);
      this.emitEvent('info', 'page metafile loaded', {
        pageId: pathname,
        ...this.summarizePageMetafile(pageMetafile),
      });

      return pageMetafile;
    } catch (error) {
      this.emitEvent('warn', 'page metafile load failed', {
        message: formatErrorMessage(error),
        pageId: pathname,
      });
      return null;
    }
  }

  public async ensurePageMetafile(
    pathname: string,
    options?: {
      preferInjectedCurrentMeta?: boolean;
    },
  ): Promise<PageMetafile<TBuildMetrics> | null> {
    this.syncPageMetafileCacheFromWindow();

    if (this.pageMetafile[pathname]) {
      return this.pageMetafile[pathname] || null;
    }

    await this.loadPageMetafileIndex();

    if (this.pageMetafile[pathname]) {
      return this.pageMetafile[pathname] || null;
    }

    const pendingPageMetafile = this.loadingPageMetafiles.get(pathname);
    if (pendingPageMetafile) {
      return pendingPageMetafile;
    }

    let requestUrl = options?.preferInjectedCurrentMeta
      ? this.getInjectedPageMetafileUrl(PAGE_METAFILE_META_NAMES.current)
      : null;

    if (!requestUrl) {
      requestUrl = this.pageMetafileIndex[pathname]?.file || null;
    }

    if (!requestUrl) {
      return null;
    }

    const loadPromise = this.loadPageMetafile(pathname, requestUrl);
    this.loadingPageMetafiles.set(pathname, loadPromise);

    try {
      return await loadPromise;
    } finally {
      this.loadingPageMetafiles.delete(pathname);
    }
  }

  private isRuntimeReady(): boolean {
    const runtimeWindow = this.getRuntimeWindow();

    return (
      this.isInitialized &&
      runtimeWindow !== null &&
      runtimeWindow[RENDER_STRATEGY_CONSTANTS.componentManager] === this &&
      Boolean(runtimeWindow[RENDER_STRATEGY_CONSTANTS.injectComponent])
    );
  }

  private rejectSubscriptions(key: string, error: Error): void {
    const subscribers = this.subscriptions.get(key);
    if (!subscribers) {
      return;
    }

    for (const subscriber of subscribers) {
      try {
        subscriber.reject(error);
      } catch (rejectionError) {
        this.Logger.error(
          `Subscription rejection handling error, message: ${formatErrorMessage(rejectionError)}`,
          subscriber.elapsed(),
        );
      }
    }

    this.subscriptions.delete(key);
  }

  private rejectRuntimeSubscriptions(error: Error): void {
    if (this.runtimeSubscriptions.length === 0) {
      return;
    }

    const subscribers = [...this.runtimeSubscriptions];
    this.runtimeSubscriptions.length = 0;

    for (const subscriber of subscribers) {
      try {
        subscriber.reject(error);
      } catch (rejectionError) {
        this.Logger.error(
          `Runtime subscription rejection handling error, message: ${formatErrorMessage(rejectionError)}`,
          subscriber.elapsed(),
        );
      }
    }
  }

  public async initialize(
    initializeOptions: DocsComponentManagerInitializeOptions,
  ): Promise<void> {
    if (initializeOptions.mode === 'prod' && globalThis.window === undefined) {
      return;
    }

    this.ensureGlobalBindings();

    if (this.isInitialized) {
      this.Logger.warn('Already initialized');
      return;
    }

    /**
     * The docs runtime keeps the build-time page metafile in front of the UI framework layer.
     *
     * In production, this allows the current page to bootstrap with only the loader/runtime data
     * it actually needs, while still caching the cross-page manifest for later route transitions.
     *
     * Framework adapters stay responsible for "when to render", but the shared manager owns
     * "what assets and component metadata must be ready before rendering can succeed".
     */
    if (initializeOptions.mode === 'prod' && !initializeOptions.mpa) {
      const currentPageId =
        initializeOptions.currentPageId ?? this.options.getCurrentPageId();

      await this.loadPageMetafileIndex();
      await this.ensurePageMetafile(currentPageId, {
        preferInjectedCurrentMeta:
          initializeOptions.preferInjectedCurrentMeta ?? true,
      });

      if (initializeOptions.preloadCurrentPage ?? true) {
        this.applyInitialModulePreloads(currentPageId);
      }
    }

    this.isInitialized = true;
    this.notifyRuntimeReady();
    this.emitEvent('info', 'runtime initialized', {
      mode: initializeOptions.mode,
      pageCount: Object.keys(this.pageMetafile).length,
    });
  }

  public async loadPageMetafileIndex(): Promise<void> {
    this.syncPageMetafileCacheFromWindow();

    if (this.pageMetafileIndexLoaded) {
      return;
    }

    const injectedIndexUrl = this.getInjectedPageMetafileUrl(
      PAGE_METAFILE_META_NAMES.index,
    );

    if (!injectedIndexUrl) {
      this.emitEvent('warn', 'page metafile index meta missing');
      this.resetPageMetafileState();
      return;
    }

    try {
      const response = await fetch(this.resolveRequestUrl(injectedIndexUrl));

      if (!response.ok) {
        throw new Error(
          `Page metafile index request failed with status ${response.status}`,
        );
      }

      const pageMetafileManifest =
        (await response.json()) as Partial<PageMetafileManifest>;

      if (
        pageMetafileManifest == null ||
        typeof pageMetafileManifest !== 'object' ||
        pageMetafileManifest.pages == null ||
        typeof pageMetafileManifest.pages !== 'object'
      ) {
        throw new Error('Page metafile index payload is invalid.');
      }

      this.pageMetafileBuildId =
        typeof pageMetafileManifest.buildId === 'string'
          ? pageMetafileManifest.buildId
          : null;
      this.pageMetafileIndex = pageMetafileManifest.pages;
      this.pageMetafileIndexLoaded = true;

      const runtimeWindow = this.getRuntimeWindow();
      if (runtimeWindow) {
        this.setWindowPageMetafiles(runtimeWindow, this.pageMetafile);
      }

      this.emitEvent('info', 'page metafile index loaded', {
        buildId: this.pageMetafileBuildId,
        pageCount: Object.keys(this.pageMetafileIndex).length,
        schemaVersion:
          typeof pageMetafileManifest.schemaVersion === 'number'
            ? pageMetafileManifest.schemaVersion
            : null,
      });
    } catch (error) {
      this.emitEvent('warn', 'page metafile index load failed', {
        message: formatErrorMessage(error),
      });
      this.resetPageMetafileState();
    }
  }

  public applyInitialModulePreloads(pageId: string): void {
    /**
     * Keep the staged preload behavior from the original framework-specific runtime:
     *
     * 1. The current page already has its loader and optional SSR inject script in flight.
     * 2. After initialization, eagerly prefetch the equivalent scripts for other pages.
     * 3. Page-specific component chunks are still loaded just in time by loadPageComponents().
     *
     * This keeps initial navigation light while improving the odds that the next route switch
     * already has the framework runtime entrypoints cached.
     */
    const initialModulePreloads = this.getAllInitialModulePreloadScripts();
    const currentPageMetafile = this.getPageComponentInfo(pageId);
    const prefetchScriptLinks = new Set(initialModulePreloads);

    if (currentPageMetafile) {
      const { loaderScript, ssrInjectScript } = currentPageMetafile;
      prefetchScriptLinks.delete(loaderScript);
      if (ssrInjectScript) {
        prefetchScriptLinks.delete(ssrInjectScript);
      }
    }

    if (prefetchScriptLinks.size > 0) {
      prefetchScripts(prefetchScriptLinks);
    }
  }

  public ensureFrameworkRuntime(): Promise<boolean> {
    return this.options.ensureFrameworkRuntime();
  }

  public isFrameworkRuntimeLoaded(): boolean {
    return this.options.isFrameworkRuntimeAvailable();
  }

  public getAllInitialModulePreloadScripts(): string[] {
    const modulePreloadScripts = new Set<string>();

    if (Object.keys(this.pageMetafileIndex).length > 0) {
      for (const pageMetafileIndex of Object.values(this.pageMetafileIndex)) {
        if (pageMetafileIndex.loaderScript) {
          modulePreloadScripts.add(pageMetafileIndex.loaderScript);
        }
        if (pageMetafileIndex.ssrInjectScript) {
          modulePreloadScripts.add(pageMetafileIndex.ssrInjectScript);
        }
      }
    } else {
      for (const pathname of Object.keys(this.pageMetafile)) {
        const { loaderScript, ssrInjectScript } = this.pageMetafile[pathname];
        if (loaderScript) {
          modulePreloadScripts.add(loaderScript);
        }
        if (ssrInjectScript) {
          modulePreloadScripts.add(ssrInjectScript);
        }
      }
    }

    return [...modulePreloadScripts];
  }

  public getPageComponentInfo(
    pathname: string,
  ): PageMetafile<TBuildMetrics> | null {
    this.syncPageMetafileCacheFromWindow();
    return this.pageMetafile[pathname] || null;
  }

  public async loadPageComponents(
    pageId: string = this.options.getCurrentPageId(),
  ): Promise<boolean> {
    const componentInfo = await this.ensurePageMetafile(pageId);
    if (!componentInfo) {
      this.emitEvent('info', 'page component load skipped', {
        pageId,
        reason: 'page metafile not found',
      });
      return false;
    }

    const { cssBundlePaths, loaderScript, modulePreloads } = componentInfo;
    this.emitEvent('info', 'page component load started', {
      pageId,
      ...this.summarizePageMetafile(componentInfo),
    });

    const loadElapsed = createElapsedTimer();
    try {
      if (cssBundlePaths?.length > 0) {
        const syncResult = synchronizePageCssBundles(cssBundlePaths);
        if (
          syncResult.addedCssBundles > 0 ||
          syncResult.removedCssBundles > 0
        ) {
          this.emitEvent('info', 'page css bundles synchronized', {
            addedCssBundles: syncResult.addedCssBundles,
            pageId,
            removedCssBundles: syncResult.removedCssBundles,
          });
        }
      }

      if (!loaderScript) {
        return false;
      }

      const existingScript = document.querySelector(
        `script[src="${loaderScript}"]`,
      );
      if (existingScript) {
        this.emitEvent('info', 'page component load skipped', {
          pageId,
          reason: 'loader script already present',
        });
        return true;
      }

      /**
       * CSS must be synchronized before the framework mounts the component tree so that
       * hydration/client rendering observes the same style boundary as the server output.
       * The remaining JS chunks stay module-based and can be satisfied through preload hints.
       */
      if (modulePreloads?.length > 0) {
        ensureModulePreloads(modulePreloads);
      }

      const script = document.createElement('script');
      script.type = 'module';
      script.src = loaderScript;

      return await new Promise((resolve, reject) => {
        script.addEventListener('load', () => resolve(true));
        script.addEventListener('error', () => {
          reject(new Error(`Failed to load script: ${loaderScript}`));
        });
        document.head.append(script);
      });
    } catch (error) {
      this.emitEvent(
        'error',
        'page component load failed',
        {
          message: formatErrorMessage(error),
          pageId,
        },
        loadElapsed,
      );
      return false;
    }
  }

  public async subscribeComponent(
    pageId: string,
    componentName: string,
    timeout = 10_000,
  ): Promise<boolean> {
    this.ensureFrameworkRuntime().catch(() => false);

    const key = `${pageId}-${componentName}`;
    if (this.isComponentLoaded(key)) {
      return true;
    }

    return new Promise((resolve, reject) => {
      if (!this.subscriptions.has(key)) {
        this.subscriptions.set(key, []);
      }

      const timeoutId = setTimeout(() => {
        this.rejectSubscriptions(
          key,
          new Error(
            `Component subscription timeout: ${componentName} (${timeout}ms)`,
          ),
        );
      }, timeout);

      this.subscriptions.get(key)!.push({
        reject: (error) => {
          clearTimeout(timeoutId);
          reject(error);
        },
        resolve: (value) => {
          clearTimeout(timeoutId);
          resolve(value);
        },
        elapsed: createElapsedTimer(),
      });
    });
  }

  public async subscribeRuntimeReady(
    timeout: number = 10_000,
  ): Promise<boolean> {
    this.ensureGlobalBindings();

    if (this.isRuntimeReady()) {
      return true;
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.rejectRuntimeSubscriptions(
          new Error(`Runtime ready subscription timeout (${timeout}ms)`),
        );
      }, timeout);

      this.runtimeSubscriptions.push({
        reject: (error) => {
          clearTimeout(timeoutId);
          reject(error);
        },
        resolve: (value) => {
          clearTimeout(timeoutId);
          resolve(value);
        },
        elapsed: createElapsedTimer(),
      });
    });
  }

  public notifyRuntimeReady(): void {
    this.ensureGlobalBindings();

    if (!this.isRuntimeReady() || this.runtimeSubscriptions.length === 0) {
      return;
    }

    const subscribers = [...this.runtimeSubscriptions];
    this.runtimeSubscriptions.length = 0;

    for (const subscriber of subscribers) {
      try {
        subscriber.resolve(true);
      } catch (error) {
        this.Logger.error(
          `Runtime subscription callback execution error, message: ${formatErrorMessage(error)}`,
          subscriber.elapsed(),
        );
      }
    }
  }

  public notifyComponentLoaded(pageId: string, componentName: string): void {
    const key = `${pageId}-${componentName}`;
    const runtimeWindow = this.getRuntimeWindow();

    const notifyElapsed = createElapsedTimer();
    try {
      const component =
        runtimeWindow?.[RENDER_STRATEGY_CONSTANTS.injectComponent]?.[pageId]?.[
          componentName
        ]?.component ?? null;

      if (component) {
        this.loadedComponents.set(key, {
          component,
        });
      }

      const subscribers = this.subscriptions.get(key);
      if (!subscribers) {
        return;
      }

      for (const subscriber of subscribers) {
        try {
          subscriber.resolve(true);
        } catch (error) {
          this.Logger.error(
            `Subscription callback execution error, message: ${formatErrorMessage(error)}`,
            subscriber.elapsed(),
          );
        }
      }

      this.subscriptions.delete(key);
    } catch (error) {
      this.Logger.error(
        `Component load notification failed, message: ${formatErrorMessage(error)}`,
        notifyElapsed(),
      );
      this.rejectSubscriptions(key, new Error('Component loading failed'));
    }
  }

  public notifyComponentsLoaded(
    pageId: string,
    componentNames: string[],
  ): void {
    for (const componentName of componentNames) {
      this.notifyComponentLoaded(pageId, componentName);
    }
  }

  public isComponentLoaded(key: string): boolean {
    return this.loadedComponents.has(key);
  }

  public getComponent(
    pageId: string,
    componentName: string,
  ): TComponent | null {
    const runtimeWindow = this.getRuntimeWindow();

    return (
      runtimeWindow?.[RENDER_STRATEGY_CONSTANTS.injectComponent]?.[pageId]?.[
        componentName
      ]?.component ?? null
    );
  }

  public clearPageSubscriptions(pageId: string): void {
    const keysToDelete: string[] = [];

    for (const key of this.subscriptions.keys()) {
      if (key.startsWith(`${pageId}-`)) {
        keysToDelete.push(key);
      }
    }

    const navigationError = new Error('Page navigation cancelled');
    for (const key of keysToDelete) {
      this.rejectSubscriptions(key, navigationError);
    }
  }

  public reset(): void {
    const resetError = new Error('DocsComponentManager reset');

    for (const key of this.subscriptions.keys()) {
      this.rejectSubscriptions(key, resetError);
    }

    this.rejectRuntimeSubscriptions(resetError);
    this.loadedComponents.clear();
  }

  public destroy(): void {
    this.reset();
    this.loadingPageMetafiles.clear();
    this.pageMetafile = {};
    this.pageMetafileBuildId = null;
    this.pageMetafileIndex = {};
    this.pageMetafileIndexLoaded = false;
    this.isInitialized = false;
  }
}
