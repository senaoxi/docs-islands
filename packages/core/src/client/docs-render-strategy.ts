import { createLogger } from '@docs-islands/utils/logger';
import { createElapsedTimer, formatErrorMessage } from 'logaria/helper';
import type { LoggerElapsedLogOptions } from 'logaria/types';
import { getFrameworkRenderStrategyLogGroup } from '../shared/constants/log-groups/runtime';
import type {
  DocsRendererAdapter,
  DocsRenderMode,
  DocsRenderStrategyHooks,
  DocsRuntimeContext,
  RenderContainerInfo,
} from '../types/client';
import type { PageMetafile } from '../types/page';
import { collectRenderContainers } from './dom';

const loggerInstance = createLogger({
  main: '@docs-islands/core',
});

const getRuntimeNow = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

export interface DocsRenderStrategyOptions<
  TComponent,
  TBuildMetrics = unknown,
> {
  componentManager: {
    getComponent: (pageId: string, componentName: string) => TComponent | null;
    getPageComponentInfo: (
      pathname: string,
    ) => PageMetafile<TBuildMetrics> | null;
    loadPageComponents: (pageId?: string) => Promise<boolean>;
    subscribeComponent: (
      pageId: string,
      componentName: string,
      timeout?: number,
    ) => Promise<boolean>;
  };
  framework: string;
  getCurrentPageId: () => string;
  hooks?: DocsRenderStrategyHooks<TBuildMetrics>;
  renderer: DocsRendererAdapter<TComponent>;
  validateRenderElement?: (element: Element) => boolean;
}

export class DocsRenderStrategy<TComponent, TBuildMetrics = unknown> {
  private readonly Logger;
  private readonly options: DocsRenderStrategyOptions<
    TComponent,
    TBuildMetrics
  >;
  private renderContext: DocsRuntimeContext | null = null;
  private visibilityObserver: IntersectionObserver | null = null;

