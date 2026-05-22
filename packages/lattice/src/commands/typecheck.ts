import { createElapsedTimer } from '@docs-islands/logger/helper';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import path from 'node:path';
import { getCheckerAdapter } from '../checkers';
import {
  getActiveCheckers,
  type CheckerExecutionKind,
  type ResolvedCheckerConfig,
  type ResolvedLatticeConfig,
} from '../config';
import type { LatticeFlowReporter, LatticeFlowTask } from '../flow';
import { TypecheckLogger, clearCliScreen, formatErrorMessage } from '../logger';
import {
  collectGraphProjectRouteFromRoot,
  getDtsCompanionConfigPath,
  isDtsConfigPath,
  resolveProjectConfigPath,
} from '../tsconfig';
import { normalizeAbsolutePath, toRelativePath } from '../utils/path';

export interface TypecheckTarget {
  args: string[];
  checkerName?: string;
  configPath: string;
  cwd: string;
  command: string;
  executionKind?: CheckerExecutionKind;
  label?: string;
}

export interface TypecheckTargetResult {
  configPath: string;
  error?: Error;
  status: number;
}

export type TypecheckRunner = (
  target: TypecheckTarget,
) => Promise<TypecheckTargetResult> | TypecheckTargetResult;

export interface RunCheckerTypecheckOptions {
  clearScreen?: boolean;
  config: ResolvedLatticeConfig;
  concurrency?: number;
  cwd?: string;
  flow?: LatticeFlowReporter;
  flowDepth?: number;
  runner?: TypecheckRunner;
  tscCommand?: string;
}

