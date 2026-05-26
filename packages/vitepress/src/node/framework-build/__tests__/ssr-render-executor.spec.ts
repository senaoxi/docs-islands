/**
 * @vitest-environment node
 */
import type {
  ComponentBundleInfo,
  UsedSnippetContainerType,
} from '#dep-types/component';
import { resetScopedLoggerConfig, setScopedLoggerConfig } from 'logaria/core';
import fs, { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'pathe';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { UIFrameworkBuildAdapter } from '../adapter';
import { executeSSRRender } from '../ssr-bundle/ssr-render-executor';

const TEST_LOGGER_SCOPE_ID = 'ssr-render-executor-test-scope';
const renderId = 'demo-render-id';

let tempDirs: string[] = [];

const createTempDir = () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'docs-islands-ssr-render-'));
  tempDirs.push(tempDir);
  return tempDir;
};

const createChunk = (fileName: string) =>
  ({
    fileName,
    isEntry: true,
    name: 'Demo',
    type: 'chunk',
  }) as any;

const createSsrComponents = (): ComponentBundleInfo[] => [
  {
    componentName: 'Demo',
    componentPath: '/virtual/Demo.tsx',
    importReference: {
      identifier: '/virtual/Demo.tsx',
      importedName: 'default',
    },
    pendingRenderIds: new Set([renderId]),
    renderDirectives: new Set(['ssr:only']),
  },
];

const createUsedSnippetContainer = () =>
  new Map<string, UsedSnippetContainerType>([
    [
      renderId,
      {
        props: new Map([['title', 'Hello']]),
        renderComponent: 'Demo',
        renderDirective: 'ssr:only',
        renderId,
        useSpaSyncRender: true,
      },
    ],
  ]);

const createAdapter = (
  renderToString: UIFrameworkBuildAdapter['renderToString'],
): UIFrameworkBuildAdapter => ({
  browserBundlerPlugins: () => [],
  clientEntryImportName: () => 'clientEntry',
  clientEntryModule: () => '/virtual/client-entry',
  createClientLoaderModuleSource: () => '',
  framework: 'test',
  renderToString,
  ssrBundlerPlugins: () => [],
});

afterEach(() => {
  resetScopedLoggerConfig(TEST_LOGGER_SCOPE_ID);
  for (const tempDir of tempDirs) {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
  tempDirs = [];
});

beforeEach(() => {
  setScopedLoggerConfig(TEST_LOGGER_SCOPE_ID, {});
});

describe('executeSSRRender', () => {
  it('rejects when the SSR bundle cannot be imported', async () => {
    const tempDir = createTempDir();

    await expect(
      executeSSRRender(
        createChunk('missing.mjs'),
        createSsrComponents(),
        tempDir,
        createAdapter(async () => '<div>unused</div>'),
        createUsedSnippetContainer(),
        TEST_LOGGER_SCOPE_ID,
        new Map(),
      ),
    ).rejects.toThrow('failed to import SSR bundle for Demo:');
  });

  it('rejects when the SSR bundle does not expose a default component', async () => {
    const tempDir = createTempDir();
    fs.writeFileSync(join(tempDir, 'demo.mjs'), 'export const Demo = 1;\n');

    await expect(
      executeSSRRender(
        createChunk('demo.mjs'),
        createSsrComponents(),
        tempDir,
        createAdapter(async () => '<div>unused</div>'),
        createUsedSnippetContainer(),
        TEST_LOGGER_SCOPE_ID,
        new Map(),
      ),
    ).rejects.toThrow('Component "Demo" not found in SSR bundle');
  });

  it('rejects when renderToString fails for a render id', async () => {
    const tempDir = createTempDir();
    fs.writeFileSync(
      join(tempDir, 'demo.mjs'),
      'export default function Demo() { return null; }\n',
    );

    await expect(
      executeSSRRender(
        createChunk('demo.mjs'),
        createSsrComponents(),
        tempDir,
        createAdapter(async () => {
          throw new Error('render exploded');
        }),
        createUsedSnippetContainer(),
        TEST_LOGGER_SCOPE_ID,
        new Map(),
      ),
    ).rejects.toThrow(
      'failed to render component "Demo" for render ID demo-render-id: render exploded',
    );
  });
});
