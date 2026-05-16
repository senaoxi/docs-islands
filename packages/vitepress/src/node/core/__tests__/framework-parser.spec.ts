/**
 * @vitest-environment node
 */
import {
  createEmptyCompilationContainer,
  RenderController,
} from '@docs-islands/core/node/render-controller';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RenderingFrameworkParser } from '../framework-parser';
import { RenderingFrameworkParserManager } from '../framework-parser';

const mockError = vi.fn();
const TEST_LOGGER_SCOPE_ID = 'framework-parser-test-scope';
const getTestLoggerScopeId = () => TEST_LOGGER_SCOPE_ID;

vi.mock('../../logger', () => ({
  getVitePressGroupLogger: () => ({
    debug: vi.fn(),
    error: mockError,
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
  }),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

function createTestModuleResolver() {
  return {
    resolveDocumentModuleIdToPagePath: vi.fn(),
    resolveId: vi.fn(),
    resolvePagePathToDocumentModuleId: vi.fn(),
  } as any;
}

function createFakeParser({
  framework,
  lang,
  calls,
}: {
  framework: string;
  lang: string;
  calls: string[];
}): { controller: RenderController; parser: RenderingFrameworkParser } {
  const controller = new RenderController();

  const parser: RenderingFrameworkParser = {
    framework,
    lang,
    renderController: controller,
    async parseScript({ script }) {
      calls.push(`parse:${framework}`);

      const componentReferences = new Map<
        string,
        { identifier: string; importedName: string }
      >();
      const importStatementRE =
        /import\s+(?<local>[A-Z][\dA-Za-z]*)\s+from\s+["'][^"']+["']/g;

      for (const match of script.content.matchAll(importStatementRE)) {
        const localName = match.groups?.local;
        if (!localName) {
          continue;
        }

        componentReferences.set(localName, {
          identifier: `/${framework}/${localName}.tsx`,
          importedName: 'default',
        });
      }

      return {
        componentReferences,
      };
    },
    async transformMarkdown({ code, parsedScript }) {
      calls.push(`transform:${framework}`);

      const compilationContainer = createEmptyCompilationContainer();
      const usedSnippetContainer = new Map();
      let nextCode = code;

      for (const [
        componentName,
        importInfo,
      ] of parsedScript.componentReferences) {
        if (!new RegExp(`<${componentName}\\b`).test(nextCode)) {
          continue;
        }

        compilationContainer.importsByLocalName.set(componentName, importInfo);
        nextCode = nextCode.replaceAll(
          new RegExp(`<${componentName}(\\s*/>)`, 'g'),
          `<${componentName} data-framework="${framework}"$1`,
        );
      }

      return {
        code: nextCode,
        compilationContainer,
        map: null,
        usedSnippetContainer,
      };
    },
  };

  return {
    controller,
    parser,
  };
}

describe('RenderingFrameworkParserManager', () => {
  it('runs registered parsers in order and stores framework-scoped containers for mixed pages', async () => {
    const calls: string[] = [];
    const manager = new RenderingFrameworkParserManager(getTestLoggerScopeId);
    const react = createFakeParser({
      calls,
      framework: 'react',
      lang: 'react',
    });
    const solid = createFakeParser({
      calls,
      framework: 'solid',
      lang: 'solid',
    });

    manager.registerParser(react.parser);
    manager.registerParser(solid.parser);

    const result = await manager.transformMarkdown(
      `<script lang="react">import ReactCard from './ReactCard'</script>
<script lang="solid">import SolidBadge from './SolidBadge'</script>
<ReactCard />
<SolidBadge />`,
      '/guide/mixed.md',
      createTestModuleResolver(),
    );

    expect(calls).toEqual([
      'parse:react',
      'parse:solid',
      'transform:react',
      'transform:solid',
    ]);
    expect(result.code).toContain('data-framework="react"');
    expect(result.code).toContain('data-framework="solid"');
    expect(result.code).not.toContain('<script lang="react">');
    expect(result.code).not.toContain('<script lang="solid">');
    const reactContainer =
      await react.controller.getCompilationContainerByMarkdownModuleId(
        'react',
        '/guide/mixed.md',
      );
    const solidContainer =
      await solid.controller.getCompilationContainerByMarkdownModuleId(
        'solid',
        '/guide/mixed.md',
      );
    expect(reactContainer.importsByLocalName.has('ReactCard')).toBe(true);
    expect(solidContainer.importsByLocalName.has('SolidBadge')).toBe(true);
  });

  it('errors and strips all recognized scripts when one framework declares multiple script blocks', async () => {
    const calls: string[] = [];
    const manager = new RenderingFrameworkParserManager(getTestLoggerScopeId);
    const react = createFakeParser({
      calls,
      framework: 'react',
      lang: 'react',
    });

    manager.registerParser(react.parser);
    mockError.mockClear();

    const input = `<script lang="react">import A from './A'</script><script lang="react">import B from './B'</script>
<A />`;
    const result = await manager.transformMarkdown(
      input,
      '/guide/double-react.md',
      createTestModuleResolver(),
    );

    expect(mockError).toHaveBeenCalledWith(
      'Single file can contain only one <script lang="react"> element.',
      expect.objectContaining({
        elapsedTimeMs: expect.any(Number),
      }),
    );
    expect(result.code).not.toContain('<script lang="react">');
    expect(result.code.split('\n')).toHaveLength(input.split('\n').length);
    const reactContainer =
      await react.controller.getCompilationContainerByMarkdownModuleId(
        'react',
        '/guide/double-react.md',
      );
    expect(reactContainer.importsByLocalName.size).toBe(0);
    expect(calls).toEqual([]);
  });

  it('errors when multiple frameworks reuse the same local component name on one page', async () => {
    const calls: string[] = [];
    const manager = new RenderingFrameworkParserManager(getTestLoggerScopeId);
    const react = createFakeParser({
      calls,
      framework: 'react',
      lang: 'react',
    });
    const solid = createFakeParser({
      calls,
      framework: 'solid',
      lang: 'solid',
    });

    manager.registerParser(react.parser);
    manager.registerParser(solid.parser);
    mockError.mockClear();

    const result = await manager.transformMarkdown(
      `<script lang="react">import Button from './ReactButton'</script>
<script lang="solid">import Button from './SolidButton'</script>
<Button />`,
      '/guide/conflict.md',
      createTestModuleResolver(),
    );

    expect(mockError).toHaveBeenCalledWith(
      'Duplicate component local name "Button" found across rendering frameworks in /guide/conflict.md. Rename one of the imports before mixing frameworks on the same page.',
      expect.objectContaining({
        elapsedTimeMs: expect.any(Number),
      }),
    );
    expect(result.code).not.toContain('<script lang="react">');
    expect(result.code).not.toContain('<script lang="solid">');
    expect(result.code).toContain('<Button />');
    const reactContainer =
      await react.controller.getCompilationContainerByMarkdownModuleId(
        'react',
        '/guide/conflict.md',
      );
    const solidContainer =
      await solid.controller.getCompilationContainerByMarkdownModuleId(
        'solid',
        '/guide/conflict.md',
      );
    expect(reactContainer.importsByLocalName.size).toBe(0);
    expect(solidContainer.importsByLocalName.size).toBe(0);
    expect(calls).toEqual(['parse:react', 'parse:solid']);
  });

  it('leaves unclaimed script blocks untouched', async () => {
    const manager = new RenderingFrameworkParserManager(getTestLoggerScopeId);
    const react = createFakeParser({
      calls: [],
      framework: 'react',
      lang: 'react',
    });

    manager.registerParser(react.parser);

    const result = await manager.transformMarkdown(
      `<script lang="ts">console.log('stay')</script>
<Demo />`,
      '/guide/plain.md',
      createTestModuleResolver(),
    );

    expect(result.code).toContain(
      `<script lang="ts">console.log('stay')</script>`,
    );
    expect(result.map).toBeNull();
  });
});
