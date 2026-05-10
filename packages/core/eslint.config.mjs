import {
  baseScriptFileRules,
  baseTestFileRules,
  supportedEcmaVersion,
  testFilePatterns,
} from '@docs-islands/eslint-config/config';
import { createLoggerPlugin } from '@docs-islands/eslint-config/plugins';
import { core } from '@docs-islands/eslint-config/presets';
import typescriptESlintParser from '@typescript-eslint/parser';
import { defineConfig } from 'eslint/config';
import globals from 'globals';

export default defineConfig([
  ...core,

  {
    name: 'Create Logger Boundary',
    files: ['**/*.{js,mjs,cjs,jsx,mjsx,ts,mts,cts,tsx,mtsx}'],
    plugins: {
      '@docs-islands/core': createLoggerPlugin,
    },
    ignores: [
      'docs/**',
      'playground/**',
      'smoke/**',
      '**/__tests__/**',
      '**/tests/**',
      '**/fixtures/**',
      '**/*.test.*',
      '**/*.spec.*',
    ],
    rules: {
      '@docs-islands/core/unified-log-entry': 'error',
    },
  },
  {
    rules: {
      '@typescript-eslint/no-inferrable-types': 'off',
      'no-restricted-syntax': 'off',
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
    files: testFilePatterns,
    rules: baseTestFileRules,
  },
]);
