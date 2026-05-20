import eslintGeneralConfig from '@docs-islands/eslint-config';
import { defineConfig } from 'eslint/config';

export default defineConfig([
  ...eslintGeneralConfig,

  {
    rules: {
      'no-restricted-syntax': 'off',
      'no-console': 'off',
    },
  },
  {
    files: ['./bin/*.ts', './bin/*.mjs'],
    rules: {
      'n/hashbang': 'off',
    },
  },
  {
    files: ['./src/dom-iterable.ts'],
    rules: {
      'unicorn/prefer-spread': 'off',
    },
  },
]);
