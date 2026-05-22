import { createElapsedTimer } from '@docs-islands/logger/helper';
import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
import path from 'node:path';
import { getCheckerAdapter } from '../checkers';
import {
  getActiveCheckers,
  type CheckerRouteKind,
  type ResolvedCheckerConfig,
  type ResolvedLatticeConfig,
} from '../config';
import type { LatticeFlowReporter, LatticeFlowTask } from '../flow';
import { TypecheckLogger, clearCliScreen, formatErrorMessage } from '../logger';
import {
  collectTypecheckTargetProjectPaths,
  resolveProjectConfigPath,
} from '../tsconfig';
import { normalizeAbsolutePath, toRelativePath } from '../utils/path';

export interface TypecheckTarget {
  args: string[];
  checkerName?: string;
  configPath: string;
  cwd: string;
  command: string;
  label?: string;
  routeKind?: CheckerRouteKind;
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

function getRouteCheckers(options: {
  config: ResolvedLatticeConfig;
  routeKind: CheckerRouteKind;
}): ResolvedCheckerConfig[] {
  return getActiveCheckers(options.config).filter(
    (checker) => checker.routes[options.routeKind] !== undefined,
  );
}

function resolveRouteConfigPath(rootDir: string, route: string): string {
  return resolveProjectConfigPath(rootDir, route);
}

function createCheckerTarget(options: {
  checker: ResolvedCheckerConfig;
  commandOverride?: string;
  configPath: string;
  projectRootDir: string;
  routeKind: CheckerRouteKind;
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
    routeKind: options.routeKind,
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
  const checkers = getRouteCheckers({
    config: options.config,
    routeKind: 'typecheck',
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
        'No checker typecheck routes configured:',
        '  reason: configure config.checkers.<name>.routes.typecheck before running checker:typecheck.',
      ].join('\n'),
    );
  }

  for (const checker of checkers) {
    const route = checker.routes.typecheck;

    if (!route) {
      continue;
    }

    const checkerRootConfigPath = resolveRouteConfigPath(projectRootDir, route);
    const adapter = getCheckerAdapter(checker.preset);

    rootConfigPaths.push(checkerRootConfigPath);

    if (adapter?.typecheckDiscovery === 'references') {
      const routeCollection = collectTypecheckTargetProjectPaths({
        rootConfigPath: checkerRootConfigPath,
        rootDir: projectRootDir,
      });

      problems.push(...routeCollection.problems);
      targetProjectPaths.push(...routeCollection.targetProjectPaths);
      targets.push(
        ...routeCollection.targetProjectPaths.map((configPath) =>
          createCheckerTarget({
            checker,
            commandOverride: options.tscCommand,
            configPath,
            projectRootDir,
            routeKind: 'typecheck',
          }),
        ),
      );
      continue;
    }

    targetProjectPaths.push(checkerRootConfigPath);
    targets.push(
      createCheckerTarget({
        checker,
        configPath: checkerRootConfigPath,
        projectRootDir,
        routeKind: 'typecheck',
      }),
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
      `Routes: ${rootConfigPaths
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
        `Checked ${targets.length} typecheck target config(s) from ${rootConfigPaths.length} checker route(s).`,
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
  const checkers = getRouteCheckers({
    config: options.config,
    routeKind: 'build',
  });
  const flowDepth = options.flowDepth ?? 0;
  const rootConfigPaths: string[] = [];
  const targets = checkers.flatMap((checker) => {
    const route = checker.routes.build;

    if (!route) {
      return [];
    }

    const configPath = resolveRouteConfigPath(projectRootDir, route);

    rootConfigPaths.push(configPath);

    return [
      createCheckerTarget({
        checker,
        commandOverride: options.tscCommand,
        configPath,
        projectRootDir,
        routeKind: 'build',
      }),
    ];
  });

  options.flow?.info(`found ${targets.length} build graph root(s)`, {
    depth: flowDepth + 1,
  });

  TypecheckLogger.info(
    [
      `Running build checks for ${targets.length} graph root(s).`,
      `CWD: ${toRelativePath(cwd, projectRootDir)}`,
      `Routes: ${rootConfigPaths
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
    TypecheckLogger.success(`Checked ${targets.length} build graph root(s).`);
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
