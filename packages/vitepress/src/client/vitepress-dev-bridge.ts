import type { SSRUpdateData, SSRUpdateRenderData } from '#dep-types/ssr';
import { VITEPRESS_RUNTIME_LOG_GROUPS } from '#shared/constants/log-groups/runtime';
import { REACT_HMR_EVENT_NAMES } from '#shared/constants/react-hmr';
import type {
  DocsClientIntegrationContext,
  DocsDevBridge,
  DocsRuntimeExecutorLike,
  DocsRuntimeManagerLike,
} from '@docs-islands/core/client';
import {
  applySsrRenderResult,
  requiresPreRenderDirective,
} from '@docs-islands/core/client';
import {
  createElapsedTimer,
  formatDebugMessage,
  formatErrorMessage,
} from '@docs-islands/logger/helper';
import { createLogger } from '@docs-islands/vitepress/logger';

const loggerInstance = createLogger({
  main: '@docs-islands/vitepress',
});
const DEV_MOUNT_RETRY_INTERVAL_MS = 350;
const DEV_MOUNT_RETRY_LIMIT = 4;
const DEV_MOUNT_PREPARATION_RETRY_LIMIT = 10;
const DEV_RUNTIME_FALLBACK_DELAY_MS = 1200;
const DEV_MOUNT_RENDER_REPLAY_INTERVAL_MS = 32;
const DEV_MOUNT_PREPARATION_DELAY_MS = 32;

export interface CreateVitePressDevBridgeOptions {
  createDevRuntimeUrl: (pathname: string, timestamp: number) => string;
}

export class VitePressDevBridge<
  TManager extends DocsRuntimeManagerLike = DocsRuntimeManagerLike,
  TExecutor extends DocsRuntimeExecutorLike = DocsRuntimeExecutorLike,
