import { createElapsedTimer } from '@docs-islands/logger/helper';
import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
import path from 'node:path';
import { TypecheckLogger, clearCliScreen, formatErrorMessage } from '../logger';
import {
  collectTypecheckTargetProjectPaths,
  resolveProjectConfigPath,
} from '../tsconfig';
import { normalizeAbsolutePath, toRelativePath } from '../utils/path';

export interface TypecheckTarget {
  args: string[];
  configPath: string;
  cwd: string;
  command: string;
}

export interface TypecheckTargetResult {
  configPath: string;
  error?: Error;
  status: number;
}

export type TypecheckRunner = (
  target: TypecheckTarget,
) => Promise<TypecheckTargetResult> | TypecheckTargetResult;

export interface RunTypecheckOptions {
  concurrency?: number;
  cwd?: string;
  project?: string;
  runner?: TypecheckRunner;
  tscCommand?: string;
}

export interface RunTypecheckResult {
  passed: boolean;
  projectRootDir: string;
  results: TypecheckTargetResult[];
  rootConfigPath: string;
  targetProjectPaths: string[];
}

function normalizeConcurrency(value: number | undefined): number {
  if (value === undefined) {
    return Math.max(1, availableParallelism());
  }

  if (!Number.isInteger(value) || value < 1) {
    throw new Error('Typecheck concurrency must be a positive integer.');
  }

  return value;
}

function createDefaultRunner(command: string): TypecheckRunner {
  return async (target) =>
    await new Promise<TypecheckTargetResult>((resolve) => {
      const child = spawn(command, target.args, {
        cwd: target.cwd,
        shell: process.platform === 'win32',
        stdio: 'inherit',
      });

      child.on('error', (error) => {
        resolve({
          configPath: target.configPath,
          error,
          status: 1,
        });
      });

      child.on('close', (code) => {
        resolve({
          configPath: target.configPath,
          status: code ?? 1,
        });
      });
    });
}

async function runWithConcurrency(
  targets: TypecheckTarget[],
  concurrency: number,
  runner: TypecheckRunner,
): Promise<TypecheckTargetResult[]> {
  const results = new Array<TypecheckTargetResult>(targets.length);
  let nextIndex = 0;

  await Promise.all(
    Array.from({
      length: Math.min(concurrency, targets.length),
    }).map(async () => {
      for (;;) {
        const targetIndex = nextIndex;
        nextIndex += 1;

        if (targetIndex >= targets.length) {
          return;
        }

        try {
          results[targetIndex] = await runner(targets[targetIndex]);
        } catch (error) {
          results[targetIndex] = {
            configPath: targets[targetIndex].configPath,
            error: error instanceof Error ? error : new Error(String(error)),
            status: 1,
          };
        }
      }
    }),
  );

  return results;
}

async function runTypecheckInternal(
  options: RunTypecheckOptions = {},
): Promise<RunTypecheckResult> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const projectRootDir = normalizeAbsolutePath(cwd);
  const rootConfigPath = resolveProjectConfigPath(cwd, options.project);

  const route = collectTypecheckTargetProjectPaths({
    rootConfigPath,
    rootDir: projectRootDir,
  });

  if (route.problems.length > 0) {
    TypecheckLogger.error(route.problems.join('\n\n'));

    return {
      passed: false,
      projectRootDir,
      results: [],
      rootConfigPath,
      targetProjectPaths: route.targetProjectPaths,
    };
  }

  const concurrency = normalizeConcurrency(options.concurrency);
  const command = options.tscCommand ?? 'tsc';
  const targets = route.targetProjectPaths.map((configPath) => ({
    args: ['-p', toRelativePath(projectRootDir, configPath), '--noEmit'],
    command,
    configPath,
    cwd: projectRootDir,
  }));

  TypecheckLogger.info(
    [
      `Running tsc for ${targets.length} typecheck target config(s).`,
      `CWD: ${toRelativePath(cwd, projectRootDir)}`,
      `Project: ${toRelativePath(projectRootDir, rootConfigPath)}`,
    ].join('\n'),
  );

  const results = await runWithConcurrency(
    targets,
    concurrency,
    options.runner ?? createDefaultRunner(command),
  );
  const failedResults = results.filter((result) => result.status !== 0);

  if (failedResults.length > 0) {
    TypecheckLogger.error(
      [
        `Typecheck failed for ${failedResults.length} config(s):`,
        ...failedResults.map((result) => {
          const suffix = result.error
            ? `: ${formatErrorMessage(result.error)}`
            : ` exited with code ${result.status}`;

          return `  ${toRelativePath(
            projectRootDir,
            result.configPath,
          )}${suffix}`;
        }),
      ].join('\n'),
    );
  } else {
    TypecheckLogger.success(
      `Checked ${targets.length} typecheck target config(s) from ${toRelativePath(
        projectRootDir,
        rootConfigPath,
      )}.`,
    );
  }

  return {
    passed: failedResults.length === 0,
    projectRootDir,
    results,
    rootConfigPath,
    targetProjectPaths: route.targetProjectPaths,
  };
}

export async function runTypecheck(
  options: RunTypecheckOptions = {},
): Promise<RunTypecheckResult> {
  clearCliScreen();

  const elapsed = createElapsedTimer();

  TypecheckLogger.info('tsc check started');

  try {
    const result = await runTypecheckInternal(options);

    if (result.passed) {
      TypecheckLogger.success('tsc check finished', elapsed());
    } else {
      TypecheckLogger.error('tsc check finished with failures', elapsed());
    }

    return result;
  } catch (error) {
    TypecheckLogger.error(
      `tsc check failed: ${formatErrorMessage(error)}`,
      elapsed(),
    );
    throw error;
  }
}
