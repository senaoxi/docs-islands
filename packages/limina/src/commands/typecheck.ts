import { createElapsedTimer } from 'logaria/helper';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import path from 'pathe';
import {
  type CheckerPackageResolver,
  collectMissingCheckerPeerDependencies,
  formatMissingCheckerPeerDependencies,
  getCheckerAdapter,
  getCheckerExtensions,
} from '../checkers';
import {
  type BuildCheckerPreset,
  type CheckerExecutionKind,
  getActiveCheckers,
  type ResolvedCheckerConfig,
  type ResolvedLiminaConfig,
} from '../config';
import type { LiminaFlowReporter, LiminaFlowTask } from '../flow';
import {
  type GeneratedBuildModule,
  type GeneratedProviderEdge,
  type GeneratedTsconfigGraphResult,
  prepareGeneratedTsconfigGraph,
} from '../generated-graph';
import { clearCliScreen, formatErrorMessage, TypecheckLogger } from '../logger';
import {
  collectGraphProjectRouteFromRoot,
  getRawReferencePathsForConfig,
  isDtsConfigPath,
  isOrdinarySourceTypecheckConfigPath,
  resolveProjectConfigPath,
} from '../tsconfig';
import {
  isPathInsideDirectory,
  normalizeAbsolutePath,
  toRelativePath,
} from '../utils/path';

export interface TypecheckTarget {
  args: string[];
  checkerName?: string;
  configPath: string;
  cwd: string;
  command: string;
  executionKind?: CheckerExecutionKind;
  label?: string;
  sourceConfigPath?: string;
}

export interface TypecheckTargetResult {
  configPath: string;
  error?: Error;
  status: number;
}

export type TypecheckRunner = (
  target: TypecheckTarget,
) => Promise<TypecheckTargetResult> | TypecheckTargetResult;

function getExecutionCheckers(options: {
  checkers: ResolvedCheckerConfig[];
  executionKind: CheckerExecutionKind;
}): ResolvedCheckerConfig[] {
  return options.checkers.filter((checker) => {
    const adapter = getCheckerAdapter(checker.preset);

    return adapter?.execution === options.executionKind;
  });
}

function collectCheckerPeerDependencyProblems(options: {
  checkers: ResolvedCheckerConfig[];
  projectRootDir: string;
  resolvePackage?: CheckerPackageResolver;
}): string[] {
  const missingDependencies = collectMissingCheckerPeerDependencies({
    checkers: options.checkers,
    projectRootDir: options.projectRootDir,
    resolvePackage: options.resolvePackage,
  });

  return missingDependencies.length === 0
    ? []
    : [formatMissingCheckerPeerDependencies(missingDependencies)];
}

function createCheckerTarget(options: {
  checker: ResolvedCheckerConfig;
  commandOverride?: string;
  configPath: string;
  executionKind: CheckerExecutionKind;
  projectRootDir: string;
  watch?: boolean;
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

function createCheckerProcessEnvironment(
  target: TypecheckTarget,
): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PATH: [path.join(target.cwd, 'node_modules/.bin'), process.env.PATH]
      .filter(Boolean)
      .join(path.delimiter),
  };
}

function findNearestPackageDir(startDir: string): string | null {
  let currentDir = startDir;

  for (;;) {
    if (existsSync(path.join(currentDir, 'package.json'))) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);

    if (parentDir === currentDir) {
      return null;
    }

    currentDir = parentDir;
  }
}

function createVueTsgoCachePath(configPath: string): string | null {
  const packageDir = findNearestPackageDir(path.dirname(configPath));

  if (!packageDir) {
    return null;
  }

  const configHash = createHash('sha256')
    .update(configPath)
    .digest('hex')
    .slice(0, 8);

  return path.join(packageDir, 'node_modules/.cache/vue-tsgo', configHash);
}

function collectVueTsgoConfigPaths(target: TypecheckTarget): string[] {
  const configPaths = new Set([target.configPath]);

  try {
    const route = collectGraphProjectRouteFromRoot({
      rootConfigPath: target.configPath,
      rootDir: target.cwd,
    });

    for (const projectPath of route.projectPaths) {
      configPaths.add(projectPath);
    }
  } catch {
    // Best effort cache cleanup must not mask the checker process result.
  }

  return [...configPaths];
}

function isVueTsgoCommand(command: string): boolean {
  const commandName = path.basename(command).toLowerCase();

  return commandName === 'vue-tsgo' || commandName === 'vue-tsgo.cmd';
}

/**
 * vue-tsgo generates a transient virtual TS workspace under
 * node_modules/.cache/vue-tsgo/<hash>. In project graphs where multiple
 * references converge on the same config, vue-tsgo can create duplicate
 * Project instances with the same targetRoot. Leaving a previous targetRoot
 * in place may race rm()/writeFile() during Project.generate() and fail with
 * ENOENT, so Limina clears reachable vue-tsgo workspaces before launching it.
 */
export async function prepareVueTsgoCache(
  target: TypecheckTarget,
): Promise<void> {
  if (!isVueTsgoCommand(target.command)) {
    return;
  }

  const cachePaths = collectVueTsgoConfigPaths(target)
    .map((configPath) => createVueTsgoCachePath(configPath))
    .filter((cachePath): cachePath is string => Boolean(cachePath));

  await Promise.all(
    [...new Set(cachePaths)].map((cachePath) =>
      rm(cachePath, {
        force: true,
        maxRetries: 3,
        recursive: true,
        retryDelay: 50,
      }),
    ),
  );
}

