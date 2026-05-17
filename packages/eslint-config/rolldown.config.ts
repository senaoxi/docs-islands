import { loadEnv } from '@docs-islands/utils/env';
import { defineConfig, type RolldownOptions } from 'rolldown';
import { dts } from 'rolldown-plugin-dts';

const { config } = loadEnv();
const { sourcemap } = config;

const moduleConfig: RolldownOptions = defineConfig({
  input: {
    general: 'src/general.ts',
    'presets/index': 'src/presets/index.ts',
    'plugins/index': 'src/plugins/index.ts',
    'config/index': 'src/config/index.ts',
  },
  platform: 'neutral',
  preserveEntrySignatures: 'strict',
  external: [/^[\w@][^:]/],
  output: {
    dir: 'dist',
    format: 'esm',
    preserveModules: true,
    sourcemap,
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
    general: 'src/general.ts',
    'presets/index': 'src/presets/index.ts',
    'plugins/index': 'src/plugins/index.ts',
    'config/index': 'src/config/index.ts',
  },
  platform: 'neutral',
  preserveEntrySignatures: 'strict',
  external: [/^[\w@][^:]/],
  output: {
    dir: 'dist',
    preserveModules: true,
  },
  plugins: [
    dts({
      tsconfig: 'tsconfig.source.json',
      emitDtsOnly: true,
      sourcemap,
    }),
  ],
});

const rolldownConfig: RolldownOptions[] = [moduleConfig, dtsConfig];

export default rolldownConfig;
