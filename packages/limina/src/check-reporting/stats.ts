import type { LiminaCheckRunCheckItemSummary } from './snapshot';

export interface CreateCheckItemStatsOptions {
  durationMs?: number;
  issues?: number;
  name: string;
  passed?: number;
  total: number;
}

export interface CheckCounter {
  add(amount?: number): void;
  readonly value: number;
}

// Tracks validation units: every time a rule is evaluated against one subject.
// Phases read its running delta to report how much work was performed.
export function createCheckCounter(): CheckCounter {
  let value = 0;

  return {
    add(amount = 1) {
      value += Math.max(0, amount);
    },
    get value() {
      return value;
    },
  };
}

export interface CheckItemAccumulator {
  getItems(): LiminaCheckRunCheckItemSummary[];
  record(name: string): void;
}

export function createCheckItemStats(
  options: CreateCheckItemStatsOptions,
): LiminaCheckRunCheckItemSummary {
  const total = Math.max(0, options.total);
  const issues = Math.max(0, options.issues ?? 0);
  const passed =
    options.passed === undefined
      ? issues === 0
        ? total
        : 0
      : Math.max(0, options.passed);

  return {
    checksPassed: passed,
    checksTotal: total,
    ...(options.durationMs === undefined
      ? {}
      : { durationMs: Math.max(0, options.durationMs) }),
    issues,
    name: options.name,
    status: issues === 0 && passed >= total ? 'passed' : 'failed',
  };
}

export function createCheckItemAccumulator(
  getIssueCount: () => number,
  getCheckCount: () => number,
): CheckItemAccumulator {
  const items: LiminaCheckRunCheckItemSummary[] = [];
  let previousIssueCount = getIssueCount();
  let previousCheckCount = getCheckCount();
  let previousRecordTime = performance.now();

  return {
    getItems(): LiminaCheckRunCheckItemSummary[] {
      return items.map((item) => ({ ...item }));
    },
    record(name) {
      const now = performance.now();
      const nextIssueCount = getIssueCount();
      const nextCheckCount = getCheckCount();
      const issues = Math.max(0, nextIssueCount - previousIssueCount);
      const total = Math.max(0, nextCheckCount - previousCheckCount);

      items.push(
        createCheckItemStats({
          durationMs: now - previousRecordTime,
          issues,
          name,
          total,
        }),
      );
      previousIssueCount = nextIssueCount;
      previousCheckCount = nextCheckCount;
      previousRecordTime = now;
    },
  };
}
