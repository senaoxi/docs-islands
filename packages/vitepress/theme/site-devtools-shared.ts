import type {
  SiteDevToolsHmrMetric,
  SiteDevToolsLevel,
  SiteDevToolsRenderMetric,
} from '@docs-islands/vitepress/internal/devtools';
import type {
  BundleAssetMetric,
  ComponentBuildMetric,
  DebugWindow,
  PageMetafile,
  SpaSyncComponentEffect,
} from './debug-inspector';
import type { SiteDevToolsRenderMetricWebVitalsAnalysis } from './site-devtools-web-vitals';

export interface SiteDevToolsEntry {
  details?: string;
  id: number;
  level: SiteDevToolsLevel;
  message: string;
  source: string;
  time: string;
}

export type SiteDevToolsAction =
  | 'clear'
  | 'copy'
  | 'copy-css'
  | 'copy-chunk'
  | 'copy-source'
  | 'disable'
  | 'globals'
  | 'inspect'
  | null;

export interface SiteDevToolsHelper {
  getEntries: () => SiteDevToolsEntry[];
  getGlobal: (path?: string) => unknown;
  getHmrMetrics: () => SiteDevToolsHmrMetric[];
  getRenderMetrics: () => SiteDevToolsRenderMetric[];
  logGlobal: (path?: string) => void;
  logRuntime: (reason?: string) => void;
  snapshotRuntime: () => Record<string, unknown>;
}

export interface RenderMetricView {
  buildMetric: ComponentBuildMetric | null;
  containerLabel: string;
  durationRatio: number;
  element: HTMLElement | null;
  hmrMetrics: SiteDevToolsHmrMetric[];
  isCurrentPage: boolean;
  isMounted: boolean;
  latestHmrMetric: SiteDevToolsHmrMetric | null;
  metric: SiteDevToolsRenderMetric;
  metricKey: string;
  sizeRatio: number;
  spaSyncEffect: SpaSyncComponentEffect | null;
  webVitalsAnalysis: SiteDevToolsRenderMetricWebVitalsAnalysis | null;
}

export interface RenderMetricOverlay {
  badgeStyle: Record<string, string>;
  frameStyle: Record<string, string>;
  key: string;
  panelStyle: Record<string, string>;
  view: RenderMetricView;
}

export interface HmrMetricView {
  isCurrentPage: boolean;
  metric: SiteDevToolsHmrMetric;
}

export type OverlayMetricDetailKind =
  | 'bundle'
  | 'css'
  | 'html'
  | 'total'
  | 'vitals';
export type PreviewState = 'idle' | 'loading' | 'ready' | 'error';
export type BundleResourceTypeFilter = 'asset' | 'css' | 'js' | 'total';

export type BundleChunkResourceItem = BundleAssetMetric & {
  moduleCount: number;
  percent: string;
  shortFile: string;
};

export interface SiteDevToolsLoadingProgress {
  detail: string;
  indeterminate: boolean;
  label: string;
  value: number;
}

export interface SiteDevToolsPreviewStatus {
  detail: string;
  label: string;
  tone: 'info' | 'muted' | 'warning';
}

export type BundleChunkDetail = Pick<
  BundleAssetMetric,
  'bytes' | 'file' | 'type'
> & {
  moduleCount: number;
};

export interface BundleSourceModuleSelection {
  file: string;
  id: string;
  isGeneratedVirtualModule?: boolean;
  sourceAssetFile?: string;
  sourcePath?: string;
}

export type BundleSourceModuleItem = BundleSourceModuleSelection & {
  bytes: number;
  canPreview: boolean;
  canBrowseSource: boolean;
  isGeneratedVirtualModule: boolean;
  percent: string;
  sizeDeltaLabel: string | null;
  sizeDeltaTone: 'is-positive' | 'is-negative' | 'is-neutral' | null;
  shortFile: string;
  sourceSizeLabel: string;
};

export interface GlobalPreset {
  description: string;
  label: string;
  path: string;
}

export type SiteDevToolsWindow = DebugWindow & {
  __DOCS_ISLANDS_REACT_HMR_METRICS__?: Record<string, SiteDevToolsHmrMetric>;
  __DOCS_ISLANDS_SITE_DEVTOOLS__?: SiteDevToolsHelper;
  __DOCS_ISLANDS_SITE_DEVTOOLS_LOGS__?: SiteDevToolsEntry[];
  __DOCS_ISLANDS_REACT_RENDER_METRICS__?: Record<
    string,
    SiteDevToolsRenderMetric
  >;
  React?: {
    version?: string;
    [key: string]: unknown;
  };
  ReactDOM?: {
    version?: string;
    [key: string]: unknown;
  };
};

