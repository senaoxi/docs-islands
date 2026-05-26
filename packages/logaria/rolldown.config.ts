import licensePlugin from '@docs-islands/plugin-license';
import { isNodeLikeBuiltin } from '@docs-islands/utils/builtin';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, resolve } from 'node:url';
import { defineConfig, type RolldownOptions } from 'rolldown';
import { dts } from 'rolldown-plugin-dts';
import pkg from './package.json' with { type: 'json' };
import packagePlugin from './packagePlugin';

const sourcemap = process.env.DOCS_ISLANDS_SOURCEMAP === 'true';
const minify = process.env.DOCS_ISLANDS_MINIFY === 'true';
const __dirname = fileURLToPath(new URL('.', import.meta.url));
let hasCleanedDist = false;

const externalDeps = [
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.peerDependencies || {}),
  // @ts-expect-error No type checking is needed here.
  ...Object.keys(pkg.optionalDependencies ?? {}),
];
const isExternalDependency = (id: string): boolean =>
  externalDeps.some((dep) => id === dep || id.startsWith(`${dep}/`));

const neutralConfig: RolldownOptions = defineConfig({
  input: {
    index: 'src/index.ts',
    'helper/index': 'src/helper/index.ts',
    'core/index': 'src/core/index.ts',
    'core/helper/index': 'src/core/helper/index.ts',
  },
  platform: 'neutral',
  preserveEntrySignatures: 'strict',
  external: isExternalDependency,
  plugins: [
    {
      name: 'rolldown-plugin-clean-dist',
      async buildStart() {
        if (hasCleanedDist) {
          return;
        }

        hasCleanedDist = true;
        await rm(resolve(__dirname, 'dist'), {
          force: true,
          recursive: true,
        });
      },
    },
    licensePlugin(
      path.resolve(__dirname, 'LICENSE.md'),
      'logaria license',
      'logaria',
    ),
    packagePlugin(),
    {
      name: 'rolldown-plugin-copy-readme',
      generateBundle: {
        order: 'post',
        async handler() {
          this.emitFile({
            type: 'asset',
            source: await readFile(resolve(__dirname, 'README.md'), 'utf8'),
            fileName: 'README.md',
          });
          this.emitFile({
            type: 'asset',
            source: await readFile(
              resolve(__dirname, 'README.zh-CN.md'),
              'utf8',
            ),
            fileName: 'README.zh-CN.md',
          });
          this.emitFile({
            type: 'asset',
            source: await readFile(resolve(__dirname, 'LICENSE.md'), 'utf8'),
            fileName: 'LICENSE.md',
          });
        },
      },
    },
  ],
  output: {
    dir: 'dist',
    entryFileNames: '[name].js',
    chunkFileNames: 'chunks/dep-[hash].js',
    exports: 'named',
    format: 'esm',
    sourcemap,
    ...(minify && {
      minify: {
        compress: true,
        mangle: false,
        codegen: {
          removeWhitespace: false,
        },
      },
    }),
  },
});

const pluginConfig = defineConfig({
  input: {
    'plugin/index': 'src/plugin/index.ts',
  },
  platform: 'node',
  preserveEntrySignatures: 'strict',
  external: (id) => {
    if (
      isNodeLikeBuiltin(id) ||
      isExternalDependency(id) ||
      id.endsWith('.node')
    ) {
      return true;
    }
    return false;
  },
  plugins: [
    {
      name: 'rolldown-plugin-clean-dist',
      async buildStart() {
        if (hasCleanedDist) {
          return;
        }

        hasCleanedDist = true;
        await rm(resolve(__dirname, 'dist'), {
          force: true,
          recursive: true,
        });
      },
    },
  ],
  output: {
    dir: 'dist',
    entryFileNames: '[name].js',
    chunkFileNames: 'chunks/dep-[hash].js',
    exports: 'named',
    format: 'esm',
    sourcemap,
    ...(minify && {
      minify: {
        compress: true,
        mangle: false,
        codegen: {
          removeWhitespace: false,
        },
      },
    }),
  },
});

const dtsConfig: RolldownOptions = defineConfig({
  input: {
    index: 'src/index.ts',
    'helper/index': 'src/helper/index.ts',
    'core/index': 'src/core/index.ts',
    'core/helper/index': 'src/core/helper/index.ts',
    'plugin/index': 'src/plugin/index.ts',
    'types/index': 'src/types/index.ts',
  },
  external: isExternalDependency,
  plugins: [
    dts({
      tsconfig: 'tsconfig.lib.json',
      emitDtsOnly: true,
      sourcemap,
    }),
  ],
});

const rolldownConfig: RolldownOptions[] = [
  neutralConfig,
  pluginConfig,
  dtsConfig,
];

export default rolldownConfig;
