import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'pathe';
import { describe, expect, it } from 'vitest';
import {
  CHECK_ISSUE_SNAPSHOT_VERSION,
  type CheckIssueSnapshot,
  formatCheckIssueSnapshotInventory,
  getCheckIssueSnapshotPath,
  readCheckIssueSnapshot,
} from '../check-reporting/snapshot';
import { createLiminaCheckIssue } from '../check-reporting/structured';
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
  it('normalizes builder paths, derives scope, and creates stable ids', () => {
    const issue = createLiminaCheckIssue({
      code: 'LIMINA_GRAPH_REFERENCE_MISSING',
      filePath: '/repo/packages/app/src/index.ts:12:3',
      reason: 'missing ref',
      rootDir: '/repo',
      task: 'graph:check',
      title: 'Missing project reference',
    });
    const sameIssue = createLiminaCheckIssue({
      code: 'LIMINA_GRAPH_REFERENCE_MISSING',
      filePath: '/repo/packages/app/src/index.ts:12:3',
      reason: 'missing ref',
      rootDir: '/repo',
      task: 'graph:check',
      title: 'Missing project reference',
    });

    expect(issue.filePath).toBe('packages/app/src/index.ts');
    expect(issue.scope).toBe('packages/app/src');
    expect(issue.domain).toBe('graph');
    expect(issue.id).toBe(sameIssue.id);
  });

  it('reads legacy v1 check snapshots and current v2 snapshots', async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), 'limina-snapshot-'));

    try {
      const snapshotPath = getCheckIssueSnapshotPath(rootDir);
      await mkdir(path.dirname(snapshotPath), { recursive: true });
      await writeFile(
        snapshotPath,
        `${JSON.stringify(
          {
            ...createCheckSnapshot([
              {
                code: 'LIMINA_PACKAGE_CHECK_FAILED',
                reason: 'package failed',
                task: 'package:check',
                title: 'Package check failed',
              },
            ]),
            version: 1,
          },
          null,
          2,
        )}\n`,
      );

      expect(await readCheckIssueSnapshot(rootDir)).toMatchObject({
        issues: [
          {
            code: 'LIMINA_PACKAGE_CHECK_FAILED',
            title: 'Package check failed',
          },
        ],
        version: 1,
      });

      await writeFile(
        snapshotPath,
        `${JSON.stringify(
          createCheckSnapshot([
            createLiminaCheckIssue({
              code: 'LIMINA_GRAPH_REFERENCE_MISSING',
              filePath: 'packages/app/src/index.ts',
              reason: 'missing ref',
              rootDir,
              task: 'graph:check',
              title: 'Missing project reference',
            }),
          ]),
          null,
          2,
        )}\n`,
      );

      expect(await readCheckIssueSnapshot(rootDir)).toMatchObject({
        issues: [
          {
            code: 'LIMINA_GRAPH_REFERENCE_MISSING',
            id: expect.any(String),
          },
        ],
        version: CHECK_ISSUE_SNAPSHOT_VERSION,
      });
    } finally {
      await rm(rootDir, { force: true, recursive: true });
    }
  });

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

  it('formats detailed, fix, json, and ndjson issue inventory output', () => {
    const issue = createLiminaCheckIssue({
      code: 'LIMINA_PACKAGE_PUBLINT',
      evidence: [{ label: 'publint', value: 'export is invalid' }],
      external: {
        code: 'EXPORT_MISSING',
        message: 'export is invalid',
        tool: 'publint',
      },
      filePath: 'packages/app/dist/index.js',
      fixSteps: ['Fix package exports.', 'Rebuild package output.'],
      packageManifestPath: 'packages/app/dist/package.json',
      packageName: '@example/app',
      reason: 'publint reported an invalid export.',
      rootDir: '/repo',
      summary: 'Package export is invalid.',
      task: 'package:check',
      title: 'Publint package issue',
      tool: 'publint',
      verifyCommands: ['limina package check'],
    });
    const snapshot = createCheckSnapshot([issue]);
    const details = formatCheckIssueSnapshotInventory({
      details: true,
      snapshot,
    });
    const fixes = formatCheckIssueSnapshotInventory({
      fixes: true,
      snapshot,
    });
    const json = JSON.parse(
      formatCheckIssueSnapshotInventory({
        format: 'json',
        snapshot,
      }),
    ) as { issueCount: number; issues: CheckIssueSnapshot['issues'] };
    const ndjson = formatCheckIssueSnapshotInventory({
      format: 'ndjson',
      snapshot,
    });

    expect(details).toContain('Package export is invalid.');
    expect(details).toContain('external:');
    expect(details).toContain('code: EXPORT_MISSING');
    expect(details).toContain('fix steps:');
    expect(details).toContain('verify:');
    expect(fixes).toContain('Fix package exports.');
    expect(fixes).toContain('limina package check');
    expect(json.issueCount).toBe(1);
    expect(json.issues[0]?.id).toBe(issue.id);
    expect(JSON.parse(ndjson)).toMatchObject({
      code: 'LIMINA_PACKAGE_PUBLINT',
      id: issue.id,
    });
  });

  it('filters unified inventory by rule, file, scope, package, task, checker, and tool', () => {
    const snapshot = createCheckSnapshot([
      createLiminaCheckIssue({
        checkerName: 'typescript',
        code: 'LIMINA_CHECKER_BUILD_FAILED',
        filePath: '/repo/.limina/checkers/typescript/tsconfig.json',
        packageName: '@example/app',
        reason: 'build failed',
        rootDir: '/repo',
        task: 'checker:build',
        title: 'Checker build failed',
        tool: 'tsgo',
      }),
      createLiminaCheckIssue({
        code: 'LIMINA_PACKAGE_PUBLINT',
        filePath: '/repo/packages/lib/dist/index.js',
        packageName: '@example/lib',
        reason: 'publint failed',
        rootDir: '/repo',
        task: 'package:check',
        title: 'Publint package issue',
        tool: 'publint',
      }),
    ]);
    const output = formatCheckIssueSnapshotInventory({
      filters: {
        checkerNames: ['typescript'],
        files: ['.limina/checkers/typescript/tsconfig.json'],
        packageNames: ['@example/app'],
        rules: ['LIMINA_CHECKER_BUILD_FAILED'],
        scopes: ['.limina/checkers'],
        tasks: ['checker:build'],
        tools: ['tsgo'],
      },
      rootDir: '/repo',
      snapshot,
    });

    expect(output).toContain('tasks:\n  - checker:build  1 issue');
    expect(output).toContain('packages:\n  - @example/app  1 issue');
    expect(output).toContain(
      'rules:\n  - LIMINA_CHECKER_BUILD_FAILED  1 issue',
    );
    expect(output).toContain('checkers:\n  - typescript  1 issue');
    expect(output).toContain('tools:\n  - tsgo  1 issue');
    expect(output).not.toContain('@example/lib');
  });
});