export const SITE_DEVTOOLS_QUERY_KEY = 'site-devtools';
export const DEFAULT_GLOBAL_PATH = '__VP_SITE_DATA__';
export const ENABLE_HMR_DEBUG_UI =
  (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV === true;
export const MAX_DEBUG_ENTRIES = 200;
export const OVERLAY_PANEL_WIDTH = 336;
export const renderMetricContainerAttr = '__render_id__';
export const renderMetricComponentAttr = '__render_component__';
export const renderMetricDirectiveAttr = '__render_directive__';
export const renderMetricSpaSyncAttr = '__spa_sync_render__';

export const shouldEnableVsCodeSourceOpen = () =>
  !ENABLE_HMR_DEBUG_UI &&
  globalThis.window !== undefined &&
  globalThis.location.hostname === 'localhost';

export const GLOBAL_PRESETS: GlobalPreset[] = [
  {
    description:
      'Runtime component management state, including page metafile state held by the manager.',
    label: 'Component Manager',
    path: '__COMPONENT_MANAGER__',
  },
  {
    description:
      'The resolved build metadata for the current page, including component build metrics.',
    label: 'Page Metafile',
    path: '__PAGE_METAFILE__',
  },
  {
    description: 'The page-keyed injected component registry.',
    label: 'Inject Component',
    path: '__INJECT_COMPONENT__',
  },
  {
    description: 'The collected React render metrics on the current page.',
    label: 'Render Metrics',
    path: '__DOCS_ISLANDS_REACT_RENDER_METRICS__',
  },
  {
    description: 'React HMR timing metrics collected on the page.',
    label: 'HMR Metrics',
    path: '__DOCS_ISLANDS_REACT_HMR_METRICS__',
  },
  {
    description: 'VitePress runtime site data. Hidden in dev and MPA mode.',
    label: 'Site Data',
    path: '__VP_SITE_DATA__',
  },
];

export const formatDuration = (value?: number) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '—';
  }

  return `${value.toFixed(value >= 10 ? 1 : 2)} ms`;
};

export const createSiteDevToolsLoadingProgress = (
  label = 'Preparing preview',
): SiteDevToolsLoadingProgress => ({
  detail: '',
  indeterminate: false,
  label,
  value: 0,
});

export const formatBytes = (value?: number) => {
  if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) {
    return '—';
  }

  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(2)} MB`;
  }

  if (value >= 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${value} B`;
};

export const hasDisplayValue = (value: string | null | undefined) =>
  Boolean(value && value !== '—');

export const isGeneratedVirtualModuleId = (moduleId: string) =>
  moduleId.startsWith('\0') || moduleId.includes('?commonjs-');

const STYLE_SOURCE_SUFFIXES = [
  '.css',
  '.less',
  '.pcss',
  '.postcss',
  '.sass',
  '.scss',
  '.styl',
  '.stylus',
];

export const isStyleSourceModule = (sourcePath?: string, moduleId?: string) => {
  const normalizedPath = (sourcePath || moduleId || '').toLowerCase();

  return STYLE_SOURCE_SUFFIXES.some((suffix) =>
    normalizedPath.endsWith(suffix),
  );
};

export const shouldDisplayModuleSourceForResource = (
  resourceType: 'asset' | 'css' | 'js',
  sourcePath?: string,
  moduleId?: string,
) => {
  if (resourceType === 'css') {
    return isStyleSourceModule(sourcePath, moduleId);
  }

  return true;
};

export const getStatusLabel = (status: SiteDevToolsRenderMetric['status']) => {
  switch (status) {
    case 'waiting-visible': {
      return 'Waiting';
    }
    case 'subscribing': {
      return 'Loading';
    }
    case 'rendering': {
      return 'Rendering';
    }
    case 'completed': {
      return 'Completed';
    }
    case 'failed': {
      return 'Failed';
    }
    case 'skipped': {
      return 'Skipped';
    }
    default: {
      return 'Detected';
    }
  }
};

export const getStatusTone = (status: SiteDevToolsRenderMetric['status']) => {
  switch (status) {
    case 'completed': {
      return 'is-success';
    }
    case 'failed': {
      return 'is-danger';
    }
    case 'skipped': {
      return 'is-muted';
    }
    case 'waiting-visible':
    case 'subscribing':
    case 'rendering': {
      return 'is-active';
    }
    default: {
      return '';
    }
  }
};

export const getMetricRuntimeKind = (metric: SiteDevToolsRenderMetric) => {
  if (metric.source === 'react-dev-runtime') {
    return 'dev';
  }

  if (metric.source === 'react-render-strategy') {
    return 'prod';
  }

  return 'unknown';
};

export const getMetricRuntimeLabel = (metric: SiteDevToolsRenderMetric) => {
  switch (getMetricRuntimeKind(metric)) {
    case 'dev': {
      return 'dev runtime';
    }
    case 'prod': {
      return 'prod runtime';
    }
    default: {
      return 'runtime pending';
    }
  }
};

export const getResolvedRenderMode = (metric: SiteDevToolsRenderMetric) => {
  if (metric.renderMode) {
    return metric.renderMode;
  }

  if (metric.renderDirective === 'ssr:only') {
    return 'ssr-only';
  }

  if (
    metric.renderDirective === 'client:only' ||
    metric.hasSsrContent === false
  ) {
    return 'render';
  }

  if (metric.hasSsrContent) {
    return 'hydrate';
  }

  return 'pending';
};

export const getSecondaryMetricLabel = (metric: SiteDevToolsRenderMetric) =>
  getMetricRuntimeKind(metric) === 'prod' ? 'Subscribe' : 'Runtime';

