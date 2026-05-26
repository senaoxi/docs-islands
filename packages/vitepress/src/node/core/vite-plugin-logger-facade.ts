import { getScopedLoggerConfig } from 'logaria/core';
import type { LoggerConfig, LoggerScopeId } from 'logaria/types';
import { normalizePath, type Plugin } from 'vite';
import { LOGGER_FACADE_PLUGIN_NAME } from '../constants/core/plugin-names';

export const VITEPRESS_LOGGER_MODULE_ID = '@docs-islands/vitepress/logger';

const VITEPRESS_LOGGER_VIRTUAL_MODULE_PREFIX =
  '\0docs-islands:vitepress-logger:';

const serializeLoggerConfig = (
  config: LoggerConfig | null | undefined,
): string => JSON.stringify(config ?? {});

export const createVitePressLoggerVirtualModuleId = (
  loggerScopeId: LoggerScopeId,
): string => `${VITEPRESS_LOGGER_VIRTUAL_MODULE_PREFIX}${loggerScopeId}`;

const createSharedHeader = (
  loggerScopeId: LoggerScopeId,
  logging: LoggerConfig | null | undefined,
): string => `
const loggerScopeId = ${JSON.stringify(loggerScopeId)};
const loggerConfig = ${serializeLoggerConfig(logging)};
setScopedLoggerConfig(loggerScopeId, loggerConfig);
`;

const createVitePressLoggerFacadeSource = (
  loggerScopeId: LoggerScopeId,
  logging: LoggerConfig | null | undefined,
): string => `
import { createScopedLogger, setScopedLoggerConfig } from 'logaria/core';

${createSharedHeader(loggerScopeId, logging)}

export const createLogger = (options) =>
  createScopedLogger(options, loggerScopeId);
`;

export const createVitePressLoggerFacadePlugin = (
  loggerScopeId: LoggerScopeId,
  logging: LoggerConfig | null | undefined = getScopedLoggerConfig(
    loggerScopeId,
  ),
): Plugin => {
  const vitepressLoggerVirtualModuleId =
    createVitePressLoggerVirtualModuleId(loggerScopeId);

  return {
    name: LOGGER_FACADE_PLUGIN_NAME,
    enforce: 'pre',
    resolveId: {
      order: 'pre',
      handler(id) {
        const normalizedId = normalizePath(id);

        if (normalizedId === VITEPRESS_LOGGER_MODULE_ID) {
          return vitepressLoggerVirtualModuleId;
        }

        return null;
      },
    },
    load(id) {
      if (id === vitepressLoggerVirtualModuleId) {
        return createVitePressLoggerFacadeSource(loggerScopeId, logging);
      }

      return null;
    },
  };
};
