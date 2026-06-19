import { describe, expect, it } from 'vitest';
import { formatCheckIssueHumanReport } from '../check-reporting/human';
import {
  formatCheckDetailBlock,
  formatCheckIssueSummaryReport,
  formatCheckSummaryBlock,
} from '../reporting';

describe('check reporting', () => {
  it('formats left-aligned titled summary boxes for check tasks', () => {
    const lines = formatCheckSummaryBlock({
      lines: [
        'Found 2 graph check issues.',
        'Found 1 failed checker build target.',
      ],
      title: 'Graph check summary',
    });

    expect(lines[0]).toContain('Graph check summary');
    expect(lines[1]).toMatch(/^│ Found 2 graph check issues\.\s+│$/u);
    expect(lines[2]).toMatch(/^│ Found 1 failed checker build target\.\s+│$/u);
    expect(lines.slice(1, 3).map((line) => line.indexOf('Found'))).toEqual([
      2, 2,
    ]);
  });

  it('formats detail blocks with the same left-aligned box shape', () => {
    const lines = formatCheckDetailBlock([
      'Source files are not covered by typecheck proof:',
      '  - packages/pkg/src/internal.ts',
      '  reason: every file must be covered.',
    ]);

    expect(lines[0]).toMatch(/^┌/u);
    expect(lines[1]).toMatch(
      /^│ Source files are not covered by typecheck proof:\s+│$/u,
    );
    expect(lines[2]).toMatch(/^│ {3}- packages\/pkg\/src\/internal\.ts\s+│$/u);
  });

  it('wraps graph check detail prose inside the standard block width', () => {
    const lines = formatCheckDetailBlock([
      'Unresolved workspace import:',
      '  import: @example/missing',
      '  reason: graph check reports resolver and architecture violations with enough context, but long explanations should wrap instead of widening the terminal report.',
    ]);
    const report = lines.join('\n');

    expect(lines.every((line) => line.length === 88)).toBe(true);
    expect(report).toContain(
      '│   reason: graph check reports resolver and architecture violations with enough',
    );
    expect(report).toContain(
      '│           context, but long explanations should wrap instead of widening the',
    );
  });

  it('prepends a summary box before detailed check reports', () => {
    const report = formatCheckIssueSummaryReport({
      details: 'detail line 1\n\ndetail line 2',
      issueCount: 2,
      pluralIssueLabel: 'proof check issues',
      singularIssueLabel: 'proof check issue',
      title: 'Proof check summary',
    });

    expect(report).toMatch(/^┌ Proof check summary /u);
    expect(report).toContain('│ Found 2 proof check issues.');
    expect(report).toContain('│ detail line 1');
    expect(report).toContain('│ detail line 2');
    expect(report).not.toContain('\n\ndetail line 1\n\n');
  });

  it('groups structured check issues and truncates details by default', () => {
    const report = formatCheckIssueHumanReport({
      command: 'limina graph check',
      issues: Array.from({ length: 46 }, (_, index) => ({
        code: 'LIMINA_GRAPH_REFERENCE_MISSING',
        filePath: `packages/app/src/file-${index.toString().padStart(2, '0')}.ts`,
        fix: 'Run `limina graph prepare`.',
        packageName: '@example/app',
        reason: 'A workspace source import needs a project reference.',
        scope: 'packages/app/src',
        task: 'graph:check',
        title: 'Missing project reference for workspace import',
      })),
      title: 'Graph check summary',
    });

    expect(report).toContain('│ Found 46 check issues.');
    expect(report).toContain(
      '│ Top rules: LIMINA_GRAPH_REFERENCE_MISSING (46)',
    );
    expect(report).toContain(
      '│ Show all details: limina graph check --verbose',
    );
    expect(report).toContain(
      '│ Missing project reference for workspace import  46 issues',
    );
    expect(report).toContain('│ files:');
    expect(report).toContain('│   - packages/app/src/file-00.ts');
    expect(report).toContain('│   - packages/app/src/file-04.ts');
    expect(report).not.toContain('│   - packages/app/src/file-05.ts');
    expect(report).toContain('│   ... 41 more');
  });

  it('shows every structured check issue detail in verbose mode', () => {
    const report = formatCheckIssueHumanReport({
      command: 'limina proof check',
      issues: [
        {
          code: 'LIMINA_PROOF_CHECKER_COVERAGE_INVALID',
          detailLines: [
            'Checker entry is not reachable:',
            '  config: packages/app/tsconfig.json',
            '  reason: checker.include must reach source configs.',
          ],
          reason: 'Checker graph coverage is invalid.',
          task: 'proof:check',
          title: 'Checker coverage issue',
        },
      ],
      title: 'Proof check summary',
      verbose: true,
    });

    expect(report).toContain('│ Found 1 check issue.');
    expect(report).toContain('│ details:');
    expect(report).toContain('│     Checker entry is not reachable:');
    expect(report).toContain(
      '│       reason: checker.include must reach source configs.',
    );
    expect(report).not.toContain('Show all details');
  });
});
