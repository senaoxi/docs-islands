import type {
  SiteDevToolsAnalysisResolvedBuildReportModelConfig,
  SiteDevToolsAnalysisResolvedUserConfig,
} from '#dep-types/utils';
import { createElapsedTimer } from 'logaria/helper';
import {
  buildSiteDevToolsAiAnalysisPrompt,
  getSiteDevToolsAiProviderLabel,
  type SiteDevToolsAiAnalysisTarget,
  type SiteDevToolsAiCapabilitiesResponse,
  type SiteDevToolsAiProvider,
  type SiteDevToolsAiProviderCapability,
} from '../../shared/site-devtools-ai';
import {
  createExecutionFailure,
  createRequestTrace,
  createTimeoutExecutionError,
  formatRequestTraceDetail,
  logAiRequestFailed,
  logAiRequestStarted,
  logAiRequestSucceeded,
  resolveTextContent,
  SiteDevToolsAiExecutionError,
} from './ai-server-trace';

const SITE_DEVTOOLS_AI_ANALYSIS_SYSTEM_PROMPT =
  'You are a senior frontend performance and bundling engineer. Help analyze generated build artifacts accurately and pragmatically.';
const LATEST_CLAUDE_ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_CLAUDE_BASE_URL = 'https://api.anthropic.com/v1';
const DEFAULT_CLAUDE_MAX_TOKENS = 4096;
const DEFAULT_DOUBAO_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';
const DEFAULT_ANALYSIS_TIMEOUT_MS = Number.POSITIVE_INFINITY;

export interface SiteDevToolsAnalysisRuntimeConfig {
  buildReports?: SiteDevToolsAnalysisResolvedUserConfig['buildReports'];
  providers?: {
    claude?: (NonNullable<
      NonNullable<SiteDevToolsAnalysisResolvedUserConfig['providers']>['claude']
    >[number] & {
      maxTokens?: number;
      model?: string;
      temperature?: number;
    })[];
    doubao?: (NonNullable<
      NonNullable<SiteDevToolsAnalysisResolvedUserConfig['providers']>['doubao']
    >[number] & {
      maxTokens?: number;
      model?: string;
      thinking?: boolean;
      temperature?: number;
    })[];
  };
}

export type SiteDevToolsAnalysisConfig =
  | SiteDevToolsAnalysisRuntimeConfig
  | undefined;
export type SiteDevToolsAiRuntimeConfig = SiteDevToolsAnalysisRuntimeConfig;
export type SiteDevToolsAiConfig = SiteDevToolsAnalysisConfig;

export interface SiteDevToolsAiExecutionResult {
  detail?: string;
  model?: string;
  result: string;
}

type SiteDevToolsAnalysisDoubaoRuntimeProviderConfig = NonNullable<
  NonNullable<SiteDevToolsAnalysisRuntimeConfig['providers']>['doubao']
>[number];
type SiteDevToolsAnalysisClaudeRuntimeProviderConfig = NonNullable<
  NonNullable<SiteDevToolsAnalysisRuntimeConfig['providers']>['claude']
>[number];
type SiteDevToolsAnalysisDoubaoBuildReportModelConfig =
  SiteDevToolsAnalysisResolvedBuildReportModelConfig & {
    thinking?: boolean;
  };

const isDoubaoBuildReportModelConfig = (
  modelConfig: SiteDevToolsAnalysisResolvedBuildReportModelConfig,
): modelConfig is SiteDevToolsAnalysisDoubaoBuildReportModelConfig =>
  modelConfig.provider === 'doubao';

const getClaudeProviderConfigs = (
  config: SiteDevToolsAiConfig,
): SiteDevToolsAnalysisClaudeRuntimeProviderConfig[] =>
  Array.isArray(config?.providers?.claude)
    ? config.providers.claude.filter(
        (
          provider,
        ): provider is SiteDevToolsAnalysisClaudeRuntimeProviderConfig =>
          Boolean(provider),
      )
    : [];

const getClaudeProviderConfig = (
  config: SiteDevToolsAiConfig,
): SiteDevToolsAnalysisClaudeRuntimeProviderConfig | undefined => {
  const providerConfigs = getClaudeProviderConfigs(config);

  if (providerConfigs.length === 0) {
    return undefined;
  }

  return (
    providerConfigs.find((providerConfig) => providerConfig.default === true) ??
    providerConfigs[0]
  );
};

const getClaudeProviderDefaultCount = (config: SiteDevToolsAiConfig) =>
  getClaudeProviderConfigs(config).filter(
    (providerConfig) => providerConfig.default === true,
  ).length;

