/**
 * @vitest-environment node
 */
import { describe, expect, it, vi } from 'vitest';
import { createVitePressLifecycleAdapter } from '../vitepress-lifecycle-adapter';

const { onContentUpdated } = vi.hoisted(() => ({
  onContentUpdated: vi.fn(),
}));

vi.mock('vitepress/client', () => ({
  inBrowser: true,
  onContentUpdated,
}));

vi.mock('../../shared/runtime', () => ({
  getCleanPathname: vi.fn(() => '/guide/runtime'),
}));

describe('createVitePressLifecycleAdapter', () => {
  it('maps VitePress runtime lifecycle into the generic docs lifecycle adapter', () => {
    const adapter = createVitePressLifecycleAdapter();

    expect(adapter.inBrowser).toBe(true);
    expect(adapter.getPageId()).toBe('/guide/runtime');
    expect(adapter.onContentUpdated).toBe(onContentUpdated);
  });
});
