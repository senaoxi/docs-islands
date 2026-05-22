import { defineConfig, type RolldownOptions } from 'rolldown';
import { dts } from 'rolldown-plugin-dts';
import packagePlugin from './packagePlugin';
import { loadEnv } from './src/env';

const { config } = loadEnv();
const { sourcemap, minify } = config;

const moduleConfig: RolldownOptions = defineConfig({
  input: {
    builtin: 'src/builtin.ts',
    'dom-iterable': 'src/dom-iterable.ts',
    env: 'src/env.ts',
    'fs-utils': 'src/fs-utils.ts',
    general: 'src/general.ts',
    logger: 'src/logger.ts',
    path: 'src/path.ts',
    'bin/link-guard': 'bin/link-guard.ts',
  },
  platform: 'neutral',
  preserveEntrySignatures: 'strict',
  external: [/^[\w@][^:]/],
  plugins: [packagePlugin()],
  output: {
    dir: 'dist',
    format: 'esm',
    entryFileNames: '[name].js',
    chunkFileNames: 'chunks/dep-[hash].js',
    exports: 'named',
    sourcemap,
    ...(minify && {
      minify: {
        compress: true,
        mangle: false,
        codegen: { removeWhitespace: false },
      },
    }),
  },
});

const dtsConfig: RolldownOptions = defineConfig({
  // All modules must be explicit entries so that Rolldown preserves their
  // full export signatures (e.g. `export { X as default }`).
  // With a single entry + preserveModules, non-entry modules lose `as default`
  // because Rolldown optimises the alias away for internal dependencies.
  //
  // This is a general Rolldown behaviour, not specific to dts:
  // `export { X as default }` (ExportNamedDeclaration) is treated as an
  // optimisable alias, while `export default X` (ExportDefaultDeclaration)
  // is preserved. The dts plugin converts all default exports to the former
  // form during its fake-js transform, so the dts build is always affected.
  // The JS build is only safe when the source uses `export default X` directly.
  input: {
    builtin: 'src/builtin.ts',
    'dom-iterable': 'src/dom-iterable.ts',
    env: 'src/env.ts',
    'fs-utils': 'src/fs-utils.ts',
    general: 'src/general.ts',
    logger: 'src/logger.ts',
    path: 'src/path.ts',
  },
  platform: 'neutral',
  preserveEntrySignatures: 'strict',
  external: [/^[\w@][^:]/],
  plugins: [
    dts({
      tsconfig: './tsconfig.lib.dts.json',
      emitDtsOnly: true,
      sourcemap,
    }),
  ],
});

const rolldownConfig: RolldownOptions[] = [moduleConfig, dtsConfig];

export default rolldownConfig;
