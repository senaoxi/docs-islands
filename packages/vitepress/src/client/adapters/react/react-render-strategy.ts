import type { RenderDirective } from '#dep-types/render';
import {
  createSiteDevToolsLogger,
  type SiteDevToolsRenderMode,
  updateSiteDevToolsRenderMetric,
} from '#shared/internal/devtools';
import { validateLegalRenderElements } from '#shared/utils';
import type { DocsHydrateResult } from '@docs-islands/core/client';
import { DocsRenderStrategy } from '@docs-islands/core/client';
import { formatErrorMessage } from 'logaria/helper';
import type React from 'react';
import { getCleanPathname } from '../../../shared/runtime';
import { reactComponentManager } from './react-component-manager';
import { rememberReactRenderState } from './react-render-root-store';

const DebugLogger = createSiteDevToolsLogger('react-render-strategy');

type ReactComponentRecord = React.ComponentType<Record<string, string>>;

interface RenderContext {
  isInitialLoad: boolean;
  pageId: string;
}

export interface RenderComponent {
  element: Element;
  props: Record<string, string>;
  renderComponent: string;
  renderDirective: RenderDirective;
  renderId: string;
  renderWithSpaSync: boolean;
}

const isReactRuntimeAvailable = (): boolean =>
  globalThis.window?.React !== undefined &&
  globalThis.window?.ReactDOM !== undefined;

const createReactHydrateResult = async (info: {
  component: ReactComponentRecord;
  element: Element;
  props: Record<string, string>;
}): Promise<DocsHydrateResult> => {
  const reactElement = globalThis.window!.React!.createElement(
    info.component,
    info.props,
  );

  try {
    const root = globalThis.window!.ReactDOM!.hydrateRoot(
      info.element,
      reactElement,
    );
    rememberReactRenderState(info.element, root, info.component);
    return {
      renderMode: 'hydrate',
    };
  } catch (error) {
    const fallbackMessage = formatErrorMessage(error);
    const root = globalThis.window!.ReactDOM!.createRoot(info.element);
    rememberReactRenderState(info.element, root, info.component);
    root.render(reactElement);
    return {
      errorMessage: fallbackMessage,
      renderMode: 'render',
    };
  }
};

export class ReactRenderStrategy {
  /**
   * The shared DocsRenderStrategy owns container discovery, directive handling,
   * visibility scheduling, SPA sync, and SSR inject execution order.
   *
   * The React adapter only supplies the framework-specific pieces: how to obtain
   * the runtime, how to hydrate, and how to remember the mounted React root.
   */
  private readonly strategy = new DocsRenderStrategy<ReactComponentRecord>({
    componentManager: reactComponentManager,
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
      onRenderStateChange: (info, patch) => {
        updateSiteDevToolsRenderMetric({
          componentName: info.renderComponent,
          pageId: getCleanPathname(),
          renderDirective: info.renderDirective,
          renderId: info.renderId,
          renderMode: patch.renderMode as SiteDevToolsRenderMode | undefined,
          renderWithSpaSync: info.renderWithSpaSync,
          source: 'react-render-strategy',
          ...patch,
        });
      },
    },
    renderer: {
      ensureRuntime: () => reactComponentManager.loadReact(),
      executeSsrInjectScript: async (scriptPath: string) => {
        const module = await import(/* @vite-ignore */ scriptPath);
        if (typeof module.__SSR_INJECT_CODE__ === 'function') {
          module.__SSR_INJECT_CODE__();
          return true;
        }

        return false;
      },
      framework: 'react',
      /**
       * The generic runtime guarantees the framework adapter is consulted only after
       * runtime/component readiness checks have passed, so a missing React runtime here
       * is treated as a safety guard rather than a normal control flow path.
       */
      hydrate: async ({ component, element, props }) =>
        createReactHydrateResult({
          component,
          element,
          props,
        }),
      isRuntimeAvailable: () => isReactRuntimeAvailable(),
      render: async ({ component, element, props }) => {
        const root = globalThis.window!.ReactDOM!.createRoot(element);
        rememberReactRenderState(element, root, component);
        const reactElement = globalThis.window!.React!.createElement(
          component,
          props,
        );
        root.render(reactElement);
      },
    },
    validateRenderElement: validateLegalRenderElements,
  });

  public collectLegalRenderComponents(): RenderComponent[] {
    return this.strategy.collectRenderContainers() as RenderComponent[];
  }

  public async executeReactRuntime(context: RenderContext): Promise<void> {
    await this.strategy.executeRuntime(context);
  }

  public cleanup(): void {
    this.strategy.cleanup();
  }
}

export const reactRenderStrategy: ReactRenderStrategy =
  new ReactRenderStrategy();
