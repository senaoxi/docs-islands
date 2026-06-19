import { describe, expect, it } from 'vitest';
import {
  CHECK_ISSUE_SNAPSHOT_VERSION,
  type CheckIssueSnapshot,
  formatCheckIssueSnapshotInventory,
} from '../check-reporting/snapshot';
import { SOURCE_ISSUE_CODES } from '../source-check/report';
import {
  formatSourceIssueSnapshotInventory,
  SOURCE_ISSUE_SNAPSHOT_VERSION,
  type SourceIssueSnapshot,
} from '../source-check/snapshot';

function createSnapshot(
  issues: SourceIssueSnapshot['issues'],
): SourceIssueSnapshot {
  return {
    command: 'limina check',
    createdAt: '2026-06-19T00:00:00.000Z',
    issues,
    legacyProblemCount: 0,
    status: 'completed',
    version: SOURCE_ISSUE_SNAPSHOT_VERSION,
  };
}

function createCheckSnapshot(
  issues: CheckIssueSnapshot['issues'],
): CheckIssueSnapshot {
  return {
    command: 'limina check',
    createdAt: '2026-06-19T00:00:00.000Z',
    issues,
    status: 'completed',
    version: CHECK_ISSUE_SNAPSHOT_VERSION,
  };
}

describe('source issue snapshots', () => {
  it('formats available filters from the last run in count order', () => {
    const output = formatSourceIssueSnapshotInventory(
      createSnapshot([
        {
          code: SOURCE_ISSUE_CODES.unusedModule,
          filePath: 'packages/app/src/theme/button.ts',
          ownerName: '@example/app',
        },
        {
          code: SOURCE_ISSUE_CODES.unusedModule,
          filePath: 'packages/app/src/theme/card.ts',
          ownerName: '@example/app',
        },
        {
          code: SOURCE_ISSUE_CODES.unusedWorkspaceDependency,
          ownerName: '@example/app',
        },
        {
          code: SOURCE_ISSUE_CODES.unusedModule,
          filePath: 'packages/shared/src/index.ts',
          ownerName: '@example/shared',
        },
      ]),
    );

    expect(output).toContain('Issue filters available from last run:');
    expect(output).toContain('packages:\n  - @example/app  3 issues');
    expect(output).toContain('  - @example/shared  1 issue');
    expect(output).toContain(
      `rules:\n  - ${SOURCE_ISSUE_CODES.unusedModule}  3 issues`,
    );
    expect(output).toContain(
      `  - ${SOURCE_ISSUE_CODES.unusedWorkspaceDependency}  1 issue`,
    );
    expect(output).toContain('scopes:\n  - packages/app/src/theme  2 issues');
    expect(output).toContain('  - packages/shared/src  1 issue');
  });

  it('formats empty and unavailable snapshots', () => {
    expect(formatSourceIssueSnapshotInventory(null)).toContain(
      'No source issue snapshot found.',
    );
    expect(
      formatSourceIssueSnapshotInventory({
        ...createSnapshot([]),
        status: 'not-run',
      }),
    ).toContain('No completed source issue snapshot is available');
    expect(formatSourceIssueSnapshotInventory(createSnapshot([]))).toContain(
      'The last source check completed without structured source issues.',
    );
    expect(
      formatSourceIssueSnapshotInventory({
        ...createSnapshot([]),
        legacyProblemCount: 2,
      }),
    ).toContain('The last source check reported 2 unfilterable issues.');
  });
});

describe('check issue snapshots', () => {
  it('formats available filters across tasks in deterministic order', () => {
    const output = formatCheckIssueSnapshotInventory({
      snapshot: createCheckSnapshot([
        {
          code: 'LIMINA_PROOF_UNCOVERED_SOURCE_FILE',
          filePath: 'packages/app/src/internal.ts',
          reason: 'not covered',
          scope: 'packages/app/src',
          task: 'proof:check',
          title: 'Uncovered source file',
        },
        {
          checkerName: 'typescript',
          code: 'LIMINA_CHECKER_BUILD_FAILED',
          filePath: '.limina/checkers/typescript/tsconfig.json',
          reason: 'build failed',
          task: 'checker:build',
          title: 'Checker build failed',
        },
        {
          code: 'LIMINA_PACKAGE_CHECK_FAILED',
          detailLines: ['[publint] package export is invalid'],
          packageManifestPath: 'packages/app/dist/package.json',
          packageName: '@example/app',
          reason: 'package failed',
          task: 'package:check',
          title: 'Package check failed',
          tool: 'publint',
        },
        {
          code: 'LIMINA_PACKAGE_CHECK_FAILED',
          packageName: '@example/app',
          reason: 'package failed',
          task: 'package:check',
          title: 'Package check failed',
          tool: 'attw',
        },
      ]),
    });

    expect(output).toContain('Issue filters available from last run:');
    expect(output).toContain('tasks:\n  - package:check  2 issues');
    expect(output).toContain('  - checker:build  1 issue');
    expect(output).toContain('  - proof:check  1 issue');
    expect(output).toContain('packages:\n  - @example/app  2 issues');
    expect(output).toContain(
      'rules:\n  - LIMINA_PACKAGE_CHECK_FAILED  2 issues',
    );
    expect(output).toContain(
      'scopes:\n  - .limina/checkers/typescript  1 issue',
    );
    expect(output).toContain('  - packages/app/src  1 issue');
    expect(output).toContain('checkers:\n  - typescript  1 issue');
    expect(output).toContain('tools:\n  - attw  1 issue');
    expect(output).toContain('  - publint  1 issue');
  });

  it('formats empty and filtered unified snapshots', () => {
    expect(formatCheckIssueSnapshotInventory({ snapshot: null })).toContain(
      'No check issue snapshot found.',
    );
    expect(
      formatCheckIssueSnapshotInventory({
        snapshot: {
          ...createCheckSnapshot([]),
          status: 'not-run',
        },
      }),
    ).toContain('No completed check issue snapshot is available');

    const emptyOutput = formatCheckIssueSnapshotInventory({
      snapshot: createCheckSnapshot([]),
    });

    expect(emptyOutput).toContain(
      'No check issues were recorded from the last run.',
    );
    expect(emptyOutput).toContain('tasks:\n  (none)');
    expect(emptyOutput).toContain('tools:\n  (none)');

    const filteredOutput = formatCheckIssueSnapshotInventory({
      filters: {
        tasks: ['proof:check'],
      },
      snapshot: createCheckSnapshot([
        {
          code: 'LIMINA_PROOF_UNCOVERED_SOURCE_FILE',
          filePath: 'packages/app/src/internal.ts',
          reason: 'not covered',
          task: 'proof:check',
          title: 'Uncovered source file',
        },
        {
          code: 'LIMINA_PACKAGE_CHECK_FAILED',
          packageName: '@example/app',
          reason: 'package failed',
          task: 'package:check',
          title: 'Package check failed',
          tool: 'publint',
        },
      ]),
    });

    expect(filteredOutput).toContain('tasks:\n  - proof:check  1 issue');
    expect(filteredOutput).not.toContain('package:check');
  });
});
