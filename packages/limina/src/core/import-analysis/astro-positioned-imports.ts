import path from 'node:path';
import ts from 'typescript';
import type { AstroNode } from './astro-compiler';
import { collectSourceTextImports } from './oxc-imports';
import {
  buildLineStarts,
  getLine,
  type ImportDomain,
  type ImportRecord,
  setImportRecordDomain,
} from './records';

interface AstroSourceRegion {
  domain: Extract<ImportDomain, 'astro-client-script' | 'astro-frontmatter'>;
  node: AstroNode;
}

interface PositionedSourceRegion {
  domain: AstroSourceRegion['domain'];
  sourceStart: number;
  sourceText: string;
}

interface AstroSourcePoint {
  column?: number;
  line?: number;
}

const JAVASCRIPT_SCRIPT_TYPES = new Set([
  'application/ecmascript',
  'application/javascript',
  'module',
  'text/ecmascript',
  'text/javascript',
  'text/typescript',
]);

function createAstroPositionError(options: {
  domain: AstroSourceRegion['domain'];
  filePath: string;
  packageRootDir: string;
  reason: string;
}): Error {
  return new Error(
    [
      'Unable to locate Astro source region for import analysis:',
      `  file: ${path.relative(options.packageRootDir, options.filePath)}`,
      `  import domain: ${options.domain}`,
      '  parser: @astrojs/compiler (async positioned AST)',
      `  reason: ${options.reason}`,
      '  fix: use a supported Astro compiler version or report the positioned AST mismatch.',
    ].join('\n'),
  );
}

function getNodeChildren(node: AstroNode): AstroNode[] {
  return node.children ?? [];
}

function getNodeAttributes(
  node: AstroNode,
): NonNullable<AstroNode['attributes']> {
  return node.attributes ?? [];
}

function normalizeAttributeName(name: string | undefined): string {
  return name?.toLowerCase() ?? '';
}

function getAttributeValue(node: AstroNode, name: string): string | undefined {
  for (const attribute of getNodeAttributes(node)) {
    if (normalizeAttributeName(attribute.name) === name) {
      return attribute.value;
    }
  }
  return undefined;
}

function isFrontmatterNode(node: AstroNode): boolean {
  return node.type === 'frontmatter' && typeof node.value === 'string';
}

function isScriptElement(node: AstroNode): boolean {
  if (node.type !== 'element') return false;
  if (typeof node.name !== 'string') return false;
  return node.name.toLowerCase() === 'script';
}

function isJavaScriptScriptType(type: string | undefined): boolean {
  return type === undefined || JAVASCRIPT_SCRIPT_TYPES.has(type.toLowerCase());
}

function isTextNodeWithValue(
  node: AstroNode,
): node is AstroNode & { value: string } {
  return node.type === 'text' && typeof node.value === 'string';
}

function collectScriptRegions(node: AstroNode): AstroSourceRegion[] {
  if (!isScriptElement(node)) return [];
  if (!isJavaScriptScriptType(getAttributeValue(node, 'type'))) return [];
  return getNodeChildren(node)
    .filter(isTextNodeWithValue)
    .map((child) => ({
      domain: 'astro-client-script',
      node: child,
    }));
}

function collectAstroSourceRegions(root: AstroNode): AstroSourceRegion[] {
  const regions: AstroSourceRegion[] = [];
  function visit(node: AstroNode): void {
    if (isFrontmatterNode(node)) {
      regions.push({ domain: 'astro-frontmatter', node });
    }
    regions.push(...collectScriptRegions(node));
    for (const child of getNodeChildren(node)) visit(child);
  }
  visit(root);
  return regions;
}

