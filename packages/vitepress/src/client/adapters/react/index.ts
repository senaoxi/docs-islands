import type { DevComponentInfo } from '#dep-types/react';
import type { SSRUpdateData, SSRUpdateRenderData } from '#dep-types/ssr';
import { VITEPRESS_HMR_LOG_GROUPS } from '#shared/constants/log-groups/hmr';
import {
  REACT_HMR_EVENT_NAMES,
  REACT_RENDER_STRATEGY_INJECT_RUNTIME_ID,
} from '#shared/constants/react-hmr';
import {
  createSiteDevToolsLogger,
  getSiteDevToolsNow,
  type SiteDevToolsHmrMechanismType,
  type SiteDevToolsHmrUpdateType,
  updateSiteDevToolsHmrMetric,
} from '#shared/internal/devtools';
import { validateLegalRenderElements } from '#shared/utils';
import { createDocsClientIntegration } from '@docs-islands/core/client';
import {
  NEED_PRE_RENDER_DIRECTIVES,
  RENDER_STRATEGY_ATTRS,
  RENDER_STRATEGY_CONSTANTS,
} from '@docs-islands/core/shared/constants/render-strategy';
import { querySelectorAllToArray } from '@docs-islands/utils/dom-iterable';
import { createLogger } from '@docs-islands/vitepress/logger';
import {
  createElapsedTimer,
  formatDebugMessage,
  formatErrorMessage,
} from 'logaria/helper';
import type React from 'react';
import type ReactDOM from 'react-dom/client';
import { createVitePressDevBridge } from '../../vitepress-dev-bridge';
import { createVitePressLifecycleAdapter } from '../../vitepress-lifecycle-adapter';
import { reactComponentManager } from './react-component-manager';
import {
  applyReactMarkdownAfterUpdate,
  createMemoizedReactUpdateState,
  type DevHmrSourceUpdate,
  type ReactUpdateState,
} from './react-hmr-after-update';
import { getReactRenderedComponent } from './react-render-root-store';
import { reactRenderStrategy } from './react-render-strategy';

const loggerInstance = createLogger({
  main: '@docs-islands/vitepress',
});
const DebugLogger = createSiteDevToolsLogger('react-hmr');
/**
 * VitePress still redirects the compiled client entry through vitepress/client.
 * We keep the React-specific entry as an explicit composition layer so users do not
 * need to understand that indirection, while the shared docs runtime stays framework-agnostic.
 */
const lifecycleAdapter = createVitePressLifecycleAdapter();
const devBridge = createVitePressDevBridge({
  createDevRuntimeUrl: (pathname: string, timestamp: number) => {
    const base = typeof __BASE__ === 'string' ? __BASE__ : '/';
    return `${base}${REACT_RENDER_STRATEGY_INJECT_RUNTIME_ID}?${RENDER_STRATEGY_CONSTANTS.renderClientInDev}=${pathname}&t=${timestamp}`;
  },
});

const docsClientIntegration = createDocsClientIntegration({
  devBridge,
  lifecycle: lifecycleAdapter,
  manager: reactComponentManager,
  mode: import.meta.env.DEV ? 'dev' : 'prod',
  mpa: import.meta.env.MPA,
  renderStrategy: {
    cleanup: () => reactRenderStrategy.cleanup(),
    collectRenderContainers: () =>
      reactRenderStrategy.collectLegalRenderComponents(),
    executeRuntime: (context) =>
      reactRenderStrategy.executeReactRuntime(context),
  },
});

class ReactIntegration {
  private pendingDevHMRReactRuntimeLoad: Promise<void> | null = null;
  private pendingReactFastRefreshCompletionTimer: ReturnType<
    typeof setTimeout
  > | null = null;
  private activeReactFastRefreshCycle: {
    componentNames: string[];
    startedAt: number;
  } | null = null;
  private didSetupReactFastRefreshObserver = false;
  private devHmrUpdateSequence = 0;
  private readonly pendingDevHmrMetrics = new Map<
    string,
    {
      applyEvent: string;
      componentName: string;
      hmrId: string;
      importedName?: string;
      mechanismType: SiteDevToolsHmrMechanismType;
      pageId: string;
      renderIds: string[];
      sourceColumn?: number;
      sourceLine?: number;
      sourcePath?: string;
      startedAt: number;
      triggerEvent: string;
      updateType: SiteDevToolsHmrUpdateType;
    }
  >();
  private react: typeof React | null = null;
  private reactDOM: typeof ReactDOM | null = null;

