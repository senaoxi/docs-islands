import { VITEPRESS_RESOLVER_LOG_GROUPS } from '#shared/constants/log-groups/resolver';
import {
  getPagePathByPathname,
  getPathnameByPagePath,
  stripBaseFromPathname,
} from '#shared/path';
import {
  createInlinePageRequest as createDocsInlinePageRequest,
  createDocsRuntimeModuleResolver,
  type DocsModuleResolution,
  type DocsRuntimeResolveContext,
  type DocsStaticRouteResolver,
  isInlinePageRequest as isDocsInlinePageRequest,
} from '@docs-islands/core/node/module-resolution';
import { getProjectRoot } from '@docs-islands/utils/path';
import { formatDebugMessage } from 'logaria/helper';
import { dirname, extname, isAbsolute, relative, resolve } from 'pathe';
import type { Plugin } from 'vite';
import { normalizePath } from 'vite';
import type { DefaultTheme, SiteConfig } from 'vitepress';
import { INLINE_PAGE_RESOLUTION_PLUGIN_NAME } from '../constants/core/plugin-names';
import { getVitePressGroupLogger } from '../logger';

export type RenderingViteResolveContext = DocsRuntimeResolveContext;

export type RenderingViteModuleResolver = ReturnType<
  typeof createDocsRuntimeModuleResolver
>;

export interface RenderingStaticPageResolver extends DocsStaticRouteResolver {
  updateConfig: (config: Partial<SiteConfig<DefaultTheme.Config>>) => void;
}

export interface RenderingModuleResolution extends DocsModuleResolution {
  createStaticResolver: (
    config: SiteConfig<DefaultTheme.Config>,
  ) => RenderingStaticPageResolver;
  createVitePlugin: () => Plugin;
}

