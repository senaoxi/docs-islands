import { createElapsedTimer } from '@docs-islands/logger/helper';
import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
import path from 'node:path';
import type { LatticeFlowReporter, LatticeFlowTask } from '../flow';
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
  clearScreen?: boolean;
  concurrency?: number;
  cwd?: string;
  flow?: LatticeFlowReporter;
  flowDepth?: number;
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
  options: {
    onTargetResult?: (
      target: TypecheckTarget,
      result: TypecheckTargetResult,
    ) => void;
    onTargetStart?: (target: TypecheckTarget) => void;
  } = {},
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
          const target = targets[targetIndex];

          options.onTargetStart?.(target);
          results[targetIndex] = await runner(target);
          options.onTargetResult?.(target, results[targetIndex]);
        } catch (error) {
          const target = targets[targetIndex];

          results[targetIndex] = {
            configPath: target.configPath,
            error: error instanceof Error ? error : new Error(String(error)),
            status: 1,
          };
          options.onTargetResult?.(target, results[targetIndex]);
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
  const flowDepth = options.flowDepth ?? 0;

  const route = collectTypecheckTargetProjectPaths({
    rootConfigPath,
    rootDir: projectRootDir,
  });

  if (route.problems.length > 0) {
    options.flow?.fail('typecheck target discovery failed', {
      depth: flowDepth + 1,
    });
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

  options.flow?.info(
    `found ${targets.length} typecheck target config(s); concurrency ${concurrency}`,
    {
      depth: flowDepth + 1,
    },
  );

  TypecheckLogger.info(
    [
      `Running tsc for ${targets.length} typecheck target config(s).`,
      `CWD: ${toRelativePath(cwd, projectRootDir)}`,
      `Project: ${toRelativePath(projectRootDir, rootConfigPath)}`,
    ].join('\n'),
  );

  const targetTasks = new Map<string, LatticeFlowTask>();

  const results = await runWithConcurrency(
    targets,
    concurrency,
    options.runner ?? createDefaultRunner(command),
    {
      onTargetResult: (_target, result) => {
        const task = targetTasks.get(result.configPath);

        if (!task) {
          return;
        }

        if (result.status === 0) {
          task.pass();
        } else {
          const suffix = result.error
            ? formatErrorMessage(result.error)
            : `exited with code ${result.status}`;

          task.fail(undefined, { error: suffix });
        }
      },
      onTargetStart: (target) => {
        if (!options.flow) {
          return;
        }

        targetTasks.set(
          target.configPath,
          options.flow.start(
            `tsc: ${toRelativePath(projectRootDir, target.configPath)}`,
            {
              collapseOnSuccess: false,
              depth: flowDepth + 1,
            },
          ),
        );
      },
    },
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
    if (!options.flow?.interactive) {
      TypecheckLogger.success(
        `Checked ${targets.length} typecheck target config(s) from ${toRelativePath(
          projectRootDir,
          rootConfigPath,
        )}.`,
      );
    }
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
  if (options.clearScreen ?? true) {
    clearCliScreen();
  }

  const elapsed = createElapsedTimer();
  const task = options.flow?.start('tsc check', {
    depth: options.flowDepth ?? 0,
  });

  TypecheckLogger.info('tsc check started');

  try {
    const result = await runTypecheckInternal(options);

    if (result.passed) {
      if (!options.flow?.interactive) {
        TypecheckLogger.success('tsc check finished', elapsed());
      }

      task?.pass();
    } else {
      TypecheckLogger.error('tsc check finished with failures', elapsed());
      task?.fail('tsc check finished with failures');
    }

    return result;
  } catch (error) {
    TypecheckLogger.error(
      `tsc check failed: ${formatErrorMessage(error)}`,
      elapsed(),
    );
    task?.fail('tsc check failed', { error });
    throw error;
  }
}

export interface RunTscBuildOptions {
  clearScreen?: boolean;
  cwd?: string;
  flow?: LatticeFlowReporter;
  flowDepth?: number;
  project?: string;
  tscCommand?: string;
}

export interface RunTscBuildResult {
  passed: boolean;
  projectRootDir: string;
  rootConfigPath: string;
}

async function runTscBuildInternal(
  options: RunTscBuildOptions = {},
): Promise<RunTscBuildResult> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const projectRootDir = normalizeAbsolutePath(cwd);
  const rootConfigPath = resolveProjectConfigPath(
    cwd,
    options.project ?? 'tsconfig.graph.json',
  );
  const flowDepth = options.flowDepth ?? 0;
  const command = options.tscCommand ?? 'tsc';
  const relativeRootConfigPath = toRelativePath(projectRootDir, rootConfigPath);
  const args = ['-b', relativeRootConfigPath, '--pretty', 'false'];

  options.flow?.info(
    `found 1 build graph root; running tsc -b ${relativeRootConfigPath}`,
    {
      depth: flowDepth + 1,
    },
  );

  TypecheckLogger.info(
    [
      `Running tsc -b for ${relativeRootConfigPath}.`,
      `CWD: ${toRelativePath(cwd, projectRootDir)}`,
      `Project: ${relativeRootConfigPath}`,
    ].join('\n'),
  );

  const task = options.flow?.start(`tsc -b ${relativeRootConfigPath}`, {
    collapseOnSuccess: false,
    depth: flowDepth + 1,
  });

  const result = await new Promise<{ error?: Error; status: number }>(
    (resolve) => {
      const child = spawn(command, args, {
        cwd: projectRootDir,
        shell: process.platform === 'win32',
        stdio: 'inherit',
      });

      child.on('error', (error) => {
        resolve({ error, status: 1 });
      });

      child.on('close', (code) => {
        resolve({ status: code ?? 1 });
      });
    },
  );

  const passed = result.status === 0;

  if (passed) {
    task?.pass();
  } else {
    const suffix = result.error
      ? formatErrorMessage(result.error)
      : `exited with code ${result.status}`;

    task?.fail(undefined, { error: suffix });
  }

  if (!passed) {
    TypecheckLogger.error(
      [
        'tsc -b failed:',
        `  ${relativeRootConfigPath}${
          result.error
            ? `: ${formatErrorMessage(result.error)}`
            : ` exited with code ${result.status}`
        }`,
      ].join('\n'),
    );
  } else if (!options.flow?.interactive) {
    TypecheckLogger.success(
      `Checked build graph at ${relativeRootConfigPath}.`,
    );
  }

  return {
    passed,
    projectRootDir,
    rootConfigPath,
  };
}

export async function runTscBuild(
  options: RunTscBuildOptions = {},
): Promise<RunTscBuildResult> {
  if (options.clearScreen ?? true) {
    clearCliScreen();
  }

  const elapsed = createElapsedTimer();
  const task = options.flow?.start('tsc build', {
    depth: options.flowDepth ?? 0,
  });

  TypecheckLogger.info('tsc build started');

  try {
    const result = await runTscBuildInternal(options);

    if (result.passed) {
      if (!options.flow?.interactive) {
        TypecheckLogger.success('tsc build finished', elapsed());
      }

      task?.pass();
    } else {
      TypecheckLogger.error('tsc build finished with failures', elapsed());
      task?.fail('tsc build finished with failures');
    }

    return result;
  } catch (error) {
    TypecheckLogger.error(
      `tsc build failed: ${formatErrorMessage(error)}`,
      elapsed(),
    );
    task?.fail('tsc build failed', { error });
    throw error;
  }
}
