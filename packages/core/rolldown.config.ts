import { isNodeLikeBuiltin } from '@docs-islands/utils/builtin';
import { loadEnv } from '@docs-islands/utils/env';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type RolldownOptions } from 'rolldown';
import { dts } from 'rolldown-plugin-dts';
import pkg from './package.json' with { type: 'json' };
import packagePlugin from './packagePlugin';

const { config } = loadEnv();
const { sourcemap, minify } = config;
const __dirname = fileURLToPath(new URL('.', import.meta.url));

let hasCleanedDist = false;

const externalDeps = [
  ...Object.keys(pkg.dependencies || {}),
  // @ts-expect-error No type checking is needed here.
  ...Object.keys(pkg.peerDependencies ?? {}),
  // @ts-expect-error No type checking is needed here.
  ...Object.keys(pkg.optionalDependencies ?? {}),
];
const isExternalDependency = (id: string): boolean =>
  isNodeLikeBuiltin(id) ||
  externalDeps.some((dep) => id === dep || id.startsWith(`${dep}/`));

const cleanDistPlugin = (): NonNullable<RolldownOptions['plugins']> => ({
  name: 'rolldown-plugin-clean-dist',
  async buildStart() {
    if (hasCleanedDist) {
      return;
    }

    hasCleanedDist = true;
    await rm(path.resolve(__dirname, 'dist'), {
      force: true,
      recursive: true,
    });
  },
});

const moduleEntries: Record<string, string> = {
  index: 'src/index.ts',
  'client/index': 'src/client/index.ts',
  'client/component-manager': 'src/client/component-manager.ts',
  'client/docs-client-integration': 'src/client/docs-client-integration.ts',
  'client/docs-component-manager': 'src/client/docs-component-manager.ts',
  'client/docs-render-strategy': 'src/client/docs-render-strategy.ts',
  'client/dom': 'src/client/dom.ts',
  'client/render-strategy': 'src/client/render-strategy.ts',
  'node/index': 'src/node/index.ts',
  'node/import-reference-resolver': 'src/node/import-reference-resolver.ts',
  'node/module-resolution': 'src/node/module-resolution.ts',
  'node/render-controller': 'src/node/render-controller.ts',
  'node/ssr-container-integration-processor':
    'src/node/ssr-container-integration-processor.ts',
  'node/transform': 'src/node/transform.ts',
  'shared/path': 'src/shared/path.ts',
  'shared/runtime': 'src/shared/runtime.ts',
  'shared/utils': 'src/shared/utils.ts',
  'shared/constants/hmr': 'src/shared/constants/hmr.ts',
  'shared/constants/page-metafile': 'src/shared/constants/page-metafile.ts',
  'shared/constants/render-strategy': 'src/shared/constants/render-strategy.ts',
  'shared/constants/runtime': 'src/shared/constants/runtime.ts',
  'shared/constants/log-groups/runtime':
    'src/shared/constants/log-groups/runtime.ts',
  'shared/constants/log-groups/transform':
    'src/shared/constants/log-groups/transform.ts',
};

const dtsEntries: Record<string, string> = {
  ...moduleEntries,
  'types/index': 'src/types/index.ts',
  'types/client': 'src/types/client.ts',
  'types/component': 'src/types/component.ts',
  'types/page': 'src/types/page.ts',
  'types/render': 'src/types/render.ts',
};

const moduleConfig: RolldownOptions = defineConfig({
  input: moduleEntries,
  platform: 'neutral',
  preserveEntrySignatures: 'strict',
  external: isExternalDependency,
  plugins: [cleanDistPlugin(), packagePlugin()],
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
  input: dtsEntries,
  platform: 'neutral',
  preserveEntrySignatures: 'strict',
  external: isExternalDependency,
  plugins: [
    dts({
      tsconfig: 'tsconfig.lib.json',
      emitDtsOnly: true,
      sourcemap,
    }),
  ],
});

const rolldownConfig: RolldownOptions[] = [moduleConfig, dtsConfig];

export default rolldownConfig;
