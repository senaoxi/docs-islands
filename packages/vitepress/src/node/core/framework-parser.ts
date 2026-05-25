import type { UsedSnippetContainerType } from '#dep-types/component';
import { VITEPRESS_PARSER_LOG_GROUPS } from '#shared/constants/log-groups/parser';
import {
  type CompilationContainerType,
  createEmptyCompilationContainer,
  type RenderController,
} from '@docs-islands/core/node/render-controller';
import { createElapsedTimer, formatErrorMessage } from 'logaria/helper';
import MagicString, { type SourceMap } from 'magic-string';
import MarkdownIt from 'markdown-it';
import type { Plugin } from 'vite';
import { normalizePath } from 'vite';
import { FRAMEWORK_MARKDOWN_TRANSFORM_PLUGIN_NAME } from '../constants/core/plugin-names';
import { getVitePressGroupLogger } from '../logger';
import type {
  RenderingModuleResolution,
  RenderingViteModuleResolver,
} from './module-resolution';
const scriptTagExtractorMd = new MarkdownIt({ html: true });
const scriptBlockRE =
  /[\t ]*<script\b(?<attrs>[^>]*)>(?<content>.*?)<\/script\s*>/is;

export interface RenderingFrameworkScriptMatch {
  attrs: string;
  content: string;
  endIndex: number;
  framework: string;
  lang: string;
  startIndex: number;
}

export interface RenderingFrameworkParsedScriptResult {
  componentReferences: Map<
    string,
    {
      identifier: string;
      importedName: string;
    }
  >;
  metadata?: unknown;
}

export interface RenderingFrameworkParserScriptContext {
  id: string;
  moduleResolver: RenderingViteModuleResolver;
  normalizedId: string;
  script: RenderingFrameworkScriptMatch;
}

export interface RenderingFrameworkParserTransformContext {
  code: string;
  id: string;
  normalizedId: string;
  parsedScript: RenderingFrameworkParsedScriptResult;
}

export interface RenderingFrameworkTransformResult {
  code: string;
  compilationContainer: CompilationContainerType;
  map: SourceMap | null;
  usedSnippetContainer: Map<string, UsedSnippetContainerType>;
}

export interface RenderingFrameworkParser {
  framework: string;
  lang: string;
  renderController: RenderController;
  parseScript: (
    context: RenderingFrameworkParserScriptContext,
  ) => Promise<RenderingFrameworkParsedScriptResult>;
  transformMarkdown: (
    context: RenderingFrameworkParserTransformContext,
  ) => Promise<RenderingFrameworkTransformResult>;
}

interface RenderingFrameworkParserState {
  parser: RenderingFrameworkParser;
  pendingResolver?: (value: CompilationContainerType) => void;
}

const htmlAttrRE =
  /(?:^|\s)(?<name>[:A-Za-z_][:\w.-]*)(?:\s*=\s*(?:"(?<doubleQuoted>[^"]*)"|'(?<singleQuoted>[^']*)'|(?<unquoted>[^\s"'=<>`]+)))?/g;

function getHtmlAttributeValue(attrs: string, name: string): string | null {
  for (const match of attrs.matchAll(htmlAttrRE)) {
    if (match.groups?.name !== name) {
      continue;
    }

    return (
      match.groups.doubleQuoted ??
      match.groups.singleQuoted ??
      match.groups.unquoted ??
      ''
    );
  }

  return null;
}

function cleanScriptByMatches(
  s: MagicString,
  matches: RenderingFrameworkScriptMatch[],
) {
  const code = s.toString();

  for (const scriptMatch of matches) {
    const { startIndex, endIndex } = scriptMatch;
    const replacement = '\n'.repeat(
      code.slice(startIndex, endIndex).split('\n').length - 1,
    );
    s.overwrite(startIndex, endIndex, replacement);
  }
}

function createEmptyTransformResult(
  code: string,
  map: SourceMap | null,
): RenderingFrameworkTransformResult {
  return {
    code,
    compilationContainer: createEmptyCompilationContainer(),
    map,
    usedSnippetContainer: new Map(),
  };
}

export class RenderingFrameworkParserManager {
  readonly #getstring: () => string;
  readonly #parsers: RenderingFrameworkParser[] = [];

  constructor(getstring: () => string) {
    this.#getstring = getstring;
  }

