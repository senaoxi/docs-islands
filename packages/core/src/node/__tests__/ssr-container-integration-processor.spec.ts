/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExtractedProps } from '../ssr-container-integration-processor';
import { transformSSRContainerIntegrationCode } from '../ssr-container-integration-processor';

describe('SSRContainerIntegrationProcessor', () => {
  let mockCallback: (props: ExtractedProps) => {
    clientRuntimeFileName: string;
    ssrCssBundlePaths?: Set<string>;
    ssrHtml?: string;
  };

  beforeEach(() => {
    mockCallback = vi.fn((props) => ({
      clientRuntimeFileName: 'runtime.12345678.js',
      ssrHtml: `<div>SSR Content for ${props.__render_component__}</div>`,
    }));
    vi.clearAllMocks();
  });

  it('transforms spa-sync render containers and forwards extracted props', () => {
    const sourceCode = `
      import { createVNode as _createVNode } from "vue";
      const _component_TestComponent = () => _createVNode("div", {
        "__render_id__": "12345678",
        "__render_component__": "TestComponent",
        "__render_directive__": "client:load",
        "__spa_sync_render__": "true",
        "title": "Test Title"
      });
    `;

    const result = transformSSRContainerIntegrationCode(
      sourceCode,
      mockCallback,
    );

    expect(result.transformCount).toBe(1);
    expect(result.stats.totalTransformations).toBe(1);
    expect(result.code).toContain('innerHTML');
    expect(mockCallback).toHaveBeenCalledWith({
      __render_component__: 'TestComponent',
      __render_directive__: 'client:load',
      __render_id__: '12345678',
      __spa_sync_render__: 'true',
      title: 'Test Title',
    });
  });

  it('skips client:only containers and non spa-sync containers', () => {
    const sourceCode = `
      _createVNode("div", {
        "__render_id__": "client-only",
        "__render_component__": "OnlyComponent",
        "__render_directive__": "client:only",
        "__spa_sync_render__": "true"
      });
      _createVNode("div", {
        "__render_id__": "no-sync",
        "__render_component__": "NoSyncComponent",
        "__render_directive__": "client:load",
        "__spa_sync_render__": "false"
      });
    `;

    const result = transformSSRContainerIntegrationCode(
      sourceCode,
      mockCallback,
    );

    expect(result.transformCount).toBe(0);
    expect(result.stats.totalTransformations).toBe(0);
    expect(mockCallback).not.toHaveBeenCalled();
  });

  it('injects CSS loading runtime when SSR css bundles are returned', () => {
    const sourceCode = `
      import { createVNode as _createVNode } from "vue";
      const _component_TestComponent = () => _createVNode("div", {
        "__render_id__": "12345678",
        "__render_component__": "TestComponent",
        "__render_directive__": "client:load",
        "__spa_sync_render__": "true"
      });
    `;

    const result = transformSSRContainerIntegrationCode(sourceCode, () => ({
      clientRuntimeFileName: 'runtime.12345678.js',
      ssrCssBundlePaths: new Set(['/assets/test.css']),
      ssrHtml: '<div>SSR</div>',
    }));

    expect(result.transformCount).toBe(1);
    expect(result.code).toContain(
      'import { __CSS_LOADING_RUNTIME__ } from "./chunks/runtime.12345678.js";',
    );
    expect(result.code).toContain(
      'await __CSS_LOADING_RUNTIME__(["/assets/test.css"]);',
    );
  });
});
