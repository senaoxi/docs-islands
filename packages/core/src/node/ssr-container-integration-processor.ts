import { generate } from '@babel/generator';
import { parse } from '@babel/parser';
import type { NodePath } from '@babel/traverse';
import babelTraverse from '@babel/traverse';
import * as t from '@babel/types';
import {
  createElapsedTimer,
  formatErrorMessage,
} from '@docs-islands/logger/helper';
import { CORE_TRANSFORM_LOG_GROUPS } from '../shared/constants/log-groups/transform';
import {
  RENDER_STRATEGY_ATTRS,
  RENDER_STRATEGY_CONSTANTS,
} from '../shared/constants/render-strategy';
import { getCoreGroupLogger } from './logger';

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

type ExtractedValue = JsonValue;
export type ExtractedProps = Record<string, ExtractedValue>;

export type SSRContainerIntegrationCallback = (props: ExtractedProps) => {
  clientRuntimeFileName: string;
  ssrCssBundlePaths?: Set<string>;
  ssrHtml?: string;
};

interface TransformationRecord {
  clientRuntimeFileName: string;
  path: NodePath<t.CallExpression>;
  ssrCssBundlePaths?: Set<string>;
  ssrHtml?: string;
}

interface ProcessResult {
  code: string;
  transformCount: number;
}

interface TransformStatsEntry {
  column: number;
  line: number;
}

export interface TransformWithStatsResult extends ProcessResult {
  stats: {
    totalTransformations: number;
    transformedNodes: TransformStatsEntry[];
  };
}

// @babel/traverse only exposes a CommonJS package.
const traverse: typeof babelTraverse =
  (
    babelTraverse as typeof babelTraverse & {
      default?: typeof babelTraverse;
    }
  ).default ?? babelTraverse;

class SSRContainerIntegrationProcessor {
  private readonly callback: SSRContainerIntegrationCallback;
  private readonly loggerScopeId?: string;
  private readonly Logger: ReturnType<typeof getCoreGroupLogger>;
  private readonly sourceCode: string;
  private transformations: TransformationRecord[] = [];

  constructor(
    sourceCode: string,
    callback: SSRContainerIntegrationCallback,
    loggerScopeId?: string,
  ) {
    this.sourceCode = sourceCode;
    this.callback = callback;
    this.loggerScopeId = loggerScopeId;
    this.Logger = getCoreGroupLogger(
      CORE_TRANSFORM_LOG_GROUPS.ssrContainerIntegration,
      loggerScopeId,
    );
  }

  process(): ProcessResult {
    this.transformations = [];

    const astParserElapsed = createElapsedTimer();
    try {
      const ast = this.parseCode();

      this.traverseAndTransform(ast);

      if (this.transformations.length === 0) {
        return {
          code: this.sourceCode,
          transformCount: 0,
        };
      }

      const result = generate(ast, {
        retainLines: true,
        compact: false,
      });

      return {
        code: result.code,
        transformCount: this.transformations.length,
      };
    } catch (error) {
      this.Logger.error(
        `AST processing failed: ${formatErrorMessage(error)}`,
        astParserElapsed(),
      );
      return {
        code: this.sourceCode,
        transformCount: 0,
      };
    }
  }

  private parseCode(): t.File {
    return parse(this.sourceCode, {
      sourceType: 'module',
      plugins: [
        'jsx',
        'typescript',
        'objectRestSpread',
        'functionBind',
        'decorators-legacy',
        'classProperties',
        'asyncGenerators',
        'functionSent',
        'dynamicImport',
      ],
    });
  }

