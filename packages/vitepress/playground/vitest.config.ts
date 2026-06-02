import { loadEnv } from '@docs-islands/utils/env';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const { ci } = loadEnv();

const timeout = 50_000;
const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root,
  test: {
    include: ['**/*.spec.ts'],
    setupFiles: ['vitestSetup.ts'],
    globalSetup: ['vitestGlobalSetup.ts'],
    testTimeout: timeout,
    hookTimeout: timeout,
    teardownTimeout: timeout,
    expect: {
      poll: {
        timeout: 50 * (ci ? 300 : 200),
      },
    },
    globals: true,
    fileParallelism: false,
    sequence: {
      concurrent: false,
    },
    maxConcurrency: 1,
    pool: 'forks',
  },
  esbuild: {
    target: 'node20',
  },
}) as ReturnType<typeof defineConfig>;
