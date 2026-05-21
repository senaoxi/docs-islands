import { createElapsedTimer } from '@docs-islands/logger/helper';
import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
import path from 'node:path';
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

export interface RunTypecheckOptions {
  clearScreen?: boolean;
  config?: ResolvedLatticeConfig;
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

function createSyntheticTypeScriptChecker(
  route: string,
): ResolvedCheckerConfig {
  return {
    extensions: [
      '.d.cts',
      '.d.mts',
      '.d.ts',
      '.cts',
      '.json',
      '.mts',
      '.tsx',
      '.ts',
    ],
    name: 'typescript',
    preset: 'tsc',
    routes: {
      typecheck: route,
      build: route,
    },
  };
}

function getRouteCheckers(options: {
  config?: ResolvedLatticeConfig;
  project?: string;
  routeKind: CheckerRouteKind;
}): ResolvedCheckerConfig[] {
  if (options.project) {
    return [createSyntheticTypeScriptChecker(options.project)];
  }

  if (options.config) {
    return getActiveCheckers(options.config).filter(
      (checker) => checker.routes[options.routeKind] !== undefined,
    );
  }

  return [createSyntheticTypeScriptChecker('tsconfig.json')];
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
  const relativeConfigPath = toRelativePath(
    options.projectRootDir,
    options.configPath,
  );

  if (options.checker.preset === 'tsc') {
    return {
      args:
        options.routeKind === 'build'
          ? ['-b', relativeConfigPath, '--pretty', 'false']
          : ['-p', relativeConfigPath, '--noEmit'],
      checkerName: options.checker.name,
      command: options.commandOverride ?? 'tsc',
      configPath: options.configPath,
      cwd: options.projectRootDir,
      label:
        options.routeKind === 'build'
          ? `tsc -b ${relativeConfigPath}`
          : `tsc: ${relativeConfigPath}`,
      routeKind: options.routeKind,
    };
  }

  if (options.checker.preset === 'vue-tsc') {
    return {
      args:
        options.routeKind === 'build'
          ? ['-b', relativeConfigPath, '--pretty', 'false']
          : ['-p', relativeConfigPath, '--noEmit'],
      checkerName: options.checker.name,
      command: 'vue-tsc',
      configPath: options.configPath,
      cwd: options.projectRootDir,
      label:
        options.routeKind === 'build'
          ? `${options.checker.name}: vue-tsc -b ${relativeConfigPath}`
          : `${options.checker.name}: vue-tsc -p ${relativeConfigPath}`,
      routeKind: options.routeKind,
    };
  }

  if (options.checker.preset === 'svelte-check') {
    if (options.routeKind === 'build') {
      throw new Error(
        `Checker "${options.checker.name}" uses svelte-check, which does not support routes.build.`,
      );
    }

    return {
      args: ['--tsconfig', relativeConfigPath],
      checkerName: options.checker.name,
      command: 'svelte-check',
      configPath: options.configPath,
      cwd: options.projectRootDir,
      label: `${options.checker.name}: svelte-check --tsconfig ${relativeConfigPath}`,
      routeKind: options.routeKind,
    };
  }

  throw new Error(
    `Checker "${options.checker.name}" uses unsupported preset "${options.checker.preset}".`,
  );
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

async function runTypecheckInternal(
  options: RunTypecheckOptions = {},
): Promise<RunTypecheckResult> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const projectRootDir = normalizeAbsolutePath(options.config?.rootDir ?? cwd);
  const checkers = getRouteCheckers({
    config: options.config,
    project: options.project,
    routeKind: 'typecheck',
  });
  const rootRoute =
    options.project ??
    checkers.find((checker) => checker.preset === 'tsc')?.routes.typecheck ??
    checkers[0]?.routes.typecheck;
  const rootConfigPath = resolveProjectConfigPath(projectRootDir, rootRoute);
  const flowDepth = options.flowDepth ?? 0;

  const concurrency = normalizeConcurrency(options.concurrency);
  const problems: string[] = [];
  const targetProjectPaths: string[] = [];
  const targets: TypecheckTarget[] = [];

  for (const checker of checkers) {
    const route = checker.routes.typecheck;

    if (!route) {
      continue;
    }

    const checkerRootConfigPath = resolveRouteConfigPath(projectRootDir, route);

    if (checker.preset === 'tsc') {
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
      rootConfigPath,
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
      `Project: ${toRelativePath(projectRootDir, rootConfigPath)}`,
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
    targetProjectPaths,
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
  config?: ResolvedLatticeConfig;
  cwd?: string;
  flow?: LatticeFlowReporter;
  flowDepth?: number;
  project?: string;
  runner?: TypecheckRunner;
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
  const projectRootDir = normalizeAbsolutePath(options.config?.rootDir ?? cwd);
  const checkers = getRouteCheckers({
    config: options.config,
    project: options.project,
    routeKind: 'build',
  });
  const rootRoute =
    options.project ??
    checkers.find((checker) => checker.preset === 'tsc')?.routes.build ??
    checkers[0]?.routes.build;
  const rootConfigPath = rootRoute
    ? resolveProjectConfigPath(projectRootDir, rootRoute)
    : projectRootDir;
  const flowDepth = options.flowDepth ?? 0;
  const targets = checkers.flatMap((checker) => {
    const route = checker.routes.build;

    if (!route) {
      return [];
    }

    return [
      createCheckerTarget({
        checker,
        commandOverride: options.tscCommand,
        configPath: resolveRouteConfigPath(projectRootDir, route),
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
      `Project: ${toRelativePath(projectRootDir, rootConfigPath)}`,
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
              `tsc -b ${toRelativePath(projectRootDir, target.configPath)}`,
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