  public constructor(
    options: DocsRenderStrategyOptions<TComponent, TBuildMetrics>,
  ) {
    this.options = options;
    this.Logger = loggerInstance.getLoggerByGroup(
      getFrameworkRenderStrategyLogGroup(options.framework),
    );
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
      scope: getFrameworkRenderStrategyLogGroup(this.options.framework),
    });
  }

  private updateRenderState(
    info: RenderContainerInfo,
    patch: Parameters<
      NonNullable<DocsRenderStrategyHooks<TBuildMetrics>['onRenderStateChange']>
    >[1],
  ): void {
    this.options.hooks?.onRenderStateChange?.(info, patch);
  }

  private getCurrentPageId(): string {
    return this.renderContext?.pageId || this.options.getCurrentPageId();
  }

  private getRenderMode(
    info: RenderContainerInfo,
    hasSsrContent: boolean,
  ): DocsRenderMode {
    if (info.renderDirective === 'ssr:only') {
      return 'ssr-only';
    }

    return info.renderDirective === 'client:only' || !hasSsrContent
      ? 'render'
      : 'hydrate';
  }

  private registerDetectedRender(info: RenderContainerInfo): void {
    const detectedAt = getRuntimeNow();
    const hasSsrContent = info.element.innerHTML.trim().length > 0;

    this.updateRenderState(info, {
      detectedAt,
      hasSsrContent,
      renderMode: this.getRenderMode(info, hasSsrContent),
      status:
        info.renderDirective === 'client:visible'
          ? 'waiting-visible'
          : 'detected',
      updatedAt: detectedAt,
    });
  }

  private async hydrateContainer(info: RenderContainerInfo): Promise<void> {
    const pageId = this.getCurrentPageId();
    const hydrateStart = getRuntimeNow();
    const hasSsrContent = info.element.innerHTML.trim().length > 0;

    this.updateRenderState(info, {
      hasSsrContent,
      renderMode: 'hydrate',
      status: 'subscribing',
      updatedAt: hydrateStart,
    });

    try {
      const subscribed = await this.options.componentManager.subscribeComponent(
        pageId,
        info.renderComponent,
      );
      const subscribeDurationMs = Number(
        (getRuntimeNow() - hydrateStart).toFixed(2),
      );

      if (!subscribed) {
        this.updateRenderState(info, {
          errorMessage: 'Component subscription failed',
          hasSsrContent,
          renderMode: 'hydrate',
          status: 'failed',
          subscribeDurationMs,
          totalDurationMs: subscribeDurationMs,
        });
        return;
      }

      this.updateRenderState(info, {
        hasSsrContent,
        renderMode: 'hydrate',
        status: 'rendering',
        subscribeDurationMs,
      });

      const component = this.options.componentManager.getComponent(
        pageId,
        info.renderComponent,
      );
      if (!component) {
        this.updateRenderState(info, {
          errorMessage: 'Component module missing',
          hasSsrContent,
          renderMode: 'hydrate',
          status: 'skipped',
          subscribeDurationMs,
          totalDurationMs: Number((getRuntimeNow() - hydrateStart).toFixed(2)),
        });
        return;
      }

      if (!this.options.renderer.isRuntimeAvailable()) {
        this.updateRenderState(info, {
          errorMessage: 'Framework runtime is missing',
          hasSsrContent,
          renderMode: 'hydrate',
          status: 'skipped',
          subscribeDurationMs,
          totalDurationMs: Number((getRuntimeNow() - hydrateStart).toFixed(2)),
        });
        return;
      }

      const invokeStart = getRuntimeNow();
      const hydrateResult = await this.options.renderer.hydrate({
        ...info,
        component,
        pageId,
      });
      const invokeDurationMs = Number(
        (getRuntimeNow() - invokeStart).toFixed(2),
      );
      const totalDurationMs = Number(
        (getRuntimeNow() - hydrateStart).toFixed(2),
      );

      this.updateRenderState(info, {
        errorMessage: hydrateResult?.errorMessage,
        hasSsrContent,
        invokeDurationMs,
        renderMode: hydrateResult?.renderMode ?? 'hydrate',
        status: 'completed',
        subscribeDurationMs,
        totalDurationMs,
      });
    } catch (error) {
      this.updateRenderState(info, {
        errorMessage: formatErrorMessage(error),
        hasSsrContent,
        renderMode: 'hydrate',
        status: 'failed',
        totalDurationMs: Number((getRuntimeNow() - hydrateStart).toFixed(2)),
      });
    }
  }

  private async renderContainer(info: RenderContainerInfo): Promise<void> {
    const pageId = this.getCurrentPageId();
    const renderStart = getRuntimeNow();
    const hasSsrContent = info.element.innerHTML.trim().length > 0;

    this.updateRenderState(info, {
      hasSsrContent,
      renderMode: 'render',
      status: 'subscribing',
      updatedAt: renderStart,
    });

    try {
      const subscribed = await this.options.componentManager.subscribeComponent(
        pageId,
        info.renderComponent,
      );
      const subscribeDurationMs = Number(
        (getRuntimeNow() - renderStart).toFixed(2),
      );

      if (!subscribed) {
        this.updateRenderState(info, {
          errorMessage: 'Component subscription failed',
          hasSsrContent,
          renderMode: 'render',
          status: 'failed',
          subscribeDurationMs,
          totalDurationMs: subscribeDurationMs,
        });
        return;
      }

      this.updateRenderState(info, {
        hasSsrContent,
        renderMode: 'render',
        status: 'rendering',
        subscribeDurationMs,
      });

      const component = this.options.componentManager.getComponent(
        pageId,
        info.renderComponent,
      );
      if (!component) {
        this.updateRenderState(info, {
          errorMessage: 'Component module missing',
          hasSsrContent,
          renderMode: 'render',
          status: 'skipped',
          subscribeDurationMs,
          totalDurationMs: Number((getRuntimeNow() - renderStart).toFixed(2)),
        });
        return;
      }

      if (!this.options.renderer.isRuntimeAvailable()) {
        this.updateRenderState(info, {
          errorMessage: 'Framework runtime is missing',
          hasSsrContent,
          renderMode: 'render',
          status: 'skipped',
          subscribeDurationMs,
          totalDurationMs: Number((getRuntimeNow() - renderStart).toFixed(2)),
        });
        return;
      }

      const invokeStart = getRuntimeNow();
      await this.options.renderer.render({
        ...info,
        component,
        pageId,
      });
      const invokeDurationMs = Number(
        (getRuntimeNow() - invokeStart).toFixed(2),
      );
      const totalDurationMs = Number(
        (getRuntimeNow() - renderStart).toFixed(2),
      );

      this.updateRenderState(info, {
        hasSsrContent,
        invokeDurationMs,
        renderMode: 'render',
        status: 'completed',
        subscribeDurationMs,
        totalDurationMs,
      });
    } catch (error) {
      this.updateRenderState(info, {
        errorMessage: formatErrorMessage(error),
        hasSsrContent,
        renderMode: 'render',
        status: 'failed',
        totalDurationMs: Number((getRuntimeNow() - renderStart).toFixed(2)),
      });
    }
  }

  private async renderVisibleContainer(
    info: RenderContainerInfo,
  ): Promise<void> {
    const hasSsrContent = info.element.innerHTML.trim().length > 0;

    if (info.renderDirective === 'client:only' || !hasSsrContent) {
      await this.renderContainer(info);
      return;
    }

    await this.hydrateContainer(info);
  }

  private setupVisibilityObserver(): void {
    if (this.visibilityObserver) {
      this.visibilityObserver.disconnect();
    }

    this.visibilityObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) {
          continue;
        }

        const element = entry.target;
        const info = collectRenderContainers({
          root: element.parentNode as ParentNode,
          validateElement: (candidate) => candidate === element,
        })[0];

        if (info) {
          this.updateRenderState(info, {
            hasSsrContent: element.innerHTML.trim().length > 0,
            renderMode: this.getRenderMode(
              info,
              element.innerHTML.trim().length > 0,
            ),
            status: 'subscribing',
            visibleAt: getRuntimeNow(),
          });

          const renderVisibleElapsed = createElapsedTimer();
          this.renderVisibleContainer(info).catch((error) => {
            this.emitEvent(
              'error',
              'visibility rendering failed',
              {
                message: formatErrorMessage(error),
              },
              renderVisibleElapsed,
            );
          });
        }

        this.visibilityObserver?.unobserve(element);
      }
    });
  }

  private async executeSpaSyncRender(
    renderContainers: RenderContainerInfo[],
  ): Promise<RenderContainerInfo[]> {
    const hydrateContainers = renderContainers.filter(
      (info) =>
        info.renderDirective === 'client:load' && info.renderWithSpaSync,
    );
    const visibleContainers = renderContainers.filter(
      (info) =>
        info.renderDirective === 'client:visible' && info.renderWithSpaSync,
    );

    if (visibleContainers.length > 0) {
      this.setupVisibilityObserver();
      for (const info of visibleContainers) {
        this.visibilityObserver?.observe(info.element);
      }
    }

    if (hydrateContainers.length > 0) {
      await Promise.allSettled(
        hydrateContainers.map(async (info) => this.hydrateContainer(info)),
      );
    }

    return [...visibleContainers, ...hydrateContainers];
  }

  private async executeInitialRenderStrategy(
    renderContainers: RenderContainerInfo[],
    excludeContainers?: RenderContainerInfo[],
  ): Promise<void> {
    const filteredRenderContainers =
      Array.isArray(excludeContainers) && excludeContainers.length > 0
        ? renderContainers.filter((info) => !excludeContainers.includes(info))
        : renderContainers;

    const hydrateContainers = filteredRenderContainers.filter(
      (info) => info.renderDirective === 'client:load',
    );
    const clientOnlyContainers = filteredRenderContainers.filter(
      (info) => info.renderDirective === 'client:only',
    );
    const visibleContainers = filteredRenderContainers.filter(
      (info) => info.renderDirective === 'client:visible',
    );

    const tasks: Promise<void>[] = [];

    if (hydrateContainers.length > 0) {
      tasks.push(
        ...hydrateContainers.map(async (info) => this.hydrateContainer(info)),
      );
    }

    if (clientOnlyContainers.length > 0) {
      tasks.push(
        ...clientOnlyContainers.map(async (info) => this.renderContainer(info)),
      );
    }

    if (visibleContainers.length > 0) {
      this.setupVisibilityObserver();
      for (const info of visibleContainers) {
        this.visibilityObserver?.observe(info.element);
      }
    }

    await Promise.allSettled(tasks);
  }

  public collectRenderContainers(): RenderContainerInfo[] {
    return collectRenderContainers({
      validateElement: this.options.validateRenderElement,
    });
  }

  public async executeRuntime(context: DocsRuntimeContext): Promise<void> {
    this.renderContext = context;
    const renderContainers = this.collectRenderContainers();

    for (const info of renderContainers) {
      this.registerDetectedRender(info);
    }

    if (renderContainers.length === 0) {
      this.emitEvent('info', 'no framework render containers on current page', {
        pageId: context.pageId,
      });
      return;
    }

    const runtimeElapsed = createElapsedTimer();
    try {
      if (context.isInitialLoad) {
        await this.executeInitialRenderStrategy(renderContainers);
      } else {
        const [, spaSyncContainers] = await Promise.all([
          this.options.componentManager.loadPageComponents(context.pageId),
          this.executeSpaSyncRender(renderContainers),
        ]);
        const componentInfo =
          this.options.componentManager.getPageComponentInfo(context.pageId);
        if (
          componentInfo?.ssrInjectScript &&
          this.options.renderer.executeSsrInjectScript
        ) {
          await this.options.renderer.executeSsrInjectScript(
            componentInfo.ssrInjectScript,
          );
        }

        await this.executeInitialRenderStrategy(
          renderContainers,
          spaSyncContainers,
        );
      }
    } catch (error) {
      this.emitEvent(
        'error',
        'runtime execution failed',
        {
          componentCount: renderContainers.length,
          isInitialLoad: context.isInitialLoad,
          message: formatErrorMessage(error),
          pageId: context.pageId,
        },
        runtimeElapsed,
      );
    }
  }

  public cleanup(): void {
    if (this.visibilityObserver) {
      this.visibilityObserver.disconnect();
      this.visibilityObserver = null;
    }

    this.renderContext = null;
  }
}
