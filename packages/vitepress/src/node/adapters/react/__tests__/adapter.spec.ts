/**
 * @vitest-environment node
 */
import { describe, expect, it, vi } from 'vitest';
import { REACT_RUNTIME_EXTERNALIZATION_PLUGIN_NAME } from '../../../constants/adapters/react/plugin-names';

vi.mock('@vitejs/plugin-react-swc', () => ({
  default: vi.fn(() => ({
    name: 'mock-react-swc',
  })),
}));

describe('reactAdapter', () => {
  it('keeps build adapter responsibilities focused on bundling and SSR helpers', async () => {
    const { reactAdapter } = await import('../adapter');
    const browserPlugins = reactAdapter.browserBundlerPlugins();

    expect('generateDevRuntime' in reactAdapter).toBe(false);
    expect('constants' in reactAdapter).toBe(false);
    expect(
      browserPlugins.some(
        (plugin) =>
          plugin !== null &&
          plugin !== false &&
          plugin !== undefined &&
          !Array.isArray(plugin) &&
          typeof plugin === 'object' &&
          'name' in plugin &&
          plugin.name === REACT_RUNTIME_EXTERNALIZATION_PLUGIN_NAME,
      ),
    ).toBe(true);
  });
});
