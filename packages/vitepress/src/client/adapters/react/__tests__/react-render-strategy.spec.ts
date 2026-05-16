/**
 * @vitest-environment jsdom
 */
import type { RenderDirective } from '#dep-types/render';
import { RENDER_STRATEGY_CONSTANTS } from '@docs-islands/core/shared/constants/render-strategy';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReactRenderStrategy } from '../react-render-strategy';

vi.mock('@docs-islands/utils/logger', () => ({
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

vi.mock('../../../../shared/runtime', () => ({
  getCleanPathname: vi.fn(() => '/test-page'),
}));

vi.mock('../../../../shared/utils', () => ({
  validateLegalRenderElements: vi.fn(() => true),
}));

// Mock ReactComponentManager (hoisted).
const mockReactComponentManager = vi.hoisted(() => ({
  subscribeComponent: vi.fn(async () => true),
  getComponent: vi.fn(() => vi.fn()),
  loadPageComponents: vi.fn(async () => true),
  getPageComponentInfo: vi.fn(() => ({
    ssrInjectScript: '/assets/ssr-inject.js',
  })),
}));

vi.mock('../react-component-manager', () => ({
  reactComponentManager: mockReactComponentManager,
}));

describe('ReactRenderStrategy', () => {
  let strategy: ReactRenderStrategy;
  let mockElements: HTMLElement[];

  beforeEach(() => {
    strategy = new ReactRenderStrategy();

    // Set up the DOM environment.
    document.body.innerHTML = '';

    // Mock window React globals.
    Object.defineProperty(globalThis, 'React', {
      writable: true,
      value: {
        createElement: vi.fn(() => ({ type: 'div', props: {} })),
      },
    });

    Object.defineProperty(globalThis, 'ReactDOM', {
      writable: true,
      value: {
        createRoot: vi.fn(() => ({
          render: vi.fn(),
        })),
        hydrateRoot: vi.fn(),
      },
    });

    // Reset all mocks.
    vi.clearAllMocks();
  });

  afterEach(() => {
    strategy.cleanup();
    document.body.innerHTML = '';
  });

  describe('component discovery and rendering', () => {
    beforeEach(() => {
      // Create test elements.
      mockElements = [
        createMockElement('12345678', 'client:load', 'TestComponent', 'true'),
        createMockElement(
          'abcdef12',
          'client:visible',
          'AnotherComponent',
          'false',
        ),
        createMockElement('87654321', 'ssr:only', 'ServerComponent', 'true'),
      ];

      for (const el of mockElements) document.body.append(el);
    });

    it('should collect all render components', () => {
      const components = strategy.collectLegalRenderComponents();
      expect(components).toHaveLength(3);
      expect(components[0].renderComponent).toBe('TestComponent');
    });

    it('should extract component props correctly', () => {
      const element = createMockElement(
        'feedbeef',
        'client:load',
        'TestComponent',
        'true',
      );
      element.dataset.test = 'test-value';
      document.body.append(element);

      const components = strategy.collectLegalRenderComponents();
      const component = components.find((c) => c.renderId === 'feedbeef');

      expect(component?.props['data-test']).toBe('test-value');
      expect(component?.props).not.toHaveProperty('__render_id__');
    });
  });

  describe('React runtime execution', () => {
    beforeEach(() => {
      const mockElement = createMockElement(
        '12345678',
        'client:load',
        'TestComponent',
        'true',
      );
      document.body.append(mockElement);
    });

    it('should execute initial load runtime', async () => {
      await strategy.executeReactRuntime({
        pageId: '/test-page',
        isInitialLoad: true,
      });

      // On initial load, loadPageComponents is not called directly.
      expect(
        mockReactComponentManager.loadPageComponents,
      ).not.toHaveBeenCalled();
      // subscribeComponent will be called but may timeout due to components not being loaded.
      expect(mockReactComponentManager.subscribeComponent).toHaveBeenCalledWith(
        '/test-page',
        'TestComponent',
      );
    });

    it('should handle component hydration', async () => {
      await strategy.executeReactRuntime({
        pageId: '/test-page',
        isInitialLoad: true,
      });

      expect(globalThis.React?.createElement).toHaveBeenCalled();
      expect(globalThis.ReactDOM?.hydrateRoot).toHaveBeenCalled();
    });

    it('should fallback to client render on hydration failure', async () => {
      const mockRoot = { render: vi.fn() };
      if (globalThis.ReactDOM) {
        globalThis.ReactDOM.hydrateRoot = vi.fn().mockImplementation(() => {
          throw new Error('Hydration failed');
        });
        globalThis.ReactDOM.createRoot = vi.fn().mockReturnValue(mockRoot);
      }

      await strategy.executeReactRuntime({
        pageId: '/test-page',
        isInitialLoad: true,
      });

      expect(globalThis.ReactDOM?.createRoot).toHaveBeenCalled();
      expect(mockRoot.render).toHaveBeenCalled();
    });
  });

  describe('client:visible intersection observer', () => {
    let mockIntersectionObserver: any;
    let mockElement: HTMLElement;

    beforeEach(() => {
      mockElement = createMockElement(
        '12345678',
        'client:visible',
        'VisibleComponent',
        'true',
      );
      document.body.append(mockElement);

      mockIntersectionObserver = {
        observe: vi.fn(),
        unobserve: vi.fn(),
        disconnect: vi.fn(),
      };

      (globalThis as any).IntersectionObserver = vi
        .fn()
        .mockImplementation((callback: any) => {
          mockIntersectionObserver.callback = callback;
          return mockIntersectionObserver;
        });
    });

    it('should setup visibility observer for client:visible components', async () => {
      await strategy.executeReactRuntime({
        pageId: '/test-page',
        isInitialLoad: true,
      });

      expect(globalThis.IntersectionObserver).toHaveBeenCalled();
      expect(mockIntersectionObserver.observe).toHaveBeenCalledWith(
        mockElement,
      );
    });

    it('should trigger hydration when element becomes visible', async () => {
      await strategy.executeReactRuntime({
        pageId: '/test-page',
        isInitialLoad: true,
      });

      mockIntersectionObserver.callback([
        {
          isIntersecting: true,
          target: mockElement,
        },
      ]);

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockIntersectionObserver.unobserve).toHaveBeenCalledWith(
        mockElement,
      );
      expect(mockReactComponentManager.subscribeComponent).toHaveBeenCalledWith(
        '/test-page',
        'VisibleComponent',
      );
    });
  });

  // Helper function to create mock elements.
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
});
