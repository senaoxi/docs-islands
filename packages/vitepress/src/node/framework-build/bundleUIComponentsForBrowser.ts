/**
 * Browser bundle orchestration for UI components.
 * This file contains complex build pipeline logic that coordinates Vite bundling,
 * asset processing, and metrics collection. Some functions exceed complexity limits
 * due to the inherent nature of build orchestration.
 */
/* eslint-disable max-lines */
import type {
  ComponentBundleInfo,
  UsedSnippetContainerType,
} from '#dep-types/component';
import type {
  BundleAssetMetric,
  BundleModuleMetric,
  ComponentBuildMetric,
  PageBuildMetrics,
  PageBuildRenderInstanceMetric,
  RuntimeBundleMetric,
  SpaSyncComponentSideEffectMetric,
} from '#dep-types/page';
import type { RollupOutput } from '#dep-types/rollup';
import type { ConfigType } from '#dep-types/utils';
import { VITEPRESS_BUILD_LOG_GROUPS } from '#shared/constants/log-groups/build';
import { parse, type ParserPlugin } from '@babel/parser';
import { RENDER_STRATEGY_CONSTANTS } from '@docs-islands/core/shared/constants/render-strategy';
import { createElapsedLogOptions } from '@docs-islands/logger/helper';
import { isNodeLikeBuiltin } from '@docs-islands/utils/builtin';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { basename, dirname, extname, join, relative } from 'pathe';
import type { InlineConfig } from 'vite';
import { build } from 'vite';
import { createVitePressLoggerFacadePlugin } from '../core/vite-plugin-logger-facade';
import { createLoggerTreeShakingPlugin } from '../core/vite-plugin-logger-tree-shaking';
import { getVitePressGroupLogger } from '../logger';
import type {
  UIFrameworkBuildAdapter,
  UIFrameworkClientLoaderEntry,
} from './adapter';
import {
  createComponentEntryModules,
  isGeneratedComponentEntryModule,
  isOutputAsset,
  isOutputChunk,
  resolveSafeOutputPath,
} from './shared';

const elapsedSince = (startTimeMs: number) =>
  createElapsedLogOptions(startTimeMs, Date.now());

type BuildOutputMetric = BundleAssetMetric & {
  dynamicImports?: string[];
  imports?: string[];
  modules?: BundleModuleMetric[];
};

interface ViteManifestEntry {
  file?: string;
  src?: string;
}

const getBundleAssetBytes = (source: string | Uint8Array): number =>
  typeof source === 'string' ? Buffer.byteLength(source) : source.byteLength;

const getBundleAssetType = (fileName: string): BuildOutputMetric['type'] => {
  if (fileName.endsWith('.css')) {
    return 'css';
  }

  if (fileName.endsWith('.js') || fileName.endsWith('.mjs')) {
    return 'js';
  }

  return 'asset';
};

const sortBundleMetrics = <T>(
  metrics: Iterable<T>,
  compare: (left: T, right: T) => number,
): T[] => {
  const sortedMetrics = [...metrics];

  // Keep a copied-array sort so emitted package output stays ES2020-compatible.
  // eslint-disable-next-line unicorn/no-array-sort
  return sortedMetrics.sort(compare);
};

const sortBundleAssetMetrics = (
  metrics: Iterable<BundleAssetMetric>,
): BundleAssetMetric[] =>
  sortBundleMetrics(metrics, (left, right) =>
    left.file.localeCompare(right.file),
  );

const aggregateUniqueBundleAssetMetrics = (
  componentBuildMetrics: Iterable<ComponentBuildMetric>,
): BundleAssetMetric[] => {
  const metricsByFile = new Map<string, BundleAssetMetric>();

  for (const componentBuildMetric of componentBuildMetrics) {
    for (const fileMetric of componentBuildMetric.files) {
      const existingMetric = metricsByFile.get(fileMetric.file);

      if (existingMetric) {
        existingMetric.bytes = Math.max(existingMetric.bytes, fileMetric.bytes);
        continue;
      }

      metricsByFile.set(fileMetric.file, { ...fileMetric });
    }
  }

  return sortBundleAssetMetrics(metricsByFile.values());
};

const sortBundleModuleMetrics = (
  metrics: Iterable<BundleModuleMetric>,
): BundleModuleMetric[] =>
  sortBundleMetrics(metrics, (left, right) => {
    if (right.bytes !== left.bytes) {
      return right.bytes - left.bytes;
    }

    if (left.file !== right.file) {
      return left.file.localeCompare(right.file);
    }

    return left.id.localeCompare(right.id);
  });

const writeDebugSourceAsset = ({
  assetsDir,
  sourcePath,
  outDir,
  sourceAssetCache,
}: {
  assetsDir: string;
  sourcePath: string;
  outDir: string;
  sourceAssetCache: Map<string, string | undefined>;
}): string | undefined => {
  if (sourceAssetCache.has(sourcePath)) {
    return sourceAssetCache.get(sourcePath);
  }

  if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
    sourceAssetCache.set(sourcePath, undefined);
    return undefined;
  }

  const extension = extname(sourcePath) || '.txt';
  const safeBaseName = basename(sourcePath, extension).replaceAll(
    /[^\w.-]/g,
    '_',
  );
  const hash = createHash('sha1').update(sourcePath).digest('hex').slice(0, 8);
  const relativeFileName = join(
    assetsDir,
    'debug-sources',
    `${safeBaseName}.${hash}${extension}`,
  );
  const publicFileName = join('/', relativeFileName);

  try {
    const source = fs.readFileSync(sourcePath, 'utf8');
    const targetPath = resolveSafeOutputPath(outDir, relativeFileName);

    if (!fs.existsSync(dirname(targetPath))) {
      fs.mkdirSync(dirname(targetPath), { recursive: true });
    }

    fs.writeFileSync(targetPath, source);
    sourceAssetCache.set(sourcePath, publicFileName);
    return publicFileName;
  } catch {
    sourceAssetCache.set(sourcePath, undefined);
    return undefined;
  }
};

