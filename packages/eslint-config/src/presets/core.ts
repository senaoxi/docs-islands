import typescriptESlintParser from '@typescript-eslint/parser';
import vitest from '@vitest/eslint-plugin';
import type { defineConfig } from 'eslint/config';
import { globalIgnores } from 'eslint/config';
import { untypedTypeScriptRules } from '../config';
import { supportedEcmaVersion } from '../config/constants';
import eslintGeneralConfig from '../general';

type Config = ReturnType<typeof defineConfig>;

/**
 * Core structure of generic output packages and lint rules:
 * - packages
 *   - packageName (monorepo)
 *     - docs (monorepo)
 *     - playground (monorepo)
 *     - smoke (monorepo)
 *     - src
 *       - client
 *       - node
 *       - shared
 *       - types
 *     - utils
 *     - types
 *     - vitest.config.ts
 *     - rolldown.config.ts
 *     - packagePlugin.ts
 */
const config: Config = [
  ...eslintGeneralConfig,

  globalIgnores(['docs/**', 'playground/**', 'smoke/**']),
  // Core rendering files - complex rendering logic requires flexibility
  {
    files: ['src/client/**/*.ts', 'src/node/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', 'require', '__dirname', '__filename'],
      complexity: ['warn', { max: 25 }], // Balanced: strict enough to encourage refactoring, loose enough for rendering logic
      'max-lines-per-function': [
        'warn',
        { max: 300, skipBlankLines: true, skipComments: true },
      ], // Encourages breaking down large functions while allowing complex rendering
      'max-lines': [
        'warn',
        { max: 800, skipBlankLines: true, skipComments: true },
      ], // Aligns with industry standards while accommodating core complexity
      'max-depth': ['warn', 6], // Reduced from 10: encourages early returns and guard clauses
    },
  },

  // Shared runtime files - allow complexity for runtime optimizations
  {
    files: ['src/shared/**/*.ts'],
    rules: {
      'max-lines-per-function': [
        'warn',
        { max: 200, skipBlankLines: true, skipComments: true },
      ], // Runtime functions can be long
      complexity: 'off', // Runtime code can be complex for performance
      'max-depth': 'off', // Runtime optimizations may need deep nesting
    },
  },

  // Utils files - allow complexity for utility functions
  {
    files: ['utils/*.ts'],
    rules: {
      complexity: ['warn', { max: 25 }], // Utils can be more complex
      'max-lines-per-function': [
        'warn',
        { max: 200, skipBlankLines: true, skipComments: true },
      ],
    },
  },

  // Core Vitest specs - community recommended test semantics.
  // Keep the generic test relaxations in ../general, and only add Vitest-aware
  // rules here for core package __tests__/*.spec.ts modules.
  {
    name: 'Core Vitest Specs',
    files: ['**/__tests__/**/*.spec.ts'],
    plugins: {
      vitest,
    },
    languageOptions: {
      globals: {
        ...vitest.environments.env.globals,
      },
    },
    rules: {
      ...vitest.configs.recommended.rules,

      // Keep test suites readable without banning nested describe entirely.
      'vitest/max-nested-describe': ['warn', { max: 3 }],

      // Useful in large OSS suites: these catch accidental focused/skipped
      // tests before CI/release, while recommended already covers the basics.
      'vitest/no-focused-tests': 'error',
      'vitest/no-disabled-tests': 'warn',
      'vitest/no-commented-out-tests': 'warn',
      'vitest/no-identical-title': 'error',

      // Prefer clearer async assertion styles where possible, but keep them as
      // warnings because existing tests may need incremental cleanup.
      'vitest/prefer-expect-resolves': 'warn',
      'vitest/prefer-mock-promise-shorthand': 'warn',
      'vitest/prefer-mock-return-shorthand': 'warn',
      'vitest/prefer-spy-on': 'warn',
    },
  },

  // Tooling config files - disable typed linting
  {
    files: ['vitest.config.ts', 'rolldown.*config.ts', 'packagePlugin.ts'],
    languageOptions: {
      // Tooling config files - parse TS syntax without TS project services.
      parser: typescriptESlintParser,
      parserOptions: {
        projectService: true,
        ecmaVersion: supportedEcmaVersion,
        sourceType: 'module',
      },
    },
    rules: {
      ...untypedTypeScriptRules,
    },
  },
];
export default config;
