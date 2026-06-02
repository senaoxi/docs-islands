import { fileURLToPath } from 'node:url';
import { defineConfig, type ViteUserConfig } from 'vitest/config';

const config: ViteUserConfig = defineConfig({
  resolve: {
    alias: {
      '#types': fileURLToPath(new URL('types', import.meta.url)),
      '#dep-types': fileURLToPath(new URL('src/types', import.meta.url)),
      '#shared': fileURLToPath(new URL('src/shared', import.meta.url)),
      '@docs-islands/utils/logger': fileURLToPath(
        new URL('src/shared/logger.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: [
      'src/**/__tests__/**/*.{test,spec}.{js,ts,tsx}',
      'scripts/**/__tests__/**/*.{test,spec}.{js,ts,tsx}',
    ],
    testTimeout: 50_000,
    hookTimeout: 30_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportOnFailure: true,
      include: ['src/**/*.{js,ts,tsx}'],
      exclude: ['**/__tests__/**', '**/types/**'],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
      },
    },
    pool: 'threads',
    maxWorkers: 4,
    reporters: ['default', 'json'],
    outputFile: {
      json: './coverage/test-results.json',
    },
    resolveSnapshotPath: (testPath, snapExtension) => {
      return testPath.replace(/\.test\.([jt]sx?)$/, `${snapExtension}.$1`);
    },
    clearMocks: true,
    restoreMocks: true,
    setupFiles: ['./tests/setup.ts'],
    watch: false,
  },
});

export default config;