  #getFrameworkLogger() {
    return getVitePressGroupLogger(
      VITEPRESS_PARSER_LOG_GROUPS.framework,
      this.#getstring(),
    );
  }

  public registerParser(parser: RenderingFrameworkParser): void {
    const existingParserIndex = this.#parsers.findIndex(
      (item) =>
        item.framework === parser.framework || item.lang === parser.lang,
    );

    if (existingParserIndex !== -1) {
      this.#parsers.splice(existingParserIndex, 1, parser);
      return;
    }

    this.#parsers.push(parser);
  }

  public getParsers(): RenderingFrameworkParser[] {
    return [...this.#parsers];
  }

  public async transformMarkdown(
    code: string,
    id: string,
    moduleResolver: RenderingViteModuleResolver,
  ): Promise<{ code: string; map: SourceMap | null }> {
    const normalizedId = normalizePath(id);

    if (!normalizedId.endsWith('.md')) {
      return {
        code,
        map: null,
      };
    }

    if (this.#parsers.length === 0) {
      return {
        code,
        map: null,
      };
    }

    const scriptMatchesByFramework = this.#collectRecognizedScriptMatches(
      code,
      this.#parsers,
    );
    const transformElapsed = createElapsedTimer();
    const allRecognizedScriptMatches = [...scriptMatchesByFramework.values()]
      .flat()
      .toSorted((left, right) => left.startIndex - right.startIndex);

    for (const [framework, scriptMatches] of scriptMatchesByFramework) {
      if (scriptMatches.length <= 1) {
        continue;
      }

      const message = `Failed to parse ${id}: framework "${framework}" can contain only one <script lang="${scriptMatches[0].lang}"> element per file.`;
      this.#getFrameworkLogger().error(message, transformElapsed());
      throw new Error(message);
    }

    const parsedScripts = new Map<
      string,
      RenderingFrameworkParsedScriptResult
    >();

    for (const parser of this.#parsers) {
      const scriptMatch = scriptMatchesByFramework.get(parser.framework)?.[0];
      if (!scriptMatch) {
        continue;
      }

      try {
        parsedScripts.set(
          parser.framework,
          await parser.parseScript({
            id,
            moduleResolver,
            normalizedId,
            script: scriptMatch,
          }),
        );
      } catch (error) {
        const message = `Failed to parse <script lang="${parser.lang}"> for framework "${parser.framework}" in ${id}: ${formatErrorMessage(error)}`;
        this.#getFrameworkLogger().error(message, transformElapsed());
        throw new Error(message);
      }
    }

    const componentNameToFramework = new Map<string, string>();
    for (const parser of this.#parsers) {
      const parsedScript = parsedScripts.get(parser.framework);
      if (!parsedScript) {
        continue;
      }

      for (const componentName of parsedScript.componentReferences.keys()) {
        const existingFramework = componentNameToFramework.get(componentName);
        if (!existingFramework || existingFramework === parser.framework) {
          componentNameToFramework.set(componentName, parser.framework);
          continue;
        }

        const message = `Duplicate component local name "${componentName}" found across rendering frameworks in ${id}: "${existingFramework}" and "${parser.framework}". Rename one of the imports before mixing frameworks on the same page.`;
        this.#getFrameworkLogger().error(message, transformElapsed());
        throw new Error(message);
      }
    }

    const parserStates = this.#prepareParserStates(
      normalizedId,
      scriptMatchesByFramework,
    );

    if (allRecognizedScriptMatches.length === 0) {
      if (parserStates.size === 0) {
        return {
          code,
          map: null,
        };
      }

      for (const parserState of parserStates.values()) {
        this.#finalizeParserState(
          parserState,
          normalizedId,
          createEmptyTransformResult(code, null),
        );
      }

      return {
        code,
        map: null,
      };
    }

    const s = new MagicString(code);
    cleanScriptByMatches(s, allRecognizedScriptMatches);

    let currentCode = s.toString();
    let currentMap = s.generateMap({
      source: id,
      file: id,
      includeContent: true,
    });

    for (const parserState of parserStates.values()) {
      const { parser } = parserState;
      const parsedScript = parsedScripts.get(parser.framework);
      if (!parsedScript) {
        this.#finalizeParserState(
          parserState,
          normalizedId,
          createEmptyTransformResult(currentCode, currentMap),
        );
        continue;
      }

      const result = await parser.transformMarkdown({
        code: currentCode,
        id,
        normalizedId,
        parsedScript,
      });

      currentCode = result.code;
      if (result.map) {
        currentMap = result.map;
      }

      this.#finalizeParserState(parserState, normalizedId, result);
    }

    return {
      code: currentCode,
      map: currentMap,
    };
  }

  #prepareParserStates(
    normalizedId: string,
    scriptMatchesByFramework: Map<string, RenderingFrameworkScriptMatch[]>,
  ): Map<string, RenderingFrameworkParserState> {
    const parserStates = new Map<string, RenderingFrameworkParserState>();

    for (const parser of this.#parsers) {
      const hasRecognizedScript =
        (scriptMatchesByFramework.get(parser.framework)?.length ?? 0) > 0;
      const hasExistingCompilation =
        parser.renderController.hasCompilationContainerByMarkdownModuleId(
          parser.framework,
          normalizedId,
        );
      const hasPendingResolver = Boolean(
        parser.renderController.getPendingCompilationContainerResolver(
          parser.framework,
          normalizedId,
        ),
      );

      if (
        !(hasRecognizedScript || hasExistingCompilation || hasPendingResolver)
      ) {
        continue;
      }

      const pendingCompilationContainer =
        parser.renderController.getCompilationContainerByMarkdownModuleId(
          parser.framework,
          normalizedId,
        );
      const pendingResolver =
        parser.renderController.getPendingCompilationContainerResolver(
          parser.framework,
          normalizedId,
        );

      if (!(pendingCompilationContainer instanceof Promise)) {
        parser.renderController.deleteCompilationContainerByMarkdownModuleId(
          parser.framework,
          normalizedId,
        );
        parser.renderController.deletePendingCompilationContainerResolver(
          parser.framework,
          normalizedId,
        );
      }

      parserStates.set(parser.framework, {
        parser,
        pendingResolver,
      });
    }

    return parserStates;
  }

  #collectRecognizedScriptMatches(
    code: string,
    parsers: RenderingFrameworkParser[],
  ): Map<string, RenderingFrameworkScriptMatch[]> {
    const scriptMatchesByFramework = new Map<
      string,
      RenderingFrameworkScriptMatch[]
    >();
    const tokens = scriptTagExtractorMd.parse(code, {});
    const lines = code.split('\n');
    const lineOffsets: number[] = [];
    let offset = 0;

    for (const line of lines) {
      lineOffsets.push(offset);
      offset += line.length + 1;
    }

    for (const token of tokens) {
      if (token.type !== 'html_block' || !token.map) {
        continue;
      }

      const [startLine, endLine] = token.map;
      const rawStart = lineOffsets[startLine];
      const rawEnd =
        endLine < lineOffsets.length ? lineOffsets[endLine] : code.length;
      const rawSlice = code.slice(rawStart, rawEnd);
      const scriptBlockMatcher = new RegExp(`${scriptBlockRE.source}`, 'gis');

      for (const blockMatch of rawSlice.matchAll(scriptBlockMatcher)) {
        const groups = blockMatch.groups;

        if (!groups) {
          continue;
        }

        const scriptLang = getHtmlAttributeValue(groups.attrs, 'lang');
        const parser = parsers.find((item) => item.lang === scriptLang);

        if (!parser) {
          continue;
        }

        const startIndex = rawStart + blockMatch.index;
        const endIndex = startIndex + blockMatch[0].length;
        const currentMatches =
          scriptMatchesByFramework.get(parser.framework) || [];

        currentMatches.push({
          attrs: groups.attrs,
          content: groups.content,
          endIndex,
          framework: parser.framework,
          lang: parser.lang,
          startIndex,
        });
        scriptMatchesByFramework.set(parser.framework, currentMatches);
      }
    }

    return scriptMatchesByFramework;
  }

  #finalizeParserState(
    parserState: RenderingFrameworkParserState,
    normalizedId: string,
    result: RenderingFrameworkTransformResult,
  ): void {
    const { parser, pendingResolver } = parserState;

    parser.renderController.setUsedSnippetContainer(
      parser.framework,
      normalizedId,
      result.usedSnippetContainer,
    );
    parser.renderController.setCompilationContainer(
      parser.framework,
      normalizedId,
      result.compilationContainer,
    );

    if (pendingResolver) {
      parser.renderController.deletePendingCompilationContainerResolver(
        parser.framework,
        normalizedId,
      );
      pendingResolver(result.compilationContainer);
    }
  }
}

export function createRenderingFrameworkMarkdownTransformPlugin({
  frameworkParserManager,
  resolution,
}: {
  frameworkParserManager: RenderingFrameworkParserManager;
  resolution: RenderingModuleResolution;
}): Plugin {
  return {
    name: FRAMEWORK_MARKDOWN_TRANSFORM_PLUGIN_NAME,
    enforce: 'pre',
    transform: {
      order: 'pre',
      async handler(code, id) {
        return frameworkParserManager.transformMarkdown(
          code,
          id,
          resolution.createRuntimeResolver({
            resolveId: this.resolve.bind(this),
            defaultImporter: id,
          }),
        );
      },
    },
  };
}
