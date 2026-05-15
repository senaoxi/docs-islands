import { parse as parseBabel, type ParserPlugin } from '@babel/parser';
import type { NodePath } from '@babel/traverse';
import babelTraverse from '@babel/traverse';
import * as t from '@babel/types';
import { init, parse as parseImports } from 'es-module-lexer';
import MagicString, { type SourceMap } from 'magic-string';
import { shouldSuppressLog } from '../core/config';
import type { LoggerScopeId, LogKind } from '../types';

/**
 * The name identifier for the logger tree-shaking plugin.
 *
 * Used internally to identify the tree-shaking transformation plugin
 * in the plugin pipeline.
 */
export const LOGGER_TREE_SHAKING_PLUGIN_NAME =
  'docs-islands:logger-tree-shaking';

export const DEFAULT_LOGGER_MODULE_ID = '@docs-islands/logger';

const LOG_METHODS = new Set<LogKind>([
  'debug',
  'error',
  'info',
  'success',
  'warn',
]);
const babelParserPlugins: ParserPlugin[] = [
  'jsx',
  'typescript',
  'importAttributes',
  'decorators-legacy',
  'topLevelAwait',
];

interface StaticLoggerBinding {
  group: string;
  main: string;
}

interface StaticLogCall {
  group: string;
  kind: LogKind;
  main: string;
  message: string;
}

export interface LoggerTreeShakingTransformOptions {
  loggerModuleId: string;
  loggerScopeId: LoggerScopeId;
}

export interface LoggerTreeShakingTransformResult {
  code: string;
  map: SourceMap;
}

// @babel/traverse only exposes a CommonJS package.
const traverse: typeof babelTraverse =
  (
    babelTraverse as typeof babelTraverse & {
      default?: typeof babelTraverse;
    }
  ).default ?? babelTraverse;

const isStaticStringLiteral = (
  node: t.Node | null | undefined,
): node is t.StringLiteral => t.isStringLiteral(node);

const normalizeLoggerModuleId = (loggerModuleId: string): string => {
  if (typeof loggerModuleId !== 'string') {
    throw new TypeError(
      'logger tree-shaking requires explicit loggerModuleId.',
    );
  }

  const normalizedLoggerModuleId = loggerModuleId.trim();

  if (normalizedLoggerModuleId.length === 0) {
    throw new Error('logger tree-shaking requires a non-empty loggerModuleId.');
  }

  return normalizedLoggerModuleId;
};

const getStaticPropertyName = (
  property: t.ObjectMember | t.MemberExpression['property'],
): string | null => {
  if (t.isIdentifier(property)) {
    return property.name;
  }

  if (t.isStringLiteral(property)) {
    return property.value;
  }

  return null;
};

const isCreateLoggerImportSpecifier = (
  specifier: t.ImportDeclaration['specifiers'][number],
): specifier is t.ImportSpecifier => {
  if (!t.isImportSpecifier(specifier)) {
    return false;
  }

  return (
    getStaticPropertyName(specifier.imported) === 'createLogger' &&
    t.isIdentifier(specifier.local) &&
    specifier.local.name === 'createLogger'
  );
};

const hasPublicCreateLoggerImport = async (
  code: string,
  loggerModuleId: string,
): Promise<boolean> => {
  if (!code.includes('createLogger') || !code.includes(loggerModuleId)) {
    return false;
  }

  await init;

  try {
    const [imports] = parseImports(code);

    return imports.some((importSpecifier) => {
      if (
        !importSpecifier.n ||
        importSpecifier.n !== loggerModuleId ||
        importSpecifier.d !== -1
      ) {
        return false;
      }

      return code
        .slice(importSpecifier.ss, importSpecifier.se)
        .includes('createLogger');
    });
  } catch {
    return false;
  }
};

const readStaticMainFromCreateLoggerCall = (
  callExpression: t.CallExpression,
  path: NodePath,
  createLoggerImportSpecifiers: WeakSet<t.ImportSpecifier>,
): string | null => {
  if (!t.isIdentifier(callExpression.callee)) {
    return null;
  }

  const binding = path.scope.getBinding(callExpression.callee.name);

  if (
    !binding?.path.isImportSpecifier() ||
    !createLoggerImportSpecifiers.has(binding.path.node)
  ) {
    return null;
  }

  const [options] = callExpression.arguments;

  if (!t.isObjectExpression(options)) {
    return null;
  }

  for (const property of options.properties) {
    if (!t.isObjectProperty(property) || property.computed) {
      continue;
    }

    if (
      getStaticPropertyName(property.key) === 'main' &&
      isStaticStringLiteral(property.value)
    ) {
      return property.value.value;
    }
  }

  return null;
};

const readStaticLoggerBinding = (
  init: t.Expression | null | undefined,
  path: NodePath,
  createLoggerImportSpecifiers: WeakSet<t.ImportSpecifier>,
): StaticLoggerBinding | null => {
  if (!t.isCallExpression(init)) {
    return null;
  }

  const callee = init.callee;

  if (
    !t.isMemberExpression(callee) ||
    callee.computed ||
    !t.isIdentifier(callee.property) ||
    callee.property.name !== 'getLoggerByGroup'
  ) {
    return null;
  }

  const [groupArgument] = init.arguments;

  if (
    !isStaticStringLiteral(groupArgument) ||
    !t.isCallExpression(callee.object)
  ) {
    return null;
  }

  const main = readStaticMainFromCreateLoggerCall(
    callee.object,
    path,
    createLoggerImportSpecifiers,
  );

  if (!main) {
    return null;
  }

  return {
    group: groupArgument.value,
    main,
  };
};

