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

const entries: Record<string, string> = {
  'scripts/link': 'scripts/link.ts',
};

const moduleConfig: RolldownOptions = defineConfig({
  input: entries,
  platform: 'node',
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
  input: entries,
  platform: 'node',
  preserveEntrySignatures: 'strict',
  external: isExternalDependency,
  plugins: [
    dts({
      tsconfig: 'tsconfig.json',
      emitDtsOnly: true,
      sourcemap,
    }),
  ],
});

const rolldownConfig: RolldownOptions[] = [moduleConfig, dtsConfig];

export default rolldownConfig;
