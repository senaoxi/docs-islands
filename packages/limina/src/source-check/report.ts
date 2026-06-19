import path from 'pathe';
import rawPicomatch from 'picomatch';
import type { ResolvedLiminaConfig } from '../config/runner';
import {
  normalizeAbsolutePath,
  normalizeSlashes,
  toRelativePath,
} from '../utils/path';

export const SOURCE_ISSUE_CODES = {
  unusedModule: 'LIMINA_SOURCE_UNUSED_MODULE',
  unusedWorkspaceDependency: 'LIMINA_SOURCE_UNUSED_WORKSPACE_DEPENDENCY',
} as const;

export type SourceIssueCode =
  (typeof SOURCE_ISSUE_CODES)[keyof typeof SOURCE_ISSUE_CODES];

export interface SourceIssueReportOptions {
  command?: string;
  files?: readonly string[];
  packageNames?: readonly string[];
  rules?: readonly string[];
  scopes?: readonly string[];
  verbose?: boolean;
}

export interface SourceUnusedModuleIssue {
  code: typeof SOURCE_ISSUE_CODES.unusedModule;
  filePath: string;
  ownerDirectory: string;
  ownerName: string;
  packageJsonPath: string;
}

export interface SourceUnusedWorkspaceDependencyIssue {
  code: typeof SOURCE_ISSUE_CODES.unusedWorkspaceDependency;
  dependencyName: string;
  ownerName: string;
  packageJsonPath: string;
  sectionName: string;
  specifier: string;
}

export type SourceCheckIssue =
  | SourceUnusedModuleIssue
  | SourceUnusedWorkspaceDependencyIssue;

const DEFAULT_DETAIL_LIMIT = 5;
const DEFAULT_COMMAND = 'limina check';

const picomatch = rawPicomatch as unknown as (
  pattern: string,
  options?: { dot?: boolean; posixSlashes?: boolean },
) => (value: string) => boolean;

