import { normalizeAbsolutePath } from '#utils/path';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  createFrameworkImportProviderRegistry,
  getFrameworkImportProvider,
  getTypeScriptParserIdentity,
} from './framework-providers';
import { collectSourceTextImports } from './oxc-imports';
import type { ImportRecord } from './records';
import type {
  CreateImportAnalysisContextOptions,
  FrameworkImportProvider,
  ImportAnalysisCaches,
  ImportAnalysisMetricsRecorder,
} from './types';

interface SourceProvider {
  collectImportsFromFile(filePath: string, rootDir: string): ImportRecord[];
  prewarmImportsFromFile(filePath: string, rootDir: string): Promise<void>;
}

interface SourceCollectionRequest {
  cacheKey: string;
  filePath: string;
  packageRootDir: string;
  provider: FrameworkImportProvider | null;
}

function recordCacheAccess(options: {
  hit: boolean;
  kind: 'imports' | 'source-text';
  metrics: ImportAnalysisMetricsRecorder | undefined;
}): void {
  options.metrics?.record({
    kind: options.kind,
    name: options.hit ? 'provider-cache-hit' : 'provider-cache-miss',
    provider: 'import-core',
  });
}

function recordSourceOperation(options: {
  filePath: string;
  metrics: ImportAnalysisMetricsRecorder | undefined;
  name: 'source-parse' | 'source-read';
}): void {
  options.metrics?.record({
    kind: path.extname(options.filePath) || 'extensionless',
    name: options.name,
    provider: 'import-core',
  });
}

function createSourceTextReader(options: {
  caches: ImportAnalysisCaches;
  metrics: ImportAnalysisMetricsRecorder | undefined;
}): (filePath: string) => string {
  return (filePath) => {
    const cached = options.caches.sourceTextCache.get(filePath);
    recordCacheAccess({
      hit: cached !== undefined,
      kind: 'source-text',
      metrics: options.metrics,
    });
    if (cached !== undefined) return cached;
    const sourceText = readFileSync(filePath, 'utf8');
    recordSourceOperation({
      filePath,
      metrics: options.metrics,
      name: 'source-read',
    });
    options.caches.sourceTextCache.set(filePath, sourceText);
    return sourceText;
  };
}

function createImportsCacheKey(options: {
  filePath: string;
  packageRootDir: string;
  parserKind: string;
  parserMode: string;
  parserVersion: string;
}): string {
  return JSON.stringify(options);
}

function collectFileImports(options: {
  filePath: string;
  packageRootDir: string;
  provider: ReturnType<typeof getFrameworkImportProvider>;
  sourceText: string;
}): ImportRecord[] | Promise<ImportRecord[]> {
  if (options.provider !== null) {
    return options.provider.collectImports({
      filePath: options.filePath,
      packageRootDir: options.packageRootDir,
      sourceText: options.sourceText,
    });
  }
  return collectSourceTextImports({
    filePath: options.filePath,
    sourceText: options.sourceText,
  });
}

function createAsyncPreparationError(request: SourceCollectionRequest): Error {
  return new Error(
    [
      'Framework import analysis was not asynchronously prepared:',
      `  file: ${path.relative(request.packageRootDir, request.filePath)}`,
      `  leaf package root: ${request.packageRootDir}`,
      `  provider: ${request.provider?.extension ?? 'unknown'}`,
      '  reason: this provider uses an asynchronous parser and no completed prewarm result was found.',
      '  fix: prepare the generated graph before consuming framework import records.',
    ].join('\n'),
  );
}

function isAsyncProvider(provider: FrameworkImportProvider | null): boolean {
  if (provider === null) return false;
  return provider.collectionMode === 'async';
}

function collectSyncFileImports(options: {
  request: SourceCollectionRequest;
  sourceText: string;
}): ImportRecord[] {
  if (isAsyncProvider(options.request.provider)) {
    throw createAsyncPreparationError(options.request);
  }
  const imports = collectFileImports({
    ...options.request,
    sourceText: options.sourceText,
  });
  if (imports instanceof Promise) {
    throw createAsyncPreparationError(options.request);
  }
  return imports;
}

function getVueParser(
  value: CreateImportAnalysisContextOptions['vueParser'],
): NonNullable<CreateImportAnalysisContextOptions['vueParser']> {
  if (value !== undefined) return value;
  return 'heuristic';
}

function getParserIdentity(options: {
  packageRootDir: string;
  provider: FrameworkImportProvider | null;
}) {
  if (options.provider === null) return getTypeScriptParserIdentity();
  return options.provider.getParserIdentity({
    packageRootDir: options.packageRootDir,
  });
}

function createSourceCollectionRequestFactory(
  providers: ReadonlyMap<string, FrameworkImportProvider>,
): (filePath: string, rootDir: string) => SourceCollectionRequest {
  return (filePath, rootDir) => {
    const normalizedFilePath = normalizeAbsolutePath(filePath);
    const packageRootDir = normalizeAbsolutePath(rootDir);
    const provider = getFrameworkImportProvider({
      filePath: normalizedFilePath,
      providers,
    });
    const parserIdentity = getParserIdentity({ packageRootDir, provider });
    return {
      cacheKey: createImportsCacheKey({
        filePath: normalizedFilePath,
        packageRootDir,
        parserKind: parserIdentity.kind,
        parserMode: parserIdentity.mode,
        parserVersion: parserIdentity.version,
      }),
      filePath: normalizedFilePath,
      packageRootDir,
      provider,
    };
  };
}

export function createSourceProvider(options: {
  caches: ImportAnalysisCaches;
  contextOptions: CreateImportAnalysisContextOptions;
}): SourceProvider {
  const metrics = options.contextOptions.metrics;
  const readSourceText = createSourceTextReader({
    caches: options.caches,
    metrics,
  });
  const vueParser = getVueParser(options.contextOptions.vueParser);
  const providers = createFrameworkImportProviderRegistry({ vueParser });
  const createRequest = createSourceCollectionRequestFactory(providers);

  function getCachedImports(request: SourceCollectionRequest) {
    const cached = options.caches.importsCache.get(request.cacheKey);
    recordCacheAccess({
      hit: cached !== undefined,
      kind: 'imports',
      metrics,
    });
    return cached;
  }

  function cacheImports(
    request: SourceCollectionRequest,
    imports: ImportRecord[],
  ): ImportRecord[] {
    recordSourceOperation({
      filePath: request.filePath,
      metrics,
      name: 'source-parse',
    });
    options.caches.importsCache.set(request.cacheKey, imports);
    return imports;
  }

  async function prewarmImportsFromFile(
    filePath: string,
    rootDir: string,
  ): Promise<void> {
    const request = createRequest(filePath, rootDir);
    if (getCachedImports(request) !== undefined) return;
    const pending = options.caches.importsPromiseCache.get(request.cacheKey);
    if (pending !== undefined) {
      await pending;
      return;
    }
    const promise = Promise.resolve(
      collectFileImports({
        ...request,
        sourceText: readSourceText(request.filePath),
      }),
    ).then((imports) => cacheImports(request, imports));
    options.caches.importsPromiseCache.set(request.cacheKey, promise);
    try {
      await promise;
    } finally {
      options.caches.importsPromiseCache.delete(request.cacheKey);
    }
  }

  return {
    collectImportsFromFile: (filePath, rootDir) => {
      const request = createRequest(filePath, rootDir);
      const cached = getCachedImports(request);
      if (cached !== undefined) return cached;
      const imports = collectSyncFileImports({
        request,
        sourceText: readSourceText(request.filePath),
      });
      return cacheImports(request, imports);
    },
    prewarmImportsFromFile,
  };
}
