import { loadEnv } from '@docs-islands/utils/env';
import { defineConfig, type RolldownOptions } from 'rolldown';
import { dts } from 'rolldown-plugin-dts';
import packagePlugin from './packagePlugin';

const {
  config: { sourcemap },
} = loadEnv();

const config: RolldownOptions = defineConfig({
  input: 'src/index.ts',
  platform: 'node',
  plugins: [packagePlugin()],
  output: {
    dir: 'dist',
    format: 'esm',
    entryFileNames: 'index.js',
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
