/**
 * AI-powered build report generation for site development tools.
 * This file contains complex orchestration logic for generating and caching
 * AI analysis reports across multiple providers and pages.
 */
/* eslint-disable max-lines */
import type {
  PageMetafile,
  SiteDevToolsAiBuildReportReference,
} from '#dep-types/page';
import type {
  SiteDevToolsAnalysisBuildReportModelConfig,
  SiteDevToolsAnalysisBuildReportsConfig,
  SiteDevToolsAnalysisBuildReportsPageContext,
} from '#dep-types/utils';
import { VITEPRESS_SITE_DEVTOOLS_LOG_GROUPS } from '#shared/constants/log-groups/site-devtools';
import { createElapsedLogOptions } from '@docs-islands/logger/helper';
import { join } from 'pathe';
import {
  buildSiteDevToolsAiAnalysisPrompt,
  createSiteDevToolsAiBundleSummaryItems,
  createSiteDevToolsAiChunkResourceItems,
  formatSiteDevToolsAiBytes,
  getSiteDevToolsAiProviderLabel,
  sanitizeSiteDevToolsAiAnalysisTarget,
  type SiteDevToolsAiAnalysisTarget,
  type SiteDevToolsAiBuildReport,
  type SiteDevToolsAiProvider,
  type SiteDevToolsAiSanitizeOptions,
} from '../../shared/site-devtools-ai';
import { getVitePressGroupLogger } from '../logger';
import type { BuildReportCacheConfig } from './ai-build-report-cache';
import {
  createBuildReportCacheIdentity,
  getBuildReportCacheFilePath,
  getBuildReportCacheInvalidationReason,
  getBuildReportCacheKey,
  getBuildReportProviderConfigSnapshot,
  mergeBuildReportCacheInput,
  readBuildReportCacheEntry,
  resolveBuildReportCacheConfig,
  sanitizeBuildReportCacheDirectory,
  writeBuildReportAsset,
  writeBuildReportCacheEntry,
} from './ai-build-report-cache';
import {
  aggregatePageFiles,
  aggregatePageModules,
  collectBuildReportReferencesForPageMetafiles,
  hasPageBuildAnalysisSignals,
} from './ai-build-reports-collector';
import {
  collectPageRuntimeFiles,
  createPageComponentItems,
  createPageModuleItems,
  createPageRenderOrderItems,
  createPageSpaSyncComponentItems,
  createPageSpaSyncSummaryItems,
  getPageCompositionDetailLabel,
  resolvePageClientChunkPublicPath,
} from './ai-page-build-context';
import {
  analyzeSiteDevToolsAiTarget,
  resolveSiteDevToolsAiCapabilities,
  type SiteDevToolsAiConfig,
  type SiteDevToolsAiExecutionResult,
} from './ai-server';

const elapsedSince = (startTimeMs: number) =>
  createElapsedLogOptions(startTimeMs, Date.now());

const getAiBuildReportsLogger = (loggerScopeId: string) =>
  getVitePressGroupLogger(
    VITEPRESS_SITE_DEVTOOLS_LOG_GROUPS.aiBuildReports,
    loggerScopeId,
  );

interface BuildReportDependencies {
  analyzeTarget?: (options: {
    config: SiteDevToolsAiConfig;
    loggerScopeId?: string;
    provider: SiteDevToolsAiProvider;
    target: SiteDevToolsAiAnalysisTarget;
  }) => Promise<SiteDevToolsAiExecutionResult>;
  resolveCapabilities?: (
    config: SiteDevToolsAiConfig,
  ) => ReturnType<typeof resolveSiteDevToolsAiCapabilities>;
}

interface BuildReportExecution {
  config: SiteDevToolsAiConfig;
  providerId?: string;
  providerLabel?: string;
  provider: SiteDevToolsAiProvider;
  reportId: string;
  reportLabel: string;
}

interface BuildReportPagePlan {
  cacheConfig: BuildReportCacheConfig | null;
  executions: BuildReportExecution[];
  includeChunks: boolean;
  includeModules: boolean;
}

interface BuildReportExecutionPlan {
  defaultExecutionId?: string;
  executionById: Map<string, BuildReportExecution>;
  executions: BuildReportExecution[];
  skippedReason?: string;
  warningMessages: string[];
}

export interface GenerateSiteDevToolsAiBuildReportsResult {
  executionCount: number;
  generatedReportCount: number;
  providers: SiteDevToolsAiProvider[];
  reusedReportCount: number;
  skippedReason?: string;
}

