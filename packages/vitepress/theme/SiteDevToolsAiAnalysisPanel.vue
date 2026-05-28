<script setup lang="ts">
import MarkdownIt from 'markdown-it';
import { computed, ref, watch } from 'vue';
import type {
  SiteDevToolsAiAnalysisTarget,
  SiteDevToolsAiAnalysisTargetKind,
  SiteDevToolsAiAnalyzeResponse,
  SiteDevToolsAiBuildReport,
  SiteDevToolsAiCapabilitiesResponse,
  SiteDevToolsAiProvider,
} from '../src/shared/site-devtools-ai';
import {
  getSiteDevToolsAiArtifactKindLabel,
  getSiteDevToolsAiProviderLabel,
} from '../src/shared/site-devtools-ai';
import SiteDevToolsLoadingState from './SiteDevToolsLoadingState.vue';
import type { SiteDevToolsAiBuildReportReference } from './debug-inspector';
import { resolveSiteDevToolsAiCopyPrompt } from './site-devtools-ai-copy-prompt';
import {
  createSiteDevToolsLoadingProgress,
  type PreviewState,
  type SiteDevToolsLoadingProgress,
} from './site-devtools-shared';

const props = defineProps<{
  analysisTarget: SiteDevToolsAiAnalysisTarget | null;
  buildReports: SiteDevToolsAiBuildReportReference[];
  endpoint: string | null;
}>();

const PROVIDERS: SiteDevToolsAiProvider[] = ['doubao', 'claude'];
type AnalysisViewMode = 'rendered' | 'raw';

interface AnalysisSection {
  body: string;
  html: string;
  id: string;
  title: string;
}

type AnalysisSectionKind =
  | 'contents'
  | 'optimizations'
  | 'other'
  | 'risks'
  | 'summary'
  | 'unknowns';

interface AnalysisMetricTile {
  detail?: string;
  label: string;
  tone?: 'brand' | 'neutral' | 'success' | 'warning';
  value: string;
}

type CapabilitiesPayload =
  | SiteDevToolsAiCapabilitiesResponse
  | { error?: string };

const markdownRenderer = new MarkdownIt({
  breaks: false,
  html: false,
  linkify: true,
  typographer: false,
});
const defaultLinkRenderer =
  markdownRenderer.renderer.rules.link_open ??
  ((tokens, index, options, _env, self) =>
    self.renderToken(tokens, index, options));

markdownRenderer.renderer.rules.link_open = (
  tokens,
  index,
  options,
  env,
  self,
) => {
  const token = tokens[index];
  const targetIndex = token.attrIndex('target');
  const relIndex = token.attrIndex('rel');

  if (targetIndex === -1) {
    token.attrPush(['target', '_blank']);
  } else if (token.attrs?.[targetIndex]) {
    token.attrs[targetIndex][1] = '_blank';
  }

  if (relIndex === -1) {
    token.attrPush(['rel', 'noreferrer noopener']);
  } else if (token.attrs?.[relIndex]) {
    token.attrs[relIndex][1] = 'noreferrer noopener';
  }

  return defaultLinkRenderer(tokens, index, options, env, self);
};

const normalizeAnalysisBody = (value: string) =>
  value
    .replace(/^\s*---+\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const createAnalysisSections = (value: string): AnalysisSection[] => {
  const normalizedValue = value.replace(/\r\n?/g, '\n').trim();

  if (!normalizedValue) {
    return [];
  }

  const lines = normalizedValue.split('\n');
  const sections: { bodyLines: string[]; title: string }[] = [];
  const introLines: string[] = [];
  let currentSection: { bodyLines: string[]; title: string } | null = null;

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,3})\s+(.+?)\s*$/);

    if (headingMatch) {
      if (currentSection) {
        sections.push(currentSection);
      }

      currentSection = {
        bodyLines: [],
        title: headingMatch[2].trim(),
      };
      continue;
    }

    if (currentSection) {
      currentSection.bodyLines.push(line);
      continue;
    }

    introLines.push(line);
  }

  if (currentSection) {
    sections.push(currentSection);
  }

  if (sections.length === 0) {
    const body = normalizeAnalysisBody(normalizedValue);

    return body
      ? [
          {
            body,
            html: markdownRenderer.render(body),
            id: 'analysis',
            title: 'Analysis',
          },
        ]
      : [];
  }

  if (introLines.some((line) => line.trim())) {
    sections.unshift({
      bodyLines: introLines,
      title: 'Overview',
    });
  }

  return sections
    .map((section, index) => {
      const body = normalizeAnalysisBody(section.bodyLines.join('\n'));

      if (!body) {
        return null;
      }

      const sectionId = section.title
        .toLowerCase()
        .replace(/[^\w]+/g, '-')
        .replace(/^-+|-+$/g, '');

      return {
        body,
        html: markdownRenderer.render(body),
        id: sectionId || `section-${index + 1}`,
        title: section.title,
      };
    })
    .filter((section): section is AnalysisSection => Boolean(section));
};

const formatArtifactKindLabel = (
  artifactKind: SiteDevToolsAiAnalysisTargetKind | null | undefined,
) => (artifactKind ? getSiteDevToolsAiArtifactKindLabel(artifactKind) : '');

const formatArtifactKindDescription = (
  artifactKind: SiteDevToolsAiAnalysisTargetKind | null | undefined,
) => {
  switch (artifactKind) {
    case 'bundle-chunk': {
      return 'chunk resource';
    }
    case 'bundle-module': {
      return 'module source';
    }
    case 'page-build': {
      return 'page build';
    }
    default: {
      return 'artifact';
    }
  }
};

