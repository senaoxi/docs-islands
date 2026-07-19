import { lstat, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';

import {
  assertIssueTaskMatchesCode,
  DEFAULT_ISSUE_CODE_BY_TASK,
  isLiminaCheckIssueCode,
  type LiminaCheckIssueCode,
} from '../../src/check-reporting/codes';
import {
  LIMINA_CHECK_TASK_NAMES,
  type LiminaCheckTaskName,
} from '../../src/check-reporting/snapshot';
import {
  type DetectorFixtureDefinition,
  type DetectorFixtureExpectation,
  type ExpectedEvidence,
  type ExpectedIssue,
  type ExpectedLocation,
  FIXTURE_TOOL_NAMES,
  type FixtureCopyPolicy,
  type FixtureMutation,
  type FixtureSetupOperation,
  type FixtureToolName,
} from './detector-fixture-types';
import { validatePortableRelativePath } from './fixture-paths';

const DEFINITION_KEYS = new Set([
  'allowedGeneratedPaths',
  'command',
  'copyPolicy',
  'environment',
  'expected',
  'id',
  'kind',
  'mutations',
  'setup',
  'tools',
]);
const EXPECTATION_KEYS = new Set([
  'additionalCodes',
  'allowUnexpectedIssues',
  'exitCode',
  'issues',
  'primaryCode',
]);
const EXPECTED_ISSUE_KEYS = new Set([
  'checkerName',
  'code',
  'evidence',
  'externalCode',
  'filePath',
  'locations',
  'packageManifestPath',
  'packageName',
  'scope',
  'task',
]);
const EXPECTED_EVIDENCE_KEYS = new Set(['label', 'lines', 'value']);
const EXPECTED_LOCATION_KEYS = new Set([
  'column',
  'filePath',
  'label',
  'line',
  'packageManifestPath',
  'scope',
]);
const COPY_POLICY_KEYS = new Set([
  'excludedNames',
  'includeBuildInfoFiles',
  'includeOutputDirectories',
]);
const RESERVED_ENVIRONMENT_KEYS = new Set([
  'HOME',
  'LIMINA_PRESERVE_INTEGRATION_ARTIFACTS',
  'NODE_PATH',
  'NPM_CONFIG_CACHE',
  'PATH',
  'TEMP',
  'TMP',
  'TMPDIR',
  'USERPROFILE',
  'XDG_CACHE_HOME',
]);
const FIXTURE_ID_SEGMENT_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const TASK_NAME_SET = new Set<string>(LIMINA_CHECK_TASK_NAMES);
const TOOL_NAME_SET = new Set<string>(FIXTURE_TOOL_NAMES);
const TASK_FALLBACK_CODE_SET = new Set<string>(
  Object.values(DEFAULT_ISSUE_CODE_BY_TASK),
);

function comparePortableNames(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export interface DetectorFixtureCase {
  readonly casePath: string;
  readonly definition: DetectorFixtureDefinition;
  readonly directoryPath: string;
  readonly id: string;
  readonly repoSourceRoot: string;
}

export interface DiscoverDetectorFixturesOptions {
  readonly caseModules: ReadonlyMap<string, unknown>;
  readonly detectorRoot: string;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === null || prototype === Object.prototype;
}

function assertOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: ReadonlySet<string>,
  label: string,
): void {
  const unexpectedKeys = Object.keys(value).filter(
    (key) => !allowedKeys.has(key),
  );

  if (unexpectedKeys.length > 0) {
    throw new Error(
      `${label} contains unsupported fields: ${unexpectedKeys.sort().join(', ')}.`,
    );
  }
}

function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value;
}

function optionalNonEmptyString(
  value: unknown,
  label: string,
): string | undefined {
  return value === undefined ? undefined : requireNonEmptyString(value, label);
}

function validateFixtureId(value: unknown, label: string): string {
  const id = requireNonEmptyString(value, label);
  validatePortableRelativePath(id, { label });

  if (
    !id.split('/').every((segment) => FIXTURE_ID_SEGMENT_PATTERN.test(segment))
  ) {
    throw new Error(
      `${label} must contain lowercase kebab-case path segments: ${id}`,
    );
  }

  return id;
}

