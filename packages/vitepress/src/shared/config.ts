import type {
  ConfigType,
  SiteDevToolsAnalysisBuildReportDoubaoModelConfig,
  SiteDevToolsAnalysisBuildReportModelConfig,
  SiteDevToolsAnalysisBuildReportsCacheConfig,
  SiteDevToolsAnalysisBuildReportsPageOverride,
  SiteDevToolsAnalysisProvider,
  SiteDevToolsAnalysisProviderConfig,
  SiteDevToolsAnalysisResolvedBuildReportModelConfig,
  SiteDevToolsAnalysisResolvedBuildReportsConfig,
  SiteDevToolsAnalysisResolvedUserConfig,
  SiteDevToolsAnalysisUserConfig,
  SiteDevToolsResolvedUserConfig,
  SiteDevToolsUserConfig,
} from '#dep-types/utils';
import { getProjectRoot, slash } from '@docs-islands/utils/path';
import { createHash } from 'node:crypto';
import { join, resolve } from 'pathe';
import { normalizePath } from 'vite';
import type { DefaultTheme, UserConfig } from 'vitepress';
import {
  getSiteDevToolsAnalysisModelMetadata,
  getSiteDevToolsAnalysisProviderMetadata,
  isSiteDevToolsAnalysisBuildReportModelConfig,
  isSiteDevToolsAnalysisProviderConfig,
} from './site-devtools-models';

type SiteDevToolsBuildReportsInput =
  SiteDevToolsAnalysisUserConfig['buildReports'];
const SITE_DEVTOOLS_AI_BUILD_REPORTS_DEFAULT_CACHE_DIR =
  '.vitepress/cache/site-devtools-reports';
const UNKNOWN_BUILD_REPORT_MODEL_ID =
  '__docs_islands_unknown_build_report_model__';

const createStableConfigId = (prefix: string, payload: unknown) =>
  `${prefix}-${createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex')
    .slice(0, 12)}`;

const pickProviderConfigPayload = (
  provider: SiteDevToolsAnalysisProvider,
  providerConfig: SiteDevToolsAnalysisProviderConfig,
  providerIndex: number,
) => ({
  apiKey: providerConfig.apiKey ? '<configured>' : null,
  baseUrl: providerConfig.baseUrl ?? null,
  provider,
  providerIndex,
  timeoutMs: providerConfig.timeoutMs ?? null,
});

const pickModelConfigPayload = (
  modelConfig: SiteDevToolsAnalysisBuildReportModelConfig,
  provider: SiteDevToolsAnalysisProvider,
  providerKey: string,
  modelIndex: number,
) => ({
  maxTokens: modelConfig.maxTokens ?? null,
  model: modelConfig.model,
  modelIndex,
  provider,
  providerKey,
  temperature: modelConfig.temperature ?? null,
  ...(provider === 'doubao'
    ? {
        thinking:
          (modelConfig as SiteDevToolsAnalysisBuildReportDoubaoModelConfig)
            .thinking ?? false,
      }
    : {}),
});

const normalizeBuildReportModels = ({
  buildReports,
  resolvedProviderKeyBySourceKey,
}: {
  buildReports: SiteDevToolsBuildReportsInput;
  resolvedProviderKeyBySourceKey: Map<string, string>;
}): {
  modelConfigIdBySource: WeakMap<object, string>;
  models?: SiteDevToolsAnalysisResolvedBuildReportModelConfig[];
  sourceModels: SiteDevToolsAnalysisBuildReportModelConfig[];
} => {
  const modelConfigIdBySource = new WeakMap<object, string>();

  if (!buildReports) {
    return {
      modelConfigIdBySource,
      sourceModels: [],
    };
  }

  const sourceModels = Array.isArray(buildReports.models)
    ? buildReports.models.filter((model) =>
        isSiteDevToolsAnalysisBuildReportModelConfig(model),
      )
    : [];
  const models = sourceModels.map((modelConfig, modelIndex) => {
    const modelMetadata = getSiteDevToolsAnalysisModelMetadata(modelConfig);
    const providerKey =
      resolvedProviderKeyBySourceKey.get(modelMetadata.providerKey) ??
      createStableConfigId('missing-provider', {
        provider: modelMetadata.provider,
        providerKey: modelMetadata.providerKey,
      });
    const id = createStableConfigId(
      `${modelMetadata.provider}-report-model`,
      pickModelConfigPayload(
        modelConfig,
        modelMetadata.provider,
        providerKey,
        modelIndex,
      ),
    );
    const normalizedModel = {
      default: modelConfig.default === true,
      id,
      label: modelConfig.label,
      maxTokens: modelConfig.maxTokens,
      model: modelConfig.model,
      provider: modelMetadata.provider,
      providerKey,
      temperature: modelConfig.temperature,
      ...(modelMetadata.provider === 'doubao'
        ? {
            thinking:
              (modelConfig as SiteDevToolsAnalysisBuildReportDoubaoModelConfig)
                .thinking ?? false,
          }
        : {}),
    } satisfies SiteDevToolsAnalysisResolvedBuildReportModelConfig;

    modelConfigIdBySource.set(modelConfig, id);

    return normalizedModel;
  });

  return {
    modelConfigIdBySource,
    models,
    sourceModels,
  };
};

