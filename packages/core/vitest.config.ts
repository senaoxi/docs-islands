import { defineConfig, type ViteUserConfig } from 'vitest/config';

const config: ViteUserConfig = defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/__tests__/**/*.{test,spec}.{js,ts,tsx}'],
    testTimeout: 50_000,
    hookTimeout: 30_000,
    clearMocks: true,
    restoreMocks: true,
    setupFiles: ['./tests/setup.ts'],
    watch: false,
  },
});

export default config;
