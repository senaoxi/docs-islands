import { builtinModules } from 'node:module';
import path from 'node:path';
import type { ResolvedLiminaConfig } from './config';
import { isDtsProjectConfig } from './graph-context';
import { normalizeAbsolutePath } from './utils/path';
import type { WorkspacePackage } from './workspace';

export interface GraphRuleRefDeny {
  path: string;
  reason: string;
}

export interface GraphRuleWorkspaceDepDeny {
  name: string;
  reason: string;
}

export interface GraphRuleNodeBuiltinDeny {
  matchAll: boolean;
  name: string;
  reason: string;
}

export interface NormalizedGraphRules {
  nodeBuiltinsByLabel: Map<string, GraphRuleNodeBuiltinDeny[]>;
  refsByLabel: Map<string, Map<string, GraphRuleRefDeny>>;
  workspaceDepsByLabel: Map<string, Map<string, GraphRuleWorkspaceDepDeny>>;
}

interface GraphRuleKindSelection {
  nodeBuiltins?: boolean;
  refs?: boolean;
  workspaceDeps?: boolean;
}

const nodeBuiltinNames = new Set(
  builtinModules.flatMap((specifier) => {
    const normalized = specifier.startsWith('node:')
      ? specifier.slice('node:'.length)
      : specifier;

    return [normalized, `node:${normalized}`];
  }),
);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function formatUnknownValue(value: unknown): string {
  if (value === undefined) {
    return 'undefined';
  }

  return JSON.stringify(value);
}

function addRuleEntryConfigProblem(
  problems: string[],
  details: string[],
): void {
  problems.push(['Invalid graph rule config:', ...details].join('\n'));
}

function getRulesRecord(
  config: ResolvedLiminaConfig,
  problems: string[],
): Record<string, unknown> {
  const rules = config.graph?.rules;

  if (rules === undefined) {
    return {};
  }

  if (!isPlainRecord(rules)) {
    problems.push(
      [
        'Invalid graph rules config:',
        '  field: graph.rules',
        `  value: ${formatUnknownValue(rules)}`,
        '  reason: graph.rules must be an object keyed by Limina labels.',
      ].join('\n'),
    );
    return {};
  }

  return rules;
}

function addNormalizedRuleRef(options: {
  config: ResolvedLiminaConfig;
  entry: unknown;
  index: number;
  label: string;
  problems: string[];
  projectPathSet: Set<string>;
  refsByLabel: Map<string, Map<string, GraphRuleRefDeny>>;
}): void {
  const field = `graph.rules.${options.label}.deny.refs[${options.index}]`;

  if (!isPlainRecord(options.entry)) {
    addRuleEntryConfigProblem(options.problems, [
      `  field: ${field}`,
      `  value: ${formatUnknownValue(options.entry)}`,
      '  reason: deny.refs entries must be objects with non-empty path and reason fields.',
    ]);
    return;
  }

  const pathValue = options.entry.path;
  const reasonValue = options.entry.reason;

  if (!isNonEmptyString(pathValue)) {
    addRuleEntryConfigProblem(options.problems, [
      `  field: ${field}.path`,
      `  value: ${formatUnknownValue(pathValue)}`,
      '  reason: deny.refs path is required and must be a non-empty string.',
    ]);
    return;
  }

  if (!isNonEmptyString(reasonValue)) {
    addRuleEntryConfigProblem(options.problems, [
      `  field: ${field}.reason`,
      `  value: ${formatUnknownValue(reasonValue)}`,
      '  reason: deny.refs reason is required and must be a non-empty string.',
    ]);
    return;
  }

  const refPath = normalizeAbsolutePath(
    path.resolve(options.config.rootDir, pathValue),
  );

  if (!options.projectPathSet.has(refPath)) {
    addRuleEntryConfigProblem(options.problems, [
      `  field: ${field}.path`,
      `  path: ${pathValue}`,
      '  reason: deny.refs path must point to a project reachable from a checker entry.',
    ]);
    return;
  }

  if (!isDtsProjectConfig(refPath)) {
    addRuleEntryConfigProblem(options.problems, [
      `  field: ${field}.path`,
      `  path: ${pathValue}`,
      '  reason: deny.refs path must point to a tsconfig*.dts.json declaration leaf.',
    ]);
    return;
  }

  const refs = options.refsByLabel.get(options.label) ?? new Map();

  refs.set(refPath, {
    path: refPath,
    reason: reasonValue.trim(),
  });
  options.refsByLabel.set(options.label, refs);
}