export interface RunCheckerTypecheckResult {
  passed: boolean;
  projectRootDir: string;
  results: TypecheckTargetResult[];
  rootConfigPaths: string[];
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

function getExecutionCheckers(options: {
  config: ResolvedLatticeConfig;
  executionKind: CheckerExecutionKind;
}): ResolvedCheckerConfig[] {
  return getActiveCheckers(options.config).filter((checker) => {
    const adapter = getCheckerAdapter(checker.preset);

    return adapter?.supportedExecutions.includes(options.executionKind);
  });
}

function createCheckerTarget(options: {
  checker: ResolvedCheckerConfig;
  commandOverride?: string;
  configPath: string;
  executionKind: CheckerExecutionKind;
  projectRootDir: string;
}): TypecheckTarget {
  const adapter = getCheckerAdapter(options.checker.preset);

  if (!adapter) {
    throw new Error(
      `Checker "${options.checker.name}" uses unsupported preset "${options.checker.preset}".`,
    );
  }

  const commandTarget = adapter.createCommandTarget(options);

  return {
    ...commandTarget,
    checkerName: options.checker.name,
    configPath: options.configPath,
    cwd: options.projectRootDir,
    executionKind: options.executionKind,
  };
}

function collectCompanionTypecheckTargets(options: {
  checker: ResolvedCheckerConfig;
  projectRootDir: string;
}): {
  entryConfigPath: string;
  problems: string[];
  targetProjectPaths: string[];
} {
  const entryConfigPath = resolveProjectConfigPath(
    options.projectRootDir,
    options.checker.entry,
  );

  if (!existsSync(entryConfigPath)) {
    return {
      entryConfigPath,
      problems: [
        [
          'Checker entry references a missing tsconfig:',
          `  checker: ${options.checker.name}`,
          `  config: ${toRelativePath(options.projectRootDir, entryConfigPath)}`,
        ].join('\n'),
      ],
      targetProjectPaths: [],
    };
  }

  const routeCollection = collectGraphProjectRouteFromRoot({
    rootConfigPath: entryConfigPath,
    rootDir: options.projectRootDir,
  });
  const dtsConfigPaths = routeCollection.projectPaths.filter(isDtsConfigPath);
  const targetProjectPaths = [
    ...new Set(dtsConfigPaths.map(getDtsCompanionConfigPath)),
  ].sort();
  const problems = [...routeCollection.problems];

  if (dtsConfigPaths.length === 0) {
    problems.push(
      [
        'Checker entry has no declaration leaf targets:',
        `  checker: ${options.checker.name}`,
        `  entry: ${toRelativePath(options.projectRootDir, entryConfigPath)}`,
        '  reason: checker:typecheck derives targets from tsconfig*.dts.json leaves reachable from the checker entry.',
      ].join('\n'),
    );
  }

  for (const configPath of targetProjectPaths) {
    if (existsSync(configPath)) {
      continue;
    }

    problems.push(
      [
        'DTS leaf companion config is missing:',
        `  checker: ${options.checker.name}`,
        `  expected: ${toRelativePath(options.projectRootDir, configPath)}`,
        '  reason: checker:typecheck runs the strict local tsconfig companion for each reachable declaration leaf.',
      ].join('\n'),
    );
  }

  return {
    entryConfigPath,
    problems,
    targetProjectPaths,
  };
}

function createDefaultRunner(): TypecheckRunner {
  return async (target) =>
    await new Promise<TypecheckTargetResult>((resolve) => {
      const child = spawn(target.command, target.args, {
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

async function runCheckerTypecheckInternal(
  options: RunCheckerTypecheckOptions,
): Promise<RunCheckerTypecheckResult> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const projectRootDir = normalizeAbsolutePath(options.config.rootDir);
  const checkers = getExecutionCheckers({
    config: options.config,
    executionKind: 'typecheck',
  });
  const flowDepth = options.flowDepth ?? 0;

  const concurrency = normalizeConcurrency(options.concurrency);
  const problems: string[] = [];
  const rootConfigPaths: string[] = [];
  const targetProjectPaths: string[] = [];
  const targets: TypecheckTarget[] = [];

  if (checkers.length === 0) {
    problems.push(
      [
        'No checker typecheck entries configured:',
        '  reason: configure config.checkers.<name>.entry with a preset that supports checker:typecheck.',
      ].join('\n'),
    );
  }

  for (const checker of checkers) {
    const targetCollection = collectCompanionTypecheckTargets({
      checker,
      projectRootDir,
    });

    problems.push(...targetCollection.problems);
    rootConfigPaths.push(targetCollection.entryConfigPath);
    targetProjectPaths.push(...targetCollection.targetProjectPaths);
    targets.push(
      ...targetCollection.targetProjectPaths.map((configPath) =>
        createCheckerTarget({
          checker,
          commandOverride: options.tscCommand,
          configPath,
          executionKind: 'typecheck',
          projectRootDir,
        }),
      ),
    );
  }

  if (problems.length > 0) {
    options.flow?.fail('typecheck target discovery failed', {
      depth: flowDepth + 1,
    });
    TypecheckLogger.error(problems.join('\n\n'));

    return {
      passed: false,
      projectRootDir,
      results: [],
      rootConfigPaths,
      targetProjectPaths,
    };
  }

  options.flow?.info(
    `found ${targets.length} typecheck target config(s) across ${checkers.length} checker(s); concurrency ${concurrency}`,
    {
      depth: flowDepth + 1,
    },
  );

  TypecheckLogger.info(
    [
      `Running checker typechecks for ${targets.length} target config(s).`,
      `CWD: ${toRelativePath(cwd, projectRootDir)}`,
      `Entries: ${rootConfigPaths
        .map((configPath) => toRelativePath(projectRootDir, configPath))
        .join(', ')}`,
    ].join('\n'),
  );

  const targetTasks = new Map<string, LatticeFlowTask>();

  const results = await runWithConcurrency(
    targets,
    concurrency,
    options.runner ?? createDefaultRunner(),
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
            target.label ??
              `checker: ${toRelativePath(projectRootDir, target.configPath)}`,
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
        `Checked ${targets.length} typecheck target config(s) from ${rootConfigPaths.length} checker entry(s).`,
      );
    }
  }

  return {
    passed: failedResults.length === 0,
    projectRootDir,
    results,
    rootConfigPaths,
    targetProjectPaths,
  };
}

export async function runCheckerTypecheck(
  options: RunCheckerTypecheckOptions,
): Promise<RunCheckerTypecheckResult> {
  if (options.clearScreen ?? true) {
    clearCliScreen();
  }

  const elapsed = createElapsedTimer();
  const task = options.flow?.start('checker typecheck', {
    depth: options.flowDepth ?? 0,
  });

  TypecheckLogger.info('checker typecheck started');

  try {
    const result = await runCheckerTypecheckInternal(options);

    if (result.passed) {
      if (!options.flow?.interactive) {
        TypecheckLogger.success('checker typecheck finished', elapsed());
      }

      task?.pass();
    } else {
      TypecheckLogger.error(
        'checker typecheck finished with failures',
        elapsed(),
      );
      task?.fail('checker typecheck finished with failures');
    }

    return result;
  } catch (error) {
    TypecheckLogger.error(
      `checker typecheck failed: ${formatErrorMessage(error)}`,
      elapsed(),
    );
    task?.fail('checker typecheck failed', { error });
    throw error;
  }
}

export interface RunCheckerBuildOptions {
  clearScreen?: boolean;
  config: ResolvedLatticeConfig;
  cwd?: string;
  flow?: LatticeFlowReporter;
  flowDepth?: number;
  runner?: TypecheckRunner;
  tscCommand?: string;
}

export interface RunCheckerBuildResult {
  passed: boolean;
  projectRootDir: string;
  rootConfigPaths: string[];
}

async function runCheckerBuildInternal(
  options: RunCheckerBuildOptions,
): Promise<RunCheckerBuildResult> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const projectRootDir = normalizeAbsolutePath(options.config.rootDir);
  const checkers = getExecutionCheckers({
    config: options.config,
    executionKind: 'build',
  });
  const flowDepth = options.flowDepth ?? 0;
  const rootConfigPaths: string[] = [];
  const targets = checkers.flatMap((checker) => {
    const configPath = resolveProjectConfigPath(projectRootDir, checker.entry);

    rootConfigPaths.push(configPath);

    return [
      createCheckerTarget({
        checker,
        commandOverride: options.tscCommand,
        configPath,
        executionKind: 'build',
        projectRootDir,
      }),
    ];
  });

  options.flow?.info(`found ${targets.length} checker build entry(s)`, {
    depth: flowDepth + 1,
  });

  TypecheckLogger.info(
    [
      `Running build checks for ${targets.length} checker entry(s).`,
      `CWD: ${toRelativePath(cwd, projectRootDir)}`,
      `Entries: ${rootConfigPaths
        .map((configPath) => toRelativePath(projectRootDir, configPath))
        .join(', ')}`,
    ].join('\n'),
  );

  const targetTasks = new Map<string, LatticeFlowTask>();
  const results = await runWithConcurrency(
    targets,
    1,
    options.runner ?? createDefaultRunner(),
    {
      onTargetResult: (target, result) => {
        const task = targetTasks.get(target.configPath);

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
            target.label ??
              `checker build: ${toRelativePath(projectRootDir, target.configPath)}`,
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
  const passed = failedResults.length === 0;

  if (!passed) {
    TypecheckLogger.error(
      [
        'build checks failed:',
        ...failedResults.map((result) => {
          const suffix = result.error
            ? `: ${formatErrorMessage(result.error)}`
            : ` exited with code ${result.status}`;

          return `  ${toRelativePath(projectRootDir, result.configPath)}${suffix}`;
        }),
      ].join('\n'),
    );
  } else if (!options.flow?.interactive) {
    TypecheckLogger.success(
      `Checked ${targets.length} checker build entry(s).`,
    );
  }

  return {
    passed,
    projectRootDir,
    rootConfigPaths,
  };
}

export async function runCheckerBuild(
  options: RunCheckerBuildOptions,
): Promise<RunCheckerBuildResult> {
  if (options.clearScreen ?? true) {
    clearCliScreen();
  }

  const elapsed = createElapsedTimer();
  const task = options.flow?.start('checker build', {
    depth: options.flowDepth ?? 0,
  });

  TypecheckLogger.info('checker build started');

  try {
    const result = await runCheckerBuildInternal(options);

    if (result.passed) {
      if (!options.flow?.interactive) {
        TypecheckLogger.success('checker build finished', elapsed());
      }

      task?.pass();
    } else {
      TypecheckLogger.error('checker build finished with failures', elapsed());
      task?.fail('checker build finished with failures');
    }

    return result;
  } catch (error) {
    TypecheckLogger.error(
      `checker build failed: ${formatErrorMessage(error)}`,
      elapsed(),
    );
    task?.fail('checker build failed', { error });
    throw error;
  }
}
