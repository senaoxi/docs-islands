import { defineConfig, type ViteUserConfig } from 'vitest/config';

const config: ViteUserConfig = defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/__tests__/**/*.spec.ts'],
    testTimeout: 50_000,
    hookTimeout: 30_000,
    clearMocks: true,
    restoreMocks: true,
    setupFiles: ['./tests/setup.ts'],
    watch: false,
  },
});

export default config;
