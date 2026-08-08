import { normalizeAbsolutePath } from '#utils/path';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { isResolvedFromLeafInstalledPackage } from '../packages/leaf-package-resolution';
import { loadInitializedAstroCompiler } from './astro-compiler-loader';
import type { FrameworkImportParserIdentity } from './types';

const ASTRO_COMPILER_PACKAGE = '@astrojs/compiler';
const SUPPORTED_ASTRO_COMPILER_RANGE = '>=2.0.0 <5.0.0';

export interface AstroCompilerDiagnostic {
  code?: number;
  hint?: string;
  location?: {
    column?: number;
    line?: number;
  };
  severity?: number;
  text?: string;
}

export interface AstroNode {
  attributes?: {
    name?: string;
    value?: string;
  }[];
  children?: AstroNode[];
  name?: string;
  position?: {
    end?: { column?: number; line?: number; offset?: number };
    start?: { column?: number; line?: number; offset?: number };
  };
  type: string;
  value?: string;
}

export interface AstroParseResult {
  ast: AstroNode;
  diagnostics?: AstroCompilerDiagnostic[];
}

export interface AstroCompiler {
  parse(
    source: string,
    options?: { position?: boolean },
  ): Promise<AstroParseResult>;
}

export interface AstroCompilerModule {
  default?: Partial<AstroCompiler>;
  parse?: AstroCompiler['parse'];
}

interface ResolvedAstroCompiler {
  resolvedPath: string;
  version: string;
}

interface AstroCompilerManifest {
  exports?: {
    '.'?: {
      import?: unknown;
    };
  };
  name?: unknown;
  version?: unknown;
}

function hasErrorCode(error: unknown): error is { code: unknown } {
  return error !== null && typeof error === 'object' && 'code' in error;
}

function isModuleNotFoundError(error: unknown): boolean {
  return hasErrorCode(error) && error.code === 'MODULE_NOT_FOUND';
}

function createMissingCompilerError(packageRootDir: string): Error {
  return new Error(
    [
      'Unable to load Astro compiler for import analysis:',
      `  package: ${ASTRO_COMPILER_PACKAGE}`,
      `  leaf package root: ${packageRootDir}`,
      '  dependency category: analysis runtime',
      '  reason: the Astro compiler is not installed in the source config leaf dependency scope.',
      `  fix: run pnpm --dir ${packageRootDir} add -D '${ASTRO_COMPILER_PACKAGE}@${SUPPORTED_ASTRO_COMPILER_RANGE}'`,
    ].join('\n'),
  );
}

function createUnsupportedCompilerError(options: {
  packageRootDir: string;
  version: string;
}): Error {
  return new Error(
    [
      'Unsupported Astro compiler for import analysis:',
      `  package: ${ASTRO_COMPILER_PACKAGE}`,
      `  leaf package root: ${options.packageRootDir}`,
      `  installed version: ${options.version}`,
      `  supported range: ${SUPPORTED_ASTRO_COMPILER_RANGE}`,
      '  dependency category: analysis runtime',
      '  reason: Limina relies on the asynchronous parse API and positioned AST verified for Astro compiler majors 2 through 4.',
    ].join('\n'),
  );
}

function collectAncestorDirectories(resolvedPath: string): string[] {
  const directories: string[] = [];
  let directory = path.dirname(resolvedPath);
  while (true) {
    directories.push(directory);
    const parentDirectory = path.dirname(directory);
    if (parentDirectory === directory) return directories;
    directory = parentDirectory;
  }
}

function readPackageManifest(directory: string): AstroCompilerManifest | null {
  try {
    return JSON.parse(
      readFileSync(path.join(directory, 'package.json'), 'utf8'),
    ) as AstroCompilerManifest;
  } catch {
    return null;
  }
}

function isAstroCompilerManifest(
  manifest: AstroCompilerManifest | null,
): manifest is AstroCompilerManifest {
  return manifest !== null && manifest.name === ASTRO_COMPILER_PACKAGE;
}

function findAstroCompilerManifest(resolvedPath: string): {
  directory: string;
  manifest: AstroCompilerManifest;
} | null {
  for (const directory of collectAncestorDirectories(resolvedPath)) {
    const manifest = readPackageManifest(directory);
    if (isAstroCompilerManifest(manifest)) {
      return { directory, manifest };
    }
  }
  return null;
}

