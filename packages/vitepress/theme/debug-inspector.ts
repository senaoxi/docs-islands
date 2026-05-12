import type { SiteDevToolsRenderMetric } from '@docs-islands/vitepress/internal/devtools';

export interface BundleAssetMetric {
  bytes: number;
  file: string;
  type: 'asset' | 'css' | 'js';
}

export interface BundleModuleMetric {
  bytes: number;
  file: string;
  id: string;
  sourceAssetFile?: string;
  sourcePath?: string;
}

export interface SiteDevToolsAiBuildReportReference {
  detail?: string;
  generatedAt: string;
  model?: string;
  prompt?: string;
  provider: 'claude' | 'doubao';
  providerLabel?: string;
  reportId: string;
  reportLabel: string;
  reportFile: string;
}

export interface ComponentBuildMetricAiReports {
  chunkReports?: Record<string, SiteDevToolsAiBuildReportReference[]>;
  moduleReports?: Record<string, SiteDevToolsAiBuildReportReference[]>;
}

export interface ComponentBuildMetric {
  aiReports?: ComponentBuildMetricAiReports;
  componentName: string;
  estimatedAssetBytes: number;
  estimatedCssBytes: number;
  estimatedJsBytes: number;
  estimatedTotalBytes: number;
  files: BundleAssetMetric[];
  modules: BundleModuleMetric[];
}

export interface PageBuildMetrics {
  aiReports?: SiteDevToolsAiBuildReportReference[];
  components: ComponentBuildMetric[];
  spaSyncEffects?: {
    components: {
      blockingCssBytes: number;
      blockingCssCount: number;
      blockingCssFiles: BundleAssetMetric[];
      componentName: string;
      embeddedHtmlPatches: {
        bytes: number;
        html: string;
        renderId: string;
      }[];
      embeddedHtmlBytes: number;
      renderDirectives: string[];
      renderIds: string[];
      requiresCssLoadingRuntime: boolean;
    }[];
    enabledComponentCount: number;
    enabledRenderCount: number;
    totalBlockingCssBytes: number;
    totalBlockingCssCount: number;
    totalEmbeddedHtmlBytes: number;
    usesCssLoadingRuntime: boolean;
  } | null;
  totalEstimatedComponentBytes: number;
}

export type SpaSyncComponentEffect = NonNullable<
  PageBuildMetrics['spaSyncEffects']
>['components'][number];

export interface PageMetafile {
  buildId?: string;
  buildMetrics?: PageBuildMetrics;
  cssBundlePaths: string[];
  loaderScript: string;
  modulePreloads: string[];
  pathname?: string;
  schemaVersion?: number;
  ssrInjectScript: string;
  [key: string]: unknown;
}

export type DebugWindow = Window & {
  __COMPONENT_MANAGER__?: {
    pageMetafile?: Record<string, PageMetafile>;
    [key: string]: unknown;
  };
  __INJECT_COMPONENT__?: Record<string, unknown>;
  __PAGE_METAFILE__?: Record<string, PageMetafile>;
  __VP_SITE_DATA__?: Record<string, unknown>;
};

export interface MetafileLookup {
  buildMetricByComponentName: Map<string, ComponentBuildMetric>;
  buildMetricByRenderId: Map<string, ComponentBuildMetric>;
  spaSyncEffectByComponentName: Map<string, SpaSyncComponentEffect>;
  spaSyncEffectByRenderId: Map<string, SpaSyncComponentEffect>;
}

const compareBuildMetricRichness = (
  left: ComponentBuildMetric,
  right: ComponentBuildMetric,
) => {
  const leftSourceModuleCount = left.modules.filter(
    (moduleMetric) => moduleMetric.sourceAssetFile || moduleMetric.sourcePath,
  ).length;
  const rightSourceModuleCount = right.modules.filter(
    (moduleMetric) => moduleMetric.sourceAssetFile || moduleMetric.sourcePath,
  ).length;

  if (leftSourceModuleCount !== rightSourceModuleCount) {
    return leftSourceModuleCount - rightSourceModuleCount;
  }

  if (left.modules.length !== right.modules.length) {
    return left.modules.length - right.modules.length;
  }

  if (left.files.length !== right.files.length) {
    return left.files.length - right.files.length;
  }

  return left.estimatedTotalBytes - right.estimatedTotalBytes;
};

const setPreferredBuildMetric = (
  metrics: Map<string, ComponentBuildMetric>,
  key: string,
  candidate: ComponentBuildMetric,
) => {
  const existing = metrics.get(key);

  if (!existing || compareBuildMetricRichness(candidate, existing) > 0) {
    metrics.set(key, candidate);
  }
};