const getBuildReportModelConfigs = (
  aiConfig: SiteDevToolsAiConfig,
): SiteDevToolsAnalysisBuildReportModelConfig[] =>
  Array.isArray(aiConfig?.buildReports?.models)
    ? (aiConfig.buildReports.models.filter(
        Boolean,
      ) as SiteDevToolsAnalysisBuildReportModelConfig[])
    : [];

type SiteDevToolsAnalysisDoubaoRuntimeProviderConfig = NonNullable<
  NonNullable<NonNullable<SiteDevToolsAiConfig>['providers']>['doubao']
>[number];

const getDoubaoProviderConfigs = (
  aiConfig: SiteDevToolsAiConfig,
): SiteDevToolsAnalysisDoubaoRuntimeProviderConfig[] =>
  Array.isArray(aiConfig?.providers?.doubao)
    ? aiConfig.providers.doubao.filter(
        (
          providerConfig,
        ): providerConfig is SiteDevToolsAnalysisDoubaoRuntimeProviderConfig =>
          Boolean(providerConfig),
      )
    : [];

const getDefaultDoubaoProviderConfig = (
  providerConfigs: SiteDevToolsAnalysisDoubaoRuntimeProviderConfig[],
) =>
  providerConfigs.find((providerConfig) => providerConfig.default === true) ??
  providerConfigs[0];

const getDefaultBuildReportModelConfig = (
  modelConfigs: SiteDevToolsAnalysisBuildReportModelConfig[],
) =>
  modelConfigs.find((modelConfig) => modelConfig.default === true) ??
  modelConfigs[0];

const getBuildReportExecutionLabel = (
  modelConfig: SiteDevToolsAnalysisBuildReportModelConfig,
  providerConfig?: SiteDevToolsAnalysisDoubaoRuntimeProviderConfig,
) =>
  modelConfig.label?.trim() ||
  [
    getSiteDevToolsAiProviderLabel(modelConfig.providerRef.provider),
    providerConfig?.label?.trim() || providerConfig?.id?.trim() || null,
    modelConfig.model,
  ]
    .filter((value): value is string => Boolean(value))
    .join(' · ');

const getBuildReportExecutionId = (
  modelConfig: SiteDevToolsAnalysisBuildReportModelConfig,
) => modelConfig.id;

const createBuildReportExecutionConfig = (
  aiConfig: SiteDevToolsAiConfig,
  modelConfig: SiteDevToolsAnalysisBuildReportModelConfig,
  providerConfig: SiteDevToolsAnalysisDoubaoRuntimeProviderConfig,
): SiteDevToolsAiConfig => {
  return {
    buildReports: aiConfig?.buildReports,
    providers: {
      ...aiConfig?.providers,
      doubao: [
        {
          ...providerConfig,
          default: true,
          maxTokens: modelConfig.maxTokens,
          model: modelConfig.model,
          temperature: modelConfig.temperature,
          thinking: modelConfig.thinking ?? false,
        },
      ],
    },
  };
};

const resolveBuildReportExecutionProvider = ({
  aiConfig,
  modelConfig,
}: {
  aiConfig: SiteDevToolsAiConfig;
  modelConfig: SiteDevToolsAnalysisBuildReportModelConfig;
}):
  | {
      provider: SiteDevToolsAiProvider;
      providerConfig: SiteDevToolsAnalysisDoubaoRuntimeProviderConfig;
      warningMessages: string[];
    }
  | {
      provider?: undefined;
      providerConfig?: undefined;
      warningMessages: string[];
    } => {
  const warningMessages: string[] = [];

  switch (modelConfig.providerRef.provider) {
    case 'doubao': {
      const providerConfigs = getDoubaoProviderConfigs(aiConfig);

      if (providerConfigs.length === 0) {
        warningMessages.push(
          `Skipped build-time AI report model ${modelConfig.id}: siteDevtools.analysis.providers.doubao must contain at least one provider entry.`,
        );
        return { warningMessages };
      }

      const flaggedDefaults = providerConfigs.filter(
        (providerConfig) => providerConfig.default === true,
      );

      if (flaggedDefaults.length > 1) {
        warningMessages.push(
          `Multiple default Doubao provider entries are configured. Using the first default entry for build-time AI report model ${modelConfig.id}.`,
        );
      }

      if (modelConfig.providerRef.id) {
        const matchingProviders = providerConfigs.filter(
          (providerConfig) => providerConfig.id === modelConfig.providerRef.id,
        );

        if (matchingProviders.length === 0) {
          warningMessages.push(
            `Skipped build-time AI report model ${modelConfig.id}: providerRef.id "${modelConfig.providerRef.id}" was not found in siteDevtools.analysis.providers.doubao.`,
          );
          return { warningMessages };
        }

        if (matchingProviders.length > 1) {
          warningMessages.push(
            `Multiple Doubao provider entries use id "${modelConfig.providerRef.id}". Using the first matching entry for build-time AI report model ${modelConfig.id}.`,
          );
        }

        return {
          provider: 'doubao',
          providerConfig: matchingProviders[0],
          warningMessages,
        };
      }

      return {
        provider: 'doubao',
        providerConfig: getDefaultDoubaoProviderConfig(providerConfigs),
        warningMessages,
      };
    }
    default: {
      warningMessages.push(
        `Skipped build-time AI report model ${modelConfig.id}: provider "${modelConfig.providerRef.provider}" is not supported.`,
      );
      return { warningMessages };
    }
  }
};

