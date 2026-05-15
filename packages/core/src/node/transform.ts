import { parse, type ParserPlugin } from '@babel/parser';
import type {
  ExportNamedDeclaration,
  Identifier,
  ImportDeclaration,
  ImportDefaultSpecifier,
  ImportNamespaceSpecifier,
  ImportSpecifier,
  StringLiteral,
} from '@babel/types';
import {
  createElapsedTimer,
  formatErrorMessage,
} from '@docs-islands/logger/helper';
import { Parser } from 'htmlparser2';
import MagicString, { type SourceMap } from 'magic-string';
import MarkdownIt from 'markdown-it';
import { createHash } from 'node:crypto';
import { CORE_TRANSFORM_LOG_GROUPS } from '../shared/constants/log-groups/transform';
import {
  ALLOWED_RENDER_DIRECTIVES,
  SPA_RENDER_SYNC_OFF,
  SPA_RENDER_SYNC_ON,
} from '../shared/constants/render-strategy';
import type { RenderDirective } from '../types/render';
import { getCoreGroupLogger } from './logger';

const componentTagExtractorMd = new MarkdownIt({ html: true });
const tagNameRE = /^<\s*([A-Z][\dA-Za-z]*)/;
const selfClosingRE = /\/\s*>\s*$/;

interface PendingReplacement {
  absStart: number;
  absEnd: number;
  replacement: string;
}

const parserPlugins: ParserPlugin[] = [
  'jsx',
  'typescript',
  'importAttributes',
  'decorators-legacy',
  'topLevelAwait',
];

const escapeHtmlAttribute = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');

export interface ImportNameSpecifier {
  importedName: string;
  localName: string;
}

function getIdentifierNameOrLiteralValue(
  node: Identifier | StringLiteral,
): string {
  return node.type === 'Identifier' ? node.name : node.value;
}

export const travelImports = (
  content: string,
): ImportNameSpecifier[] | undefined => {
  const program = parse(content, {
    sourceType: 'module',
    plugins: parserPlugins,
  });
  const node = program.program.body[0];

  if (
    node?.type !== 'ImportDeclaration' &&
    node?.type !== 'ExportNamedDeclaration'
  ) {
    return undefined;
  }

  const declaration = node as ImportDeclaration | ExportNamedDeclaration;
  if (declaration.specifiers.length === 0) {
    return undefined;
  }

  const importNames: ImportNameSpecifier[] = [];
  for (const specifier of declaration.specifiers) {
    switch (specifier.type) {
      case 'ImportSpecifier': {
        const importedName = getIdentifierNameOrLiteralValue(
          (specifier as ImportSpecifier).imported,
        );
        importNames.push({
          importedName,
          localName: specifier.local.name,
        });
        break;
      }
      case 'ImportDefaultSpecifier': {
        importNames.push({
          importedName: 'default',
          localName: (specifier as ImportDefaultSpecifier).local.name,
        });
        break;
      }
      case 'ImportNamespaceSpecifier': {
        importNames.push({
          importedName: '*',
          localName: (specifier as ImportNamespaceSpecifier).local.name,
        });
        break;
      }
    }
  }

  return importNames;
};

