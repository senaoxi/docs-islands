import { describe, expect, it } from 'vitest';
import {
  getHtmlOutputPathByPathname,
  getPagePathByPathname,
  getPathnameByDocumentModuleId,
  getPathnameByPagePath,
  normalizeRoutePathname,
  stripBaseFromPathname,
} from '../path';

describe('core shared path helpers', () => {
  it('strips the configured base while preserving the leading slash', () => {
    expect(stripBaseFromPathname('/docs/guide/start', '/docs/')).toBe(
      '/guide/start',
    );
  });

  it('normalizes index.html routes to directories', () => {
    expect(normalizeRoutePathname('/guide/index.html', false)).toBe('/guide/');
  });

  it('maps page paths to public pathnames', () => {
    expect(getPathnameByPagePath('guide/getting-started.md', false)).toBe(
      '/guide/getting-started.html',
    );
  });

  it('maps clean-url pathnames back to markdown files', () => {
    expect(getPagePathByPathname('/guide/getting-started', true)).toBe(
      '/guide/getting-started.md',
    );
  });

  it('maps pathnames to html output files', () => {
    expect(getHtmlOutputPathByPathname('/guide/getting-started', true)).toBe(
      'guide/getting-started.html',
    );
  });

  it('derives a route pathname from an absolute document module id', () => {
    expect(
      getPathnameByDocumentModuleId('/repo/docs/guide/index.md', {
        base: '/docs/',
        cleanUrls: false,
        sourceDir: '/repo/docs',
      }),
    ).toBe('/docs/guide/');
  });
});
