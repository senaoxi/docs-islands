/**
 * @vitest-environment node
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('vitepress/client', () => ({
  inBrowser: false,
  onContentUpdated: vi.fn(),
}));

vi.mock('@docs-islands/utils/logger', () => ({
  createLogger: () => ({
    getLoggerByGroup: () => ({
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      success: vi.fn(),
      warn: vi.fn(),
    }),
  }),
}));

vi.mock('@docs-islands/vitepress/logger', () => ({
  createLogger: () => ({
    getLoggerByGroup: () => ({
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      success: vi.fn(),
      warn: vi.fn(),
    }),
  }),
}));

vi.mock('../../../../shared/runtime', () => ({
  getCleanPathname: vi.fn(() => '/guide/runtime'),
}));

describe('react client adapter entrypoint', () => {
  it('exports reactClient without a default export', async () => {
    const reactClientEntry = await import('../index');

    expect(reactClientEntry.reactClient).toBeTypeOf('function');
    expect('default' in reactClientEntry).toBe(false);
    expect(reactClientEntry).not.toHaveProperty('default');
  });
});
