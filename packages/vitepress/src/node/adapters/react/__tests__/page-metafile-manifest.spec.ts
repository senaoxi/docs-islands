import { describe, expect, it } from 'vitest';
import {
  createPageMetafileArtifacts,
  getPageMetafileRouteStem,
  PAGE_METAFILE_SCHEMA_VERSION,
} from '../../../framework-build/page-metafile';

describe('page metafile manifest helpers', () => {
  it('creates route stems that align with route output semantics', () => {
    expect(getPageMetafileRouteStem('/')).toBe('index');
    expect(getPageMetafileRouteStem('/guide/how-it-works')).toBe(
      'guide/how-it-works',
    );
    expect(getPageMetafileRouteStem('/zh/')).toBe('zh/index');
    expect(getPageMetafileRouteStem('/guide/getting-started.html')).toBe(
      'guide/getting-started',
    );
    expect(getPageMetafileRouteStem('/中文/示例')).toBe(
      '%E4%B8%AD%E6%96%87/%E7%A4%BA%E4%BE%8B',
    );
  });

  it('emits a hashed manifest plus hashed per-page metafiles', () => {
    const artifacts = createPageMetafileArtifacts({
      assetsDir: 'assets',
      pageMetafiles: {
        '/': {
          cssBundlePaths: [],
          loaderScript: '/docs/assets/unified-loader.root.js',
          modulePreloads: ['/docs/assets/root.module.js'],
          ssrInjectScript: '',
        },
        '/guide/how-it-works': {
          buildMetrics: {
            components: [],
            framework: 'react',
            loader: null,
            spaSyncEffects: null,
            ssrInject: null,
            totalEstimatedComponentBytes: 0,
          },
          cssBundlePaths: ['/docs/assets/core.css'],
          loaderScript: '/docs/assets/unified-loader.core.js',
          modulePreloads: ['/docs/assets/core.module.js'],
          ssrInjectScript: '/docs/assets/ssr.core.js',
        },
      },
      wrapBaseUrl: (value) => `/docs${value}`,
    });

    expect(artifacts.buildId).toMatch(/^[\da-f]{8}$/);
    expect(artifacts.manifest.filePath).toMatch(
      /^page-metafiles\/manifest\.[\da-f]{8}\.json$/,
    );
    expect(artifacts.manifest.publicPath).toMatch(
      /^\/docs\/assets\/page-metafiles\/manifest\.[\da-f]{8}\.json$/,
    );
    expect(artifacts.pages).toHaveLength(2);
    expect(artifacts.pages.map((page) => page.pathname)).toEqual([
      '/',
      '/guide/how-it-works',
    ]);
    expect(artifacts.pages[0]?.filePath).toMatch(
      /^page-metafiles\/pages\/index\.[\da-f]{8}\.json$/,
    );
    expect(artifacts.pages[1]?.filePath).toMatch(
      /^page-metafiles\/pages\/guide\/how-it-works\.[\da-f]{8}\.json$/,
    );

    const indexPayload = artifacts.manifest.payload;
    expect(indexPayload.schemaVersion).toBe(PAGE_METAFILE_SCHEMA_VERSION);
    expect(indexPayload.buildId).toBe(artifacts.buildId);
    expect(indexPayload.pages['/guide/how-it-works']).toMatchObject({
      file: artifacts.pages[1]?.publicPath,
      loaderScript: '/docs/assets/unified-loader.core.js',
      ssrInjectScript: '/docs/assets/ssr.core.js',
    });

    const pagePayload = JSON.parse(artifacts.pages[1]?.content || '{}');
    expect(pagePayload).toMatchObject({
      buildId: artifacts.buildId,
      pathname: '/guide/how-it-works',
      schemaVersion: PAGE_METAFILE_SCHEMA_VERSION,
    });
  });
});
