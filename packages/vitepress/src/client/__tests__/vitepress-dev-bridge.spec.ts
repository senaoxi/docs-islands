/**
 * @vitest-environment jsdom
 */
import type {
  DocsClientIntegrationContext,
  RenderContainerInfo,
} from '@docs-islands/core/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VitePressDevBridge } from '../vitepress-dev-bridge';

vi.mock('@docs-islands/vitepress/logger', () => ({
  createLogger: () => ({
    getLoggerByGroup: () => ({
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      success: vi.fn(),
      warn: vi.fn(),
    }),
  }),
}));

describe('VitePressDevBridge', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(import.meta, 'hot', {
      configurable: true,
      value: {
        on: vi.fn(),
        send: vi.fn(),
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('loads the dev runtime after content updates when the page only has client-render containers', async () => {
    let onContentUpdatedHandler: (() => void) | null = null;
    const lifecycle = {
      getPageId: () => '/guide/runtime',
      inBrowser: true,
      onContentUpdated: vi.fn((callback: () => void) => {
        onContentUpdatedHandler = callback;
      }),
    };
    const renderStrategy = {
      collectRenderContainers: vi.fn((): RenderContainerInfo[] => [
        {
          element: document.createElement('div'),
          props: {
            title: 'Runtime only',
          },
          renderComponent: 'ClientOnlyCard',
          renderDirective: 'client:only',
          renderId: 'client-only-card',
          renderWithSpaSync: false,
        },
      ]),
      cleanup: vi.fn(),
      executeRuntime: vi.fn(),
    };
    const bridge = new VitePressDevBridge({
      createDevRuntimeUrl: (pathname, timestamp) =>
        `/@id/__docs_islands__${pathname}?t=${timestamp}`,
    });
    const loadDevRenderRuntime = vi
      .spyOn(bridge, 'loadDevRenderRuntime')
      .mockResolvedValue();

    await bridge.initialize({
      lifecycle,
      manager: {} as any,
      renderStrategy,
    } as DocsClientIntegrationContext);

    expect(lifecycle.onContentUpdated).toHaveBeenCalledTimes(1);

    const handleContentUpdated =
      onContentUpdatedHandler as unknown as () => void;

    handleContentUpdated();
    await vi.advanceTimersByTimeAsync(32);
    await Promise.resolve();

    expect(loadDevRenderRuntime).toHaveBeenCalledWith('/guide/runtime');
  });

  it('loads the dev runtime for the current page on initial load when client-render containers already exist', async () => {
    const lifecycle = {
      getPageId: () => '/guide/runtime',
      inBrowser: true,
      onContentUpdated: vi.fn(),
    };
    const renderStrategy = {
      collectRenderContainers: vi.fn((): RenderContainerInfo[] => [
        {
          element: document.createElement('div'),
          props: {
            title: 'Runtime only',
          },
          renderComponent: 'ClientOnlyCard',
          renderDirective: 'client:only',
          renderId: 'client-only-card',
          renderWithSpaSync: false,
        },
      ]),
      cleanup: vi.fn(),
      executeRuntime: vi.fn(),
    };
    const bridge = new VitePressDevBridge({
      createDevRuntimeUrl: (pathname, timestamp) =>
        `/@id/__docs_islands__${pathname}?t=${timestamp}`,
    });
    const loadDevRenderRuntime = vi
      .spyOn(bridge, 'loadDevRenderRuntime')
      .mockResolvedValue();

    await bridge.initialize({
      lifecycle,
      manager: {} as any,
      renderStrategy,
    } as DocsClientIntegrationContext);

    await vi.advanceTimersByTimeAsync(32);
    await Promise.resolve();

    expect(loadDevRenderRuntime).toHaveBeenCalledWith('/guide/runtime');
  });

  it('retries initial page preparation until render containers become available', async () => {
    const lifecycle = {
      getPageId: () => '/guide/runtime',
      inBrowser: true,
      onContentUpdated: vi.fn(),
    };
    const renderContainer = {
      element: document.createElement('div'),
      props: {
        title: 'Runtime only',
      },
      renderComponent: 'ClientOnlyCard',
      renderDirective: 'client:only' as const,
      renderId: 'client-only-card',
      renderWithSpaSync: false,
    };
    const renderStrategy = {
      collectRenderContainers: vi
        .fn<() => RenderContainerInfo[]>()
        .mockReturnValueOnce([])
        .mockReturnValue([renderContainer]),
      cleanup: vi.fn(),
      executeRuntime: vi.fn(),
    };
    const bridge = new VitePressDevBridge({
      createDevRuntimeUrl: (pathname, timestamp) =>
        `/@id/__docs_islands__${pathname}?t=${timestamp}`,
    });
    const loadDevRenderRuntime = vi
      .spyOn(bridge, 'loadDevRenderRuntime')
      .mockResolvedValue();

    await bridge.initialize({
      lifecycle,
      manager: {} as any,
      renderStrategy,
    } as DocsClientIntegrationContext);

    await vi.advanceTimersByTimeAsync(100);
    await Promise.resolve();

    expect(renderStrategy.collectRenderContainers).toHaveBeenCalledTimes(2);
    expect(loadDevRenderRuntime).toHaveBeenCalledWith('/guide/runtime');
  });

  it('loads the dev runtime on initial load even when import.meta.hot is unavailable', async () => {
    Object.defineProperty(import.meta, 'hot', {
      configurable: true,
      value: undefined,
    });

    const lifecycle = {
      getPageId: () => '/guide/runtime',
      inBrowser: true,
      onContentUpdated: vi.fn(),
    };
    const renderStrategy = {
      collectRenderContainers: vi.fn((): RenderContainerInfo[] => [
        {
          element: document.createElement('div'),
          props: {
            title: 'Runtime only',
          },
          renderComponent: 'ClientOnlyCard',
          renderDirective: 'client:only',
          renderId: 'client-only-card',
          renderWithSpaSync: false,
        },
      ]),
      cleanup: vi.fn(),
      executeRuntime: vi.fn(),
    };
    const bridge = new VitePressDevBridge({
      createDevRuntimeUrl: (pathname, timestamp) =>
        `/@id/__docs_islands__${pathname}?t=${timestamp}`,
    });
    const loadDevRenderRuntime = vi
      .spyOn(bridge, 'loadDevRenderRuntime')
      .mockResolvedValue();

    await bridge.initialize({
      lifecycle,
      manager: {} as any,
      renderStrategy,
    } as DocsClientIntegrationContext);

    await vi.advanceTimersByTimeAsync(100);
    await Promise.resolve();

    expect(loadDevRenderRuntime).toHaveBeenCalledWith('/guide/runtime');
  });

  it('requests initial prerender data for the current page when prerender containers already exist', async () => {
    const lifecycle = {
      getPageId: () => '/guide/runtime',
      inBrowser: true,
      onContentUpdated: vi.fn(),
    };
    const renderStrategy = {
      collectRenderContainers: vi.fn((): RenderContainerInfo[] => [
        {
          element: document.createElement('div'),
          props: {
            title: 'Pre-render me',
          },
          renderComponent: 'ClientLoadCard',
          renderDirective: 'client:load',
          renderId: 'client-load-card',
          renderWithSpaSync: false,
        },
      ]),
      cleanup: vi.fn(),
      executeRuntime: vi.fn(),
    };
    const bridge = new VitePressDevBridge({
      createDevRuntimeUrl: (pathname, timestamp) =>
        `/@id/__docs_islands__${pathname}?t=${timestamp}`,
    });
    const armPendingDevMount = vi.spyOn(
      bridge as unknown as {
        armPendingDevMount: (...args: unknown[]) => void;
      },
      'armPendingDevMount',
    );

    await bridge.initialize({
      lifecycle,
      manager: {} as any,
      renderStrategy,
    } as DocsClientIntegrationContext);

    await vi.advanceTimersByTimeAsync(100);
    await Promise.resolve();

    expect(armPendingDevMount).toHaveBeenCalledTimes(1);
    expect(armPendingDevMount).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            componentName: 'ClientLoadCard',
            renderId: 'client-load-card',
          }),
        ],
        pathname: '/guide/runtime',
        updateType: 'mounted',
      }),
      [],
    );
  });
});
