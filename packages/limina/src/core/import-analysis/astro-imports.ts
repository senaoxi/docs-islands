import path from 'node:path';
import {
  type AstroCompilerDiagnostic,
  loadAstroCompiler,
  resolveAstroParser,
} from './astro-compiler';
import { collectPositionedAstroImports } from './astro-positioned-imports';
import type { ImportRecord } from './records';

function formatThrownError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function getDiagnosticPosition(diagnostic: AstroCompilerDiagnostic): string {
  const location = diagnostic.location;
  if (location === undefined) return '';
  if (location.line === undefined) return '';
  const column = getDiagnosticColumn(location.column);
  return ` at ${location.line}:${column}`;
}

function getDiagnosticColumn(column: number | undefined): number {
  return column ?? 1;
}

function getDiagnosticCode(diagnostic: AstroCompilerDiagnostic): string {
  if (diagnostic.code === undefined) return '';
  return ` [${diagnostic.code}]`;
}

function formatDiagnostic(diagnostic: AstroCompilerDiagnostic): string {
  const text = diagnostic.text ?? 'unknown compiler diagnostic';
  return `${text}${getDiagnosticCode(diagnostic)}${getDiagnosticPosition(diagnostic)}`;
}

function createAstroParseError(options: {
  error: unknown;
  filePath: string;
  packageRootDir: string;
}): Error {
  return new Error(
    [
      'Unable to parse Astro component for import analysis:',
      `  file: ${path.relative(options.packageRootDir, options.filePath)}`,
      '  parser: @astrojs/compiler (async positioned AST)',
      `  reason: ${formatThrownError(options.error)}`,
    ].join('\n'),
  );
}

function createAstroDiagnosticError(options: {
  diagnostic: AstroCompilerDiagnostic;
  filePath: string;
  packageRootDir: string;
}): Error {
  return createAstroParseError({
    ...options,
    error: formatDiagnostic(options.diagnostic),
  });
}

function isAstroImportAnalysisError(error: unknown): error is Error {
  if (!(error instanceof Error)) return false;
  const prefixes = [
    'Unable to parse Astro component',
    'Unable to locate Astro source region',
  ];
  return prefixes.some((prefix) => error.message.startsWith(prefix));
}

function getFirstErrorDiagnostic(
  diagnostics: readonly AstroCompilerDiagnostic[] | undefined,
): AstroCompilerDiagnostic | null {
  return diagnostics?.find((diagnostic) => diagnostic.severity === 1) ?? null;
}

async function collectParsedAstroImports(options: {
  filePath: string;
  packageRootDir: string;
  resolved: ReturnType<typeof resolveAstroParser>;
  sourceText: string;
}): Promise<ImportRecord[]> {
  const compiler = await loadAstroCompiler({ ...options, ...options.resolved });
  const result = await compiler.parse(options.sourceText, { position: true });
  const diagnostic = getFirstErrorDiagnostic(result.diagnostics);
  if (diagnostic !== null) {
    throw createAstroDiagnosticError({ ...options, diagnostic });
  }
  return collectPositionedAstroImports({ ...options, root: result.ast });
}

export async function collectAstroImports(options: {
  filePath: string;
  packageRootDir: string;
  sourceText: string;
}): Promise<ImportRecord[]> {
  const resolved = resolveAstroParser(options);
  try {
    return await collectParsedAstroImports({ ...options, resolved });
  } catch (error) {
    if (isAstroImportAnalysisError(error)) throw error;
    throw createAstroParseError({ ...options, error });
  }
}
