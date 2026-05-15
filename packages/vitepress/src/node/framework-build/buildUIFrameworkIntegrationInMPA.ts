import type { OutputChunk, RollupOutput } from '#dep-types/rollup';
import type { ConfigType } from '#dep-types/utils';
import { VITEPRESS_BUILD_LOG_GROUPS } from '#shared/constants/log-groups/build';
import {
  createElapsedTimer,
  formatErrorMessage,
} from '@docs-islands/logger/helper';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'pathe';
import type { InlineConfig, Plugin } from 'vite';
import { build as viteBuild } from 'vite';
import { createVitePressLoggerFacadePlugin } from '../core/vite-plugin-logger-facade';
import { createLoggerTreeShakingPlugin } from '../core/vite-plugin-logger-tree-shaking';
import { getVitePressGroupLogger } from '../logger';
import type { UIFrameworkBuildAdapter } from './adapter';
import { isOutputChunk, resolveSafeOutputPath } from './shared';

const UI_FRAMEWORK_MPA_VITEPRESS_CLIENT_STUB_PLUGIN_NAME =
  'docs-islands:vitepress:ui-framework-mpa-vitepress-client-stub';

/**
 * The MPA integration bundle is shared per framework/config tuple during a
 * build. Caching avoids duplicated Vite work when multiple pages request the
 * same integration runtime concurrently.
 */
const buildPromiseByKey = new Map<
  string,
  Promise<{
    entryPoint: string;
    modulePreloads: string[];
  }>
>();