function plural(count: number, singular: string, pluralForm: string): string {
  return count === 1 ? singular : pluralForm;
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function hasFilters(options: SourceIssueReportOptions): boolean {
  return Boolean(
    options.packageNames?.length ||
      options.rules?.length ||
      options.files?.length ||
      options.scopes?.length,
  );
}

function formatListFilter(
  label: string,
  values: readonly string[] | undefined,
): string[] {
  return values && values.length > 0
    ? [`  ${label}: ${values.join(', ')}`]
    : [];
}

function formatFilters(options: SourceIssueReportOptions): string[] {
  const lines = [
    ...formatListFilter('package', options.packageNames),
    ...formatListFilter('rule', options.rules),
    ...formatListFilter('file', options.files),
    ...formatListFilter('scope', options.scopes),
  ];

  return lines.length > 0 ? ['Filters:', ...lines] : [];
}

function normalizeIssueFilePath(rootDir: string, filePath: string): string {
  return normalizeAbsolutePath(
    path.isAbsolute(filePath) ? filePath : path.join(rootDir, filePath),
  );
}

function hasGlobSyntax(value: string): boolean {
  return /[*?[\]{}()!+]/u.test(value);
}

function trimTrailingSlash(value: string): string {
  return value.replaceAll(/\/+$/gu, '');
}

function normalizeScope(rootDir: string, scope: string): string {
  const normalizedScope = normalizeSlashes(scope.trim());

  if (path.isAbsolute(normalizedScope)) {
    return trimTrailingSlash(
      normalizeSlashes(toRelativePath(rootDir, normalizedScope)),
    );
  }

  return trimTrailingSlash(normalizedScope.replaceAll(/^\.\//gu, ''));
}

function pathMatchesPlainScope(filePath: string, scope: string): boolean {
  return filePath === scope || filePath.startsWith(`${scope}/`);
}

function pathMatchesScope(
  rootDir: string,
  issue: SourceUnusedModuleIssue,
  scope: string,
): boolean {
  const normalizedScope = normalizeScope(rootDir, scope);
  const rootRelativePath = normalizeSlashes(
    toRelativePath(rootDir, issue.filePath),
  );
  const ownerRelativePath = normalizeSlashes(
    toRelativePath(issue.ownerDirectory, issue.filePath),
  );

  if (!hasGlobSyntax(normalizedScope)) {
    return (
      pathMatchesPlainScope(rootRelativePath, normalizedScope) ||
      pathMatchesPlainScope(ownerRelativePath, normalizedScope)
    );
  }

  const matches = picomatch(normalizedScope, {
    dot: true,
    posixSlashes: true,
  });

  return matches(rootRelativePath) || matches(ownerRelativePath);
}

function isSourceUnusedModuleIssue(
  issue: SourceCheckIssue,
): issue is SourceUnusedModuleIssue {
  return issue.code === SOURCE_ISSUE_CODES.unusedModule;
}

function isFileBackedIssue(
  issue: SourceCheckIssue,
): issue is SourceUnusedModuleIssue {
  return isSourceUnusedModuleIssue(issue);
}

function issueMatchesFilters(
  config: ResolvedLiminaConfig,
  issue: SourceCheckIssue,
  options: SourceIssueReportOptions,
): boolean {
  if (
    options.packageNames?.length &&
    !options.packageNames.includes(issue.ownerName)
  ) {
    return false;
  }

  if (options.rules?.length && !options.rules.includes(issue.code)) {
    return false;
  }

  if (options.files?.length) {
    if (!isFileBackedIssue(issue)) {
      return false;
    }

    const issueFilePath = normalizeAbsolutePath(issue.filePath);
    const selectedFiles = options.files.map((filePath) =>
      normalizeIssueFilePath(config.rootDir, filePath),
    );

    if (!selectedFiles.includes(issueFilePath)) {
      return false;
    }
  }

  if (
    options.scopes?.length &&
    (!isFileBackedIssue(issue) ||
      !options.scopes.some((scope) =>
        pathMatchesScope(config.rootDir, issue, scope),
      ))
  ) {
    return false;
  }

  return true;
}

function levenshteinDistance(left: string, right: string): number {
  const previous = Array.from(
    { length: right.length + 1 },
    (_, index) => index,
  );

  for (const [leftIndex, leftChar] of [...left].entries()) {
    const current = [leftIndex + 1];

    for (const [rightIndex, rightChar] of [...right].entries()) {
      current[rightIndex + 1] =
        leftChar === rightChar
          ? previous[rightIndex]
          : Math.min(
              previous[rightIndex] + 1,
              current[rightIndex] + 1,
              previous[rightIndex + 1] + 1,
            );
    }

    previous.splice(0, previous.length, ...current);
  }

  return previous[right.length] ?? 0;
}

function findClosestRule(
  rule: string,
  availableRules: readonly string[],
): string | undefined {
  return availableRules
    .map((availableRule) => ({
      distance: levenshteinDistance(rule, availableRule),
      rule: availableRule,
    }))
    .sort(
      (left, right) =>
        left.distance - right.distance || left.rule.localeCompare(right.rule),
    )[0]?.rule;
}

function formatUnknownRules(
  selectedRules: readonly string[] | undefined,
  availableRules: readonly string[],
): string[] {
  if (!selectedRules?.length) {
    return [];
  }

  const unknownRules = selectedRules.filter(
    (rule) => !availableRules.includes(rule),
  );

  return unknownRules.flatMap((rule) => {
    const suggestion = findClosestRule(rule, availableRules);

    return [
      `Unknown issue rule: ${rule}`,
      ...(suggestion
        ? ['', 'Did you mean:', `  - ${suggestion}`]
        : availableRules.length > 0
          ? [
              '',
              'Available rules with issues:',
              ...availableRules.map((item) => `  - ${item}`),
            ]
          : []),
    ];
  });
}

function quoteCommandValue(value: string): string {
  return /^[\w@./:=,-]+$/u.test(value) ? value : JSON.stringify(value);
}

function formatCommandFlags(options: SourceIssueReportOptions): string {
  const flags = [
    ...(options.packageNames ?? []).flatMap((packageName) => [
      '--package',
      packageName,
    ]),
    ...(options.rules ?? []).flatMap((rule) => ['--rule', rule]),
    ...(options.files ?? []).flatMap((file) => ['--file', file]),
    ...(options.scopes ?? []).flatMap((scope) => ['--scope', scope]),
  ];

  return flags.map(quoteCommandValue).join(' ');
}

function createVerboseCommand(options: SourceIssueReportOptions): string {
  const command = options.command ?? DEFAULT_COMMAND;
  const filterFlags = formatCommandFlags(options);

  return [command, '--verbose', filterFlags].filter(Boolean).join(' ');
}

function groupUnusedModuleIssues(
  issues: readonly SourceCheckIssue[],
): SourceUnusedModuleIssue[][] {
  const groups = new Map<string, SourceUnusedModuleIssue[]>();

  for (const issue of issues) {
    if (!isSourceUnusedModuleIssue(issue)) {
      continue;
    }

    const key = [issue.code, issue.ownerName, issue.packageJsonPath].join('\0');
    const group = groups.get(key) ?? [];

    group.push(issue);
    groups.set(key, group);
  }

  return [...groups.values()]
    .map((group) =>
      group.sort((left, right) => left.filePath.localeCompare(right.filePath)),
    )
    .sort(
      (left, right) =>
        (left[0]?.ownerName ?? '').localeCompare(right[0]?.ownerName ?? '') ||
        (left[0]?.packageJsonPath ?? '').localeCompare(
          right[0]?.packageJsonPath ?? '',
        ),
    );
}

function isSourceUnusedWorkspaceDependencyIssue(
  issue: SourceCheckIssue,
): issue is SourceUnusedWorkspaceDependencyIssue {
  return issue.code === SOURCE_ISSUE_CODES.unusedWorkspaceDependency;
}

function groupUnusedWorkspaceDependencyIssues(
  issues: readonly SourceCheckIssue[],
): SourceUnusedWorkspaceDependencyIssue[][] {
  const groups = new Map<string, SourceUnusedWorkspaceDependencyIssue[]>();

  for (const issue of issues) {
    if (!isSourceUnusedWorkspaceDependencyIssue(issue)) {
      continue;
    }

    const key = [issue.code, issue.ownerName, issue.packageJsonPath].join('\0');
    const group = groups.get(key) ?? [];

    group.push(issue);
    groups.set(key, group);
  }

  return [...groups.values()]
    .map((group) =>
      group.sort((left, right) =>
        left.dependencyName.localeCompare(right.dependencyName),
      ),
    )
    .sort(
      (left, right) =>
        (left[0]?.ownerName ?? '').localeCompare(right[0]?.ownerName ?? '') ||
        (left[0]?.packageJsonPath ?? '').localeCompare(
          right[0]?.packageJsonPath ?? '',
        ),
    );
}

function formatUnusedModuleFixes(ownerName: string): string[] {
  return [
    'suggested fixes:',
    '  1. Delete files that are truly unused.',
    '  2. Make files reachable from package manifest entries, binaries, scripts, or Knip plugin entries.',
    '  3. Add intentional files to:',
    `     source.knip.workspaces["${ownerName}"].ignoreFiles`,
    '     with a reason.',
  ];
}

function formatUnusedDependencyFixes(ownerName: string): string[] {
  return [
    'suggested fixes:',
    '  1. Remove dependencies that are truly unused from the package manifest.',
    '  2. Make dependencies reachable from package entries, binaries, scripts, or Knip plugin entries.',
    '  3. Add intentional dependencies to:',
    `     source.knip.workspaces["${ownerName}"].ignoreDependencies`,
    '     with dep and reason.',
  ];
}

function formatUnusedModuleGroupHeader(
  config: ResolvedLiminaConfig,
  group: readonly SourceUnusedModuleIssue[],
): string[] {
  const firstIssue = group[0];

  if (!firstIssue) {
    return [];
  }

  return [
    firstIssue.ownerName,
    `package manifest: ${toRelativePath(config.rootDir, firstIssue.packageJsonPath)}`,
    `rule: ${SOURCE_ISSUE_CODES.unusedModule}`,
    '',
    'reason:',
    '  Owner-governed source modules must be reachable from package entries, binaries, scripts, or Knip plugin entries.',
    '',
    ...formatUnusedModuleFixes(firstIssue.ownerName),
  ];
}

function formatDefaultUnusedModuleGroup(
  config: ResolvedLiminaConfig,
  group: readonly SourceUnusedModuleIssue[],
  options: SourceIssueReportOptions,
): string[] {
  const visibleFiles = group.slice(0, DEFAULT_DETAIL_LIMIT);
  const remainingCount = group.length - visibleFiles.length;

  return [
    ...formatUnusedModuleGroupHeader(config, group),
    '',
    'files:',
    ...visibleFiles.map(
      (issue) => `  - ${toRelativePath(config.rootDir, issue.filePath)}`,
    ),
    ...(remainingCount > 0 ? [`  ... ${remainingCount} more`] : []),
    ...(remainingCount > 0
      ? ['', 'Show all files:', `  ${createVerboseCommand(options)}`]
      : []),
  ];
}

function formatUnusedDependencyGroupHeader(
  config: ResolvedLiminaConfig,
  group: readonly SourceUnusedWorkspaceDependencyIssue[],
): string[] {
  const firstIssue = group[0];

  if (!firstIssue) {
    return [];
  }

  return [
    firstIssue.ownerName,
    `package manifest: ${toRelativePath(config.rootDir, firstIssue.packageJsonPath)}`,
    `rule: ${SOURCE_ISSUE_CODES.unusedWorkspaceDependency}`,
    '',
    'reason:',
    '  Workspace package dependencies must be reachable from package entries, binaries, scripts, or explicitly ignored when usage is not visible to Knip analysis.',
    '',
    ...formatUnusedDependencyFixes(firstIssue.ownerName),
  ];
}

function formatUnusedDependencyItem(
  issue: SourceUnusedWorkspaceDependencyIssue,
): string[] {
  return [
    `  - ${issue.dependencyName}`,
    `    section: ${issue.sectionName}`,
    `    specifier: ${issue.specifier}`,
  ];
}

function formatUnusedDependencyGroup(
  config: ResolvedLiminaConfig,
  group: readonly SourceUnusedWorkspaceDependencyIssue[],
  options: SourceIssueReportOptions,
): string[] {
  const visibleIssues = options.verbose
    ? group
    : group.slice(0, DEFAULT_DETAIL_LIMIT);
  const remainingCount = group.length - visibleIssues.length;

  return [
    ...formatUnusedDependencyGroupHeader(config, group),
    '',
    'dependencies:',
    ...visibleIssues.flatMap(formatUnusedDependencyItem),
    ...(remainingCount > 0 ? [`  ... ${remainingCount} more`] : []),
    ...(remainingCount > 0
      ? ['', 'Show all dependencies:', `  ${createVerboseCommand(options)}`]
      : []),
  ];
}

function getIssueOwnerScope(issue: SourceUnusedModuleIssue): string {
  const ownerRelativeFile = normalizeSlashes(
    toRelativePath(issue.ownerDirectory, issue.filePath),
  );
  const directory = path.posix.dirname(ownerRelativeFile);

  return directory === '.' ? '<package root>' : directory;
}

function groupIssuesByOwnerScope(
  issues: readonly SourceUnusedModuleIssue[],
): Map<string, SourceUnusedModuleIssue[]> {
  const groups = new Map<string, SourceUnusedModuleIssue[]>();

  for (const issue of issues) {
    const scope = getIssueOwnerScope(issue);
    const group = groups.get(scope) ?? [];

    group.push(issue);
    groups.set(scope, group);
  }

  for (const group of groups.values()) {
    group.sort((left, right) => left.filePath.localeCompare(right.filePath));
  }

  return new Map(
    [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
}

function formatVerboseUnusedModuleGroup(
  config: ResolvedLiminaConfig,
  group: readonly SourceUnusedModuleIssue[],
): string[] {
  const scopeGroups = [...groupIssuesByOwnerScope(group).entries()];

  return [
    ...formatUnusedModuleGroupHeader(config, group),
    '',
    'files by scope:',
    '',
    ...scopeGroups.flatMap(([scope, issues], index) => [
      `  ${scope}  ${issues.length} ${plural(issues.length, 'file', 'files')}`,
      ...issues.map(
        (issue) => `    - ${toRelativePath(config.rootDir, issue.filePath)}`,
      ),
      ...(index === scopeGroups.length - 1 ? [] : ['']),
    ]),
  ];
}

function formatNoMatchedIssues(
  issues: readonly SourceCheckIssue[],
  options: SourceIssueReportOptions,
): string[] {
  const packages = uniqueSorted(issues.map((issue) => issue.ownerName));
  const rules = uniqueSorted(issues.map((issue) => issue.code));

  return [
    'No issues matched the selected filters.',
    '',
    ...formatFilters(options),
    ...(packages.length > 0
      ? [
          '',
          'Available packages with issues:',
          ...packages.map((item) => `  - ${item}`),
        ]
      : []),
    ...(rules.length > 0
      ? [
          '',
          'Available rules with issues:',
          ...rules.map((item) => `  - ${item}`),
        ]
      : []),
  ];
}

function formatLegacyProblems(
  legacyProblems: readonly string[],
  options: { heading?: string } = {},
): string[] {
  if (legacyProblems.length === 0) {
    return [];
  }

  return [
    options.heading ?? 'Other source check issues:',
    '',
    ...legacyProblems.flatMap((problem, index) => [
      ...(index === 0 ? [] : ['']),
      problem,
    ]),
  ];
}

export function formatSourceCheckHumanReport(options: {
  config: ResolvedLiminaConfig;
  issues: readonly SourceCheckIssue[];
  legacyProblems: readonly string[];
  report?: SourceIssueReportOptions;
}): string {
  const report = options.report ?? {};
  const availableRules = uniqueSorted(
    options.issues.map((issue) => issue.code),
  );
  const unknownRuleLines = formatUnknownRules(report.rules, availableRules);
  const filteredIssues = options.issues.filter((issue) =>
    issueMatchesFilters(options.config, issue, report),
  );
  const activeFilters = hasFilters(report);
  const lines = [...unknownRuleLines];

  if (unknownRuleLines.length > 0) {
    lines.push('');
  }

  if (activeFilters && filteredIssues.length === 0) {
    lines.push(...formatNoMatchedIssues(options.issues, report));

    if (options.legacyProblems.length > 0) {
      lines.push('', ...formatLegacyProblems(options.legacyProblems));
    }

    return lines.join('\n');
  }

  const unusedModuleGroups = groupUnusedModuleIssues(filteredIssues);
  const unusedDependencyGroups =
    groupUnusedWorkspaceDependencyIssues(filteredIssues);
  const unusedModuleIssueCount = unusedModuleGroups.reduce(
    (count, group) => count + group.length,
    0,
  );
  const unusedDependencyIssueCount = unusedDependencyGroups.reduce(
    (count, group) => count + group.length,
    0,
  );

  if (activeFilters) {
    lines.push(...formatFilters(report), '');
  }

  if (report.verbose && activeFilters) {
    lines.push(
      `Matched ${filteredIssues.length} ${plural(filteredIssues.length, 'issue', 'issues')}.`,
      '',
    );
  } else {
    const summaryLines: string[] = [];

    if (unusedModuleIssueCount > 0) {
      const packageCount = uniqueSorted(
        unusedModuleGroups.flatMap((group) =>
          group[0] ? [group[0].ownerName] : [],
        ),
      ).length;

      summaryLines.push(
        `Found ${unusedModuleIssueCount} unused source ${plural(unusedModuleIssueCount, 'module', 'modules')} in ${packageCount} ${plural(packageCount, 'package', 'packages')}.`,
      );
    }

    if (unusedDependencyIssueCount > 0) {
      const packageCount = uniqueSorted(
        unusedDependencyGroups.flatMap((group) =>
          group[0] ? [group[0].ownerName] : [],
        ),
      ).length;

      summaryLines.push(
        `Found ${unusedDependencyIssueCount} unused workspace package ${plural(unusedDependencyIssueCount, 'dependency', 'dependencies')} in ${packageCount} ${plural(packageCount, 'package', 'packages')}.`,
      );
    }

    if (summaryLines.length > 0) {
      lines.push(...summaryLines, '');
    }
  }

  if (
    !report.verbose &&
    unusedModuleIssueCount === 0 &&
    unusedDependencyIssueCount === 0 &&
    options.legacyProblems.length > 0
  ) {
    lines.push(
      `Found ${options.legacyProblems.length} source check ${plural(options.legacyProblems.length, 'issue', 'issues')}.`,
      '',
    );
  }

  for (const [index, group] of unusedModuleGroups.entries()) {
    if (index > 0) {
      lines.push('');
    }

    lines.push(
      ...(report.verbose
        ? formatVerboseUnusedModuleGroup(options.config, group)
        : formatDefaultUnusedModuleGroup(options.config, group, report)),
    );
  }

  for (const group of unusedDependencyGroups) {
    if (lines.length > 0) {
      lines.push('');
    }

    lines.push(...formatUnusedDependencyGroup(options.config, group, report));
  }

  const legacyProblems =
    activeFilters && !report.verbose ? [] : options.legacyProblems;

  if (legacyProblems.length > 0) {
    lines.push(
      ...(lines.length > 0 ? ['', ''] : []),
      ...formatLegacyProblems(legacyProblems),
    );
  }

  return lines.join('\n').trim();
}
