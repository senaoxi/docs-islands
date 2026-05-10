import { DIRNAME_VAR_NAME } from '@docs-islands/core/shared/constants/runtime';
import { isNodeLikeBuiltin } from '@docs-islands/utils/builtin';
import type { InlineConfig } from 'vite';
import {
  createVitePressLoggerFacadePlugin,
  VITEPRESS_LOGGER_MODULE_ID,
} from '../../core/vite-plugin-logger-facade';
import { createLoggerTreeShakingPlugin } from '../../core/vite-plugin-logger-tree-shaking';
import type { UIFrameworkBuildAdapter } from '../adapter';

export interface SSRBundleConfigOptions {
  srcDir: string;
  base: string;
  ssrTempDir: string;
  assetsDir: string;
  entryPoints: Record<string, string>;
  adapter: UIFrameworkBuildAdapter;
  loggerScopeId: string;
}

export function createSSRBundleConfig(
  options: SSRBundleConfigOptions,
): InlineConfig {
  const {
    srcDir,
    base,
    ssrTempDir,
    assetsDir,
    entryPoints,
    adapter,
    loggerScopeId,
  } = options;

  return {
    root: srcDir,
    base,
    build: {
      ssr: true,
      ssrEmitAssets: false,
      rollupOptions: {
        input: entryPoints,
        external: (id) => {
          if (id === VITEPRESS_LOGGER_MODULE_ID) {
            return false;
          }

          if (isNodeLikeBuiltin(id)) {
            return true;
          }

          const bareImportRE = /^(?![a-z]:)[\w@](?!.*:\/\/)/i;

          if (bareImportRE.test(id)) {
            return true;
          }
          return false;
        },
        output: {
          format: 'esm',
          assetFileNames: `${assetsDir}/[name].[hash].[ext]`,
          entryFileNames: '[name].js',
          chunkFileNames: '[name].[hash].js',
        },
      },
      outDir: ssrTempDir,
      emptyOutDir: true,
      write: true,
      target: 'es2020',
      minify: false,
      assetsInlineLimit: 4096,
      cssCodeSplit: true,
    },
    plugins: [
      createVitePressLoggerFacadePlugin(loggerScopeId),
      createLoggerTreeShakingPlugin(loggerScopeId),
      ...adapter.ssrBundlerPlugins(),
    ],
    define: {
      'import.meta.dirname': DIRNAME_VAR_NAME,
    },
    logLevel: 'warn',
  };
}