const createBuildReportExecutions = (
  aiConfig: SiteDevToolsAiConfig,
): BuildReportExecutionPlan => {
  const modelConfigs = getBuildReportModelConfigs(aiConfig);

  if (modelConfigs.length === 0) {
    return {
      defaultExecutionId: undefined,
      executionById: new Map(),
      executions: [],
      skippedReason:
        'Skipped build-time AI report analysis: no siteDevtools.analysis.buildReports.models entries are configured.',
      warningMessages: [],
    };
  }

  const warningMessages = new Set<string>();
  const executions: BuildReportExecution[] = [];
  const executionById = new Map<string, BuildReportExecution>();
  const defaultModelConfig = getDefaultBuildReportModelConfig(modelConfigs);
  const defaultModelConfigs = modelConfigs.filter(
    (modelConfig) => modelConfig.default === true,
  );

  if (defaultModelConfigs.length > 1) {
    warningMessages.add(
      `Multiple build-time AI report models are marked as default. Using the first default model (${defaultModelConfig?.id}).`,
    );
  }

  const seenModelIds = new Set<string>();

  for (const modelConfig of modelConfigs) {
    if (!modelConfig.id?.trim()) {
      warningMessages.add(
        'Skipped a build-time AI report model because it is missing a non-empty id.',
      );
      continue;
    }

    if (seenModelIds.has(modelConfig.id)) {
      warningMessages.add(
        `Skipped build-time AI report model ${modelConfig.id}: duplicate model id.`,
      );
      continue;
    }

    seenModelIds.add(modelConfig.id);
    const resolvedProvider = resolveBuildReportExecutionProvider({
      aiConfig,
      modelConfig,
    });

    for (const warningMessage of resolvedProvider.warningMessages) {
      warningMessages.add(warningMessage);
    }

    if (!resolvedProvider.provider || !resolvedProvider.providerConfig) {
      continue;
    }

    const executionConfig = createBuildReportExecutionConfig(
      aiConfig,
      modelConfig,
      resolvedProvider.providerConfig,
    );
    const execution = {
      config: executionConfig,
      provider: resolvedProvider.provider,
      providerId: resolvedProvider.providerConfig.id,
      providerLabel: resolvedProvider.providerConfig.label,
      reportId: getBuildReportExecutionId(modelConfig),
      reportLabel: getBuildReportExecutionLabel(
        modelConfig,
        resolvedProvider.providerConfig,
      ),
    } satisfies BuildReportExecution;

    executions.push(execution);
    executionById.set(execution.reportId, execution);
  }

  return {
    defaultExecutionId: defaultModelConfig?.id,
    executionById,
    executions,
    ...(executions.length === 0
      ? {
          skippedReason:
            'Skipped build-time AI report analysis: no valid siteDevtools.analysis.buildReports.models entries could be resolved.',
        }
      : {}),
    warningMessages: [...warningMessages],
  };
};

const resolveAvailableBuildReportExecutions = async ({
  executions,
  resolveCapabilitiesImpl,
}: {
  executions: BuildReportExecution[];
  resolveCapabilitiesImpl: typeof resolveSiteDevToolsAiCapabilities;
}) => {
  const availableExecutionIds = new Set<string>();
  const skippedDetails: string[] = [];

  for (const execution of executions) {
    const capabilities = await resolveCapabilitiesImpl(execution.config);
    const capability = capabilities.providers[execution.provider];

    if (capability?.available) {
      availableExecutionIds.add(execution.reportId);
      continue;
    }

    skippedDetails.push(
      capability?.detail ||
        `Build report execution ${execution.reportLabel} is unavailable.`,
    );
  }

  return {
    availableExecutionIds,
    ...(skippedDetails.length > 0
      ? {
          skippedReason: skippedDetails.join(' '),
        }
      : {}),
  };
};