  private getPageId(): string {
    return lifecycleAdapter.getPageId();
  }

  private createDevHmrMetricId(pageId: string, componentName: string): string {
    this.devHmrUpdateSequence += 1;
    return `${pageId}::${componentName}::hmr::${this.devHmrUpdateSequence}::${Date.now()}`;
  }

  private getDevHmrMechanismDescriptor(updateType: SiteDevToolsHmrUpdateType): {
    applyEvent: string;
    mechanismType: SiteDevToolsHmrMechanismType;
    triggerEvent: string;
  } {
    switch (updateType) {
      case 'react-refresh-update': {
        return {
          applyEvent: 'performReactRefresh -> fiber commit',
          mechanismType: 'react-fast-refresh',
          triggerEvent: REACT_HMR_EVENT_NAMES.fastRefreshPrepare,
        };
      }
      case 'ssr-only-component-update': {
        return {
          applyEvent: REACT_HMR_EVENT_NAMES.ssrOnlyRender,
          mechanismType: 'ssr-only-direct-hmr',
          triggerEvent: REACT_HMR_EVENT_NAMES.ssrOnlyPrepare,
        };
      }
      default: {
        return {
          applyEvent: 'vite:afterUpdate -> react root refresh',
          mechanismType: 'markdown-react-hmr',
          triggerEvent: REACT_HMR_EVENT_NAMES.markdownPrepare,
        };
      }
    }
  }

  private startDevHmrMetrics(
    componentEntries: {
      componentName: string;
      importedName?: string;
      renderIds: Iterable<string>;
      sourceColumn?: number;
      sourceLine?: number;
      sourcePath?: string;
    }[],
    updateType: SiteDevToolsHmrUpdateType,
  ): void {
    const pageId = this.getPageId();
    const mechanism = this.getDevHmrMechanismDescriptor(updateType);

    for (const entry of componentEntries) {
      const hmrId = this.createDevHmrMetricId(pageId, entry.componentName);
      const startedAt = getSiteDevToolsNow();
      const renderIds = [...entry.renderIds];

      this.pendingDevHmrMetrics.set(entry.componentName, {
        applyEvent: mechanism.applyEvent,
        componentName: entry.componentName,
        hmrId,
        importedName: entry.importedName,
        mechanismType: mechanism.mechanismType,
        pageId,
        renderIds,
        sourceColumn: entry.sourceColumn,
        sourceLine: entry.sourceLine,
        sourcePath: entry.sourcePath,
        startedAt,
        triggerEvent: mechanism.triggerEvent,
        updateType,
      });

      updateSiteDevToolsHmrMetric({
        applyEvent: mechanism.applyEvent,
        componentName: entry.componentName,
        hmrId,
        importedName: entry.importedName,
        mechanismType: mechanism.mechanismType,
        pageId,
        renderIds,
        sourceColumn: entry.sourceColumn,
        sourceLine: entry.sourceLine,
        sourcePath: entry.sourcePath,
        source: 'react-hmr',
        startedAt,
        status: 'running',
        triggerEvent: mechanism.triggerEvent,
        updateType,
        updatedAt: startedAt,
      });
    }
  }

  private updateDevHmrMetrics(
    componentNames: Iterable<string>,
    patch: {
      clientApplyDurationMs?: number;
      errorMessage?: string;
      runtimeReadyDurationMs?: number;
      ssrApplyDurationMs?: number;
      status?: 'running' | 'completed' | 'failed';
      updatedAt?: number;
    },
    finalize = false,
  ): void {
    const includesRuntimeReadyDuration = Object.prototype.hasOwnProperty.call(
      patch,
      'runtimeReadyDurationMs',
    );
    const includesSsrApplyDuration = Object.prototype.hasOwnProperty.call(
      patch,
      'ssrApplyDurationMs',
    );
    const includesClientApplyDuration = Object.prototype.hasOwnProperty.call(
      patch,
      'clientApplyDurationMs',
    );

    for (const componentName of componentNames) {
      const session = this.pendingDevHmrMetrics.get(componentName);
      if (!session) {
        continue;
      }

      const updatedAt = patch.updatedAt ?? getSiteDevToolsNow();
      updateSiteDevToolsHmrMetric({
        applyEvent: session.applyEvent,
        clientApplyDurationMs: includesClientApplyDuration
          ? (patch.clientApplyDurationMs ??
            Number((updatedAt - session.startedAt).toFixed(2)))
          : undefined,
        componentName: session.componentName,
        errorMessage: patch.errorMessage,
        hmrId: session.hmrId,
        importedName: session.importedName,
        mechanismType: session.mechanismType,
        pageId: session.pageId,
        renderIds: session.renderIds,
        runtimeReadyDurationMs: includesRuntimeReadyDuration
          ? (patch.runtimeReadyDurationMs ??
            Number((updatedAt - session.startedAt).toFixed(2)))
          : undefined,
        source: 'react-hmr',
        sourceColumn: session.sourceColumn,
        sourceLine: session.sourceLine,
        sourcePath: session.sourcePath,
        ssrApplyDurationMs: includesSsrApplyDuration
          ? (patch.ssrApplyDurationMs ??
            Number((updatedAt - session.startedAt).toFixed(2)))
          : undefined,
        startedAt: session.startedAt,
        status: patch.status,
        triggerEvent: session.triggerEvent,
        updateType: session.updateType,
        updatedAt,
      });

      if (finalize) {
        this.pendingDevHmrMetrics.delete(componentName);
      }
    }
  }

