import { loadEnv } from '@docs-islands/utils/env';
import { defineConfig, type RolldownOptions } from 'rolldown';
import { dts } from 'rolldown-plugin-dts';

const {
  config: { sourcemap },
} = loadEnv();

const config: RolldownOptions = defineConfig({
  input: 'src/index.ts',
  platform: 'node',
  output: {
    dir: 'dist',
    format: 'esm',
    entryFileNames: 'index.mjs',
    sourcemap,
  },
});

const dtsConfig: RolldownOptions = defineConfig({
  input: 'src/index.ts',
  platform: 'node',
  external: [/^[\w@][^:]/],
  output: {
    dir: 'dist',
  },
  plugins: [
    dts({
      tsconfig: 'tsconfig.lib.json',
      emitDtsOnly: true,
      sourcemap,
    }),
  ],
});

const rolldownConfig: RolldownOptions[] = [dtsConfig, config];

export default rolldownConfig;