const stripBundledModuleQuery = (moduleId: string) =>
  moduleId.replace(/[#?].*$/, '');

const STYLE_SOURCE_EXTENSIONS = new Set([
  '.css',
  '.less',
  '.pcss',
  '.postcss',
  '.sass',
  '.scss',
  '.styl',
  '.stylus',
]);
const SCRIPT_SOURCE_EXTENSIONS = new Set([
  '.cjs',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.mts',
  '.ts',
  '.tsx',
]);
const LOCAL_SOURCE_RESOLVE_EXTENSIONS = [
  ...SCRIPT_SOURCE_EXTENSIONS,
  ...STYLE_SOURCE_EXTENSIONS,
  '.json',
];
const moduleGraphParserPlugins: ParserPlugin[] = [
  'jsx',
  'typescript',
  'importAttributes',
  'decorators-legacy',
  'topLevelAwait',
];

const isStyleSourcePath = (sourcePath: string) =>
  STYLE_SOURCE_EXTENSIONS.has(
    extname(stripBundledModuleQuery(sourcePath)).toLowerCase(),
  );

const isStaticAssetSourcePath = (sourcePath: string) => {
  const extension = extname(stripBundledModuleQuery(sourcePath)).toLowerCase();

  return (
    Boolean(extension) &&
    extension !== '.json' &&
    !STYLE_SOURCE_EXTENSIONS.has(extension) &&
    !SCRIPT_SOURCE_EXTENSIONS.has(extension)
  );
};

const shouldTraverseSourcePath = (sourcePath: string) =>
  SCRIPT_SOURCE_EXTENSIONS.has(
    extname(stripBundledModuleQuery(sourcePath)).toLowerCase(),
  );

const resolveBundledModuleSourcePath = (
  moduleId: string,
): string | undefined => {
  const candidates = [moduleId, stripBundledModuleQuery(moduleId)];

  for (const candidate of candidates) {
    if (!candidate || !fs.existsSync(candidate)) {
      continue;
    }

    if (fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }

  return undefined;
};

const getSourceSizeHint = (sourcePath?: string) => {
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    return 0;
  }

  try {
    return fs.statSync(sourcePath).size;
  } catch {
    return 0;
  }
};

const distributeAssetBytesAcrossModules = (
  totalBytes: number,
  sizeHints: number[],
) => {
  if (sizeHints.length === 0) {
    return [];
  }

  const normalizedSizeHints = sizeHints.some((value) => value > 0)
    ? sizeHints.map((value) => (value > 0 ? value : 1))
    : sizeHints.map(() => 1);
  const totalHints = normalizedSizeHints.reduce((sum, value) => sum + value, 0);

  let allocatedBytes = 0;

  return normalizedSizeHints.map((sizeHint, index) => {
    if (index === normalizedSizeHints.length - 1) {
      return Math.max(totalBytes - allocatedBytes, 0);
    }

    const nextBytes =
      totalHints > 0 ? Math.floor((totalBytes * sizeHint) / totalHints) : 0;
    allocatedBytes += nextBytes;
    return nextBytes;
  });
};

const createBundleModuleMetric = ({
  assetsDir,
  bytes,
  file,
  id,
  outDir,
  sourceAssetCache,
}: {
  assetsDir: string;
  bytes: number;
  file: string;
  id: string;
  outDir: string;
  sourceAssetCache: Map<string, string | undefined>;
}): BundleModuleMetric => {
  const sourcePath = resolveBundledModuleSourcePath(id);

  return {
    bytes,
    file,
    id,
    sourceAssetFile: sourcePath
      ? writeDebugSourceAsset({
          assetsDir,
          outDir,
          sourceAssetCache,
          sourcePath,
        })
      : undefined,
    sourcePath,
  };
};

const getOutputAssetModuleIds = (file: {
  originalFileName?: string | null;
  originalFileNames?: string[];
}) =>
  [
    ...new Set(
      file.originalFileNames?.length
        ? file.originalFileNames
        : file.originalFileName
          ? [file.originalFileName]
          : [],
    ),
  ].filter((value): value is string => Boolean(value));

const resolveManifestModuleId = (rootDir: string, moduleId: string) => {
  const candidates = [
    moduleId,
    join(rootDir, stripBundledModuleQuery(moduleId)),
  ];

  for (const candidate of candidates) {
    const resolvedPath = resolveBundledModuleSourcePath(candidate);

    if (resolvedPath) {
      return resolvedPath;
    }
  }

  return moduleId;
};

const resolveLocalSourceImportPath = (
  importerPath: string,
  importPath: string,
): string | null => {
  const normalizedImportPath = stripBundledModuleQuery(importPath);

  if (
    !normalizedImportPath ||
    normalizedImportPath.startsWith('\0') ||
    (!normalizedImportPath.startsWith('.') &&
      !normalizedImportPath.startsWith('/'))
  ) {
    return null;
  }

  const absoluteBasePath = normalizedImportPath.startsWith('/')
    ? normalizedImportPath
    : join(dirname(importerPath), normalizedImportPath);
  const candidatePaths = extname(absoluteBasePath)
    ? [absoluteBasePath]
    : [
        ...LOCAL_SOURCE_RESOLVE_EXTENSIONS.map(
          (extension) => `${absoluteBasePath}${extension}`,
        ),
        ...LOCAL_SOURCE_RESOLVE_EXTENSIONS.map((extension) =>
          join(absoluteBasePath, `index${extension}`),
        ),
      ];

  for (const candidatePath of candidatePaths) {
    if (!fs.existsSync(candidatePath)) {
      continue;
    }

    if (fs.statSync(candidatePath).isFile()) {
      return candidatePath;
    }
  }

  return null;
};

const collectStyleSourcePathsForModule = async (
  modulePath: string,
  seenPaths = new Set<string>(),
  styleSourcePaths = new Set<string>(),
): Promise<string[]> => {
  const resolvedModulePath = resolveBundledModuleSourcePath(modulePath);

  if (!resolvedModulePath || seenPaths.has(resolvedModulePath)) {
    return [...styleSourcePaths];
  }

  seenPaths.add(resolvedModulePath);

  if (!shouldTraverseSourcePath(resolvedModulePath)) {
    return [...styleSourcePaths];
  }

  let sourceCode = '';
  try {
    sourceCode = fs.readFileSync(resolvedModulePath, 'utf8');
  } catch {
    return [...styleSourcePaths];
  }

  let importPaths: string[] = [];
  try {
    const program = parse(sourceCode, {
      plugins: moduleGraphParserPlugins,
      sourceType: 'module',
    }).program;
    importPaths = program.body.flatMap((statement) => {
      if (
        statement.type === 'ImportDeclaration' &&
        statement.importKind !== 'type'
      ) {
        return [statement.source.value];
      }

      if (
        statement.type === 'ExportAllDeclaration' ||
        statement.type === 'ExportNamedDeclaration'
      ) {
        return statement.source ? [statement.source.value] : [];
      }

      return [];
    });
  } catch {
    return [...styleSourcePaths];
  }

  for (const importPath of importPaths) {
    const resolvedImportPath = resolveLocalSourceImportPath(
      resolvedModulePath,
      importPath,
    );

    if (!resolvedImportPath) {
      continue;
    }

    if (isStyleSourcePath(resolvedImportPath)) {
      styleSourcePaths.add(resolvedImportPath);
      continue;
    }

    if (shouldTraverseSourcePath(resolvedImportPath)) {
      await collectStyleSourcePathsForModule(
        resolvedImportPath,
        seenPaths,
        styleSourcePaths,
      );
    }
  }

  return sortBundleMetrics(styleSourcePaths, (left, right) =>
    left.localeCompare(right),
  );
};

const getOutputAssetModuleIdsByFile = (
  files: RollupOutput['output'],
  rootDir: string,
  isMatchingSourcePath: (sourcePath: string) => boolean,
) => {
  const manifestAsset = files.find(
    (
      file,
    ): file is Extract<RollupOutput['output'][number], { type: 'asset' }> =>
      isOutputAsset(file) &&
      file.fileName.endsWith('manifest.json') &&
      typeof file.source === 'string',
  );
  const moduleIdsByFile = new Map<string, string[]>();

  if (!manifestAsset || typeof manifestAsset.source !== 'string') {
    return moduleIdsByFile;
  }

  try {
    const manifest = JSON.parse(manifestAsset.source) as Record<
      string,
      ViteManifestEntry
    >;

    for (const [key, entry] of Object.entries(manifest)) {
      if (!entry || typeof entry.file !== 'string') {
        continue;
      }

      const rawModuleId =
        typeof entry.src === 'string' && isMatchingSourcePath(entry.src)
          ? entry.src
          : isMatchingSourcePath(key)
            ? key
            : undefined;

      if (!rawModuleId) {
        continue;
      }

      const nextModuleId = resolveManifestModuleId(rootDir, rawModuleId);
      const existingModuleIds = moduleIdsByFile.get(entry.file) ?? [];

      if (!existingModuleIds.includes(nextModuleId)) {
        existingModuleIds.push(nextModuleId);
        moduleIdsByFile.set(entry.file, existingModuleIds);
      }
    }
  } catch {
    return moduleIdsByFile;
  }

  return moduleIdsByFile;
};

const createModuleMetricsForAssetFile = ({
  assetBytes,
  assetsDir,
  moduleIds,
  outDir,
  outputFile,
  sourceAssetCache,
}: {
  assetBytes: number;
  assetsDir: string;
  moduleIds: string[];
  outDir: string;
  outputFile: string;
  sourceAssetCache: Map<string, string | undefined>;
}) => {
  if (moduleIds.length === 0) {
    return [];
  }

  const sizeHints = moduleIds.map((moduleId) =>
    getSourceSizeHint(resolveBundledModuleSourcePath(moduleId)),
  );
  const distributedBytes = distributeAssetBytesAcrossModules(
    assetBytes,
    sizeHints,
  );

  return moduleIds.map((moduleId, index) =>
    createBundleModuleMetric({
      assetsDir,
      bytes: distributedBytes[index] ?? 0,
      file: outputFile,
      id: moduleId,
      outDir,
      sourceAssetCache,
    }),
  );
};

const createCssAssetModuleMetrics = ({
  assetBytes,
  assetsDir,
  file,
  manifestModuleIds,
  outDir,
  sourceAssetCache,
}: {
  assetBytes: number;
  assetsDir: string;
  file: {
    fileName: string;
    originalFileName?: string | null;
    originalFileNames?: string[];
  };
  manifestModuleIds?: string[];
  outDir: string;
  sourceAssetCache: Map<string, string | undefined>;
}) => {
  if (getBundleAssetType(file.fileName) !== 'css') {
    return [];
  }

  const moduleIds = manifestModuleIds?.length
    ? manifestModuleIds
    : getOutputAssetModuleIds(file);

  if (moduleIds.length === 0) {
    return [];
  }

  return createModuleMetricsForAssetFile({
    assetBytes,
    assetsDir,
    moduleIds,
    outDir,
    outputFile: join('/', file.fileName),
    sourceAssetCache,
  }).filter((moduleMetric) =>
    isStyleSourcePath(moduleMetric.sourcePath || moduleMetric.id),
  );
};

const createStaticAssetModuleMetrics = ({
  assetBytes,
  assetsDir,
  file,
  manifestModuleIds,
  outDir,
  sourceAssetCache,
}: {
  assetBytes: number;
  assetsDir: string;
  file: {
    fileName: string;
    originalFileName?: string | null;
    originalFileNames?: string[];
  };
  manifestModuleIds?: string[];
  outDir: string;
  sourceAssetCache: Map<string, string | undefined>;
}) => {
  if (getBundleAssetType(file.fileName) !== 'asset') {
    return [];
  }

  const moduleIds = manifestModuleIds?.length
    ? manifestModuleIds
    : getOutputAssetModuleIds(file);

  if (moduleIds.length === 0) {
    return [];
  }

  return createModuleMetricsForAssetFile({
    assetBytes,
    assetsDir,
    moduleIds,
    outDir,
    outputFile: join('/', file.fileName),
    sourceAssetCache,
  });
};

function collectReferencedJsFiles(
  entryFile: string,
  outputMetricMap: Map<string, BuildOutputMetric>,
  seen = new Set<string>(),
): Set<string> {
  if (seen.has(entryFile)) {
    return seen;
  }

  const currentMetric = outputMetricMap.get(entryFile);
  if (!currentMetric || currentMetric.type !== 'js') {
    return seen;
  }

  seen.add(entryFile);

  for (const importFile of currentMetric.imports ?? []) {
    collectReferencedJsFiles(importFile, outputMetricMap, seen);
  }

  for (const importFile of currentMetric.dynamicImports ?? []) {
    collectReferencedJsFiles(importFile, outputMetricMap, seen);
  }

  return seen;
}

function createRuntimeBundleMetric(
  entryFile: string,
  outputMetricMap: Map<string, BuildOutputMetric>,
): RuntimeBundleMetric | null {
  const files = sortBundleAssetMetrics(
    [...collectReferencedJsFiles(entryFile, outputMetricMap)]
      .map((file) => outputMetricMap.get(file))
      .filter((metric): metric is BuildOutputMetric => Boolean(metric))
      .map(({ bytes, file, type }) => ({ bytes, file, type })),
  );

  if (files.length === 0) {
    return null;
  }

  return {
    entryFile,
    files,
    totalBytes: files.reduce((sum, metric) => sum + metric.bytes, 0),
  };
}

function createSpaSyncBuildEffects(
  usedSnippetContainer: Map<string, UsedSnippetContainerType>,
  outputMetricMap: Map<string, BuildOutputMetric>,
): PageBuildMetrics['spaSyncEffects'] {
  const componentEffectMap = new Map<
    string,
    SpaSyncComponentSideEffectMetric
  >();

  for (const [renderId, usedSnippet] of usedSnippetContainer.entries()) {
    if (
      !usedSnippet.useSpaSyncRender ||
      usedSnippet.renderDirective === 'client:only'
    ) {
      continue;
    }

    const existing =
      componentEffectMap.get(usedSnippet.renderComponent) ??
      ({
        blockingCssBytes: 0,
        blockingCssCount: 0,
        blockingCssFiles: [],
        componentName: usedSnippet.renderComponent,
        embeddedHtmlPatches: [],
        embeddedHtmlBytes: 0,
        renderDirectives: [],
        renderIds: [],
        requiresCssLoadingRuntime: false,
      } satisfies SpaSyncComponentSideEffectMetric);

    existing.renderIds.push(renderId);

    if (!existing.renderDirectives.includes(usedSnippet.renderDirective)) {
      existing.renderDirectives.push(usedSnippet.renderDirective);
      existing.renderDirectives.sort();
    }

    if (usedSnippet.ssrHtml) {
      existing.embeddedHtmlPatches.push({
        bytes: getBundleAssetBytes(usedSnippet.ssrHtml),
        html: usedSnippet.ssrHtml,
        renderId,
      });
      existing.embeddedHtmlBytes += getBundleAssetBytes(usedSnippet.ssrHtml);
    }

    if (usedSnippet.ssrCssBundlePaths?.size) {
      existing.requiresCssLoadingRuntime = true;

      for (const cssFile of usedSnippet.ssrCssBundlePaths) {
        const metric = outputMetricMap.get(cssFile);

        if (!metric || metric.type !== 'css') {
          continue;
        }

        if (
          existing.blockingCssFiles.some((item) => item.file === metric.file)
        ) {
          continue;
        }

        existing.blockingCssFiles.push({
          bytes: metric.bytes,
          file: metric.file,
          type: metric.type,
        });
        existing.blockingCssBytes += metric.bytes;
      }
    }

    existing.blockingCssFiles = sortBundleAssetMetrics(
      existing.blockingCssFiles,
    );
    existing.blockingCssCount = existing.blockingCssFiles.length;
    existing.embeddedHtmlPatches = sortBundleMetrics(
      existing.embeddedHtmlPatches,
      (left, right) => left.renderId.localeCompare(right.renderId),
    );
    componentEffectMap.set(usedSnippet.renderComponent, existing);
  }

  if (componentEffectMap.size === 0) {
    return null;
  }

  const components = sortBundleMetrics(
    componentEffectMap.values(),
    (left, right) => left.componentName.localeCompare(right.componentName),
  );

  return {
    components,
    enabledComponentCount: components.length,
    enabledRenderCount: components.reduce(
      (sum, component) => sum + component.renderIds.length,
      0,
    ),
    totalBlockingCssBytes: components.reduce(
      (sum, component) => sum + component.blockingCssBytes,
      0,
    ),
    totalBlockingCssCount: components.reduce(
      (sum, component) => sum + component.blockingCssCount,
      0,
    ),
    totalEmbeddedHtmlBytes: components.reduce(
      (sum, component) => sum + component.embeddedHtmlBytes,
      0,
    ),
    usesCssLoadingRuntime: components.some(
      (component) => component.requiresCssLoadingRuntime,
    ),
  };
}

function createRenderInstanceMetrics(
  componentEntries: {
    componentName: string;
    componentPath: string;
  }[],
  srcDir: string,
  usedSnippetContainer: Map<string, UsedSnippetContainerType>,
  outputMetricMap: Map<string, BuildOutputMetric>,
): PageBuildMetrics['renderInstances'] {
  const componentSourcePathByName = new Map(
    componentEntries.map((entry) => [
      entry.componentName,
      relative(srcDir, entry.componentPath),
    ]),
  );
  const renderInstances: PageBuildRenderInstanceMetric[] = [];

  for (const [sequenceIndex, [renderId, usedSnippet]] of [
    ...usedSnippetContainer.entries(),
  ].entries()) {
    const blockingCssFiles = sortBundleAssetMetrics(
      [...(usedSnippet.ssrCssBundlePaths ?? [])]
        .map((cssFile) => outputMetricMap.get(cssFile))
        .filter((metric): metric is BuildOutputMetric =>
          Boolean(metric && metric.type === 'css'),
        )
        .map(({ bytes, file, type }) => ({ bytes, file, type })),
    );
    const blockingCssBytes = blockingCssFiles.reduce(
      (sum, metric) => sum + metric.bytes,
      0,
    );
    const effectiveSpaSyncRender =
      usedSnippet.useSpaSyncRender &&
      usedSnippet.renderDirective !== 'client:only';

    renderInstances.push({
      blockingCssBytes,
      blockingCssCount: blockingCssFiles.length,
      blockingCssFiles,
      componentName: usedSnippet.renderComponent,
      embeddedHtmlBytes: usedSnippet.ssrHtml
        ? getBundleAssetBytes(usedSnippet.ssrHtml)
        : 0,
      renderDirective: usedSnippet.renderDirective,
      renderId,
      sequence: sequenceIndex + 1,
      sourcePath:
        usedSnippet.sourcePath ||
        componentSourcePathByName.get(usedSnippet.renderComponent),
      useSpaSyncRender: effectiveSpaSyncRender,
      usesCssLoadingRuntime:
        effectiveSpaSyncRender && Boolean(usedSnippet.ssrCssBundlePaths?.size),
    });
  }

  return renderInstances;
}

async function bundleRuntimeModuleWithVite(
  config: Pick<
    ConfigType,
    'root' | 'outDir' | 'assetsDir' | 'cacheDir' | 'base'
  >,
  loggerScopeId: string,
  runtimeModule: {
    entryFileBaseName: string;
    source: string;
  },
): Promise<{
  entryFile: string;
  metric: RuntimeBundleMetric | null;
}> {
  const tempEntryDir = join(
    config.cacheDir,
    `${runtimeModule.entryFileBaseName}-entry-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}`,
  );
  const tempEntryPath = join(
    tempEntryDir,
    `${runtimeModule.entryFileBaseName}-entry.mjs`,
  );

  fs.mkdirSync(tempEntryDir, { recursive: true });
  fs.writeFileSync(tempEntryPath, runtimeModule.source);

  try {
    const result = (await build({
      root: config.root,
      base: config.base,
      cacheDir: join(config.cacheDir, 'vite-runtime-modules'),
      configFile: false,
      publicDir: false,
      logLevel: 'warn',
      plugins: [
        createVitePressLoggerFacadePlugin(loggerScopeId),
        createLoggerTreeShakingPlugin(loggerScopeId),
      ],
      build: {
        outDir: config.outDir,
        emptyOutDir: false,
        write: false,
        target: 'es2020',
        minify: true,
        rollupOptions: {
          input: tempEntryPath,
          preserveEntrySignatures: 'allow-extension',
          output: {
            format: 'esm',
            assetFileNames: `${config.assetsDir}/${runtimeModule.entryFileBaseName}.[hash].[ext]`,
            entryFileNames: `${config.assetsDir}/${runtimeModule.entryFileBaseName}.[hash].js`,
            chunkFileNames: `${config.assetsDir}/chunks/${runtimeModule.entryFileBaseName}.[hash].js`,
          },
        },
      },
    })) as RollupOutput | RollupOutput[];

    const output = Array.isArray(result) ? result[0] : result;
    if (!output?.output || output.output.length === 0) {
      throw new Error(
        `Expected ${runtimeModule.entryFileBaseName} bundle output`,
      );
    }

    let runtimeScriptRelativePath = '';
    const outputMetricMap = new Map<string, BuildOutputMetric>();

    for (const chunk of output.output) {
      const fullOutputPath = resolveSafeOutputPath(
        config.outDir,
        chunk.fileName,
      );
      if (!fs.existsSync(dirname(fullOutputPath))) {
        fs.mkdirSync(dirname(fullOutputPath), { recursive: true });
      }

      if (isOutputChunk(chunk)) {
        fs.writeFileSync(fullOutputPath, chunk.code);
        const relativePath = join('/', chunk.fileName);
        outputMetricMap.set(relativePath, {
          bytes: Buffer.byteLength(chunk.code),
          dynamicImports: chunk.dynamicImports.map((file) => join('/', file)),
          file: relativePath,
          imports: chunk.imports.map((file) => join('/', file)),
          type: 'js',
        });
        if (chunk.isEntry) {
          runtimeScriptRelativePath = relativePath;
        }
      } else if (isOutputAsset(chunk)) {
        fs.writeFileSync(fullOutputPath, chunk.source);
        const relativePath = join('/', chunk.fileName);
        outputMetricMap.set(relativePath, {
          bytes: getBundleAssetBytes(chunk.source),
          file: relativePath,
          type: getBundleAssetType(chunk.fileName),
        });
      }
    }

    if (!runtimeScriptRelativePath) {
      throw new Error(
        `Failed to locate ${runtimeModule.entryFileBaseName} entry output`,
      );
    }

    return {
      entryFile: runtimeScriptRelativePath,
      metric: createRuntimeBundleMetric(
        runtimeScriptRelativePath,
        outputMetricMap,
      ),
    };
  } finally {
    fs.rmSync(tempEntryDir, { recursive: true, force: true });
  }
}

// Complex build orchestration function that coordinates Vite bundling, asset processing,
// and metrics collection. The complexity is inherent to the build pipeline.
/* eslint-disable max-lines-per-function, complexity */
export async function bundleUIComponentsForBrowser(
  config: ConfigType,
  components: ComponentBundleInfo[],
  usedSnippetContainer: Map<string, UsedSnippetContainerType>,
  adapter: UIFrameworkBuildAdapter,
  loggerScopeId: string,
): Promise<{
  buildMetrics: PageBuildMetrics;
  loaderScript: string;
  modulePreloads: string[];
  cssBundlePaths: string[];
  ssrInjectScript: string;
}> {
  const bundleStartedAt = Date.now();
  const Logger = getVitePressGroupLogger(
    VITEPRESS_BUILD_LOG_GROUPS.frameworkBrowserBundle,
    loggerScopeId,
  );
  const { base, srcDir, assetsDir, outDir, wrapBaseUrl, cleanUrls, cacheDir } =
    config;
  if (components.length === 0) {
    return {
      buildMetrics: {
        components: [],
        framework: adapter.framework,
        loader: null,
        spaSyncEffects: null,
        ssrInject: null,
        totalEstimatedComponentBytes: 0,
      },
      loaderScript: '',
      modulePreloads: [],
      cssBundlePaths: [],
      ssrInjectScript: '',
    };
  }

  const preparedEntryModules = createComponentEntryModules({
    cacheDir,
    components,
    namespace: 'browser',
  });
  const entryNameToComponent = new Map(
    preparedEntryModules.entries.map(({ component, entryName }) => [
      entryName,
      component,
    ]),
  );

  try {
    const sourceAssetCache = new Map<string, string | undefined>();
    const viteConfig: InlineConfig = {
      root: srcDir,
      base,
      build: {
        ssr: false,
        rollupOptions: {
          input: preparedEntryModules.entryPoints,
          preserveEntrySignatures: 'allow-extension',
          external: (id) => {
            /**
             * Components using only the `ssr:only` directive will also go through the client-side build process,
             * so node modules need to be externalized.
             */
            if (isNodeLikeBuiltin(id)) {
              return true;
            }
            return false;
          },
          output: {
            format: 'esm',
            assetFileNames: `${assetsDir}/[name].[hash].[ext]`,
            entryFileNames: `${assetsDir}/[name].[hash].js`,
            chunkFileNames: `${assetsDir}/chunks/[name].[hash].js`,
          },
        },
        write: false,
        target: 'es2020',
        minify: true,
        manifest: true,
        assetsInlineLimit: 4096,
        cssCodeSplit: true,
      },
      plugins: [
        createVitePressLoggerFacadePlugin(loggerScopeId),
        createLoggerTreeShakingPlugin(loggerScopeId),
        ...adapter.browserBundlerPlugins(),
      ],
      logLevel: 'warn',
    };

    const output = await build(viteConfig);
    if (!output || !('output' in output) || !Array.isArray(output.output)) {
      throw new Error('Expected a array output bundle');
    }

    const cssAssetModuleIdsByFile = getOutputAssetModuleIdsByFile(
      output.output,
      srcDir,
      isStyleSourcePath,
    );
    const staticAssetModuleIdsByFile = getOutputAssetModuleIdsByFile(
      output.output,
      srcDir,
      isStaticAssetSourcePath,
    );
    const componentEntries: {
      componentPath: string;
      componentName: string;
      cssBundlePath: string[];
      assetsBundlePath: string[];
      loaderImportedName: UIFrameworkClientLoaderEntry['loaderImportedName'];
      modulePath: string;
      pendingRenderIds: Set<string>;
      renderDirectives: ComponentBundleInfo['renderDirectives'];
      styleSourcePaths: string[];
    }[] = [];
    const modulePreloads: string[] = [];
    const cssBundlePaths: string[] = [];
    const preRenderComponentNameToCssBundlePathsMap = new Map<
      string,
      Set<string>
    >();
    const outputMetricMap = new Map<string, BuildOutputMetric>();

    for (const chunk of output.output) {
      if (isOutputChunk(chunk) && chunk.isEntry && chunk.facadeModuleId) {
        const clientComponentInfo = entryNameToComponent.get(chunk.name);

        if (!clientComponentInfo) continue;

        const componentModuleRelativePath = join('/', chunk.fileName);

        const importedCss = [...(chunk.viteMetadata?.importedCss ?? [])];
        const publicCssBundlePaths = importedCss.map((css) => join('/', css));

        /**
         * If the rendering component in the current page is NOT only rendered with client:only strategy,
         * it means that the rendering component needs server-side pre-rendering or other strategies.
         */
        if (
          !clientComponentInfo.renderDirectives.has('client:only') ||
          clientComponentInfo.renderDirectives.size > 1
        ) {
          preRenderComponentNameToCssBundlePathsMap.set(
            clientComponentInfo.componentName,
            new Set(publicCssBundlePaths),
          );
        }

        /**
         * If the component is ssr:only and the only directive is ssr:only,
         * At this time, we don't need to inject client code.
         */
        if (
          clientComponentInfo.renderDirectives.has('ssr:only') &&
          clientComponentInfo.renderDirectives.size === 1
        ) {
          continue;
        }

        const importedAssets = [...(chunk.viteMetadata?.importedAssets ?? [])];
        const publicAssetsBundlePaths = importedAssets.map((asset) =>
          join('/', asset),
        );
        const styleSourcePaths = await collectStyleSourcePathsForModule(
          clientComponentInfo.componentPath,
        );

        componentEntries.push({
          componentPath: clientComponentInfo.componentPath,
          componentName: clientComponentInfo.componentName,
          cssBundlePath: publicCssBundlePaths,
          assetsBundlePath: publicAssetsBundlePaths,
          loaderImportedName: 'default',
          modulePath: componentModuleRelativePath,
          pendingRenderIds: clientComponentInfo.pendingRenderIds,
          renderDirectives: clientComponentInfo.renderDirectives,
          styleSourcePaths,
        });
      }

      if (isOutputChunk(chunk)) {
        const fullOutputPath = resolveSafeOutputPath(outDir, chunk.fileName);
        const code = chunk.code;
        if (!fs.existsSync(dirname(fullOutputPath))) {
          fs.mkdirSync(dirname(fullOutputPath), { recursive: true });
        }
        fs.writeFileSync(fullOutputPath, code);
        const relativeOutputPath = join('/', chunk.fileName);
        outputMetricMap.set(relativeOutputPath, {
          bytes: Buffer.byteLength(code),
          dynamicImports: chunk.dynamicImports.map((file) => join('/', file)),
          file: relativeOutputPath,
          imports: chunk.imports.map((file) => join('/', file)),
          modules: Object.entries(chunk.modules ?? {})
            .map(([id, moduleInfo]) =>
              createBundleModuleMetric({
                assetsDir,
                bytes:
                  typeof moduleInfo.renderedLength === 'number'
                    ? moduleInfo.renderedLength
                    : 0,
                file: relativeOutputPath,
                id,
                outDir,
                sourceAssetCache,
              }),
            )
            .filter(
              (metric) =>
                metric.bytes > 0 &&
                !isGeneratedComponentEntryModule(
                  metric.id,
                  preparedEntryModules.tempEntryDir,
                ),
            ),
          type: 'js',
        });
        modulePreloads.push(relativeOutputPath);
      }

      if (isOutputAsset(chunk)) {
        const fullOutputPath = resolveSafeOutputPath(outDir, chunk.fileName);
        const code = chunk.source;
        const assetType = getBundleAssetType(chunk.fileName);
        if (!fs.existsSync(dirname(fullOutputPath))) {
          fs.mkdirSync(dirname(fullOutputPath), { recursive: true });
        }
        fs.writeFileSync(fullOutputPath, code);
        const relativeOutputPath = join('/', chunk.fileName);
        outputMetricMap.set(relativeOutputPath, {
          bytes: getBundleAssetBytes(code),
          file: relativeOutputPath,
          modules:
            assetType === 'css'
              ? createCssAssetModuleMetrics({
                  assetBytes: getBundleAssetBytes(code),
                  assetsDir,
                  file: chunk,
                  manifestModuleIds: cssAssetModuleIdsByFile.get(
                    chunk.fileName,
                  ),
                  outDir,
                  sourceAssetCache,
                })
              : assetType === 'asset'
                ? createStaticAssetModuleMetrics({
                    assetBytes: getBundleAssetBytes(code),
                    assetsDir,
                    file: chunk,
                    manifestModuleIds: staticAssetModuleIdsByFile.get(
                      chunk.fileName,
                    ),
                    outDir,
                    sourceAssetCache,
                  })
                : [],
          type: assetType,
        });
        if (chunk.fileName.endsWith('.css')) {
          cssBundlePaths.push(relativeOutputPath);
        }
      }
    }

    const componentBuildMetrics: ComponentBuildMetric[] = componentEntries.map(
      (entry) => {
        const files = new Map<string, BundleAssetMetric>();
        const modules = new Map<string, BundleModuleMetric>();

        for (const jsFile of collectReferencedJsFiles(
          entry.modulePath,
          outputMetricMap,
        )) {
          const metric = outputMetricMap.get(jsFile);
          if (metric) {
            files.set(metric.file, {
              bytes: metric.bytes,
              file: metric.file,
              type: metric.type,
            });

            for (const moduleMetric of metric.modules ?? []) {
              modules.set(
                `${moduleMetric.file}::${moduleMetric.id}`,
                moduleMetric,
              );
            }
          }
        }

        for (const file of [
          ...entry.cssBundlePath,
          ...entry.assetsBundlePath,
        ]) {
          const metric = outputMetricMap.get(file);
          if (metric) {
            files.set(metric.file, {
              bytes: metric.bytes,
              file: metric.file,
              type: metric.type,
            });

            const fallbackCssModules =
              metric.type === 'css' &&
              entry.styleSourcePaths.length > 0 &&
              !(metric.modules ?? []).some((moduleMetric) =>
                isStyleSourcePath(moduleMetric.sourcePath || moduleMetric.id),
              )
                ? createModuleMetricsForAssetFile({
                    assetBytes: metric.bytes,
                    assetsDir,
                    moduleIds: entry.styleSourcePaths,
                    outDir,
                    outputFile: metric.file,
                    sourceAssetCache,
                  })
                : [];

            for (const moduleMetric of [
              ...(metric.modules ?? []),
              ...fallbackCssModules,
            ]) {
              modules.set(
                `${moduleMetric.file}::${moduleMetric.id}`,
                moduleMetric,
              );
            }
          }
        }

        const metricFiles = sortBundleAssetMetrics(files.values());
        const estimatedJsBytes = metricFiles
          .filter((file) => file.type === 'js')
          .reduce((sum, file) => sum + file.bytes, 0);
        const estimatedCssBytes = metricFiles
          .filter((file) => file.type === 'css')
          .reduce((sum, file) => sum + file.bytes, 0);
        const estimatedAssetBytes = metricFiles
          .filter((file) => file.type === 'asset')
          .reduce((sum, file) => sum + file.bytes, 0);

        return {
          componentName: entry.componentName,
          entryFile: entry.modulePath,
          estimatedAssetBytes,
          estimatedCssBytes,
          estimatedJsBytes,
          estimatedTotalBytes:
            estimatedJsBytes + estimatedCssBytes + estimatedAssetBytes,
          files: metricFiles,
          framework: adapter.framework,
          modules: sortBundleModuleMetrics(modules.values()),
          renderDirectives: sortBundleMetrics(
            entry.renderDirectives,
            (left, right) => left.localeCompare(right),
          ),
          sourcePath: relative(srcDir, entry.componentPath),
        };
      },
    );

    const ssrInjectCodeSnippet: string[] = [];
    for (const [renderId, usedSnippet] of usedSnippetContainer.entries()) {
      if (usedSnippet.ssrHtml && !usedSnippet.useSpaSyncRender) {
        if (ssrInjectCodeSnippet.length === 0) {
          ssrInjectCodeSnippet.push(
            'export const __SSR_INJECT_CODE__ = () => {',
          );
        }
        ssrInjectCodeSnippet.push(`
          const __SSR_DOM_${usedSnippet.renderId}__ = document.querySelector('[${RENDER_STRATEGY_CONSTANTS.renderId}="${renderId}"]');
          if (__SSR_DOM_${usedSnippet.renderId}__) {
            __SSR_DOM_${usedSnippet.renderId}__.innerHTML = \`${usedSnippet.ssrHtml}\`;
          }
          `);
      } else if (usedSnippet.useSpaSyncRender) {
        /**
         * When rendering using the spa:sync-render instruction,
         * if not rendered with the client:only strategy,
         * the page rendering in route switching scenarios needs to wait
         * until the corresponding rendering component's styles are loaded before rendering.
         */
        if (
          preRenderComponentNameToCssBundlePathsMap.has(
            usedSnippet.renderComponent,
          )
        ) {
          usedSnippet.ssrCssBundlePaths =
            preRenderComponentNameToCssBundlePathsMap.get(
              usedSnippet.renderComponent,
            );
        }
      }
    }
    const spaSyncEffects = createSpaSyncBuildEffects(
      usedSnippetContainer,
      outputMetricMap,
    );
    const renderInstances = createRenderInstanceMetrics(
      componentEntries,
      srcDir,
      usedSnippetContainer,
      outputMetricMap,
    );

    if (ssrInjectCodeSnippet.length > 0) {
      ssrInjectCodeSnippet.push('};');
    }

    /**
     * Keep the framework-specific runtime source outside the shared framework
     * build layer so adding a new UI framework does not require changing
     * generic build logic.
     */
    const unifiedLoaderCode = adapter.createClientLoaderModuleSource({
      base,
      cleanUrls,
      componentEntries: componentEntries.map((entry) => ({
        componentName: entry.componentName,
        loaderImportedName: entry.loaderImportedName,
        modulePath: wrapBaseUrl(entry.modulePath),
      })),
    });
    const loaderBuildResult = await bundleRuntimeModuleWithVite(
      config,
      loggerScopeId,
      {
        entryFileBaseName: 'unified-loader',
        source: unifiedLoaderCode,
      },
    );

    let ssrInjectScriptRelativePath = '';
    let ssrInjectMetric: RuntimeBundleMetric | null = null;
    if (ssrInjectCodeSnippet.length > 0) {
      const ssrInjectBuildResult = await bundleRuntimeModuleWithVite(
        config,
        loggerScopeId,
        {
          entryFileBaseName: 'ssr-inject-code',
          source: ssrInjectCodeSnippet.join('\n'),
        },
      );
      ssrInjectScriptRelativePath = ssrInjectBuildResult.entryFile;
      ssrInjectMetric = ssrInjectBuildResult.metric;
    }

    Logger.success(
      `Bundled ${adapter.framework} UI components for browser successfully`,
      elapsedSince(bundleStartedAt),
    );

    const aggregatedPageFiles = aggregateUniqueBundleAssetMetrics(
      componentBuildMetrics,
    );

    return {
      buildMetrics: {
        components: componentBuildMetrics,
        framework: adapter.framework,
        loader: loaderBuildResult.metric,
        renderInstances,
        spaSyncEffects,
        ssrInject: ssrInjectMetric,
        totalEstimatedComponentBytes: aggregatedPageFiles.reduce(
          (sum, metric) => sum + metric.bytes,
          0,
        ),
      },
      loaderScript: loaderBuildResult.entryFile,
      modulePreloads,
      cssBundlePaths,
      ssrInjectScript: ssrInjectScriptRelativePath,
    };
  } catch (error) {
    Logger.error(
      `Failed to bundle ${adapter.framework} UI components for browser: ${error}`,
      elapsedSince(bundleStartedAt),
    );
    throw error;
  } finally {
    fs.rmSync(preparedEntryModules.tempEntryDir, {
      recursive: true,
      force: true,
    });
  }
}