  private failPendingDevHmrMetrics(
    componentNames: Iterable<string>,
    error: unknown,
  ): void {
    const updatedAt = getSiteDevToolsNow();
    const message = formatErrorMessage(error);

    this.updateDevHmrMetrics(
      componentNames,
      {
        errorMessage: message,
        status: 'failed',
        updatedAt,
      },
      true,
    );

    DebugLogger.error('react component hmr failed', {
      components: [...componentNames],
      message,
      pageId: this.getPageId(),
    });
  }

  private getPendingReactFastRefreshComponentNames(): string[] {
    return [...this.pendingDevHmrMetrics.entries()]
      .filter(([, session]) => session.mechanismType === 'react-fast-refresh')
      .map(([componentName]) => componentName);
  }

  private clearReactFastRefreshCompletionTimer(): void {
    if (this.pendingReactFastRefreshCompletionTimer) {
      clearTimeout(this.pendingReactFastRefreshCompletionTimer);
      this.pendingReactFastRefreshCompletionTimer = null;
    }
  }

  private completeReactFastRefreshCycle(
    completedAt = getSiteDevToolsNow(),
  ): void {
    const cycle = this.activeReactFastRefreshCycle;
    if (!cycle || cycle.componentNames.length === 0) {
      return;
    }

    this.clearReactFastRefreshCompletionTimer();
    this.activeReactFastRefreshCycle = null;

    this.updateDevHmrMetrics(
      cycle.componentNames,
      {
        clientApplyDurationMs: Number(
          (completedAt - cycle.startedAt).toFixed(2),
        ),
        status: 'completed',
        updatedAt: completedAt,
      },
      true,
    );

    DebugLogger.info('react fast refresh completed', {
      components: cycle.componentNames,
      durationMs: Number((completedAt - cycle.startedAt).toFixed(2)),
      pageId: this.getPageId(),
    });
  }

  private scheduleReactFastRefreshCompletion(delayMs: number): void {
    this.clearReactFastRefreshCompletionTimer();
    this.pendingReactFastRefreshCompletionTimer = setTimeout(() => {
      this.completeReactFastRefreshCycle();
    }, delayMs);
  }

  private startReactFastRefreshCycle(): void {
    const componentNames = this.getPendingReactFastRefreshComponentNames();
    if (componentNames.length === 0) {
      return;
    }

    const startedAt = getSiteDevToolsNow();
    this.activeReactFastRefreshCycle = {
      componentNames,
      startedAt,
    };

    this.updateDevHmrMetrics(componentNames, {
      runtimeReadyDurationMs: undefined,
      updatedAt: startedAt,
    });

    this.scheduleReactFastRefreshCompletion(320);
  }