export const formatSecondaryMetricValue = (metric: SiteDevToolsRenderMetric) =>
  getMetricRuntimeKind(metric) === 'prod'
    ? formatDuration(metric.subscribeDurationMs)
    : getMetricRuntimeLabel(metric);

export const shouldShowRenderBundleMetric = (
  metric: SiteDevToolsRenderMetric,
) => getMetricRuntimeKind(metric) !== 'dev';

export const shouldShowVisibleWaitMetric = (metric: SiteDevToolsRenderMetric) =>
  metric.renderDirective === 'client:visible' ||
  typeof metric.waitForVisibilityMs === 'number';

export const getHmrStatusTone = (status: SiteDevToolsHmrMetric['status']) => {
  switch (status) {
    case 'completed': {
      return 'is-success';
    }
    case 'failed': {
      return 'is-danger';
    }
    default: {
      return 'is-active';
    }
  }
};

export const getHmrStatusLabel = (status: SiteDevToolsHmrMetric['status']) => {
  switch (status) {
    case 'completed': {
      return 'Completed';
    }
    case 'failed': {
      return 'Failed';
    }
    default: {
      return 'Running';
    }
  }
};

export const getHmrUpdateTypeLabel = (
  updateType: SiteDevToolsHmrMetric['updateType'],
) =>
  updateType === 'ssr-only-component-update'
    ? 'ssr-only update'
    : updateType === 'react-refresh-update'
      ? 'react refresh update'
      : 'markdown update';

export const getHmrMechanismLabel = (
  mechanismType?: SiteDevToolsHmrMetric['mechanismType'],
) => {
  switch (mechanismType) {
    case 'react-fast-refresh': {
      return 'official react fast refresh';
    }
    case 'ssr-only-direct-hmr': {
      return 'ssr:only direct patch';
    }
    case 'markdown-react-hmr': {
      return 'markdown-driven react hmr';
    }
    default: {
      return 'hmr mechanism pending';
    }
  }
};

export const getHmrMechanismDescription = (metric: SiteDevToolsHmrMetric) => {
  if (metric.mechanismType === 'react-fast-refresh') {
    return 'Official React Fast Refresh reuses the Vite React plugin runtime and records the refresh cycle around fiber commits.';
  }

  if (metric.mechanismType === 'ssr-only-direct-hmr') {
    return 'Server re-renders ssr:only HTML and patches the container directly.';
  }

  if (metric.mechanismType === 'markdown-react-hmr') {
    return 'Markdown update replays React refresh with optional SSR patching for affected containers.';
  }

  return 'Awaiting HMR mechanism details.';
};

export const getHmrRuntimeStageLabel = (metric: SiteDevToolsHmrMetric) =>
  metric.mechanismType === 'react-fast-refresh'
    ? 'Refresh Ready'
    : 'Runtime Ready';

export const getHmrApplyStageLabel = (metric: SiteDevToolsHmrMetric) =>
  metric.mechanismType === 'react-fast-refresh'
    ? 'Refresh Apply'
    : 'Client Apply';

export const getVsCodeFileHref = (
  sourcePath?: string,
  line = 1,
  column = 1,
) => {
  if (!shouldEnableVsCodeSourceOpen() || !sourcePath) {
    return null;
  }

  return `vscode://file${encodeURI(sourcePath)}:${line}:${column}`;
};

export const getVsCodeSourceHref = (metric: SiteDevToolsHmrMetric) =>
  getVsCodeFileHref(
    metric.sourcePath,
    metric.sourceLine ?? 1,
    metric.sourceColumn ?? 1,
  );

export const inferSourceLanguage = (sourcePath?: string) => {
  const normalizedPath = sourcePath?.toLowerCase() || '';

  if (normalizedPath.endsWith('.tsx')) return 'tsx';
  if (normalizedPath.endsWith('.ts')) return 'ts';
  if (normalizedPath.endsWith('.jsx')) return 'jsx';
  if (
    normalizedPath.endsWith('.js') ||
    normalizedPath.endsWith('.mjs') ||
    normalizedPath.endsWith('.cjs')
  ) {
    return 'js';
  }
  if (normalizedPath.endsWith('.vue')) return 'vue';
  if (normalizedPath.endsWith('.css')) return 'css';
  if (normalizedPath.endsWith('.scss')) return 'scss';
  if (normalizedPath.endsWith('.html')) return 'html';
  if (normalizedPath.endsWith('.svg')) return 'xml';
  if (normalizedPath.endsWith('.json')) return 'json';
  if (normalizedPath.endsWith('.md')) return 'md';
  if (normalizedPath.endsWith('.yaml') || normalizedPath.endsWith('.yml')) {
    return 'yaml';
  }

  return 'text';
};

export const formatSourceLanguageLabel = (sourcePath?: string) => {
  const language = inferSourceLanguage(sourcePath);

  if (language === 'text') {
    return 'Plain Text';
  }

  return language.toUpperCase();
};

export interface SiteDevToolsMetafileRefs {
  allPageMetafiles: PageMetafile[];
  currentPageMetafile: PageMetafile | null;
}
