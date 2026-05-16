import { PAGE_METAFILE_META_NAMES } from '@docs-islands/core/shared/constants/page-metafile';
import { describe, expect, it } from 'vitest';
import { createRenderingModuleResolution } from '../../../core/module-resolution';
import {
  createPageMetafileReferenceTags,
  resolveSiteDevToolsBuildReportPageContext,
} from '../../../framework-build/page-metafile';

const TEST_LOGGER_SCOPE_ID = 'react-build-helper-test-scope';
const getTestLoggerScopeId = () => TEST_LOGGER_SCOPE_ID;

describe('framework-build page metafile references', () => {
  it('creates a preload tag plus page metafile meta tags', () => {
    expect(
      createPageMetafileReferenceTags({
        currentPagePublicPath:
          '/docs/assets/page-metafiles/pages/core-concepts.22222222.json',
        indexPublicPath: '/docs/assets/page-metafiles/manifest.11111111.json',
      }),
    ).toEqual([
      '<link rel="preload" href="/docs/assets/page-metafiles/manifest.11111111.json" as="fetch" type="application/json" crossorigin data-docs-islands-page-metafile-preload="index">',
      `<meta name="${PAGE_METAFILE_META_NAMES.index}" content="/docs/assets/page-metafiles/manifest.11111111.json">`,
      `<meta name="${PAGE_METAFILE_META_NAMES.current}" content="/docs/assets/page-metafiles/pages/core-concepts.22222222.json">`,
    ]);
  });

  it('always emits the shared index preload even when current page metafile is missing', () => {
    expect(
      createPageMetafileReferenceTags({
        indexPublicPath: '/docs/assets/page-metafiles/manifest.aaaaaaaa.json',
      }),
    ).toEqual([
      '<link rel="preload" href="/docs/assets/page-metafiles/manifest.aaaaaaaa.json" as="fetch" type="application/json" crossorigin data-docs-islands-page-metafile-preload="index">',
      `<meta name="${PAGE_METAFILE_META_NAMES.index}" content="/docs/assets/page-metafiles/manifest.aaaaaaaa.json">`,
    ]);
  });

  it('resolves rewritten root routes back to their source markdown files', () => {
    const pageResolver = createRenderingModuleResolution(
      getTestLoggerScopeId,
    ).createStaticResolver({
      srcDir: 'packages/vitepress/docs',
      site: {
        base: '/docs-islands/vitepress/',
        cleanUrls: true,
      },
      pages: ['en/core-concepts.md', 'zh/core-concepts.md'],
      rewrites: {
        inv: {
          'core-concepts.md': 'en/core-concepts.md',
        },
        map: {
          'en/core-concepts.md': 'core-concepts.md',
        },
      },
    } as any);

    expect(
      resolveSiteDevToolsBuildReportPageContext({
        cleanUrls: true,
        pageId: '/core-concepts',
        pageResolver,
        srcDir: 'packages/vitepress/docs',
      }),
    ).toEqual({
      filePath: expect.stringMatching(
        /packages\/vitepress\/docs\/en\/core-concepts\.md$/,
      ),
      routePath: '/core-concepts',
    });
  });
});
