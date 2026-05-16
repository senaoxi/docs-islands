/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExtractedProps } from '../react-ssr-integration-processor';
import { transformReactSSRIntegrationCode } from '../react-ssr-integration-processor';

// Mock logger.
vi.mock('#shared/logger', () => ({
  createLogger: () => ({
    getLoggerByGroup: () => ({
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
    }),
  }),
}));

describe('ReactSSRIntegrationProcessor', () => {
  let mockCallback: (props: ExtractedProps) => {
    ssrHtml?: string;
    ssrCssBundlePaths?: Set<string>;
    clientRuntimeFileName: string;
  };

  beforeEach(() => {
    mockCallback = vi.fn((props) => ({
      ssrHtml: `<div>SSR Content for ${props.__render_component__}</div>`,
      clientRuntimeFileName: 'runtime.12345678.js',
    }));
    vi.clearAllMocks();
  });

  describe('basic transformation', () => {
    it('should transform valid React component calls', () => {
      const sourceCode = `
        import { createVNode as _createVNode } from "vue";
        const _component_TestComponent = () => _createVNode("div", {
          "__render_id__": "12345678",
          "__render_component__": "TestComponent",
          "__render_directive__": "client:load",
          "__spa_sync_render__": "true"
        });
      `;

      const result = transformReactSSRIntegrationCode(sourceCode, mockCallback);

      expect(result.transformCount).toBe(1);
      expect(result.code).toContain('innerHTML');
      expect(mockCallback).toHaveBeenCalledWith({
        __render_id__: '12345678',
        __render_component__: 'TestComponent',
        __render_directive__: 'client:load',
        __spa_sync_render__: 'true',
      });
    });

    it('should handle multiple component transformations', () => {
      const sourceCode = `
        _createVNode("div", {
          "__render_id__": "aaaa1111",
          "__render_component__": "Component1",
          "__render_directive__": "client:load",
          "__spa_sync_render__": "true"
        });
        _createVNode("div", {
          "__render_id__": "bbbb2222",
          "__render_component__": "Component2",
          "__render_directive__": "ssr:only",
          "__spa_sync_render__": "false"
        });
      `;

      const result = transformReactSSRIntegrationCode(sourceCode, mockCallback);

      expect(result.transformCount).toBe(1);
      expect(mockCallback).toHaveBeenCalledTimes(1);
    });
  });

  describe('client:only directive handling', () => {
    it('should skip client:only directives', () => {
      const sourceCode = `
        _createVNode("div", {
          "__render_id__": "12345678",
          "__render_component__": "TestComponent",
          "__render_directive__": "client:only",
          "__spa_sync_render__": "true"
        });
      `;

      const result = transformReactSSRIntegrationCode(sourceCode, mockCallback);

      expect(result.transformCount).toBe(0);
      expect(mockCallback).not.toHaveBeenCalled();
    });
  });

  describe('prop extraction', () => {
    it('should extract string literal props', () => {
      const sourceCode = `
        _createVNode("div", {
          "__render_id__": "12345678",
          "__render_component__": "TestComponent",
          "__render_directive__": "client:load",
          "__spa_sync_render__": "true",
          "title": "Test Title",
          "description": "A test component"
        });
      `;

      const result = transformReactSSRIntegrationCode(sourceCode, mockCallback);

      expect(result.transformCount).toBe(1);
      expect(mockCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Test Title',
          description: 'A test component',
        }),
      );
    });

    it('should extract numeric literal props', () => {
      const sourceCode = `
        _createVNode("div", {
          "__render_id__": "12345678",
          "__render_component__": "TestComponent",
          "__render_directive__": "client:load",
          "__spa_sync_render__": "true",
          "count": 42,
          "percentage": 3.14
        });
      `;

      const result = transformReactSSRIntegrationCode(sourceCode, mockCallback);

      expect(result.transformCount).toBe(1);
      expect(mockCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          count: 42,
          percentage: 3.14,
        }),
      );
    });

    it('should extract boolean and null props', () => {
      const sourceCode = `
        _createVNode("div", {
          "__render_id__": "12345678",
          "__render_component__": "TestComponent",
          "__render_directive__": "client:load",
          "__spa_sync_render__": "true",
          "enabled": true,
          "disabled": false,
          "empty": null
        });
      `;

      const result = transformReactSSRIntegrationCode(sourceCode, mockCallback);

      expect(result.transformCount).toBe(1);
      expect(mockCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: true,
          disabled: false,
          empty: null,
        }),
      );
    });

    it('should handle complex prop types as template strings', () => {
      const sourceCode = `
        _createVNode("div", {
          "__render_id__": "12345678",
          "__render_component__": "TestComponent",
          "__render_directive__": "client:load",
          "__spa_sync_render__": "true",
          "items": [1, 2, 3],
          "config": { key: "value" },
          "dynamicProp": someVariable
        });
      `;

      const result = transformReactSSRIntegrationCode(sourceCode, mockCallback);

      expect(result.transformCount).toBe(1);
      expect(mockCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [1, 2, 3],
          config: { key: 'value' },
          dynamicprop: '{{someVariable}}',
        }),
      );
    });
  });

  describe('filter conditions', () => {
    it('should skip non-div elements', () => {
      const sourceCode = `
        _createVNode("span", {
          "__render_id__": "12345678",
          "__render_component__": "TestComponent",
          "__render_directive__": "client:load",
          "__spa_sync_render__": "true"
        });
      `;

      const result = transformReactSSRIntegrationCode(sourceCode, mockCallback);

      expect(result.transformCount).toBe(0);
      expect(mockCallback).not.toHaveBeenCalled();
    });

    it('should skip calls with missing required attributes', () => {
      const sourceCode = `
        _createVNode("div", {
          "__render_id__": "12345678",
          "__render_component__": "TestComponent"
          // Missing __render_directive__ and __spa_sync_render__.
        });
      `;

      const result = transformReactSSRIntegrationCode(sourceCode, mockCallback);

      expect(result.transformCount).toBe(0);
      expect(mockCallback).not.toHaveBeenCalled();
    });

    it('should skip calls with insufficient arguments', () => {
      const sourceCode = `
        _createVNode("div");
      `;

      const result = transformReactSSRIntegrationCode(sourceCode, mockCallback);

      expect(result.transformCount).toBe(0);
      expect(mockCallback).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle syntax errors gracefully', () => {
      const invalidSourceCode = `
        _createVNode("div", {
          "__render_id__": "12345678"
          "__render_component__": "TestComponent" // Missing comma
          "__render_directive__": "client:load"
        });
      `;

      const result = transformReactSSRIntegrationCode(
        invalidSourceCode,
        mockCallback,
      );

      expect(result.transformCount).toBe(0);
    });

    it('should handle callback errors gracefully', () => {
      const errorCallback = vi.fn(() => {
        throw new Error('Callback processing failed');
      });

      const sourceCode = `
        _createVNode("div", {
          "__render_id__": "12345678",
          "__render_component__": "TestComponent",
          "__render_directive__": "client:load",
          "__spa_sync_render__": "true"
        });
      `;

      const result = transformReactSSRIntegrationCode(
        sourceCode,
        errorCallback,
      );

      // Should not crash, but should not transform either.
      expect(result.transformCount).toBe(0);
      expect(result.code).toBe(sourceCode);
    });

    it('should handle non-string callback return gracefully', () => {
      const invalidCallback = vi.fn(() => 123 as any);

      const sourceCode = `
        _createVNode("div", {
          "__render_id__": "12345678",
          "__render_component__": "TestComponent",
          "__render_directive__": "client:load",
          "__spa_sync_render__": "true"
        });
      `;

      const result = transformReactSSRIntegrationCode(
        sourceCode,
        invalidCallback,
      );

      expect(result.transformCount).toBe(0);
    });
  });

  describe('transformation stats', () => {
    it('should provide transformation statistics', () => {
      const sourceCode = `
        // Line 2
        _createVNode("div", {
          "__render_id__": "12345678",
          "__render_component__": "TestComponent",
          "__render_directive__": "client:load",
          "__spa_sync_render__": "true"
        });
      `;

      const result = transformReactSSRIntegrationCode(sourceCode, mockCallback);

      expect(result.stats.totalTransformations).toBe(1);
      expect(result.stats.transformedNodes).toHaveLength(1);
      expect(result.stats.transformedNodes[0]).toHaveProperty('line');
      expect(result.stats.transformedNodes[0]).toHaveProperty('column');
    });
  });

  describe('code transformation integrity', () => {
    it('should preserve original code structure when no matches', () => {
      const sourceCode = `
        const normalCode = "unchanged";
        function normalFunction() {
          return "still here";
        }
      `;

      const result = transformReactSSRIntegrationCode(sourceCode, mockCallback);

      expect(result.transformCount).toBe(0);
      expect(result.code).toContain('const normalCode = "unchanged"');
      expect(result.code).toContain('function normalFunction()');
    });

    it('should maintain code formatting with retainLines option', () => {
      const sourceCode = `_createVNode("div", {
  "__render_id__": "12345678",
  "__render_component__": "TestComponent",
  "__render_directive__": "client:load",
  "__spa_sync_render__": "true"
});`;

      const result = transformReactSSRIntegrationCode(sourceCode, mockCallback);

      expect(result.transformCount).toBe(1);
      // Should maintain general structure.
      expect(result.code.split('\n').length).toBeGreaterThan(1);
    });
  });
});
