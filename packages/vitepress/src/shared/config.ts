import type {
  ConfigType,
  SiteDevToolsAnalysisBuildReportModelConfig,
  SiteDevToolsAnalysisBuildReportsCacheConfig,
  SiteDevToolsAnalysisUserConfig,
  SiteDevToolsUserConfig,
} from '#dep-types/utils';
import { getProjectRoot, slash } from '@docs-islands/utils/path';
import { join, resolve } from 'pathe';
import { normalizePath } from 'vite';
import type { DefaultTheme, UserConfig } from 'vitepress';

type SiteDevToolsBuildReportsInput =
  SiteDevToolsAnalysisUserConfig['buildReports'];
const SITE_DEVTOOLS_AI_BUILD_REPORTS_DEFAULT_CACHE_DIR =
  '.vitepress/cache/site-devtools-reports';

type SiteDevToolsAnalysisDoubaoBuildReportModelConfig =
  SiteDevToolsAnalysisBuildReportModelConfig & {
    thinking?: boolean;
  };

const isDoubaoBuildReportModelConfig = (
  model: SiteDevToolsAnalysisBuildReportModelConfig,
): model is SiteDevToolsAnalysisDoubaoBuildReportModelConfig =>
  model.providerRef.provider === 'doubao';

const normalizeBuildReportModels = (
  buildReports: SiteDevToolsBuildReportsInput,
): SiteDevToolsAnalysisBuildReportModelConfig[] | undefined => {
  if (!buildReports) {
    return undefined;
  }

  return Array.isArray(buildReports.models)
    ? (buildReports.models.filter(Boolean).map((model) =>
        isDoubaoBuildReportModelConfig(model)
          ? {
              ...model,
              thinking: model.thinking ?? false,
            }
          : model,
      ) as SiteDevToolsAnalysisBuildReportModelConfig[])
    : undefined;
};

const normalizeAnalysisProviders = (
  providers: SiteDevToolsAnalysisUserConfig['providers'],
) => {
  const normalizedProviders = {
    ...(Array.isArray(providers?.claude)
      ? {
          claude: providers.claude.filter(Boolean).map((provider) => ({
            anthropicVersion: provider.anthropicVersion,
            apiKey: provider.apiKey,
            baseUrl: provider.baseUrl,
            default: provider.default === true,
            id: provider.id,
            label: provider.label,
            timeoutMs: provider.timeoutMs,
          })),
        }
      : {}),
    ...(Array.isArray(providers?.doubao)
      ? {
          doubao: providers.doubao.filter(Boolean).map((provider) => ({
            apiKey: provider.apiKey,
            baseUrl: provider.baseUrl,
            default: provider.default === true,
            id: provider.id,
            label: provider.label,
            timeoutMs: provider.timeoutMs,
          })),
        }
      : {}),
  };

  return providers && Object.keys(normalizedProviders).length > 0
    ? normalizedProviders
    : undefined;
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

const normalizeBuildReportsConfig = (
  buildReports: SiteDevToolsBuildReportsInput,
  root: string,
) => {
  const normalizedModels = buildReports
    ? normalizeBuildReportModels(buildReports)
    : undefined;

  return buildReports
    ? ({
        cache: normalizeBuildReportCache(buildReports.cache, root),
        includeChunks: buildReports.includeChunks ?? false,
        includeModules: buildReports.includeModules ?? false,
        ...(typeof buildReports.resolvePage === 'function'
          ? {
              resolvePage: buildReports.resolvePage,
            }
          : {}),
        ...(normalizedModels
          ? {
              models: normalizedModels,
            }
          : {}),
      } satisfies NonNullable<SiteDevToolsAnalysisUserConfig['buildReports']>)
    : undefined;
};

const normalizeSiteDevToolsAnalysisConfig = (
  siteDevtools: SiteDevToolsUserConfig | undefined,
  root: string,
): SiteDevToolsAnalysisUserConfig | undefined => {
  const analysisConfig = siteDevtools?.analysis;

  if (!analysisConfig) {
    return undefined;
  }

  const normalizedAnalysis: SiteDevToolsAnalysisUserConfig = {};

  const normalizedProviders = normalizeAnalysisProviders(
    analysisConfig.providers,
  );

  if (normalizedProviders) {
    normalizedAnalysis.providers = normalizedProviders;
  }

  const normalizedBuildReports = normalizeBuildReportsConfig(
    analysisConfig.buildReports,
    root,
  );

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
    rawVitepressConfig.siteDevtools,
    root,
  );
  const siteDevtools: SiteDevToolsUserConfig = normalizedSiteDevToolsAnalysis
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