const applyBuildReportExecutionMetadata = ({
  execution,
  report,
}: {
  execution: BuildReportExecution;
  report: SiteDevToolsAiBuildReport;
}): SiteDevToolsAiBuildReport =>
  report.reportId === execution.reportId &&
  report.reportLabel === execution.reportLabel &&
  report.providerId === execution.providerId &&
  report.providerLabel === execution.providerLabel
    ? report
    : {
        ...report,
        providerId: execution.providerId,
        providerLabel: execution.providerLabel,
        reportId: execution.reportId,
        reportLabel: execution.reportLabel,
      };

const createDefaultBuildReportPagePlan = ({
  buildReportsConfig,
  cacheDir,
  defaultExecution,
  root,
}: {
  buildReportsConfig: SiteDevToolsAnalysisBuildReportsConfig;
  cacheDir: string;
  defaultExecution?: BuildReportExecution;
  root?: string;
}): BuildReportPagePlan => ({
  cacheConfig: resolveBuildReportCacheConfig({
    cache: buildReportsConfig.cache,
    cacheDir,
    root,
  }),
  executions: defaultExecution ? [defaultExecution] : [],
  includeChunks: buildReportsConfig.includeChunks === true,
  includeModules: buildReportsConfig.includeModules === true,
});

const resolveBuildReportPagePlan = ({
  buildReportsConfig,
  cacheDir,
  executionPlan,
  logger,
  pageContext,
  pageId,
  pageMetafile,
  root,
}: {
  buildReportsConfig: SiteDevToolsAnalysisBuildReportsConfig;
  cacheDir: string;
  executionPlan: BuildReportExecutionPlan;
  logger: ReturnType<typeof getAiBuildReportsLogger>;
  pageContext?: SiteDevToolsAnalysisBuildReportsPageContext;
  pageId: string;
  pageMetafile: PageMetafile;
  root?: string;
}): BuildReportPagePlan | null => {
  const resolveStartedAt = Date.now();

  if (!hasPageBuildAnalysisSignals(pageMetafile)) {
    return null;
  }

  const defaultPlan = createDefaultBuildReportPagePlan({
    buildReportsConfig,
    cacheDir,
    defaultExecution: executionPlan.defaultExecutionId
      ? executionPlan.executionById.get(executionPlan.defaultExecutionId)
      : undefined,
    root,
  });

  if (!buildReportsConfig.resolvePage) {
    return defaultPlan.executions.length > 0 ? defaultPlan : null;
  }

  if (!pageContext) {
    logger.warn(
      `Skipped build-time AI report for ${pageId}: siteDevtools.analysis.buildReports.resolvePage requires page context, but no page filePath was provided.`,
      elapsedSince(resolveStartedAt),
    );
    return null;
  }

  let resolvedPageOverride: ReturnType<
    NonNullable<SiteDevToolsAnalysisBuildReportsConfig['resolvePage']>
  >;

  try {
    resolvedPageOverride = buildReportsConfig.resolvePage({
      models: buildReportsConfig.models ?? [],
      page: pageContext,
    });
  } catch (error) {
    logger.warn(
      `Skipped build-time AI report for ${pageId}: siteDevtools.analysis.buildReports.resolvePage threw an error: ${error instanceof Error ? error.message : String(error)}`,
      elapsedSince(resolveStartedAt),
    );
    return null;
  }

  if (
    resolvedPageOverride === false ||
    resolvedPageOverride === null ||
    resolvedPageOverride === undefined
  ) {
    return null;
  }

  const selectedExecutionId =
    resolvedPageOverride.modelId ?? executionPlan.defaultExecutionId;

  if (!selectedExecutionId) {
    logger.warn(
      `Skipped build-time AI report for ${pageId}: no default build report model is available, and resolvePage did not return modelId.`,
      elapsedSince(resolveStartedAt),
    );
    return null;
  }

  const selectedExecution =
    executionPlan.executionById.get(selectedExecutionId);

  if (!selectedExecution) {
    logger.warn(
      resolvedPageOverride.modelId
        ? `Skipped build-time AI report for ${pageId}: resolvePage selected modelId "${resolvedPageOverride.modelId}", but no matching buildReports.models entry could be resolved.`
        : `Skipped build-time AI report for ${pageId}: the default build report model "${selectedExecutionId}" could not be resolved.`,
      elapsedSince(resolveStartedAt),
    );
    return null;
  }

  return {
    cacheConfig: resolveBuildReportCacheConfig({
      cache: mergeBuildReportCacheInput({
        baseCache: buildReportsConfig.cache,
        overrideCache: resolvedPageOverride.cache,
      }),
      cacheDir,
      root,
    }),
    executions: [selectedExecution],
    includeChunks:
      resolvedPageOverride.includeChunks ?? defaultPlan.includeChunks,
    includeModules:
      resolvedPageOverride.includeModules ?? defaultPlan.includeModules,
  };
};

