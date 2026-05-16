import { describe, expect, it } from 'vitest';
import {
  getHtmlOutputPathByPathname,
  getPagePathByPathname,
  getPathnameByMarkdownModuleId,
  getPathnameByPagePath,
  normalizeRoutePathname,
  stripBaseFromPathname,
} from '../path';

describe('Shared Path Helpers', () => {
  describe('stripBaseFromPathname', () => {
    it('should strip a matching base and preserve the leading slash', () => {
      expect(stripBaseFromPathname('/docs/guide/start', '/docs/')).toBe(
        '/guide/start',
      );
    });

    it('should treat the bare base path as root', () => {
      expect(stripBaseFromPathname('/docs', '/docs/')).toBe('/');
    });
  });

  describe('normalizeRoutePathname', () => {
    it('should normalize index.html to directory routes', () => {
      expect(normalizeRoutePathname('/guide/index.html', false)).toBe(
        '/guide/',
      );
    });

    it('should strip html extensions when clean urls are enabled', () => {
      expect(normalizeRoutePathname('/guide/getting-started.html', true)).toBe(
        '/guide/getting-started',
      );
    });

    it('should preserve html extensions when clean urls are disabled', () => {
      expect(normalizeRoutePathname('/guide/getting-started.html', false)).toBe(
        '/guide/getting-started.html',
      );
    });
  });

  describe('getPathnameByPagePath', () => {
    it('should generate clean url keys for index pages', () => {
      expect(getPathnameByPagePath('guide/index.md', true)).toBe('/guide/');
    });

    it('should generate html keys when clean urls are disabled', () => {
      expect(getPathnameByPagePath('guide/getting-started.md', false)).toBe(
        '/guide/getting-started.html',
      );
    });
  });

  describe('getPagePathByPathname', () => {
    it('should map clean url pathnames back to markdown files', () => {
      expect(getPagePathByPathname('/guide/getting-started', true)).toBe(
        '/guide/getting-started.md',
      );
    });

    it('should tolerate html pathnames when clean urls are enabled', () => {
      expect(getPagePathByPathname('/guide/getting-started.html', true)).toBe(
        '/guide/getting-started.md',
      );
    });

    it('should map directory routes back to index.md', () => {
      expect(getPagePathByPathname('/guide/', true)).toBe('/guide/index.md');
    });

    it('should map root back to index.md', () => {
      expect(getPagePathByPathname('/', false)).toBe('/index.md');
    });
  });

  describe('getHtmlOutputPathByPathname', () => {
    it('should map the root pathname to index.html', () => {
      expect(getHtmlOutputPathByPathname('/', true)).toBe('index.html');
    });

    it('should map clean-url pathnames to html output files', () => {
      expect(getHtmlOutputPathByPathname('/guide/getting-started', true)).toBe(
        'guide/getting-started.html',
      );
    });

    it('should map directory pathnames to nested index.html files', () => {
      expect(getHtmlOutputPathByPathname('/zh/', true)).toBe('zh/index.html');
    });

    it('should preserve html output pathnames when clean urls are disabled', () => {
      expect(
        getHtmlOutputPathByPathname('/guide/getting-started.html', false),
      ).toBe('guide/getting-started.html');
    });
  });

  describe('getPathnameByMarkdownModuleId', () => {
    it('should include the site base after normalization', () => {
      expect(
        getPathnameByMarkdownModuleId('/repo/docs/guide/index.md', {
          root: '/repo',
          outDir: '/repo/.vitepress/dist',
          base: '/docs/',
          srcDir: '/repo/docs',
          assetsDir: 'assets',
          mpa: false,
          publicDir: '/repo/docs/public',
          cacheDir: '/repo/.vitepress/cache',
          cleanUrls: false,
          siteDevtools: {},
          wrapBaseUrl: (path: string) => path,
        }),
      ).toBe('/docs/guide/');
    });
  });
});
