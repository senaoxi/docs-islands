import { normalizeSlashes, toRelativePath } from '#utils/path';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'pathe';
import { generatedRootDirName } from '../core/build-graph/generated/paths';
import type { SourceCheckIssue, SourceIssueCode } from './report';

export const SOURCE_ISSUE_SNAPSHOT_VERSION = 1;
export const CHECK_ISSUE_SNAPSHOT_VERSION = 1;

export type LiminaCheckTaskName =
  | 'checker:build'
  | 'checker:typecheck'
  | 'command'
  | 'graph:check'
  | 'graph:prepare'
  | 'package:check'
  | 'proof:check'
  | 'release:check'
  | 'source:check';

export type SourceIssueSnapshotStatus = 'completed' | 'not-run';
export type CheckIssueSnapshotStatus = 'completed' | 'not-run';

export interface LiminaCheckIssue {
  checkerName?: string;
  code: string;
  detailLines?: string[];
  filePath?: string;
  fix?: string;
  packageManifestPath?: string;
  packageName?: string;
  reason: string;
  scope?: string;
  task: LiminaCheckTaskName;
  title: string;
  tool?: string;
}

export interface CheckIssueSnapshot {
  command: string;
  createdAt: string;
  issues: LiminaCheckIssue[];
  status: CheckIssueSnapshotStatus;
  version: typeof CHECK_ISSUE_SNAPSHOT_VERSION;
}

export interface CheckIssueInventoryFilters {
  checkerNames?: readonly string[];
  files?: readonly string[];
  packageNames?: readonly string[];
  rules?: readonly string[];
  scopes?: readonly string[];
  tasks?: readonly string[];
  tools?: readonly string[];
}

export interface SourceIssueSnapshotIssue {
  code: SourceIssueCode;
  filePath?: string;
  ownerName: string;
}