const parseFormattedByteSize = (value?: string | null): number | null => {
  if (!value) {
    return null;
  }

  const match = value.trim().match(/^([\d.]+)\s*(B|KB|MB)$/i);

  if (!match) {
    return null;
  }

  const numericValue = Number.parseFloat(match[1]);

  if (!Number.isFinite(numericValue)) {
    return null;
  }

  const unit = match[2].toUpperCase();

  switch (unit) {
    case 'MB': {
      return numericValue * 1024 * 1024;
    }
    case 'KB': {
      return numericValue * 1024;
    }
    case 'B': {
      return numericValue;
    }
    default: {
      return null;
    }
  }
};

const getAnalysisSectionKind = (title: string): AnalysisSectionKind => {
  const normalizedTitle = title.trim().toLowerCase();

  if (normalizedTitle === 'summary') {
    return 'summary';
  }

  if (normalizedTitle.includes('potential problems')) {
    return 'risks';
  }

  if (normalizedTitle.includes('optimization ideas')) {
    return 'optimizations';
  }

  if (normalizedTitle.includes('what this artifact contains')) {
    return 'contents';
  }

  if (normalizedTitle === 'unknowns') {
    return 'unknowns';
  }

  return 'other';
};

const stripMarkdownFormatting = (value: string) =>
  value
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`>#-]/g, ' ')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();

const parseFormattedPercent = (value?: string | null): number | null => {
  if (!value) {
    return null;
  }

  const match = value.trim().match(/^([\d.]+)\s*%$/);

  if (!match) {
    return null;
  }

  const numericValue = Number.parseFloat(match[1]);
  return Number.isFinite(numericValue) ? numericValue : null;
};

const parseDeltaPercent = (value?: string | null): number | null => {
  if (!value) {
    return null;
  }

  const match = value.match(/([+-]?[\d.]+)\s*%/);

  if (!match) {
    return null;
  }

  const numericValue = Number.parseFloat(match[1]);
  return Number.isFinite(numericValue) ? numericValue : null;
};

const joinMetricDetailParts = (...values: Array<string | null | undefined>) => {
  const parts = values.filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );

  return parts.length > 0 ? parts.join(' · ') : undefined;
};

interface FocusMetricSignal {
  detail?: string;
  tone?: AnalysisMetricTile['tone'];
  value: string;
}

const deriveFocusMetricSignal = ({
  analysisText,
  chunkResources,
  largestAsset,
  largestChunk,
  moduleItems,
  totalSize,
}: {
  analysisText: string;
  chunkResources: Array<{
    label: string;
    share: string | null;
    size: string;
    type: string;
  }>;
  largestAsset: {
    label: string;
    share: string | null;
    size: string;
  } | null;
  largestChunk: {
    label: string;
    share: string | null;
    size: string;
  } | null;
  moduleItems: Array<{
    sizeDelta?: string | null;
  }>;
  totalSize?: string;
}): FocusMetricSignal => {
  const isLowSeverity =
    /(mostly normal|extremely lightweight|low-severity|low severity|well-balanced|looks normal|balanced overall|no major performance red flags)/.test(
      analysisText,
    );
  const fragmentationSignal =
    /((many|several)\s+small\s+chunks?|fragment|per-chunk overhead|round trips|request count|merge\/inline small chunks|consolidate.*chunks?)/.test(
      analysisText,
    );
  const assetSignal =
    /(largest single asset|asset|svg|image|compress|compression|asset-heavy|asset heavy)/.test(
      analysisText,
    );
  const duplicationSignal = /(duplicate|duplication|dedupe)/.test(analysisText);
  const transformSignal =
    /(wrapper code|hydration wrapper|bundler overhead|transform overhead|size delta|\bdelta\b)/.test(
      analysisText,
    );
  const tinyNonAssetCount = chunkResources.filter((item) => {
    if (item.type === 'asset') {
      return false;
    }

    const itemBytes = parseFormattedByteSize(item.size);
    return itemBytes !== null && itemBytes <= 1024;
  }).length;
  const highDeltaModuleCount = moduleItems.filter((item) => {
    const deltaPercent = parseDeltaPercent(item.sizeDelta);
    return deltaPercent !== null && deltaPercent >= 40;
  }).length;
  const totalBytes = parseFormattedByteSize(totalSize);
  const largestAssetShare = parseFormattedPercent(largestAsset?.share);
  const largestChunkShare = parseFormattedPercent(largestChunk?.share);

  if (
    fragmentationSignal ||
    (chunkResources.length >= 8 &&
      tinyNonAssetCount >= 3 &&
      totalBytes !== null &&
      totalBytes <= 32 * 1024)
  ) {
    return {
      detail: `${chunkResources.length} chunks · ${tinyNonAssetCount} sub-1 KB JS/CSS files`,
      tone: isLowSeverity ? 'brand' : 'warning',
      value: isLowSeverity
        ? 'Low Risk: Many small chunks'
        : 'Watch chunk fragmentation',
    };
  }

  if (assetSignal || (largestAssetShare ?? 0) >= 25) {
    return {
      detail: joinMetricDetailParts(
        largestAsset?.label,
        largestAsset?.share || undefined,
        largestAsset?.size,
      ),
      tone: isLowSeverity ? 'brand' : 'warning',
      value: isLowSeverity
        ? 'Low Risk: Asset-heavy page'
        : 'Watch asset-heavy payload',
    };
  }

  if ((largestChunkShare ?? 0) >= 30) {
    return {
      detail: joinMetricDetailParts(
        largestChunk?.label,
        largestChunk?.share || undefined,
        largestChunk?.size,
      ),
      tone: 'warning',
      value: 'Watch single-chunk concentration',
    };
  }

  if (transformSignal || highDeltaModuleCount >= 3) {
    return {
      detail:
        highDeltaModuleCount > 0
          ? `${highDeltaModuleCount} modules above +40% rendered delta`
          : 'Report mentions transform or hydration overhead',
      tone: isLowSeverity ? 'brand' : 'warning',
      value: isLowSeverity
        ? 'Low Risk: Transform overhead'
        : 'Watch transform overhead',
    };
  }

  if (duplicationSignal) {
    return {
      detail: 'Report mentions duplicate module or asset entries',
      tone: 'warning',
      value: 'Check duplicate payload',
    };
  }

  return {
    detail: joinMetricDetailParts(
      totalSize,
      largestChunk?.share ? `max chunk ${largestChunk.share}` : undefined,
    ),
    tone: 'success',
    value: 'Looks balanced overall',
  };
};

const selectedProvider = ref<SiteDevToolsAiProvider>('doubao');
const capabilities = ref<
  SiteDevToolsAiCapabilitiesResponse['providers'] | null
>(null);
const capabilitiesState = ref<'idle' | 'loading' | 'ready' | 'error'>('idle');
const capabilitiesError = ref('');
const selectedBuildReportKey = ref('');
const analysisState = ref<PreviewState>('idle');
const analysisResult = ref('');
const analysisError = ref('');
const analysisDetail = ref('');
const analysisModel = ref('');
const analysisGeneratedAt = ref('');
const analysisProvider = ref<SiteDevToolsAiProvider | null>(null);
const analysisSource = ref<'build-report' | 'live-analysis' | null>(null);
const analysisResolvedTarget = ref<SiteDevToolsAiAnalysisTarget | null>(null);
const selectedAnalysisView = ref<AnalysisViewMode>('rendered');
const lastLoadedBuildReportFile = ref('');
const isRunningLiveAnalysis = ref(false);
const buildReportPromptByFile = ref<Record<string, string>>({});
const analysisLoadingProgress = ref<SiteDevToolsLoadingProgress>(
  createSiteDevToolsLoadingProgress('Waiting for analysis'),
);
const lastAction = ref<'copy-prompt' | 'copy-result' | null>(null);
const lastActionLabel = ref('');
let analysisRequestToken = 0;

const currentCapability = computed(
  () => capabilities.value?.[selectedProvider.value] ?? null,
);
const selectedProviderLabel = computed(() =>
  getSiteDevToolsAiProviderLabel(selectedProvider.value),
);
const getProviderCapability = (provider: SiteDevToolsAiProvider) =>
  capabilities.value?.[provider] ?? null;
const isProviderUnavailable = (provider: SiteDevToolsAiProvider) =>
  getProviderCapability(provider)?.available === false;
const formatProviderAvailability = (provider: SiteDevToolsAiProvider) => {
  const providerCapability = getProviderCapability(provider);

  return providerCapability?.available
    ? providerCapability.model || 'Available'
    : 'Unavailable';
};
const selectProvider = (provider: SiteDevToolsAiProvider) => {
  selectedProvider.value = provider;
};
const analysisProviderLabel = computed(() =>
  analysisProvider.value
    ? getSiteDevToolsAiProviderLabel(analysisProvider.value)
    : '',
);
const resolvedAnalysisTarget = computed(
  () => analysisResolvedTarget.value ?? props.analysisTarget ?? null,
);
const analysisArtifactKindLabel = computed(() =>
  formatArtifactKindLabel(resolvedAnalysisTarget.value?.artifactKind),
);
const analysisDisplayPath = computed(
  () => resolvedAnalysisTarget.value?.displayPath || '',
);
const analysisScopeNotice = computed(() => {
  const resultTarget = resolvedAnalysisTarget.value;
  const currentTarget = props.analysisTarget;

  if (
    analysisSource.value !== 'build-report' ||
    !resultTarget ||
    !currentTarget ||
    (resultTarget.artifactKind === currentTarget.artifactKind &&
      resultTarget.displayPath === currentTarget.displayPath)
  ) {
    return '';
  }

  if (resultTarget.artifactKind === 'page-build') {
    return `This build report is grouped at page level and summarizes ${resultTarget.displayPath}, not only the current ${formatArtifactKindDescription(currentTarget.artifactKind)}.`;
  }

  return `This build report summarizes ${formatArtifactKindDescription(resultTarget.artifactKind)} ${resultTarget.displayPath} instead of only the currently opened ${formatArtifactKindDescription(currentTarget.artifactKind)}.`;
});
const analysisSections = computed(() =>
  createAnalysisSections(analysisResult.value),
);
const summarySection = computed(() => {
  const sections = analysisSections.value;
  const explicitSummarySection =
    sections.find(
      (section) => section.title.trim().toLowerCase() === 'summary',
    ) ?? null;

  return explicitSummarySection || sections[0] || null;
});
const shouldPromoteSummarySection = computed(() => {
  if (!summarySection.value) {
    return false;
  }

  return (
    summarySection.value.title.trim().toLowerCase() === 'summary' ||
    analysisSections.value.length > 1
  );
});
const isPageBuildReport = computed(
  () => resolvedAnalysisTarget.value?.artifactKind === 'page-build',
);
const pageReportSectionMap = computed(() => {
  const sectionsByKind = new Map<AnalysisSectionKind, AnalysisSection>();

  for (const section of analysisSections.value) {
    const sectionKind = getAnalysisSectionKind(section.title);

    if (!sectionsByKind.has(sectionKind)) {
      sectionsByKind.set(sectionKind, section);
    }
  }

  return {
    contents: sectionsByKind.get('contents') ?? null,
    optimizations: sectionsByKind.get('optimizations') ?? null,
    risks: sectionsByKind.get('risks') ?? null,
    summary:
      sectionsByKind.get('summary') ??
      (analysisSections.value.length > 0 ? analysisSections.value[0] : null),
    unknowns: sectionsByKind.get('unknowns') ?? null,
  };
});
const shouldUsePageReportLayout = computed(
  () =>
    isPageBuildReport.value &&
    Boolean(
      pageReportSectionMap.value.summary ||
        pageReportSectionMap.value.risks ||
        pageReportSectionMap.value.optimizations,
    ),
);
const pageReportSupportingSections = computed(() => {
  const promotedSectionIds = new Set(
    [
      pageReportSectionMap.value.summary?.id,
      pageReportSectionMap.value.risks?.id,
      pageReportSectionMap.value.optimizations?.id,
    ].filter(Boolean),
  );

  return analysisSections.value.filter(
    (section) => !promotedSectionIds.has(section.id),
  );
});
const pageReportMetricTiles = computed<AnalysisMetricTile[]>(() => {
  if (!shouldUsePageReportLayout.value) {
    return [];
  }

  const context = resolvedAnalysisTarget.value?.context;
  const bundleSummaryByLabel = new Map(
    (context?.bundleSummaryItems ?? []).map((item) => [item.label, item.value]),
  );
  const chunkResources = context?.chunkResourceItems ?? [];
  const moduleItems = context?.moduleItems ?? [];
  const largestChunk = chunkResources
    .filter((item) => item.type !== 'asset')
    .reduce<(typeof chunkResources)[number] | null>(
      (largestItem, currentItem) => {
        const currentBytes = parseFormattedByteSize(currentItem.size);
        const largestBytes = parseFormattedByteSize(largestItem?.size);

        if (
          !largestItem ||
          (currentBytes ?? -1) > (largestBytes ?? -1) ||
          ((currentBytes ?? -1) === (largestBytes ?? -1) &&
            currentItem.label.localeCompare(largestItem.label) < 0)
        ) {
          return currentItem;
        }

        return largestItem;
      },
      null,
    );
  const largestAsset = chunkResources
    .filter((item) => item.type === 'asset')
    .reduce<(typeof chunkResources)[number] | null>(
      (largestItem, currentItem) => {
        const currentBytes = parseFormattedByteSize(currentItem.size);
        const largestBytes = parseFormattedByteSize(largestItem?.size);

        if (
          !largestItem ||
          (currentBytes ?? -1) > (largestBytes ?? -1) ||
          ((currentBytes ?? -1) === (largestBytes ?? -1) &&
            currentItem.label.localeCompare(largestItem.label) < 0)
        ) {
          return currentItem;
        }

        return largestItem;
      },
      null,
    );
  const analysisSignalText = [
    pageReportSectionMap.value.summary?.body,
    pageReportSectionMap.value.risks?.body,
    pageReportSectionMap.value.optimizations?.body,
  ]
    .filter((value): value is string => typeof value === 'string')
    .map((value) => stripMarkdownFormatting(value))
    .join(' ')
    .toLowerCase();
  const focusSignal = deriveFocusMetricSignal({
    analysisText: analysisSignalText,
    chunkResources,
    largestAsset,
    largestChunk,
    moduleItems,
    totalSize: bundleSummaryByLabel.get('Total') || undefined,
  });

  return [
    {
      detail: bundleSummaryByLabel.get('JS') || undefined,
      label: 'Total',
      tone: 'brand',
      value: bundleSummaryByLabel.get('Total') || '—',
    },
    {
      detail: joinMetricDetailParts(
        largestChunk?.size,
        largestChunk?.share || undefined,
      ),
      label: 'Largest Chunk',
      tone: 'neutral',
      value: largestChunk?.label || '—',
    },
    {
      detail: joinMetricDetailParts(
        largestAsset?.size,
        largestAsset?.share || undefined,
      ),
      label: 'Largest Asset',
      tone: 'success',
      value: largestAsset?.label || '—',
    },
    {
      detail: focusSignal.detail,
      label: 'Focus',
      tone: focusSignal.tone,
      value: focusSignal.value,
    },
  ];
});
const detailSections = computed(() => {
  const sections = analysisSections.value;

  if (sections.length <= 1) {
    return [];
  }

  const currentSummarySection = summarySection.value;

  return sections.filter((section) => section.id !== currentSummarySection?.id);
});
const canAnalyze = computed(
  () =>
    Boolean(props.analysisTarget) &&
    Boolean(props.endpoint) &&
    currentCapability.value?.available === true &&
    analysisState.value !== 'loading',
);
const analyzeLabel = computed(() =>
  analysisState.value === 'loading'
    ? `Analyzing with ${selectedProviderLabel.value}...`
    : `Analyze with ${selectedProviderLabel.value}`,
);
const getBuildReportSelectionKey = (
  report: SiteDevToolsAiBuildReportReference,
) => `${report.reportId}::${report.reportFile}`;
const availableBuildReports = computed(() => props.buildReports || []);
const activeBuildReport = computed(
  () =>
    availableBuildReports.value.find(
      (report) =>
        getBuildReportSelectionKey(report) === selectedBuildReportKey.value,
    ) ??
    availableBuildReports.value[0] ??
    null,
);
const hasBuildReports = computed(() => availableBuildReports.value.length > 0);
const shouldShowBuildReportSelector = computed(
  () => availableBuildReports.value.length > 1,
);
const canViewBuildReport = computed(
  () => hasBuildReports.value && analysisState.value !== 'loading',
);
const shouldShowLiveAnalysisControls = computed(() => false);
const shouldShowProviderDetail = computed(() => !hasBuildReports.value);
const promptToCopy = computed(() =>
  resolveSiteDevToolsAiCopyPrompt({
    activeBuildReport: activeBuildReport.value,
    analysisSource: analysisSource.value,
    buildReportPromptByFile: buildReportPromptByFile.value,
    liveAnalysisTarget: props.analysisTarget,
    resolvedAnalysisTarget: resolvedAnalysisTarget.value,
  }),
);
const copyPromptLabel = computed(() =>
  lastAction.value === 'copy-prompt'
    ? `✓ ${lastActionLabel.value}`
    : 'Copy Prompt',
);
const copyResultLabel = computed(() =>
  lastAction.value === 'copy-result'
    ? `✓ ${lastActionLabel.value}`
    : 'Copy Result',
);
const providerDetail = computed(() => {
  if (capabilitiesState.value === 'loading') {
    return 'Checking AI report availability...';
  }

  if (currentCapability.value?.detail) {
    return currentCapability.value.detail;
  }

  if (capabilitiesError.value) {
    return capabilitiesError.value;
  }

  return 'Prompt copy is always available. AI analysis runs during docs build through siteDevtools.analysis.buildReports.';
});
const analysisHint = computed(() =>
  hasBuildReports.value
    ? 'This artifact already has a saved build-time report. Review the generated result and the exact model that produced it below.'
    : 'Review the current chunk or module source from a copied prompt, or rebuild with siteDevtools.analysis.buildReports to generate a saved report.',
);
const analysisSourceLabel = computed(() => {
  if (analysisSource.value === 'build-report') {
    return 'Build-time Report';
  }

  if (analysisSource.value === 'live-analysis') {
    return 'Real-time Analysis';
  }

  return '';
});
const generatedAtLabel = computed(() => {
  if (!analysisGeneratedAt.value) {
    return '';
  }

  const timestamp = Date.parse(analysisGeneratedAt.value);

  if (Number.isNaN(timestamp)) {
    return analysisGeneratedAt.value;
  }

  return new Date(timestamp).toLocaleString();
});
const canToggleAnalysisView = computed(
  () => analysisState.value === 'ready' && Boolean(analysisResult.value),
);

const beginAnalysisRequest = () => {
  analysisRequestToken += 1;
  return analysisRequestToken;
};

const isLatestAnalysisRequest = (requestToken: number) =>
  requestToken === analysisRequestToken;

const getResponseJson = async <T,>(
  response: Response,
  fallbackMessage: string,
): Promise<T> => {
  const contentType = response.headers.get('content-type') || '';

  if (!contentType.toLowerCase().includes('application/json')) {
    throw new Error(fallbackMessage);
  }

  return (await response.json()) as T;
};

const resetAnalysisState = () => {
  analysisState.value = 'idle';
  analysisResult.value = '';
  analysisError.value = '';
  analysisDetail.value = '';
  analysisGeneratedAt.value = '';
  analysisModel.value = '';
  analysisProvider.value = null;
  analysisSource.value = null;
  analysisResolvedTarget.value = null;
  selectedAnalysisView.value = 'rendered';
  analysisLoadingProgress.value = createSiteDevToolsLoadingProgress(
    'Waiting for analysis',
  );
};

const applyAnalysisResult = ({
  detail,
  generatedAt,
  model,
  provider,
  result,
  source,
  target,
}: {
  detail?: string;
  generatedAt?: string;
  model?: string;
  provider: SiteDevToolsAiProvider;
  result: string;
  source: 'build-report' | 'live-analysis';
  target?: SiteDevToolsAiAnalysisTarget | null;
}) => {
  analysisState.value = 'ready';
  analysisError.value = '';
  analysisDetail.value = detail || '';
  analysisGeneratedAt.value = generatedAt || '';
  analysisModel.value = model || '';
  analysisProvider.value = provider;
  analysisResult.value = result;
  analysisSource.value = source;
  analysisResolvedTarget.value = target || props.analysisTarget || null;
  selectedAnalysisView.value = 'rendered';
};

const syncPreferredProvider = () => {
  const availableProvider = PROVIDERS.find(
    (provider) => capabilities.value?.[provider]?.available,
  );

  if (!availableProvider) {
    return;
  }

  if (!capabilities.value?.[selectedProvider.value]?.available) {
    selectedProvider.value = availableProvider;
  }
};

const loadBuildReport = async (report = activeBuildReport.value) => {
  if (!report?.reportFile) {
    return;
  }

  isRunningLiveAnalysis.value = false;
  const requestToken = beginAnalysisRequest();
  resetAnalysisState();
  analysisState.value = 'loading';
  analysisLoadingProgress.value = {
    detail:
      'Loading the saved build-time report generated from the latest build output.',
    indeterminate: true,
    label: 'Loading build-time report',
    value: 0.18,
  };

  try {
    const response = await fetch(report.reportFile);

    if (!isLatestAnalysisRequest(requestToken)) {
      return;
    }

    const payload = await getResponseJson<Partial<SiteDevToolsAiBuildReport>>(
      response,
      'Failed to load saved build-time report JSON.',
    );

    if (
      !response.ok ||
      typeof payload.result !== 'string' ||
      (payload.provider !== 'claude' && payload.provider !== 'doubao')
    ) {
      throw new Error('Failed to load saved build-time report.');
    }

    if (
      typeof payload.prompt === 'string' &&
      payload.prompt.trim().length > 0
    ) {
      buildReportPromptByFile.value = {
        ...buildReportPromptByFile.value,
        [report.reportFile]: payload.prompt,
      };
    }

    applyAnalysisResult({
      detail: payload.detail || activeBuildReport.value.detail,
      generatedAt: payload.generatedAt || activeBuildReport.value.generatedAt,
      model: payload.model || activeBuildReport.value.model,
      provider: payload.provider,
      result: payload.result,
      source: 'build-report',
      target: payload.target || null,
    });
    lastLoadedBuildReportFile.value = report.reportFile;
  } catch (error) {
    if (!isLatestAnalysisRequest(requestToken)) {
      return;
    }

    analysisState.value = 'error';
    analysisDetail.value = '';
    analysisError.value =
      error instanceof Error
        ? error.message
        : 'Failed to load saved build-time report.';
  }
};

const loadCapabilities = async (force = false) => {
  if (!props.endpoint) {
    capabilities.value = null;
    capabilitiesState.value = 'error';
    capabilitiesError.value =
      'AI analysis is generated during docs build. Configure siteDevtools.analysis.buildReports and rebuild the site to view saved reports here.';
    return;
  }

  if (!force && capabilitiesState.value === 'ready') {
    return;
  }

  if (!force && capabilitiesState.value === 'loading') {
    return;
  }

  capabilitiesState.value = 'loading';
  capabilitiesError.value = '';

  try {
    const response = await fetch(props.endpoint);
    const payload = await getResponseJson<CapabilitiesPayload>(
      response,
      'Real-time AI analysis is only available from the Vite dev server. Preview/build output can open saved build-time reports, but cannot call providers directly.',
    );

    if (!response.ok || !('ok' in payload) || payload.ok !== true) {
      throw new Error(
        'error' in payload && typeof payload.error === 'string'
          ? payload.error
          : 'Failed to load AI provider capabilities.',
      );
    }

    capabilities.value = payload.providers;
    capabilitiesState.value = 'ready';
    syncPreferredProvider();
  } catch (error) {
    capabilities.value = null;
    capabilitiesState.value = 'error';
    capabilitiesError.value =
      error instanceof Error
        ? error.message
        : 'Failed to load AI provider capabilities.';
  }
};

const copyText = async (
  text: string,
  action: 'copy-prompt' | 'copy-result',
  label: string,
) => {
  await navigator.clipboard.writeText(text);
  lastAction.value = action;
  lastActionLabel.value = label;
};

const copyPrompt = async () => {
  if (!promptToCopy.value) {
    return;
  }

  try {
    await copyText(promptToCopy.value, 'copy-prompt', 'Prompt Copied');
  } catch (error) {
    analysisState.value = 'error';
    analysisDetail.value = '';
    analysisError.value =
      error instanceof Error ? error.message : 'Failed to copy AI prompt.';
  }
};

const copyResult = async () => {
  if (!analysisResult.value) {
    return;
  }

  try {
    await copyText(analysisResult.value, 'copy-result', 'Result Copied');
  } catch (error) {
    analysisState.value = 'error';
    analysisDetail.value = '';
    analysisError.value =
      error instanceof Error ? error.message : 'Failed to copy AI result.';
  }
};

const showBuildReport = async (reportKey?: string) => {
  if (reportKey) {
    selectedBuildReportKey.value = reportKey;
  }

  await loadBuildReport();
};

const runAnalysis = async () => {
  if (!props.analysisTarget) {
    return;
  }

  await loadCapabilities();

  if (!props.endpoint) {
    analysisState.value = 'error';
    analysisDetail.value = '';
    analysisError.value = providerDetail.value;
    return;
  }

  if (currentCapability.value?.available !== true) {
    analysisState.value = 'error';
    analysisDetail.value = '';
    analysisError.value = providerDetail.value;
    return;
  }

  isRunningLiveAnalysis.value = true;
  const requestToken = beginAnalysisRequest();
  resetAnalysisState();
  analysisState.value = 'loading';
  analysisLoadingProgress.value = {
    detail: `${selectedProviderLabel.value} is reviewing the current artifact.`,
    indeterminate: true,
    label: 'Running real-time analysis',
    value: 0.32,
  };

  try {
    const response = await fetch(props.endpoint, {
      body: JSON.stringify({
        provider: selectedProvider.value,
        target: props.analysisTarget,
      }),
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });

    if (!isLatestAnalysisRequest(requestToken)) {
      return;
    }

    const payload = await getResponseJson<SiteDevToolsAiAnalyzeResponse>(
      response,
      'Real-time AI analysis is only available from the Vite dev server. Preview/build output can open saved build-time reports, but cannot call providers directly.',
    );

    if (!response.ok || payload.ok !== true || !payload.result) {
      analysisState.value = 'error';
      analysisDetail.value = payload.detail || '';
      analysisError.value = payload.error || 'AI analysis request failed.';
      analysisProvider.value = payload.provider || selectedProvider.value;
      analysisResolvedTarget.value = props.analysisTarget;
      return;
    }

    applyAnalysisResult({
      detail: payload.detail,
      model: payload.model,
      provider: payload.provider,
      result: payload.result,
      source: 'live-analysis',
      target: props.analysisTarget,
    });
  } catch (error) {
    if (!isLatestAnalysisRequest(requestToken)) {
      return;
    }

    analysisState.value = 'error';
    analysisDetail.value = '';
    analysisError.value =
      error instanceof Error ? error.message : 'AI analysis request failed.';
  } finally {
    if (isLatestAnalysisRequest(requestToken)) {
      isRunningLiveAnalysis.value = false;
    }
  }
};

watch(
  () => props.endpoint,
  () => {
    capabilities.value = null;
    capabilitiesState.value = 'idle';
    capabilitiesError.value = '';
    if (props.endpoint) {
      void loadCapabilities(true);
    }
  },
  {
    immediate: true,
  },
);

watch(
  () => [
    props.analysisTarget?.displayPath,
    ...availableBuildReports.value.map((report) => report.reportFile),
  ],
  () => {
    lastAction.value = null;
    lastActionLabel.value = '';

    if (isRunningLiveAnalysis.value) {
      return;
    }

    if (
      selectedBuildReportKey.value &&
      availableBuildReports.value.some(
        (report) =>
          getBuildReportSelectionKey(report) === selectedBuildReportKey.value,
      )
    ) {
      // Keep the user-selected build report when it is still present.
    } else {
      selectedBuildReportKey.value = availableBuildReports.value[0]
        ? getBuildReportSelectionKey(availableBuildReports.value[0])
        : '';
    }

    if (activeBuildReport.value?.reportFile) {
      if (
        analysisSource.value !== 'build-report' ||
        lastLoadedBuildReportFile.value !== activeBuildReport.value.reportFile
      ) {
        void loadBuildReport(activeBuildReport.value);
      }
      return;
    }

    if (analysisSource.value !== 'live-analysis') {
      resetAnalysisState();
    }
  },
  {
    immediate: true,
  },
);
</script>

<template>
  <section class="site-devtools-ai-panel">
    <div class="site-devtools-detail-modal__section-header">
      <div>
        <p class="site-devtools-section__eyebrow">AI Analysis</p>
        <h4 class="site-devtools-section__title">Artifact Analysis</h4>
      </div>
      <div class="site-devtools-dialog__actions">
        <button
          type="button"
          class="site-devtools-dialog__action"
          :disabled="!promptToCopy"
          @click="copyPrompt"
        >
          {{ copyPromptLabel }}
        </button>
        <button
          type="button"
          class="site-devtools-dialog__action"
          :disabled="!analysisResult"
          @click="copyResult"
        >
          {{ copyResultLabel }}
        </button>
        <button
          v-if="shouldShowLiveAnalysisControls"
          type="button"
          class="site-devtools-dialog__action site-devtools-dialog__action--primary"
          :disabled="!canAnalyze"
          @click="runAnalysis"
        >
          {{ analyzeLabel }}
        </button>
      </div>
    </div>

    <p class="site-devtools-ai-panel__hint">
      {{ analysisHint }}
    </p>

    <div
      v-if="hasBuildReports && shouldShowBuildReportSelector"
      class="site-devtools-ai-panel__providers"
    >
      <button
        v-for="report in availableBuildReports"
        :key="getBuildReportSelectionKey(report)"
        type="button"
        class="site-devtools-ai-panel__provider"
        :class="{
          'is-selected':
            getBuildReportSelectionKey(report) === selectedBuildReportKey,
        }"
        :disabled="!canViewBuildReport"
        @click="showBuildReport(getBuildReportSelectionKey(report))"
      >
        <strong>{{ report.model || report.reportLabel }}</strong>
        <span v-if="!report.model">{{ report.reportLabel }}</span>
      </button>
    </div>

    <div
      v-if="shouldShowLiveAnalysisControls"
      class="site-devtools-ai-panel__providers"
    >
      <button
        v-for="provider in PROVIDERS"
        :key="provider"
        type="button"
        class="site-devtools-ai-panel__provider"
        :class="{
          'is-selected': provider === selectedProvider,
          'is-unavailable': isProviderUnavailable(provider),
        }"
        @click="selectProvider(provider)"
      >
        <strong>{{ getSiteDevToolsAiProviderLabel(provider) }}</strong>
        <span>{{ formatProviderAvailability(provider) }}</span>
      </button>
    </div>

    <p v-if="shouldShowProviderDetail" class="site-devtools-ai-panel__meta">
      {{ providerDetail }}
    </p>

    <SiteDevToolsLoadingState
      v-if="analysisState === 'loading'"
      :progress="analysisLoadingProgress"
    />

    <p
      v-if="analysisState === 'error'"
      class="site-devtools-overlay__panel-error"
    >
      {{ analysisError }}
    </p>
    <p
      v-if="analysisState === 'error' && analysisDetail"
      class="site-devtools-overlay__panel-meta"
    >
      {{ analysisDetail }}
    </p>

    <div
      v-if="analysisState === 'ready'"
      class="site-devtools-ai-panel__result"
    >
      <div
        v-if="
          analysisSourceLabel ||
          analysisArtifactKindLabel ||
          analysisDisplayPath ||
          analysisProviderLabel ||
          analysisModel ||
          generatedAtLabel ||
          analysisDetail
        "
        class="site-devtools-ai-panel__result-header"
      >
        <div
          class="site-devtools-detail-modal__list-meta site-devtools-ai-panel__result-meta"
        >
          <span v-if="analysisSourceLabel">{{ analysisSourceLabel }}</span>
          <span v-if="analysisArtifactKindLabel">
            {{ analysisArtifactKindLabel }}
          </span>
          <span v-if="analysisDisplayPath">{{ analysisDisplayPath }}</span>
          <span v-if="analysisProviderLabel">{{ analysisProviderLabel }}</span>
          <span v-if="analysisModel">Model {{ analysisModel }}</span>
          <span v-if="generatedAtLabel">Generated {{ generatedAtLabel }}</span>
          <span v-if="analysisDetail">{{ analysisDetail }}</span>
        </div>
        <div
          v-if="canToggleAnalysisView"
          class="site-devtools-ai-panel__view-toggle"
        >
          <button
            type="button"
            class="site-devtools-ai-panel__view-button"
            :class="{ 'is-selected': selectedAnalysisView === 'rendered' }"
            @click="selectedAnalysisView = 'rendered'"
          >
            Rendered
          </button>
          <button
            type="button"
            class="site-devtools-ai-panel__view-button"
            :class="{ 'is-selected': selectedAnalysisView === 'raw' }"
            @click="selectedAnalysisView = 'raw'"
          >
            Raw
          </button>
        </div>
      </div>
      <div
        v-if="analysisScopeNotice"
        class="site-devtools-ai-panel__scope-note"
      >
        {{ analysisScopeNotice }}
      </div>
      <div
        v-if="selectedAnalysisView === 'rendered'"
        class="site-devtools-ai-panel__result-rendered"
      >
        <div
          v-if="shouldUsePageReportLayout"
          class="site-devtools-ai-panel__page-report"
        >
          <div
            v-if="pageReportMetricTiles.length > 0"
            class="site-devtools-ai-panel__metric-strip"
          >
            <article
              v-for="tile in pageReportMetricTiles"
              :key="tile.label"
              class="site-devtools-ai-panel__metric-tile"
              :class="`is-${tile.tone || 'neutral'}`"
            >
              <p class="site-devtools-ai-panel__metric-label">
                {{ tile.label }}
              </p>
              <h5 class="site-devtools-ai-panel__metric-value">
                {{ tile.value }}
              </h5>
              <p
                v-if="tile.detail"
                class="site-devtools-ai-panel__metric-detail"
              >
                {{ tile.detail }}
              </p>
            </article>
          </div>

          <article
            v-if="pageReportSectionMap.summary"
            class="site-devtools-ai-panel__summary-card site-devtools-ai-panel__summary-card--hero"
          >
            <div class="site-devtools-ai-panel__section-header">
              <p class="site-devtools-ai-panel__section-kicker">Summary</p>
              <h5 class="site-devtools-ai-panel__section-title">
                {{ pageReportSectionMap.summary.title }}
              </h5>
            </div>
            <div
              class="site-devtools-ai-panel__markdown"
              v-html="pageReportSectionMap.summary.html"
            />
          </article>

          <div class="site-devtools-ai-panel__page-report-grid">
            <article
              v-if="pageReportSectionMap.risks"
              class="site-devtools-ai-panel__section-card site-devtools-ai-panel__section-card--risk"
            >
              <div class="site-devtools-ai-panel__section-header">
                <p class="site-devtools-ai-panel__section-kicker">Risk</p>
                <h5 class="site-devtools-ai-panel__section-title">
                  {{ pageReportSectionMap.risks.title }}
                </h5>
              </div>
              <div
                class="site-devtools-ai-panel__markdown"
                v-html="pageReportSectionMap.risks.html"
              />
            </article>

            <article
              v-if="pageReportSectionMap.optimizations"
              class="site-devtools-ai-panel__section-card site-devtools-ai-panel__section-card--optimization"
            >
              <div class="site-devtools-ai-panel__section-header">
                <p class="site-devtools-ai-panel__section-kicker">Action</p>
                <h5 class="site-devtools-ai-panel__section-title">
                  {{ pageReportSectionMap.optimizations.title }}
                </h5>
              </div>
              <div
                class="site-devtools-ai-panel__markdown"
                v-html="pageReportSectionMap.optimizations.html"
              />
            </article>
          </div>

          <div
            v-if="pageReportSupportingSections.length > 0"
            class="site-devtools-ai-panel__section-grid"
          >
            <article
              v-for="section in pageReportSupportingSections"
              :key="section.id"
              class="site-devtools-ai-panel__section-card"
            >
              <div class="site-devtools-ai-panel__section-header">
                <p class="site-devtools-ai-panel__section-kicker">Details</p>
                <h5 class="site-devtools-ai-panel__section-title">
                  {{ section.title }}
                </h5>
              </div>
              <div
                class="site-devtools-ai-panel__markdown"
                v-html="section.html"
              />
            </article>
          </div>
        </div>

        <template v-else>
          <article
            v-if="summarySection && shouldPromoteSummarySection"
            class="site-devtools-ai-panel__summary-card"
          >
            <div class="site-devtools-ai-panel__section-header">
              <p class="site-devtools-ai-panel__section-kicker">
                {{
                  summarySection.title.trim().toLowerCase() === 'summary'
                    ? 'Summary'
                    : 'Overview'
                }}
              </p>
              <h5 class="site-devtools-ai-panel__section-title">
                {{ summarySection.title }}
              </h5>
            </div>
            <div
              class="site-devtools-ai-panel__markdown"
              v-html="summarySection.html"
            />
          </article>
          <div
            v-if="detailSections.length > 0"
            class="site-devtools-ai-panel__section-grid"
          >
            <article
              v-for="section in detailSections"
              :key="section.id"
              class="site-devtools-ai-panel__section-card"
            >
              <div class="site-devtools-ai-panel__section-header">
                <p class="site-devtools-ai-panel__section-kicker">Section</p>
                <h5 class="site-devtools-ai-panel__section-title">
                  {{ section.title }}
                </h5>
              </div>
              <div
                class="site-devtools-ai-panel__markdown"
                v-html="section.html"
              />
            </article>
          </div>
          <article
            v-else-if="summarySection"
            class="site-devtools-ai-panel__section-card"
          >
            <div class="site-devtools-ai-panel__section-header">
              <p class="site-devtools-ai-panel__section-kicker">Analysis</p>
              <h5 class="site-devtools-ai-panel__section-title">
                {{ summarySection.title }}
              </h5>
            </div>
            <div
              class="site-devtools-ai-panel__markdown"
              v-html="summarySection.html"
            />
          </article>
        </template>
      </div>
      <pre v-else><code>{{ analysisResult }}</code></pre>
    </div>
  </section>
</template>
