import { describe, expect, it } from 'vitest';
import { VITEPRESS_RUNTIME_LOG_GROUPS } from '../../../../shared/constants/log-groups/runtime';
import { REACT_FRAMEWORK } from '../../../constants/adapters/react/framework';
import { ReactRenderController } from '../react-render-controller';

describe('ReactRenderController', () => {
  it('returns empty runtime when the page has no client components', async () => {
    const controller = new ReactRenderController();
    controller.setCompilationContainer(REACT_FRAMEWORK, '/guide/no-react.md', {
      code: '',
      helperCode: '',
      importsByLocalName: new Map(),
      ssrOnlyComponentNames: new Set(),
    });

    await expect(
      controller.generateClientRuntimeInDEV('/guide/no-react.md'),
    ).resolves.toBe('');
  });

  it('emits retryable dev runtime with empty-shell render fallback', async () => {
    const controller = new ReactRenderController();
    controller.setCompilationContainer(REACT_FRAMEWORK, '/guide/react.md', {
      code: `const Demo = () => null;`,
      helperCode: `const __RENDER_INLINE_COMPONENT_REFERENCE__ = { Demo: { component: Demo } };`,
      importsByLocalName: new Map([
        ['Demo', { identifier: '/components/Demo.tsx', importedName: 'Demo' }],
      ]),
      ssrOnlyComponentNames: new Set(),
    });

    const code = await controller.generateClientRuntimeInDEV('/guide/react.md');

    expect(code).toContain('@docs-islands/vitepress/logger');
    expect(code).toContain('@docs-islands/logger/helper');
    expect(code).toContain(
      'formatDebugMessage as __docs_islands_format_debug__,\n  formatErrorMessage as __docs_islands_format_error__',
    );
    expect(code).toContain(
      "import { createLogger } from '@docs-islands/vitepress/logger';",
    );
    expect(code).toContain('const Logger = createLogger({');
    expect(code).toContain("main: '@docs-islands/vitepress'");
    expect(code).toContain(
      `}).getLoggerByGroup('${VITEPRESS_RUNTIME_LOG_GROUPS.reactDevRender}');`,
    );
    expect(code).not.toContain('getLoggerInstance()');
    expect(code).not.toContain('emitRuntimeLog');
    expect(code).toContain('const __MAX_RENDER_ATTEMPTS__ = 10;');
    expect(code).toContain('function __queueRenderRetry__()');
    expect(code).toContain(
      'const __MISSING_COMPONENT_STARTED_AT__ = new WeakMap();',
    );
    expect(code).toContain(
      'const __get_dev_render_duration_ms__ = (start, end)',
    );
    expect(code).toContain('const __log_dev_render_debug__ = (payload)');
    expect(code).toContain('const __log_dev_render_info__ = (message)');
    expect(code).toContain(
      'const __log_dev_render_success__ = (message, elapsedTimeMs)',
    );
    expect(code).toContain(
      'const __log_dev_render_warning__ = (message, elapsedTimeMs)',
    );
    expect(code).toContain(
      'const __log_dev_render_error__ = (message, elapsedTimeMs)',
    );
    expect(code).toContain('Logger.info(message)');
    expect(code).toContain('Logger.success(message, { elapsedTimeMs })');
    expect(code).toContain('Logger.warn(message, { elapsedTimeMs })');
    expect(code).toContain('Logger.error(message, { elapsedTimeMs })');
    expect(code).toContain(
      '__log_dev_render_success__(`Component ${renderComponentName} render completed (${renderMode})`, renderDurationMs)',
    );
    expect(code).toContain('let __renderRetryWarningLogged__ = false;');
    expect(code).toContain(
      'const retryWarningStartedAt = __site_debug_now__();',
    );
    expect(code).toContain(
      '__get_dev_render_duration_ms__(retryWarningStartedAt, __site_debug_now__())',
    );
    expect(code).toContain(
      'const errorMessage = __docs_islands_format_error__(error);',
    );
    expect(code).toContain(
      '__log_dev_render_error__(`Component ${renderComponentName} client:visible render failed: ${errorMessage}`, renderDurationMs)',
    );
    expect(code).toContain(
      '__log_dev_render_error__(`Component ${renderComponentName} render failed: ${errorMessage}`, renderDurationMs)',
    );
    expect(code).toContain('not found`, renderDurationMs);');
    expect(code).toContain(
      'const renderDurationMs = __get_dev_render_duration_ms__(renderStart, renderEnd);',
    );
    const successAndErrorCalls = [
      ...code.matchAll(/__log_dev_render_(?:success|error)__\([^;]+;/g),
    ];

    expect(
      successAndErrorCalls.every((match) =>
        match[0].includes('renderDurationMs'),
      ),
    ).toBe(true);
    expect(code).not.toContain(
      '__log_dev_render_info__(`Component ${renderComponentName} render started',
    );
    expect(code).not.toContain(
      '__log_dev_render_warning__(`Component ${renderComponentName} skipped client render',
    );
    expect(code).not.toContain('@docs-islands/vitepress/internal/devtools');
    expect(code).toContain(
      "renderMode: __hasSsrContent__(dom) ? 'hydrate' : 'render'",
    );
    expect(code).toContain('const renderMode =');
    expect(code).toContain("renderDirective === 'client:only'");
    expect(code).toContain('if (hasPendingTargets) {');
  });

  it('injects siteDevtools runtime helpers only when the capability is enabled', async () => {
    const controller = new ReactRenderController({
      enableSiteDevToolsRuntime: true,
    });
    controller.setCompilationContainer(REACT_FRAMEWORK, '/guide/react.md', {
      code: `const Demo = () => null;`,
      helperCode: `const __RENDER_INLINE_COMPONENT_REFERENCE__ = { Demo: { component: Demo } };`,
      importsByLocalName: new Map([
        ['Demo', { identifier: '/components/Demo.tsx', importedName: 'Demo' }],
      ]),
      ssrOnlyComponentNames: new Set(),
    });

    const code = await controller.generateClientRuntimeInDEV('/guide/react.md');

    expect(code).toContain('@docs-islands/vitepress/internal/devtools');
  });
});
