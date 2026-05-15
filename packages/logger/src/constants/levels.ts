import type { LoggerVisibilityLevel, LogKind } from '../types';

export const LOG_KIND_TO_LEVEL: Record<
  Exclude<LogKind, 'debug'>,
  LoggerVisibilityLevel
> = {
  error: 'error',
  info: 'info',
  success: 'success',
  warn: 'warn',
};

// All log information is allowed by default.
export const DEFAULT_RESOLVED_LEVELS: ReadonlySet<LoggerVisibilityLevel> =
  new Set<LoggerVisibilityLevel>(['error', 'warn', 'info', 'success']);

export const ROOT_LOGGER_RULE_LABEL = '<root>';
