import {
  baseScriptFileRules,
  baseTestFileRules,
  supportedEcmaVersion,
  testFilePatterns,
} from '@docs-islands/eslint-config/config';
import { core } from '@docs-islands/eslint-config/presets';
import typescriptESlintParser from '@typescript-eslint/parser';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';

export default defineConfig([
  ...core,

  // Ignore intentionally empty .d.ts files for runtime modules
  globalIgnores(['src/shared/internal/client-runtime.d.ts']),

  {
    rules: {
      // https://typescript-eslint.io/rules/no-inferrable-types/#when-not-to-use-it
      '@typescript-eslint/no-inferrable-types': 'off',
    },
  },
  {
    files: ['scripts/*.ts', 'smoke/**/*.ts'],
    languageOptions: {
      parser: typescriptESlintParser,
      parserOptions: {
        projectService: true,
        ecmaVersion: supportedEcmaVersion,
        sourceType: 'module',
      },
      globals: {
        ...globals.node,
      },
    },
    rules: baseScriptFileRules,
  },
  {
    files: ['scripts/release.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  {
    files: testFilePatterns,
    rules: baseTestFileRules,
  },
]);
