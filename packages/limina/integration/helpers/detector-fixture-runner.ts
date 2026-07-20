import { lstat } from 'node:fs/promises';
import path from 'node:path';

import {
  type CheckIssueSnapshot,
  getCheckIssueSnapshotPath,
} from '../../src/check-reporting/snapshot';
import { createDetectorInvocationEnvironment } from './detector-environment';
import type { DetectorFixtureCase } from './detector-fixture-discovery';
import {
  assertNoPreexistingCheckSnapshot,
  readDetectorCheckSnapshot,
} from './detector-snapshot';
import {
  applyFixtureSetup,
  assertTreeSnapshotUnchanged,
  captureTreeSnapshot,
  cleanupDetectorSandbox,
  copyFixtureRepository,
  createDetectorSandbox,
  DEFAULT_SANDBOX_IGNORED_PATH_PREFIXES,
  finishFixtureCleanup,
  pathExists,
  PRESERVE_INTEGRATION_ARTIFACTS_ENV,
} from './fixture-sandbox';
import { assertDetectorIssues } from './issue-assertions';
import { liminaBinPath, runLimina, type RunLiminaResult } from './run-limina';
import { createFixtureToolBridges } from './tool-bridge';

const OUTPUT_DIAGNOSTIC_LIMIT = 4000;

export interface DetectorFixtureRunResult {
  readonly cleaned: boolean;
  readonly cli: RunLiminaResult;
  readonly fixtureId: string;
  readonly preserved: boolean;
  readonly sandboxRoot: string;
  readonly snapshot: CheckIssueSnapshot;
  readonly snapshotPath: string;
}

export function assertExecutableDetectorFixtureKind(
  fixture: Pick<DetectorFixtureCase, 'definition' | 'id'>,
): void {
  if (fixture.definition.kind === 'fault-injection') {
    throw new Error(
      `Detector fixture ${fixture.id} uses fault-injection; harness v2 executes filesystem and external-tool fixtures only.`,
    );
  }
}

function formatUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function truncateOutput(value: string): string {
  if (value.length <= OUTPUT_DIAGNOSTIC_LIMIT) {
    return value;
  }

  return `${value.slice(0, OUTPUT_DIAGNOSTIC_LIMIT)}\n... truncated ${value.length - OUTPUT_DIAGNOSTIC_LIMIT} characters`;
}

function combineErrors(primary: unknown, secondary: unknown): Error {
  return new Error(
    `${formatUnknownError(primary)}\nAdditional invariant failure: ${formatUnknownError(secondary)}`,
    { cause: primary },
  );
}

function contextualizeFailure(options: {
  readonly casePath: string;
  readonly cli?: RunLiminaResult;
  readonly error: unknown;
  readonly fixtureId: string;
  readonly invocationArgs: readonly string[];
  readonly repoRoot: string;
  readonly sandboxRoot: string;
  readonly snapshotPath: string;
}): Error {
  return new Error(
    [
      `Detector fixture ${options.fixtureId} failed: ${formatUnknownError(options.error)}`,
      `case: ${options.casePath}`,
      `sandbox: ${options.sandboxRoot}`,
      `cwd: ${options.repoRoot}`,
      `executable: ${process.execPath}`,
      `argv: ${JSON.stringify([liminaBinPath, ...options.invocationArgs])}`,
      `exit code: ${String(options.cli?.code ?? 'unavailable')}`,
      `signal: ${String(options.cli?.signal ?? 'unavailable')}`,
      `timed out: ${String(options.cli?.timedOut ?? false)}`,
      `structured snapshot: ${options.snapshotPath}`,
      `${PRESERVE_INTEGRATION_ARTIFACTS_ENV}=1 preserves this sandbox for inspection.`,
      `stdout:\n${truncateOutput(options.cli?.stdout ?? '')}`,
      `stderr:\n${truncateOutput(options.cli?.stderr ?? '')}`,
    ].join('\n'),
    { cause: options.error },
  );
}

async function requireConfigFile(configPath: string, fixtureId: string) {
  const configStat = await lstat(configPath);
  if (!configStat.isFile() || configStat.isSymbolicLink()) {
    throw new Error(
      `Detector fixture ${fixtureId} must provide a real repo/limina.config.mts file: ${configPath}`,
    );
  }
}

function assertCliResult(options: {
  readonly expectedExitCode: number;
  readonly fixtureId: string;
  readonly result: RunLiminaResult;
}): void {
  if (options.result.timedOut) {
    throw new Error(`Detector fixture ${options.fixtureId} CLI timed out.`);
  }
  if (options.result.signal !== null) {
    throw new Error(
      `Detector fixture ${options.fixtureId} CLI terminated by signal ${options.result.signal}.`,
    );
  }
  if (options.result.code !== options.expectedExitCode) {
    throw new Error(
      `Detector fixture ${options.fixtureId} exit code mismatch: expected ${options.expectedExitCode}, received ${String(options.result.code)}.`,
    );
  }
}

function assertSnapshotOutcome(options: {
  readonly expectedExitCode: number;
  readonly fixtureId: string;
  readonly snapshot: CheckIssueSnapshot;
}): void {
  const runResult = options.snapshot.run?.result;
  if (options.expectedExitCode === 0 && runResult !== 'passed') {
    throw new Error(
      `Detector fixture ${options.fixtureId} exited successfully but structured run result is ${String(runResult)}.`,
    );
  }
  if (options.expectedExitCode !== 0 && runResult === 'passed') {
    throw new Error(
      `Detector fixture ${options.fixtureId} exited unsuccessfully but structured run result is passed.`,
    );
  }
}