const getDoubaoProviderConfigs = (
  config: SiteDevToolsAiConfig,
): SiteDevToolsAnalysisDoubaoRuntimeProviderConfig[] =>
  Array.isArray(config?.providers?.doubao)
    ? config.providers.doubao.filter(
        (
          provider,
        ): provider is SiteDevToolsAnalysisDoubaoRuntimeProviderConfig =>
          Boolean(provider),
      )
    : [];

const getDoubaoProviderConfig = (
  config: SiteDevToolsAiConfig,
): SiteDevToolsAnalysisDoubaoRuntimeProviderConfig | undefined => {
  const providerConfigs = getDoubaoProviderConfigs(config);

  if (providerConfigs.length === 0) {
    return undefined;
  }

  return (
    providerConfigs.find((providerConfig) => providerConfig.default === true) ??
    providerConfigs[0]
  );
};

const getDoubaoProviderDefaultCount = (config: SiteDevToolsAiConfig) =>
  getDoubaoProviderConfigs(config).filter(
    (providerConfig) => providerConfig.default === true,
  ).length;

const getClaudeBuildReportModelConfigs = (
  config: SiteDevToolsAiConfig,
): SiteDevToolsAnalysisResolvedBuildReportModelConfig[] =>
  Array.isArray(config?.buildReports?.models)
    ? config.buildReports.models.filter(
        (model): model is SiteDevToolsAnalysisResolvedBuildReportModelConfig =>
          Boolean(model) && model.provider === 'claude',
      )
    : [];

const getDoubaoBuildReportModelConfigs = (
  config: SiteDevToolsAiConfig,
): SiteDevToolsAnalysisDoubaoBuildReportModelConfig[] =>
  Array.isArray(config?.buildReports?.models)
    ? config.buildReports.models.filter(
        (model): model is SiteDevToolsAnalysisDoubaoBuildReportModelConfig =>
          Boolean(model) && isDoubaoBuildReportModelConfig(model),
      )
    : [];

const getPrimaryClaudeBuildReportModel = (config: SiteDevToolsAiConfig) => {
  const modelConfigs = getClaudeBuildReportModelConfigs(config);

  return (
    modelConfigs.find((modelConfig) => modelConfig.default === true) ??
    modelConfigs[0]
  );
};

const getPrimaryDoubaoBuildReportModel = (config: SiteDevToolsAiConfig) => {
  const modelConfigs = getDoubaoBuildReportModelConfigs(config);

  return (
    modelConfigs.find((modelConfig) => modelConfig.default === true) ??
    modelConfigs[0]
  );
};

const normalizePositiveInteger = (value: number | undefined) => {
  let normalizedValue: number | undefined;

  if (typeof value === 'number' && Number.isFinite(value)) {
    const normalized = Math.trunc(value);

    if (normalized > 0) {
      normalizedValue = normalized;
    }
  }

  return normalizedValue;
};

const normalizeTimeoutMs = (value: number | undefined) => {
  if (value === Number.POSITIVE_INFINITY) {
    return Number.POSITIVE_INFINITY;
  }

  return normalizePositiveInteger(value);
};

const normalizeTemperature = (value: number | undefined) =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= 2
    ? value
    : undefined;

const resolveClaudeBaseUrl = (config: SiteDevToolsAiConfig) =>
  (
    getClaudeProviderConfig(config)?.baseUrl?.trim() || DEFAULT_CLAUDE_BASE_URL
  ).replace(/\/+$/, '');

const resolveDoubaoBaseUrl = (config: SiteDevToolsAiConfig) =>
  (
    getDoubaoProviderConfig(config)?.baseUrl?.trim() || DEFAULT_DOUBAO_BASE_URL
  ).replace(/\/+$/, '');

const getClaudeTimeoutMs = (config: SiteDevToolsAiConfig) =>
  normalizeTimeoutMs(getClaudeProviderConfig(config)?.timeoutMs) ??
  DEFAULT_ANALYSIS_TIMEOUT_MS;

const getDoubaoTimeoutMs = (config: SiteDevToolsAiConfig) =>
  normalizeTimeoutMs(getDoubaoProviderConfig(config)?.timeoutMs) ??
  DEFAULT_ANALYSIS_TIMEOUT_MS;

const getClaudeTemperature = (config: SiteDevToolsAiConfig) =>
  normalizeTemperature(
    getClaudeProviderConfig(config)?.temperature ??
      getPrimaryClaudeBuildReportModel(config)?.temperature,
  );

const getDoubaoTemperature = (config: SiteDevToolsAiConfig) =>
  normalizeTemperature(
    getDoubaoProviderConfig(config)?.temperature ??
      getPrimaryDoubaoBuildReportModel(config)?.temperature,
  );

