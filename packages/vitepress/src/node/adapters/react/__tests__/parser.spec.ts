/**
 * @vitest-environment node
 */
import { RenderController } from '@docs-islands/core/node/render-controller';
import { describe, expect, it, vi } from 'vitest';
import { REACT_FRAMEWORK } from '../../../constants/adapters/react/framework';
import { createReactFrameworkParser } from '../parser';

const TEST_LOGGER_SCOPE_ID = 'react-parser-test-scope';

const mockError = vi.fn();
const mockWarn = vi.fn();

vi.mock('../../../logger', () => ({
  getVitePressGroupLogger: () => ({
    debug: vi.fn(),
    error: mockError,
    info: vi.fn(),
    success: vi.fn(),
    warn: mockWarn,
  }),
}));

const createParser = () =>
  createReactFrameworkParser({
    loggerScopeId: TEST_LOGGER_SCOPE_ID,
    renderController: new RenderController(),
    siteConfig: {
      srcDir: '/project/docs',
    },
  } as any);

const createScriptContext = (
  content: string,
  moduleResolver: { resolveId: (id: string, importer?: string) => unknown },
) => ({
  id: '/project/docs/guide/fail-fast.md',
  moduleResolver: moduleResolver as any,
  normalizedId: '/project/docs/guide/fail-fast.md',
  script: {
    attrs: ` lang="${REACT_FRAMEWORK}"`,
    content,
    endIndex: content.length,
    framework: REACT_FRAMEWORK,
    lang: REACT_FRAMEWORK,
    startIndex: 0,
  },
});

describe('createReactFrameworkParser', () => {
  it('resolves static component imports from the installed lexer shape', async () => {
    const parser = createParser();
    const resolveId = vi.fn(async (id: string) => ({
      id: `/project/docs/components/${id.split('/').at(-1)}`,
    }));

    const result = await parser.parseScript(
      createScriptContext(
        `import Foo from '../components/Foo.tsx';
import { Bar as Baz } from '../components/Bar.tsx';
import type Ghost from '../components/Ghost.tsx';
export * from '../components/Star.tsx';
import('./Dynamic.tsx');
import.meta.url;`,
        { resolveId },
      ),
    );

    expect(resolveId).toHaveBeenCalledTimes(2);
    expect(resolveId).toHaveBeenNthCalledWith(
      1,
      '../components/Foo.tsx',
      '/project/docs/guide/fail-fast.md',
    );
    expect(resolveId).toHaveBeenNthCalledWith(
      2,
      '../components/Bar.tsx',
      '/project/docs/guide/fail-fast.md',
    );
    expect([...result.componentReferences]).toEqual([
      [
        'Foo',
        {
          identifier: '/project/docs/components/Foo.tsx',
          importedName: 'default',
        },
      ],
      [
        'Baz',
        { identifier: '/project/docs/components/Bar.tsx', importedName: 'Bar' },
      ],
    ]);
  });

  it('throws a contextual error when React script JavaScript parsing fails', async () => {
    const parser = createParser();

    await expect(
      parser.parseScript(
        createScriptContext('import { from "./Broken";', {
          resolveId: vi.fn(),
        }),
      ),
    ).rejects.toThrow(
      'Failed to parse JavaScript in <script lang="react"> for /project/docs/guide/fail-fast.md:',
    );
  });

  it('throws a contextual error when an import statement cannot be parsed', async () => {
    const parser = createParser();

    await expect(
      parser.parseScript(
        createScriptContext(`import Foo, { Bar as } from './Foo'`, {
          resolveId: vi.fn(),
        }),
      ),
    ).rejects.toThrow(
      'Failed to parse import statement in <script lang="react"> for /project/docs/guide/fail-fast.md:',
    );
  });

  it('throws a contextual error when a component import cannot be resolved', async () => {
    const parser = createParser();

    await expect(
      parser.parseScript(
        createScriptContext(`import Foo from './Foo';`, {
          resolveId: vi.fn(async () => null),
        }),
      ),
    ).rejects.toThrow(
      'Failed to resolve final import reference ./Foo#default in /project/docs/guide/fail-fast.md while registering React component "Foo".',
    );
  });
});
