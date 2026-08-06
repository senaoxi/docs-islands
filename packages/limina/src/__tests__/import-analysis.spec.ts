import { resolveModuleNameWithOxc } from '#core/import-analysis/runner';
import {
  collectImportsFromFile,
  createImportAnalysisContext,
  resolveInternalImport,
} from '#core/import-graph/context';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { collectOxcImports } from '../core/import-analysis/oxc-imports';
import { collectRequireImportsFromSourceFile } from '../core/import-analysis/require-bindings';
import { collectTypeScriptImports } from '../core/import-analysis/typescript-imports';
import { createProfilingMetricsRecorder } from '../profiling/metrics';
import { toPortablePath } from './helpers/path';

const requireFromTest = createRequire(import.meta.url);

async function createTempDir(): Promise<string> {
  return await mkdtemp(path.join(tmpdir(), 'limina-import-analysis-'));
}

async function writeText(rootDir: string, filePath: string, text: string) {
  const absolutePath = path.join(rootDir, filePath);

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, text);

  return absolutePath;
}

async function linkCompilerSfc(rootDir: string): Promise<void> {
  const compilerPackagePath = requireFromTest.resolve(
    '@vue/compiler-sfc/package.json',
  );
  const nodeModulesDir = path.join(rootDir, 'node_modules', '@vue');

  await mkdir(nodeModulesDir, {
    recursive: true,
  });
  await symlink(
    path.dirname(compilerPackagePath),
    path.join(nodeModulesDir, 'compiler-sfc'),
    'dir',
  );
}

async function linkAstroCompiler(
  rootDir: string,
  packageName = '@astrojs/compiler',
): Promise<void> {
  const compilerPackagePath = requireFromTest.resolve(
    `${packageName}/package.json`,
  );
  const nodeModulesDir = path.join(rootDir, 'node_modules', '@astrojs');

  await mkdir(nodeModulesDir, { recursive: true });
  await symlink(
    path.dirname(compilerPackagePath),
    path.join(nodeModulesDir, 'compiler'),
    'junction',
  );
}

async function prewarmImportsFromFile(options: {
  context: ReturnType<typeof createImportAnalysisContext>;
  filePath: string;
  packageRootDir: string;
}): Promise<void> {
  const prewarm = options.context.prewarmImportsFromFile;
  if (prewarm === undefined)
    throw new Error('Expected import prewarm support.');
  await prewarm(options.filePath, options.packageRootDir);
}

function createSvelteCompilerSource(options: {
  failMessage?: string;
  version: string;
}): string {
  return [
    `'use strict';`,
    `exports.VERSION = ${JSON.stringify(options.version)};`,
    'exports.parse = function parse(source) {',
    ...(options.failMessage === undefined
      ? []
      : [`  throw new SyntaxError(${JSON.stringify(options.failMessage)});`]),
    '  if (source.includes("<syntax-error>")) throw new SyntaxError("fixture syntax error");',
    '  const root = { instance: null, module: null };',
    '  const pattern = /<script\\b([^>]*)>([\\s\\S]*?)<\\/script>/giu;',
    '  for (const match of source.matchAll(pattern)) {',
    '    const content = match[2] || "";',
    '    const start = (match.index || 0) + match[0].indexOf(content);',
    '    const script = { content: { start, end: start + content.length } };',
    '    const attrs = match[1] || "";',
    '    const isModule = /(?:^|\\s)module(?:\\s|=|$)/u.test(attrs) || /context\\s*=\\s*["\']module["\']/u.test(attrs);',
    '    root[isModule ? "module" : "instance"] = script;',
    '  }',
    '  return root;',
    '};',
    '',
  ].join('\n');
}

async function writeSvelteCompiler(options: {
  failMessage?: string;
  packageRootDir: string;
  version: string;
}): Promise<void> {
  await writeText(
    options.packageRootDir,
    'node_modules/svelte/package.json',
    JSON.stringify({
      exports: { './compiler': './compiler.cjs' },
      name: 'svelte',
      type: 'commonjs',
      version: options.version,
    }),
  );
  await writeText(
    options.packageRootDir,
    'node_modules/svelte/compiler.cjs',
    createSvelteCompilerSource(options),
  );
}