function createDefaultRunner(): TypecheckRunner {
  return async (target) => {
    await prepareVueTsgoCache(target);

    const processEnvironment = createCheckerProcessEnvironment(target);

    return await new Promise<TypecheckTargetResult>((resolve) => {
      let settled = false;
      const finalize = (result: TypecheckTargetResult): void => {
        if (settled) {
          return;
        }

        settled = true;
        resolve(result);
      };

      const child = spawn(target.command, target.args, {
        cwd: target.cwd,
        env: processEnvironment,
        shell: process.platform === 'win32',
        stdio: 'inherit',
      });

      child.on('error', (error) => {
        finalize({
          configPath: target.configPath,
          error,
          status: 1,
        });
      });

      child.on('close', (code) => {
        finalize({
          configPath: target.configPath,
          status: code ?? 1,
        });
      });
    });
  };
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
  const results: TypecheckTargetResult[] = [];
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

function getDefaultBuildConcurrency(targetCount: number): number {
  return Math.min(targetCount, availableParallelism() ?? 4);
}

function getBuildTargetDependencyKey(target: TypecheckTarget): string {
  return [
    target.checkerName ?? '',
    target.sourceConfigPath ?? '',
    target.configPath,
  ].join('\0');
}

function providerEdgeMatchesConsumer(
  edge: GeneratedProviderEdge,
  target: TypecheckTarget,
): boolean {
  return (
    target.checkerName === edge.fromChecker &&
    (!target.sourceConfigPath ||
      target.sourceConfigPath === edge.fromConfigPath)
  );
}

function providerEdgeMatchesProvider(
  edge: GeneratedProviderEdge,
  target: TypecheckTarget,
): boolean {
  return (
    target.checkerName === edge.toChecker &&
    (!target.sourceConfigPath || target.sourceConfigPath === edge.toConfigPath)
  );
}

function collectStronglyConnectedBuildTargetKeys(
  orderedKeys: string[],
  dependenciesByTargetKey: Map<string, Set<string>>,
): string[][] {
  const indexByKey = new Map<string, number>();
  const lowLinkByKey = new Map<string, number>();
  const stack: string[] = [];
  const stackedKeys = new Set<string>();
  const components: string[][] = [];
  let nextIndex = 0;

  const visit = (key: string): void => {
    indexByKey.set(key, nextIndex);
    lowLinkByKey.set(key, nextIndex);
    nextIndex += 1;
    stack.push(key);
    stackedKeys.add(key);

    for (const dependencyKey of dependenciesByTargetKey.get(key) ?? []) {
      if (!indexByKey.has(dependencyKey)) {
        visit(dependencyKey);
        lowLinkByKey.set(
          key,
          Math.min(
            lowLinkByKey.get(key) ?? 0,
            lowLinkByKey.get(dependencyKey) ?? 0,
          ),
        );
      } else if (stackedKeys.has(dependencyKey)) {
        lowLinkByKey.set(
          key,
          Math.min(
            lowLinkByKey.get(key) ?? 0,
            indexByKey.get(dependencyKey) ?? 0,
          ),
        );
      }
    }

    if (lowLinkByKey.get(key) !== indexByKey.get(key)) {
      return;
    }

    const component: string[] = [];

    while (stack.length > 0) {
      const componentKey = stack.pop()!;

      stackedKeys.delete(componentKey);
      component.push(componentKey);

      if (componentKey === key) {
        break;
      }
    }

    components.push(component);
  };

  for (const key of orderedKeys) {
    if (!indexByKey.has(key)) {
      visit(key);
    }
  }

  return components
    .map((component) =>
      component.sort(
        (left, right) => orderedKeys.indexOf(left) - orderedKeys.indexOf(right),
      ),
    )
    .sort(
      (left, right) =>
        orderedKeys.indexOf(left[0]!) - orderedKeys.indexOf(right[0]!),
    );
}

function createBuildDependencyLayers(
  targets: TypecheckTarget[],
  providerEdges: GeneratedProviderEdge[],
): TypecheckTarget[][] {
  const targetKeyByTarget = new Map<TypecheckTarget, string>(
    targets.map((target) => [target, getBuildTargetDependencyKey(target)]),
  );
  const targetByKey = new Map<string, TypecheckTarget>(
    targets.map((target) => [getBuildTargetDependencyKey(target), target]),
  );
  const dependenciesByTargetKey = new Map<string, Set<string>>(
    targets.map((target) => [getBuildTargetDependencyKey(target), new Set()]),
  );

  for (const edge of providerEdges) {
    const consumerTargets = targets.filter((target) =>
      providerEdgeMatchesConsumer(edge, target),
    );
    const providerTargets = targets.filter((target) =>
      providerEdgeMatchesProvider(edge, target),
    );

    for (const consumerTarget of consumerTargets) {
      const consumerKey = targetKeyByTarget.get(consumerTarget);

      if (!consumerKey) {
        continue;
      }

      for (const providerTarget of providerTargets) {
        const providerKey = targetKeyByTarget.get(providerTarget);

        if (!providerKey || providerKey === consumerKey) {
          continue;
        }

        dependenciesByTargetKey.get(consumerKey)?.add(providerKey);
      }
    }
  }

  const orderedKeys = targets.map(getBuildTargetDependencyKey);
  const components = collectStronglyConnectedBuildTargetKeys(
    orderedKeys,
    dependenciesByTargetKey,
  );
  const componentIndexByKey = new Map<string, number>();

  for (const [componentIndex, component] of components.entries()) {
    for (const key of component) {
      componentIndexByKey.set(key, componentIndex);
    }
  }

  const dependenciesByComponentIndex = new Map<number, Set<number>>(
    components.map((_, index) => [index, new Set<number>()]),
  );

  for (const key of orderedKeys) {
    const componentIndex = componentIndexByKey.get(key);

    if (componentIndex === undefined) {
      continue;
    }

    for (const dependencyKey of dependenciesByTargetKey.get(key) ?? []) {
      const dependencyComponentIndex = componentIndexByKey.get(dependencyKey);

      if (
        dependencyComponentIndex === undefined ||
        dependencyComponentIndex === componentIndex
      ) {
        continue;
      }

      dependenciesByComponentIndex
        .get(componentIndex)
        ?.add(dependencyComponentIndex);
    }
  }

  const remainingComponentIndexes = new Set(
    components.map((_, index) => index),
  );
  const completedComponentIndexes = new Set<number>();
  const layers: TypecheckTarget[][] = [];

  while (remainingComponentIndexes.size > 0) {
    const readyComponentIndexes = components
      .map((_, index) => index)
      .filter((componentIndex) => {
        if (!remainingComponentIndexes.has(componentIndex)) {
          return false;
        }

        const dependencies =
          dependenciesByComponentIndex.get(componentIndex) ?? new Set();

        return [...dependencies].every((dependency) =>
          completedComponentIndexes.has(dependency),
        );
      });

    if (readyComponentIndexes.length === 0) {
      break;
    }

    layers.push(
      readyComponentIndexes
        .flatMap((componentIndex) => components[componentIndex] ?? [])
        .map((key) => targetByKey.get(key))
        .filter((target): target is TypecheckTarget => Boolean(target)),
    );

    for (const componentIndex of readyComponentIndexes) {
      remainingComponentIndexes.delete(componentIndex);
      completedComponentIndexes.add(componentIndex);
    }
  }

  if (remainingComponentIndexes.size > 0) {
    layers.push(
      [...remainingComponentIndexes]
        .flatMap((componentIndex) => components[componentIndex] ?? [])
        .map((key) => targetByKey.get(key))
        .filter((target): target is TypecheckTarget => Boolean(target)),
    );
  }

  return layers;
}

async function runBuildTargets(
  targets: TypecheckTarget[],
  providerEdges: GeneratedProviderEdge[],
  runner: TypecheckRunner,
  options: {
    onTargetResult?: (
      target: TypecheckTarget,
      result: TypecheckTargetResult,
    ) => void;
    onTargetStart?: (target: TypecheckTarget) => void;
    watch?: boolean;
  } = {},
): Promise<TypecheckTargetResult[]> {
  const results: TypecheckTargetResult[] = [];
  const layers = options.watch
    ? [targets]
    : createBuildDependencyLayers(targets, providerEdges);

  for (const layer of layers) {
    results.push(
      ...(await runWithConcurrency(
        layer,
        options.watch ? layer.length : getDefaultBuildConcurrency(layer.length),
        runner,
        options,
      )),
    );
  }

  return results;
}

export interface RunCheckerBuildOptions {
  clearScreen?: boolean;
  config: ResolvedLiminaConfig;
  cwd?: string;
  flow?: LiminaFlowReporter;
  flowDepth?: number;
  checkerPackageResolver?: CheckerPackageResolver;
  runner?: TypecheckRunner;
  tscCommand?: string;
}

export interface RunCheckerBuildResult {
  passed: boolean;
  projectRootDir: string;
  rootConfigPaths: string[];
}

export interface RunBuildOptions {
  clearScreen?: boolean;
  checker?: BuildCheckerPreset;
  configPath?: string;
  config: ResolvedLiminaConfig;
  cwd?: string;
  flow?: LiminaFlowReporter;
  flowDepth?: number;
  checkerPackageResolver?: CheckerPackageResolver;
  project?: string;
  runner?: TypecheckRunner;
  tscCommand?: string;
  watch?: boolean;
}

export interface RunBuildResult {
  passed: boolean;
  projectRootDir: string;
  rootConfigPaths: string[];
  sourceConfigPath: string | null;
}

export interface RunCheckerTypecheckOptions {
  clearScreen?: boolean;
  config: ResolvedLiminaConfig;
  cwd?: string;
  flow?: LiminaFlowReporter;
  flowDepth?: number;
  checkerPackageResolver?: CheckerPackageResolver;
  runner?: TypecheckRunner;
  tscCommand?: string;
}

export interface RunCheckerTypecheckResult {
  passed: boolean;
  projectRootDir: string;
  rootConfigPaths: string[];
}

async function runCheckerBuildInternal(
  options: RunCheckerBuildOptions,
): Promise<RunCheckerBuildResult> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const projectRootDir = normalizeAbsolutePath(options.config.rootDir);
  const allCheckers = getActiveCheckers(options.config);
  const generatedGraph = await prepareGeneratedTsconfigGraph(options.config);
  const checkers = getExecutionCheckers({
    checkers: allCheckers,
    executionKind: 'build',
  });
  const flowDepth = options.flowDepth ?? 0;
  const rootConfigPaths: string[] = [];
  const problems = collectCheckerPeerDependencyProblems({
    checkers: allCheckers,
    projectRootDir,
    resolvePackage: options.checkerPackageResolver,
  });

  if (problems.length > 0) {
    options.flow?.fail('checker dependency preflight failed', {
      depth: flowDepth + 1,
    });
    TypecheckLogger.error(problems.join('\n\n'));

    return {
      passed: false,
      projectRootDir,
      rootConfigPaths,
    };
  }

  const targets = checkers.flatMap((checker) => {
    const configPath = generatedGraph.checkerEntries.get(checker.name);

    if (!configPath) {
      throw new Error(`Missing generated entry for checker "${checker.name}".`);
    }

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

  const targetTasks = new Map<string, LiminaFlowTask>();
  const results = await runBuildTargets(
    targets,
    generatedGraph.providerEdges,
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

  reportBuildCheckerCombinationWarning({
    entries: collectBuildGraphCombinationEntries({
      generatedGraph,
      projectRootDir,
      roots: collectCheckerBuildCombinationRoots({
        checkers,
        generatedGraph,
        projectRootDir,
      }),
    }),
    flow: options.flow,
    flowDepth,
    projectRootDir,
  });

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

function findNearestDefaultTsconfig(options: {
  rootDir: string;
  startDir: string;
}): string | null {
  let currentDir = normalizeAbsolutePath(options.startDir);
  const rootDir = normalizeAbsolutePath(options.rootDir);

  while (isPathInsideDirectory(currentDir, rootDir)) {
    const candidatePath = path.join(currentDir, 'tsconfig.json');

    if (existsSync(candidatePath)) {
      return normalizeAbsolutePath(candidatePath);
    }

    if (currentDir === rootDir) {
      return null;
    }

    const parentDir = path.dirname(currentDir);

    if (parentDir === currentDir) {
      return null;
    }

    currentDir = parentDir;
  }

  return null;
}

function resolveBuildConfigPath(options: {
  configPath?: string;
  cwd: string;
  project?: string;
  rootDir: string;
}): string {
  if (options.configPath && options.project) {
    const configPath = resolveProjectConfigPath(
      options.cwd,
      options.configPath,
    );
    const projectPath = resolveProjectConfigPath(options.cwd, options.project);

    if (configPath !== projectPath) {
      throw new Error(
        [
          'Conflicting limina build config arguments:',
          `  config: ${toRelativePath(options.rootDir, configPath)}`,
          `  --project: ${toRelativePath(options.rootDir, projectPath)}`,
          '  reason: positional <config> and -p, --project must refer to the same path when both are provided.',
        ].join('\n'),
      );
    }

    return configPath;
  }

  const targetConfigPath = options.configPath
    ? resolveProjectConfigPath(options.cwd, options.configPath)
    : options.project
      ? resolveProjectConfigPath(options.cwd, options.project)
      : findNearestDefaultTsconfig({
          rootDir: options.rootDir,
          startDir: options.cwd,
        });

  if (!targetConfigPath) {
    throw new Error(
      [
        'Unable to resolve build tsconfig:',
        `  cwd: ${toRelativePath(options.rootDir, options.cwd)}`,
        '  reason: no tsconfig.json was found in this directory or its workspace parents.',
        '  fix: run limina build <config>, or pass -p <source-tsconfig>.',
      ].join('\n'),
    );
  }

  if (!existsSync(targetConfigPath)) {
    throw new Error(
      [
        'Unable to resolve build tsconfig:',
        `  config: ${toRelativePath(options.rootDir, targetConfigPath)}`,
        '  reason: the requested source tsconfig does not exist.',
      ].join('\n'),
    );
  }

  if (statSync(targetConfigPath).isDirectory()) {
    throw new Error(
      [
        'Unable to resolve build tsconfig:',
        `  config: ${toRelativePath(options.rootDir, targetConfigPath)}`,
        '  reason: expected a tsconfig*.json file, but received a directory.',
      ].join('\n'),
    );
  }

  if (!isPathInsideDirectory(targetConfigPath, options.rootDir)) {
    throw new Error(
      [
        'Invalid limina build project:',
        `  config: ${targetConfigPath}`,
        `  reason: build projects must be inside the Limina workspace root at ${options.rootDir}.`,
      ].join('\n'),
    );
  }

  if (!targetConfigPath.endsWith('.json')) {
    throw new Error(
      [
        'Invalid limina build project:',
        `  config: ${toRelativePath(options.rootDir, targetConfigPath)}`,
        '  reason: limina build expects a JSON config file.',
      ].join('\n'),
    );
  }

  if (targetConfigPath.split(path.sep).includes('.limina')) {
    throw new Error(
      [
        'Invalid limina build project:',
        `  config: ${toRelativePath(options.rootDir, targetConfigPath)}`,
        '  reason: .limina generated configs are internal build artifacts, not user build inputs.',
      ].join('\n'),
    );
  }

  return targetConfigPath;
}

function formatTypecheckOnlyBuildProblem(options: {
  checkers: ResolvedCheckerConfig[];
  projectRootDir: string;
  sourceConfigPath: string;
}): string {
  return [
    'No build-capable Limina checker found for source tsconfig:',
    `  config: ${toRelativePath(options.projectRootDir, options.sourceConfigPath)}`,
    '  reason: the matching checker(s) are typecheck-only and cannot emit declaration builds.',
    '  matching checkers:',
    ...options.checkers.map(
      (checker) => `    - config.checkers.${checker.name} (${checker.preset})`,
    ),
    '  fix: configure a build-capable checker such as tsc, tsgo, or vue-tsc for this tsconfig.',
  ].join('\n');
}

function formatManagedBuildCheckerSelectionProblem(options: {
  availableCheckers: string[];
  projectRootDir: string;
  selectedChecker: BuildCheckerPreset;
  sourceConfigPath: string;
}): string {
  return [
    'Invalid Limina build checker selection:',
    `  config: ${toRelativePath(options.projectRootDir, options.sourceConfigPath)}`,
    `  checker: ${options.selectedChecker}`,
    '  reason: --checker must select a configured build-capable checker that covers this source tsconfig.',
    ...(options.availableCheckers.length > 0
      ? [
          '  available checkers:',
          ...options.availableCheckers.map((checker) => `    - ${checker}`),
        ]
      : ['  available checkers: none']),
  ].join('\n');
}

interface BuildTargetDescriptor {
  buildModule: GeneratedBuildModule;
  checker: ResolvedCheckerConfig;
  sourceConfigPath: string;
}

interface ResolveBuildTargetOptions {
  checker?: BuildCheckerPreset;
  config: ResolvedLiminaConfig;
  configPath?: string;
  cwd: string;
  project?: string;
}

type ResolvedBuildTarget =
  | {
      availableCheckers: string[];
      allCheckers: ResolvedCheckerConfig[];
      checkerTargets: BuildTargetDescriptor[];
      generatedGraph: GeneratedTsconfigGraphResult;
      kind: 'managed';
      matchingCheckers: ResolvedCheckerConfig[];
      selectedChecker?: BuildCheckerPreset;
      sourceConfigPath: string;
    }
  | {
      checker: BuildCheckerPreset;
      kind: 'raw';
      targetConfigPath: string;
    };

interface BuildCheckerCombinationEntry {
  checker: ResolvedCheckerConfig;
  entryConfigPath: string;
  generatedConfigPath: string;
  sourceConfigPath: string;
}

function getBuildTargetDescriptorKey(
  descriptor: BuildTargetDescriptor,
): string {
  return `${descriptor.checker.name}\0${descriptor.sourceConfigPath}`;
}

function createRawBuildChecker(options: {
  preset: BuildCheckerPreset;
  projectRootDir: string;
}): ResolvedCheckerConfig {
  return {
    exclude: [],
    extensions: getCheckerExtensions(
      {
        include: [],
        preset: options.preset,
      },
      {
        projectRootDir: options.projectRootDir,
      },
    ),
    include: [],
    name: options.preset,
    preset: options.preset,
  };
}

function collectManagedBuildTargets(options: {
  allCheckers: ResolvedCheckerConfig[];
  generatedGraph: GeneratedTsconfigGraphResult;
  sourceConfigPath: string;
}): BuildTargetDescriptor[] {
  return options.allCheckers.flatMap((checker) => {
    const buildModule = options.generatedGraph.sourceToBuild
      .get(checker.name)
      ?.get(options.sourceConfigPath);

    if (!buildModule) {
      return [];
    }

    return [
      {
        buildModule,
        checker,
        sourceConfigPath: options.sourceConfigPath,
      },
    ];
  });
}

async function resolveBuildTarget(
  options: ResolveBuildTargetOptions,
): Promise<ResolvedBuildTarget> {
  const projectRootDir = normalizeAbsolutePath(options.config.rootDir);
  const targetConfigPath = resolveBuildConfigPath({
    configPath: options.configPath,
    cwd: options.cwd,
    project: options.project,
    rootDir: projectRootDir,
  });
  const allCheckers = getActiveCheckers(options.config);
  const generatedGraph = await prepareGeneratedTsconfigGraph(options.config);
  const managedTargets = isOrdinarySourceTypecheckConfigPath(targetConfigPath)
    ? collectManagedBuildTargets({
        allCheckers,
        generatedGraph,
        sourceConfigPath: targetConfigPath,
      })
    : [];

  if (managedTargets.length === 0) {
    return {
      checker: options.checker ?? 'tsc',
      kind: 'raw',
      targetConfigPath,
    };
  }

  const buildCapableTargets = managedTargets.filter(
    ({ checker }) => getCheckerAdapter(checker.preset)?.execution === 'build',
  );
  const availableCheckers = [
    ...new Set(buildCapableTargets.map(({ checker }) => checker.preset)),
  ].sort();
  const checkerTargets = options.checker
    ? buildCapableTargets.filter(
        ({ checker }) => checker.preset === options.checker,
      )
    : buildCapableTargets;

  return {
    availableCheckers,
    allCheckers,
    checkerTargets,
    generatedGraph,
    kind: 'managed',
    matchingCheckers: managedTargets.map(({ checker }) => checker),
    ...(options.checker ? { selectedChecker: options.checker } : {}),
    sourceConfigPath: targetConfigPath,
  };
}

function shouldWarnForBuildCheckerPresetCombination(
  presets: string[],
): boolean {
  const uniquePresets = [...new Set(presets)].sort();

  if (uniquePresets.length <= 1) {
    return false;
  }

  return !uniquePresets.every(
    (preset) => preset === 'tsc' || preset === 'vue-tsc',
  );
}

function formatBuildCheckerCombinationWarning(options: {
  entries: BuildCheckerCombinationEntry[];
  projectRootDir: string;
}): string | null {
  const entriesByGeneratedConfigPath = new Map<
    string,
    BuildCheckerCombinationEntry[]
  >();

  for (const entry of options.entries) {
    entriesByGeneratedConfigPath.set(entry.generatedConfigPath, [
      ...(entriesByGeneratedConfigPath.get(entry.generatedConfigPath) ?? []),
      entry,
    ]);
  }

  const warningGroups = [...entriesByGeneratedConfigPath.entries()]
    .filter(([, entries]) =>
      shouldWarnForBuildCheckerPresetCombination(
        entries.map((entry) => entry.checker.preset),
      ),
    )
    .sort(([left], [right]) =>
      toRelativePath(options.projectRootDir, left).localeCompare(
        toRelativePath(options.projectRootDir, right),
      ),
    );

  if (warningGroups.length === 0) {
    return null;
  }

  return [
    'Potentially incompatible build checker combination:',
    '  reason: these checker presets can reach the same generated declaration config but do not safely share underlying build cache semantics.',
    '  fix: use a single cache-compatible build checker path for this generated config, or use a file-compatible tsc + vue-tsc combination.',
    ...warningGroups.flatMap(([generatedConfigPath, entries]) => [
      `  generated config: ${toRelativePath(options.projectRootDir, generatedConfigPath)}`,
      `  source config: ${toRelativePath(options.projectRootDir, entries[0]!.sourceConfigPath)}`,
      '  reachable from:',
      ...formatBuildCheckerCombinationReachability({
        entries,
        projectRootDir: options.projectRootDir,
      }),
    ]),
  ].join('\n');
}

function formatBuildCheckerCombinationReachability(options: {
  entries: BuildCheckerCombinationEntry[];
  projectRootDir: string;
}): string[] {
  const entriesByCheckerKey = new Map<
    string,
    {
      checker: ResolvedCheckerConfig;
      entryConfigPaths: Set<string>;
    }
  >();

  for (const entry of options.entries) {
    const key = `${entry.checker.name}\0${entry.checker.preset}`;
    const checkerEntries = entriesByCheckerKey.get(key) ?? {
      checker: entry.checker,
      entryConfigPaths: new Set<string>(),
    };

    checkerEntries.entryConfigPaths.add(entry.entryConfigPath);
    entriesByCheckerKey.set(key, checkerEntries);
  }

  return [...entriesByCheckerKey.values()]
    .sort(
      (left, right) =>
        left.checker.name.localeCompare(right.checker.name) ||
        left.checker.preset.localeCompare(right.checker.preset),
    )
    .flatMap(({ checker, entryConfigPaths }) => [
      `    - config.checkers.${checker.name} (${checker.preset})`,
      '      entry tsconfigs:',
      ...[...entryConfigPaths]
        .sort((left, right) =>
          toRelativePath(options.projectRootDir, left).localeCompare(
            toRelativePath(options.projectRootDir, right),
          ),
        )
        .map(
          (entryConfigPath) =>
            `        - ${toRelativePath(options.projectRootDir, entryConfigPath)}`,
        ),
    ]);
}

function getSourceConfigPathForGeneratedDts(options: {
  dtsConfigPath: string;
  generatedGraph: GeneratedTsconfigGraphResult;
}): string | null {
  for (const dtsToSource of options.generatedGraph.dtsToSource.values()) {
    const sourceConfigPath = dtsToSource.get(options.dtsConfigPath);

    if (sourceConfigPath) {
      return sourceConfigPath;
    }
  }

  return null;
}

function getSourceConfigPathForBuildConfig(options: {
  checkerName: string;
  configPath: string;
  generatedGraph: GeneratedTsconfigGraphResult;
}): string | null {
  const sourceToBuild =
    options.generatedGraph.sourceToBuild.get(options.checkerName) ?? new Map();

  for (const [sourceConfigPath, buildModule] of sourceToBuild) {
    if (buildModule.path === options.configPath) {
      return sourceConfigPath;
    }
  }

  if (!isDtsConfigPath(options.configPath)) {
    return null;
  }

  return getSourceConfigPathForGeneratedDts({
    dtsConfigPath: options.configPath,
    generatedGraph: options.generatedGraph,
  });
}

function collectCheckerBuildCombinationRoots(options: {
  checkers: ResolvedCheckerConfig[];
  generatedGraph: GeneratedTsconfigGraphResult;
  projectRootDir: string;
}): {
  checker: ResolvedCheckerConfig;
  configPath: string;
  entryConfigPath: string;
}[] {
  return options.checkers.flatMap((checker) => {
    const checkerEntryPath = options.generatedGraph.checkerEntries.get(
      checker.name,
    );

    if (!checkerEntryPath) {
      return [];
    }

    return getRawReferencePathsForConfig(
      options.projectRootDir,
      checkerEntryPath,
    ).flatMap((configPath) => {
      const entryConfigPath = getSourceConfigPathForBuildConfig({
        checkerName: checker.name,
        configPath,
        generatedGraph: options.generatedGraph,
      });

      return entryConfigPath
        ? [
            {
              checker,
              configPath,
              entryConfigPath,
            },
          ]
        : [];
    });
  });
}

function collectBuildGraphCombinationEntries(options: {
  generatedGraph: GeneratedTsconfigGraphResult;
  projectRootDir: string;
  roots: {
    checker: ResolvedCheckerConfig;
    configPath: string;
    entryConfigPath: string;
  }[];
}): BuildCheckerCombinationEntry[] {
  const entries: BuildCheckerCombinationEntry[] = [];

  for (const root of options.roots) {
    const route = collectGraphProjectRouteFromRoot({
      rootConfigPath: root.configPath,
      rootDir: options.projectRootDir,
    });

    for (const generatedConfigPath of route.projectPaths.filter(
      isDtsConfigPath,
    )) {
      const sourceConfigPath = getSourceConfigPathForGeneratedDts({
        dtsConfigPath: generatedConfigPath,
        generatedGraph: options.generatedGraph,
      });

      if (!sourceConfigPath) {
        continue;
      }

      entries.push({
        checker: root.checker,
        entryConfigPath: root.entryConfigPath,
        generatedConfigPath,
        sourceConfigPath,
      });
    }
  }

  return entries;
}

function reportBuildCheckerCombinationWarning(options: {
  entries: BuildCheckerCombinationEntry[];
  flow?: LiminaFlowReporter;
  flowDepth: number;
  projectRootDir: string;
}): void {
  const warning = formatBuildCheckerCombinationWarning(options);

  if (!warning) {
    return;
  }

  options.flow?.warn(warning, {
    depth: options.flowDepth + 1,
    persistInteractive: true,
  });

  if (options.flow?.interactive) {
    return;
  }

  TypecheckLogger.warn(warning);
}

function collectBuildTargetProviderClosure(options: {
  allCheckers: ResolvedCheckerConfig[];
  generatedGraph: GeneratedTsconfigGraphResult;
  initialTargets: BuildTargetDescriptor[];
}): BuildTargetDescriptor[] {
  const checkerByName = new Map(
    options.allCheckers.map((checker) => [checker.name, checker]),
  );
  const descriptorsByKey = new Map<string, BuildTargetDescriptor>();
  const queue: BuildTargetDescriptor[] = [];

  for (const target of options.initialTargets) {
    const key = getBuildTargetDescriptorKey(target);

    descriptorsByKey.set(key, target);
    queue.push(target);
  }

  for (;;) {
    const current = queue.shift();

    if (!current) {
      break;
    }

    for (const edge of options.generatedGraph.providerEdges) {
      if (
        edge.fromChecker !== current.checker.name ||
        edge.fromConfigPath !== current.sourceConfigPath
      ) {
        continue;
      }

      const checker = checkerByName.get(edge.toChecker);

      if (
        !checker ||
        getCheckerAdapter(checker.preset)?.execution !== 'build'
      ) {
        continue;
      }

      const buildModule = options.generatedGraph.sourceToBuild
        .get(checker.name)
        ?.get(edge.toConfigPath);

      if (!buildModule) {
        continue;
      }

      const descriptor: BuildTargetDescriptor = {
        buildModule,
        checker,
        sourceConfigPath: edge.toConfigPath,
      };
      const key = getBuildTargetDescriptorKey(descriptor);

      if (descriptorsByKey.has(key)) {
        continue;
      }

      descriptorsByKey.set(key, descriptor);
      queue.push(descriptor);
    }
  }

  return [...descriptorsByKey.values()].sort(
    (left, right) =>
      left.checker.name.localeCompare(right.checker.name) ||
      left.sourceConfigPath.localeCompare(right.sourceConfigPath),
  );
}

async function runBuildInternal(
  options: RunBuildOptions,
): Promise<RunBuildResult> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const projectRootDir = normalizeAbsolutePath(options.config.rootDir);
  const resolvedTarget = await resolveBuildTarget({
    checker: options.checker,
    config: options.config,
    configPath: options.configPath,
    cwd,
    project: options.project,
  });
  const flowDepth = options.flowDepth ?? 0;
  const rootConfigPaths: string[] = [];

  if (resolvedTarget.kind === 'raw') {
    const checker = createRawBuildChecker({
      preset: resolvedTarget.checker,
      projectRootDir,
    });
    const problems = collectCheckerPeerDependencyProblems({
      checkers: [checker],
      projectRootDir,
      resolvePackage: options.checkerPackageResolver,
    });

    if (problems.length > 0) {
      options.flow?.fail('checker dependency preflight failed', {
        depth: flowDepth + 1,
      });
      TypecheckLogger.error(problems.join('\n\n'));

      return {
        passed: false,
        projectRootDir,
        rootConfigPaths,
        sourceConfigPath: null,
      };
    }

    rootConfigPaths.push(resolvedTarget.targetConfigPath);

    const target = {
      ...createCheckerTarget({
        checker,
        commandOverride: options.tscCommand,
        configPath: resolvedTarget.targetConfigPath,
        executionKind: 'build',
        projectRootDir,
        watch: options.watch,
      }),
      sourceConfigPath: resolvedTarget.targetConfigPath,
    };
    const targetTasks = new Map<string, LiminaFlowTask>();

    TypecheckLogger.info(
      [
        'Running raw build target.',
        `Checker: ${resolvedTarget.checker}`,
        `Config: ${toRelativePath(projectRootDir, resolvedTarget.targetConfigPath)}`,
        `CWD: ${toRelativePath(cwd, projectRootDir)}`,
      ].join('\n'),
    );

    const results = await runBuildTargets(
      [target],
      [],
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
                `build: ${toRelativePath(projectRootDir, target.configPath)}`,
              {
                collapseOnSuccess: false,
                depth: flowDepth + 1,
              },
            ),
          );
        },
        watch: options.watch,
      },
    );
    const failedResults = results.filter((result) => result.status !== 0);
    const passed = failedResults.length === 0;

    if (!passed) {
      TypecheckLogger.error(
        [
          'build failed:',
          ...failedResults.map((result) => {
            const suffix = result.error
              ? `: ${formatErrorMessage(result.error)}`
              : ` exited with code ${result.status}`;

            return `  ${toRelativePath(projectRootDir, result.configPath)}${suffix}`;
          }),
        ].join('\n'),
      );
    } else if (!options.flow?.interactive) {
      TypecheckLogger.success('Built 1 raw target.');
    }

    return {
      passed,
      projectRootDir,
      rootConfigPaths,
      sourceConfigPath: null,
    };
  }

  if (resolvedTarget.checkerTargets.length === 0) {
    TypecheckLogger.error(
      resolvedTarget.selectedChecker
        ? formatManagedBuildCheckerSelectionProblem({
            availableCheckers: resolvedTarget.availableCheckers,
            projectRootDir,
            selectedChecker: resolvedTarget.selectedChecker,
            sourceConfigPath: resolvedTarget.sourceConfigPath,
          })
        : formatTypecheckOnlyBuildProblem({
            checkers: resolvedTarget.matchingCheckers,
            projectRootDir,
            sourceConfigPath: resolvedTarget.sourceConfigPath,
          }),
    );

    return {
      passed: false,
      projectRootDir,
      rootConfigPaths,
      sourceConfigPath: resolvedTarget.sourceConfigPath,
    };
  }

  const buildTargetDescriptors = collectBuildTargetProviderClosure({
    allCheckers: resolvedTarget.allCheckers,
    generatedGraph: resolvedTarget.generatedGraph,
    initialTargets: resolvedTarget.checkerTargets,
  });

  const problems = collectCheckerPeerDependencyProblems({
    checkers: buildTargetDescriptors.map(({ checker }) => checker),
    projectRootDir,
    resolvePackage: options.checkerPackageResolver,
  });

  if (problems.length > 0) {
    options.flow?.fail('checker dependency preflight failed', {
      depth: flowDepth + 1,
    });
    TypecheckLogger.error(problems.join('\n\n'));

    return {
      passed: false,
      projectRootDir,
      rootConfigPaths,
      sourceConfigPath: resolvedTarget.sourceConfigPath,
    };
  }

  const targets = buildTargetDescriptors.map(
    ({ buildModule, checker, sourceConfigPath }) => {
      rootConfigPaths.push(buildModule.path);

      return {
        ...createCheckerTarget({
          checker,
          commandOverride: options.tscCommand,
          configPath: buildModule.path,
          executionKind: 'build',
          projectRootDir,
          watch: options.watch,
        }),
        sourceConfigPath,
      };
    },
  );

  options.flow?.info(`found ${targets.length} build target(s)`, {
    depth: flowDepth + 1,
  });

  TypecheckLogger.info(
    [
      `Running build for ${targets.length} generated target(s).`,
      `Source: ${toRelativePath(projectRootDir, resolvedTarget.sourceConfigPath)}`,
      `CWD: ${toRelativePath(cwd, projectRootDir)}`,
      `Entries: ${rootConfigPaths
        .map((configPath) => toRelativePath(projectRootDir, configPath))
        .join(', ')}`,
    ].join('\n'),
  );

  const targetTasks = new Map<string, LiminaFlowTask>();
  const results = await runBuildTargets(
    targets,
    resolvedTarget.generatedGraph.providerEdges,
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
              `build: ${toRelativePath(projectRootDir, target.configPath)}`,
            {
              collapseOnSuccess: false,
              depth: flowDepth + 1,
            },
          ),
        );
      },
      watch: options.watch,
    },
  );
  const failedResults = results.filter((result) => result.status !== 0);
  const passed = failedResults.length === 0;

  reportBuildCheckerCombinationWarning({
    entries: collectBuildGraphCombinationEntries({
      generatedGraph: resolvedTarget.generatedGraph,
      projectRootDir,
      roots: buildTargetDescriptors.map(
        ({ buildModule, checker, sourceConfigPath }) => ({
          checker,
          configPath: buildModule.path,
          entryConfigPath: sourceConfigPath,
        }),
      ),
    }),
    flow: options.flow,
    flowDepth,
    projectRootDir,
  });

  if (!passed) {
    TypecheckLogger.error(
      [
        'build failed:',
        ...failedResults.map((result) => {
          const suffix = result.error
            ? `: ${formatErrorMessage(result.error)}`
            : ` exited with code ${result.status}`;

          return `  ${toRelativePath(projectRootDir, result.configPath)}${suffix}`;
        }),
      ].join('\n'),
    );
  } else if (!options.flow?.interactive) {
    TypecheckLogger.success(`Built ${targets.length} generated target(s).`);
  }

  return {
    passed,
    projectRootDir,
    rootConfigPaths,
    sourceConfigPath: resolvedTarget.sourceConfigPath,
  };
}