export const getCurrentPageCandidates = (
  debugWindow: DebugWindow,
  currentPathname?: string,
): string[] => {
  const siteData = debugWindow.__VP_SITE_DATA__ as
    | {
        base?: string;
        cleanUrls?: boolean;
      }
    | undefined;
  const rawBase = typeof siteData?.base === 'string' ? siteData.base : '/';
  const base = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;
  const bareBase = base === '/' ? base : base.slice(0, -1);
  const cleanUrls = Boolean(siteData?.cleanUrls);
  const rawPathname =
    (typeof currentPathname === 'string' && currentPathname.length > 0
      ? currentPathname
      : debugWindow.location.pathname) || '/';

  let pathname = rawPathname;

  try {
    pathname = decodeURI(pathname);
  } catch {
    // Keep the raw pathname if decoding fails.
  }

  pathname = pathname.replace(/[#?].*$/, '');

  if (pathname === bareBase) {
    pathname = '/';
  } else if (pathname.startsWith(base)) {
    pathname = pathname.slice(base.length - 1);
  }

  if (!pathname.startsWith('/')) {
    pathname = `/${pathname}`;
  }

  pathname = pathname.replaceAll(/\/{2,}/g, '/');
  pathname = pathname.replace(/(^|\/)index(?:\.html)?$/, '$1');

  if (cleanUrls) {
    pathname = pathname.replace(/\.html$/, '');
  }

  const normalizedPathname = pathname || '/';
  const suffixCandidates = normalizedPathname
    .split('/')
    .filter(Boolean)
    .map((_, index, segments) => `/${segments.slice(index).join('/')}`);

  return [
    ...new Set([normalizedPathname, rawPathname, ...suffixCandidates, '/']),
  ];
};

export const resolvePageMetafileState = (
  debugWindow: DebugWindow,
  currentPathname?: string,
) => {
  const pageMetafile =
    debugWindow.__PAGE_METAFILE__ ||
    debugWindow.__COMPONENT_MANAGER__?.pageMetafile;
  const allPageMetafiles = pageMetafile ? Object.values(pageMetafile) : [];
  const currentPage = getCurrentPageCandidates(
    debugWindow,
    currentPathname,
  ).find((candidate) => Boolean(pageMetafile?.[candidate]));

  return {
    allPageMetafiles,
    currentPageMetafile: currentPage
      ? (pageMetafile?.[currentPage] ?? null)
      : null,
  };
};

export const createMetafileLookup = ({
  allPageMetafiles,
  currentPageMetafile,
}: {
  allPageMetafiles: PageMetafile[];
  currentPageMetafile: PageMetafile | null;
}): MetafileLookup => {
  const pageMetafiles = [currentPageMetafile, ...allPageMetafiles].filter(
    (pageMetafile, index, list): pageMetafile is PageMetafile =>
      Boolean(pageMetafile) && list.indexOf(pageMetafile) === index,
  );

  const buildMetricByComponentName = new Map<string, ComponentBuildMetric>();
  const buildMetricByRenderId = new Map<string, ComponentBuildMetric>();
  const spaSyncEffectByComponentName = new Map<
    string,
    SpaSyncComponentEffect
  >();
  const spaSyncEffectByRenderId = new Map<string, SpaSyncComponentEffect>();

  for (const pageMetafile of pageMetafiles) {
    for (const component of pageMetafile.buildMetrics?.components ?? []) {
      setPreferredBuildMetric(
        buildMetricByComponentName,
        component.componentName,
        component,
      );
    }

    for (const effect of pageMetafile.buildMetrics?.spaSyncEffects
      ?.components ?? []) {
      if (!spaSyncEffectByComponentName.has(effect.componentName)) {
        spaSyncEffectByComponentName.set(effect.componentName, effect);
      }

      const buildMetric = (pageMetafile.buildMetrics?.components ?? []).find(
        (component) => component.componentName === effect.componentName,
      );

      for (const renderId of effect.renderIds) {
        spaSyncEffectByRenderId.set(renderId, effect);
        if (buildMetric) {
          setPreferredBuildMetric(buildMetricByRenderId, renderId, buildMetric);
        }
      }
    }
  }

  return {
    buildMetricByComponentName,
    buildMetricByRenderId,
    spaSyncEffectByComponentName,
    spaSyncEffectByRenderId,
  };
};

export const getBuildMetricForRender = (
  lookup: MetafileLookup,
  componentName: string,
  renderId: string,
): ComponentBuildMetric | null =>
  lookup.buildMetricByRenderId.get(renderId) ??
  lookup.buildMetricByComponentName.get(componentName) ??
  null;

export const getSpaSyncEffectForRender = (
  lookup: MetafileLookup,
  componentName: string,
  renderId: string,
): SpaSyncComponentEffect | null =>
  lookup.spaSyncEffectByRenderId.get(renderId) ??
  lookup.spaSyncEffectByComponentName.get(componentName) ??
  null;

export const getMetricPageId = (
  debugWindow: DebugWindow,
  metric: SiteDevToolsRenderMetric,
): boolean => {
  if (!metric.pageId) {
    return true;
  }

  return getCurrentPageCandidates(debugWindow).includes(metric.pageId);
};
