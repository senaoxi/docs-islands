import type { DevComponentInfo } from '#dep-types/react';
import type { SSRUpdateData, SSRUpdateRenderData } from '#dep-types/ssr';
import { VITEPRESS_HMR_LOG_GROUPS } from '#shared/constants/log-groups/hmr';
import { REACT_HMR_EVENT_NAMES } from '#shared/constants/react-hmr';
import {
  createSiteDevToolsLogger,
  getSiteDevToolsNow,
} from '#shared/internal/devtools';
import { validateLegalRenderElements } from '#shared/utils';
import {
  collectComponentProps,
  replaceSsrCssResources,
  requiresPreRenderDirective,
} from '@docs-islands/core/client';
import {
  NEED_PRE_RENDER_DIRECTIVES,
  RENDER_STRATEGY_CONSTANTS,
} from '@docs-islands/core/shared/constants/render-strategy';
import {
  createElapsedLogOptions,
  formatDebugMessage,
} from '@docs-islands/logger/helper';
import { createLogger } from '@docs-islands/vitepress/logger';
import type React from 'react';
import type ReactDOM from 'react-dom/client';
import { reactComponentManager } from './react-component-manager';
import {
  getReactRenderedComponent,
  getReactRenderRoot,
  rememberReactRenderState,
} from './react-render-root-store';
import { reactRenderStrategy } from './react-render-strategy';

const loggerInstance = createLogger({
  main: '@docs-islands/vitepress',
});
const DebugLogger = createSiteDevToolsLogger('react-hmr');
const elapsedSince = (startTimeMs: number) =>
  createElapsedLogOptions(startTimeMs, getSiteDevToolsNow());
const renderIdAttr = RENDER_STRATEGY_CONSTANTS.renderId.toLowerCase();
const renderComponentAttr =
  RENDER_STRATEGY_CONSTANTS.renderComponent.toLowerCase();
const renderDirectiveAttr =
  RENDER_STRATEGY_CONSTANTS.renderDirective.toLowerCase();

type ReactComponentRecord = React.ComponentType<Record<string, string>>;

interface MemoizedEffectElement {
  current: Element;
  props: Map<string, string>;
}

interface MemoizedStateEntry {
  component: ReactComponentRecord | null;
  source: string;
  importedName: string;
  effectElements: Record<string, MemoizedEffectElement>;
}

interface RenderUpdateEntry {
  component: ReactComponentRecord | null;
  source: string;
  importedName: string;
  effectElements: Element[];
}

interface PendingComponentRender {
  component: ReactComponentRecord | null;
  source: string;
  importedName: string;
  componentName: string;
  renderDirective: string;
  props: Record<string, string>;
}

interface PendingInjectComponent {
  component: ReactComponentRecord | null;
  importedName: string;
  path: string;
}

interface ReactMarkdownAfterUpdateContext {
  getPageId: () => string;
  getReact: () => typeof React;
  getReactDOM: () => typeof ReactDOM;
  updateDevHmrMetrics: (
    componentNames: Iterable<string>,
    patch: {
      clientApplyDurationMs?: number;
      errorMessage?: string;
      runtimeReadyDurationMs?: number;
      ssrApplyDurationMs?: number;
      status?: 'running' | 'completed' | 'failed';
      updatedAt?: number;
    },
    finalize?: boolean,
  ) => void;
  failPendingDevHmrMetrics: (
    componentNames: Iterable<string>,
    error: unknown,
  ) => void;
  runAsyncTask: (
    task: Promise<void>,
    loggerGroup: string,
    failureMessage: string,
  ) => void;
}

export interface ReactUpdateState {
  updates: Record<
    string,
    { importedName: string; path: string; sourcePath?: string }
  >;
  missingImports: string[];
}

export interface DevHmrSourceUpdate {
  componentName: string;
  importedName?: string;
  sourceColumn?: number;
  sourceLine?: number;
  sourcePath?: string;
}

export interface MemoizedReactUpdateState {
  state: Record<string, MemoizedStateEntry>;
  pendingUpdateState: ReactUpdateState['updates'] | null;
  memoizedSsrOnlyComponents: Set<string>;
  pendingMissingImports: ReactUpdateState['missingImports'] | null;
}

