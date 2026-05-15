import { VITEPRESS_SITE_DEVTOOLS_LOG_GROUPS } from '#shared/constants/log-groups/site-devtools';
import { formatErrorMessage } from '@docs-islands/logger/helper';
import { createHash } from 'node:crypto';
import {
  getSiteDevToolsAiProviderLabel,
  type SiteDevToolsAiAnalysisTarget,
  type SiteDevToolsAiProvider,
  type SiteDevToolsAiRequestTrace,
} from '../../shared/site-devtools-ai';
import { getVitePressGroupLogger } from '../logger';

export class SiteDevToolsAiExecutionError extends Error {
  declare readonly detail?: string;
  declare readonly statusCode: number;

  constructor(
    message: string,
    options?: {
      cause?: unknown;
      detail?: string;
      statusCode?: number;
    },
  ) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = 'SiteDevToolsAiExecutionError';
    Object.defineProperty(this, 'detail', {
      configurable: true,
      value: options?.detail,
      writable: true,
    });
    Object.defineProperty(this, 'statusCode', {
      configurable: true,
      value: options?.statusCode ?? 500,
      writable: true,
    });
  }
}

const getSiteDevToolsAiLogger = (loggerScopeId: string) =>
  getVitePressGroupLogger(
    VITEPRESS_SITE_DEVTOOLS_LOG_GROUPS.aiServer,
    loggerScopeId,
  );

const formatDurationMs = (value: number) => {
  if (!Number.isFinite(value)) {
    return 'Infinity';
  }

  if (value < 1000) {
    return `${value} ms`;
  }

  const seconds = value / 1000;

  if (seconds < 60) {
    return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)} s`;
  }

  const minutes = seconds / 60;

  return `${Number.isInteger(minutes) ? minutes : minutes.toFixed(1)} min`;
};

const formatByteCount = (value: number) => {
  if (value < 1024) {
    return `${value} B`;
  }

  const units = ['KB', 'MB', 'GB'];
  let normalizedValue = value;
  let unitIndex = -1;

  while (normalizedValue >= 1024 && unitIndex < units.length - 1) {
    normalizedValue /= 1024;
    unitIndex += 1;
  }

  const formattedValue =
    normalizedValue >= 10 || Number.isInteger(normalizedValue)
      ? normalizedValue.toFixed(0)
      : normalizedValue.toFixed(1);

  return `${formattedValue} ${units[unitIndex]}`;
};

const createProviderRequestId = ({
  prompt,
  provider,
  target,
}: {
  prompt: string;
  provider: SiteDevToolsAiProvider;
  target: SiteDevToolsAiAnalysisTarget;
}) =>
  createHash('sha256')
    .update(
      JSON.stringify({
        artifactKind: target.artifactKind,
        displayPath: target.displayPath,
        prompt,
        provider,
      }),
    )
    .digest('hex')
    .slice(0, 12);

export const createRequestTrace = ({
  model,
  prompt,
  provider,
  target,
  timeoutMs,
}: {
  model?: string;
  prompt: string;
  provider: SiteDevToolsAiProvider;
  target: SiteDevToolsAiAnalysisTarget;
  timeoutMs: number;
}): SiteDevToolsAiRequestTrace => ({
  artifactKind: target.artifactKind,
  displayPath: target.displayPath,
  ...(model ? { model } : {}),
  promptBytes: Buffer.byteLength(prompt, 'utf8'),
  provider,
  providerRequestId: createProviderRequestId({
    prompt,
    provider,
    target,
  }),
  timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 'infinite',
});

export const formatRequestTraceDetail = (
  trace: SiteDevToolsAiRequestTrace,
): string =>
  [
    `Trace ${trace.providerRequestId}`,
    `${getSiteDevToolsAiProviderLabel(trace.provider)}`,
    trace.model ? `model ${trace.model}` : null,
    `${trace.artifactKind} ${trace.displayPath}`,
    `prompt ${formatByteCount(trace.promptBytes)}`,
    trace.timeoutMs === 'infinite'
      ? 'timeout disabled'
      : `timeout ${formatDurationMs(trace.timeoutMs)}`,
  ]
    .filter((value): value is string => Boolean(value))
    .join(' · ');

export const logAiRequestStarted = (
  trace: SiteDevToolsAiRequestTrace,
  loggerScopeId: string,
): void => {
  getSiteDevToolsAiLogger(loggerScopeId).info(
    `AI analysis started: ${formatRequestTraceDetail(trace)}`,
  );
};

export const logAiRequestSucceeded = ({
  elapsedMs,
  loggerScopeId,
  result,
  trace,
}: {
  elapsedMs: number;
  loggerScopeId: string;
  result: string;
  trace: SiteDevToolsAiRequestTrace;
}): void => {
  getSiteDevToolsAiLogger(loggerScopeId).success(
    `AI analysis returned data: ${formatRequestTraceDetail(trace)} · response ${formatByteCount(
      Buffer.byteLength(result, 'utf8'),
    )} · elapsed ${formatDurationMs(elapsedMs)}`,
    { elapsedTimeMs: elapsedMs },
  );
};

export const logAiRequestFailed = ({
  elapsedMs,
  error,
  loggerScopeId,
  trace,
}: {
  elapsedMs: number;
  error: unknown;
  loggerScopeId: string;
  trace: SiteDevToolsAiRequestTrace;
}): void => {
  getSiteDevToolsAiLogger(loggerScopeId).error(
    `AI analysis returned no data: ${formatRequestTraceDetail(trace)} · elapsed ${formatDurationMs(
      elapsedMs,
    )} · reason ${formatErrorMessage(error)}`,
    { elapsedTimeMs: elapsedMs },
  );
};

export const createTimeoutExecutionError = ({
  trace,
}: {
  trace: SiteDevToolsAiRequestTrace;
}): SiteDevToolsAiExecutionError => {
  const detail = formatRequestTraceDetail(trace);

  return new SiteDevToolsAiExecutionError(
    `${getSiteDevToolsAiProviderLabel(trace.provider)} analysis timed out. ${detail}`,
    {
      detail,
      statusCode: 504,
    },
  );
};

export const createExecutionFailure = ({
  detail,
  message,
  statusCode,
}: {
  detail: string;
  message: string;
  statusCode?: number;
}): SiteDevToolsAiExecutionError =>
  new SiteDevToolsAiExecutionError(`${message} ${detail}`.trim(), {
    detail,
    statusCode,
  });

export const resolveTextContent = (value: unknown): string => {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') {
          return item;
        }

        if (
          item &&
          typeof item === 'object' &&
          'text' in item &&
          typeof item.text === 'string'
        ) {
          return item.text;
        }

        return '';
      })
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  return '';
};
