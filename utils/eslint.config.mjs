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
    files: ['./bin/*.js'],
    rules: {
      'n/hashbang': 'off',
    },
  },
  {
    files: ['./src/client/dom-iterable.ts'],
    rules: {
      'unicorn/prefer-spread': 'off',
    },
  },
]);