/**
 * This state lives across multiple HMR hooks:
 * prepare hooks populate it before Vue updates the markdown DOM,
 * and `vite:afterUpdate` consumes it after the new containers settle.
 */
export const createMemoizedReactUpdateState = (): MemoizedReactUpdateState => ({
  state: {},
  pendingUpdateState: null,
  memoizedSsrOnlyComponents: new Set(),
  pendingMissingImports: null,
});

const hasEquivalentRenderContainerAttrs = (
  element: Element,
  memorizedProps: Map<string, string>,
): boolean => {
  const currentAttrNames = element
    .getAttributeNames()
    .filter((attr) => attr !== renderIdAttr);
  const memorizedAttrNames = [...memorizedProps.keys()].filter(
    (attr) => attr !== renderIdAttr,
  );

  if (currentAttrNames.length !== memorizedAttrNames.length) {
    return false;
  }

  for (const [memorizedAttrKey, memorizedAttrValue] of memorizedProps) {
    if (memorizedAttrKey === renderIdAttr) {
      continue;
    }
    const attrValue = element.getAttribute(memorizedAttrKey);
    if (attrValue !== memorizedAttrValue) {
      return false;
    }
  }

  return true;
};

const syncRenderContainerAttrs = (
  targetElement: Element,
  sourceElement: Element,
): void => {
  const nextAttrs = new Map<string, string>();
  for (const attrName of sourceElement.getAttributeNames()) {
    nextAttrs.set(attrName, sourceElement.getAttribute(attrName) || '');
  }

  for (const attrName of targetElement.getAttributeNames()) {
    if (!nextAttrs.has(attrName)) {
      targetElement.removeAttribute(attrName);
    }
  }

  for (const [attrName, attrValue] of nextAttrs.entries()) {
    targetElement.setAttribute(attrName, attrValue);
  }
};

const getComponentLoadKey = (source: string, importedName: string): string =>
  `${source}#${importedName}`;

const resolveImportedComponent = (
  module: Record<string, ReactComponentRecord>,
  importedName: string,
): ReactComponentRecord => {
  if (importedName === 'default') {
    return module.default;
  }

  if (importedName === '*') {
    return module as unknown as ReactComponentRecord;
  }

  return module[importedName];
};

const queueComponentLoad = (
  loadComponents: Record<string, Promise<ReactComponentRecord>>,
  component: ReactComponentRecord | null,
  source: string,
  importedName: string,
): void => {
  const key = getComponentLoadKey(source, importedName);

  if (component) {
    loadComponents[key] = Promise.resolve(component);
    return;
  }

  if (!loadComponents[key]) {
    loadComponents[key] = import(/* @vite-ignore */ source).then((module) =>
      resolveImportedComponent(
        module as Record<string, ReactComponentRecord>,
        importedName,
      ),
    );
  }
};

const buildComponentsMap = async (
  loadComponents: Record<string, Promise<ReactComponentRecord>>,
): Promise<Map<string, ReactComponentRecord>> => {
  // Different render containers can point to the same module import; load once and fan out.
  const promiseComponents = Object.entries(loadComponents).map(
    ([key, component]) => ({
      component,
      key,
    }),
  );
  const components = await Promise.all(
    promiseComponents.map(async (item) => item.component),
  );
  const componentsMap = new Map<string, ReactComponentRecord>();

  for (const [index, component] of components.entries()) {
    componentsMap.set(promiseComponents[index].key, component);
  }

  return componentsMap;
};

