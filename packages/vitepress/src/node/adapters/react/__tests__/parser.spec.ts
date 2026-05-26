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