const getDoubaoMaxTokens = (config: SiteDevToolsAiConfig) =>
  normalizePositiveInteger(
    getDoubaoProviderConfig(config)?.maxTokens ??
      getPrimaryDoubaoBuildReportModel(config)?.maxTokens,
  );

const getClaudeMaxTokens = (config: SiteDevToolsAiConfig) =>
  normalizePositiveInteger(
    getClaudeProviderConfig(config)?.maxTokens ??
      getPrimaryClaudeBuildReportModel(config)?.maxTokens,
  ) ?? DEFAULT_CLAUDE_MAX_TOKENS;

const getClaudeModel = (config: SiteDevToolsAiConfig) => {
  const providerModel = getClaudeProviderConfig(config)?.model?.trim();

  if (providerModel) {
    return providerModel;
  }

  const buildReportModel = getPrimaryClaudeBuildReportModel(config)?.model;

  return typeof buildReportModel === 'string' && buildReportModel.trim()
    ? buildReportModel.trim()
    : undefined;
};

const getDoubaoModel = (config: SiteDevToolsAiConfig) => {
  const providerModel = getDoubaoProviderConfig(config)?.model?.trim();

  if (providerModel) {
    return providerModel;
  }

  const buildReportModel = getPrimaryDoubaoBuildReportModel(config)?.model;

  return typeof buildReportModel === 'string' && buildReportModel.trim()
    ? buildReportModel.trim()
    : undefined;
};

const getDoubaoThinkingType = (
  config: SiteDevToolsAiConfig,
): 'enabled' | 'disabled' | undefined => {
  const thinking =
    getDoubaoProviderConfig(config)?.thinking ??
    getPrimaryDoubaoBuildReportModel(config)?.thinking;

  return thinking === true
    ? 'enabled'
    : thinking === false
      ? 'disabled'
      : undefined;
};

const getClaudeAnthropicVersion = () => LATEST_CLAUDE_ANTHROPIC_VERSION;

const getClaudeCapability = (
  config: SiteDevToolsAiConfig,
): SiteDevToolsAiProviderCapability => {
  const providerConfig = getClaudeProviderConfig(config);
  const providerConfigs = getClaudeProviderConfigs(config);
  const model = getClaudeModel(config);

  if (providerConfigs.length === 0) {
    return {
      available: false,
      detail:
        'Configure siteDevtools.analysis.providers with at least one claude.provider(...) entry to use Claude analysis.',
      provider: 'claude',
    };
  }

  if (!providerConfig?.apiKey?.trim()) {
    return {
      available: false,
      detail:
        'Missing apiKey for the active Claude provider entry in siteDevtools.analysis.providers.',
      provider: 'claude',
    };
  }

  if (!model) {
    return {
      available: false,
      detail:
        'Missing a Claude model configuration. Add a siteDevtools.analysis.buildReports.models entry created by claude.provider(...).model(...).',
      provider: 'claude',
    };
  }

  const detailParts = [`Using ${resolveClaudeBaseUrl(config)}/messages`];

  if (providerConfig.label?.trim()) {
    detailParts.push(`provider ${providerConfig.label.trim()}`);
  }

  if (getClaudeProviderDefaultCount(config) > 1) {
    detailParts.push(
      'multiple defaults declared; using the first default entry',
    );
  }

  return {
    available: true,
    detail: detailParts.join(' · '),
    model,
    provider: 'claude',
  };
};

const getDoubaoCapability = (
  config: SiteDevToolsAiConfig,
): SiteDevToolsAiProviderCapability => {
  const providerConfig = getDoubaoProviderConfig(config);
  const providerConfigs = getDoubaoProviderConfigs(config);
  const model = getDoubaoModel(config);

  if (providerConfigs.length === 0) {
    return {
      available: false,
      detail:
        'Configure siteDevtools.analysis.providers with at least one doubao.provider(...) entry to use Doubao analysis.',
      provider: 'doubao',
    };
  }

  if (!providerConfig?.apiKey?.trim()) {
    return {
      available: false,
      detail:
        'Missing apiKey for the active Doubao provider entry in siteDevtools.analysis.providers.',
      provider: 'doubao',
    };
  }

  if (!model) {
    return {
      available: false,
      detail:
        'Missing a Doubao model configuration. Add a siteDevtools.analysis.buildReports.models entry created by doubao.provider(...).model(...).',
      provider: 'doubao',
    };
  }

  const detailParts = [
    `Using ${resolveDoubaoBaseUrl(config)}/chat/completions`,
  ];

  if (providerConfig.label?.trim()) {
    detailParts.push(`provider ${providerConfig.label.trim()}`);
  }

  if (getDoubaoProviderDefaultCount(config) > 1) {
    detailParts.push(
      'multiple defaults declared; using the first default entry',
    );
  }

  return {
    available: true,
    detail: detailParts.join(' · '),
    model,
    provider: 'doubao',
  };
};

