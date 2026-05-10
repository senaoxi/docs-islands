import type { defineConfig } from 'eslint/config';
import { baseTestFileRules, testFilePatterns } from '../config';
import eslintGeneralConfig from '../general';

type Config = ReturnType<typeof defineConfig>;

const config: Config = [
  ...eslintGeneralConfig,

  // E2E test files - allow test-specific patterns
  {
    files: testFilePatterns,
    rules: {
      ...baseTestFileRules,

      // Playground-specific overrides for E2E tests
      // Tests can have long setup/teardown sequences and multiple test cases in describe blocks
      'max-lines-per-function': [
        'warn',
        { max: 400, skipBlankLines: true, skipComments: true },
      ],
      'max-lines': [
        'warn',
        { max: 800, skipBlankLines: true, skipComments: true },
      ],

      // Test scenarios can be complex with many conditional branches
      complexity: ['warn', { max: 30 }],
      'max-depth': ['warn', 8],

      // Allow nested describes and hooks
      'max-nested-callbacks': ['warn', 8],

      // Tests often use magic numbers for timeouts and retries
      'no-magic-numbers': 'off',

      // Allow empty catch blocks in tests for expected failures
      'no-empty': ['error', { allowEmptyCatch: true }],

      // Keep `any` visible in playground tests because broad mocks spread easily.
      '@typescript-eslint/no-explicit-any': 'warn',

      'unicorn/prefer-module': 'off',
    },
  },
];

export default config;
