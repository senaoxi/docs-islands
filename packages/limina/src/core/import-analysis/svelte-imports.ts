import { normalizeAbsolutePath } from '#utils/path';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import ts from 'typescript';
import { collectSourceTextImports } from './oxc-imports';
import {
  buildLineStarts,
  getLine,
  type ImportDomain,
  type ImportRecord,
  setImportRecordDomain,
} from './records';
import type { FrameworkImportParserIdentity } from './types';

interface SvelteProgram {
  end: number;
  start: number;
}

interface SvelteScript {
  content: SvelteProgram;
}

interface SvelteAstRoot {
  instance: SvelteScript | null;
  module: SvelteScript | null;
}

interface SvelteCompiler {
  VERSION?: string;
  parse(
    source: string,
    options: { filename?: string; modern: true },
  ): SvelteAstRoot;
}

interface ResolvedSvelteCompiler {
  compiler: SvelteCompiler;
  resolvedPath: string;
  version: string;
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
      'Unable to load Svelte compiler for import analysis:',
      '  package: svelte/compiler',
      `  leaf package root: ${packageRootDir}`,
      '  dependency category: analysis runtime',
      '  reason: the Svelte compiler is not installed in the source config leaf dependency scope.',
      `  fix: install svelte in ${packageRootDir}`,
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

function readPackageManifest(directory: string): {
  name?: unknown;
  version?: unknown;
} | null {
  try {
    return JSON.parse(
      readFileSync(path.join(directory, 'package.json'), 'utf8'),
    ) as { name?: unknown; version?: unknown };
  } catch {
    return null;
  }
}

function getSvelteManifestVersion(
  manifest: ReturnType<typeof readPackageManifest>,
): string | null {
  if (!isSvelteManifest(manifest)) return null;
  return typeof manifest.version === 'string' ? manifest.version : null;
}

function isSvelteManifest(
  manifest: ReturnType<typeof readPackageManifest>,
): manifest is { name: 'svelte'; version?: unknown } {
  return manifest !== null && manifest.name === 'svelte';
}

function isString(value: string | null): value is string {
  return value !== null;
}

function readSveltePackageVersion(resolvedPath: string): string | null {
  return (
    collectAncestorDirectories(resolvedPath)
      .map(readPackageManifest)
      .map(getSvelteManifestVersion)
      .find(isString) ?? null
  );
}

function getSvelteCompilerVersion(options: {
  compiler: SvelteCompiler;
  resolvedPath: string;
}): string {
  const packageVersion = readSveltePackageVersion(options.resolvedPath);
  if (packageVersion !== null) return packageVersion;
  return options.compiler.VERSION ?? 'unknown';
}

function throwSvelteCompilerResolutionError(
  error: unknown,
  packageRootDir: string,
): never {
  if (isModuleNotFoundError(error)) {
    throw createMissingCompilerError(packageRootDir);
  }
  throw error;
}

function resolveSvelteCompiler(packageRootDir: string): ResolvedSvelteCompiler {
  const requireFromLeaf = createRequire(
    path.join(packageRootDir, 'package.json'),
  );
  try {
    const resolvedPath = normalizeAbsolutePath(
      requireFromLeaf.resolve('svelte/compiler'),
    );
    const compiler = requireFromLeaf('svelte/compiler') as SvelteCompiler;
    return {
      compiler,
      resolvedPath,
      version: getSvelteCompilerVersion({ compiler, resolvedPath }),
    };
  } catch (error) {
    return throwSvelteCompilerResolutionError(error, packageRootDir);
  }
}

function formatParseError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function createSvelteParseError(options: {
  error: unknown;
  filePath: string;
  packageRootDir: string;
}): Error {
  return new Error(
    [
      'Unable to parse Svelte component for import analysis:',
      `  file: ${path.relative(options.packageRootDir, options.filePath)}`,
      '  parser: svelte/compiler (modern AST)',
      `  reason: ${formatParseError(options.error)}`,
    ].join('\n'),
  );
}

function isValidProgramRange(
  program: SvelteProgram,
  sourceText: string,
): boolean {
  return [
    Number.isInteger(program.start) && Number.isInteger(program.end),
    program.start >= 0,
    program.end >= program.start,
    program.end <= sourceText.length,
  ].every(Boolean);
}

function collectScriptImports(options: {
  domain: ImportDomain;
  filePath: string;
  lineStarts: number[];
  script: SvelteScript;
  sourceText: string;
}): ImportRecord[] {
  if (!isValidProgramRange(options.script.content, options.sourceText)) {
    throw new Error('the compiler returned an invalid script source range');
  }
  const contentStart = options.script.content.start;
  const content = options.sourceText.slice(
    contentStart,
    options.script.content.end,
  );
  return setImportRecordDomain(
    collectSourceTextImports({
      filePath: options.filePath,
      lineOffset: getLine(options.lineStarts, contentStart) - 1,
      scriptKind: ts.ScriptKind.TS,
      sourceOffset: contentStart,
      sourceText: content,
    }),
    options.domain,
  );
}

export function getSvelteParserIdentity(options: {
  packageRootDir: string;
}): FrameworkImportParserIdentity {
  const resolved = resolveSvelteCompiler(options.packageRootDir);
  return {
    kind: 'svelte/compiler',
    mode: 'modern',
    version: `${resolved.version}:${resolved.resolvedPath}`,
  };
}

function collectOptionalScriptImports(options: {
  domain: ImportDomain;
  filePath: string;
  lineStarts: number[];
  script: SvelteScript | null;
  sourceText: string;
}): ImportRecord[] {
  if (options.script === null) return [];
  return collectScriptImports({ ...options, script: options.script });
}

function collectRootScriptImports(options: {
  filePath: string;
  root: SvelteAstRoot;
  sourceText: string;
}): ImportRecord[] {
  const lineStarts = buildLineStarts(options.sourceText);
  return [
    ...collectOptionalScriptImports({
      ...options,
      domain: 'svelte-instance-script',
      lineStarts,
      script: options.root.instance,
    }),
    ...collectOptionalScriptImports({
      ...options,
      domain: 'svelte-module-script',
      lineStarts,
      script: options.root.module,
    }),
  ].sort(
    (left, right) =>
      left.locator.sourceStart - right.locator.sourceStart ||
      left.locator.sourceEnd - right.locator.sourceEnd,
  );
}

export function collectSvelteImports(options: {
  filePath: string;
  packageRootDir: string;
  sourceText: string;
}): ImportRecord[] {
  const { compiler } = resolveSvelteCompiler(options.packageRootDir);
  try {
    const root = compiler.parse(options.sourceText, {
      filename: options.filePath,
      modern: true,
    });
    return collectRootScriptImports({ ...options, root });
  } catch (error) {
    throw createSvelteParseError({ ...options, error });
  }
}
