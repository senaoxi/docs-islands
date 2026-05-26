import { supportedEcmaVersion } from '@docs-islands/eslint-config/config';
import { playground } from '@docs-islands/eslint-config/presets';
import typescriptESlintParser from '@typescript-eslint/parser';
import { defineConfig } from 'eslint/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const tsconfigRootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig([
  ...playground,

  {
    files: [
      'client.d.ts',
      'test-utils/**/*.ts',
      'vitest.config.ts',
      'vitestGlobalSetup.ts',
      'vitestSetup.ts',
    ],
    languageOptions: {
      parser: typescriptESlintParser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir,
        ecmaVersion: supportedEcmaVersion,
        sourceType: 'module',
      },
    },
  },
]);