const normalizeAnalysisProviders = (
  providers: SiteDevToolsAnalysisUserConfig['providers'],
) => {
  const normalizedProviders: NonNullable<
    SiteDevToolsAnalysisResolvedUserConfig['providers']
  > = {};
  const resolvedProviderKeyBySourceKey = new Map<string, string>();

  if (!Array.isArray(providers)) {
    return {
      resolvedProviderKeyBySourceKey,
      providers: undefined,
    };
  }

  for (const [providerIndex, providerConfig] of providers
    .filter((provider) => isSiteDevToolsAnalysisProviderConfig(provider))
    .entries()) {
    const providerMetadata =
      getSiteDevToolsAnalysisProviderMetadata(providerConfig);
    const providerKey = createStableConfigId(
      `${providerMetadata.provider}-provider`,
      pickProviderConfigPayload(
        providerMetadata.provider,
        providerConfig,
        providerIndex,
      ),
    );
    const normalizedProvider = {
      apiKey: providerConfig.apiKey,
      baseUrl: providerConfig.baseUrl,
      default: false,
      key: providerKey,
      label: providerConfig.label,
      timeoutMs: providerConfig.timeoutMs,
    };

    resolvedProviderKeyBySourceKey.set(
      providerMetadata.providerKey,
      providerKey,
    );

    if (providerMetadata.provider === 'claude') {
      normalizedProviders.claude = [
        ...(normalizedProviders.claude ?? []),
        normalizedProvider,
      ];
      continue;
    }

    normalizedProviders.doubao = [
      ...(normalizedProviders.doubao ?? []),
      normalizedProvider,
    ];
  }

  return {
    resolvedProviderKeyBySourceKey,
    providers:
      Object.keys(normalizedProviders).length > 0
        ? normalizedProviders
        : undefined,
  };
};

const normalizeBuildReportCache = (
  cache: NonNullable<SiteDevToolsBuildReportsInput>['cache'],
  root: string,
): SiteDevToolsAnalysisBuildReportsCacheConfig => {
  if (cache === false) {
    return false;
  }

  const cacheOptions =
    typeof cache === 'object' && cache !== null ? cache : undefined;
  const cacheDir =
    typeof cacheOptions?.dir === 'string' && cacheOptions.dir.trim()
      ? cacheOptions.dir
      : SITE_DEVTOOLS_AI_BUILD_REPORTS_DEFAULT_CACHE_DIR;
  const strategy = cacheOptions?.strategy === 'fallback' ? 'fallback' : 'exact';

  return {
    dir: normalizePath(resolve(root, cacheDir)),
    strategy,
  };
};

const normalizeResolvePage = ({
  buildReports,
  modelConfigIdBySource,
  sourceModels,
}: {
  buildReports: SiteDevToolsBuildReportsInput;
  modelConfigIdBySource: WeakMap<object, string>;
  sourceModels: SiteDevToolsAnalysisBuildReportModelConfig[];
}): SiteDevToolsAnalysisResolvedBuildReportsConfig['resolvePage'] => {
  if (!buildReports || typeof buildReports.resolvePage !== 'function') {
    return undefined;
  }

  return ((context) => {
    const resolvedPage = buildReports.resolvePage?.({
      models: sourceModels,
      page: context.page,
    });

    if (
      resolvedPage === false ||
      resolvedPage === null ||
      resolvedPage === undefined
    ) {
      return resolvedPage;
    }

    const { model, ...pageOverride } =
      resolvedPage as SiteDevToolsAnalysisBuildReportsPageOverride;

    if (!model) {
      return pageOverride;
    }

    const selectedModelId = modelConfigIdBySource.get(model);

    return {
      ...pageOverride,
      ...(selectedModelId
        ? { modelId: selectedModelId }
        : {
            invalidModelSelection: true,
            modelId: UNKNOWN_BUILD_REPORT_MODEL_ID,
          }),
    };
  }) satisfies NonNullable<
    SiteDevToolsAnalysisResolvedBuildReportsConfig['resolvePage']
  >;
};