const createBuildReportPagePlans = ({
  buildReportsConfig,
  cacheDir,
  executionPlan,
  logger,
  pageContexts,
  pageMetafiles,
  root,
}: {
  buildReportsConfig: SiteDevToolsAnalysisBuildReportsConfig;
  cacheDir: string;
  executionPlan: BuildReportExecutionPlan;
  logger: ReturnType<typeof getAiBuildReportsLogger>;
  pageContexts?: Record<string, SiteDevToolsAnalysisBuildReportsPageContext>;
  pageMetafiles: Record<string, PageMetafile>;
  root?: string;
}) => {
  const pagePlans: Record<string, BuildReportPagePlan> = {};

  for (const [pageId, pageMetafile] of Object.entries(pageMetafiles)) {
    const pagePlan = resolveBuildReportPagePlan({
      buildReportsConfig,
      cacheDir,
      executionPlan,
      logger,
      pageContext: pageContexts?.[pageId],
      pageId,
      pageMetafile,
      root,
    });

    if (pagePlan) {
      pagePlans[pageId] = pagePlan;
    }
  }

  return pagePlans;
};

const createPageAnalysisTarget = ({
  assetsDir,
  includeChunks,
  includeModules,
  outDir,
  pageId,
  pageMetafile,
}: {
  assetsDir: string;
  includeChunks: boolean;
  includeModules: boolean;
  outDir: string;
  pageId: string;
  pageMetafile: PageMetafile;
}): SiteDevToolsAiAnalysisTarget => {
  const components = pageMetafile.buildMetrics?.components ?? [];
  const aggregatedModules = aggregatePageModules(components);
  const renderInstances = pageMetafile.buildMetrics?.renderInstances ?? [];
  const pageComponentItems = createPageComponentItems({
    assetsDir,
    components,
    includeChunks,
    includeModules,
    outDir,
    pageMetafile,
  });
  const resolvedPageClientChunkFile = resolvePageClientChunkPublicPath({
    assetsDir,
    outDir,
    pageId,
    pageMetafile,
  });
  const pageRenderOrderItems = createPageRenderOrderItems({
    pageClientChunkFile: resolvedPageClientChunkFile,
    pageMetafile,
  });
  const pageSpaSyncComponentItems = createPageSpaSyncComponentItems({
    pageClientChunkFile: resolvedPageClientChunkFile,
    pageMetafile,
  });
  const pageSpaSyncSummaryItems = createPageSpaSyncSummaryItems({
    pageClientChunkFile: resolvedPageClientChunkFile,
    pageMetafile,
  });
  const usedRenderDirectives = [
    ...new Set([
      ...pageRenderOrderItems.map((item) => item.renderDirective),
      ...pageComponentItems.flatMap((item) => item.renderDirectives),
    ]),
  ];
  const aggregatedFiles = collectPageRuntimeFiles({
    assetsDir,
    outDir,
    pageMetafile,
    seedFiles: aggregatePageFiles(components),
  });
  const estimatedAssetBytes = aggregatedFiles
    .filter((fileMetric) => fileMetric.type === 'asset')
    .reduce((sum, fileMetric) => sum + fileMetric.bytes, 0);
  const estimatedCssBytes = aggregatedFiles
    .filter((fileMetric) => fileMetric.type === 'css')
    .reduce((sum, fileMetric) => sum + fileMetric.bytes, 0);
  const estimatedJsBytes = aggregatedFiles
    .filter((fileMetric) => fileMetric.type === 'js')
    .reduce((sum, fileMetric) => sum + fileMetric.bytes, 0);
  const estimatedTotalBytes =
    estimatedAssetBytes + estimatedCssBytes + estimatedJsBytes;

  return {
    artifactKind: 'page-build',
    artifactLabel: pageId,
    bytes: estimatedTotalBytes,
    content: `Build overview for ${pageId}`,
    context: {
      artifactHeaderItems: [
        {
          label: 'Path',
          value: pageId,
        },
        {
          label: 'Components',
          value: String(pageComponentItems.length),
        },
        {
          label: 'Render Instances',
          value: String(renderInstances.length),
        },
        ...(usedRenderDirectives.length > 0
          ? [
              {
                label: 'Used Directives',
                value: usedRenderDirectives.join(', '),
              },
            ]
          : []),
        {
          label: 'Chunk Resources',
          value: String(aggregatedFiles.length),
        },
        {
          label: 'Module Sources',
          value: String(aggregatedModules.length),
        },
        {
          label: 'Composition Detail',
          value: getPageCompositionDetailLabel({
            includeChunks,
            includeModules,
          }),
        },
        ...(components.length === 0
          ? [
              {
                label: 'Module Preloads',
                value: String(pageMetafile.modulePreloads.length),
              },
              {
                label: 'CSS Bundles',
                value: String(pageMetafile.cssBundlePaths.length),
              },
              {
                label: 'Embedded HTML',
                value:
                  formatSiteDevToolsAiBytes(
                    pageMetafile.buildMetrics?.spaSyncEffects
                      ?.totalEmbeddedHtmlBytes,
                  ) || '0 B',
              },
            ]
          : []),
      ],
      bundleSummaryItems: createSiteDevToolsAiBundleSummaryItems({
        estimatedAssetBytes,
        estimatedCssBytes,
        estimatedJsBytes,
        estimatedTotalBytes,
      }),
      chunkResourceItems: createSiteDevToolsAiChunkResourceItems({
        files: aggregatedFiles,
        modules: aggregatedModules,
        totalEstimatedBytes: estimatedTotalBytes,
      }),
      ...(pageComponentItems.length === 1
        ? {
            componentName: pageComponentItems[0].componentName,
          }
        : {}),
      moduleItems: createPageModuleItems({
        assetsDir,
        modules: aggregatedModules,
        outDir,
      }),
      pageComponentItems,
      pageRenderOrderItems,
      pageSpaSyncComponentItems,
      pageSpaSyncSummaryItems,
      pageId,
      renderId: null,
    },
    displayPath: pageId,
    language: 'text',
  };
};