// Complex HMR update handler that coordinates React component updates and state preservation
// eslint-disable-next-line max-lines-per-function
export const applyReactMarkdownAfterUpdate = async (
  context: ReactMarkdownAfterUpdateContext,
  memoizedUpdateState: MemoizedReactUpdateState,
  // eslint-disable-next-line complexity
): Promise<void> => {
  const updateStartedAt = getSiteDevToolsNow();
  /**
   * Markdown HMR runs in three stages:
   * 1. Diff the old/new render containers and decide reuse vs rerender.
   * 2. Ask the SSR side for fresh HTML when the directive requires pre-rendering.
   * 3. Reconnect client roots so hydrated/client-only components stay interactive.
   */
  const Logger = loggerInstance.getLoggerByGroup(
    VITEPRESS_HMR_LOG_GROUPS.viteAfterUpdate,
  );
  const activeHmrComponentNames = Object.keys(
    memoizedUpdateState.pendingUpdateState ?? {},
  );
  const renderComponentDOMContainers = document.querySelectorAll(
    `[${renderIdAttr}]`,
  );
  /**
   * `renderUpdates` contains two types of updates:
   * 1. Reuse component: When a node's props change or node order changes but the component reference remains the same,
   *    the component can be reused to complete client-side rendering of those nodes.
   * 2. Replace component: When the component reference changes, fetch the new component version to complete client-side rendering.
   */
  const renderUpdates: Record<string, RenderUpdateEntry> = {};
  /**
   * Cache already rendered React root nodes (with event bindings) before the Vue engine renders,
   * to prevent Vue from removing React-rendered nodes during HMR and losing state.
   */
  const renderIdToReuseRenderedElements = new Map<string, Element>();
  const reusedEffectElementRenderIds = new Set<string>();
  const ssrOnlyComponents = new Map<string, PendingInjectComponent>();
  const reuseInjectComponent = new Map<string, DevComponentInfo>();
  const rerenderExistingRoots: Record<string, PendingComponentRender> = {};

  for (const element of renderComponentDOMContainers) {
    if (!validateLegalRenderElements(element)) {
      continue;
    }

    const renderId = element.getAttribute(renderIdAttr)!;
    const renderComponent = element.getAttribute(renderComponentAttr)!;
    const renderDirective = element.getAttribute(renderDirectiveAttr)!;
    const pendingMissingImports =
      memoizedUpdateState.pendingMissingImports ?? [];

    if (pendingMissingImports.includes(renderComponent)) {
      element.remove();
      continue;
    }

    const pendingState =
      memoizedUpdateState.pendingUpdateState?.[renderComponent];
    if (!pendingState) {
      Logger.error(
        `[${renderComponent}] is not found in container script`,
        elapsedSince(updateStartedAt),
      );
      continue;
    }

    const { importedName, path } = pendingState;
    const memorizedState = memoizedUpdateState.state[renderComponent];

    if (memorizedState) {
      const {
        component,
        source,
        importedName: memorizedImportedName,
        effectElements,
      } = memorizedState;

      // Component reference has changed.
      if (importedName !== memorizedImportedName || source !== path) {
        if (renderUpdates[renderComponent]) {
          renderUpdates[renderComponent].effectElements.push(element);
        } else {
          renderUpdates[renderComponent] = {
            component: null,
            source: path,
            importedName,
            effectElements: [element],
          };
        }
      } else {
        const reusableComponent =
          component || getReactRenderedComponent(element) || null;
        reuseInjectComponent.set(renderComponent, {
          component: reusableComponent,
          path,
          importedName,
        });

        // If both pre- and post-update containers point to the same component, detect reuse vs re-render.
        if (effectElements[renderId]) {
          const { props, current } = effectElements[renderId];
          const hasAttrChanged = !hasEquivalentRenderContainerAttrs(
            element,
            props,
          );

          // Component reference remains the same, but props changed.
          if (hasAttrChanged) {
            if (renderUpdates[renderComponent]) {
              renderUpdates[renderComponent].effectElements.push(element);
            } else {
              renderUpdates[renderComponent] = {
                component,
                source: path,
                importedName,
                effectElements: [element],
              };
            }
          } else {
            // If the component reference and props haven't changed, reuse the already-rendered DOM.
            reusedEffectElementRenderIds.add(renderId);
            if (current === element) {
              rerenderExistingRoots[renderId] = {
                component: reusableComponent,
                source: path,
                importedName,
                componentName: renderComponent,
                renderDirective,
                props: collectComponentProps(element),
              };
            } else {
              syncRenderContainerAttrs(current, element);
              renderIdToReuseRenderedElements.set(renderId, current);
            }
          }
        } else {
          let reusableEffectElement: MemoizedEffectElement | null = null;
          let reusableEffectElementRenderId = '';

          for (const [effectRenderId, effectElement] of Object.entries(
            effectElements,
          )) {
            if (
              reusedEffectElementRenderIds.has(effectRenderId) ||
              !hasEquivalentRenderContainerAttrs(element, effectElement.props)
            ) {
              continue;
            }

            reusableEffectElement = effectElement;
            reusableEffectElementRenderId = effectRenderId;
            break;
          }

          if (reusableEffectElement) {
            reusedEffectElementRenderIds.add(reusableEffectElementRenderId);
            syncRenderContainerAttrs(reusableEffectElement.current, element);
            renderIdToReuseRenderedElements.set(
              renderId,
              reusableEffectElement.current,
            );
          } else if (renderUpdates[renderComponent]) {
            renderUpdates[renderComponent].effectElements.push(element);
          } else {
            // Reuse the rendered component for the new container.
            renderUpdates[renderComponent] = {
              component: reusableComponent,
              source: path,
              importedName,
              effectElements: [element],
            };
          }
        }
      }
    } else if (renderUpdates[renderComponent]) {
      renderUpdates[renderComponent].effectElements.push(element);
    } else {
      // New render component.
      renderUpdates[renderComponent] = {
        component: null,
        source: path,
        importedName,
        effectElements: [element],
      };
    }

    if (renderDirective === 'ssr:only') {
      ssrOnlyComponents.set(renderComponent, {
        component: null,
        importedName,
        path,
      });
    } else if (ssrOnlyComponents.has(renderComponent)) {
      ssrOnlyComponents.delete(renderComponent);
    }
  }

  for (const [renderId, element] of renderIdToReuseRenderedElements.entries()) {
    const currentElement = document.querySelector(
      `[${renderIdAttr}="${renderId}"]`,
    );
    if (currentElement) {
      currentElement.replaceWith(element);
    }
  }

  // SSR client script to complete client hydration.
  const ssrClientComponents: Record<string, PendingComponentRender> = {};
  // Client script to complete client rendering.
  const clientComponents: Record<string, PendingComponentRender> = {};
  const ssrComponentsRenderData: SSRUpdateData['data'] = [];

  for (const componentName of Object.keys(renderUpdates)) {
    const { component, source, importedName, effectElements } =
      renderUpdates[componentName];

    for (const element of effectElements) {
      const renderDirective = element.getAttribute(renderDirectiveAttr) || '';
      const renderId = element.getAttribute(renderIdAttr) || '';
      // Component props exclude attributes in RENDER_STRATEGY_ATTRS.
      const props = collectComponentProps(element);

      if (requiresPreRenderDirective(renderDirective)) {
        // A pre-rendered module is required for all SSR components.
        ssrComponentsRenderData.push({
          renderId,
          componentName,
          props,
        });

        /**
         * If all render containers of the render component have only ssr:only rendering type,
         * then the client script does not need to be injected.
         */
        if (ssrOnlyComponents.has(componentName)) {
          continue;
        }

        ssrClientComponents[renderId] = {
          component,
          source,
          importedName,
          componentName,
          renderDirective,
          props,
        };
      } else {
        clientComponents[renderId] = {
          component,
          source,
          importedName,
          componentName,
          renderDirective,
          props,
        };
      }
    }
  }

  /**
   * Need to handle the side effects of component containers in the markdown document during the hmr phase,
   * such as:
   * 1. Component container attribute changes.
   * 2. Component container position changes.
   * 3. Component import reference changes.
   * 4. Component rendering strategy changes.
   */
  const loadComponentsAndRenderComponentsOrHydrateComponents =
    async (): Promise<void> => {
      const clientApplyStartedAt = getSiteDevToolsNow();
      const loadComponents: Record<string, Promise<ReactComponentRecord>> = {};
      const workInProgressInjectComponent: Record<string, DevComponentInfo> =
        {};
      const ReactRuntime = context.getReact();
      const ReactDOMRuntime = context.getReactDOM();

      for (const renderId of Object.keys(clientComponents)) {
        const { component, source, importedName } = clientComponents[renderId];
        queueComponentLoad(loadComponents, component, source, importedName);
      }

      for (const renderId of Object.keys(ssrClientComponents)) {
        const { component, source, importedName } =
          ssrClientComponents[renderId];
        queueComponentLoad(loadComponents, component, source, importedName);
      }

      for (const [, reuseEntry] of reuseInjectComponent.entries()) {
        queueComponentLoad(
          loadComponents,
          reuseEntry.component,
          reuseEntry.path,
          reuseEntry.importedName,
        );
      }

      for (const renderId of Object.keys(rerenderExistingRoots)) {
        const { component, source, importedName } =
          rerenderExistingRoots[renderId];
        queueComponentLoad(loadComponents, component, source, importedName);
      }

      const componentsMap = await buildComponentsMap(loadComponents);

      for (const renderId of Object.keys(rerenderExistingRoots)) {
        const { source, importedName, props, renderDirective, componentName } =
          rerenderExistingRoots[renderId];
        const key = getComponentLoadKey(source, importedName);
        const Component = componentsMap.get(key);
        if (!Component) {
          continue;
        }

        const renderElement = document.querySelector(
          `[${renderIdAttr}="${renderId}"]`,
        );
        if (!renderElement) {
          continue;
        }

        workInProgressInjectComponent[componentName] = {
          component: Component,
          path: source,
          importedName,
        };

        const root = getReactRenderRoot(renderElement);
        if (root) {
          root.render(ReactRuntime.createElement(Component, props));
          continue;
        }

        if (renderDirective !== 'ssr:only') {
          const fallbackRoot =
            renderDirective === 'client:only'
              ? ReactDOMRuntime.createRoot(renderElement)
              : ReactDOMRuntime.hydrateRoot(
                  renderElement,
                  ReactRuntime.createElement(Component, props),
                );
          rememberReactRenderState(renderElement, fallbackRoot, Component);
          if (renderDirective === 'client:only') {
            fallbackRoot.render(ReactRuntime.createElement(Component, props));
          }
        }
      }

      for (const renderId of Object.keys(clientComponents)) {
        const { source, importedName, props, componentName } =
          clientComponents[renderId];
        const key = getComponentLoadKey(source, importedName);
        const Component = componentsMap.get(key);
        if (!Component) {
          continue;
        }

        const renderElement = document.querySelector(
          `[${renderIdAttr}="${renderId}"]`,
        );
        if (!renderElement) {
          continue;
        }

        workInProgressInjectComponent[componentName] = {
          component: Component,
          path: source,
          importedName,
        };
        const root = ReactDOMRuntime.createRoot(renderElement);
        rememberReactRenderState(renderElement, root, Component);
        root.render(ReactRuntime.createElement(Component, props));
      }

      for (const renderId of Object.keys(ssrClientComponents)) {
        const { source, importedName, renderDirective, props, componentName } =
          ssrClientComponents[renderId];
        const key = getComponentLoadKey(source, importedName);
        const Component = componentsMap.get(key);
        if (renderDirective === 'ssr:only' || !Component) {
          continue;
        }

        const renderElement = document.querySelector(
          `[${renderIdAttr}="${renderId}"]`,
        );
        if (!renderElement) {
          continue;
        }

        workInProgressInjectComponent[componentName] = {
          component: Component,
          path: source,
          importedName,
        };
        const root = ReactDOMRuntime.hydrateRoot(
          renderElement,
          ReactRuntime.createElement(Component, props),
        );
        rememberReactRenderState(renderElement, root, Component);
      }

      for (const [
        componentName,
        reuseEntry,
      ] of reuseInjectComponent.entries()) {
        const key = getComponentLoadKey(
          reuseEntry.path,
          reuseEntry.importedName,
        );
        workInProgressInjectComponent[componentName] = {
          component: reuseEntry.component || componentsMap.get(key) || null,
          path: reuseEntry.path,
          importedName: reuseEntry.importedName,
        };
      }
      reuseInjectComponent.clear();

      for (const [componentName, ssrOnlyEntry] of ssrOnlyComponents.entries()) {
        workInProgressInjectComponent[componentName] = {
          component: ssrOnlyEntry.component,
          path: ssrOnlyEntry.path,
          importedName: ssrOnlyEntry.importedName,
        };
      }
      ssrOnlyComponents.clear();

      // Update global injectComponent.
      window[RENDER_STRATEGY_CONSTANTS.injectComponent][context.getPageId()] =
        workInProgressInjectComponent;
      reactComponentManager.reset();
      for (const componentName of Object.keys(workInProgressInjectComponent)) {
        reactComponentManager.notifyComponentLoaded(
          context.getPageId(),
          componentName,
        );
      }

      const completedAt = getSiteDevToolsNow();
      const clientApplyDurationMs = Number(
        (completedAt - clientApplyStartedAt).toFixed(2),
      );
      Logger.debug(
        formatDebugMessage({
          context: 'react markdown hmr apply',
          decision:
            'replace injectComponent registry and notify component runtime subscribers',
          summary: {
            clientRenderCount: Object.keys(clientComponents).length,
            hydrateCount: Object.keys(ssrClientComponents).length,
            pageId: context.getPageId(),
            registryCount: Object.keys(workInProgressInjectComponent).length,
            rerenderCount: Object.keys(rerenderExistingRoots).length,
            updatedComponentCount: activeHmrComponentNames.length,
          },
          timingMs: clientApplyDurationMs,
        }),
      );
      context.updateDevHmrMetrics(
        activeHmrComponentNames,
        {
          clientApplyDurationMs,
          status: 'completed',
          updatedAt: completedAt,
        },
        true,
      );
      DebugLogger.info('react component hmr completed', {
        clientApplyDurationMs,
        components: activeHmrComponentNames,
        pageId: context.getPageId(),
      });
    };

  const handleMarkdownUpdateRender = ({
    pathname,
    data,
  }: SSRUpdateRenderData) => {
    if (import.meta.hot) {
      import.meta.hot.off(
        REACT_HMR_EVENT_NAMES.markdownRender,
        handleMarkdownUpdateRender,
      );
    }

    if (pathname === context.getPageId() && data.length > 0) {
      const ssrUpdatedComponentNames = new Set<string>();
      const ssrComponentsMap = new Map<string, Element>();
      const renderComponents =
        reactRenderStrategy.collectLegalRenderComponents();
      const ssrComponents = renderComponents.filter((renderComponent) =>
        NEED_PRE_RENDER_DIRECTIVES.includes(renderComponent.renderDirective),
      );

      for (const ssrComponent of ssrComponents) {
        ssrComponentsMap.set(ssrComponent.renderId, ssrComponent.element);
      }

      for (const ssrData of data) {
        const { renderId, ssrOnlyCss, ssrHtml } = ssrData;
        const element = ssrComponentsMap.get(renderId);
        if (!element) {
          continue;
        }

        const matchedComponent = ssrComponentsRenderData.find(
          (item) => item.renderId === renderId,
        );
        if (matchedComponent) {
          ssrUpdatedComponentNames.add(matchedComponent.componentName);
        }
        if (ssrOnlyCss.length > 0) {
          /**
           * This is an update process, there may be existing old css resources,
           * so we need to update them first, then remove the old css resources to
           * avoid style jitter.
           */
          replaceSsrCssResources(ssrOnlyCss);
        }
        element.innerHTML = ssrHtml;
      }

      const ssrAppliedAt = getSiteDevToolsNow();
      context.updateDevHmrMetrics(ssrUpdatedComponentNames, {
        ssrApplyDurationMs: undefined,
        updatedAt: ssrAppliedAt,
      });
    }

    context.runAsyncTask(
      loadComponentsAndRenderComponentsOrHydrateComponents().catch((error) => {
        context.failPendingDevHmrMetrics(activeHmrComponentNames, error);
        throw error;
      }),
      VITEPRESS_HMR_LOG_GROUPS.viteAfterUpdateRender,
      'Failed to apply React markdown HMR render',
    );
  };

  if (ssrComponentsRenderData.length > 0) {
    const ssrUpdateData: SSRUpdateData = {
      pathname: context.getPageId(),
      data: ssrComponentsRenderData,
      updateType: 'markdown-update',
    };

    if (import.meta.hot) {
      import.meta.hot.on(
        REACT_HMR_EVENT_NAMES.markdownRender,
        handleMarkdownUpdateRender,
      );
      import.meta.hot.send(
        REACT_HMR_EVENT_NAMES.ssrRenderRequest,
        ssrUpdateData,
      );
    }
    return;
  }

  context.runAsyncTask(
    loadComponentsAndRenderComponentsOrHydrateComponents().catch((error) => {
      context.failPendingDevHmrMetrics(activeHmrComponentNames, error);
      throw error;
    }),
    VITEPRESS_HMR_LOG_GROUPS.viteAfterUpdateRender,
    'Failed to finalize React markdown HMR',
  );
};
