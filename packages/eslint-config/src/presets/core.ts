import typescriptESlintParser from '@typescript-eslint/parser';
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

  globalIgnores(['docs/**', 'playground/**']),
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

  // Tooling config files - disable typed linting
  {
    files: ['vitest.config.ts', 'rolldown.*config.ts', 'packagePlugin.ts'],
    languageOptions: {
      // Tooling config files - parse TS syntax without TS project services.
      parser: typescriptESlintParser,
      parserOptions: {
        projectService: false,
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