// eslint-disable-next-line max-lines-per-function -- AI build report orchestration requires coordinating multiple providers, caching, execution planning, and result aggregation
export const generateSiteDevToolsAiBuildReports = async ({
  aiConfig,
  assetsDir,
  cacheDir,
  loggerScopeId,
  outDir,
  pageContexts,
  pageMetafiles,
  root,
  wrapBaseUrl,
  dependencies,
}: {
  aiConfig: SiteDevToolsAiConfig;
  assetsDir: string;
  cacheDir: string;
  dependencies?: BuildReportDependencies;
  loggerScopeId: string;
  outDir: string;
  pageContexts?: Record<string, SiteDevToolsAnalysisBuildReportsPageContext>;
  pageMetafiles: Record<string, PageMetafile>;
  root?: string;
  wrapBaseUrl: (value: string) => string;
}): Promise<GenerateSiteDevToolsAiBuildReportsResult> => {
  const generationStartedAt = Date.now();
  const buildReportsConfig = aiConfig?.buildReports;
  const Logger = getAiBuildReportsLogger(loggerScopeId);

  if (!buildReportsConfig) {
    return {
      executionCount: 0,
      generatedReportCount: 0,
      providers: [],
      reusedReportCount: 0,
      skippedReason: 'Build-time AI reports are disabled.',
    };
  }

  const resolveCapabilitiesImpl =
    dependencies?.resolveCapabilities || resolveSiteDevToolsAiCapabilities;
  const analyzeTargetImpl =
    dependencies?.analyzeTarget || analyzeSiteDevToolsAiTarget;
  const {
    executions,
    skippedReason: executionPlanSkippedReason,
    warningMessages: executionPlanWarningMessages,
    ...executionPlan
  } = createBuildReportExecutions(aiConfig);

  if (executions.length === 0) {
    for (const warningMessage of executionPlanWarningMessages) {
      Logger.warn(warningMessage, elapsedSince(generationStartedAt));
    }

    if (executionPlanSkippedReason) {
      Logger.info(
        executionPlanSkippedReason,
        elapsedSince(generationStartedAt),
      );
    }

    return {
      executionCount: 0,
      generatedReportCount: 0,
      providers: [],
      reusedReportCount: 0,
      skippedReason: executionPlanSkippedReason,
    };
  }

  for (const warningMessage of executionPlanWarningMessages) {
    Logger.warn(warningMessage, elapsedSince(generationStartedAt));
  }

  const pagePlans = createBuildReportPagePlans({
    buildReportsConfig,
    cacheDir,
    executionPlan: {
      ...executionPlan,
      executions,
      warningMessages: executionPlanWarningMessages,
    },
    logger: Logger,
    pageContexts,
    pageMetafiles,
    root,
  });
  const uniqueCacheDirs = [
    ...new Set(
      Object.values(pagePlans)
        .map((pagePlan) => pagePlan.cacheConfig?.dir)
        .filter((cachePath): cachePath is string => Boolean(cachePath)),
    ),
  ];
  const sanitizeOptions: SiteDevToolsAiSanitizeOptions = {
    anchorPaths: [
      ...uniqueCacheDirs,
      root ? join(root, '.vitepress', 'config.ts') : undefined,
    ],
  };
  let executionAvailability: Awaited<
    ReturnType<typeof resolveAvailableBuildReportExecutions>
  > | null = null;
  let executionAvailabilityPromise: Promise<
    Awaited<ReturnType<typeof resolveAvailableBuildReportExecutions>>
  > | null = null;
  const skippedReasons = new Set<string>();
  const generatedReportReferences = new Map<
    string,
    SiteDevToolsAiBuildReportReference
  >();
  const pendingReportReferences = new Map<
    string,
    Promise<SiteDevToolsAiBuildReportReference | null>
  >();
  let generatedReportCount = 0;
  let reusedReportCount = 0;

  for (const pageCacheDir of uniqueCacheDirs) {
    sanitizeBuildReportCacheDirectory(pageCacheDir, sanitizeOptions);
  }

  if (executionPlanSkippedReason) {
    skippedReasons.add(executionPlanSkippedReason);
  }

  if (Object.keys(pagePlans).length === 0) {
    skippedReasons.add('No eligible pages resolved for build-time AI reports.');
  }

  const ensureExecutionAvailability = async () => {
    if (executionAvailability) {
      return executionAvailability;
    }

    if (!executionAvailabilityPromise) {
      executionAvailabilityPromise = resolveAvailableBuildReportExecutions({
        executions,
        resolveCapabilitiesImpl,
      })
        .then((resolvedExecutionAvailability) => {
          executionAvailability = resolvedExecutionAvailability;

          if (resolvedExecutionAvailability.skippedReason) {
            skippedReasons.add(resolvedExecutionAvailability.skippedReason);
          }

          return resolvedExecutionAvailability;
        })
        .catch((error) => {
          executionAvailabilityPromise = null;
          throw error;
        });
    }

    return executionAvailabilityPromise;
  };

  const getOrCreateReportReference = async ({
    artifactKey,
    cacheConfig,
    execution,
    target,
  }: {
    artifactKey: string;
    cacheConfig: BuildReportCacheConfig | null;
    execution: BuildReportExecution;
    target: SiteDevToolsAiAnalysisTarget;
  }) => {
    const reportReferenceStartedAt = Date.now();
    const cachedReference = generatedReportReferences.get(artifactKey);

    if (cachedReference) {
      return cachedReference;
    }

    const pendingReportReference = pendingReportReferences.get(artifactKey);

    if (pendingReportReference) {
      return pendingReportReference;
    }

    const pendingReportTask = (async () => {
      const sanitizedTarget = sanitizeSiteDevToolsAiAnalysisTarget(
        target,
        sanitizeOptions,
      );
      const prompt = buildSiteDevToolsAiAnalysisPrompt(
        sanitizedTarget,
        sanitizeOptions,
      );
      const providerConfigSnapshot = getBuildReportProviderConfigSnapshot(
        execution.config,
        execution.provider,
      );
      const cacheIdentity = createBuildReportCacheIdentity({
        prompt,
        provider: execution.provider,
        providerConfig: providerConfigSnapshot,
      });
      const cacheKey = getBuildReportCacheKey({
        prompt,
        provider: execution.provider,
        providerConfig: providerConfigSnapshot,
      });
      const cacheFilePath = cacheConfig
        ? getBuildReportCacheFilePath({
            artifactKey,
            cacheDir: cacheConfig.dir,
            target: sanitizedTarget,
          })
        : null;
      const cachedEntry = cacheFilePath
        ? readBuildReportCacheEntry(cacheFilePath, sanitizeOptions)
        : null;
      const cacheKeyMatches = cachedEntry?.cacheKey === cacheKey;
      const cacheInvalidationReason =
        cachedEntry && !cacheKeyMatches
          ? getBuildReportCacheInvalidationReason({
              cacheIdentity,
              cachedEntry,
              prompt,
            })
          : null;
      const cachedReport =
        cachedEntry && (cacheConfig?.strategy === 'fallback' || cacheKeyMatches)
          ? cachedEntry.report
          : null;

      if (cacheInvalidationReason) {
        Logger.info(
          cacheConfig?.strategy === 'fallback'
            ? `Fallback build-time AI report cache reuse for ${sanitizedTarget.displayPath} (${execution.reportLabel}): ${cacheInvalidationReason}. Reusing the stale cached report because strategy=fallback.`
            : `Exact build-time AI report cache miss for ${sanitizedTarget.displayPath} (${execution.reportLabel}): ${cacheInvalidationReason}. Regenerating the report.`,
          elapsedSince(reportReferenceStartedAt),
        );
      }

      if (cachedReport) {
        const resolvedCachedReport = applyBuildReportExecutionMetadata({
          execution,
          report: cachedReport,
        });

        if (cacheFilePath) {
          writeBuildReportCacheEntry({
            cacheIdentity,
            cacheKey: cachedEntry?.cacheKey ?? null,
            filePath: cacheFilePath,
            report: resolvedCachedReport,
            sanitizeOptions,
          });
        }

        const reportFile = writeBuildReportAsset({
          assetsDir,
          outDir,
          provider: execution.provider,
          report: resolvedCachedReport,
          sanitizeOptions,
          wrapBaseUrl,
        });
        const reportReference = {
          detail: resolvedCachedReport.detail,
          generatedAt: resolvedCachedReport.generatedAt,
          model: resolvedCachedReport.model,
          provider: execution.provider,
          providerId: execution.providerId,
          providerLabel: execution.providerLabel,
          reportFile,
          reportId: resolvedCachedReport.reportId,
          reportLabel: resolvedCachedReport.reportLabel,
        };

        generatedReportReferences.set(artifactKey, reportReference);
        reusedReportCount += 1;
        return reportReference;
      }

      const { availableExecutionIds } = await ensureExecutionAvailability();

      if (!availableExecutionIds.has(execution.reportId)) {
        return null;
      }

      const generatedAt = new Date().toISOString();
      const result = await analyzeTargetImpl({
        config: execution.config,
        loggerScopeId,
        provider: execution.provider,
        target: sanitizedTarget,
      });
      const report: SiteDevToolsAiBuildReport = {
        detail: result.detail,
        generatedAt,
        model: result.model,
        prompt,
        provider: execution.provider,
        providerId: execution.providerId,
        providerLabel: execution.providerLabel,
        reportId: execution.reportId,
        reportLabel: execution.reportLabel,
        result: result.result,
        target: sanitizedTarget,
      };
      if (cacheFilePath) {
        writeBuildReportCacheEntry({
          cacheIdentity,
          cacheKey,
          filePath: cacheFilePath,
          report,
          sanitizeOptions,
        });
      }
      const reportFile = writeBuildReportAsset({
        assetsDir,
        outDir,
        provider: execution.provider,
        report,
        sanitizeOptions,
        wrapBaseUrl,
      });
      const reportReference = {
        detail: result.detail,
        generatedAt,
        model: result.model,
        provider: execution.provider,
        providerId: execution.providerId,
        providerLabel: execution.providerLabel,
        reportFile,
        reportId: execution.reportId,
        reportLabel: execution.reportLabel,
      };

      generatedReportReferences.set(artifactKey, reportReference);
      generatedReportCount += 1;
      return reportReference;
    })();

    pendingReportReferences.set(artifactKey, pendingReportTask);

    try {
      return await pendingReportTask;
    } finally {
      pendingReportReferences.delete(artifactKey);
    }
  };

  if (Object.keys(pagePlans).length > 1) {
    Logger.info(
      `Dispatching build-time AI report generation in parallel for ${Object.keys(pagePlans).length} eligible pages across ${executions.length} execution${executions.length === 1 ? '' : 's'}.`,
      elapsedSince(generationStartedAt),
    );
  }

  await collectBuildReportReferencesForPageMetafiles({
    assetsDir,
    createPageAnalysisTarget,
    getOrCreateReportReference,
    logger: Logger,
    outDir,
    pageMetafiles,
    pagePlans,
  });

  if (generatedReportCount > 0 || reusedReportCount > 0) {
    Logger.info(
      `Build-time AI reports across ${executions.length} execution${executions.length === 1 ? '' : 's'}: generated ${generatedReportCount}, reused ${reusedReportCount}.`,
      elapsedSince(generationStartedAt),
    );
  }

  return {
    executionCount: executions.length,
    generatedReportCount,
    providers: [...new Set(executions.map((execution) => execution.provider))],
    reusedReportCount,
    ...(skippedReasons.size > 0
      ? {
          skippedReason: [...skippedReasons].join(' '),
        }
      : {}),
  };
};
