import { loadEnv } from '@docs-islands/utils/env';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'tsdown';
import Vue from 'unplugin-vue/rolldown';
import pkg from './package.json' with { type: 'json' };

const { config } = loadEnv();
const { sourcemap, minify } = config;

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const themeDistDir = path.resolve(__dirname, 'dist/theme');
const sourcePreviewWorkerFileName = 'site-devtools-source-preview.worker.mjs';
const sourceTextWorkerFileName = 'site-devtools-source-text.worker.mjs';
const sourceHighlightWorkerFileName =
  'site-devtools-source-highlight.worker.mjs';

const runtimeDependencyNames = [
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.peerDependencies ?? {}),
  // @ts-expect-error No type checking is needed here.
  ...Object.keys(pkg.optionalDependencies ?? {}),
];

const shouldExternalizeThemeRuntimeDependency = (source: string) => {
  if (/\.css(?:$|\?)/.test(source)) {
    return false;
  }

  if (source === pkg.name || source.startsWith(`${pkg.name}/`)) {
    return true;
  }

  return runtimeDependencyNames.some(
    (packageName) =>
      source === packageName || source.startsWith(`${packageName}/`),
  );
};

const createSiteDevToolsWorkerUrlRewritePlugin = () => ({
  name: 'tsdown-plugin-rewrite-site-devtools-worker-urls',
  renderChunk(code: string, chunk: { fileName: string }) {
    const chunkDirectory = path.posix.dirname(chunk.fileName);
    const previewWorkerPath = path.posix.relative(
      chunkDirectory,
      sourcePreviewWorkerFileName,
    );
    const textWorkerPath = path.posix.relative(
      chunkDirectory,
      sourceTextWorkerFileName,
    );
    const highlightWorkerPath = path.posix.relative(
      chunkDirectory,
      sourceHighlightWorkerFileName,
    );
    const nextCode = code
      .replaceAll('site-devtools-source-preview.worker.ts', previewWorkerPath)
      .replaceAll('site-devtools-source-text.worker.ts', textWorkerPath)
      .replaceAll(
        'site-devtools-source-highlight.worker.ts',
        highlightWorkerPath,
      );

    if (nextCode === code) {
      return null;
    }

    return {
      code: nextCode,
      map: null,
    };
  },
});

export default defineConfig({
  name: '@docs-islands/vitepress-theme',
  cwd: __dirname,
  entry: {
    devtools: 'theme/SiteDevToolsConsole.vue',
    'site-devtools-source-preview.worker':
      'theme/site-devtools-source-preview.worker.ts',
    'site-devtools-source-text.worker':
      'theme/site-devtools-source-text.worker.ts',
    'site-devtools-source-highlight.worker':
      'theme/site-devtools-source-highlight.worker.ts',
    'optional-deps/vue-json-pretty': 'theme/optional-deps/vue-json-pretty.ts',
    'optional-deps/prettier-standalone':
      'theme/optional-deps/prettier-standalone.ts',
    'optional-deps/prettier-plugin': 'theme/optional-deps/prettier-plugin.ts',
    'optional-deps/shiki': 'theme/optional-deps/shiki.ts',
  },
  clean: true,
  copy: [
    {
      from: 'theme/optional-deps/empty.css',
      to: 'dist/theme/optional-deps',
    },
  ],
  css: {
    fileName: 'devtools.css',
    minify,
    splitting: false,
  },
  deps: {
    neverBundle: shouldExternalizeThemeRuntimeDependency,
    onlyBundle: [
      'entities',
      'linkify-it',
      'markdown-it',
      'mdurl',
      'pathe',
      'punycode.js',
      'uc.micro',
    ],
  },
  dts: false,
  fixedExtension: true,
  format: 'esm',
  hash: true,
  minify,
  outDir: themeDistDir,
  platform: 'browser',
  plugins: [Vue(), createSiteDevToolsWorkerUrlRewritePlugin()],
  sourcemap,
  target: 'es2020',
  outputOptions: {
    assetFileNames: (asset) => {
      const isCss =
        asset.names?.some((n) => n.endsWith('.css')) ||
        asset.originalFileNames?.some((f) => f.endsWith('.css'));

      if (isCss) {
        return '[name][extname]';
      }

      return 'assets/[name]-[hash][extname]';
    },
    chunkFileNames: 'assets/[name]-[hash].mjs',
    entryFileNames: '[name].mjs',
    exports: 'named',
  },
});