export default function transformComponentTags(
  code: string,
  maybeComponentNames: string[],
  id: string,
  attrNames: {
    renderId: string;
    renderDirective: string;
    renderComponent: string;
    renderWithSpaSync: string;
  },
  loggerScopeId?: string,
): {
  code: string;
  renderIdToRenderDirectiveMap: Map<string, string[]>;
  map: SourceMap | null;
} {
  const logger = getCoreGroupLogger(
    CORE_TRANSFORM_LOG_GROUPS.transformComponentTags,
    loggerScopeId,
  );
  const tokens = componentTagExtractorMd.parse(code, {});
  const s = new MagicString(code);
  const renderIdToRenderDirectiveMap = new Map<string, string[]>();
  const componentNameSet = new Set(maybeComponentNames);
  const lines = code.split('\n');
  const lineOffsets: number[] = [];
  let offset = 0;
  for (const line of lines) {
    lineOffsets.push(offset);
    offset += line.length + 1;
  }

  let usedComponentCount = 0;

  const analyze = (
    attrs: readonly { name: string; value: string }[],
    componentName: string,
  ) => {
    const attributes: { name: string; value: string | null }[] = [];
    let directive = 'ssr:only';
    let useSpaSyncRender = false;
    let forceDisableSpaSyncRender = false;

    for (const { name, value } of attrs) {
      if (ALLOWED_RENDER_DIRECTIVES.includes(name as RenderDirective)) {
        directive = name;
        continue;
      }
      if (
        SPA_RENDER_SYNC_ON.includes(name as (typeof SPA_RENDER_SYNC_ON)[number])
      ) {
        useSpaSyncRender = true;
        continue;
      }
      if (
        SPA_RENDER_SYNC_OFF.includes(
          name as (typeof SPA_RENDER_SYNC_OFF)[number],
        )
      ) {
        forceDisableSpaSyncRender = true;
        continue;
      }
      attributes.push({ name, value });
    }

    if (forceDisableSpaSyncRender) {
      useSpaSyncRender = false;
    } else if (directive === 'ssr:only') {
      useSpaSyncRender = true;
    }

    if (directive === 'client:only' && useSpaSyncRender) {
      logger.warn(
        `'spa:sync-render' is not supported for 'client:only' directive, disabling 'spa:sync-render'`,
      );
      useSpaSyncRender = false;
    }

    return { attributes, directive, name: componentName, useSpaSyncRender };
  };

  for (const token of tokens) {
    const hasInlineHtml =
      token.type === 'inline' &&
      Array.isArray(token.children) &&
      token.children.some(
        (child: { type: string }) => child.type === 'html_inline',
      );

    if (
      (token.type !== 'html_block' && !hasInlineHtml) ||
      !token.map ||
      !token.content
    ) {
      continue;
    }

    const startLine = token.map[0];
    if (startLine >= lineOffsets.length) {
      continue;
    }

    const endLine = token.map[1];
    const rawStart = lineOffsets[startLine];
    const rawEnd =
      endLine < lineOffsets.length ? lineOffsets[endLine] : code.length;
    const rawSlice = code.slice(rawStart, rawEnd);

    const found: {
      attrs: { name: string; value: string }[];
      end: number;
      name: string;
      start: number;
    }[] = [];

    const markdownParserElapsed = createElapsedTimer();
    try {
      const parser = new Parser(
        {
          onopentag(name, attribs) {
            if (componentNameSet.has(name)) {
              found.push({
                attrs: Object.entries(attribs).map(([key, value]) => ({
                  name: key,
                  value,
                })),
                end: parser.endIndex + 1,
                name,
                start: parser.startIndex,
              });
            }
          },
        },
        {
          lowerCaseAttributeNames: false,
          lowerCaseTags: false,
          recognizeSelfClosing: true,
        },
      );

      parser.write(rawSlice);
      parser.end();
    } catch (error) {
      logger.error(
        `markdown parsing error, error information: ${formatErrorMessage(error)}`,
        markdownParserElapsed(),
      );
      throw new Error(
        `markdown parsing error, error information: ${formatErrorMessage(error)}`,
      );
    }

    const pending: PendingReplacement[] = [];
    found.sort((a, b) => a.start - b.start);

    for (const item of found) {
      const absStart = rawStart + item.start;
      const absEnd = rawStart + item.end;
      const startTagRaw = code.slice(absStart, absEnd);
      const tagNameMatch = tagNameRE.exec(startTagRaw);
      const typedTagName = tagNameMatch ? tagNameMatch[1] : '';

      if (!typedTagName) {
        logger.error(
          `Component name must be in PascalCase. Found "${typedTagName || startTagRaw}" in ${id}, skipping compilation!`,
        );
        continue;
      }

      if (typedTagName !== item.name) {
        logger.error(
          `React component tag "${typedTagName}" does not match imported local name "${item.name}" in ${id}, skipping compilation!`,
        );
        continue;
      }

      if (!selfClosingRE.test(startTagRaw)) {
        logger.error(
          `React component tag must be self-closing. Use "<${typedTagName} ... />". Found in ${id}, skipping compilation!`,
        );
        continue;
      }

      const parsed = analyze(item.attrs, item.name);
      const renderId = createHash('sha256')
        .update(`${id}_${usedComponentCount++}`)
        .digest('hex')
        .slice(0, 8);
      const renderDirectiveAttributes = [
        `${attrNames.renderId}="${renderId}"`,
        `${attrNames.renderDirective}="${parsed.directive}"`,
        `${attrNames.renderComponent}="${parsed.name}"`,
        `${attrNames.renderWithSpaSync}="${parsed.useSpaSyncRender}"`,
      ];
      const userElementProps: string[] = [];

      for (const attr of parsed.attributes) {
        if (attr.value === null) {
          userElementProps.push(attr.name);
        } else {
          userElementProps.push(
            `${attr.name}="${escapeHtmlAttribute(attr.value)}"`,
          );
        }
      }

      renderIdToRenderDirectiveMap.set(renderId, renderDirectiveAttributes);
      pending.push({
        absEnd,
        absStart,
        replacement: `<div\n ${[...renderDirectiveAttributes, ...userElementProps].join('\n  ')}\n></div>`,
      });
    }

    for (const replacement of pending.toSorted(
      (a, b) => b.absStart - a.absStart,
    )) {
      s.overwrite(
        replacement.absStart,
        replacement.absEnd,
        replacement.replacement,
      );
    }
  }

  return {
    code: s.toString(),
    renderIdToRenderDirectiveMap,
    map: s.generateMap({ source: id, file: id, includeContent: true }),
  };
}
