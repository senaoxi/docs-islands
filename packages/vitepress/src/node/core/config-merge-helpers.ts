import type {
  SiteDevToolsAnalysisBuildReportsConfig,
  SiteDevToolsAnalysisUserConfig,
} from '#dep-types/utils';

/**
 * Merge provider configurations from base and override.
 * Override takes precedence for the provider list.
 */
export function mergeProviderConfig(
  base: SiteDevToolsAnalysisUserConfig | undefined,
  override: SiteDevToolsAnalysisUserConfig | undefined,
): SiteDevToolsAnalysisUserConfig['providers'] | undefined {
  if (!base?.providers && !override?.providers) {
    return undefined;
  }

  return override?.providers ?? base?.providers;
}

/**
 * Merge buildReports configurations from base and override.
 * Override takes precedence.
 */
export function mergeBuildReportsConfig(
  base: SiteDevToolsAnalysisUserConfig | undefined,
  override: SiteDevToolsAnalysisUserConfig | undefined,
): SiteDevToolsAnalysisBuildReportsConfig | undefined {
  if (!base?.buildReports && !override?.buildReports) {
    return undefined;
  }

  return {
    ...base?.buildReports,
    ...override?.buildReports,
  };
}

/**
 * Merge analysis configurations from base and override.
 * Uses helper functions to merge nested providers and buildReports.
 */
export function mergeAnalysisConfig(
  base: SiteDevToolsAnalysisUserConfig | undefined,
  override: SiteDevToolsAnalysisUserConfig | undefined,
): SiteDevToolsAnalysisUserConfig | undefined {
  if (!base && !override) {
    return undefined;
  }

  const mergedProviders = mergeProviderConfig(base, override);
  const mergedBuildReports = mergeBuildReportsConfig(base, override);

  return {
    ...base,
    ...override,
    ...(mergedProviders ? { providers: mergedProviders } : {}),
    ...(mergedBuildReports ? { buildReports: mergedBuildReports } : {}),
  };
}
