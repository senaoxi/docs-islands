import { describe, expect, it } from 'vitest';
import { RenderController } from '../render-controller';

describe('RenderController', () => {
  it('tracks imported components by SSR-only and non-SSR-only usage', async () => {
    const controller = new RenderController();
    controller.setCompilationContainer('react', '/guide/page.md', {
      code: '',
      helperCode: '',
      importsByLocalName: new Map([
        ['Hero', { identifier: '/components/Hero.tsx', importedName: 'Hero' }],
        [
          'Badge',
          { identifier: '/components/Badge.tsx', importedName: 'Badge' },
        ],
      ]),
      ssrOnlyComponentNames: new Set(['Hero']),
    });

    const result =
      await controller.getComponentFullPathToPageIdAndImportedNameMap('react');

    expect(
      result.ssrOnlyComponentFullPathToPageIdAndImportedNameMap.get(
        '/components/Hero.tsx',
      ),
    ).toEqual(new Set(['/guide/page.md__SSR_ONLY_PLACEHOLDER__Hero']));
    expect(
      result.nonSSROnlyComponentFullPathToPageIdAndImportedNameMap.get(
        '/components/Badge.tsx',
      ),
    ).toEqual(new Set(['/guide/page.md__NON_SSR_ONLY_PLACEHOLDER__Badge']));
  });

  it('collects spa sync render payloads only for eligible render instances', () => {
    const controller = new RenderController();
    controller.setClientChunkByFacadeModuleId('react', '/guide/page.md', {
      code: 'export {};',
      outputPath: 'assets/page.js',
    });
    controller.setUsedSnippetContainer(
      'react',
      '/guide/page.md',
      new Map([
        [
          'a1b2c3d4',
          {
            props: new Map(),
            renderComponent: 'Hero',
            renderDirective: 'client:load',
            renderId: 'a1b2c3d4',
            ssrCssBundlePaths: new Set(['/assets/hero.css']),
            ssrHtml: '<div>Hero</div>',
            useSpaSyncRender: true,
          },
        ],
        [
          'skipme00',
          {
            props: new Map(),
            renderComponent: 'Badge',
            renderDirective: 'client:only',
            renderId: 'skipme00',
            ssrCssBundlePaths: new Set(['/assets/badge.css']),
            ssrHtml: '<div>Badge</div>',
            useSpaSyncRender: true,
          },
        ],
      ]),
    );

    const result = controller.getMarkdownModuleIdToSpaSyncRenderMap('react');
    const pageEntry = result.get('/guide/page.md');

    expect(pageEntry?.outputPath).toBe('assets/page.js');
    expect(pageEntry?.renderIdToSpaSyncRenderMap.has('a1b2c3d4')).toBe(true);
    expect(pageEntry?.renderIdToSpaSyncRenderMap.has('skipme00')).toBe(false);
  });

  it('keeps compilation and snippet containers isolated by framework on the same page', () => {
    const controller = new RenderController();

    controller.setCompilationContainer('react', '/guide/page.md', {
      code: 'const ReactHero = null;',
      helperCode: '',
      importsByLocalName: new Map([
        [
          'Hero',
          {
            identifier: '/components/react/Hero.tsx',
            importedName: 'Hero',
          },
        ],
      ]),
      ssrOnlyComponentNames: new Set(),
    });
    controller.setCompilationContainer('solid', '/guide/page.md', {
      code: 'const SolidHero = null;',
      helperCode: '',
      importsByLocalName: new Map([
        [
          'Hero',
          {
            identifier: '/components/solid/Hero.tsx',
            importedName: 'Hero',
          },
        ],
      ]),
      ssrOnlyComponentNames: new Set(['Hero']),
    });
    controller.setUsedSnippetContainer(
      'react',
      '/guide/page.md',
      new Map([
        [
          'react-1',
          {
            props: new Map(),
            renderComponent: 'Hero',
            renderDirective: 'client:load',
            renderId: 'react-1',
            useSpaSyncRender: false,
          },
        ],
      ]),
    );
    controller.setUsedSnippetContainer(
      'solid',
      '/guide/page.md',
      new Map([
        [
          'solid-1',
          {
            props: new Map(),
            renderComponent: 'Hero',
            renderDirective: 'ssr:only',
            renderId: 'solid-1',
            useSpaSyncRender: true,
          },
        ],
      ]),
    );

    expect(
      controller.getCompilationContainersByMarkdownModuleId('/guide/page.md')
        .size,
    ).toBe(2);
    expect(
      controller.getCompilationContainerByMarkdownModuleId(
        'react',
        '/guide/page.md',
      ),
    ).toMatchObject({
      code: 'const ReactHero = null;',
    });
    expect(
      controller.getCompilationContainerByMarkdownModuleId(
        'solid',
        '/guide/page.md',
      ),
    ).toMatchObject({
      code: 'const SolidHero = null;',
    });
    expect(
      controller.getUsedSnippetContainersByMarkdownModuleId('/guide/page.md')
        .size,
    ).toBe(2);
  });
});
