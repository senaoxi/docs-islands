import { describe, expect, it } from 'vitest';
import {
  createDocsRuntimeModuleResolver,
  createInlinePageRequest,
  isInlinePageRequest,
} from '../module-resolution';

describe('module resolution contracts', () => {
  it('marks inline page requests with the shared query key', () => {
    expect(createInlinePageRequest('/guide/getting-started')).toBe(
      '/guide/getting-started?__INLINE_PATH_RESOLVER__',
    );
    expect(
      isInlinePageRequest(
        '/guide/getting-started?foo=1&__INLINE_PATH_RESOLVER__',
      ),
    ).toBe(true);
  });

  it('wraps a runtime resolveId implementation into page/document helpers', async () => {
    const resolver = createDocsRuntimeModuleResolver({
      async resolveId(id) {
        if (id === '/guide/getting-started?__INLINE_PATH_RESOLVER__') {
          return { id: '/repo/docs/guide/getting-started.md' };
        }

        if (
          id === '/repo/docs/guide/getting-started.md?__INLINE_PATH_RESOLVER__'
        ) {
          return { id: '/guide/getting-started' };
        }

        return null;
      },
    });

    await expect(
      resolver.resolvePagePathToDocumentModuleId('/guide/getting-started'),
    ).resolves.toBe('/repo/docs/guide/getting-started.md');
    await expect(
      resolver.resolveDocumentModuleIdToPagePath(
        '/repo/docs/guide/getting-started.md',
      ),
    ).resolves.toBe('/guide/getting-started');
  });
});