function getRootExport(
  manifest: AstroCompilerManifest,
): { import?: unknown } | null {
  const exports = manifest.exports;
  if (exports === undefined) return null;
  return exports['.'] ?? null;
}

function isRelativeImportTarget(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  return value.startsWith('./');
}

function getCompilerImportPath(options: {
  directory: string;
  manifest: AstroCompilerManifest;
}): string | null {
  const rootExport = getRootExport(options.manifest);
  if (rootExport === null) return null;
  const importTarget = rootExport.import;
  if (!isRelativeImportTarget(importTarget)) return null;
  return normalizeAbsolutePath(path.resolve(options.directory, importTarget));
}

function isSupportedAstroCompilerVersion(version: string): boolean {
  const major = Number.parseInt(version.split('.')[0] ?? '', 10);
  return major >= 2 && major < 5;
}

function getCompilerVersion(
  compilerPackage: ReturnType<typeof findAstroCompilerManifest>,
): string {
  if (compilerPackage === null) return 'unknown';
  const version = compilerPackage.manifest.version;
  if (typeof version !== 'string') return 'unknown';
  return version;
}

function getCompilerPackageImportPath(
  compilerPackage: ReturnType<typeof findAstroCompilerManifest>,
): string | null {
  if (compilerPackage === null) return null;
  return getCompilerImportPath(compilerPackage);
}

function assertLeafInstalledAstroCompiler(options: {
  packageRootDir: string;
  resolvedPath: string;
}): void {
  if (
    isResolvedFromLeafInstalledPackage({
      packageName: ASTRO_COMPILER_PACKAGE,
      ...options,
    })
  ) {
    return;
  }
  throw createMissingCompilerError(options.packageRootDir);
}

function resolveInstalledAstroCompiler(options: {
  packageRootDir: string;
  resolvedPath: string;
}): ResolvedAstroCompiler {
  assertLeafInstalledAstroCompiler(options);
  const compilerPackage = findAstroCompilerManifest(options.resolvedPath);
  const version = getCompilerVersion(compilerPackage);
  if (!isSupportedAstroCompilerVersion(version)) {
    throw createUnsupportedCompilerError({ ...options, version });
  }
  const importPath = getCompilerPackageImportPath(compilerPackage);
  if (importPath === null) {
    throw createUnsupportedCompilerError({ ...options, version });
  }
  return { resolvedPath: importPath, version };
}

function resolveAstroCompilerEntry(packageRootDir: string): string {
  const requireFromLeaf = createRequire(
    path.join(packageRootDir, 'package.json'),
  );
  return normalizeAbsolutePath(requireFromLeaf.resolve(ASTRO_COMPILER_PACKAGE));
}

function resolveAstroCompiler(packageRootDir: string): ResolvedAstroCompiler {
  try {
    const resolvedPath = resolveAstroCompilerEntry(packageRootDir);
    return resolveInstalledAstroCompiler({ packageRootDir, resolvedPath });
  } catch (error) {
    if (isModuleNotFoundError(error)) {
      throw createMissingCompilerError(packageRootDir);
    }
    throw error;
  }
}

export async function loadAstroCompiler(options: {
  packageRootDir: string;
  resolvedPath: string;
}): Promise<AstroCompiler> {
  return await loadInitializedAstroCompiler({
    createMissingParseError: () =>
      createUnsupportedCompilerError({
        packageRootDir: options.packageRootDir,
        version: 'unknown parse API',
      }),
    resolvedPath: options.resolvedPath,
  });
}

export function getAstroParserIdentity(options: {
  packageRootDir: string;
}): FrameworkImportParserIdentity {
  const resolved = resolveAstroCompiler(options.packageRootDir);
  return {
    kind: ASTRO_COMPILER_PACKAGE,
    mode: 'async-positioned-ast',
    version: `${resolved.version}:${resolved.resolvedPath}`,
  };
}

export function resolveAstroParser(options: {
  packageRootDir: string;
}): ResolvedAstroCompiler {
  return resolveAstroCompiler(options.packageRootDir);
}
