import type { ResolvedLiminaConfig, VueImportParser } from '#config/runner';
import {
  createImportAnalysisContext,
  type ImportAnalysisContext,
} from '#core/import-graph/context';
import type { PrepareGeneratedTsconfigGraphOptions } from './types';

function getVueParser(
  config: ResolvedLiminaConfig,
): VueImportParser | undefined {
  if (!config.config) return undefined;
  return config.config.imports?.vue;
}

export function resolveBuildGraphImportAnalysis(options: {
  config: ResolvedLiminaConfig;
  importAnalysisContext?: PrepareGeneratedTsconfigGraphOptions['importAnalysisContext'];
}): ImportAnalysisContext {
  if (options.importAnalysisContext !== undefined) {
    return options.importAnalysisContext;
  }
  return createImportAnalysisContext({
    projectRootDir: options.config.rootDir,
    vueParser: getVueParser(options.config),
  });
}