function validateCanonicalCode(
  value: unknown,
  label: string,
): LiminaCheckIssueCode {
  const code = requireNonEmptyString(value, label);

  if (!isLiminaCheckIssueCode(code)) {
    throw new Error(`${label} is not a canonical Limina issue code: ${code}`);
  }

  return code;
}

function validateTaskName(value: unknown, label: string): LiminaCheckTaskName {
  const task = requireNonEmptyString(value, label);

  if (!TASK_NAME_SET.has(task)) {
    throw new Error(`${label} is not a Limina check task: ${task}`);
  }

  return task as LiminaCheckTaskName;
}

function validateStringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${label} must be an array.`);
  }

  return value.map((entry, index) =>
    requireNonEmptyString(entry, `${label}[${index}]`),
  );
}

function validateEvidence(value: unknown, label: string): ExpectedEvidence {
  if (!isPlainRecord(value)) {
    throw new Error(`${label} must be an object.`);
  }
  assertOnlyKeys(value, EXPECTED_EVIDENCE_KEYS, label);
  const evidence: ExpectedEvidence = {
    label: optionalNonEmptyString(value.label, `${label}.label`),
    lines:
      value.lines === undefined
        ? undefined
        : validateStringArray(value.lines, `${label}.lines`),
    value: optionalNonEmptyString(value.value, `${label}.value`),
  };

  if (
    evidence.label === undefined &&
    evidence.lines === undefined &&
    evidence.value === undefined
  ) {
    throw new Error(`${label} must constrain at least one evidence field.`);
  }

  return evidence;
}

function optionalPositiveInteger(
  value: unknown,
  label: string,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isInteger(value) || (value as number) < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }

  return value as number;
}

function validateLocation(value: unknown, label: string): ExpectedLocation {
  if (!isPlainRecord(value)) {
    throw new Error(`${label} must be an object.`);
  }
  assertOnlyKeys(value, EXPECTED_LOCATION_KEYS, label);

  const location: ExpectedLocation = {
    column: optionalPositiveInteger(value.column, `${label}.column`),
    filePath:
      value.filePath === undefined
        ? undefined
        : validatePortableRelativePath(value.filePath, {
            label: `${label}.filePath`,
          }),
    label: optionalNonEmptyString(value.label, `${label}.label`),
    line: optionalPositiveInteger(value.line, `${label}.line`),
    packageManifestPath:
      value.packageManifestPath === undefined
        ? undefined
        : validatePortableRelativePath(value.packageManifestPath, {
            label: `${label}.packageManifestPath`,
          }),
    scope: optionalNonEmptyString(value.scope, `${label}.scope`),
  };

  if (Object.values(location).every((entry) => entry === undefined)) {
    throw new Error(`${label} must constrain at least one location field.`);
  }

  return location;
}

function validateExpectedIssue(value: unknown, label: string): ExpectedIssue {
  if (!isPlainRecord(value)) {
    throw new Error(`${label} must be an object.`);
  }
  assertOnlyKeys(value, EXPECTED_ISSUE_KEYS, label);
  const code = validateCanonicalCode(value.code, `${label}.code`);
  const task = validateTaskName(value.task, `${label}.task`);
  assertIssueTaskMatchesCode(code, task);

  const filePath =
    value.filePath === undefined
      ? undefined
      : validatePortableRelativePath(value.filePath, {
          label: `${label}.filePath`,
        });
  const packageManifestPath =
    value.packageManifestPath === undefined
      ? undefined
      : validatePortableRelativePath(value.packageManifestPath, {
          label: `${label}.packageManifestPath`,
        });

  return {
    checkerName: optionalNonEmptyString(
      value.checkerName,
      `${label}.checkerName`,
    ),
    code,
    evidence:
      value.evidence === undefined
        ? undefined
        : Array.isArray(value.evidence)
          ? value.evidence.map((entry, index) =>
              validateEvidence(entry, `${label}.evidence[${index}]`),
            )
          : (() => {
              throw new Error(`${label}.evidence must be an array.`);
            })(),
    externalCode: optionalNonEmptyString(
      value.externalCode,
      `${label}.externalCode`,
    ),
    filePath,
    locations:
      value.locations === undefined
        ? undefined
        : Array.isArray(value.locations) && value.locations.length > 0
          ? value.locations.map((entry, index) =>
              validateLocation(entry, `${label}.locations[${index}]`),
            )
          : (() => {
              throw new Error(`${label}.locations must be a non-empty array.`);
            })(),
    packageManifestPath,
    packageName: optionalNonEmptyString(
      value.packageName,
      `${label}.packageName`,
    ),
    scope: optionalNonEmptyString(value.scope, `${label}.scope`),
    task,
  };
}

function expectedIssueIdentity(issue: ExpectedIssue): string {
  return JSON.stringify({
    checkerName: issue.checkerName,
    code: issue.code,
    evidence: issue.evidence,
    externalCode: issue.externalCode,
    filePath: issue.filePath,
    locations: issue.locations,
    packageManifestPath: issue.packageManifestPath,
    packageName: issue.packageName,
    scope: issue.scope,
    task: issue.task,
  });
}

function validateExpectation(
  value: unknown,
  label: string,
): DetectorFixtureExpectation {
  if (!isPlainRecord(value)) {
    throw new Error(`${label} must be an object.`);
  }
  assertOnlyKeys(value, EXPECTATION_KEYS, label);
  if (
    !Number.isInteger(value.exitCode) ||
    (value.exitCode as number) < 0 ||
    (value.exitCode as number) > 255
  ) {
    throw new Error(`${label}.exitCode must be an integer from 0 through 255.`);
  }
  if (!Array.isArray(value.issues)) {
    throw new TypeError(`${label}.issues must be an array.`);
  }

  const issues = value.issues.map((issue, index) =>
    validateExpectedIssue(issue, `${label}.issues[${index}]`),
  );
  const identities = issues.map(expectedIssueIdentity);
  if (new Set(identities).size !== identities.length) {
    throw new Error(
      `${label}.issues contains indistinguishable duplicate expectations.`,
    );
  }
  const primaryCode =
    value.primaryCode === undefined
      ? undefined
      : validateCanonicalCode(value.primaryCode, `${label}.primaryCode`);
  const exitCode = value.exitCode as number;

  if (exitCode === 0 && primaryCode !== undefined) {
    throw new Error(
      `${label}.primaryCode is not allowed for a passing fixture.`,
    );
  }
  if (exitCode !== 0 && primaryCode === undefined) {
    throw new Error(`${label}.primaryCode is required for a failing fixture.`);
  }
  if (primaryCode && !issues.some((issue) => issue.code === primaryCode)) {
    throw new Error(
      `${label}.primaryCode must be represented by an expected issue.`,
    );
  }
  if (primaryCode && TASK_FALLBACK_CODE_SET.has(primaryCode)) {
    throw new Error(
      `${label}.primaryCode must be a semantic detector code, not a task fallback code: ${primaryCode}`,
    );
  }

  const additionalCodes =
    value.additionalCodes === undefined
      ? []
      : Array.isArray(value.additionalCodes)
        ? value.additionalCodes.map((code, index) =>
            validateCanonicalCode(code, `${label}.additionalCodes[${index}]`),
          )
        : (() => {
            throw new Error(`${label}.additionalCodes must be an array.`);
          })();
  if (new Set(additionalCodes).size !== additionalCodes.length) {
    throw new Error(`${label}.additionalCodes must not contain duplicates.`);
  }
  const expectedCodes = new Set(issues.map((issue) => issue.code));
  const redundantCode = additionalCodes.find((code) => expectedCodes.has(code));
  if (redundantCode) {
    throw new Error(
      `${label}.additionalCodes must not repeat an explicitly expected code: ${redundantCode}`,
    );
  }
  if (
    value.allowUnexpectedIssues !== undefined &&
    typeof value.allowUnexpectedIssues !== 'boolean'
  ) {
    throw new Error(`${label}.allowUnexpectedIssues must be boolean.`);
  }

  return {
    additionalCodes,
    allowUnexpectedIssues: value.allowUnexpectedIssues ?? false,
    exitCode,
    issues,
    primaryCode,
  };
}

function validateCopyPolicy(
  value: unknown,
  label: string,
): FixtureCopyPolicy | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isPlainRecord(value)) {
    throw new Error(`${label} must be an object.`);
  }
  assertOnlyKeys(value, COPY_POLICY_KEYS, label);

  for (const key of [
    'includeBuildInfoFiles',
    'includeOutputDirectories',
  ] as const) {
    if (value[key] !== undefined && typeof value[key] !== 'boolean') {
      throw new Error(`${label}.${key} must be boolean.`);
    }
  }

  const excludedNames =
    value.excludedNames === undefined
      ? undefined
      : validateStringArray(value.excludedNames, `${label}.excludedNames`);
  for (const [index, entryName] of (excludedNames ?? []).entries()) {
    if (
      entryName === '.' ||
      entryName === '..' ||
      entryName.includes('/') ||
      entryName.includes('\\')
    ) {
      throw new Error(
        `${label}.excludedNames[${index}] must be a single entry name: ${entryName}`,
      );
    }
  }

  return {
    excludedNames,
    includeBuildInfoFiles: value.includeBuildInfoFiles as boolean | undefined,
    includeOutputDirectories: value.includeOutputDirectories as
      | boolean
      | undefined,
  };
}

function validateSetupOperation(
  value: unknown,
  label: string,
): FixtureSetupOperation {
  if (!isPlainRecord(value)) {
    throw new Error(`${label} must be an object.`);
  }
  const kind = requireNonEmptyString(value.kind, `${label}.kind`);
  const fixturePath = validatePortableRelativePath(value.path, {
    label: `${label}.path`,
  });

  if (kind === 'directory-link') {
    assertOnlyKeys(value, new Set(['kind', 'path', 'target']), label);
    return {
      kind,
      path: fixturePath,
      target: validatePortableRelativePath(value.target, {
        label: `${label}.target`,
      }),
    };
  }
  if (kind === 'write-file') {
    assertOnlyKeys(
      value,
      new Set(['content', 'kind', 'overwrite', 'path']),
      label,
    );
    if (typeof value.content !== 'string') {
      throw new TypeError(`${label}.content must be a string.`);
    }
    if (value.overwrite !== undefined && typeof value.overwrite !== 'boolean') {
      throw new Error(`${label}.overwrite must be boolean.`);
    }
    return {
      content: value.content,
      kind,
      overwrite: value.overwrite,
      path: fixturePath,
    };
  }
  if (kind === 'remove-path') {
    assertOnlyKeys(value, new Set(['allowMissing', 'kind', 'path']), label);
    if (
      value.allowMissing !== undefined &&
      typeof value.allowMissing !== 'boolean'
    ) {
      throw new Error(`${label}.allowMissing must be boolean.`);
    }
    return {
      allowMissing: value.allowMissing,
      kind,
      path: fixturePath,
    };
  }

  throw new Error(`${label}.kind is unsupported: ${kind}`);
}

function validateMutation(value: unknown, label: string): FixtureMutation {
  if (!isPlainRecord(value)) {
    throw new Error(`${label} must be an object.`);
  }
  const kind = requireNonEmptyString(value.kind, `${label}.kind`);
  const fixturePath = validatePortableRelativePath(value.path, {
    label: `${label}.path`,
  });

  if (kind === 'replace-text') {
    assertOnlyKeys(
      value,
      new Set(['all', 'kind', 'path', 'replacement', 'search']),
      label,
    );
    const search = requireNonEmptyString(value.search, `${label}.search`);
    if (typeof value.replacement !== 'string') {
      throw new TypeError(`${label}.replacement must be a string.`);
    }
    if (value.all !== undefined && typeof value.all !== 'boolean') {
      throw new Error(`${label}.all must be boolean.`);
    }
    return {
      all: value.all,
      kind,
      path: fixturePath,
      replacement: value.replacement,
      search,
    };
  }
  if (kind === 'write-file' || kind === 'remove-path') {
    return validateSetupOperation(value, label) as FixtureMutation;
  }

  throw new Error(`${label}.kind is unsupported: ${kind}`);
}

function validateEnvironment(
  value: unknown,
  label: string,
): Readonly<Record<string, string>> | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isPlainRecord(value)) {
    throw new Error(`${label} must be a string record.`);
  }

  const environment: Record<string, string> = {};
  for (const [key, entryValue] of Object.entries(value)) {
    if (!key || typeof entryValue !== 'string') {
      throw new Error(`${label} must contain only string keys and values.`);
    }
    if (RESERVED_ENVIRONMENT_KEYS.has(key.toUpperCase())) {
      throw new Error(`${label} cannot override harness variable ${key}.`);
    }
    environment[key] = entryValue;
  }

  return environment;
}

function validateAllowedGeneratedPaths(
  value: unknown,
  label: string,
): readonly string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  const patterns = validateStringArray(value, label).map((pattern, index) =>
    validatePortableRelativePath(pattern, {
      allowGlob: true,
      label: `${label}[${index}]`,
    }),
  );

  for (const pattern of patterns) {
    if (
      pattern === '*' ||
      pattern === '**' ||
      pattern === '**/*' ||
      pattern.startsWith('**/')
    ) {
      throw new Error(`${label} contains an over-broad pattern: ${pattern}`);
    }
  }

  return patterns;
}

export function validateDetectorFixtureDefinition(
  value: unknown,
  options: { readonly casePath: string; readonly expectedId?: string },
): DetectorFixtureDefinition {
  const label = `Detector fixture declaration in ${options.casePath}`;
  if (!isPlainRecord(value)) {
    throw new Error(`${label} must default-export an object.`);
  }
  assertOnlyKeys(value, DEFINITION_KEYS, label);
  const id = validateFixtureId(value.id, `${label}.id`);

  if (options.expectedId !== undefined && id !== options.expectedId) {
    throw new Error(
      `${label} has an ID/directory mismatch: declared "${id}", expected "${options.expectedId}".`,
    );
  }
  if (
    value.kind !== 'filesystem' &&
    value.kind !== 'external-tool' &&
    value.kind !== 'fault-injection'
  ) {
    throw new Error(`${label}.kind is unsupported: ${String(value.kind)}`);
  }
  const command = validateStringArray(value.command, `${label}.command`);
  if (command.length === 0) {
    throw new Error(`${label}.command must contain at least one CLI argument.`);
  }
  if (command[0]!.startsWith('-')) {
    throw new Error(`${label}.command must start with a Limina subcommand.`);
  }

  const setup =
    value.setup === undefined
      ? []
      : Array.isArray(value.setup)
        ? value.setup.map((operation, index) =>
            validateSetupOperation(operation, `${label}.setup[${index}]`),
          )
        : (() => {
            throw new Error(`${label}.setup must be an array.`);
          })();
  const mutations =
    value.mutations === undefined
      ? []
      : Array.isArray(value.mutations)
        ? value.mutations.map((mutation, index) =>
            validateMutation(mutation, `${label}.mutations[${index}]`),
          )
        : (() => {
            throw new Error(`${label}.mutations must be an array.`);
          })();
  const tools =
    value.tools === undefined
      ? []
      : Array.isArray(value.tools)
        ? value.tools.map((tool, index) => {
            const name = requireNonEmptyString(
              tool,
              `${label}.tools[${index}]`,
            );
            if (!TOOL_NAME_SET.has(name)) {
              throw new Error(
                `${label}.tools[${index}] is unsupported: ${name}`,
              );
            }
            return name as FixtureToolName;
          })
        : (() => {
            throw new Error(`${label}.tools must be an array.`);
          })();
  if (new Set(tools).size !== tools.length) {
    throw new Error(`${label}.tools must not contain duplicates.`);
  }

  return {
    allowedGeneratedPaths: validateAllowedGeneratedPaths(
      value.allowedGeneratedPaths,
      `${label}.allowedGeneratedPaths`,
    ),
    command,
    copyPolicy: validateCopyPolicy(value.copyPolicy, `${label}.copyPolicy`),
    environment: validateEnvironment(value.environment, `${label}.environment`),
    expected: validateExpectation(value.expected, `${label}.expected`),
    id,
    kind: value.kind,
    mutations,
    setup,
    tools,
  };
}

async function collectFixtureDirectories(
  currentDirectory: string,
  output: string[],
): Promise<void> {
  const entries = (
    await readdir(currentDirectory, { withFileTypes: true })
  ).sort((left, right) => comparePortableNames(left.name, right.name));
  const caseEntries = entries.filter((entry) => /^case\./u.test(entry.name));
  const repoEntry = entries.find((entry) => entry.name === 'repo');

  if (caseEntries.length > 0 || repoEntry) {
    if (
      caseEntries.length !== 1 ||
      caseEntries[0]!.name !== 'case.mts' ||
      !caseEntries[0]!.isFile()
    ) {
      throw new Error(
        `Detector fixture ${currentDirectory} must contain exactly one case.mts declaration.`,
      );
    }
    if (!repoEntry || !repoEntry.isDirectory() || repoEntry.isSymbolicLink()) {
      throw new Error(
        `Detector fixture ${currentDirectory} must contain a real repo directory.`,
      );
    }
    const repoPath = path.join(currentDirectory, 'repo');
    const repoStat = await lstat(repoPath);
    if (!repoStat.isDirectory() || repoStat.isSymbolicLink()) {
      throw new Error(
        `Detector fixture repo must be a real directory: ${repoPath}`,
      );
    }
    output.push(currentDirectory);
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    if (entry.isSymbolicLink()) {
      throw new Error(
        `Detector fixture discovery does not follow directory links: ${path.join(currentDirectory, entry.name)}`,
      );
    }
    await collectFixtureDirectories(
      path.join(currentDirectory, entry.name),
      output,
    );
  }
}

function readCaseModuleDefault(caseModule: unknown, casePath: string): unknown {
  if (!caseModule || typeof caseModule !== 'object') {
    throw new Error(
      `Detector case module did not load as a module: ${casePath}`,
    );
  }
  const moduleRecord = caseModule as Record<string, unknown>;
  const declarationExports = Object.keys(moduleRecord).filter(
    (key) => key !== '__esModule',
  );
  if (declarationExports.length !== 1 || declarationExports[0] !== 'default') {
    throw new Error(
      `Detector case module must expose only one default declaration: ${casePath}`,
    );
  }

  return moduleRecord.default;
}

export async function discoverDetectorFixtures(
  options: DiscoverDetectorFixturesOptions,
): Promise<readonly DetectorFixtureCase[]> {
  const detectorRoot = await realpath(options.detectorRoot);
  const fixtureDirectories: string[] = [];
  await collectFixtureDirectories(detectorRoot, fixtureDirectories);

  const modulesByPath = new Map(
    [...options.caseModules.entries()].map(([casePath, caseModule]) => [
      path.resolve(casePath),
      caseModule,
    ]),
  );
  const discovered = fixtureDirectories
    .map((directoryPath) => ({
      directoryPath,
      id: path.relative(detectorRoot, directoryPath).replaceAll('\\', '/'),
    }))
    .sort((left, right) => comparePortableNames(left.id, right.id))
    .map(({ directoryPath, id: directoryId }) => {
      const casePath = path.join(directoryPath, 'case.mts');
      const caseModule = modulesByPath.get(path.resolve(casePath));

      if (caseModule === undefined) {
        throw new Error(
          `Detector case declaration was discovered but not loaded by the test runner: ${casePath}`,
        );
      }

      return {
        casePath,
        definition: validateDetectorFixtureDefinition(
          readCaseModuleDefault(caseModule, casePath),
          { casePath },
        ),
        directoryId,
        directoryPath,
        repoSourceRoot: path.join(directoryPath, 'repo'),
      };
    });

  const fixtureIds = discovered.map((fixture) => fixture.definition.id);
  const duplicateId = fixtureIds.find(
    (id, index) => fixtureIds.indexOf(id) !== index,
  );
  if (duplicateId) {
    throw new Error(`Duplicate detector fixture ID: ${duplicateId}`);
  }

  const fixtures = discovered.map((fixture) => {
    if (fixture.definition.id !== fixture.directoryId) {
      throw new Error(
        `Detector fixture declaration in ${fixture.casePath} has an ID/directory mismatch: declared "${fixture.definition.id}", expected "${fixture.directoryId}".`,
      );
    }

    return {
      casePath: fixture.casePath,
      definition: fixture.definition,
      directoryPath: fixture.directoryPath,
      id: fixture.definition.id,
      repoSourceRoot: fixture.repoSourceRoot,
    } satisfies DetectorFixtureCase;
  });

  return fixtures;
}