function addNormalizedWorkspaceDep(options: {
  entry: unknown;
  fieldPrefix: string;
  index: number;
  label: string;
  packageNames: Set<string>;
  problems: string[];
  workspaceDepsByLabel: Map<string, Map<string, GraphRuleWorkspaceDepDeny>>;
}): void {
  const field = `${options.fieldPrefix}[${options.index}]`;

  if (!isPlainRecord(options.entry)) {
    addRuleEntryConfigProblem(options.problems, [
      `  field: ${field}`,
      `  value: ${formatUnknownValue(options.entry)}`,
      '  reason: deny workspace dependency entries must be objects with non-empty name and reason fields.',
    ]);
    return;
  }

  const nameValue = options.entry.name;
  const reasonValue = options.entry.reason;

  if (!isNonEmptyString(nameValue)) {
    addRuleEntryConfigProblem(options.problems, [
      `  field: ${field}.name`,
      `  value: ${formatUnknownValue(nameValue)}`,
      '  reason: workspace dependency name is required and must be a non-empty string.',
    ]);
    return;
  }

  if (!isNonEmptyString(reasonValue)) {
    addRuleEntryConfigProblem(options.problems, [
      `  field: ${field}.reason`,
      `  value: ${formatUnknownValue(reasonValue)}`,
      '  reason: workspace dependency reason is required and must be a non-empty string.',
    ]);
    return;
  }

  const packageName = nameValue.trim();

  if (!options.packageNames.has(packageName)) {
    addRuleEntryConfigProblem(options.problems, [
      `  field: ${field}.name`,
      `  name: ${packageName}`,
      '  reason: deny.workspaceDeps only accepts discovered workspace package names. Use deny.nodeBuiltins for Node builtins.',
    ]);
    return;
  }

  const deps = options.workspaceDepsByLabel.get(options.label) ?? new Map();

  deps.set(packageName, {
    name: packageName,
    reason: reasonValue.trim(),
  });
  options.workspaceDepsByLabel.set(options.label, deps);
}

function addNormalizedNodeBuiltin(options: {
  entry: unknown;
  index: number;
  label: string;
  nodeBuiltinsByLabel: Map<string, GraphRuleNodeBuiltinDeny[]>;
  problems: string[];
}): void {
  const field = `graph.rules.${options.label}.deny.nodeBuiltins[${options.index}]`;

  if (!isPlainRecord(options.entry)) {
    addRuleEntryConfigProblem(options.problems, [
      `  field: ${field}`,
      `  value: ${formatUnknownValue(options.entry)}`,
      '  reason: deny.nodeBuiltins entries must be objects with non-empty name and reason fields.',
    ]);
    return;
  }

  const nameValue = options.entry.name;
  const reasonValue = options.entry.reason;

  if (!isNonEmptyString(nameValue)) {
    addRuleEntryConfigProblem(options.problems, [
      `  field: ${field}.name`,
      `  value: ${formatUnknownValue(nameValue)}`,
      '  reason: deny.nodeBuiltins name is required and must be a non-empty string.',
    ]);
    return;
  }

  if (!isNonEmptyString(reasonValue)) {
    addRuleEntryConfigProblem(options.problems, [
      `  field: ${field}.reason`,
      `  value: ${formatUnknownValue(reasonValue)}`,
      '  reason: deny.nodeBuiltins reason is required and must be a non-empty string.',
    ]);
    return;
  }

  const name = nameValue.trim();
  const normalizedName = name.startsWith('node:') ? name.slice(5) : name;
  const matchAll = name === 'node:*';

  if (!matchAll && !nodeBuiltinNames.has(normalizedName)) {
    addRuleEntryConfigProblem(options.problems, [
      `  field: ${field}.name`,
      `  name: ${name}`,
      '  reason: deny.nodeBuiltins name must be "node:*" or a Node builtin specifier such as "fs" or "node:fs".',
    ]);
    return;
  }

  const entries = options.nodeBuiltinsByLabel.get(options.label) ?? [];

  entries.push({
    matchAll,
    name: normalizedName,
    reason: reasonValue.trim(),
  });
  options.nodeBuiltinsByLabel.set(options.label, entries);
}

function shouldNormalizeRuleKind(
  include: GraphRuleKindSelection | undefined,
  kind: keyof GraphRuleKindSelection,
): boolean {
  return include?.[kind] ?? true;
}

