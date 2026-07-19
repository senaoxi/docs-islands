import { lstat, readFile } from 'node:fs/promises';

import {
  type CheckIssueSnapshot,
  getCheckIssueSnapshotPath,
  readCheckIssueSnapshot,
} from '../../src/check-reporting/snapshot';
import { pathExists } from './fixture-sandbox';

export async function assertNoPreexistingCheckSnapshot(
  repoRoot: string,
): Promise<string> {
  const snapshotPath = getCheckIssueSnapshotPath(repoRoot);
  if (await pathExists(snapshotPath)) {
    throw new Error(
      `Detector fixture sandbox contains a stale structured snapshot before invocation: ${snapshotPath}`,
    );
  }

  return snapshotPath;
}

export async function readDetectorCheckSnapshot(options: {
  readonly command: readonly string[];
  readonly fixtureId: string;
  readonly invocationStartedAtMs: number;
  readonly repoRoot: string;
}): Promise<CheckIssueSnapshot> {
  const snapshotPath = getCheckIssueSnapshotPath(options.repoRoot);
  if (!(await pathExists(snapshotPath))) {
    throw new Error(
      `Detector fixture ${options.fixtureId} did not produce structured snapshot ${snapshotPath}.`,
    );
  }

  const snapshotText = await readFile(snapshotPath, 'utf8');
  try {
    JSON.parse(snapshotText);
  } catch (error) {
    throw new Error(
      `Detector fixture ${options.fixtureId} produced invalid JSON at ${snapshotPath}.`,
      { cause: error },
    );
  }

  const snapshot = await readCheckIssueSnapshot(options.repoRoot);
  if (!snapshot) {
    throw new Error(
      `Detector fixture ${options.fixtureId} produced a snapshot that does not satisfy the formal current check schema at ${snapshotPath}.`,
    );
  }
  if (snapshot.status !== 'completed' || !snapshot.run) {
    throw new Error(
      `Detector fixture ${options.fixtureId} structured snapshot is not a completed check run: ${snapshotPath}.`,
    );
  }

  const expectedCommand = `limina ${options.command.join(' ')}`;
  if (
    snapshot.command !== expectedCommand ||
    snapshot.run.command !== expectedCommand
  ) {
    throw new Error(
      `Detector fixture ${options.fixtureId} snapshot command mismatch at ${snapshotPath}: expected ${JSON.stringify(expectedCommand)}, received snapshot=${JSON.stringify(snapshot.command)} run=${JSON.stringify(snapshot.run.command)}.`,
    );
  }

  const createdAtMs = Date.parse(snapshot.createdAt);
  const snapshotStat = await lstat(snapshotPath);
  if (
    !Number.isFinite(createdAtMs) ||
    createdAtMs < options.invocationStartedAtMs - 1000 ||
    snapshotStat.mtimeMs < options.invocationStartedAtMs - 1000
  ) {
    throw new Error(
      `Detector fixture ${options.fixtureId} structured snapshot is stale: ${snapshotPath}.`,
    );
  }

  return snapshot;
}
