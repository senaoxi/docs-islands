import {
  LOGGER_TREE_SHAKING_PLUGIN_NAME,
  transformLoggerTreeShaking as transformBaseLoggerTreeShaking,
} from 'logaria/plugin';
import type { LoggerTreeShakingTransformResult } from 'logaria/types';
import type { PluginOption } from 'vite';

export const VITEPRESS_LOGGER_TREE_SHAKING_MODULE_ID =
  '@docs-islands/vitepress/logger';

const loggerTreeShakingScopeIds = new Set<string>();

export const setVitePressLoggerTreeShakingEnabled = (
  loggerScopeId: string,
  enabled: boolean,
): void => {
  if (enabled) {
    loggerTreeShakingScopeIds.add(loggerScopeId);
    return;
  }

  loggerTreeShakingScopeIds.delete(loggerScopeId);
};

export const isVitePressLoggerTreeShakingEnabled = (
  loggerScopeId: string,
): boolean => loggerTreeShakingScopeIds.has(loggerScopeId);

const transformLoggerTreeShakingForModuleIds = async (
  code: string,
  id: string,
  loggerScopeId: string,
): Promise<LoggerTreeShakingTransformResult | null> => {
  return transformBaseLoggerTreeShaking(code, id, {
    loggerModuleId: VITEPRESS_LOGGER_TREE_SHAKING_MODULE_ID,
    loggerScopeId,
  });
};

export const createLoggerTreeShakingPlugin = (
  loggerScopeId: string,
): PluginOption => {
  if (!isVitePressLoggerTreeShakingEnabled(loggerScopeId)) {
    return false;
  }

  return {
    name: LOGGER_TREE_SHAKING_PLUGIN_NAME,
    enforce: 'post',
    apply: 'build',
    transform: (code, id) =>
      transformLoggerTreeShakingForModuleIds(code, id, loggerScopeId),
  };
};

export const transformLoggerTreeShaking = (
  code: string,
  id: string,
  loggerScopeId: string,
): Promise<LoggerTreeShakingTransformResult | null> =>
  transformLoggerTreeShakingForModuleIds(code, id, loggerScopeId);

export { LOGGER_TREE_SHAKING_PLUGIN_NAME } from 'logaria/plugin';