function isPositiveInteger(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

function isUsableSourcePoint(
  point: AstroSourcePoint | undefined,
): point is Required<AstroSourcePoint> {
  if (point === undefined) return false;
  return isPositiveInteger(point.line) && isPositiveInteger(point.column);
}

function getBoundedSourceOffset(options: {
  column: number;
  lineStart: number;
  sourceLength: number;
}): number | null {
  const sourceOffset = options.lineStart + options.column - 1;
  if (sourceOffset > options.sourceLength) return null;
  return sourceOffset;
}

function getPointSourceOffset(options: {
  lineStarts: readonly number[];
  point: AstroSourcePoint | undefined;
  sourceText: string;
}): number | null {
  if (!isUsableSourcePoint(options.point)) return null;
  const lineStart = options.lineStarts[options.point.line - 1];
  if (lineStart === undefined) return null;
  return getBoundedSourceOffset({
    column: options.point.column,
    lineStart,
    sourceLength: options.sourceText.length,
  });
}

function getNodePoint(
  node: AstroNode,
  boundary: 'end' | 'start',
): AstroSourcePoint | undefined {
  const position = node.position;
  if (position === undefined) return undefined;
  return position[boundary];
}

function getRegionEnd(end: number | null, sourceLength: number): number {
  return end ?? sourceLength;
}

function getRegionBounds(options: {
  lineStarts: readonly number[];
  node: AstroNode;
  sourceText: string;
}): { end: number; start: number } | null {
  const start = getPointSourceOffset({
    point: getNodePoint(options.node, 'start'),
    ...options,
  });
  if (start === null) return null;
  const end = getPointSourceOffset({
    point: getNodePoint(options.node, 'end'),
    ...options,
  });
  return { end: getRegionEnd(end, options.sourceText.length), start };
}

function getNodeValue(node: AstroNode): string {
  if (typeof node.value !== 'string') return '';
  return node.value;
}

function isRegionValueInBounds(options: {
  bounds: { end: number; start: number };
  sourceStart: number;
  value: string;
}): boolean {
  return (
    options.sourceStart >= options.bounds.start &&
    options.sourceStart + options.value.length <= options.bounds.end
  );
}

function positionAstroSourceRegion(options: {
  filePath: string;
  lineStarts: readonly number[];
  packageRootDir: string;
  region: AstroSourceRegion;
  sourceText: string;
}): PositionedSourceRegion {
  const value = getNodeValue(options.region.node);
  const bounds = getRegionBounds({
    lineStarts: options.lineStarts,
    node: options.region.node,
    sourceText: options.sourceText,
  });
  if (bounds === null) {
    throw createAstroPositionError({
      ...options,
      domain: options.region.domain,
      reason: 'the compiler did not return a usable line and column range.',
    });
  }
  const sourceStart = options.sourceText.indexOf(value, bounds.start);
  if (!isRegionValueInBounds({ bounds, sourceStart, value })) {
    throw createAstroPositionError({
      ...options,
      domain: options.region.domain,
      reason:
        'the compiler node value did not match the reported source range.',
    });
  }
  return {
    domain: options.region.domain,
    sourceStart,
    sourceText: value,
  };
}

function collectRegionImports(options: {
  filePath: string;
  lineStarts: number[];
  region: PositionedSourceRegion;
}): ImportRecord[] {
  return setImportRecordDomain(
    collectSourceTextImports({
      filePath: options.filePath,
      lineOffset: getLine(options.lineStarts, options.region.sourceStart) - 1,
      scriptKind: ts.ScriptKind.TS,
      sourceOffset: options.region.sourceStart,
      sourceText: options.region.sourceText,
    }),
    options.region.domain,
  );
}

export function collectPositionedAstroImports(options: {
  filePath: string;
  packageRootDir: string;
  root: AstroNode;
  sourceText: string;
}): ImportRecord[] {
  const lineStarts = buildLineStarts(options.sourceText);
  return collectAstroSourceRegions(options.root)
    .map((region) =>
      positionAstroSourceRegion({ ...options, lineStarts, region }),
    )
    .flatMap((region) =>
      collectRegionImports({ filePath: options.filePath, lineStarts, region }),
    )
    .sort(
      (left, right) =>
        left.locator.sourceStart - right.locator.sourceStart ||
        left.locator.sourceEnd - right.locator.sourceEnd,
    );
}