export const resolveSiteDevToolsAiCapabilities = async (
  config?: SiteDevToolsAiConfig,
): Promise<SiteDevToolsAiCapabilitiesResponse> => {
  return {
    ok: true,
    providers: {
      claude: getClaudeCapability(config),
      doubao: getDoubaoCapability(config),
    },
  };
};

const runDoubaoAnalysis = async (
  prompt: string,
  config: SiteDevToolsAiConfig,
  target: SiteDevToolsAiAnalysisTarget,
  loggerScopeId: string,
): Promise<SiteDevToolsAiExecutionResult> => {
  const capability = getDoubaoCapability(config);
  const providerConfig = getDoubaoProviderConfig(config);
  const maxTokens = getDoubaoMaxTokens(config);
  const thinking = getDoubaoThinkingType(config);
  const temperature = getDoubaoTemperature(config);
  const timeoutMs = getDoubaoTimeoutMs(config);
  const providerModel = getDoubaoModel(config);
  const trace = createRequestTrace({
    model: providerModel,
    prompt,
    provider: 'doubao',
    target,
    timeoutMs,
  });

  if (!capability.available || !providerConfig?.apiKey || !providerModel) {
    throw createExecutionFailure({
      detail: formatRequestTraceDetail(trace),
      message: capability.detail,
      statusCode: 400,
    });
  }

  logAiRequestStarted(trace, loggerScopeId);

  const providerApiKey = providerConfig.apiKey;

  const controller = new AbortController();
  const timeout = Number.isFinite(timeoutMs)
    ? setTimeout(() => {
        controller.abort();
      }, timeoutMs)
    : null;

  const elapsed = createElapsedTimer();
  try {
    const response = await fetch(
      `${resolveDoubaoBaseUrl(config)}/chat/completions`,
      {
        body: JSON.stringify({
          messages: [
            {
              content: SITE_DEVTOOLS_AI_ANALYSIS_SYSTEM_PROMPT,
              role: 'system',
            },
            {
              content: prompt,
              role: 'user',
            },
          ],
          ...(maxTokens ? { max_tokens: maxTokens } : {}),
          model: providerModel,
          ...(thinking ? { thinking: { type: thinking } } : {}),
          ...(temperature === undefined ? {} : { temperature }),
        }),
        headers: {
          Authorization: `Bearer ${providerApiKey}`,
          'Content-Type': 'application/json',
        },
        method: 'POST',
        signal: controller.signal,
      },
    );
    const payload = (await response.json()) as {
      choices?: {
        message?: {
          content?: unknown;
        };
      }[];
      error?: {
        code?: string;
        message?: string;
      };
    };

    if (!response.ok) {
      throw createExecutionFailure({
        detail: formatRequestTraceDetail(trace),
        message:
          payload.error?.message ||
          `Doubao request failed with HTTP ${response.status}.`,
        statusCode:
          response.status === 408 || response.status === 504
            ? 504
            : response.status,
      });
    }

    const content = resolveTextContent(payload.choices?.[0]?.message?.content);

    if (!content) {
      throw createExecutionFailure({
        detail: formatRequestTraceDetail(trace),
        message: 'Doubao returned an empty analysis result.',
        statusCode: 502,
      });
    }

    logAiRequestSucceeded({
      elapsedMs: elapsed().elapsedTimeMs,
      loggerScopeId,
      result: content,
      trace,
    });

    return {
      detail: capability.detail,
      model: providerModel,
      result: content,
    };
  } catch (error) {
    logAiRequestFailed({
      elapsedMs: elapsed().elapsedTimeMs,
      error,
      loggerScopeId,
      trace,
    });

    if (error instanceof DOMException && error.name === 'AbortError') {
      throw createTimeoutExecutionError({ trace });
    }

    if (error instanceof SiteDevToolsAiExecutionError) {
      throw error;
    }

    throw createExecutionFailure({
      detail: formatRequestTraceDetail(trace),
      message:
        error instanceof Error
          ? error.message
          : 'Doubao analysis request failed.',
      statusCode: 500,
    });
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
};

const runClaudeAnalysis = async (
  prompt: string,
  config: SiteDevToolsAiConfig,
  target: SiteDevToolsAiAnalysisTarget,
  loggerScopeId: string,
): Promise<SiteDevToolsAiExecutionResult> => {
  const capability = getClaudeCapability(config);
  const providerConfig = getClaudeProviderConfig(config);
  const maxTokens = getClaudeMaxTokens(config);
  const temperature = getClaudeTemperature(config);
  const timeoutMs = getClaudeTimeoutMs(config);
  const providerModel = getClaudeModel(config);
  const trace = createRequestTrace({
    model: providerModel,
    prompt,
    provider: 'claude',
    target,
    timeoutMs,
  });
  if (!capability.available || !providerConfig?.apiKey || !providerModel) {
    throw createExecutionFailure({
      detail: formatRequestTraceDetail(trace),
      message: capability.detail,
      statusCode: 400,
    });
  }

  logAiRequestStarted(trace, loggerScopeId);

  const controller = new AbortController();
  const timeout = Number.isFinite(timeoutMs)
    ? setTimeout(() => {
        controller.abort();
      }, timeoutMs)
    : null;

  const elapsed = createElapsedTimer();
  try {
    const response = await fetch(`${resolveClaudeBaseUrl(config)}/messages`, {
      body: JSON.stringify({
        max_tokens: maxTokens,
        messages: [
          {
            content: prompt,
            role: 'user',
          },
        ],
        model: providerModel,
        system: SITE_DEVTOOLS_AI_ANALYSIS_SYSTEM_PROMPT,
        ...(temperature === undefined ? {} : { temperature }),
      }),
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': getClaudeAnthropicVersion(),
        'x-api-key': providerConfig.apiKey,
      },
      method: 'POST',
      signal: controller.signal,
    });
    const payload = (await response.json()) as {
      content?: unknown;
      error?: {
        message?: string;
        type?: string;
      };
    };

    if (!response.ok) {
      throw createExecutionFailure({
        detail: formatRequestTraceDetail(trace),
        message:
          payload.error?.message ||
          `Claude request failed with HTTP ${response.status}.`,
        statusCode:
          response.status === 408 || response.status === 504
            ? 504
            : response.status,
      });
    }

    const content = resolveTextContent(payload.content);

    if (!content) {
      throw createExecutionFailure({
        detail: formatRequestTraceDetail(trace),
        message: 'Claude returned an empty analysis result.',
        statusCode: 502,
      });
    }

    logAiRequestSucceeded({
      elapsedMs: elapsed().elapsedTimeMs,
      loggerScopeId,
      result: content,
      trace,
    });

    return {
      detail: capability.detail,
      model: providerModel,
      result: content,
    };
  } catch (error) {
    logAiRequestFailed({
      elapsedMs: elapsed().elapsedTimeMs,
      error,
      loggerScopeId,
      trace,
    });

    if (error instanceof DOMException && error.name === 'AbortError') {
      throw createTimeoutExecutionError({ trace });
    }

    if (error instanceof SiteDevToolsAiExecutionError) {
      throw error;
    }

    throw createExecutionFailure({
      detail: formatRequestTraceDetail(trace),
      message:
        error instanceof Error
          ? error.message
          : 'Claude analysis request failed.',
      statusCode: 500,
    });
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
};

export const analyzeSiteDevToolsAiTarget = async ({
  config,
  loggerScopeId,
  provider,
  target,
}: {
  config: SiteDevToolsAiConfig;
  loggerScopeId: string;
  provider: SiteDevToolsAiProvider;
  target: SiteDevToolsAiAnalysisTarget;
}): Promise<SiteDevToolsAiExecutionResult> => {
  const capabilityResponse = await resolveSiteDevToolsAiCapabilities(config);
  const capability = capabilityResponse.providers[provider];

  if (!capability?.available) {
    throw createExecutionFailure({
      detail: `${provider} ${target.artifactKind} ${target.displayPath}`,
      message:
        capability?.detail ||
        `${getSiteDevToolsAiProviderLabel(provider)} is not available in the current siteDevtools.analysis configuration.`,
      statusCode: 400,
    });
  }

  const prompt = buildSiteDevToolsAiAnalysisPrompt(target);

  switch (provider) {
    case 'claude': {
      return runClaudeAnalysis(prompt, config, target, loggerScopeId);
    }
    case 'doubao': {
      return runDoubaoAnalysis(prompt, config, target, loggerScopeId);
    }
    default: {
      throw createExecutionFailure({
        detail: `${provider} ${target.artifactKind} ${target.displayPath}`,
        message: `${getSiteDevToolsAiProviderLabel(provider)} is not supported for siteDevtools.analysis.`,
        statusCode: 400,
      });
    }
  }
};
