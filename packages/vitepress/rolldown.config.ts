import licensePlugin from '@docs-islands/plugin-license';
import { loadEnv } from '@docs-islands/utils/env';
import { scanFiles } from '@docs-islands/utils/fs-utils';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, resolve } from 'node:url';
import { defineConfig, type RolldownOptions } from 'rolldown';
import { dts } from 'rolldown-plugin-dts';
import ts from 'typescript';
import pkg from './package.json' with { type: 'json' };
import generatePackageJson from './packagePlugin';

const { config, debug } = loadEnv();
const { sourcemap, minify } = config;

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const packageExternalDeps = [
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.peerDependencies || {}),
  // @ts-expect-error No type checking is needed here.
  ...Object.keys(pkg.optionalDependencies ?? {}),
];
const UTILS_LOGGER_MODULE_ID = '@docs-islands/utils/logger';
const VITEPRESS_LOGGER_MODULE_ID = '@docs-islands/vitepress/logger';

// Reusable runtime modules import the managed logger facade through utils.
// When VitePress bundles those modules, rewrite that facade to the VitePress
// logger entry so createDocsIslands() can provide the active scope.
const createManagedLoggerAliasPlugin = (): NonNullable<
  RolldownOptions['plugins']
> => ({
  name: 'rolldown-plugin-managed-logger-alias',
  resolveId: {
    order: 'pre',
    handler(id) {
      if (id !== UTILS_LOGGER_MODULE_ID) {
        return null;
      }

      return {
        external: true,
        id: VITEPRESS_LOGGER_MODULE_ID,
      };
    },
  },
});
const directExternalDeps = [
  VITEPRESS_LOGGER_MODULE_ID,
  'react-dom/client',
  'vitepress/client',
];
const isPackageImport = (source: string, packageName: string): boolean =>
  source === packageName || source.startsWith(`${packageName}/`);
const isExternalDependency = (source: string): boolean =>
  /^#types\//.test(source) ||
  directExternalDeps.includes(source) ||
  packageExternalDeps.some((packageName) =>
    isPackageImport(source, packageName),
  );
const dtsExternalDeps = [
  /^#types\//,
  ...directExternalDeps,
  ...packageExternalDeps,
];
let hasCleanedDist = false;

const isDeclarationFile = (filePath: string): boolean =>
  /\.d\.[cm]?ts$/.test(filePath);

const hasInternalJSDocTag = (node: ts.Node): boolean =>
  ts
    .getJSDocTags(node)
    .some((tag) => tag.tagName.getText(node.getSourceFile()) === 'internal');

const isRemovableInternalTypeMember = (node: ts.Node): boolean =>
  hasInternalJSDocTag(node) &&
  (ts.isPropertySignature(node) ||
    ts.isMethodSignature(node) ||
    ts.isIndexSignatureDeclaration(node) ||
    ts.isCallSignatureDeclaration(node) ||
    ts.isConstructSignatureDeclaration(node) ||
    ts.isPropertyDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node));