  private traverseAndTransform(ast: t.Node): void {
    const extraInjectCssPaths = new Set<string>();
    let extraClientRuntimeFileName: string | null = null;

    traverse(ast, {
      CallExpression: (path: NodePath<t.CallExpression>) => {
        const transformElapsed = createElapsedTimer();
        try {
          if (!this.isTargetFunctionCall(path.node)) {
            return;
          }

          const transformation = this.processTargetNode(path);
          if (!transformation) {
            return;
          }

          const {
            clientRuntimeFileName,
            path: transformationPath,
            ssrCssBundlePaths,
            ssrHtml,
          } = transformation;

          this.transformations.push(transformation);
          if (!extraClientRuntimeFileName) {
            extraClientRuntimeFileName = clientRuntimeFileName;
          }

          if (ssrHtml) {
            this.applyTransformation(transformationPath, ssrHtml);
          }

          if (ssrCssBundlePaths?.size) {
            for (const cssPath of ssrCssBundlePaths) {
              extraInjectCssPaths.add(cssPath);
            }
          }
        } catch (error) {
          this.Logger.error(
            `Transform error, catch error: ${formatErrorMessage(error)}`,
            transformElapsed(),
          );
        }
      },
    });

    if (extraInjectCssPaths.size > 0 && extraClientRuntimeFileName) {
      this.applyCssInjectionTransformation(
        ast,
        extraInjectCssPaths,
        extraClientRuntimeFileName,
      );
    }
  }

  private isTargetFunctionCall(node: t.Node): boolean {
    if (!t.isCallExpression(node)) {
      return false;
    }

    if (!node.arguments || node.arguments.length < 2) {
      return false;
    }

    const elementArg = node.arguments[0];
    const propsArg = node.arguments[1];

    if (
      !t.isStringLiteral(elementArg) ||
      elementArg.value.toLowerCase() !== 'div'
    ) {
      return false;
    }

    if (!t.isObjectExpression(propsArg)) {
      return false;
    }

    return this.hasTargetIdentifier(propsArg);
  }

  private hasTargetIdentifier(objectExpression: t.ObjectExpression): boolean {
    const canonicalRequiredKeys = new Set<string>(RENDER_STRATEGY_ATTRS);
    const foundCanonicalKeys = new Set<string>();
    let useClientOnlyDirective = false;

    for (const prop of objectExpression.properties) {
      if (!t.isObjectProperty(prop)) {
        continue;
      }

      const keyName = t.isStringLiteral(prop.key)
        ? prop.key.value
        : t.isIdentifier(prop.key)
          ? prop.key.name
          : null;

      if (!keyName) {
        continue;
      }

      const canonicalKey = keyName.toLowerCase();
      if (
        canonicalRequiredKeys.has(canonicalKey) &&
        !foundCanonicalKeys.has(canonicalKey)
      ) {
        if (
          canonicalKey ===
            RENDER_STRATEGY_CONSTANTS.renderDirective.toLowerCase() &&
          t.isStringLiteral(prop.value) &&
          prop.value.value === 'client:only'
        ) {
          useClientOnlyDirective = true;
        }

        foundCanonicalKeys.add(canonicalKey);
      }
    }

    return (
      !useClientOnlyDirective &&
      foundCanonicalKeys.size === canonicalRequiredKeys.size
    );
  }

  private processTargetNode(
    path: NodePath<t.CallExpression>,
  ): TransformationRecord | null {
    const transformElapsed = createElapsedTimer();
    try {
      const props = this.extractProps(path.node.arguments[1]);

      if (
        props[RENDER_STRATEGY_CONSTANTS.renderWithSpaSync.toLowerCase()] !==
        'true'
      ) {
        return null;
      }

      const injectedContent = this.callback(props);

      if (typeof injectedContent.ssrHtml !== 'string') {
        this.Logger.error(
          'Failed to inject pre-rendered content, callback return value is not a string.',
        );
        return null;
      }

      return {
        clientRuntimeFileName: injectedContent.clientRuntimeFileName,
        path,
        ssrCssBundlePaths: injectedContent.ssrCssBundlePaths,
        ssrHtml: injectedContent.ssrHtml,
      };
    } catch (error) {
      this.Logger.error(
        `Failed to inject pre-rendered content, catch error: ${formatErrorMessage(
          error,
        )}`,
        transformElapsed(),
      );
      return null;
    }
  }

  private extractProps(propsNode: t.Node): ExtractedProps {
    const props: ExtractedProps = {};

    if (!t.isObjectExpression(propsNode)) {
      return props;
    }

    for (const prop of propsNode.properties) {
      if (!t.isObjectProperty(prop)) {
        continue;
      }

      const key = this.extractPropertyKey(prop);
      const value = this.extractPropertyValue(prop.value as t.Expression);

      if (key !== null) {
        props[key] = value;
      }
    }

    return props;
  }

