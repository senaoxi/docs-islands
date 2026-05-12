import type { RenderDirective } from './render';

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

export interface RuntimeBundleMetric {
  entryFile: string;
  files: BundleAssetMetric[];
  totalBytes: number;
}

export interface BuildReportReferenceBase {
  detail?: string;
  generatedAt: string;
  model?: string;
  prompt?: string;
  provider: string;
  providerLabel?: string;
  reportId: string;
  reportLabel: string;
  reportFile: string;
}

export interface ComponentBuildMetricAiReportsBase<
  TReference extends BuildReportReferenceBase = BuildReportReferenceBase,
> {
  chunkReports?: Record<string, TReference[]>;
  moduleReports?: Record<string, TReference[]>;
}

export interface ComponentBuildMetricBase<TAiReports = unknown> {
  aiReports?: TAiReports;
  componentName: string;
  entryFile: string;
  estimatedAssetBytes: number;
  estimatedCssBytes: number;
  estimatedJsBytes: number;
  estimatedTotalBytes: number;
  files: BundleAssetMetric[];
  framework: string;
  modules: BundleModuleMetric[];
  renderDirectives: RenderDirective[];
  sourcePath: string;
}

export interface SpaSyncComponentSideEffectMetric {
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
  renderDirectives: RenderDirective[];
  renderIds: string[];
  requiresCssLoadingRuntime: boolean;
}

export interface SpaSyncPageBuildEffects {
  components: SpaSyncComponentSideEffectMetric[];
  enabledComponentCount: number;
  enabledRenderCount: number;
  pageClientChunkFile?: string;
  totalBlockingCssBytes: number;
  totalBlockingCssCount: number;
  totalEmbeddedHtmlBytes: number;
  usesCssLoadingRuntime: boolean;
}

export interface PageBuildRenderInstanceMetric {
  blockingCssBytes: number;
  blockingCssCount: number;
  blockingCssFiles: BundleAssetMetric[];
  componentName: string;
  embeddedHtmlBytes: number;
  renderDirective: RenderDirective;
  renderId: string;
  sequence: number;
  sourcePath?: string;
  useSpaSyncRender: boolean;
  usesCssLoadingRuntime: boolean;
}

export interface PageBuildMetricsBase<
  TComponentBuildMetric extends
    ComponentBuildMetricBase = ComponentBuildMetricBase,
  TAiReports = unknown,
> {
  aiReports?: TAiReports;
  components: TComponentBuildMetric[];
  framework: string;
  loader: RuntimeBundleMetric | null;
  renderInstances?: PageBuildRenderInstanceMetric[];
  spaSyncEffects: SpaSyncPageBuildEffects | null;
  ssrInject: RuntimeBundleMetric | null;
  totalEstimatedComponentBytes: number;
}

export interface PageMetafile<TBuildMetrics = unknown> {
  buildId?: string;
  buildMetrics?: TBuildMetrics;
  loaderScript: string;
  modulePreloads: string[];
  pathname?: string;
  cssBundlePaths: string[];
  schemaVersion?: number;
  ssrInjectScript: string;
}

export interface PageMetafileManifestEntry {
  file: string;
  loaderScript: string;
  ssrInjectScript: string;
}

export interface PageMetafileManifest {
  buildId: string;
  pages: Record<string, PageMetafileManifestEntry>;
  schemaVersion: number;
}
