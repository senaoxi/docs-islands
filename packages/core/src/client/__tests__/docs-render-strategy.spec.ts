/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RENDER_STRATEGY_CONSTANTS } from '../../shared/constants/render-strategy';
import type { DocsRendererAdapter } from '../../types/client';
import type { RenderDirective } from '../../types/render';
import {
  DocsRenderStrategy,
  type DocsRenderStrategyOptions,
} from '../docs-render-strategy';

vi.mock('@docs-islands/utils/logger', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@docs-islands/utils/logger')>();

  return {
    ...actual,
    createLogger: () => ({
      getLoggerByGroup: () => ({
        debug: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        success: vi.fn(),
        warn: vi.fn(),
      }),
    }),
    formatErrorMessage: (error: unknown) =>
      error instanceof Error ? error.message : String(error),
  };
});

interface TestComponent {
  name: string;
}

type TestComponentManager =
  DocsRenderStrategyOptions<TestComponent>['componentManager'];
type TestRenderer = DocsRendererAdapter<TestComponent>;

describe('DocsRenderStrategy', () => {
  let strategy: DocsRenderStrategy<TestComponent>;
  let componentManager: TestComponentManager;
  let renderer: TestRenderer;

  beforeEach(() => {
    document.body.innerHTML = '';

    componentManager = {
      getComponent: vi.fn<TestComponentManager['getComponent']>(() => ({
        name: 'TestComponent',
      })),
      getPageComponentInfo: vi.fn<TestComponentManager['getPageComponentInfo']>(
        () => ({
          cssBundlePaths: [],
          loaderScript: '/assets/runtime.js',
          modulePreloads: [],
          pathname: '/test-page',
          ssrInjectScript: '/assets/ssr-inject.js',
        }),
      ),
      loadPageComponents: vi.fn<TestComponentManager['loadPageComponents']>(
        async () => true,
      ),
      subscribeComponent: vi.fn<TestComponentManager['subscribeComponent']>(
        async () => true,
      ),
    };
    renderer = {
      ensureRuntime: vi.fn<TestRenderer['ensureRuntime']>(async () => true),
      executeSsrInjectScript: vi.fn<
        NonNullable<TestRenderer['executeSsrInjectScript']>
      >(async () => true),
      framework: 'test',
      hydrate: vi.fn<TestRenderer['hydrate']>(async () => ({
        renderMode: 'hydrate',
      })),
      isRuntimeAvailable: vi.fn<TestRenderer['isRuntimeAvailable']>(() => true),
      render: vi.fn<TestRenderer['render']>(async () => {}),
    };

    strategy = new DocsRenderStrategy<TestComponent>({
      componentManager,
      framework: 'test',
      getCurrentPageId: () => '/test-page',
      renderer,
      validateRenderElement: () => true,
    });
  });

  afterEach(() => {
    strategy.cleanup();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('collects render containers and extracts component props', () => {
    const element = createMockElement(
      'feedbeef',
      'client:load',
      'TestComponent',
      'true',
    );
    element.dataset.test = 'test-value';
    document.body.append(element);

    const containers = strategy.collectRenderContainers();

    expect(containers).toHaveLength(1);
    expect(containers[0]).toMatchObject({
      renderComponent: 'TestComponent',
      renderDirective: 'client:load',
      renderId: 'feedbeef',
      renderWithSpaSync: true,
    });
    expect(containers[0]?.props['data-test']).toBe('test-value');
    expect(containers[0]?.props).not.toHaveProperty('__render_id__');
  });

  it('hydrates client:load containers and waits for client:visible containers to intersect', async () => {
    const loadElement = createMockElement(
      '12345678',
      'client:load',
      'LoadComponent',
      'true',
    );
    loadElement.innerHTML = '<div>SSR shell</div>';
    const visibleElement = createMockElement(
      'abcdef12',
      'client:visible',
      'VisibleComponent',
      'true',
    );
    visibleElement.innerHTML = '<div>SSR shell</div>';
    document.body.append(loadElement, visibleElement);

    const observer = {
      callback: null as
        | ((entries: { isIntersecting: boolean; target: Element }[]) => void)
        | null,
      disconnect: vi.fn<IntersectionObserver['disconnect']>(),
      observe: vi.fn<IntersectionObserver['observe']>(),
      unobserve: vi.fn<IntersectionObserver['unobserve']>(),
    };

    vi.stubGlobal(
      'IntersectionObserver',
      class {
        public constructor(
          callback: (
            entries: { isIntersecting: boolean; target: Element }[],
          ) => void,
        ) {
          observer.callback = callback;
        }

        public disconnect = observer.disconnect;
        public observe = observer.observe;
        public unobserve = observer.unobserve;
      },
    );

    await strategy.executeRuntime({
      isInitialLoad: true,
      pageId: '/test-page',
    });

    expect(componentManager.subscribeComponent).toHaveBeenCalledWith(
      '/test-page',
      'LoadComponent',
    );
    expect(renderer.hydrate).toHaveBeenCalledWith(
      expect.objectContaining({
        pageId: '/test-page',
        renderComponent: 'LoadComponent',
      }),
    );
    expect(observer.observe).toHaveBeenCalledWith(visibleElement);

    observer.callback?.([
      {
        isIntersecting: true,
        target: visibleElement,
      },
    ]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(observer.unobserve).toHaveBeenCalledWith(visibleElement);
    expect(componentManager.subscribeComponent).toHaveBeenCalledWith(
      '/test-page',
      'VisibleComponent',
    );
  });

  it('loads page components and executes SSR inject scripts on route updates', async () => {
    const element = createMockElement(
      '87654321',
      'client:load',
      'RouteComponent',
      'true',
    );
    element.innerHTML = '<div>SSR shell</div>';
    document.body.append(element);

    await strategy.executeRuntime({
      isInitialLoad: false,
      pageId: '/test-page',
    });

    expect(componentManager.loadPageComponents).toHaveBeenCalledWith(
      '/test-page',
    );
    expect(renderer.executeSsrInjectScript).toHaveBeenCalledWith(
      '/assets/ssr-inject.js',
    );
    expect(renderer.hydrate).toHaveBeenCalledTimes(1);
  });
});

function createMockElement(
  renderId: string,
  renderDirective: RenderDirective,
  renderComponent: string,
  renderWithSpaSync: string,
): HTMLElement {
  const element = document.createElement('div');
  element.setAttribute(
    RENDER_STRATEGY_CONSTANTS.renderId.toLowerCase(),
    renderId,
  );
  element.setAttribute(
    RENDER_STRATEGY_CONSTANTS.renderDirective.toLowerCase(),
    renderDirective,
  );
  element.setAttribute(
    RENDER_STRATEGY_CONSTANTS.renderComponent.toLowerCase(),
    renderComponent,
  );
  element.setAttribute(
    RENDER_STRATEGY_CONSTANTS.renderWithSpaSync.toLowerCase(),
    renderWithSpaSync,
  );
  return element;
}