export async function runDetectorFixture(
  fixture: DetectorFixtureCase,
): Promise<DetectorFixtureRunResult> {
  assertExecutableDetectorFixtureKind(fixture);
  if (fixture.definition.command[0] !== 'check') {
    throw new Error(
      `Detector fixture ${fixture.id} must use a formal snapshot-producing Limina check command.`,
    );
  }
  if ((fixture.definition.mutations?.length ?? 0) > 0) {
    throw new Error(
      `Detector fixture ${fixture.id} declares mutations, but multi-run mutation execution is not enabled in harness v2.`,
    );
  }

  const sourceBefore = await captureTreeSnapshot({
    rootDir: fixture.repoSourceRoot,
  });
  const sandbox = await createDetectorSandbox({ fixtureId: fixture.id });
  const configPath = path.join(sandbox.repoRoot, 'limina.config.mts');
  const invocationArgs = [
    '--config',
    configPath,
    ...fixture.definition.command,
  ];
  const snapshotPath = getCheckIssueSnapshotPath(sandbox.repoRoot);
  let cli: RunLiminaResult | undefined;
  let snapshot: CheckIssueSnapshot | undefined;
  let sandboxBefore:
    | Awaited<ReturnType<typeof captureTreeSnapshot>>
    | undefined;
  let primaryError: unknown;

  try {
    await copyFixtureRepository({
      destinationRoot: sandbox.repoRoot,
      policy: fixture.definition.copyPolicy,
      sourceRoot: fixture.repoSourceRoot,
    });
    await requireConfigFile(configPath, fixture.id);
    await applyFixtureSetup({
      fixtureId: fixture.id,
      operations: fixture.definition.setup ?? [],
      sandboxRoot: sandbox.sandboxRoot,
    });
    const toolBridges = await createFixtureToolBridges({
      fixtureId: fixture.id,
      repoRoot: sandbox.repoRoot,
      tools: fixture.definition.tools ?? [],
    });
    const environment = await createDetectorInvocationEnvironment({
      fixtureEnvironment: fixture.definition.environment,
      sandboxRoot: sandbox.sandboxRoot,
      toolBinDirectory: toolBridges.binDirectory,
    });
    sandboxBefore = await captureTreeSnapshot({
      ignoredPathPrefixes: DEFAULT_SANDBOX_IGNORED_PATH_PREFIXES,
      rootDir: sandbox.sandboxRoot,
    });
    await assertNoPreexistingCheckSnapshot(sandbox.repoRoot);
    const invocationStartedAtMs = Date.now();

    try {
      cli = await runLimina({
        args: invocationArgs,
        cwd: sandbox.repoRoot,
        env: environment,
        fixtureName: fixture.id,
        inheritParentEnv: false,
        timeout: 90_000,
      });
      assertCliResult({
        expectedExitCode: fixture.definition.expected.exitCode,
        fixtureId: fixture.id,
        result: cli,
      });
      snapshot = await readDetectorCheckSnapshot({
        command: fixture.definition.command,
        fixtureId: fixture.id,
        invocationStartedAtMs,
        repoRoot: sandbox.repoRoot,
      });
      assertSnapshotOutcome({
        expectedExitCode: fixture.definition.expected.exitCode,
        fixtureId: fixture.id,
        snapshot,
      });
      assertDetectorIssues({
        actualIssues: snapshot.issues,
        expected: fixture.definition.expected,
        fixtureId: fixture.id,
        repoRoot: sandbox.repoRoot,
      });
    } catch (error) {
      primaryError = error;
    }

    try {
      if (sandboxBefore) {
        const sandboxAfter = await captureTreeSnapshot({
          ignoredPathPrefixes: DEFAULT_SANDBOX_IGNORED_PATH_PREFIXES,
          rootDir: sandbox.sandboxRoot,
        });
        assertTreeSnapshotUnchanged({
          after: sandboxAfter,
          allowedAddedPaths: fixture.definition.allowedGeneratedPaths,
          before: sandboxBefore,
          label: `Detector fixture ${fixture.id} sandbox inputs`,
        });
      }
      const sourceAfter = await captureTreeSnapshot({
        rootDir: fixture.repoSourceRoot,
      });
      assertTreeSnapshotUnchanged({
        after: sourceAfter,
        before: sourceBefore,
        label: `Detector fixture ${fixture.id} source repo`,
      });
    } catch (error) {
      primaryError =
        primaryError === undefined ? error : combineErrors(primaryError, error);
    }

    if (primaryError !== undefined) {
      throw primaryError;
    }
    if (!cli || !snapshot || !(await pathExists(snapshotPath))) {
      throw new Error(
        `Detector fixture ${fixture.id} completed without a CLI result or structured snapshot.`,
      );
    }
  } catch (error) {
    primaryError = contextualizeFailure({
      casePath: fixture.casePath,
      cli,
      error,
      fixtureId: fixture.id,
      invocationArgs,
      repoRoot: sandbox.repoRoot,
      sandboxRoot: sandbox.sandboxRoot,
      snapshotPath,
    });
  }

  const preserved = process.env[PRESERVE_INTEGRATION_ARTIFACTS_ENV] === '1';
  let cleaned = false;
  await finishFixtureCleanup({
    cleanup: async () => {
      cleaned = await cleanupDetectorSandbox({
        preserve: preserved,
        sandboxRoot: sandbox.sandboxRoot,
        tempRoot: sandbox.tempRoot,
      });
      if (preserved) {
        console.info(
          `Detector fixture ${fixture.id} artifact preserved at ${sandbox.sandboxRoot}`,
        );
      }
    },
    primaryError,
  });

  return {
    cleaned,
    cli: cli!,
    fixtureId: fixture.id,
    preserved,
    sandboxRoot: sandbox.sandboxRoot,
    snapshot: snapshot!,
    snapshotPath,
  };
}