export interface SourceIssueSnapshot {
  command: string;
  createdAt: string;
  issues: SourceIssueSnapshotIssue[];
  legacyProblemCount: number;
  status: SourceIssueSnapshotStatus;
  version: typeof SOURCE_ISSUE_SNAPSHOT_VERSION;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isSourceIssueSnapshotStatus(
  value: unknown,
): value is SourceIssueSnapshotStatus {
  return value === 'completed' || value === 'not-run';
}

function isCheckIssueSnapshotStatus(
  value: unknown,
): value is CheckIssueSnapshotStatus {
  return value === 'completed' || value === 'not-run';
}

function isSourceIssueSnapshotIssue(
  value: unknown,
): value is SourceIssueSnapshotIssue {
  return (
    isPlainRecord(value) &&
    typeof value.code === 'string' &&
    typeof value.ownerName === 'string' &&
    (value.filePath === undefined || typeof value.filePath === 'string')
  );
}

function isSourceIssueSnapshot(value: unknown): value is SourceIssueSnapshot {
  return (
    isPlainRecord(value) &&
    value.version === SOURCE_ISSUE_SNAPSHOT_VERSION &&
    typeof value.command === 'string' &&
    typeof value.createdAt === 'string' &&
    isSourceIssueSnapshotStatus(value.status) &&
    typeof value.legacyProblemCount === 'number' &&
    Array.isArray(value.issues) &&
    value.issues.every(isSourceIssueSnapshotIssue)
  );
}

function isLiminaCheckIssue(value: unknown): value is LiminaCheckIssue {
  return (
    isPlainRecord(value) &&
    typeof value.task === 'string' &&
    typeof value.code === 'string' &&
    typeof value.title === 'string' &&
    typeof value.reason === 'string' &&
    (value.detailLines === undefined ||
      (Array.isArray(value.detailLines) &&
        value.detailLines.every((line) => typeof line === 'string'))) &&
    (value.fix === undefined || typeof value.fix === 'string') &&
    (value.packageManifestPath === undefined ||
      typeof value.packageManifestPath === 'string') &&
    (value.packageName === undefined ||
      typeof value.packageName === 'string') &&
    (value.filePath === undefined || typeof value.filePath === 'string') &&
    (value.scope === undefined || typeof value.scope === 'string') &&
    (value.checkerName === undefined ||
      typeof value.checkerName === 'string') &&
    (value.tool === undefined || typeof value.tool === 'string')
  );
}

function isCheckIssueSnapshot(value: unknown): value is CheckIssueSnapshot {
  return (
    isPlainRecord(value) &&
    value.version === CHECK_ISSUE_SNAPSHOT_VERSION &&
    typeof value.command === 'string' &&
    typeof value.createdAt === 'string' &&
    isCheckIssueSnapshotStatus(value.status) &&
    Array.isArray(value.issues) &&
    value.issues.every(isLiminaCheckIssue)
  );
}

function pluralIssue(count: number): string {
  return count === 1 ? 'issue' : 'issues';
}

function incrementCount(groups: Map<string, number>, key: string): void {
  groups.set(key, (groups.get(key) ?? 0) + 1);
}

function formatCountGroup(
  label: string,
  groups: Map<string, number>,
): string[] {
  const entries = [...groups.entries()].sort(
    ([leftName, leftCount], [rightName, rightCount]) =>
      rightCount - leftCount || leftName.localeCompare(rightName),
  );

  return [
    `${label}:`,
    ...(entries.length > 0
      ? entries.map(
          ([name, count]) => `  - ${name}  ${count} ${pluralIssue(count)}`,
        )
      : ['  (none)']),
  ];
}

function normalizeFilterValues(
  values: readonly string[] | undefined,
): string[] {
  return (values ?? []).map((value) => value.trim()).filter(Boolean);
}

function normalizeFilePath(rootDir: string, filePath: string): string {
  return normalizeSlashes(
    path.isAbsolute(filePath) ? toRelativePath(rootDir, filePath) : filePath,
  );
}

function getIssueScope(
  issue: Pick<LiminaCheckIssue, 'filePath' | 'scope'>,
): string | undefined {
  if (issue.scope) {
    return issue.scope;
  }

  if (!issue.filePath) {
    return undefined;
  }

  const directory = path.posix.dirname(issue.filePath);

  return directory === '.' ? '.' : directory;
}

function issueMatchesScope(issue: LiminaCheckIssue, scope: string): boolean {
  const issueScope = getIssueScope(issue);

  return Boolean(
    issueScope &&
      (issueScope === scope ||
        issueScope.startsWith(`${scope}/`) ||
        issue.filePath === scope ||
        issue.filePath?.startsWith(`${scope}/`)),
  );
}

function issueMatchesFilters(
  issue: LiminaCheckIssue,
  filters: CheckIssueInventoryFilters,
): boolean {
  const tasks = normalizeFilterValues(filters.tasks);
  const packages = normalizeFilterValues(filters.packageNames);
  const rules = normalizeFilterValues(filters.rules);
  const files = normalizeFilterValues(filters.files);
  const scopes = normalizeFilterValues(filters.scopes);
  const checkers = normalizeFilterValues(filters.checkerNames);
  const tools = normalizeFilterValues(filters.tools);

  return (
    (tasks.length === 0 || tasks.includes(issue.task)) &&
    (packages.length === 0 ||
      (issue.packageName ? packages.includes(issue.packageName) : false)) &&
    (rules.length === 0 || rules.includes(issue.code)) &&
    (files.length === 0 ||
      (issue.filePath ? files.includes(issue.filePath) : false)) &&
    (scopes.length === 0 ||
      scopes.some((scope) => issueMatchesScope(issue, scope))) &&
    (checkers.length === 0 ||
      (issue.checkerName ? checkers.includes(issue.checkerName) : false)) &&
    (tools.length === 0 || (issue.tool ? tools.includes(issue.tool) : false))
  );
}

function hasInventoryFilters(filters: CheckIssueInventoryFilters): boolean {
  return Boolean(
    filters.tasks?.length ||
      filters.packageNames?.length ||
      filters.rules?.length ||
      filters.files?.length ||
      filters.scopes?.length ||
      filters.checkerNames?.length ||
      filters.tools?.length,
  );
}

function formatInventoryFilters(filters: CheckIssueInventoryFilters): string[] {
  const lines = [
    ...(filters.tasks?.length ? [`  task: ${filters.tasks.join(', ')}`] : []),
    ...(filters.packageNames?.length
      ? [`  package: ${filters.packageNames.join(', ')}`]
      : []),
    ...(filters.rules?.length ? [`  rule: ${filters.rules.join(', ')}`] : []),
    ...(filters.files?.length ? [`  file: ${filters.files.join(', ')}`] : []),
    ...(filters.scopes?.length
      ? [`  scope: ${filters.scopes.join(', ')}`]
      : []),
    ...(filters.checkerNames?.length
      ? [`  checker: ${filters.checkerNames.join(', ')}`]
      : []),
    ...(filters.tools?.length ? [`  tool: ${filters.tools.join(', ')}`] : []),
  ];

  return lines.length > 0 ? ['Filters:', ...lines] : [];
}

function collectGroup(
  issues: readonly LiminaCheckIssue[],
  getValue: (issue: LiminaCheckIssue) => string | undefined,
): Map<string, number> {
  const groups = new Map<string, number>();

  for (const issue of issues) {
    const value = getValue(issue);

    if (value) {
      incrementCount(groups, value);
    }
  }

  return groups;
}

function createSnapshot(options: {
  command: string;
  issues: SourceIssueSnapshotIssue[];
  legacyProblemCount: number;
  status: SourceIssueSnapshotStatus;
}): SourceIssueSnapshot {
  return {
    command: options.command,
    createdAt: new Date().toISOString(),
    issues: options.issues,
    legacyProblemCount: options.legacyProblemCount,
    status: options.status,
    version: SOURCE_ISSUE_SNAPSHOT_VERSION,
  };
}

function toSnapshotIssue(
  rootDir: string,
  issue: SourceCheckIssue,
): SourceIssueSnapshotIssue {
  return {
    code: issue.code,
    ...('filePath' in issue
      ? {
          filePath: normalizeSlashes(toRelativePath(rootDir, issue.filePath)),
        }
      : {}),
    ownerName: issue.ownerName,
  };
}

export function getSourceIssueSnapshotPath(rootDir: string): string {
  return path.join(
    rootDir,
    generatedRootDirName,
    'source-check',
    'last-run.json',
  );
}

export function getCheckIssueSnapshotPath(rootDir: string): string {
  return path.join(rootDir, generatedRootDirName, 'check', 'last-run.json');
}

export async function writeSourceIssueSnapshot(
  rootDir: string,
  snapshot: SourceIssueSnapshot,
): Promise<void> {
  const snapshotPath = getSourceIssueSnapshotPath(rootDir);

  await mkdir(path.dirname(snapshotPath), { recursive: true });
  await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
}

export async function writeCheckIssueSnapshot(
  rootDir: string,
  snapshot: CheckIssueSnapshot,
): Promise<void> {
  const snapshotPath = getCheckIssueSnapshotPath(rootDir);

  await mkdir(path.dirname(snapshotPath), { recursive: true });
  await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
}

export async function writeNotRunCheckIssueSnapshot(options: {
  command: string;
  rootDir: string;
}): Promise<void> {
  await writeCheckIssueSnapshot(options.rootDir, {
    command: options.command,
    createdAt: new Date().toISOString(),
    issues: [],
    status: 'not-run',
    version: CHECK_ISSUE_SNAPSHOT_VERSION,
  });
}

export async function writeCompletedCheckIssueSnapshot(options: {
  command: string;
  issues?: readonly LiminaCheckIssue[];
  rootDir: string;
}): Promise<void> {
  await writeCheckIssueSnapshot(options.rootDir, {
    command: options.command,
    createdAt: new Date().toISOString(),
    issues: [...(options.issues ?? [])],
    status: 'completed',
    version: CHECK_ISSUE_SNAPSHOT_VERSION,
  });
}

export async function completeCheckIssueSnapshot(options: {
  command?: string;
  rootDir: string;
}): Promise<void> {
  const current = await readCheckIssueSnapshot(options.rootDir);

  if (!current) {
    return;
  }

  await writeCompletedCheckIssueSnapshot({
    command: options.command ?? current?.command ?? 'limina check',
    issues: current?.issues ?? [],
    rootDir: options.rootDir,
  });
}

export async function appendCheckIssues(options: {
  command?: string;
  issues: readonly LiminaCheckIssue[];
  rootDir: string;
}): Promise<void> {
  if (options.issues.length === 0) {
    return;
  }

  const current = await readCheckIssueSnapshot(options.rootDir);

  await writeCompletedCheckIssueSnapshot({
    command: options.command ?? current?.command ?? 'limina check',
    issues: [...(current?.issues ?? []), ...options.issues],
    rootDir: options.rootDir,
  });
}

export async function appendTaskFailureIssueIfMissing(options: {
  command?: string;
  issue: LiminaCheckIssue;
  rootDir: string;
}): Promise<void> {
  const current = await readCheckIssueSnapshot(options.rootDir);

  if (current?.issues.some((issue) => issue.task === options.issue.task)) {
    return;
  }

  await appendCheckIssues({
    command: options.command,
    issues: [options.issue],
    rootDir: options.rootDir,
  });
}

export async function writeNotRunSourceIssueSnapshot(options: {
  command: string;
  rootDir: string;
}): Promise<void> {
  await writeSourceIssueSnapshot(
    options.rootDir,
    createSnapshot({
      command: options.command,
      issues: [],
      legacyProblemCount: 0,
      status: 'not-run',
    }),
  );
}

export async function writeCompletedSourceIssueSnapshot(options: {
  command: string;
  issues: readonly SourceCheckIssue[];
  legacyProblems: readonly string[];
  rootDir: string;
}): Promise<void> {
  await writeSourceIssueSnapshot(
    options.rootDir,
    createSnapshot({
      command: options.command,
      issues: options.issues.map((issue) =>
        toSnapshotIssue(options.rootDir, issue),
      ),
      legacyProblemCount: options.legacyProblems.length,
      status: 'completed',
    }),
  );

  await appendCheckIssues({
    command: options.command,
    issues: options.issues.map((issue) =>
      createSourceCheckIssue({
        issue,
        rootDir: options.rootDir,
      }),
    ),
    rootDir: options.rootDir,
  });
}

export async function readSourceIssueSnapshot(
  rootDir: string,
): Promise<SourceIssueSnapshot | null> {
  const snapshotPath = getSourceIssueSnapshotPath(rootDir);

  if (!existsSync(snapshotPath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(await readFile(snapshotPath, 'utf8')) as unknown;

    return isSourceIssueSnapshot(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function readCheckIssueSnapshot(
  rootDir: string,
): Promise<CheckIssueSnapshot | null> {
  const snapshotPath = getCheckIssueSnapshotPath(rootDir);

  if (!existsSync(snapshotPath)) {
    const sourceSnapshot = await readSourceIssueSnapshot(rootDir);

    return sourceSnapshot
      ? sourceSnapshotToCheckSnapshot(sourceSnapshot)
      : null;
  }

  try {
    const parsed = JSON.parse(await readFile(snapshotPath, 'utf8')) as unknown;

    return isCheckIssueSnapshot(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function createTaskFailureIssue(options: {
  checkerName?: string;
  code?: string;
  detailLines?: readonly string[];
  filePath?: string;
  fix?: string;
  packageManifestPath?: string;
  packageName?: string;
  reason?: string;
  rootDir: string;
  task: LiminaCheckTaskName;
  title?: string;
  tool?: string;
}): LiminaCheckIssue {
  const filePath = options.filePath
    ? normalizeFilePath(options.rootDir, options.filePath)
    : undefined;

  return {
    checkerName: options.checkerName,
    code: options.code ?? defaultTaskFailureCode(options.task),
    detailLines: options.detailLines ? [...options.detailLines] : undefined,
    filePath,
    fix: options.fix,
    packageManifestPath: options.packageManifestPath
      ? normalizeFilePath(options.rootDir, options.packageManifestPath)
      : undefined,
    packageName: options.packageName,
    reason: options.reason ?? `${options.task} finished with failures.`,
    scope: filePath ? getIssueScope({ filePath }) : undefined,
    task: options.task,
    title: options.title ?? `${options.task} failed`,
    tool: options.tool,
  };
}

export function createSourceCheckIssue(options: {
  issue: SourceCheckIssue;
  rootDir: string;
}): LiminaCheckIssue {
  const filePath =
    'filePath' in options.issue
      ? normalizeFilePath(options.rootDir, options.issue.filePath)
      : undefined;

  return {
    code: options.issue.code,
    filePath,
    packageName: options.issue.ownerName,
    reason:
      options.issue.code === 'LIMINA_SOURCE_UNUSED_MODULE'
        ? 'Owner-governed source modules must be reachable from package entries, binaries, scripts, or Knip plugin entries.'
        : 'Workspace package dependencies must be reachable from package entries, binaries, scripts, or explicitly ignored when usage is not visible to Knip analysis.',
    scope: filePath ? getIssueScope({ filePath }) : undefined,
    task: 'source:check',
    title:
      options.issue.code === 'LIMINA_SOURCE_UNUSED_MODULE'
        ? 'Unused source module'
        : 'Unused workspace dependency',
  };
}

function defaultTaskFailureCode(task: LiminaCheckTaskName): string {
  return `LIMINA_${task.replaceAll(/[:.-]/gu, '_').toUpperCase()}_FAILED`;
}

function sourceSnapshotToCheckSnapshot(
  snapshot: SourceIssueSnapshot,
): CheckIssueSnapshot {
  return {
    command: snapshot.command,
    createdAt: snapshot.createdAt,
    issues: snapshot.issues.map((issue) => {
      const filePath = issue.filePath
        ? normalizeSlashes(issue.filePath)
        : undefined;

      return {
        code: issue.code,
        filePath,
        packageName: issue.ownerName,
        reason:
          issue.code === 'LIMINA_SOURCE_UNUSED_MODULE'
            ? 'Owner-governed source modules must be reachable from package entries, binaries, scripts, or Knip plugin entries.'
            : 'Workspace package dependencies must be reachable from package entries, binaries, scripts, or explicitly ignored when usage is not visible to Knip analysis.',
        scope: filePath ? getIssueScope({ filePath }) : undefined,
        task: 'source:check',
        title:
          issue.code === 'LIMINA_SOURCE_UNUSED_MODULE'
            ? 'Unused source module'
            : 'Unused workspace dependency',
      };
    }),
    status: snapshot.status,
    version: CHECK_ISSUE_SNAPSHOT_VERSION,
  };
}

export function formatCheckIssueSnapshotInventory(options: {
  filters?: CheckIssueInventoryFilters;
  snapshot: CheckIssueSnapshot | null;
}): string {
  const filters = options.filters ?? {};

  if (!options.snapshot) {
    return [
      'No check issue snapshot found.',
      'Run `limina check` first, then run `limina check --issues`.',
    ].join('\n');
  }

  if (options.snapshot.status !== 'completed') {
    return [
      'No completed check issue snapshot is available from the last run.',
      'Run `limina check` and let it reach a failing or completed task first.',
    ].join('\n');
  }

  const filteredIssues = options.snapshot.issues.filter((issue) =>
    issueMatchesFilters(issue, filters),
  );

  if (filteredIssues.length === 0) {
    const filterActive = hasInventoryFilters(filters);
    const showGroups = !filterActive || options.snapshot.issues.length > 0;

    return [
      filterActive
        ? 'No issues matched the selected filters.'
        : 'No check issues were recorded from the last run.',
      '',
      ...formatInventoryFilters(filters),
      ...(showGroups
        ? [
            ...(filterActive ? [''] : []),
            ...formatCheckIssueGroups(options.snapshot.issues),
          ]
        : []),
    ]
      .filter((line, index, lines) => line || lines[index - 1] !== '')
      .join('\n')
      .trim();
  }

  return [
    'Issue filters available from last run:',
    '',
    ...formatCheckIssueGroups(filteredIssues),
  ].join('\n');
}

function formatCheckIssueGroups(issues: readonly LiminaCheckIssue[]): string[] {
  return [
    ...formatCountGroup(
      'tasks',
      collectGroup(issues, (issue) => issue.task),
    ),
    '',
    ...formatCountGroup(
      'packages',
      collectGroup(issues, (issue) => issue.packageName),
    ),
    '',
    ...formatCountGroup(
      'rules',
      collectGroup(issues, (issue) => issue.code),
    ),
    '',
    ...formatCountGroup('scopes', collectGroup(issues, getIssueScope)),
    '',
    ...formatCountGroup(
      'checkers',
      collectGroup(issues, (issue) => issue.checkerName),
    ),
    '',
    ...formatCountGroup(
      'tools',
      collectGroup(issues, (issue) => issue.tool),
    ),
  ];
}

export function formatSourceIssueSnapshotInventory(
  snapshot: SourceIssueSnapshot | null,
): string {
  if (!snapshot) {
    return [
      'No source issue snapshot found.',
      'Run `limina check` first, then run `limina check --issues`.',
    ].join('\n');
  }

  if (snapshot.status !== 'completed') {
    return [
      'No completed source issue snapshot is available from the last run.',
      'Run `limina check` and let it reach source:check first.',
    ].join('\n');
  }

  if (snapshot.issues.length === 0) {
    return [
      'No source issue filters are available from the last run.',
      snapshot.legacyProblemCount > 0
        ? `The last source check reported ${snapshot.legacyProblemCount} unfilterable ${pluralIssue(snapshot.legacyProblemCount)}.`
        : 'The last source check completed without structured source issues.',
      'If `limina check` failed later, that failure came from another task and cannot be filtered with source issue flags.',
    ].join('\n');
  }

  const packages = new Map<string, number>();
  const rules = new Map<string, number>();
  const scopes = new Map<string, number>();

  for (const issue of snapshot.issues) {
    incrementCount(packages, issue.ownerName);
    incrementCount(rules, issue.code);

    if (issue.filePath) {
      const directory = path.posix.dirname(issue.filePath);

      incrementCount(scopes, directory === '.' ? '.' : directory);
    }
  }

  return [
    'Issue filters available from last run:',
    '',
    ...formatCountGroup('packages', packages),
    '',
    ...formatCountGroup('rules', rules),
    '',
    ...formatCountGroup('scopes', scopes),
  ].join('\n');
}