export function normalizeGraphRules(options: {
  config: ResolvedLiminaConfig;
  include?: GraphRuleKindSelection;
  packages: WorkspacePackage[];
  problems: string[];
  projectPaths: string[];
}): NormalizedGraphRules {
  const refsByLabel = new Map<string, Map<string, GraphRuleRefDeny>>();
  const workspaceDepsByLabel = new Map<
    string,
    Map<string, GraphRuleWorkspaceDepDeny>
  >();
  const nodeBuiltinsByLabel = new Map<string, GraphRuleNodeBuiltinDeny[]>();
  const projectPathSet = new Set(options.projectPaths);
  const packageNames = new Set(
    options.packages.map((workspacePackage) => workspacePackage.name),
  );

  for (const [rawLabel, rawRule] of Object.entries(
    getRulesRecord(options.config, options.problems),
  )) {
    const label = rawLabel.trim();

    if (!label) {
      addRuleEntryConfigProblem(options.problems, [
        '  field: graph.rules',
        '  reason: graph.rules keys must be non-empty labels.',
      ]);
      continue;
    }

    if (!isPlainRecord(rawRule)) {
      addRuleEntryConfigProblem(options.problems, [
        `  field: graph.rules.${rawLabel}`,
        `  value: ${formatUnknownValue(rawRule)}`,
        '  reason: each graph rule must be an object.',
      ]);
      continue;
    }

    if (rawRule.deny === undefined) {
      continue;
    }

    if (!isPlainRecord(rawRule.deny)) {
      addRuleEntryConfigProblem(options.problems, [
        `  field: graph.rules.${label}.deny`,
        `  value: ${formatUnknownValue(rawRule.deny)}`,
        '  reason: graph rule deny must be an object.',
      ]);
      continue;
    }

    const refs = rawRule.deny.refs;

    if (
      shouldNormalizeRuleKind(options.include, 'refs') &&
      refs !== undefined
    ) {
      if (!Array.isArray(refs)) {
        addRuleEntryConfigProblem(options.problems, [
          `  field: graph.rules.${label}.deny.refs`,
          `  value: ${formatUnknownValue(refs)}`,
          '  reason: deny.refs must be an array.',
        ]);
      } else {
        refs.forEach((entry, index) => {
          addNormalizedRuleRef({
            config: options.config,
            entry,
            index,
            label,
            problems: options.problems,
            projectPathSet,
            refsByLabel,
          });
        });
      }
    }

    if (
      shouldNormalizeRuleKind(options.include, 'workspaceDeps') &&
      rawRule.deny.deps !== undefined
    ) {
      addRuleEntryConfigProblem(options.problems, [
        `  field: graph.rules.${label}.deny.deps`,
        `  value: ${formatUnknownValue(rawRule.deny.deps)}`,
        '  reason: deny.deps has been removed; use deny.workspaceDeps.',
      ]);
    }

    const workspaceDeps = rawRule.deny.workspaceDeps;

    if (
      shouldNormalizeRuleKind(options.include, 'workspaceDeps') &&
      workspaceDeps !== undefined
    ) {
      if (!Array.isArray(workspaceDeps)) {
        addRuleEntryConfigProblem(options.problems, [
          `  field: graph.rules.${label}.deny.workspaceDeps`,
          `  value: ${formatUnknownValue(workspaceDeps)}`,
          '  reason: deny.workspaceDeps must be an array.',
        ]);
      } else {
        workspaceDeps.forEach((entry, index) => {
          addNormalizedWorkspaceDep({
            entry,
            fieldPrefix: `graph.rules.${label}.deny.workspaceDeps`,
            index,
            label,
            packageNames,
            problems: options.problems,
            workspaceDepsByLabel,
          });
        });
      }
    }

    const nodeBuiltins = rawRule.deny.nodeBuiltins;

    if (
      shouldNormalizeRuleKind(options.include, 'nodeBuiltins') &&
      nodeBuiltins !== undefined
    ) {
      if (!Array.isArray(nodeBuiltins)) {
        addRuleEntryConfigProblem(options.problems, [
          `  field: graph.rules.${label}.deny.nodeBuiltins`,
          `  value: ${formatUnknownValue(nodeBuiltins)}`,
          '  reason: deny.nodeBuiltins must be an array.',
        ]);
      } else {
        nodeBuiltins.forEach((entry, index) => {
          addNormalizedNodeBuiltin({
            entry,
            index,
            label,
            nodeBuiltinsByLabel,
            problems: options.problems,
          });
        });
      }
    }
  }

  return {
    nodeBuiltinsByLabel,
    refsByLabel,
    workspaceDepsByLabel,
  };
}

export function isNodeBuiltinSpecifier(specifier: string): boolean {
  return nodeBuiltinNames.has(specifier);
}

export function getDeniedRefRule(
  rules: NormalizedGraphRules,
  label: string | null,
  targetProjectPath: string,
): GraphRuleRefDeny | null {
  if (!label) {
    return null;
  }

  return rules.refsByLabel.get(label)?.get(targetProjectPath) ?? null;
}

export function getDeniedWorkspaceDepRule(
  rules: NormalizedGraphRules,
  label: string | null,
  targetPackageName: string,
): GraphRuleWorkspaceDepDeny | null {
  if (!label) {
    return null;
  }

  return rules.workspaceDepsByLabel.get(label)?.get(targetPackageName) ?? null;
}

export function getDeniedNodeBuiltinRule(
  rules: NormalizedGraphRules,
  label: string | null,
  specifier: string,
): GraphRuleNodeBuiltinDeny | null {
  if (!label || !isNodeBuiltinSpecifier(specifier)) {
    return null;
  }

  const normalizedSpecifier = specifier.startsWith('node:')
    ? specifier.slice(5)
    : specifier;

  return (
    rules.nodeBuiltinsByLabel
      .get(label)
      ?.find((rule) => rule.matchAll || rule.name === normalizedSpecifier) ??
    null
  );
}