describe('import analysis', () => {
  it('keeps full UTF-16 string-token locators and duplicate occurrences stable', async () => {
    const rootDir = await createTempDir();
    const sourceText = [
      "const label = '資源😀';",
      "import './shared.css';",
      "import './shared.css';",
      "void import('./shared.css');",
      "type Shared = import('./shared.css').Shared;",
      '',
    ].join('\r\n');

    try {
      const filePath = await writeText(rootDir, 'src/locator.ts', sourceText);
      const imports = collectImportsFromFile(filePath, rootDir).filter(
        (record) => record.specifier === './shared.css',
      );

      expect(
        imports.map((record) => ({
          kind: record.kind,
          occurrence: record.locator.occurrence,
          token: sourceText.slice(
            record.locator.sourceStart,
            record.locator.sourceEnd,
          ),
        })),
      ).toEqual([
        { kind: 'static', occurrence: 0, token: "'./shared.css'" },
        { kind: 'static', occurrence: 1, token: "'./shared.css'" },
        { kind: 'dynamic', occurrence: 0, token: "'./shared.css'" },
        { kind: 'import-type', occurrence: 0, token: "'./shared.css'" },
      ]);
    } finally {
      await rm(rootDir, { force: true, recursive: true });
    }
  });

  it('collects static, type, export-from, dynamic, and import-type dependencies', async () => {
    const rootDir = await createTempDir();

    try {
      const filePath = await writeText(
        rootDir,
        'src/index.tsx',
        [
          "import value from './value';",
          "import type { TypeValue } from './types';",
          "export { otherValue } from './other';",
          "void import('./lazy');",
          "export type Imported = import('./import-type').Imported;",
          'export const all = [value, TypeValue, otherValue];',
        ].join('\n'),
      );

      expect(
        collectImportsFromFile(filePath, rootDir).map((item) => ({
          kind: item.kind,
          line: item.line,
          specifier: item.specifier,
        })),
      ).toEqual([
        { kind: 'static', line: 1, specifier: './value' },
        { kind: 'import-type', line: 2, specifier: './types' },
        { kind: 'export', line: 3, specifier: './other' },
        { kind: 'dynamic', line: 4, specifier: './lazy' },
        { kind: 'import-type', line: 5, specifier: './import-type' },
      ]);
    } finally {
      await rm(rootDir, { force: true, recursive: true });
    }
  });

  it('collects CommonJS, require.resolve, import-equals, and literal template dependencies', async () => {
    const rootDir = await createTempDir();

    try {
      const filePath = await writeText(
        rootDir,
        'src/commonjs.ts',
        [
          "import Equal = require('./equal');",
          "const cjs = require('./cjs');",
          'const cjsTemplate = require(`./cjs-template`);',
          "const resolved = require.resolve('./resolved');",
          'const resolvedTemplate = require.resolve(`./resolved-template`);',
          'void import(`./lazy-template`);',
          'void import(`./${name}`);',
          'const computed = require(name);',
          "const concatenated = require('./' + name);",
          "const computedResolve = require['resolve']('./computed');",
          'void [Equal, cjs, cjsTemplate, resolved, resolvedTemplate];',
          'void [computed, concatenated, computedResolve];',
        ].join('\n'),
      );

      expect(
        collectImportsFromFile(filePath, rootDir).map((item) => ({
          kind: item.kind,
          line: item.line,
          specifier: item.specifier,
        })),
      ).toEqual([
        { kind: 'import-equals', line: 1, specifier: './equal' },
        { kind: 'commonjs', line: 2, specifier: './cjs' },
        { kind: 'commonjs', line: 3, specifier: './cjs-template' },
        { kind: 'require-resolve', line: 4, specifier: './resolved' },
        {
          kind: 'require-resolve',
          line: 5,
          specifier: './resolved-template',
        },
        { kind: 'dynamic', line: 6, specifier: './lazy-template' },
      ]);
    } finally {
      await rm(rootDir, { force: true, recursive: true });
    }
  });

  it('collects only unshadowed require bindings and direct immutable createRequire aliases', () => {
    const sourceText = [
      "import { createRequire as makeRequire } from 'node:module';",
      'const local = makeRequire(import.meta.url);',
      "const direct = require('./global');",
      "const resolved = require.resolve('./global-resolved');",
      "const localValue = local('./local');",
      "const localResolved = local.resolve('./local-resolved');",
      "{ const require = () => null; require('./block-shadow'); }",
      "function parameter(require: (id: string) => unknown) { require('./parameter-shadow'); }",
      "function nested() { const local = () => null; local('./nested-shadow'); }",
      "const transitive = local; transitive('./transitive');",
      "const { resolve } = local; resolve('./destructured');",
      "require['resolve']('./computed');",
      "require?.('./optional');",
      "(0, require)('./indirect');",
      'void [direct, resolved, localValue, localResolved, parameter, nested];',
    ].join('\n');
    const options = {
      filePath: '/fixture/imports.ts',
      scriptKind: ts.ScriptKind.TS,
      sourceText,
    };
    const expected = [
      ['commonjs', './global'],
      ['require-resolve', './global-resolved'],
      ['commonjs', './local'],
      ['require-resolve', './local-resolved'],
    ];

    expect(
      collectOxcImports(options)
        ?.filter((record) =>
          ['commonjs', 'require-resolve'].includes(record.kind),
        )
        .map((record) => [record.kind, record.specifier]),
    ).toEqual(expected);
    expect(
      collectTypeScriptImports(options)
        .filter((record) =>
          ['commonjs', 'require-resolve'].includes(record.kind),
        )
        .map((record) => [record.kind, record.specifier]),
    ).toEqual(expected);
  });

  it('excludes root imports, declarations, and reassigned createRequire aliases in both parser paths', () => {
    const validSource = [
      "import { require } from './shim';",
      "require('./import-shadow');",
      'function require() {}',
      "require.resolve('./function-shadow');",
    ].join('\n');
    const fallbackSource = [
      "import { createRequire } from 'node:module';",
      'const local = createRequire(import.meta.url);',
      "local('./before-reassignment');",
      'local = replacement;',
      "local.resolve('./after-reassignment');",
      'const = ;',
    ].join('\n');

    expect(
      collectOxcImports({
        filePath: '/fixture/shadowed.ts',
        sourceText: validSource,
      })?.filter((record) =>
        ['commonjs', 'require-resolve'].includes(record.kind),
      ),
    ).toEqual([]);
    expect(
      collectTypeScriptImports({
        filePath: '/fixture/fallback.ts',
        scriptKind: ts.ScriptKind.TS,
        sourceText: fallbackSource,
      }).filter((record) =>
        ['commonjs', 'require-resolve'].includes(record.kind),
      ),
    ).toEqual([]);
  });

  it('reuses the TypeScript fallback SourceFile for require collection', () => {
    const sourceText = "const = ;\nrequire('./fallback');\n";
    const options = {
      filePath: '/fixture/fallback.ts',
      scriptKind: ts.ScriptKind.TS,
      sourceText,
    };
    const sourceFile = ts.createSourceFile(
      options.filePath,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      options.scriptKind,
    );

    expect(
      collectRequireImportsFromSourceFile({ ...options, sourceFile }).map(
        (record) => [record.kind, record.specifier],
      ),
    ).toEqual([['commonjs', './fallback']]);
  });

  it('collects dependency pragmas from comments', async () => {
    const rootDir = await createTempDir();

    try {
      const filePath = await writeText(
        rootDir,
        'src/comments.ts',
        [
          '/**',
          ' * @type {import("./jsdoc").Thing}',
          ' * @import { Tagged } from "./tagged"',
          ' * @jsxImportSource @emotion/react',
          ' */',
          '// @jest-environment jsdom',
          '// @vitest-environment edge-runtime',
          '// @jest-environment node',
          '/// <reference types="vitest" />',
          '/// <reference path="./ambient.d.ts" />',
          'const value = 1;',
          '// @vitest-environment happy-dom',
          'export { value };',
        ].join('\n'),
      );

      expect(
        collectImportsFromFile(filePath, rootDir).map((item) => ({
          kind: item.kind,
          line: item.line,
          specifier: item.specifier,
        })),
      ).toEqual([
        { kind: 'jsdoc-import', line: 2, specifier: './jsdoc' },
        { kind: 'jsdoc-import', line: 3, specifier: './tagged' },
        { kind: 'jsx-import-source', line: 4, specifier: '@emotion/react' },
        {
          kind: 'environment-pragma',
          line: 6,
          specifier: 'jest-environment-jsdom',
        },
        { kind: 'environment-pragma', line: 7, specifier: '@edge-runtime/vm' },
        { kind: 'triple-slash-types', line: 9, specifier: 'vitest' },
        { kind: 'triple-slash-path', line: 10, specifier: './ambient.d.ts' },
      ]);
    } finally {
      await rm(rootDir, { force: true, recursive: true });
    }
  });

  it('collects Vue inline script imports and skips src scripts', async () => {
    const rootDir = await createTempDir();

    try {
      const filePath = await writeText(
        rootDir,
        'src/App.vue',
        [
          '<template><div /></template>',
          '<script setup lang="ts" generic="T extends Record<string, value>">',
          "import value from './value';",
          "import Equal = require('./equal');",
          "const cjs = require('./cjs');",
          "const resolved = require.resolve('./resolved');",
          '// @jsxImportSource @emotion/react',
          "type Imported = import('./types').Imported;",
          '</script>',
          '<script src="./external.ts"></script>',
          '<script lang="tsx">',
          "export { Widget } from './Widget';",
          "void import('./lazy');",
          '</script>',
        ].join('\n'),
      );

      expect(
        collectImportsFromFile(filePath, rootDir).map((item) => ({
          kind: item.kind,
          line: item.line,
          specifier: item.specifier,
        })),
      ).toEqual([
        { kind: 'static', line: 3, specifier: './value' },
        { kind: 'import-equals', line: 4, specifier: './equal' },
        { kind: 'commonjs', line: 5, specifier: './cjs' },
        { kind: 'require-resolve', line: 6, specifier: './resolved' },
        { kind: 'jsx-import-source', line: 7, specifier: '@emotion/react' },
        { kind: 'import-type', line: 8, specifier: './types' },
        { kind: 'export', line: 12, specifier: './Widget' },
        { kind: 'dynamic', line: 13, specifier: './lazy' },
      ]);
    } finally {
      await rm(rootDir, { force: true, recursive: true });
    }
  });

  it('keeps Vue SFC locators in original-source UTF-16 coordinates', async () => {
    const rootDir = await createTempDir();
    const sourceText = [
      '<template><div>資源😀</div></template>',
      '<script setup lang="ts">',
      "import './style.css';",
      "import './style.css';",
      '</script>',
      '',
    ].join('\r\n');

    try {
      const filePath = await writeText(rootDir, 'src/Locator.vue', sourceText);
      const records = collectImportsFromFile(filePath, rootDir);

      expect(
        records.map((record) => ({
          occurrence: record.locator.occurrence,
          token: sourceText.slice(
            record.locator.sourceStart,
            record.locator.sourceEnd,
          ),
        })),
      ).toEqual([
        { occurrence: 0, token: "'./style.css'" },
        { occurrence: 1, token: "'./style.css'" },
      ]);
    } finally {
      await rm(rootDir, { force: true, recursive: true });
    }
  });

  it('collects Vue imports with the compiler-sfc parser when configured', async () => {
    const rootDir = await createTempDir();

    try {
      await linkCompilerSfc(rootDir);
      const filePath = await writeText(
        rootDir,
        'src/App.vue',
        [
          '<template><div /></template>',
          '<script setup lang="ts" generic="T extends Record<string, value>">',
          "import value from './value';",
          "import Equal = require('./equal');",
          "type Imported = import('./types').Imported;",
          '</script>',
          '<script lang="tsx">',
          "export { Widget } from './Widget';",
          "void import('./lazy');",
          '</script>',
        ].join('\n'),
      );
      const context = createImportAnalysisContext({
        projectRootDir: rootDir,
        vueParser: 'compiler-sfc',
      });

      expect(
        collectImportsFromFile(filePath, rootDir, context).map((item) => ({
          kind: item.kind,
          line: item.line,
          specifier: item.specifier,
        })),
      ).toEqual([
        { kind: 'static', line: 3, specifier: './value' },
        { kind: 'import-equals', line: 4, specifier: './equal' },
        { kind: 'import-type', line: 5, specifier: './types' },
        { kind: 'export', line: 8, specifier: './Widget' },
        { kind: 'dynamic', line: 9, specifier: './lazy' },
      ]);
    } finally {
      await rm(rootDir, { force: true, recursive: true });
    }
  });

  it('fails compiler-sfc Vue import analysis when the peer is missing', async () => {
    const rootDir = await createTempDir();

    try {
      const filePath = await writeText(
        rootDir,
        'src/App.vue',
        '<script setup lang="ts">import value from "./value";</script>\n',
      );
      const context = createImportAnalysisContext({
        projectRootDir: rootDir,
        vueParser: 'compiler-sfc',
      });

      expect(() => collectImportsFromFile(filePath, rootDir, context)).toThrow(
        /Unable to load Vue SFC compiler for import analysis/u,
      );
    } finally {
      await rm(rootDir, { force: true, recursive: true });
    }
  });

  it('fails compiler-sfc Vue import analysis on SFC parse errors', async () => {
    const rootDir = await createTempDir();

    try {
      await linkCompilerSfc(rootDir);
      const filePath = await writeText(
        rootDir,
        'src/App.vue',
        [
          '<script setup lang="ts">import one from "./one";</script>',
          '<script setup lang="ts">import two from "./two";</script>',
        ].join('\n'),
      );
      const context = createImportAnalysisContext({
        projectRootDir: rootDir,
        vueParser: 'compiler-sfc',
      });

      expect(() => collectImportsFromFile(filePath, rootDir, context)).toThrow(
        /Unable to parse Vue SFC for import analysis/u,
      );
    } finally {
      await rm(rootDir, { force: true, recursive: true });
    }
  });

  it('prewarms actual Astro imports with domains and UTF-16 source locations', async () => {
    const rootDir = await createTempDir();
    const sourceText = [
      '---',
      "const label = '資料😀';",
      "import Page from './Page.astro';",
      "export { server } from './server';",
      "void import('./lazy');",
      "import { getCollection } from 'astro:content';",
      "import './theme.css?inline';",
      "import hero from './hero.png?url';",
      'void [Page, label, getCollection, hero];',
      '---',
      '<Page />',
      '<script type="application/json">{"source":"import \'./ignored\'"}</script>',
      '<script type="module">',
      "import { client } from './client';",
      "void import('./client-lazy');",
      'void client;',
      '</script>',
      '',
    ].join('\r\n');

    try {
      await linkAstroCompiler(rootDir);
      const filePath = await writeText(rootDir, 'src/Page.astro', sourceText);
      const metrics = createProfilingMetricsRecorder();
      const context = createImportAnalysisContext({ metrics });

      expect(() => context.collectImportsFromFile(filePath, rootDir)).toThrow(
        /Framework import analysis was not asynchronously prepared/u,
      );
      await Promise.all([
        prewarmImportsFromFile({ context, filePath, packageRootDir: rootDir }),
        prewarmImportsFromFile({ context, filePath, packageRootDir: rootDir }),
      ]);

      expect(
        context.collectImportsFromFile(filePath, rootDir).map((record) => ({
          domain: record.domain,
          kind: record.kind,
          line: record.line,
          specifier: record.specifier,
          token: sourceText.slice(
            record.locator.sourceStart,
            record.locator.sourceEnd,
          ),
        })),
      ).toEqual([
        {
          domain: 'astro-frontmatter',
          kind: 'static',
          line: 3,
          specifier: './Page.astro',
          token: "'./Page.astro'",
        },
        {
          domain: 'astro-frontmatter',
          kind: 'export',
          line: 4,
          specifier: './server',
          token: "'./server'",
        },
        {
          domain: 'astro-frontmatter',
          kind: 'dynamic',
          line: 5,
          specifier: './lazy',
          token: "'./lazy'",
        },
        {
          domain: 'astro-frontmatter',
          kind: 'static',
          line: 6,
          specifier: 'astro:content',
          token: "'astro:content'",
        },
        {
          domain: 'astro-frontmatter',
          kind: 'static',
          line: 7,
          specifier: './theme.css?inline',
          token: "'./theme.css?inline'",
        },
        {
          domain: 'astro-frontmatter',
          kind: 'static',
          line: 8,
          specifier: './hero.png?url',
          token: "'./hero.png?url'",
        },
        {
          domain: 'astro-client-script',
          kind: 'static',
          line: 14,
          specifier: './client',
          token: "'./client'",
        },
        {
          domain: 'astro-client-script',
          kind: 'dynamic',
          line: 15,
          specifier: './client-lazy',
          token: "'./client-lazy'",
        },
      ]);
      expect(
        metrics
          .snapshot()
          .find(
            (metric) =>
              metric.name === 'source-parse' && metric.kind === '.astro',
          )?.count,
      ).toBe(1);
    } finally {
      await rm(rootDir, { force: true, recursive: true });
    }
  });

  it('resolves the actual Astro compiler from the supplied leaf root', async () => {
    const rootDir = await createTempDir();
    const leafRootDir = path.join(rootDir, 'packages/leaf');

    try {
      await writeText(
        rootDir,
        'node_modules/@astrojs/compiler/package.json',
        JSON.stringify({
          main: './index.cjs',
          name: '@astrojs/compiler',
          version: '1.0.0',
        }),
      );
      await writeText(
        rootDir,
        'node_modules/@astrojs/compiler/index.cjs',
        'throw new Error("wrong compiler scope");\n',
      );
      await linkAstroCompiler(leafRootDir);
      const filePath = await writeText(
        rootDir,
        'packages/leaf/src/Page.astro',
        '---\nimport value from "./value";\n---\n',
      );
      const context = createImportAnalysisContext();

      await prewarmImportsFromFile({
        context,
        filePath,
        packageRootDir: leafRootDir,
      });
      expect(
        context
          .collectImportsFromFile(filePath, leafRootDir)
          .map((record) => record.specifier),
      ).toEqual(['./value']);
    } finally {
      await rm(rootDir, { force: true, recursive: true });
    }
  });

  it('parses imports with the selected minimum actual Astro compiler', async () => {
    const rootDir = await createTempDir();

    try {
      await linkAstroCompiler(rootDir, '@astrojs/compiler-v2');
      const filePath = await writeText(
        rootDir,
        'src/Page.astro',
        '---\nimport value from "./value";\n---\n<h1>Astro 2</h1>\n',
      );
      const context = createImportAnalysisContext();

      await prewarmImportsFromFile({
        context,
        filePath,
        packageRootDir: rootDir,
      });
      expect(
        context
          .collectImportsFromFile(filePath, rootDir)
          .map((record) => record.specifier),
      ).toEqual(['./value']);
    } finally {
      await rm(rootDir, { force: true, recursive: true });
    }
  });

  it('isolates concurrent Astro import caches by leaf root and compiler version', async () => {
    const rootDir = await createTempDir();
    const currentLeaf = path.join(rootDir, 'packages/current');
    const minimumLeaf = path.join(rootDir, 'packages/minimum');

    try {
      await Promise.all([
        linkAstroCompiler(currentLeaf),
        linkAstroCompiler(minimumLeaf, '@astrojs/compiler-v2'),
      ]);
      const filePath = await writeText(
        rootDir,
        'shared/Page.astro',
        '---\nimport value from "./value";\n---\n',
      );
      const metrics = createProfilingMetricsRecorder();
      const context = createImportAnalysisContext({ metrics });

      await Promise.all([
        prewarmImportsFromFile({
          context,
          filePath,
          packageRootDir: currentLeaf,
        }),
        prewarmImportsFromFile({
          context,
          filePath,
          packageRootDir: minimumLeaf,
        }),
      ]);
      expect(
        context.collectImportsFromFile(filePath, currentLeaf)[0]?.specifier,
      ).toBe('./value');
      expect(
        context.collectImportsFromFile(filePath, minimumLeaf)[0]?.specifier,
      ).toBe('./value');
      expect(
        metrics
          .snapshot()
          .find(
            (metric) =>
              metric.name === 'source-parse' && metric.kind === '.astro',
          )?.count,
      ).toBe(2);
    } finally {
      await rm(rootDir, { force: true, recursive: true });
    }
  });

  it('reports missing and unsupported Astro analysis runtimes', async () => {
    const missingRootDir = await createTempDir();
    const unsupportedRootDir = await createTempDir();

    try {
      const missingFilePath = await writeText(
        missingRootDir,
        'src/Page.astro',
        '<h1>Missing</h1>\n',
      );
      const missingContext = createImportAnalysisContext();
      await expect(
        prewarmImportsFromFile({
          context: missingContext,
          filePath: missingFilePath,
          packageRootDir: missingRootDir,
        }),
      ).rejects.toThrow(
        /Unable to load Astro compiler for import analysis:[\s\S]*dependency category: analysis runtime/u,
      );

      await writeText(
        unsupportedRootDir,
        'node_modules/@astrojs/compiler/package.json',
        JSON.stringify({
          main: './index.cjs',
          name: '@astrojs/compiler',
          version: '1.0.0',
        }),
      );
      await writeText(
        unsupportedRootDir,
        'node_modules/@astrojs/compiler/index.cjs',
        'exports.parse = async () => ({ ast: { type: "root" } });\n',
      );
      const unsupportedFilePath = await writeText(
        unsupportedRootDir,
        'src/Page.astro',
        '<h1>Unsupported</h1>\n',
      );
      const unsupportedContext = createImportAnalysisContext();
      await expect(
        prewarmImportsFromFile({
          context: unsupportedContext,
          filePath: unsupportedFilePath,
          packageRootDir: unsupportedRootDir,
        }),
      ).rejects.toThrow(
        /Unsupported Astro compiler for import analysis:[\s\S]*installed version: 1\.0\.0[\s\S]*supported range: >=2\.0\.0 <5\.0\.0/u,
      );
    } finally {
      await Promise.all([
        rm(missingRootDir, { force: true, recursive: true }),
        rm(unsupportedRootDir, { force: true, recursive: true }),
      ]);
    }
  });

  it('reports actual Astro compiler parse diagnostics with the source file', async () => {
    const rootDir = await createTempDir();

    try {
      await linkAstroCompiler(rootDir);
      const filePath = await writeText(
        rootDir,
        'src/Page.astro',
        '<html>\n<body>\n{/*\n</body>\n</html>\n',
      );
      const context = createImportAnalysisContext();

      await expect(
        prewarmImportsFromFile({ context, filePath, packageRootDir: rootDir }),
      ).rejects.toThrow(
        /Unable to parse Astro component for import analysis:[\s\S]*src\/Page\.astro[\s\S]*Unterminated comment/u,
      );
    } finally {
      await rm(rootDir, { force: true, recursive: true });
    }
  });

  it.each(['context="module"', 'module'])(
    'collects Svelte instance and %s script imports with domains and source locations',
    async (moduleAttribute) => {
      const rootDir = await createTempDir();
      const sourceText = [
        `<script ${moduleAttribute}>`,
        "export { server } from './server';",
        '</script>',
        '<h1>Component</h1>',
        '<script lang="ts">',
        "import value from './value';",
        "import './theme.css?inline';",
        "import { page } from '$app/state';",
        "import { local } from '$lib/local';",
        "void import('./lazy');",
        'void [value, page, local];',
        '</script>',
        '',
      ].join('\r\n');

      try {
        await writeSvelteCompiler({
          packageRootDir: rootDir,
          version: '5.1.0',
        });
        const filePath = await writeText(rootDir, 'src/App.svelte', sourceText);

        expect(
          collectImportsFromFile(filePath, rootDir).map((record) => ({
            domain: record.domain,
            kind: record.kind,
            line: record.line,
            specifier: record.specifier,
            token: sourceText.slice(
              record.locator.sourceStart,
              record.locator.sourceEnd,
            ),
          })),
        ).toEqual([
          {
            domain: 'svelte-module-script',
            kind: 'export',
            line: 2,
            specifier: './server',
            token: "'./server'",
          },
          {
            domain: 'svelte-instance-script',
            kind: 'static',
            line: 6,
            specifier: './value',
            token: "'./value'",
          },
          {
            domain: 'svelte-instance-script',
            kind: 'static',
            line: 7,
            specifier: './theme.css?inline',
            token: "'./theme.css?inline'",
          },
          {
            domain: 'svelte-instance-script',
            kind: 'static',
            line: 8,
            specifier: '$app/state',
            token: "'$app/state'",
          },
          {
            domain: 'svelte-instance-script',
            kind: 'static',
            line: 9,
            specifier: '$lib/local',
            token: "'$lib/local'",
          },
          {
            domain: 'svelte-instance-script',
            kind: 'dynamic',
            line: 10,
            specifier: './lazy',
            token: "'./lazy'",
          },
        ]);
      } finally {
        await rm(rootDir, { force: true, recursive: true });
      }
    },
  );

  it('resolves the Svelte compiler from the supplied leaf package root', async () => {
    const rootDir = await createTempDir();
    const leafRootDir = path.join(rootDir, 'packages/leaf');

    try {
      await writeSvelteCompiler({
        failMessage: 'wrong compiler scope',
        packageRootDir: rootDir,
        version: '5.0.0',
      });
      await writeSvelteCompiler({
        packageRootDir: leafRootDir,
        version: '5.2.0',
      });
      const filePath = await writeText(
        rootDir,
        'packages/leaf/src/App.svelte',
        '<script>import value from "./value";</script>\n',
      );

      expect(
        collectImportsFromFile(filePath, leafRootDir).map(
          (record) => record.specifier,
        ),
      ).toEqual(['./value']);
    } finally {
      await rm(rootDir, { force: true, recursive: true });
    }
  });

  it('reports a structured Svelte analysis error when the parser is missing', async () => {
    const rootDir = await createTempDir();

    try {
      const filePath = await writeText(
        rootDir,
        'src/App.svelte',
        '<script>import value from "./value";</script>\n',
      );

      expect(() => collectImportsFromFile(filePath, rootDir)).toThrow(
        /Unable to load Svelte compiler for import analysis:[\s\S]*dependency category: analysis runtime/u,
      );
    } finally {
      await rm(rootDir, { force: true, recursive: true });
    }
  });

  it('reports Svelte parser syntax errors with the source file', async () => {
    const rootDir = await createTempDir();

    try {
      await writeSvelteCompiler({ packageRootDir: rootDir, version: '5.1.0' });
      const filePath = await writeText(
        rootDir,
        'src/App.svelte',
        '<syntax-error>\n',
      );

      expect(() => collectImportsFromFile(filePath, rootDir)).toThrow(
        /Unable to parse Svelte component for import analysis:[\s\S]*src\/App\.svelte[\s\S]*fixture syntax error/u,
      );
    } finally {
      await rm(rootDir, { force: true, recursive: true });
    }
  });

  it('isolates Svelte import caches by leaf root and parser identity', async () => {
    const rootDir = await createTempDir();
    const firstLeaf = path.join(rootDir, 'packages/first');
    const secondLeaf = path.join(rootDir, 'packages/second');

    try {
      await writeSvelteCompiler({
        packageRootDir: firstLeaf,
        version: '5.1.0',
      });
      await writeSvelteCompiler({
        packageRootDir: secondLeaf,
        version: '5.2.0',
      });
      const filePath = await writeText(
        rootDir,
        'shared/App.svelte',
        '<script>import value from "./value";</script>\n',
      );
      const metrics = createProfilingMetricsRecorder();
      const context = createImportAnalysisContext({ metrics });

      context.collectImportsFromFile(filePath, firstLeaf);
      context.collectImportsFromFile(filePath, secondLeaf);
      context.collectImportsFromFile(filePath, firstLeaf);

      const providerMetrics = metrics
        .snapshot()
        .filter(
          (metric) =>
            metric.kind === 'imports' &&
            metric.name.startsWith('provider-cache-'),
        );
      expect(providerMetrics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ count: 2, name: 'provider-cache-miss' }),
          expect.objectContaining({ count: 1, name: 'provider-cache-hit' }),
        ]),
      );
    } finally {
      await rm(rootDir, { force: true, recursive: true });
    }
  });

  it('falls back to TypeScript import collection when OXC rejects a file', async () => {
    const rootDir = await createTempDir();

    try {
      const filePath = await writeText(
        rootDir,
        'src/broken.ts',
        [
          "import value from './value';",
          "const cjs = require('./cjs');",
          "const resolved = require.resolve('./resolved');",
          "import Equal = require('./equal');",
          'const = ;',
          'export const kept = value;',
        ].join('\n'),
      );

      expect(
        collectImportsFromFile(filePath, rootDir).map((item) => ({
          kind: item.kind,
          specifier: item.specifier,
        })),
      ).toEqual([
        { kind: 'static', specifier: './value' },
        { kind: 'commonjs', specifier: './cjs' },
        { kind: 'require-resolve', specifier: './resolved' },
        { kind: 'import-equals', specifier: './equal' },
      ]);
    } finally {
      await rm(rootDir, { force: true, recursive: true });
    }
  });

  it('resolves paths aliases, Vue extensionless imports, and package imports through the shared context', async () => {
    const rootDir = await createTempDir();

    try {
      const indexPath = await writeText(
        rootDir,
        'src/index.ts',
        [
          "import App from './App';",
          "import { aliased } from '@internal/aliased';",
          "import { packageImported } from '#package-import';",
          "import { shared } from 'shared';",
          'void App;',
          'void aliased;',
          'void packageImported;',
          'void shared;',
        ].join('\n'),
      );
      const appPath = await writeText(rootDir, 'src/App.vue', '<script />\n');
      const aliasedPath = await writeText(
        rootDir,
        'src/internal/aliased.ts',
        'export const aliased = 1;\n',
      );
      const packageImportPath = await writeText(
        rootDir,
        'src/package-import.ts',
        'export const packageImported = 1;\n',
      );
      const sharedPath = await writeText(
        rootDir,
        'shared.ts',
        'export const shared = 1;\n',
      );

      await writeText(
        rootDir,
        'package.json',
        JSON.stringify({
          imports: {
            '#package-import': './src/package-import.ts',
          },
          type: 'module',
        }),
      );
      const configPath = await writeText(
        rootDir,
        'tsconfig.json',
        JSON.stringify({
          compilerOptions: {},
        }),
      );
      await writeText(
        rootDir,
        'node_modules/shared/package.json',
        JSON.stringify({
          name: 'shared',
          types: './index.d.ts',
        }),
      );
      await writeText(
        rootDir,
        'node_modules/shared/index.d.ts',
        'export declare const shared: number;\n',
      );

      const context = createImportAnalysisContext();
      const compilerOptions = {
        baseUrl: rootDir,
        moduleResolution: 99,
        paths: {
          '@internal/*': ['src/internal/*'],
        },
      };
      const checkerContext = {
        checkerPresets: [],
        configPath,
        extensions: ['.ts', '.tsx', '.js', '.jsx', '.vue'],
      };

      expect(
        toPortablePath(
          resolveInternalImport(
            './App',
            indexPath,
            compilerOptions,
            checkerContext,
            context,
          ) ?? '',
        ),
      ).toBe(toPortablePath(appPath));
      expect(
        toPortablePath(
          resolveInternalImport(
            '@internal/aliased',
            indexPath,
            compilerOptions,
            checkerContext,
            context,
          ) ?? '',
        ),
      ).toBe(toPortablePath(aliasedPath));
      expect(
        toPortablePath(
          resolveInternalImport(
            '#package-import',
            indexPath,
            compilerOptions,
            checkerContext,
            context,
          ) ?? '',
        ),
      ).toBe(toPortablePath(packageImportPath));
      expect(
        toPortablePath(
          resolveInternalImport(
            'shared',
            indexPath,
            compilerOptions,
            checkerContext,
            context,
          ) ?? '',
        ),
      ).toBe(toPortablePath(sharedPath));
    } finally {
      await rm(rootDir, { force: true, recursive: true });
    }
  });

  it('falls back to TypeScript resolution for module suffixes', async () => {
    const rootDir = await createTempDir();

    try {
      const indexPath = await writeText(
        rootDir,
        'src/index.ts',
        "import { feature } from './feature';\nvoid feature;\n",
      );
      await writeText(
        rootDir,
        'src/feature.ts',
        'export const feature = "default";\n',
      );
      const nativeFeaturePath = await writeText(
        rootDir,
        'src/feature.native.ts',
        'export const feature = "native";\n',
      );

      expect(
        toPortablePath(
          resolveInternalImport(
            './feature',
            indexPath,
            { moduleSuffixes: ['.native', ''] },
            {
              checkerPresets: [],
              extensions: ['.ts'],
            },
            createImportAnalysisContext(),
          ) ?? '',
        ),
      ).toBe(toPortablePath(nativeFeaturePath));
    } finally {
      await rm(rootDir, { force: true, recursive: true });
    }
  });

  it('uses compiler custom conditions when resolving package exports with Oxc', async () => {
    const rootDir = await createTempDir();

    try {
      const indexPath = await writeText(
        rootDir,
        'src/index.ts',
        "import { value } from 'conditional';\nvoid value;\n",
      );
      const sourcePath = await writeText(
        rootDir,
        'node_modules/conditional/src/index.ts',
        'export const value = "source";\n',
      );
      const distPath = await writeText(
        rootDir,
        'node_modules/conditional/dist/index.js',
        'export const value = "dist";\n',
      );

      await writeText(
        rootDir,
        'node_modules/conditional/package.json',
        JSON.stringify({
          exports: {
            '.': {
              source: './src/index.ts',
              default: './dist/index.js',
            },
          },
          name: 'conditional',
          type: 'module',
        }),
      );
      const configPath = await writeText(
        rootDir,
        'tsconfig.json',
        JSON.stringify({
          compilerOptions: {},
        }),
      );

      const context = createImportAnalysisContext();
      const bundlerCompilerOptions = {
        moduleResolution: ts.ModuleResolutionKind.Bundler,
      };
      const checkerContext = {
        checkerPresets: [],
        configPath,
        extensions: ['.ts', '.js'],
      };

      expect(
        toPortablePath(
          resolveInternalImport(
            'conditional',
            indexPath,
            bundlerCompilerOptions,
            checkerContext,
            context,
          ) ?? '',
        ),
      ).toBe(toPortablePath(distPath));
      expect(
        toPortablePath(
          resolveInternalImport(
            'conditional',
            indexPath,
            {
              ...bundlerCompilerOptions,
              customConditions: ['source'],
            },
            checkerContext,
            context,
          ) ?? '',
        ),
      ).toBe(toPortablePath(sourcePath));
    } finally {
      await rm(rootDir, { force: true, recursive: true });
    }
  });

  it('keeps JavaScript package entry extensions in Oxc runtime resolution', async () => {
    const rootDir = await createTempDir();

    try {
      const indexPath = await writeText(
        rootDir,
        'src/index.ts',
        "import value from 'lodash.kebabcase';\nvoid value;\n",
      );
      const packageEntryPath = await writeText(
        rootDir,
        'node_modules/lodash.kebabcase/index.js',
        'module.exports = value => value;\n',
      );
      await writeText(
        rootDir,
        'node_modules/lodash.kebabcase/package.json',
        JSON.stringify({
          main: './index.js',
          name: 'lodash.kebabcase',
        }),
      );
      const configPath = await writeText(
        rootDir,
        'tsconfig.json',
        JSON.stringify({
          compilerOptions: {
            module: 'ESNext',
            moduleResolution: 'bundler',
          },
        }),
      );

      expect(
        toPortablePath(
          resolveModuleNameWithOxc({
            compilerOptions: {
              module: ts.ModuleKind.ESNext,
              moduleResolution: ts.ModuleResolutionKind.Bundler,
            },
            containingFile: indexPath,
            context: {
              checkerPresets: ['tsc'],
              configPath,
              extensions: ['.ts', '.tsx', '.d.ts'],
            },
            specifier: 'lodash.kebabcase',
          }) ?? '',
        ),
      ).toBe(toPortablePath(packageEntryPath));
    } finally {
      await rm(rootDir, { force: true, recursive: true });
    }
  });

  it('uses legacy package lookup for node10 instead of package exports conditions', async () => {
    const rootDir = await createTempDir();

    try {
      const indexPath = await writeText(
        rootDir,
        'src/index.ts',
        "import { value } from 'legacy-conditional';\nvoid value;\n",
      );
      await writeText(
        rootDir,
        'node_modules/legacy-conditional/src/index.ts',
        'export const value = "source";\n',
      );
      await writeText(
        rootDir,
        'node_modules/legacy-conditional/dist/export.js',
        'export const value = "export";\n',
      );
      const mainPath = await writeText(
        rootDir,
        'node_modules/legacy-conditional/dist/main.js',
        'export const value = "main";\n',
      );

      await writeText(
        rootDir,
        'node_modules/legacy-conditional/package.json',
        JSON.stringify({
          exports: {
            '.': {
              source: './src/index.ts',
              default: './dist/export.js',
            },
          },
          main: './dist/main.js',
          name: 'legacy-conditional',
          type: 'module',
        }),
      );
      const configPath = await writeText(
        rootDir,
        'tsconfig.json',
        JSON.stringify({
          compilerOptions: {
            moduleResolution: 'node10',
          },
        }),
      );
      const node10CompilerOptions = {
        customConditions: ['source'],
        moduleResolution: ts.ModuleResolutionKind.Node10,
      };
      const checkerContext = {
        checkerPresets: [],
        configPath,
        extensions: ['.ts', '.js'],
      };

      expect(
        toPortablePath(
          resolveModuleNameWithOxc({
            compilerOptions: node10CompilerOptions,
            containingFile: indexPath,
            context: checkerContext,
            specifier: 'legacy-conditional',
          }) ?? '',
        ),
      ).toBe(toPortablePath(mainPath));

      expect(
        toPortablePath(
          resolveInternalImport(
            'legacy-conditional',
            indexPath,
            node10CompilerOptions,
            checkerContext,
            createImportAnalysisContext(),
          ) ?? '',
        ),
      ).toBe(toPortablePath(mainPath));
    } finally {
      await rm(rootDir, { force: true, recursive: true });
    }
  });

  it('uses explicit Oxc tsconfig paths without sharing resolver cache entries', async () => {
    const rootDir = await createTempDir();

    try {
      const indexPath = await writeText(
        rootDir,
        'src/index.ts',
        "import { value } from '@target';\nvoid value;\n",
      );
      const firstPath = await writeText(
        rootDir,
        'first.ts',
        'export const value = "first";\n',
      );
      const secondPath = await writeText(
        rootDir,
        'second.ts',
        'export const value = "second";\n',
      );
      const firstConfigPath = await writeText(
        rootDir,
        'tsconfig.first.json',
        JSON.stringify({
          compilerOptions: {
            baseUrl: '.',
            paths: {
              '@target': ['./first.ts'],
            },
          },
        }),
      );
      const secondConfigPath = await writeText(
        rootDir,
        'tsconfig.second.json',
        JSON.stringify({
          compilerOptions: {
            baseUrl: '.',
            paths: {
              '@target': ['./second.ts'],
            },
          },
        }),
      );
      const context = createImportAnalysisContext();

      expect(
        toPortablePath(
          resolveInternalImport(
            '@target',
            indexPath,
            {},
            {
              checkerPresets: [],
              configPath: firstConfigPath,
              extensions: ['.ts'],
            },
            context,
          ) ?? '',
        ),
      ).toBe(toPortablePath(firstPath));
      expect(
        toPortablePath(
          resolveInternalImport(
            '@target',
            indexPath,
            {},
            {
              checkerPresets: [],
              configPath: secondConfigPath,
              extensions: ['.ts'],
            },
            context,
          ) ?? '',
        ),
      ).toBe(toPortablePath(secondPath));
    } finally {
      await rm(rootDir, { force: true, recursive: true });
    }
  });

  it('prefers the resolver config path over the graph config path for Oxc', async () => {
    const rootDir = await createTempDir();

    try {
      const indexPath = await writeText(
        rootDir,
        'src/index.ts',
        "import { value } from '@target';\nvoid value;\n",
      );
      const companionPath = await writeText(
        rootDir,
        'companion.ts',
        'export const value = "companion";\n',
      );
      await writeText(rootDir, 'dts.ts', 'export const value = "dts";\n');
      const dtsConfigPath = await writeText(
        rootDir,
        'tsconfig.lib.dts.json',
        JSON.stringify({
          compilerOptions: {
            baseUrl: '.',
            paths: {
              '@target': ['./dts.ts'],
            },
          },
        }),
      );
      const companionConfigPath = await writeText(
        rootDir,
        'tsconfig.lib.json',
        JSON.stringify({
          compilerOptions: {
            baseUrl: '.',
            paths: {
              '@target': ['./companion.ts'],
            },
          },
        }),
      );

      expect(
        toPortablePath(
          resolveInternalImport(
            '@target',
            indexPath,
            {},
            {
              checkerPresets: [],
              configPath: dtsConfigPath,
              extensions: ['.ts'],
              resolverConfigPath: companionConfigPath,
            },
            createImportAnalysisContext(),
          ) ?? '',
        ),
      ).toBe(toPortablePath(companionPath));
    } finally {
      await rm(rootDir, { force: true, recursive: true });
    }
  });

  it('throws when Oxc resolution is missing an importer tsconfig configPath', async () => {
    const rootDir = await createTempDir();

    try {
      const indexPath = await writeText(
        rootDir,
        'src/index.ts',
        "import { value } from 'missing';\nvoid value;\n",
      );

      expect(() =>
        resolveModuleNameWithOxc({
          compilerOptions: {},
          containingFile: indexPath,
          context: {
            checkerPresets: [],
            extensions: ['.ts'],
          },
          specifier: 'missing',
        }),
      ).toThrow(/Oxc resolution requires the importer tsconfig configPath/u);
    } finally {
      await rm(rootDir, { force: true, recursive: true });
    }
  });

  it('keeps import collection caches private to an analysis context', async () => {
    const rootDir = await createTempDir();

    try {
      const filePath = await writeText(
        rootDir,
        'src/index.ts',
        "import { first } from './first';\nvoid first;\n",
      );

      const metrics = createProfilingMetricsRecorder();
      const context = createImportAnalysisContext({ metrics });

      expect(
        context
          .collectImportsFromFile(filePath, rootDir)
          .map((item) => item.specifier),
      ).toEqual(['./first']);

      await writeText(
        rootDir,
        'src/index.ts',
        "import { second } from './second';\nvoid second;\n",
      );

      expect(
        context
          .collectImportsFromFile(filePath, rootDir)
          .map((item) => item.specifier),
      ).toEqual(['./first']);
      expect(
        createImportAnalysisContext()
          .collectImportsFromFile(filePath, rootDir)
          .map((item) => item.specifier),
      ).toEqual(['./second']);

      const snapshot = metrics.snapshot();
      const metricCount = (name: string, kind?: string): number =>
        snapshot.find(
          (metric) =>
            metric.name === name &&
            (kind === undefined || metric.kind === kind),
        )?.count ?? 0;
      expect(metricCount('source-read')).toBe(1);
      expect(metricCount('source-parse')).toBe(1);
      expect(metricCount('provider-cache-miss', 'imports')).toBe(1);
      expect(metricCount('provider-cache-hit', 'imports')).toBe(1);
    } finally {
      await rm(rootDir, { force: true, recursive: true });
    }
  });

  it('keeps module resolution caches private to an analysis context', async () => {
    const rootDir = await createTempDir();

    try {
      const indexPath = await writeText(
        rootDir,
        'src/index.ts',
        "import { missing } from './missing';\nvoid missing;\n",
      );
      const configPath = await writeText(
        rootDir,
        'tsconfig.json',
        JSON.stringify({
          compilerOptions: {},
        }),
      );
      const compilerOptions = {};
      const checkerContext = {
        checkerPresets: [],
        configPath,
        extensions: ['.ts'],
      };
      const metrics = createProfilingMetricsRecorder();
      const context = createImportAnalysisContext({ metrics });

      expect(
        context.resolveInternalImport(
          './missing',
          indexPath,
          compilerOptions,
          checkerContext,
        ),
      ).toBeNull();

      const missingPath = await writeText(
        rootDir,
        'src/missing.ts',
        'export const missing = 1;\n',
      );

      expect(
        context.resolveInternalImport(
          './missing',
          indexPath,
          compilerOptions,
          checkerContext,
        ),
      ).toBeNull();

      const snapshot = metrics.snapshot();
      expect(
        snapshot.find(
          (metric) => metric.name === 'import-resolution-cache-miss',
        )?.count,
      ).toBe(1);
      expect(
        snapshot.find((metric) => metric.name === 'import-resolution-cache-hit')
          ?.count,
      ).toBe(1);

      expect(
        toPortablePath(
          resolveInternalImport(
            './missing',
            indexPath,
            compilerOptions,
            checkerContext,
          ) ?? '',
        ),
      ).toBe(toPortablePath(missingPath));
    } finally {
      await rm(rootDir, { force: true, recursive: true });
    }
  });
});