> implements DocsDevBridge<TManager, TExecutor>
{
  private readonly options: CreateVitePressDevBridgeOptions;
  public readonly pendingRuntimeLoads: Map<string, Promise<void>> = new Map();
  private context: DocsClientIntegrationContext<TManager, TExecutor> | null =
    null;
  private currentLocationPathname = '';
  private devMountRequestSequence = 0;
  private pendingDevMountFallbackTimer: ReturnType<typeof setTimeout> | null =
    null;
  private pendingDevMountPathname: string | null = null;
  private pendingDevMountPreparationPathname: string | null = null;
  private pendingDevMountPreparationTimer: ReturnType<
    typeof setTimeout
  > | null = null;
  private pendingDevMountRenderData: SSRUpdateRenderData | null = null;
  private pendingDevMountRenderIds = new Set<string>();
  private pendingDevMountRenderReplayTimer: ReturnType<
    typeof setTimeout
  > | null = null;
  private pendingDevMountRequestData: SSRUpdateData | null = null;
  private pendingDevMountRetryCount = 0;
  private pendingDevMountRetryTimer: ReturnType<typeof setTimeout> | null =
    null;
  private pendingDevMountSSROnlyRenderIds = new Set<string>();
  private pendingDevRuntimeFallbackTriggered = false;

  public constructor(options: CreateVitePressDevBridgeOptions) {
    this.options = options;
    this.setupDevMountRenderListener();
  }

  private getContext(): DocsClientIntegrationContext<TManager, TExecutor> {
    if (!this.context) {
      throw new Error('VitePressDevBridge has not been initialized');
    }

    return this.context;
  }

  private getPageId(): string {
    return this.getContext().lifecycle.getPageId();
  }

  private collectRenderContainers() {
    return this.getContext().renderStrategy.collectRenderContainers();
  }

  private runAsyncTask(
    task: Promise<void>,
    loggerGroup: string,
    failureMessage: string,
  ): void {
    const taskElapsed = createElapsedTimer();
    task.catch((error) => {
      loggerInstance
        .getLoggerByGroup(loggerGroup)
        .error(
          `${failureMessage}: ${formatErrorMessage(error)}`,
          taskElapsed(),
        );
    });
  }

  public detectRenderElementsInDev(): boolean {
    return this.collectRenderContainers().length > 0;
  }

  public async loadDevRenderRuntime(
    pathname: string = this.getPageId(),
  ): Promise<void> {
    if (!this.detectRenderElementsInDev()) {
      return;
    }

    const pendingLoad = this.pendingRuntimeLoads.get(pathname);
    if (pendingLoad) {
      await pendingLoad;
      return;
    }

    const timestamp = Date.now();
    const loadStartedAt = timestamp;
    const scriptPath = /* @vite-ignore */ this.options.createDevRuntimeUrl(
      pathname,
      timestamp,
    );
    const loadPromise = import(scriptPath).then(() => {
      const loadCompletedAt = Date.now();
      loggerInstance
        .getLoggerByGroup(VITEPRESS_RUNTIME_LOG_GROUPS.reactDevRuntimeLoader)
        .debug(
          formatDebugMessage({
            context: 'development render runtime load',
            decision: 'cache runtime module for the current pathname',
            summary: {
              pageId: pathname,
              pendingRuntimeLoads: this.pendingRuntimeLoads.size + 1,
              requestId: `${pathname}?t=${timestamp}`,
            },
            timingMs: Number((loadCompletedAt - loadStartedAt).toFixed(2)),
          }),
        );
    });

    this.pendingRuntimeLoads.set(pathname, loadPromise);

    try {
      await loadPromise;
    } finally {
      this.pendingRuntimeLoads.delete(pathname);
    }
  }

  private clearPendingDevMount(pathname?: string): void {
    if (!pathname || this.pendingDevMountPathname === pathname) {
      this.pendingDevMountPathname = null;
      this.pendingDevMountRequestData = null;
      this.pendingDevMountRenderIds.clear();
      this.pendingDevMountSSROnlyRenderIds.clear();
      this.pendingDevMountRenderData = null;
      this.pendingDevMountRetryCount = 0;
      this.pendingDevRuntimeFallbackTriggered = false;
    }

    if (this.pendingDevMountFallbackTimer) {
      clearTimeout(this.pendingDevMountFallbackTimer);
      this.pendingDevMountFallbackTimer = null;
    }
    if (this.pendingDevMountRetryTimer) {
      clearTimeout(this.pendingDevMountRetryTimer);
      this.pendingDevMountRetryTimer = null;
    }
    if (this.pendingDevMountRenderReplayTimer) {
      clearTimeout(this.pendingDevMountRenderReplayTimer);
      this.pendingDevMountRenderReplayTimer = null;
    }
  }

  private clearPendingDevMountPreparation(pathname?: string): void {
    if (!pathname || this.pendingDevMountPreparationPathname === pathname) {
      this.pendingDevMountPreparationPathname = null;
    }

    if (this.pendingDevMountPreparationTimer) {
      clearTimeout(this.pendingDevMountPreparationTimer);
      this.pendingDevMountPreparationTimer = null;
    }
  }

  private hasPendingDevPreRenderShells(): boolean {
    return this.collectRenderContainers().some(
      (info) =>
        requiresPreRenderDirective(info.renderDirective) &&
        info.element.innerHTML.trim().length === 0,
    );
  }

  private sendPendingDevMountRequest(): boolean {
    if (
      !import.meta.hot ||
      !this.pendingDevMountPathname ||
      !this.pendingDevMountRequestData
    ) {
      return false;
    }

    import.meta.hot.send(
      REACT_HMR_EVENT_NAMES.ssrRenderRequest,
      this.pendingDevMountRequestData,
    );
    return true;
  }

  private schedulePendingDevMountRetry(pathname: string): void {
    if (
      this.pendingDevMountPathname !== pathname ||
      this.pendingDevMountRetryCount >= DEV_MOUNT_RETRY_LIMIT
    ) {
      return;
    }

    this.pendingDevMountRetryTimer = setTimeout(() => {
      if (this.pendingDevMountPathname !== pathname) {
        return;
      }

      this.pendingDevMountRetryCount += 1;
      this.sendPendingDevMountRequest();
      this.schedulePendingDevMountRetry(pathname);
    }, DEV_MOUNT_RETRY_INTERVAL_MS);
  }

  private async triggerDevRuntimeFallback(pathname: string): Promise<void> {
    if (
      this.pendingDevMountPathname !== pathname ||
      this.pendingDevRuntimeFallbackTriggered
    ) {
      return;
    }

    this.pendingDevRuntimeFallbackTriggered = true;
    await this.loadDevRenderRuntime(pathname);
    if (this.pendingDevMountPathname === pathname) {
      this.currentLocationPathname = pathname;
    }
  }

  private schedulePendingDevMountRenderReplay(pathname: string): void {
    if (
      this.pendingDevMountPathname !== pathname ||
      !this.pendingDevMountRenderData ||
      this.pendingDevMountRenderReplayTimer
    ) {
      return;
    }

    this.pendingDevMountRenderReplayTimer = setTimeout(() => {
      this.pendingDevMountRenderReplayTimer = null;

      const pendingRenderData = this.pendingDevMountRenderData;
      if (!pendingRenderData || pendingRenderData.pathname !== pathname) {
        return;
      }

      this.handleDevMountRender(pendingRenderData);
    }, DEV_MOUNT_RENDER_REPLAY_INTERVAL_MS);
  }

  private getPendingDevMountExpectedRenderIds(
    fallbackTriggered: boolean,
  ): Set<string> {
    return fallbackTriggered
      ? this.pendingDevMountSSROnlyRenderIds
      : this.pendingDevMountRenderIds;
  }

  private finalizeDevMountRender(
    pathname: string,
    fallbackTriggered: boolean,
  ): void {
    this.pendingDevMountRenderData = null;
    this.currentLocationPathname = pathname;
    this.clearPendingDevMount(pathname);

    if (!fallbackTriggered) {
      this.runAsyncTask(
        this.loadDevRenderRuntime(pathname),
        VITEPRESS_RUNTIME_LOG_GROUPS.reactDevMountRender,
        'Failed to load development render runtime after SSR mount',
      );
    }
  }

  private handleDevMountRender({
    pathname,
    data,
    requestId,
  }: SSRUpdateRenderData): void {
    if (pathname !== this.getPageId()) {
      return;
    }

    if (
      !this.pendingDevMountRequestData ||
      requestId !== this.pendingDevMountRequestData.requestId
    ) {
      return;
    }

    const fallbackTriggered =
      this.pendingDevMountPathname === pathname &&
      this.pendingDevRuntimeFallbackTriggered;
    const expectedRenderIds =
      this.getPendingDevMountExpectedRenderIds(fallbackTriggered);

    if (!this.applyDevMountRenderData(pathname, data, expectedRenderIds)) {
      this.pendingDevMountRenderData = {
        pathname,
        data,
        requestId,
      };
      this.schedulePendingDevMountRenderReplay(pathname);
      return;
    }

    this.finalizeDevMountRender(pathname, fallbackTriggered);
  }

  private setupDevMountRenderListener(): void {
    if (!import.meta.hot) {
      return;
    }

    import.meta.hot.on(
      REACT_HMR_EVENT_NAMES.mountRender,
      (payload: SSRUpdateRenderData) => {
        this.handleDevMountRender(payload);
      },
    );
  }

  private armPendingDevMount(
    requestData: SSRUpdateData,
    ssrOnlyRenderIds: Iterable<string>,
  ): void {
    const { data, pathname } = requestData;
    this.clearPendingDevMount();
    this.clearPendingDevMountPreparation(pathname);
    this.pendingDevMountPathname = pathname;
    this.pendingDevMountRequestData = requestData;
    this.pendingDevMountRenderIds = new Set(data.map((item) => item.renderId));
    this.pendingDevMountSSROnlyRenderIds = new Set(ssrOnlyRenderIds);
    this.pendingDevMountRetryCount = 0;
    this.pendingDevRuntimeFallbackTriggered = false;

    this.sendPendingDevMountRequest();
    this.schedulePendingDevMountRetry(pathname);
    this.pendingDevMountFallbackTimer = setTimeout(() => {
      this.runAsyncTask(
        this.triggerDevRuntimeFallback(pathname),
        VITEPRESS_RUNTIME_LOG_GROUPS.reactDevMountFallback,
        'Failed to execute dev runtime fallback',
      );
    }, DEV_RUNTIME_FALLBACK_DELAY_MS);
  }

  private schedulePendingDevMountPreparation(
    pathname: string,
    attempt = 0,
  ): void {
    this.clearPendingDevMountPreparation();
    this.pendingDevMountPreparationPathname = pathname;
    this.pendingDevMountPreparationTimer = setTimeout(() => {
      this.pendingDevMountPreparationTimer = null;

      if (
        this.pendingDevMountPreparationPathname !== pathname ||
        this.pendingDevMountPathname === pathname ||
        this.getPageId() !== pathname
      ) {
        return;
      }
      this.pendingDevMountPreparationPathname = null;

      const renderContainers = this.collectRenderContainers();
      if (renderContainers.length === 0) {
        if (
          attempt < DEV_MOUNT_PREPARATION_RETRY_LIMIT &&
          this.pendingDevMountPathname !== pathname &&
          this.getPageId() === pathname
        ) {
          this.schedulePendingDevMountPreparation(pathname, attempt + 1);
          return;
        }

        this.currentLocationPathname = pathname;
        return;
      }

      const preRenderContainers = renderContainers.filter((info) =>
        requiresPreRenderDirective(info.renderDirective),
      );
      const pendingPreRenderComponents: SSRUpdateData['data'] =
        preRenderContainers.map((info) => ({
          componentName: info.renderComponent,
          props: info.props,
          renderId: info.renderId,
        }));

      if (pendingPreRenderComponents.length === 0 || !import.meta.hot) {
        this.currentLocationPathname = pathname;
        this.runAsyncTask(
          this.loadDevRenderRuntime(pathname),
          VITEPRESS_RUNTIME_LOG_GROUPS.reactDevContentUpdated,
          'Failed to load development render runtime for the current page',
        );
        return;
      }

      this.armPendingDevMount(
        {
          data: pendingPreRenderComponents,
          pathname,
          requestId: this.createDevMountRequestId(pathname),
          updateType: 'mounted',
        },
        preRenderContainers
          .filter((info) => info.renderDirective === 'ssr:only')
          .map((info) => info.renderId),
      );
    }, DEV_MOUNT_PREPARATION_DELAY_MS);
  }

  private createDevMountRequestId(pathname: string): string {
    this.devMountRequestSequence += 1;
    return `${pathname}::${this.devMountRequestSequence}::${Date.now()}`;
  }

  private applyDevMountRenderData(
    pathname: string,
    data: SSRUpdateRenderData['data'],
    expectedRenderIds: Set<string>,
  ): boolean {
    if (pathname !== this.getPageId()) {
      return false;
    }

    if (expectedRenderIds.size === 0) {
      return true;
    }

    const ssrComponentsMap = new Map<string, Element>();
    for (const info of this.collectRenderContainers()) {
      if (expectedRenderIds.has(info.renderId)) {
        ssrComponentsMap.set(info.renderId, info.element);
      }
    }

    let appliedCount = 0;
    for (const preRenderComponent of data) {
      const { renderId, ssrHtml, ssrOnlyCss } = preRenderComponent;
      if (!expectedRenderIds.has(renderId)) {
        continue;
      }

      const element = ssrComponentsMap.get(renderId);
      if (element) {
        applySsrRenderResult(element, {
          ssrHtml,
          ssrOnlyCss,
        });
        appliedCount += 1;
      }
    }

    return appliedCount === expectedRenderIds.size;
  }

  public async initialize(
    context: DocsClientIntegrationContext<TManager, TExecutor>,
  ): Promise<void> {
    this.context = context;

    context.lifecycle.onContentUpdated(() => {
      const pageId = this.getPageId();
      if (
        (this.currentLocationPathname === pageId &&
          !this.hasPendingDevPreRenderShells()) ||
        this.pendingDevMountPathname === pageId
      ) {
        return;
      }

      this.schedulePendingDevMountPreparation(pageId);
    });

    const initialPageId = this.getPageId();
    this.schedulePendingDevMountPreparation(initialPageId);
  }
}

export function createVitePressDevBridge(
  options: CreateVitePressDevBridgeOptions,
): VitePressDevBridge {
  return new VitePressDevBridge(options);
}