const readStaticLogCall = (
  expression: t.Expression,
  path: NodePath<t.ExpressionStatement>,
  staticLoggerBindings: WeakMap<t.Identifier, StaticLoggerBinding>,
): StaticLogCall | null => {
  if (!t.isCallExpression(expression)) {
    return null;
  }

  const callee = expression.callee;

  if (
    !t.isMemberExpression(callee) ||
    callee.computed ||
    !t.isIdentifier(callee.object) ||
    !t.isIdentifier(callee.property) ||
    !LOG_METHODS.has(callee.property.name as LogKind)
  ) {
    return null;
  }

  const [messageArgument] = expression.arguments;

  if (!isStaticStringLiteral(messageArgument)) {
    return null;
  }

  const binding = path.scope.getBinding(callee.object.name);

  if (
    !binding?.path.isVariableDeclarator() ||
    binding.constantViolations.length > 0
  ) {
    return null;
  }

  const declarationId = binding.path.node.id;

  if (!t.isIdentifier(declarationId)) {
    return null;
  }

  const loggerBinding = staticLoggerBindings.get(declarationId);

  if (!loggerBinding) {
    return null;
  }

  return {
    ...loggerBinding,
    kind: callee.property.name as LogKind,
    message: messageArgument.value,
  };
};

/**
 * Performs build-time tree-shaking of logger calls based on configuration.
 *
 * This function analyzes source code and removes logger calls that are statically
 * determined to be suppressed by the active logger configuration. It uses Babel
 * AST analysis to:
 *
 * 1. Identify static `createLogger()` calls and their logger bindings
 * 2. Track logger.getLoggerByGroup() expressions to extract group information
 * 3. Find logger method calls with static string messages
 * 4. Check if each call would be suppressed using shouldSuppressLog()
 * 5. Remove suppressed calls from the generated code
 *
 * Returns null if no transformations were made or if parsing/analysis fails.
 *
 * @param code - The source code to analyze and transform
 * @param id - The file identifier/path for source map generation
 * @param options - Configuration including logger module ID and scope ID
 * @returns Transformed code with source map if changes were made, null otherwise
 *
 * @example
 * ```ts
 * const result = await transformLoggerTreeShaking(code, 'app.ts', {
 *   loggerModuleId: '@docs-islands/logger',
 *   loggerScopeId: 'build',
 * });
 *
 * if (result) {
 *   // Use result.code and result.map
 * }
 * ```
 */
export async function transformLoggerTreeShaking(
  code: string,
  id: string,
  options: LoggerTreeShakingTransformOptions,
): Promise<LoggerTreeShakingTransformResult | null> {
  const loggerModuleId = normalizeLoggerModuleId(options.loggerModuleId);

  if (!(await hasPublicCreateLoggerImport(code, loggerModuleId))) {
    return null;
  }

  let ast: t.File;
  try {
    ast = parseBabel(code, {
      allowReturnOutsideFunction: true,
      plugins: babelParserPlugins,
      sourceType: 'module',
    });
  } catch {
    return null;
  }
  const createLoggerImportSpecifiers = new WeakSet<t.ImportSpecifier>();
  const staticLoggerBindings = new WeakMap<t.Identifier, StaticLoggerBinding>();

  traverse(ast, {
    ImportDeclaration(path) {
      if (path.node.source.value !== loggerModuleId) {
        return;
      }

      for (const specifier of path.node.specifiers) {
        if (isCreateLoggerImportSpecifier(specifier)) {
          createLoggerImportSpecifiers.add(specifier);
        }
      }
    },
  });

  traverse(ast, {
    VariableDeclarator(path) {
      if (
        !t.isIdentifier(path.node.id) ||
        !path.parentPath.isVariableDeclaration() ||
        path.parentPath.node.kind !== 'const'
      ) {
        return;
      }

      const loggerBinding = readStaticLoggerBinding(
        path.node.init,
        path,
        createLoggerImportSpecifiers,
      );

      if (loggerBinding) {
        staticLoggerBindings.set(path.node.id, loggerBinding);
      }
    },
  });

  const transformedCode = new MagicString(code);
  let removedLogCount = 0;

  traverse(ast, {
    ExpressionStatement(path) {
      const staticLogCall = readStaticLogCall(
        path.node.expression,
        path,
        staticLoggerBindings,
      );

      if (!staticLogCall) {
        return;
      }

      if (
        !shouldSuppressLog(
          staticLogCall.kind,
          {
            group: staticLogCall.group,
            main: staticLogCall.main,
            message: staticLogCall.message,
          },
          options.loggerScopeId,
        )
      ) {
        return;
      }

      if (
        typeof path.node.start !== 'number' ||
        typeof path.node.end !== 'number'
      ) {
        return;
      }

      transformedCode.remove(path.node.start, path.node.end);
      removedLogCount += 1;
    },
  });

  if (removedLogCount === 0) {
    return null;
  }

  return {
    code: transformedCode.toString(),
    map: transformedCode.generateMap({
      hires: true,
      includeContent: true,
      source: id,
    }),
  };
}
