import type {
  SiteDevToolsAnalysisBuildReportClaudeModelConfig,
  SiteDevToolsAnalysisBuildReportClaudeModelInput,
  SiteDevToolsAnalysisBuildReportDoubaoModelConfig,
  SiteDevToolsAnalysisBuildReportDoubaoModelInput,
  SiteDevToolsAnalysisBuildReportModelConfig,
  SiteDevToolsAnalysisClaudeProviderConfig,
  SiteDevToolsAnalysisClaudeProviderInput,
  SiteDevToolsAnalysisDoubaoProviderConfig,
  SiteDevToolsAnalysisDoubaoProviderInput,
  SiteDevToolsAnalysisProvider,
  SiteDevToolsAnalysisProviderConfig,
} from '#dep-types/utils';

const SITE_DEVTOOLS_ANALYSIS_PROVIDER_BRAND = Symbol.for(
  'docs-islands.vitepress.site-devtools.analysis.provider',
);
const SITE_DEVTOOLS_ANALYSIS_PROVIDER_TYPE = Symbol.for(
  'docs-islands.vitepress.site-devtools.analysis.provider.type',
);
const SITE_DEVTOOLS_ANALYSIS_PROVIDER_KEY = Symbol.for(
  'docs-islands.vitepress.site-devtools.analysis.provider.key',
);
const SITE_DEVTOOLS_ANALYSIS_MODEL_BRAND = Symbol.for(
  'docs-islands.vitepress.site-devtools.analysis.model',
);
const SITE_DEVTOOLS_ANALYSIS_MODEL_PROVIDER = Symbol.for(
  'docs-islands.vitepress.site-devtools.analysis.model.provider',
);
const SITE_DEVTOOLS_ANALYSIS_MODEL_PROVIDER_KEY = Symbol.for(
  'docs-islands.vitepress.site-devtools.analysis.model.provider.key',
);

let providerKeyCounter = 0;

interface SiteDevToolsAnalysisProviderMetadata {
  provider: SiteDevToolsAnalysisProvider;
  providerKey: string;
}

interface SiteDevToolsAnalysisModelMetadata {
  provider: SiteDevToolsAnalysisProvider;
  providerKey: string;
}

type SiteDevToolsAnalysisProviderInputByType<
  Provider extends SiteDevToolsAnalysisProvider,
> = Provider extends 'claude'
  ? SiteDevToolsAnalysisClaudeProviderInput
  : SiteDevToolsAnalysisDoubaoProviderInput;

type SiteDevToolsAnalysisProviderConfigByType<
  Provider extends SiteDevToolsAnalysisProvider,
> = Provider extends 'claude'
  ? SiteDevToolsAnalysisClaudeProviderConfig
  : SiteDevToolsAnalysisDoubaoProviderConfig;

type SiteDevToolsAnalysisModelInputByType<
  Provider extends SiteDevToolsAnalysisProvider,
> = Provider extends 'claude'
  ? SiteDevToolsAnalysisBuildReportClaudeModelInput
  : SiteDevToolsAnalysisBuildReportDoubaoModelInput;

type SiteDevToolsAnalysisModelConfigByType<
  Provider extends SiteDevToolsAnalysisProvider,
> = Provider extends 'claude'
  ? SiteDevToolsAnalysisBuildReportClaudeModelConfig
  : SiteDevToolsAnalysisBuildReportDoubaoModelConfig;

const createProviderKey = (provider: SiteDevToolsAnalysisProvider) => {
  providerKeyCounter += 1;
  return `${provider}:${providerKeyCounter}`;
};

const getProviderMetadata = (
  value: unknown,
): SiteDevToolsAnalysisProviderMetadata | undefined => {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const record = value as Record<symbol, unknown>;

  if (record[SITE_DEVTOOLS_ANALYSIS_PROVIDER_BRAND] !== true) {
    return undefined;
  }

  const provider = record[SITE_DEVTOOLS_ANALYSIS_PROVIDER_TYPE];
  const providerKey = record[SITE_DEVTOOLS_ANALYSIS_PROVIDER_KEY];

  return (provider === 'claude' || provider === 'doubao') &&
    typeof providerKey === 'string'
    ? {
        provider,
        providerKey,
      }
    : undefined;
};

