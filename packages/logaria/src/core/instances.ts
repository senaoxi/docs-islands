import type { Logger, LoggerScopeId } from '../types';

const mainLoggersByScope = new Map<LoggerScopeId, Map<string, Logger>>();

export const getOrCreateMainLogger = (
  scopeId: LoggerScopeId,
  main: string,
  create: () => Logger,
): Logger => {
  let loggers = mainLoggersByScope.get(scopeId);
  if (!loggers) {
    loggers = new Map();
    mainLoggersByScope.set(scopeId, loggers);
  }
  const cached = loggers.get(main);
  if (cached) {
    return cached;
  }
  const logger = create();
  loggers.set(main, logger);
  return logger;
};

export const clearMainLoggerCacheForScope = (scopeId: LoggerScopeId): void => {
  mainLoggersByScope.delete(scopeId);
};
