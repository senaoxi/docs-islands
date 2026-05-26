import { defineConfig, type ViteUserConfig } from 'vitest/config';

// Logger assertions compare message text; terminal colors split those strings.
delete process.env.FORCE_COLOR;
process.env.NO_COLOR = '1';

const config: ViteUserConfig = defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['**/__tests__/**/*.spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', './playground/**/*.*'],
    testTimeout: 20_000,
    isolate: false,
    hookTimeout: 30_000,
    clearMocks: true,
    restoreMocks: true,
    watch: false,
  },
});

export default config;
