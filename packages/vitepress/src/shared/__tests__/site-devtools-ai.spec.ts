import { describe, expect, it } from 'vitest';
import {
  buildSiteDevToolsAiAnalysisPrompt,
  getSiteDevToolsAiArtifactKindLabel,
  getSiteDevToolsAiEndpoint,
  getSiteDevToolsAiProviderLabel,
  sanitizeSiteDevToolsAiBuildReport,
} from '../site-devtools-ai';

describe('site-devtools-ai helpers', () => {
  it('normalizes the debug ai endpoint against the current site base', () => {
    expect(getSiteDevToolsAiEndpoint('/')).toBe('/__docs-islands/debug-ai');
    expect(getSiteDevToolsAiEndpoint('/docs')).toBe(
      '/docs/__docs-islands/debug-ai',
    );
    expect(getSiteDevToolsAiEndpoint('/docs/')).toBe(
      '/docs/__docs-islands/debug-ai',
    );
  });

  it('formats provider and artifact labels for the UI', () => {
    expect(getSiteDevToolsAiProviderLabel('claude')).toBe('Claude');
    expect(getSiteDevToolsAiProviderLabel('doubao')).toBe('Doubao');
    expect(getSiteDevToolsAiArtifactKindLabel('bundle-chunk')).toBe(
      'Bundle Chunk',
    );
    expect(getSiteDevToolsAiArtifactKindLabel('bundle-module')).toBe(
      'Bundle Module',
    );
    expect(getSiteDevToolsAiArtifactKindLabel('page-build')).toBe('Page Build');
  });

  it('builds a prompt from devtools sections instead of raw artifact metadata', () => {
    const prompt = buildSiteDevToolsAiAnalysisPrompt({
      artifactKind: 'bundle-chunk',
      artifactLabel: 'ssr-inject-code.js',
      bytes: 52_428,
      content: 'console.log("hello build artifact")',
      context: {
        artifactHeaderItems: [
          {
            label: 'Type',
            value: 'JS',
          },
          {
            label: 'Path',
            value: '/assets/ssr-inject-code.js',
          },
          {
            label: 'Size',
            value: '51.2 KB',
          },
        ],
        bundleSummaryItems: [
          {
            label: 'Total',
            value: '51.2 KB',
          },
          {
            label: 'JS',
            value: '49.2 KB',
          },
          {
            label: 'CSS',
            value: '2.0 KB',
          },
        ],
        chunkResourceItems: [
          {
            current: true,
            file: '/assets/ssr-inject-code.js',
            label: 'ssr-inject-code.js',
            moduleCount: 2,
            share: '100.0%',
            size: '51.2 KB',
            type: 'js',
          },
        ],
        componentName: 'HelloWorld',
        liveContextItems: [
          {
            label: 'Total',
            value: '15.2 ms',
          },
          {
            label: 'Bundle',
            value: '51.2 KB',
          },
        ],
        moduleItems: [
          {
            current: true,
            file: '/assets/ssr-inject-code.js',
            id: '/src/components/HelloWorld.tsx',
            label: 'HelloWorld.tsx',
            renderedSize: '20.5 KB',
            share: '40.0%',
            sizeDelta: 'Delta +13.9%',
            sourceInfo: 'Source 18.0 KB',
          },
          {
            file: '/assets/ssr-inject-code.js',
            id: '\0vite/modulepreload-polyfill',
            isVirtual: true,
            label: 'modulepreload-polyfill',
            renderedSize: '12.7 KB',
            share: '24.8%',
            sourceInfo: 'Source n/a',
            statusLabel: 'generated virtual module',
          },
        ],
        pageId: '/guide/getting-started',
        renderId: 'render-123',
        renderStatus: 'Completed',
      },
      displayPath: '/assets/ssr-inject-code.js',
      language: 'js',
    });

    expect(prompt).toContain('## Role');
    expect(prompt).toContain('## Skills');
    expect(prompt).toContain('## Action');
    expect(prompt).toContain('## Artifact-Specific Checklist');
    expect(prompt).toContain('## Constraints');
    expect(prompt).toContain('## Output');
    expect(prompt).toContain('## Debug Console Snapshot');
    expect(prompt).toContain(
      'Identify the selected chunk resource type, size, and role inside the component bundle.',
    );
    expect(prompt).toContain(
      'Use Bundle Summary and Chunk Resources to judge whether this file is unusually large, dominant, or well-balanced.',
    );
    expect(prompt).not.toContain(
      'Interpret the source state carefully: distinguish source available, source unavailable, and generated virtual module.',
    );
    expect(prompt).toContain('Current Debug Context:');
    expect(prompt).toContain('- Component: HelloWorld');
    expect(prompt).toContain('- Page: /guide/getting-started');
    expect(prompt).toContain('- Render status: Completed');
    expect(prompt).toContain('Visible Render Metrics:');
    expect(prompt).toContain('- Total: 15.2 ms');
    expect(prompt).toContain('Artifact Panel:');
    expect(prompt).toContain('- Panel: Chunk Resource');
    expect(prompt).toContain('- Type: JS');
    expect(prompt).toContain('- Path: /assets/ssr-inject-code.js');
    expect(prompt).toContain('Bundle Summary:');
    expect(prompt).toContain('- CSS: 2.0 KB');
    expect(prompt).toContain('Chunk Resources (1 shown):');
    expect(prompt).toContain('focus: current artifact');
    expect(prompt).toContain('Module Source (2 shown):');
    expect(prompt).toContain('status: current selection');
    expect(prompt).toContain('module id: vite/modulepreload-polyfill');
    expect(prompt).toContain('rendered size: 12.7 KB');
    expect(prompt).not.toContain('source: Source n/a');
    expect(prompt).not.toContain('generated virtual module');
    expect(prompt).toContain(
      'Source content and raw code are intentionally excluded from this prompt.',
    );
    expect(prompt).not.toContain('Artifact metadata:');
    expect(prompt).not.toContain('Top modules');
    expect(prompt).not.toContain('Related emitted files');
  });

  it('omits raw artifact content even when the source payload is large', () => {
    const head = 'head'.repeat(5000);
    const tail = 'tail'.repeat(5000);
    const prompt = buildSiteDevToolsAiAnalysisPrompt({
      artifactKind: 'bundle-module',
      artifactLabel: 'HugeModule.ts',
      content: `${head}\n${'middle'.repeat(5000)}\n${tail}`,
      displayPath: '/repo/HugeModule.ts',
      language: 'ts',
    });

    expect(prompt).toContain('## Role');
    expect(prompt).toContain('## Artifact-Specific Checklist');
    expect(prompt).toContain('## Constraints');
    expect(prompt).toContain('## Debug Console Snapshot');
    expect(prompt).toContain(
      'Identify what role the selected module likely plays inside its parent chunk, using the module row, artifact panel, and surrounding chunk context.',
    );
    expect(prompt).toContain(
      'Interpret the source state carefully: distinguish source available, source unavailable, and generated virtual module.',
    );
    expect(prompt).not.toContain(
      'Identify the selected chunk resource type, size, and role inside the component bundle.',
    );
    expect(prompt).not.toContain('Visible Render Metrics:');
    expect(prompt).toContain('Artifact Panel:');
    expect(prompt).toContain('- Title: HugeModule.ts');
    expect(prompt).toContain(
      'Source content and raw code are intentionally excluded from this prompt.',
    );
    expect(prompt).not.toContain(head.slice(0, 128));
    expect(prompt).not.toContain(tail.slice(-128));
    expect(prompt).not.toContain('```ts');
  });

  it('builds a page-level prompt when reports are grouped by page', () => {
    const prompt = buildSiteDevToolsAiAnalysisPrompt({
      artifactKind: 'page-build',
      artifactLabel: '/guide/getting-started',
      bytes: 10_240,
      content: 'page overview',
      context: {
        artifactHeaderItems: [
          {
            label: 'Path',
            value: '/guide/getting-started',
          },
          {
            label: 'Components',
            value: '2',
          },
        ],
        bundleSummaryItems: [
          {
            label: 'Total',
            value: '10.0 KB',
          },
          {
            label: 'JS',
            value: '6.5 KB',
          },
        ],
        chunkResourceItems: [
          {
            file: '/assets/demo-card.js',
            label: 'demo-card.js',
            moduleCount: 2,
            share: '55.0%',
            size: '5.5 KB',
            type: 'js',
          },
        ],
        moduleItems: [
          {
            file: '/assets/demo-card.js',
            id: '/src/components/DemoCard.tsx',
            label: 'DemoCard.tsx',
            renderedSize: '2.5 KB',
            share: '40.0%',
            sourceInfo: 'Source 2.2 KB',
          },
        ],
        pageComponentItems: [
          {
            chunkItems: [
              {
                file: '/assets/demo-card.js',
                label: 'demo-card.js',
                moduleCount: 2,
                modules: [
                  {
                    file: '/assets/demo-card.js',
                    id: '/src/components/DemoCard.tsx',
                    label: 'DemoCard.tsx',
                    renderedSize: '2.5 KB',
                    share: '71.4%',
                    sourceInfo: 'Source 2.2 KB',
                  },
                ],
                share: '84.0%',
                size: '5.5 KB',
                type: 'js',
              },
            ],
            componentName: 'DemoCard',
            renderDirectives: ['client:load'],
            sourcePath: '/src/components/DemoCard.tsx',
            summaryItems: [
              {
                label: 'Total',
                value: '5.5 KB',
              },
              {
                label: 'JS',
                value: '5.5 KB',
              },
              {
                label: 'CSS',
                value: '0 B',
              },
              {
                label: 'Asset',
                value: '0 B',
              },
              {
                label: 'Render Instances',
                value: '1',
              },
              {
                label: 'spa:sync-render Renders',
                value: '1',
              },
            ],
          },
        ],
        pageRenderOrderItems: [
          {
            componentName: 'DemoCard',
            renderDirective: 'client:load',
            renderId: 'render-demo-card',
            sequence: 1,
            sourcePath: '/src/components/DemoCard.tsx',
            summaryItems: [
              {
                label: 'HTML Patch Target',
                value: '/assets/guide/getting-started.hash.js',
              },
              {
                label: 'Embedded HTML Patch',
                value: '1.8 KB',
              },
              {
                label: 'Blocking CSS',
                value: '1 file(s) · 1.2 KB',
              },
              {
                label: 'Blocking CSS Files',
                value: '/assets/demo-card.css (1.2 KB)',
              },
              {
                label: 'spa:sync-render Side Effect',
                value:
                  'injects 1.8 KB of pre-rendered HTML into /assets/guide/getting-started.hash.js and waits for 1 blocking CSS file(s) before the page content can render during SPA route transitions: /assets/demo-card.css (1.2 KB).',
              },
            ],
            useSpaSyncRender: true,
          },
        ],
        pageSpaSyncComponentItems: [
          {
            componentName: 'DemoCard',
            renderDirectives: ['client:load'],
            renderIds: ['render-demo-card'],
            summaryItems: [
              {
                label: 'HTML Patch Target',
                value: '/assets/guide/getting-started.hash.js',
              },
              {
                label: 'Embedded HTML Patch',
                value: '1.8 KB',
              },
              {
                label: 'spa:sync-render Side Effect',
                value:
                  'injects 1.8 KB of pre-rendered HTML into /assets/guide/getting-started.hash.js and waits for 1 blocking CSS file(s) before the page content can render during SPA route transitions: /assets/demo-card.css (1.2 KB).',
              },
            ],
          },
        ],
        pageSpaSyncSummaryItems: [
          {
            label: 'Enabled Components',
            value: '1',
          },
          {
            label: 'Enabled Renders',
            value: '1',
          },
          {
            label: 'HTML Patch Target',
            value: '/assets/guide/getting-started.hash.js',
          },
        ],
        pageId: '/guide/getting-started',
      },
      displayPath: '/guide/getting-started',
      language: 'text',
    });

    expect(prompt).toContain('## Task');
    expect(prompt).toContain('## Current Page Snapshot');
    expect(prompt).toContain(
      'Prioritize build diagnosis over descriptive inventory.',
    );
    expect(prompt).toContain('Analysis priorities:');
    expect(prompt).toContain('Meta-rules:');
    expect(prompt).toContain(
      'Scope discipline: Always keep deduped page-level cost, per-component local composition, and `spa:sync-render` transition-side cost separate.',
    );
    expect(prompt).toContain(
      'Evidence discipline: Separate observed facts from inferences.',
    );
    expect(prompt).toContain(
      'Diagnosis discipline: Prioritize dominant drivers and blocking paths over exhaustive inventory.',
    );
    expect(prompt).toContain(
      'Directive discipline: Explain only directive effects that materially affect this page now.',
    );
    expect(prompt).toContain(
      'Optimization discipline: Order ideas by expected impact and confidence.',
    );
    expect(prompt).toContain(
      'A component with `Total: 0 B` or `Bundle Mode: No dedicated client component bundle emitted` can still contribute transition-side cost',
    );
    expect(prompt).toContain(
      'do not classify something as shared/runtime overhead from naming alone.',
    );
    expect(prompt).toContain('Current Page:');
    expect(prompt).toContain('- Panel: Page Build');
    expect(prompt).toContain('- Components: 2');
    expect(prompt).toContain('Glossary:');
    expect(prompt).toContain(
      '- Share: Rendered-byte share within the current visible list.',
    );
    expect(prompt).toContain('Current Page Rendered React Components:');
    expect(prompt).toContain('render directives: `client:load`');
    expect(prompt).toContain('Build Chunks (1 shown):');
    expect(prompt).toContain('Chunk Modules:');
    expect(prompt).toContain('Page Build Cost Snapshot:');
    expect(prompt).toContain('Top Page Resources (1 shown):');
    expect(prompt).toContain('Top Page Modules (1 shown):');
    expect(prompt).toContain('Current Page Rendering Strategy Context:');
    expect(prompt).toContain('1. `client:load`');
    expect(prompt).toContain('spa:sync-render Artifact Context:');
    expect(prompt).toContain(
      '- HTML Patch Target: /assets/guide/getting-started.hash.js',
    );
    expect(prompt).toContain('Render Order and Side Effects:');
    expect(prompt).toContain('render id: render-demo-card');
    expect(prompt).toContain('spa:sync-render Side Effect:');
    expect(prompt).toContain('- Dominant Page Cost Drivers');
    expect(prompt).toContain('- Rendering Strategy Breakdown');
    expect(prompt).toContain('- Component Composition Highlights');
    expect(prompt).toContain('- spa:sync-render Transition Impact');
    expect(prompt).toContain('- Optimization Opportunities');
    expect(prompt).toContain('- Evidence Gaps / Unknowns');
    expect(prompt).toContain(
      'State explicitly whether page cost is concentrated in a few dominant resources/modules or spread across many smaller items',
    );
    expect(prompt).toContain('Order ideas by expected impact and confidence.');
    expect(prompt).toContain(
      'Categorize gaps as `Need chunk report`, `Need module report`, `Need page comparison`, or `Need directive config evidence`',
    );
    expect(prompt).not.toContain('Artifact Panel:');
  });

  it('renders direct component modules when page context omits chunk grouping', () => {
    const prompt = buildSiteDevToolsAiAnalysisPrompt({
      artifactKind: 'page-build',
      artifactLabel: '/guide/no-chunk-grouping',
      content: 'page overview',
      context: {
        artifactHeaderItems: [
          {
            label: 'Path',
            value: '/guide/no-chunk-grouping',
          },
          {
            label: 'Composition Detail',
            value: 'component -> modules',
          },
        ],
        pageComponentItems: [
          {
            componentName: 'DemoCard',
            moduleItems: [
              {
                file: '/assets/demo-card.js',
                id: '/src/components/DemoCard.tsx',
                label: 'DemoCard.tsx',
                renderedSize: '2.5 KB',
                share: '80.0%',
                sourceInfo: 'Source 2.2 KB',
              },
            ],
            renderDirectives: ['client:load'],
            sourcePath: '/src/components/DemoCard.tsx',
            summaryItems: [
              {
                label: 'Total',
                value: '3.1 KB',
              },
            ],
          },
        ],
      },
      displayPath: '/guide/no-chunk-grouping',
      language: 'text',
    });

    expect(prompt).toContain('- Composition Detail: component -> modules');
    expect(prompt).toContain('Component Modules (1 shown):');
    expect(prompt).not.toContain('Build Chunks (1 shown):');
  });

  it('replaces local absolute filesystem paths with relative prompt paths', () => {
    const prompt = buildSiteDevToolsAiAnalysisPrompt({
      artifactKind: 'bundle-module',
      artifactLabel: 'DemoCard.tsx',
      content: 'export const DemoCard = () => null;',
      context: {
        artifactHeaderItems: [
          {
            label: 'Path',
            value:
              '/Users/alice/Project/docs-islands/packages/vitepress/src/components/DemoCard.tsx',
          },
        ],
        chunkResourceItems: [
          {
            current: true,
            file: '/assets/demo-card.js',
            label: 'demo-card.js',
            moduleCount: 1,
            share: '100.0%',
            size: '2.0 KB',
            type: 'js',
          },
        ],
        moduleItems: [
          {
            current: true,
            file: '/assets/demo-card.js',
            id: '/Users/alice/Project/docs-islands/packages/vitepress/src/components/DemoCard.tsx',
            label: 'DemoCard.tsx',
            renderedSize: '2.0 KB',
            share: '100.0%',
            sourceInfo: 'Source 1.8 KB',
          },
        ],
      },
      displayPath:
        '/Users/alice/Project/docs-islands/packages/vitepress/src/components/DemoCard.tsx',
      language: 'tsx',
    });

    expect(prompt).toContain('packages/vitepress/src/components/DemoCard.tsx');
    expect(prompt).not.toContain('/Users/alice/');
  });

  it('strips virtual-module absolute filesystem paths from prompt output', () => {
    const prompt = buildSiteDevToolsAiAnalysisPrompt({
      artifactKind: 'bundle-module',
      artifactLabel:
        '\u0000/Users/chenjiaxiang/Project/docs-islands/node_modules/.pnpm/react@18.3.1/node_modules/react/jsx-runtime.js?commonjs-module',
      content: 'virtual module',
      context: {
        moduleItems: [
          {
            current: true,
            file: '/assets/chunks/jsx-runtime.js',
            id: '\u0000/Users/chenjiaxiang/Project/docs-islands/node_modules/.pnpm/react@18.3.1/node_modules/react/jsx-runtime.js?commonjs-module',
            isVirtual: true,
            label:
              '\u0000/Users/chenjiaxiang/Project/docs-islands/node_modules/.pnpm/react@18.3.1/node_modules/react/jsx-runtime.js?commonjs-module',
            renderedSize: '31 B',
            share: '2.8%',
            sourceInfo: 'Source n/a',
            statusLabel: 'generated virtual module',
          },
        ],
      },
      displayPath:
        '\u0000/Users/chenjiaxiang/Project/docs-islands/node_modules/.pnpm/react@18.3.1/node_modules/react/jsx-runtime.js?commonjs-module',
      language: 'js',
    });

    expect(prompt).toContain(
      'node_modules/.pnpm/react@18.3.1/node_modules/react/jsx-runtime.js?commonjs-module',
    );
    expect(prompt).not.toContain('/Users/chenjiaxiang/');
    expect(prompt).not.toContain('\u0000/Users/');
  });

  it('rewrites prompt module paths relative to the shared config ancestor', () => {
    const prompt = buildSiteDevToolsAiAnalysisPrompt(
      {
        artifactKind: 'page-build',
        artifactLabel: '/zh/guide/how-it-works',
        content: 'page overview',
        context: {
          moduleItems: [
            {
              file: '/docs/assets/ReactComp1.js',
              id: '/Users/chenjiaxiang/Project/docs-islands/packages/vitepress/docs/zh/rendering-strategy-comps/react/ReactComp1.tsx',
              label: 'ReactComp1.tsx',
              renderedSize: '2.1 KB',
              share: '20.0%',
              sourceInfo: 'Source 1.8 KB',
            },
          ],
          pageId: '/zh/guide/how-it-works',
        },
        displayPath: '/zh/guide/how-it-works',
        language: 'text',
      },
      {
        anchorPath:
          '/Users/chenjiaxiang/Project/docs-islands/packages/vitepress/docs/.vitepress/config.ts',
      },
    );

    expect(prompt).toContain(
      'module id: /zh/rendering-strategy-comps/react/ReactComp1.tsx',
    );
    expect(prompt).not.toContain(
      '/Users/chenjiaxiang/Project/docs-islands/packages/vitepress/docs/',
    );
  });

  it('rewrites repo-relative module paths using the shared config ancestor', () => {
    const prompt = buildSiteDevToolsAiAnalysisPrompt(
      {
        artifactKind: 'page-build',
        artifactLabel: '/guide/how-it-works',
        content: 'page overview',
        context: {
          moduleItems: [
            {
              file: '/docs/assets/Landing.js',
              id: 'packages/vitepress/docs/en/rendering-strategy-comps/react/ReactComp1.tsx',
              label: 'ReactComp1.tsx',
              renderedSize: '2.1 KB',
              share: '20.0%',
              sourceInfo: 'Source 1.8 KB',
            },
          ],
          pageId: '/guide/how-it-works',
        },
        displayPath: '/guide/how-it-works',
        language: 'text',
      },
      {
        anchorPath:
          '/Users/chenjiaxiang/Project/docs-islands/packages/vitepress/docs/.vitepress/config.ts',
      },
    );

    expect(prompt).toContain(
      'module id: /en/rendering-strategy-comps/react/ReactComp1.tsx',
    );
    expect(prompt).not.toContain('packages/vitepress/docs/en/');
  });

  it('rewrites embedded repo-relative paths inside persisted report text', () => {
    const report = sanitizeSiteDevToolsAiBuildReport(
      {
        generatedAt: '2026-04-03T00:00:00.000Z',
        prompt:
          'Module Source:\\n- module id: packages/vitepress/docs/zh/rendering-strategy-comps/react/ReactComp1.tsx',
        provider: 'doubao',
        reportId: 'report-1',
        reportLabel: 'Doubao Pro',
        result:
          'Focus packages/vitepress/docs/zh/rendering-strategy-comps/react/ReactComp1.tsx first.',
        target: {
          artifactKind: 'page-build',
          artifactLabel: '/zh/guide/how-it-works',
          content: 'page overview',
          context: {
            moduleItems: [
              {
                file: '/docs/assets/ReactComp1.js',
                id: 'packages/vitepress/docs/zh/rendering-strategy-comps/react/ReactComp1.tsx',
                label: 'ReactComp1.tsx',
                renderedSize: '2.1 KB',
                share: '20.0%',
                sourceInfo: 'Source 1.8 KB',
              },
            ],
            pageId: '/zh/guide/how-it-works',
          },
          displayPath: '/zh/guide/how-it-works',
          language: 'text',
        },
      },
      {
        anchorPath:
          '/Users/chenjiaxiang/Project/docs-islands/packages/vitepress/docs/.vitepress/config.ts',
      },
    );

    expect(report.prompt).toContain(
      'module id: /zh/rendering-strategy-comps/react/ReactComp1.tsx',
    );
    expect(report.prompt).not.toContain('packages/vitepress/docs/zh/');
    expect(report.result).toContain(
      'Focus /zh/rendering-strategy-comps/react/ReactComp1.tsx first.',
    );
    expect(report.target.context?.moduleItems?.[0]?.id).toBe(
      '/zh/rendering-strategy-comps/react/ReactComp1.tsx',
    );
  });
});