const stripInternalTypeMembers = (
  content: string,
  fileName: string,
): string => {
  if (!content.includes('@internal')) {
    return content;
  }

  const sourceFile = ts.createSourceFile(
    fileName,
    content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const removalRanges: [start: number, end: number][] = [];
  const collectRemovalRanges = (node: ts.Node): void => {
    if (isRemovableInternalTypeMember(node)) {
      removalRanges.push([node.getFullStart(), node.getEnd()]);
      return;
    }

    ts.forEachChild(node, collectRemovalRanges);
  };
  collectRemovalRanges(sourceFile);

  if (removalRanges.length === 0) {
    return content;
  }

  let strippedContent = content;

  for (const [start, end] of removalRanges.toReversed()) {
    strippedContent =
      strippedContent.slice(0, start) + strippedContent.slice(end);
  }

  return strippedContent.endsWith('\n')
    ? strippedContent
    : `${strippedContent}\n`;
};

const nodePlugins: RolldownOptions['plugins'] = [
  {
    name: 'rolldown-plugin-clean-dist',
    async buildStart() {
      if (hasCleanedDist) {
        return;
      }

      hasCleanedDist = true;
      await rm(resolve(__dirname, 'dist'), {
        force: true,
        recursive: true,
      });
    },
  },
  licensePlugin(
    path.resolve(__dirname, 'LICENSE.md'),
    '@docs-islands/vitepress license',
    '@docs-islands/vitepress',
  ),
  generatePackageJson(),
  {
    name: 'rolldown-plugin-add-devtools-mcp-shebang',
    generateBundle(_options: unknown, bundle: Record<string, unknown>) {
      const output = bundle['node/site-devtools/mcp.js'];

      if (
        output &&
        typeof output === 'object' &&
        'code' in output &&
        typeof output.code === 'string' &&
        !output.code.startsWith('#!/usr/bin/env node\n')
      ) {
        output.code = `#!/usr/bin/env node\n${output.code}`;
      }
    },
  },
  {
    name: 'rolldown-plugin-copy-types',
    generateBundle: {
      order: 'post',
      async handler() {
        for (const copyDir of ['types']) {
          await scanFiles(
            resolve(__dirname, copyDir),
            async (_, absolutePath) => {
              const relativePath = path.relative(__dirname, absolutePath);
              const content = await readFile(absolutePath, 'utf8');
              const copiedContent = isDeclarationFile(relativePath)
                ? stripInternalTypeMembers(content, relativePath)
                : content;

              this.emitFile({
                type: 'asset',
                source: copiedContent,
                fileName: relativePath,
              });
            },
          );
        }
      },
    },
  },
];

const getSharedOptions = (platform: 'node' | 'browser') => {
  const baseDir = platform === 'node' ? 'node' : 'client';
  const chunkFileExt = platform === 'node' ? 'js' : 'mjs';
  return defineConfig({
    platform,
    external: isExternalDependency,
    resolve: {
      alias: {
        '#types': fileURLToPath(new URL('types', import.meta.url)),
        '#deps-types': resolve(__dirname, 'src/types'),
        '#shared': resolve(__dirname, 'src/shared'),
      },
    },
    treeshake: {
      moduleSideEffects: [
        {
          external: true,
          sideEffects: false,
        },
      ],
    },
    output: {
      dir: './dist',
      entryFileNames: `${baseDir}/[name].${chunkFileExt}`,
      chunkFileNames: `${baseDir}/chunks/dep-[hash].${chunkFileExt}`,
      exports: 'named',
      format: 'esm',
      externalLiveBindings: false,
      sourcemap,
    },
  });
};

const sharedNodeOptions = getSharedOptions('node');
const sharedBrowserOptions = getSharedOptions('browser');

const nodeConfig = defineConfig({
  ...sharedNodeOptions,
  input: {
    index: resolve(__dirname, 'src/node/index.ts'),
    'adapters/react': resolve(__dirname, 'src/node/adapters/react/index.ts'),
    models: resolve(__dirname, 'src/node/models.ts'),
    'site-devtools/mcp': resolve(__dirname, 'src/node/site-devtools/mcp.ts'),
  },
  plugins: [createManagedLoggerAliasPlugin(), ...nodePlugins],
  output: {
    ...sharedNodeOptions.output,
    ...(minify && {
      minify: {
        compress: true,
        mangle: false,
        // Do not minify whitespace for ES lib output since that would remove
        // pure annotations and break tree-shaking
        codegen: {
          removeWhitespace: false,
        },
      },
    }),
  },
});

const nodeDtsConfig = defineConfig({
  ...sharedNodeOptions,
  external: dtsExternalDeps,
  input: {
    index: resolve(__dirname, 'src/node/index.ts'),
    'adapters/react': resolve(__dirname, 'src/node/adapters/react/index.ts'),
    models: resolve(__dirname, 'src/node/models.ts'),
    'site-devtools/mcp': resolve(__dirname, 'src/node/site-devtools/mcp.ts'),
  },
  plugins: [
    createManagedLoggerAliasPlugin(),
    dts({
      tsconfig: 'src/node/tsconfig.json',
      emitDtsOnly: true,
      sourcemap,
    }),
  ],
});

const clientConfig = defineConfig({
  ...sharedBrowserOptions,
  input: {
    index: resolve(__dirname, 'src/client/index.ts'),
    'adapters/react': resolve(__dirname, 'src/client/adapters/react/index.ts'),
  },
  transform: {
    target: 'es2020',
  },
  plugins: [createManagedLoggerAliasPlugin()],
});

const clientDtsConfig = defineConfig({
  ...sharedBrowserOptions,
  external: dtsExternalDeps,
  input: {
    index: resolve(__dirname, 'src/client/index.ts'),
    'adapters/react': resolve(__dirname, 'src/client/adapters/react/index.ts'),
  },
  plugins: [
    createManagedLoggerAliasPlugin(),
    dts({
      tsconfig: 'src/client/tsconfig.json',
      emitDtsOnly: true,
      sourcemap,
    }),
  ],
  transform: {
    target: 'es2020',
  },
});

const clientRuntimeConfig = defineConfig({
  ...sharedBrowserOptions,
  external: dtsExternalDeps,
  input: {
    'internal/client-runtime': resolve(
      __dirname,
      'src/shared/internal/client-runtime.ts',
    ),
  },
  transform: {
    target: 'es2020',
    define: {
      __DEBUG__: JSON.stringify(debug),
    },
  },
  plugins: [
    {
      name: 'rolldown-plugin-copy-client-runtime-dts',
      generateBundle: {
        order: 'post',
        async handler() {
          const clientRuntimeDtsContent = await readFile(
            resolve(__dirname, 'src/shared/internal/client-runtime.d.ts'),
            'utf8',
          );
          this.emitFile({
            type: 'asset',
            fileName: 'shared/internal/client-runtime.d.ts',
            source: clientRuntimeDtsContent,
          });
        },
      },
    },
  ],
  output: {
    ...sharedBrowserOptions.output,
    /**
     * The runtime module is an optimization module that exposes features to the user side,
     * which directly copies the output products to the output directory on the user side,
     * therefore it does not include chunks dependencies temporarily.
     */
    manualChunks: undefined,
    sourcemap: sourcemap ? 'inline' : false,
    entryFileNames: 'shared/[name].js',
    ...(minify && {
      minify: {
        compress: true,
        mangle: false,
        // Do not minify whitespace for ES lib output since that would remove
        // pure annotations and break tree-shaking
        codegen: {
          removeWhitespace: false,
        },
      },
    }),
  },
});

const utilsConfig = defineConfig({
  ...sharedBrowserOptions,
  input: {
    logger: resolve(__dirname, 'src/shared/logger.ts'),
    'logger/presets': resolve(__dirname, 'src/shared/logger/presets.ts'),
  },
  transform: {
    target: 'es2020',
  },
  output: {
    ...sharedBrowserOptions.output,
    entryFileNames: 'shared/[name].js',
  },
});

const utilsConfigDtsConfig = defineConfig({
  ...sharedBrowserOptions,
  external: dtsExternalDeps,
  input: {
    logger: resolve(__dirname, 'src/shared/logger.ts'),
    'logger/presets': resolve(__dirname, 'src/shared/logger/presets.ts'),
  },
  plugins: [
    dts({
      tsconfig: 'src/client/tsconfig.json',
      emitDtsOnly: true,
      sourcemap,
    }),
  ],
  transform: {
    target: 'es2020',
  },
  output: {
    ...sharedBrowserOptions.output,
    entryFileNames: 'shared/[name].ts',
  },
});

const internalUtilsConfig = defineConfig({
  ...sharedBrowserOptions,
  input: {
    'internal/devtools': resolve(__dirname, 'src/shared/internal/devtools.ts'),
  },
  transform: {
    target: 'es2020',
  },
  output: {
    ...sharedBrowserOptions.output,
    entryFileNames: 'shared/[name].js',
  },
});

const internalUtilsDtsConfig = defineConfig({
  ...sharedBrowserOptions,
  external: dtsExternalDeps,
  input: {
    'internal/devtools': resolve(__dirname, 'src/shared/internal/devtools.ts'),
  },
  plugins: [
    dts({
      tsconfig: 'src/client/tsconfig.json',
      emitDtsOnly: true,
      sourcemap,
    }),
  ],
  transform: {
    target: 'es2020',
  },
  output: {
    ...sharedBrowserOptions.output,
    entryFileNames: 'shared/[name].ts',
  },
});

const configs: RolldownOptions[] = [
  nodeConfig,
  nodeDtsConfig,
  clientConfig,
  clientDtsConfig,
  clientRuntimeConfig,
  utilsConfig,
  utilsConfigDtsConfig,
  internalUtilsConfig,
  internalUtilsDtsConfig,
];

export default configs;