  private setupReactFastRefreshObserver(): void {
    if (
      this.didSetupReactFastRefreshObserver ||
      globalThis.window === undefined
    ) {
      return;
    }

    type ReactRefreshWindow = Window & {
      __REACT_DEVTOOLS_GLOBAL_HOOK__?: {
        onCommitFiberRoot?: (...args: unknown[]) => unknown;
      };
      __registerBeforePerformReactRefresh?: (callback: () => unknown) => void;
    };

    const reactRefreshWindow = globalThis as unknown as ReactRefreshWindow;
    const registerBeforePerformReactRefresh =
      reactRefreshWindow.__registerBeforePerformReactRefresh;

    if (typeof registerBeforePerformReactRefresh !== 'function') {
      return;
    }

    registerBeforePerformReactRefresh(() => {
      this.startReactFastRefreshCycle();
    });

    const devtoolsHook = reactRefreshWindow.__REACT_DEVTOOLS_GLOBAL_HOOK__;
    const originalOnCommitFiberRoot = devtoolsHook?.onCommitFiberRoot;

    if (devtoolsHook && typeof originalOnCommitFiberRoot === 'function') {
      devtoolsHook.onCommitFiberRoot = (...args: unknown[]) => {
        const result = originalOnCommitFiberRoot.apply(devtoolsHook, args);

        if (this.activeReactFastRefreshCycle) {
          this.scheduleReactFastRefreshCompletion(36);
        }

        return result;
      };
    }

    this.didSetupReactFastRefreshObserver = true;
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

  private ensureDevHMRReactRuntime(): Promise<void> {
    if (this.react && this.reactDOM) {
      return Promise.resolve();
    }

    if (this.pendingDevHMRReactRuntimeLoad) {
      return this.pendingDevHMRReactRuntimeLoad;
    }

    this.pendingDevHMRReactRuntimeLoad = Promise.all([
      import('react'),
      import('react-dom/client'),
    ])
      .then(([ReactModule, ReactDOMModule]) => {
        this.react = ReactModule;
        this.reactDOM = ReactDOMModule;
      })
      .catch((error) => {
        this.pendingDevHMRReactRuntimeLoad = null;
        throw error;
      });

    return this.pendingDevHMRReactRuntimeLoad;
  }

  private async integrationHMR(): Promise<void> {
    if (!import.meta.hot) {
      return;
    }

    const memoizedUpdateState = createMemoizedReactUpdateState();

    import.meta.hot.on(
      REACT_HMR_EVENT_NAMES.markdownPrepare,
      ({ updates, missingImports }: ReactUpdateState) => {
        const currentPageInjectComponents = (window[
          RENDER_STRATEGY_CONSTANTS.injectComponent
        ]?.[this.getPageId()] || {}) as Record<string, DevComponentInfo>;

        memoizedUpdateState.state = {};
        memoizedUpdateState.pendingUpdateState = null;
        memoizedUpdateState.memoizedSsrOnlyComponents = new Set();
        memoizedUpdateState.pendingMissingImports = null;

        memoizedUpdateState.pendingUpdateState = updates;
        memoizedUpdateState.pendingMissingImports = missingImports;
        const renderComponentDOMContainers = document.querySelectorAll(
          `[${RENDER_STRATEGY_CONSTANTS.renderId.toLowerCase()}]`,
        );
        for (const [componentName, updateInfo] of Object.entries(updates)) {
          const componentReference = currentPageInjectComponents[componentName];
          memoizedUpdateState.state[componentName] = {
            component: componentReference?.component || null,
            effectElements: {},
            importedName:
              componentReference?.importedName || updateInfo.importedName,
            source: componentReference?.path || updateInfo.path,
          };
        }
        for (const element of renderComponentDOMContainers) {
          const renderComponentName = element.getAttribute(
            RENDER_STRATEGY_CONSTANTS.renderComponent.toLowerCase(),
          )!;
          const renderId = element.getAttribute(
            RENDER_STRATEGY_CONSTANTS.renderId.toLowerCase(),
          )!;
          if (
            validateLegalRenderElements(element) &&
            memoizedUpdateState.state[renderComponentName]
          ) {
            if (
              memoizedUpdateState.state[renderComponentName].component === null
            ) {
              memoizedUpdateState.state[renderComponentName].component =
                getReactRenderedComponent(element) || null;
            }
            const props = new Map<string, string>();
            for (const attr of element.getAttributeNames()) {
              props.set(attr, element.getAttribute(attr) || '');
            }
            if (
              memoizedUpdateState.state[renderComponentName].component === null
            ) {
              memoizedUpdateState.memoizedSsrOnlyComponents.add(
                renderComponentName,
              );
            }
            memoizedUpdateState.state[renderComponentName].effectElements[
              renderId
            ] = {
              current: element,
              props,
            };
          }
        }

        this.startDevHmrMetrics(
          Object.keys(updates).map((componentName) => ({
            componentName,
            importedName: updates[componentName]?.importedName,
            renderIds: Object.keys(
              memoizedUpdateState.state[componentName]?.effectElements ?? {},
            ),
            sourcePath: updates[componentName]?.sourcePath,
          })),
          'markdown-update',
        );
      },
    );

    import.meta.hot.on('vite:afterUpdate', () => {
      this.runAsyncTask(
        this.ensureDevHMRReactRuntime()
          .then(async () => {
            const runtimeReadyAt = getSiteDevToolsNow();
            this.updateDevHmrMetrics(this.pendingDevHmrMetrics.keys(), {
              runtimeReadyDurationMs: undefined,
              updatedAt: runtimeReadyAt,
            });
            if (
              !memoizedUpdateState.pendingUpdateState &&
              !memoizedUpdateState.pendingMissingImports
            ) {
              return;
            }
            memoizedUpdateState.pendingUpdateState =
              memoizedUpdateState.pendingUpdateState || {};
            memoizedUpdateState.pendingMissingImports =
              memoizedUpdateState.pendingMissingImports || [];

            await applyReactMarkdownAfterUpdate(
              {
                failPendingDevHmrMetrics: (componentNames, error): void =>
                  this.failPendingDevHmrMetrics(componentNames, error),
                getPageId: () => this.getPageId(),
                getReact: () => this.react!,
                getReactDOM: () => this.reactDOM!,
                runAsyncTask: (task, loggerGroup, failureMessage): void =>
                  this.runAsyncTask(task, loggerGroup, failureMessage),
                updateDevHmrMetrics: (componentNames, patch, finalize): void =>
                  this.updateDevHmrMetrics(componentNames, patch, finalize),
              },
              memoizedUpdateState,
            );
          })
          .catch((error) => {
            this.failPendingDevHmrMetrics(
              this.pendingDevHmrMetrics.keys(),
              error,
            );
            throw error;
          }),
        VITEPRESS_HMR_LOG_GROUPS.viteAfterUpdate,
        'Failed to handle React markdown HMR',
      );
    });

    import.meta.hot.on(
      REACT_HMR_EVENT_NAMES.ssrOnlyRender,
      ({ pathname, data }: SSRUpdateRenderData) => {
        if (pathname === this.getPageId() && data.length > 0) {
          const ssrApplyStartedAt = getSiteDevToolsNow();
          const completedComponentNames = new Set<string>();
          const ssrComponentsMap = new Map<string, Element>();
          const renderComponents =
            reactRenderStrategy.collectLegalRenderComponents();
          const needSSRRenderDirective = NEED_PRE_RENDER_DIRECTIVES;
          const ssrComponents = renderComponents.filter((info) =>
            needSSRRenderDirective.includes(info.renderDirective),
          );
          for (const info of ssrComponents) {
            ssrComponentsMap.set(info.renderId, info.element);
          }
          for (const ssrData of data) {
            const { renderId, ssrOnlyCss, ssrHtml } = ssrData;
            const element = ssrComponentsMap.get(renderId);
            if (element) {
              const componentName = element.getAttribute(
                RENDER_STRATEGY_CONSTANTS.renderComponent.toLowerCase(),
              );
              if (componentName) {
                completedComponentNames.add(componentName);
              }
              if (Array.isArray(ssrOnlyCss)) {
                for (const css of ssrOnlyCss) {
                  const isExistCssElement = document.querySelector(
                    `link[href="${css}"]`,
                  );
                  const link = document.createElement('link');
                  link.rel = 'stylesheet';
                  link.href = css;
                  link.dataset.vriteCssInDev = css;
                  document.head.append(link);
                  if (isExistCssElement) {
                    isExistCssElement.remove();
                  }
                }
              }
              element.innerHTML = ssrHtml;
            }
          }

          const completedAt = getSiteDevToolsNow();
          loggerInstance
            .getLoggerByGroup(VITEPRESS_HMR_LOG_GROUPS.reactSsrOnlyRender)
            .debug(
              formatDebugMessage({
                context: 'react ssr-only hmr apply',
                decision:
                  'replace prerendered HTML and refresh css references for ssr-only containers',
                summary: {
                  completedComponentCount: completedComponentNames.size,
                  pageId: pathname,
                  renderPayloadCount: data.length,
                  ssrContainerCount: ssrComponents.length,
                },
                timingMs: Number((completedAt - ssrApplyStartedAt).toFixed(2)),
              }),
            );
          this.updateDevHmrMetrics(
            completedComponentNames,
            {
              ssrApplyDurationMs: undefined,
              status: 'completed',
              updatedAt: completedAt,
            },
            true,
          );
        }
      },
    );

    import.meta.hot.on(
      REACT_HMR_EVENT_NAMES.fastRefreshPrepare,
      ({ updates }: { updates: Record<string, DevHmrSourceUpdate[]> }) => {
        if (Array.isArray(updates[this.getPageId()])) {
          const updateComponents = updates[this.getPageId()];
          this.startDevHmrMetrics(
            updateComponents.map((updateComponent) => ({
              componentName: updateComponent.componentName,
              importedName: updateComponent.importedName,
              renderIds: querySelectorAllToArray(
                document,
                `[${RENDER_STRATEGY_CONSTANTS.renderComponent.toLowerCase()}="${updateComponent.componentName}"]`,
              ).map(
                (element) =>
                  element.getAttribute(
                    RENDER_STRATEGY_CONSTANTS.renderId.toLowerCase(),
                  ) || '',
              ),
              sourceColumn: updateComponent.sourceColumn,
              sourceLine: updateComponent.sourceLine,
              sourcePath: updateComponent.sourcePath,
            })),
            'react-refresh-update',
          );
        }
      },
    );

    import.meta.hot.on(
      REACT_HMR_EVENT_NAMES.ssrOnlyPrepare,
      ({ updates }: { updates: Record<string, DevHmrSourceUpdate[]> }) => {
        if (Array.isArray(updates[this.getPageId()])) {
          const updateComponents = updates[this.getPageId()];
          this.startDevHmrMetrics(
            updateComponents.map((updateComponent) => ({
              componentName: updateComponent.componentName,
              importedName: updateComponent.importedName,
              renderIds: querySelectorAllToArray(
                document,
                `[${RENDER_STRATEGY_CONSTANTS.renderComponent.toLowerCase()}="${updateComponent.componentName}"]`,
              ).map(
                (element) =>
                  element.getAttribute(
                    RENDER_STRATEGY_CONSTANTS.renderId.toLowerCase(),
                  ) || '',
              ),
              sourceColumn: updateComponent.sourceColumn,
              sourceLine: updateComponent.sourceLine,
              sourcePath: updateComponent.sourcePath,
            })),
            'ssr-only-component-update',
          );
          const ssrOnlyComponentsUpdates: SSRUpdateData['data'] = [];
          for (const {
            componentName: ssrOnlyComponentName,
          } of updateComponents) {
            const ssrOnlyComponents = document.querySelectorAll(
              `[${RENDER_STRATEGY_CONSTANTS.renderComponent.toLowerCase()}="${ssrOnlyComponentName}"]`,
            );
            if (ssrOnlyComponents.length > 0) {
              for (const ssrOnlyComponent of ssrOnlyComponents) {
                if (!validateLegalRenderElements(ssrOnlyComponent)) {
                  continue;
                }
                const renderId = ssrOnlyComponent.getAttribute(
                  RENDER_STRATEGY_CONSTANTS.renderId.toLowerCase(),
                )!;
                const props: Record<string, string> = {};
                for (const attr of ssrOnlyComponent.getAttributeNames()) {
                  if (!RENDER_STRATEGY_ATTRS.includes(attr)) {
                    props[attr] = ssrOnlyComponent.getAttribute(attr) || '';
                  }
                }
                ssrOnlyComponentsUpdates.push({
                  componentName: ssrOnlyComponentName,
                  props,
                  renderId,
                });
              }
              const ssrUpdateData: SSRUpdateData = {
                data: ssrOnlyComponentsUpdates,
                pathname: this.getPageId(),
                updateType: 'ssr-only-component-update',
              };

              if (import.meta.hot) {
                import.meta.hot.send(
                  REACT_HMR_EVENT_NAMES.ssrRenderRequest,
                  ssrUpdateData,
                );
              }
            }
          }
        }
      },
    );

    this.setupReactFastRefreshObserver();
    this.runAsyncTask(
      this.ensureDevHMRReactRuntime().then(() => {
        this.setupReactFastRefreshObserver();
      }),
      VITEPRESS_HMR_LOG_GROUPS.reactRuntimePrepare,
      'Failed to prepare React runtime for development HMR',
    );
  }

  public async initialize(): Promise<void> {
    await docsClientIntegration.initialize();

    if (import.meta.env.DEV) {
      await this.integrationHMR();
    }
  }
}

const reactClientRuntime = new ReactIntegration();

export async function reactClient(): Promise<void> {
  if (lifecycleAdapter.inBrowser && globalThis.window !== undefined) {
    await reactClientRuntime.initialize();
  }
}
