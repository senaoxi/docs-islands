import eslintGeneralConfig from '@docs-islands/eslint-config';
import {
  baseScriptFileRules,
  baseTestFileRules,
  testFilePatterns,
} from '@docs-islands/eslint-config/config';
import { defineConfig } from 'eslint/config';

export default defineConfig([
  ...eslintGeneralConfig,

  {
    rules: {
      'no-console': 'off',
      'no-restricted-syntax': 'off',
    },
  },
  {
    files: testFilePatterns,
    rules: baseTestFileRules,
  },
  {
    files: ['scripts/*.ts'],
    rules: baseScriptFileRules,
  },
]);