export const buildUIFrameworkIntegrationInMPA = async (
  config: ConfigType,
  adapter: UIFrameworkBuildAdapter,
  loggerScopeId: string,
): Promise<{
  entryPoint: string;
  modulePreloads: string[];
}> => {
  const Logger = getVitePressGroupLogger(
    VITEPRESS_BUILD_LOG_GROUPS.frameworkMpaIntegration,
    loggerScopeId,
  );
  const { base, cacheDir, assetsDir, srcDir, outDir, cleanUrls } = config;
  const buildKey = [
    adapter.framework,
    resolve(cacheDir),
    resolve(outDir),
    base,
    cleanUrls,
  ].join('::');

  const pendingBuild = buildPromiseByKey.get(buildKey);
  if (pendingBuild) {
    return pendingBuild;
  }

  const buildPromise = (async () => {
    const entryBaseName = `${adapter.framework}-integration`;
    const tempEntryPath = resolve(cacheDir, `${entryBaseName}.js`);
    let buildElapsed = createElapsedTimer();

    try {
      Logger.info(
        `${adapter.framework} integration build started in MPA mode with Vite`,
      );
      buildElapsed = createElapsedTimer();
      /**
       * In MPA mode, it is not necessary to use TLA for the entry module for the following reasons:
       *
       * 1. In MPA mode, the contentUpdated hook does not produce side effects; it only needs to be triggered in loading order.
       * 2. TLA itself has side effects, and build tools are not adept at handling them. The current build result exhibits a deadlock issue.
       *
       * - The `entry` module statically imports the `entry-chunk` module.
       * - The `entry-chunk` module dynamically imports the `client-chunk` and `index-chunk` modules via TLA.
       * - The `client-chunk` module statically imports the `index-chunk` module.
       * - The `index-chunk` module statically imports the `entry-chunk` module.
       */
      const tempEntryContent = `
import { ${adapter.clientEntryImportName()} } from '${adapter.clientEntryModule()}';

${adapter.clientEntryImportName()}();
`;

      fs.writeFileSync(tempEntryPath, tempEntryContent, 'utf8');

      const vitepressTreeShakingPlugin: Plugin = {
        /**
         * In MPA output we only need the public client contract from
         * `vitepress/client`; the live dev-only hooks can be stubbed out so the
         * framework integration bundle remains side-effect free.
         */
        name: UI_FRAMEWORK_MPA_VITEPRESS_CLIENT_STUB_PLUGIN_NAME,
        enforce: 'pre',
        resolveId(id) {
          if (id === 'vitepress/client') {
            return { id: 'vitepress-stub', external: false };
          }
          return null;
        },
        load(id) {
          if (id === 'vitepress-stub') {
            return `
export const onContentUpdated = (_) => {};
export const inBrowser = true;
`;
          }
          return null;
        },
      };

      const viteConfig: InlineConfig = {
        root: srcDir,
        base,
        build: {
          lib: {
            entry: {
              [entryBaseName]: tempEntryPath,
            },
            formats: ['es'],
            fileName: '[name].[hash].js',
          },
          rollupOptions: {
            output: {
              format: 'esm',
              assetFileNames: `${assetsDir}/[name].[hash].[ext]`,
              entryFileNames: `${assetsDir}/[name].[hash].js`,
              chunkFileNames: `${assetsDir}/chunks/[name].[hash].js`,
            },
          },
          emptyOutDir: false,
          write: false,
          target: 'es2020',
          minify: true,
          assetsInlineLimit: 4096,
        },
        plugins: [
          createVitePressLoggerFacadePlugin(loggerScopeId),
          createLoggerTreeShakingPlugin(loggerScopeId),
          vitepressTreeShakingPlugin,
        ],
        define: {
          'import.meta.env.DEV': 'false',
          'import.meta.hot': 'false',
          'import.meta.env.MPA': 'true',
          'import.meta.env.PROD': 'true',
          // Framework client artifacts may rely on NODE_ENV checks during the MPA bundle.
          'process.env.NODE_ENV': '"production"',
          __BASE__: JSON.stringify(base),
          __CLEAN_URLS__: JSON.stringify(cleanUrls),
        },
        resolve: {
          extensions: ['.ts', '.tsx', '.js', '.jsx'],
          alias: {
            '#types': resolve(
              dirname(fileURLToPath(import.meta.url)),
              '../../../types',
            ),
            '#dep-types': resolve(
              dirname(fileURLToPath(import.meta.url)),
              '../../types',
            ),
            '#shared': resolve(
              dirname(fileURLToPath(import.meta.url)),
              '../../shared',
            ),
          },
        },
        esbuild: {
          target: 'es2020',
        },
        logLevel: 'warn',
      };

      const modulePreloads: string[] = [];
      const outputs = (await viteBuild(viteConfig)) as RollupOutput[];
      if (outputs[0] && outputs[0].output && Array.isArray(outputs[0].output)) {
        let entryPointChunk = null;
        for (const chunk of outputs[0].output as OutputChunk[]) {
          if (
            isOutputChunk(chunk) &&
            chunk.isEntry &&
            chunk.facadeModuleId === tempEntryPath
          ) {
            entryPointChunk = chunk;
          } else if (isOutputChunk(chunk)) {
            modulePreloads.push(join('/', chunk.fileName));
          }

          if (isOutputChunk(chunk)) {
            const fullOutputPath = resolveSafeOutputPath(
              outDir,
              chunk.fileName,
            );
            const code = chunk.code;
            if (!fs.existsSync(dirname(fullOutputPath))) {
              fs.mkdirSync(dirname(fullOutputPath), { recursive: true });
            }
            fs.writeFileSync(fullOutputPath, code);
          }
        }

        Logger.success(
          `${adapter.framework} integration build completed in MPA mode, entryPoint: ${entryPointChunk ? join('/', entryPointChunk.fileName) : ''}`,
          buildElapsed(),
        );

        return {
          entryPoint: entryPointChunk
            ? join('/', entryPointChunk.fileName)
            : '',
          modulePreloads,
        };
      }
      throw new Error('vite did not generate output file');
    } catch (error) {
      Logger.error(
        `${adapter.framework} integration build failed in MPA mode: ${formatErrorMessage(error)}`,
        buildElapsed(),
      );
      throw error;
    } finally {
      try {
        if (fs.existsSync(tempEntryPath)) {
          fs.unlinkSync(tempEntryPath);
          Logger.info('temporary files cleaned up');
        }
      } catch (cleanupError) {
        Logger.warn(
          `temporary file cleanup failed: ${formatErrorMessage(cleanupError)}`,
          buildElapsed(),
        );
      }
      buildPromiseByKey.delete(buildKey);
    }
  })();

  buildPromiseByKey.set(buildKey, buildPromise);
  return buildPromise;
};