  private extractPropertyKey(prop: t.ObjectProperty): string | null {
    if (t.isStringLiteral(prop.key)) {
      return prop.key.value.toLowerCase();
    }
    if (t.isIdentifier(prop.key)) {
      return prop.key.name.toLowerCase();
    }
    if (t.isNumericLiteral(prop.key)) {
      return prop.key.value.toString();
    }
    return null;
  }

  private extractPropertyValue(valueNode: t.Expression): ExtractedValue {
    if (t.isStringLiteral(valueNode)) {
      return valueNode.value;
    }
    if (t.isNumericLiteral(valueNode)) {
      return valueNode.value;
    }
    if (t.isBooleanLiteral(valueNode)) {
      return valueNode.value;
    }
    if (t.isNullLiteral(valueNode)) {
      return null;
    }
    if (t.isIdentifier(valueNode)) {
      return `{{${valueNode.name}}}`;
    }
    if (t.isMemberExpression(valueNode)) {
      return `{{${generate(valueNode).code}}}`;
    }
    if (t.isArrayExpression(valueNode)) {
      const arrayValue = valueNode.elements.map((element) => {
        if (!element) {
          return null;
        }
        if (element.type === 'SpreadElement') {
          return `{{${generate(element).code}}}`;
        }

        return this.extractPropertyValue(element);
      });

      return arrayValue as JsonValue;
    }
    if (t.isObjectExpression(valueNode)) {
      const objectValue: Record<string, ExtractedValue> = {};
      for (const prop of valueNode.properties) {
        if (!t.isObjectProperty(prop)) {
          continue;
        }

        const key = this.extractPropertyKey(prop);
        if (key) {
          objectValue[key] = this.extractPropertyValue(
            prop.value as t.Expression,
          );
        }
      }

      return objectValue;
    }

    return `{{${generate(valueNode).code}}}`;
  }

  private applyTransformation(
    path: NodePath<t.CallExpression>,
    ssrHtml: string,
  ): void {
    const callExpression = path.node;
    const propsArg = callExpression.arguments[1];

    if (t.isObjectExpression(propsArg)) {
      propsArg.properties.push(
        t.objectProperty(t.identifier('innerHTML'), t.stringLiteral(ssrHtml)),
      );
      callExpression.arguments[2] = t.nullLiteral();
      return;
    }

    const newProps = t.objectExpression([
      ...(t.isNullLiteral(propsArg)
        ? []
        : [t.spreadElement(propsArg as t.Expression)]),
      t.objectProperty(t.identifier('innerHTML'), t.stringLiteral(ssrHtml)),
    ]);

    callExpression.arguments[1] = newProps;
    callExpression.arguments[2] = t.nullLiteral();
  }

  private applyCssInjectionTransformation(
    ast: t.Node,
    ssrCssBundlePaths: Set<string>,
    clientRuntimeFileName: string,
  ): void {
    const Logger = getCoreGroupLogger(
      CORE_TRANSFORM_LOG_GROUPS.ssrCssInjection,
      this.loggerScopeId,
    );

    if (!ssrCssBundlePaths || ssrCssBundlePaths.size === 0) {
      return;
    }

    if (!ast) {
      Logger.warn('Invalid AST provided, skipping CSS injection');
      return;
    }

    const cssPathsArray = [...ssrCssBundlePaths];

    const validCssPaths = cssPathsArray.filter((path) => {
      if (typeof path !== 'string' || path.trim().length === 0) {
        Logger.warn(`Invalid CSS path detected: ${path}, skipping`);
        return false;
      }
      return true;
    });

    if (validCssPaths.length === 0) {
      Logger.warn('No valid CSS paths found, skipping injection');
      return;
    }

    if (validCssPaths.length !== cssPathsArray.length) {
      Logger.warn(
        `Filtered out ${cssPathsArray.length - validCssPaths.length} invalid CSS paths`,
      );
    }

    try {
      let programNode: t.Program | null = null;

      traverse(ast, {
        Program(path: NodePath<t.Program>) {
          programNode = path.node;
          path.stop();
        },
      });

      if (!programNode || !t.isProgram(programNode)) {
        Logger.warn(
          'No valid Program node found in AST, skipping CSS injection',
        );
        return;
      }

      const validProgramNode = programNode as t.Program;

      if (!this.hasExistingCSSRuntimeImport(validProgramNode)) {
        const importDeclaration = this.createCSSRuntimeImport(
          clientRuntimeFileName,
        );
        const insertIndex = this.findImportInsertPosition(validProgramNode);

        validProgramNode.body.splice(insertIndex, 0, importDeclaration);
        Logger.success('CSS loading runtime import statement injected');
      }

      if (this.hasExistingCSSRuntimeCall(validProgramNode)) {
        Logger.info(
          'CSS loading runtime call already exists, skipping injection',
        );
      } else {
        const awaitStatement = this.createCSSRuntimeCall(validCssPaths);
        const insertPosition = this.findAwaitInsertPosition(validProgramNode);

        validProgramNode.body.splice(insertPosition, 0, awaitStatement);
        Logger.success(
          `CSS loading runtime call injected for ${validCssPaths.length} CSS files`,
        );
      }
    } catch (error) {
      Logger.error(
        `Failed to inject CSS loading transformation: ${formatErrorMessage(error)}`,
      );
    }
  }