export async function runBuild(
  options: RunBuildOptions,
): Promise<RunBuildResult> {
  if (options.clearScreen ?? true) {
    clearCliScreen();
  }

  const elapsed = createElapsedTimer();
  const task = options.flow?.start('build', {
    depth: options.flowDepth ?? 0,
  });

  TypecheckLogger.info('build started');

  try {
    const result = await runBuildInternal(options);

    if (result.passed) {
      if (!options.flow?.interactive) {
        TypecheckLogger.success('build finished', elapsed());
      }

      task?.pass();
    } else {
      TypecheckLogger.error('build finished with failures', elapsed());
      task?.fail('build finished with failures');
    }

    return result;
  } catch (error) {
    TypecheckLogger.error(
      `build failed: ${formatErrorMessage(error)}`,
      elapsed(),
    );
    task?.fail('build failed', { error });
    throw error;
  }
}

async function runCheckerTypecheckInternal(
  options: RunCheckerTypecheckOptions,
): Promise<RunCheckerTypecheckResult> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const projectRootDir = normalizeAbsolutePath(options.config.rootDir);
  const allCheckers = getActiveCheckers(options.config);
  const checkers = getExecutionCheckers({
    checkers: allCheckers,
    executionKind: 'typecheck',
  });
  const flowDepth = options.flowDepth ?? 0;
  const rootConfigPaths: string[] = [];

  if (checkers.length === 0) {
    options.flow?.info('no second-class checker entries configured', {
      depth: flowDepth + 1,
    });

    if (!options.flow?.interactive) {
      TypecheckLogger.success('No second-class checker entries configured.');
    }

    return {
      passed: true,
      projectRootDir,
      rootConfigPaths,
    };
  }

  const problems = collectCheckerPeerDependencyProblems({
    checkers,
    projectRootDir,
    resolvePackage: options.checkerPackageResolver,
  });

  if (problems.length > 0) {
    options.flow?.fail('checker dependency preflight failed', {
      depth: flowDepth + 1,
    });
    TypecheckLogger.error(problems.join('\n\n'));

    return {
      passed: false,
      projectRootDir,
      rootConfigPaths,
    };
  }

  const generatedGraph = await prepareGeneratedTsconfigGraph(options.config);
  const targets = checkers.map((checker) => {
    const configPath = generatedGraph.checkerEntries.get(checker.name);

    if (!configPath) {
      throw new Error(`Missing generated entry for checker "${checker.name}".`);
    }

    rootConfigPaths.push(configPath);

    return createCheckerTarget({
      checker,
      commandOverride: options.tscCommand,
      configPath,
      executionKind: 'typecheck',
      projectRootDir,
    });
  });

  options.flow?.info(`found ${targets.length} checker typecheck entry(s)`, {
    depth: flowDepth + 1,
  });

  TypecheckLogger.info(
    [
      `Running typecheck for ${targets.length} checker entry(s).`,
      `CWD: ${toRelativePath(cwd, projectRootDir)}`,
      `Entries: ${rootConfigPaths
        .map((configPath) => toRelativePath(projectRootDir, configPath))
        .join(', ')}`,
    ].join('\n'),
  );

  const targetTasks = new Map<string, LiminaFlowTask>();
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
              `checker typecheck: ${toRelativePath(projectRootDir, target.configPath)}`,
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
        'typecheck checks failed:',
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
      `Checked ${targets.length} checker typecheck entry(s).`,
    );
  }

  return {
    passed,
    projectRootDir,
    rootConfigPaths,
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
