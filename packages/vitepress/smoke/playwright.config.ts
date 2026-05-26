import { loadEnv } from '@docs-islands/utils/env';
import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = path.resolve(root, '../../..');
const { ci: isCi } = loadEnv();

export default defineConfig({
  expect: {
    timeout: 15_000,
  },
  forbidOnly: isCi,
  fullyParallel: false,
  outputDir: path.join(repoRoot, 'test-results', 'vitepress-smoke'),
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
  reporter: [
    [isCi ? 'dot' : 'list'],
    [
      'html',
      {
        open: 'never',
        outputFolder: path.join(
          repoRoot,
          'playwright-report',
          'vitepress-smoke',
        ),
      },
    ],
  ],
  retries: isCi ? 1 : 0,
  testDir: root,
  testMatch: '**/*.spec.ts',
  timeout: 300_000,
  use: {
    launchOptions: {
      args: isCi ? ['--no-sandbox', '--disable-setuid-sandbox'] : undefined,
    },
    screenshot: 'only-on-failure',
    trace: isCi ? 'on-first-retry' : 'retain-on-failure',
    video: 'off',
  },
  workers: 1,
});