class DefaultRenderingStaticPageResolver
  implements RenderingStaticPageResolver
{
  private readonly base: string;
  private readonly srcDir: string;
  private readonly cleanUrls: boolean;
  private readonly pages = new Set<string>();
  private rewrites: SiteConfig<DefaultTheme.Config>['rewrites'] = {
    map: {},
    inv: {},
  };

  public readonly cachedResolvedIds = new Map<string, string>();

  constructor(config: SiteConfig<DefaultTheme.Config>) {
    const root = normalizePath(resolve(getProjectRoot()));
    const srcDir = normalizePath(resolve(root, config.srcDir || '.'));
    const base = config.site.base
      ? config.site.base.replace(/([^/])$/, '$1/')
      : '/';

    this.srcDir = srcDir;
    this.base = base;
    this.cleanUrls = config.site.cleanUrls ?? false;

    if (config.pages) {
      for (const page of config.pages) {
        this.pages.add(page);
      }
    }

    if (config.rewrites) {
      this.rewrites = config.rewrites;
    }
  }

  resolveId(id: string, importer?: string): string | null {
    if (!isInlinePageRequest(id)) {
      return null;
    }

    const cacheKey = `${id}#${importer ?? ''}`;
    if (this.cachedResolvedIds.has(cacheKey)) {
      return this.cachedResolvedIds.get(cacheKey)!;
    }

    let cleanedId = cleanUrl(id);
    if (!cleanedId.endsWith('.md')) {
      cleanedId = stripBaseFromPathname(cleanedId, this.base);
    }

    if (!isAbsolute(cleanedId)) {
      cleanedId =
        cleanedId.startsWith('.') && importer
          ? resolve(dirname(importer), cleanedId)
          : resolve(this.srcDir, cleanedId);
    }

    const resolvedId = cleanedId.endsWith('.md')
      ? this.documentPathToPageUrl(cleanedId)
      : this.pageUrlToDocumentPath(cleanedId);

    if (resolvedId) {
      this.cachedResolvedIds.set(cacheKey, resolvedId);
    }

    return resolvedId;
  }

  resolvePagePathToDocumentModuleId(
    pagePath: string,
    importer?: string,
  ): string | null {
    return this.resolveId(createInlinePageRequest(pagePath), importer);
  }

  resolveDocumentModuleIdToPagePath(
    documentModuleId: string,
    importer?: string,
  ): string | null {
    return this.resolveId(createInlinePageRequest(documentModuleId), importer);
  }

  urlToDocumentPath(url: string): string {
    let relativePath = getPagePathByPathname(
      stripBaseFromPathname(cleanUrl(url), this.base),
      this.cleanUrls,
    );

    if (relativePath.startsWith('/')) {
      relativePath = relativePath.slice(1);
    }

    if (this.rewrites.inv[relativePath]) {
      relativePath = this.rewrites.inv[relativePath]!;
    }

    return resolve(this.srcDir, relativePath);
  }

  documentPathToPageUrl(filePath: string): string {
    const relativePath = normalizePath(relative(this.srcDir, filePath));
    const rewrittenPath = this.rewrites.map[relativePath];
    const finalPath = rewrittenPath || relativePath;
    const url = getPathnameByPagePath(finalPath, this.cleanUrls);

    return this.base === '/' ? url : this.base.slice(0, -1) + url;
  }

  updateConfig(config: Partial<SiteConfig<DefaultTheme.Config>>): void {
    this.cachedResolvedIds.clear();

    if (config.pages) {
      this.pages.clear();
      for (const page of config.pages) {
        this.pages.add(page);
      }
    }

    if (config.rewrites) {
      this.rewrites = config.rewrites;
    }
  }

  normalizePath(path: string): string {
    return decodeURIComponent(path)
      .replace(/[#?].*$/, '')
      .replace(/(^|\/)index(?:\.html)?$/, '$1');
  }

  private pageUrlToDocumentPath(url: string): string | null {
    try {
      const filePath = this.urlToDocumentPath(url);
      return this.resolveMarkdownFile(filePath);
    } catch {
      return null;
    }
  }

  private resolveMarkdownFile(filePath: string): string | null {
    const normalizedPath = normalizePath(filePath);
    const relativePath = relative(this.srcDir, normalizedPath);

    if (this.pages.has(relativePath)) {
      return normalizedPath;
    }

    return null;
  }
}

const cleanUrl = (url: string): string =>
  url.replace(/#.*$/s, '').replace(/\?.*$/s, '');

const supportsInlinePageResolution = (id: string): boolean => {
  const extension = extname(cleanUrl(id));
  return extension === '.md' || extension === '' || extension === '.html';
};

const isInlinePageRequest: RenderingModuleResolution['isInlinePageRequest'] =
  isDocsInlinePageRequest;
const createInlinePageRequest: RenderingModuleResolution['createInlinePageRequest'] =
  createDocsInlinePageRequest;

function createRenderingStaticPageResolver(
  config: SiteConfig<DefaultTheme.Config>,
): RenderingStaticPageResolver {
  return new DefaultRenderingStaticPageResolver(config);
}

function createRenderingViteModuleResolver(
  context: RenderingViteResolveContext,
): RenderingViteModuleResolver {
  return createDocsRuntimeModuleResolver(context);
}

function createRenderingModuleResolutionVitePlugin(
  getstring: () => string,
): Plugin {
  let resolver: RenderingStaticPageResolver | null = null;

  return {
    name: INLINE_PAGE_RESOLUTION_PLUGIN_NAME,
    enforce: 'post',
    configResolved(config) {
      const vitepressConfig = config.vitepress;

      if (vitepressConfig) {
        resolver = createRenderingStaticPageResolver(vitepressConfig);
      }
    },
    resolveId: {
      order: 'pre',
      handler(id, importer) {
        if (!resolver || !supportsInlinePageResolution(id)) {
          return null;
        }

        const resolvedId = resolver.resolveId(id, importer);

        if (resolvedId) {
          getVitePressGroupLogger(
            VITEPRESS_RESOLVER_LOG_GROUPS.inlinePage,
            getstring(),
          ).debug(
            formatDebugMessage({
              context: 'inline page module resolution',
              decision:
                'map inline page request to a concrete VitePress page module',
              summary: {
                requestId: id.replace(/[&?]+__INLINE_PATH_RESOLVER__/, ''),
                resolvedId,
              },
              timingMs: 0,
            }),
          );
        }

        return resolvedId;
      },
    },
    async handleHotUpdate({ server }) {
      if (!resolver) {
        return;
      }

      const vitepressConfig = server.config.vitepress;
      if (vitepressConfig) {
        resolver.updateConfig(vitepressConfig);
      }
    },
  };
}

export function createRenderingModuleResolution(
  getstring: () => string,
): RenderingModuleResolution {
  return {
    createInlinePageRequest,
    isInlinePageRequest,
    createRuntimeResolver: createRenderingViteModuleResolver,
    createStaticResolver: createRenderingStaticPageResolver,
    createVitePlugin: () =>
      createRenderingModuleResolutionVitePlugin(getstring),
  };
}
