import type { LiminaCheckIssue } from '../../src/check-reporting/snapshot';
import { normalizeCheckIssuePath } from '../../src/check-reporting/structured';
import type {
  DetectorFixtureExpectation,
  ExpectedEvidence,
  ExpectedIssue,
} from './detector-fixture-types';

interface IssueAssertionOptions {
  readonly actualIssues: readonly LiminaCheckIssue[];
  readonly expected: DetectorFixtureExpectation;
  readonly fixtureId: string;
  readonly repoRoot: string;
}

function normalizeIssuePath(
  repoRoot: string,
  value: string | undefined,
): string | undefined {
  return normalizeCheckIssuePath(repoRoot, value);
}

function evidenceMatches(
  expected: ExpectedEvidence,
  actual: NonNullable<LiminaCheckIssue['evidence']>[number],
): boolean {
  if (expected.label !== undefined && actual.label !== expected.label) {
    return false;
  }
  if (expected.value !== undefined && actual.value !== expected.value) {
    return false;
  }
  if (
    expected.lines !== undefined &&
    !expected.lines.every((line) => actual.lines?.includes(line))
  ) {
    return false;
  }

  return true;
}

function expectedEvidenceMatches(
  expected: readonly ExpectedEvidence[] | undefined,
  actual:
    | readonly NonNullable<LiminaCheckIssue['evidence']>[number][]
    | undefined,
): boolean {
  return (
    expected === undefined ||
    expected.every((expectedItem) =>
      actual?.some((actualItem) => evidenceMatches(expectedItem, actualItem)),
    )
  );
}

function issueMatches(
  expected: ExpectedIssue,
  actual: LiminaCheckIssue,
  repoRoot: string,
): boolean {
  return (
    actual.code === expected.code &&
    actual.task === expected.task &&
    (expected.filePath === undefined ||
      normalizeIssuePath(repoRoot, actual.filePath) === expected.filePath) &&
    (expected.packageManifestPath === undefined ||
      normalizeIssuePath(repoRoot, actual.packageManifestPath) ===
        expected.packageManifestPath) &&
    (expected.packageName === undefined ||
      actual.packageName === expected.packageName) &&
    (expected.checkerName === undefined ||
      actual.checkerName === expected.checkerName) &&
    (expected.externalCode === undefined ||
      actual.external?.code === expected.externalCode) &&
    expectedEvidenceMatches(expected.evidence, actual.evidence)
  );
}

function expectedConstraintCount(expected: ExpectedIssue): number {
  return (
    2 +
    Number(expected.filePath !== undefined) +
    Number(expected.packageManifestPath !== undefined) +
    Number(expected.packageName !== undefined) +
    Number(expected.checkerName !== undefined) +
    Number(expected.externalCode !== undefined) +
    (expected.evidence?.reduce(
      (count, evidence) =>
        count +
        Number(evidence.label !== undefined) +
        Number(evidence.value !== undefined) +
        (evidence.lines?.length ?? 0),
      0,
    ) ?? 0)
  );
}

export function formatExpectedIssueSummary(issue: ExpectedIssue): string {
  return JSON.stringify({
    checkerName: issue.checkerName,
    code: issue.code,
    evidence: issue.evidence,
    externalCode: issue.externalCode,
    filePath: issue.filePath,
    packageManifestPath: issue.packageManifestPath,
    packageName: issue.packageName,
    task: issue.task,
  });
}

export function formatActualIssueSummary(
  issue: LiminaCheckIssue,
  repoRoot: string,
): string {
  return JSON.stringify({
    checkerName: issue.checkerName,
    code: issue.code,
    externalCode: issue.external?.code,
    filePath: normalizeIssuePath(repoRoot, issue.filePath),
    packageManifestPath: normalizeIssuePath(
      repoRoot,
      issue.packageManifestPath,
    ),
    packageName: issue.packageName,
    task: issue.task,
  });
}

function formatIssueList(
  issues: readonly LiminaCheckIssue[],
  repoRoot: string,
): string[] {
  const visible = issues
    .slice(0, 20)
    .map((issue) => `- ${formatActualIssueSummary(issue, repoRoot)}`);
  const omitted = issues.length - visible.length;

  return [
    ...visible,
    ...(omitted > 0 ? [`- ... ${omitted} more issues omitted`] : []),
  ];
}

export function assertDetectorIssues(options: IssueAssertionOptions): void {
  const available = new Map(
    options.actualIssues.map((issue, index) => [index, issue]),
  );
  const expectedInMatchOrder = options.expected.issues
    .map((issue, declarationIndex) => ({ declarationIndex, issue }))
    .sort(
      (left, right) =>
        expectedConstraintCount(right.issue) -
          expectedConstraintCount(left.issue) ||
        left.declarationIndex - right.declarationIndex,
    );

  for (const expectedEntry of expectedInMatchOrder) {
    const candidates = [...available.entries()].filter(([, actual]) =>
      issueMatches(expectedEntry.issue, actual, options.repoRoot),
    );
    if (candidates.length === 0) {
      throw new Error(
        [
          `Detector fixture ${options.fixtureId} is missing an expected issue.`,
          `expected: ${formatExpectedIssueSummary(expectedEntry.issue)}`,
          'remaining actual issues:',
          ...formatIssueList([...available.values()], options.repoRoot),
        ].join('\n'),
      );
    }
    if (candidates.length > 1) {
      throw new Error(
        [
          `Detector fixture ${options.fixtureId} has an ambiguous expected issue.`,
          `expected: ${formatExpectedIssueSummary(expectedEntry.issue)}`,
          'matching actual issues:',
          ...formatIssueList(
            candidates.map(([, issue]) => issue),
            options.repoRoot,
          ),
          'Add a stable location, package, checker, external code, or evidence constraint.',
        ].join('\n'),
      );
    }

    available.delete(candidates[0]![0]);
  }

  if (
    options.expected.primaryCode !== undefined &&
    !options.actualIssues.some(
      (issue) => issue.code === options.expected.primaryCode,
    )
  ) {
    throw new Error(
      `Detector fixture ${options.fixtureId} did not produce primary code ${options.expected.primaryCode}.`,
    );
  }

  const additionalCodes = new Set<string>(options.expected.additionalCodes);
  const unexpected = [...available.values()].filter(
    (issue) => !additionalCodes.has(issue.code),
  );
  if (
    unexpected.length > 0 &&
    options.expected.allowUnexpectedIssues !== true
  ) {
    throw new Error(
      [
        `Detector fixture ${options.fixtureId} produced undeclared issues.`,
        ...formatIssueList(unexpected, options.repoRoot),
      ].join('\n'),
    );
  }
}