const getModelMetadata = (
  value: unknown,
): SiteDevToolsAnalysisModelMetadata | undefined => {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const record = value as Record<symbol, unknown>;

  if (record[SITE_DEVTOOLS_ANALYSIS_MODEL_BRAND] !== true) {
    return undefined;
  }

  const provider = record[SITE_DEVTOOLS_ANALYSIS_MODEL_PROVIDER];
  const providerKey = record[SITE_DEVTOOLS_ANALYSIS_MODEL_PROVIDER_KEY];

  return (provider === 'claude' || provider === 'doubao') &&
    typeof providerKey === 'string'
    ? {
        provider,
        providerKey,
      }
    : undefined;
};

const defineHiddenValue = <TObject extends object>(
  target: TObject,
  key: PropertyKey,
  value: unknown,
) => {
  Object.defineProperty(target, key, {
    configurable: false,
    enumerable: false,
    value,
    writable: false,
  });
};

const createAnalysisModel = <Provider extends SiteDevToolsAnalysisProvider>(
  provider: Provider,
  providerKey: string,
  config: SiteDevToolsAnalysisModelInputByType<Provider>,
): SiteDevToolsAnalysisModelConfigByType<Provider> => {
  const modelConfig = {
    ...config,
    ...(provider === 'doubao'
      ? {
          thinking:
            (config as SiteDevToolsAnalysisBuildReportDoubaoModelInput)
              .thinking ?? false,
        }
      : {}),
  };

  defineHiddenValue(modelConfig, SITE_DEVTOOLS_ANALYSIS_MODEL_BRAND, true);
  defineHiddenValue(
    modelConfig,
    SITE_DEVTOOLS_ANALYSIS_MODEL_PROVIDER,
    provider,
  );
  defineHiddenValue(
    modelConfig,
    SITE_DEVTOOLS_ANALYSIS_MODEL_PROVIDER_KEY,
    providerKey,
  );

  return modelConfig as SiteDevToolsAnalysisModelConfigByType<Provider>;
};

const createAnalysisProvider = <Provider extends SiteDevToolsAnalysisProvider>(
  provider: Provider,
  config: SiteDevToolsAnalysisProviderInputByType<Provider>,
): SiteDevToolsAnalysisProviderConfigByType<Provider> => {
  const providerKey = createProviderKey(provider);
  const providerConfig = {
    ...config,
  };

  defineHiddenValue(
    providerConfig,
    SITE_DEVTOOLS_ANALYSIS_PROVIDER_BRAND,
    true,
  );
  defineHiddenValue(
    providerConfig,
    SITE_DEVTOOLS_ANALYSIS_PROVIDER_TYPE,
    provider,
  );
  defineHiddenValue(
    providerConfig,
    SITE_DEVTOOLS_ANALYSIS_PROVIDER_KEY,
    providerKey,
  );
  defineHiddenValue(
    providerConfig,
    'model',
    (modelConfig: SiteDevToolsAnalysisModelInputByType<Provider>) =>
      createAnalysisModel(provider, providerKey, modelConfig),
  );

  return providerConfig as SiteDevToolsAnalysisProviderConfigByType<Provider>;
};

export const claude = {
  provider(
    config: SiteDevToolsAnalysisClaudeProviderInput,
  ): SiteDevToolsAnalysisClaudeProviderConfig {
    return createAnalysisProvider('claude', config);
  },
};

export const doubao = {
  provider(
    config: SiteDevToolsAnalysisDoubaoProviderInput,
  ): SiteDevToolsAnalysisDoubaoProviderConfig {
    return createAnalysisProvider('doubao', config);
  },
};

export const isSiteDevToolsAnalysisProviderConfig = (
  value: unknown,
): value is SiteDevToolsAnalysisProviderConfig =>
  Boolean(getProviderMetadata(value));

export const isSiteDevToolsAnalysisBuildReportModelConfig = (
  value: unknown,
): value is SiteDevToolsAnalysisBuildReportModelConfig =>
  Boolean(getModelMetadata(value));

export const getSiteDevToolsAnalysisProviderMetadata = (
  providerConfig: SiteDevToolsAnalysisProviderConfig,
): SiteDevToolsAnalysisProviderMetadata => getProviderMetadata(providerConfig)!;

export const getSiteDevToolsAnalysisModelMetadata = (
  modelConfig: SiteDevToolsAnalysisBuildReportModelConfig,
): SiteDevToolsAnalysisModelMetadata => getModelMetadata(modelConfig)!;
