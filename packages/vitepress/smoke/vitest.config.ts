import { loadEnv } from '@docs-islands/utils/env';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = path.resolve(root, '../../..');
const resultsDir = path.join(
  repoRoot,
  '.smoke/test-results',
  'vitepress-smoke',
);
const { ci: isCi } = loadEnv();
const timeout = 300_000;

export default defineConfig({
  root,
  test: {
    allowOnly: !isCi,
    attachmentsDir: path.join(resultsDir, 'attachments'),
    environment: 'node',
    expect: {
      poll: {
        timeout: 15_000,
      },
    },
    fileParallelism: false,
    globals: true,
    hookTimeout: timeout,
    include: ['**/*.spec.ts'],
    maxConcurrency: 1,
    maxWorkers: 1,
    outputFile: {
      json: path.join(resultsDir, 'results.json'),
    },
    pool: 'forks',
    reporters: ['default', 'json'],
    retry: isCi ? 1 : 0,
    sequence: {
      concurrent: false,
    },
    teardownTimeout: timeout,
    testTimeout: timeout,
  },
}) as ReturnType<typeof defineConfig>;