  private hasExistingCSSRuntimeImport(programNode: t.Program): boolean {
    return programNode.body.some(
      (node) =>
        t.isImportDeclaration(node) &&
        node.source.value.includes('runtime') &&
        node.specifiers.some(
          (specifier) =>
            t.isImportSpecifier(specifier) &&
            specifier.local.name === '__CSS_LOADING_RUNTIME__',
        ),
    );
  }

  private hasExistingCSSRuntimeCall(programNode: t.Program): boolean {
    return programNode.body.some(
      (node) =>
        t.isExpressionStatement(node) &&
        t.isAwaitExpression(node.expression) &&
        t.isCallExpression(node.expression.argument) &&
        t.isIdentifier(node.expression.argument.callee) &&
        node.expression.argument.callee.name === '__CSS_LOADING_RUNTIME__',
    );
  }

  private createCSSRuntimeImport(
    clientRuntimeFileName: string,
  ): t.ImportDeclaration {
    return t.importDeclaration(
      [
        t.importSpecifier(
          t.identifier('__CSS_LOADING_RUNTIME__'),
          t.identifier('__CSS_LOADING_RUNTIME__'),
        ),
      ],
      t.stringLiteral(`./chunks/${clientRuntimeFileName}`),
    );
  }

  private createCSSRuntimeCall(cssPathsArray: string[]): t.ExpressionStatement {
    const cssPathsArrayExpression = t.arrayExpression(
      cssPathsArray.map((path) => t.stringLiteral(path)),
    );
    const awaitExpression = t.awaitExpression(
      t.callExpression(t.identifier('__CSS_LOADING_RUNTIME__'), [
        cssPathsArrayExpression,
      ]),
    );

    return t.expressionStatement(awaitExpression);
  }

  private findImportInsertPosition(programNode: t.Program): number {
    const lastImportIndex = programNode.body.findLastIndex((node) =>
      t.isImportDeclaration(node),
    );

    return lastImportIndex === -1 ? 0 : lastImportIndex + 1;
  }

  private findAwaitInsertPosition(programNode: t.Program): number {
    const firstNonImportIndex = programNode.body.findIndex(
      (node) => !t.isImportDeclaration(node) && !t.isDirectiveLiteral(node),
    );

    return firstNonImportIndex === -1
      ? programNode.body.length
      : firstNonImportIndex;
  }

  getTransformationStats(): TransformWithStatsResult['stats'] {
    return {
      totalTransformations: this.transformations.length,
      transformedNodes: this.transformations.map((transformation) => ({
        column: transformation.path.node.loc?.start.column ?? 0,
        line: transformation.path.node.loc?.start.line ?? 0,
      })),
    };
  }
}

export function transformSSRContainerIntegrationCode(
  sourceCode: string,
  callback: SSRContainerIntegrationCallback,
  loggerScopeId?: string,
): TransformWithStatsResult {
  const processor = new SSRContainerIntegrationProcessor(
    sourceCode,
    callback,
    loggerScopeId,
  );
  const result = processor.process();
  const stats = processor.getTransformationStats();

  return {
    ...result,
    stats,
  };
}
