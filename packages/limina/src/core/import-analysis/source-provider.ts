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
  ImportAnalysisCaches,
  ImportAnalysisMetricsRecorder,
} from './types';

interface SourceProvider {
  collectImportsFromFile(filePath: string, rootDir: string): ImportRecord[];
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
}): ImportRecord[] {
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

function getVueParser(
  value: CreateImportAnalysisContextOptions['vueParser'],
): NonNullable<CreateImportAnalysisContextOptions['vueParser']> {
  if (value !== undefined) return value;
  return 'heuristic';
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
  return {
    collectImportsFromFile: (filePath, rootDir) => {
      const normalizedFilePath = normalizeAbsolutePath(filePath);
      const packageRootDir = normalizeAbsolutePath(rootDir);
      const provider = getFrameworkImportProvider({
        filePath: normalizedFilePath,
        providers,
      });
      const parserIdentity =
        provider === null
          ? getTypeScriptParserIdentity()
          : provider.getParserIdentity({ packageRootDir });
      const cacheKey = createImportsCacheKey({
        filePath: normalizedFilePath,
        packageRootDir,
        parserKind: parserIdentity.kind,
        parserMode: parserIdentity.mode,
        parserVersion: parserIdentity.version,
      });
      const cached = options.caches.importsCache.get(cacheKey);
      recordCacheAccess({
        hit: cached !== undefined,
        kind: 'imports',
        metrics,
      });
      if (cached !== undefined) return cached;
      const imports = collectFileImports({
        filePath: normalizedFilePath,
        packageRootDir,
        provider,
        sourceText: readSourceText(normalizedFilePath),
      });
      recordSourceOperation({
        filePath: normalizedFilePath,
        metrics,
        name: 'source-parse',
      });
      options.caches.importsCache.set(cacheKey, imports);
      return imports;
    },
  };
}