const normalizeBuildReportsConfig = ({
  buildReports,
  resolvedProviderKeyBySourceKey,
  root,
}: {
  buildReports: SiteDevToolsBuildReportsInput;
  resolvedProviderKeyBySourceKey: Map<string, string>;
  root: string;
}) => {
  const {
    modelConfigIdBySource,
    models: normalizedModels,
    sourceModels,
  } = normalizeBuildReportModels({
    buildReports,
    resolvedProviderKeyBySourceKey,
  });
  const normalizedResolvePage = normalizeResolvePage({
    buildReports,
    modelConfigIdBySource,
    sourceModels,
  });

  return buildReports
    ? ({
        cache: normalizeBuildReportCache(buildReports.cache, root),
        includeChunks: buildReports.includeChunks ?? false,
        includeModules: buildReports.includeModules ?? false,
        ...(normalizedResolvePage
          ? {
              resolvePage: normalizedResolvePage,
            }
          : {}),
        ...(normalizedModels && normalizedModels.length > 0
          ? {
              models: normalizedModels,
            }
          : {}),
      } satisfies NonNullable<
        SiteDevToolsAnalysisResolvedUserConfig['buildReports']
      >)
    : undefined;
};

const normalizeSiteDevToolsAnalysisConfig = (
  siteDevtools: SiteDevToolsUserConfig | undefined,
  root: string,
): SiteDevToolsAnalysisResolvedUserConfig | undefined => {
  const analysisConfig = siteDevtools?.analysis;

  if (!analysisConfig) {
    return undefined;
  }

  const normalizedAnalysis: SiteDevToolsAnalysisResolvedUserConfig = {};

  const { resolvedProviderKeyBySourceKey, providers: normalizedProviders } =
    normalizeAnalysisProviders(analysisConfig.providers);

  if (normalizedProviders) {
    normalizedAnalysis.providers = normalizedProviders;
  }

  const normalizedBuildReports = normalizeBuildReportsConfig({
    buildReports: analysisConfig.buildReports,
    resolvedProviderKeyBySourceKey,
    root,
  });

  if (normalizedBuildReports) {
    normalizedAnalysis.buildReports = normalizedBuildReports;
  }

  return normalizedAnalysis;
};

export const resolveConfig = (
  rawVitepressConfig: UserConfig<DefaultTheme.Config>,
): ConfigType => {
  const vitepressResolve = (root: string, file: string) =>
    normalizePath(resolve(root, `.vitepress`, file));
  const root = normalizePath(resolve(getProjectRoot()));
  const assetsDir = rawVitepressConfig.assetsDir
    ? slash(rawVitepressConfig.assetsDir).replaceAll(/^\.?\/|\/$/g, '')
    : 'assets';
  const mpa = rawVitepressConfig.mpa ?? false;
  const base = rawVitepressConfig.base
    ? rawVitepressConfig.base.replace(/([^/])$/, '$1/')
    : '/';
  const srcDir = normalizePath(resolve(root, rawVitepressConfig.srcDir || '.'));
  const publicDir = resolve(srcDir, 'public');
  const outDir = rawVitepressConfig.outDir
    ? normalizePath(resolve(root, rawVitepressConfig.outDir))
    : vitepressResolve(root, 'dist');
  const cacheDir = rawVitepressConfig.cacheDir
    ? normalizePath(resolve(root, rawVitepressConfig.cacheDir))
    : vitepressResolve(root, 'cache');
  const cleanUrls = rawVitepressConfig.cleanUrls ?? false;
  const normalizedSiteDevToolsAnalysis = normalizeSiteDevToolsAnalysisConfig(
    rawVitepressConfig.siteDevtools as SiteDevToolsUserConfig | undefined,
    root,
  );
  const siteDevtools: SiteDevToolsResolvedUserConfig =
    normalizedSiteDevToolsAnalysis
      ? {
          analysis: normalizedSiteDevToolsAnalysis,
        }
      : {};

  const config: ConfigType = {
    root,
    outDir,
    base,
    srcDir,
    assetsDir,
    mpa,
    publicDir,
    cacheDir,
    cleanUrls,
    siteDevtools,
    wrapBaseUrl: (path: string) => {
      return path.startsWith('http') ? path : join('/', base, path);
    },
  };

  return config;
};
