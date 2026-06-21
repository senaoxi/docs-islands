import { getCheckerAdapter } from '#checkers';
import type {
  BuiltinTaskName,
  PipelineStep,
  ResolvedCheckerConfig,
  ResolvedLiminaConfig,
} from '#config/runner';
import { getActiveCheckers, isAutoCheckerConfigMode } from '#config/runner';
import type { LiminaCore } from '#core';
import type { GeneratedTsconfigGraphResult } from '#core/build-graph/runner';
import { toRelativePath } from '#utils/path';
import { spawn, spawnSync } from 'node:child_process';
import path from 'pathe';
import type { CheckIssueReportOptions } from '../check-reporting/human';
import type {
  CheckRunRecorder,
  LiminaCheckRunTaskPlan,
  LiminaCheckRunTaskStats,
} from '../check-reporting/run-recorder';
import { createCheckItemStats } from '../check-reporting/stats';
import { runGraphCheck, runGraphPrepare } from '../commands/graph';
import { runPackageCheck } from '../commands/package';
import { runProofCheck } from '../commands/proof';
import { runReleaseCheck } from '../commands/release';
import { runSourceCheck } from '../commands/source';
import { runCheckerBuild, runCheckerTypecheck } from '../commands/typecheck';
import type { LiminaFlowReporter } from '../flow';
import { LiminaPreflightManager } from '../preflight';
import type { SourceIssueReportOptions } from '../source-check/report';
import {
  appendCheckIssues,
  completeCheckIssueSnapshot,
  createTaskFailureIssue,
} from '../source-check/snapshot';
import type { CheckerFailureTarget } from '../typecheck/runner';
import {
  prepareVueTsgoCache,
  type TypecheckTargetResult,
} from '../typecheck/targets';

export interface RunPipelineOptions {
  checkRunRecorder?: CheckRunRecorder;
  checkIssueReport?: CheckIssueReportOptions;
  core?: LiminaCore;
  cwd?: string;
  flow?: LiminaFlowReporter;
  generatedGraphProvider?: () => Promise<GeneratedTsconfigGraphResult>;
  packageNames?: readonly string[];
  preflight?: LiminaPreflightManager;
  sourceIssueReport?: SourceIssueReportOptions;
}

type NormalizedPipelineStep = Exclude<PipelineStep, string>;

interface BuiltinTaskResult {
  passed: boolean;
  stats?: LiminaCheckRunTaskStats;
}

interface CheckerTaskStatsInput {
  failedTargets: readonly CheckerFailureTarget[];
  passed: boolean;
  problems?: readonly string[];
  projectRootDir: string;
  rootConfigPaths: readonly string[];
  targetResults?: readonly TypecheckTargetResult[];
}

const builtInTaskNames = new Set<string>([
  'checker:build',
  'checker:typecheck',
  'graph:check',
  'graph:prepare',
  'package:check',
  'proof:check',
  'release:check',
  'source:check',
]);

const defaultCheckPipeline: PipelineStep[] = [
  'graph:check',
  'source:check',
  'proof:check',
  'checker:build',
  'checker:typecheck',
];

function reportCheckerCapabilities(
  config: ResolvedLiminaConfig,
  flow: LiminaFlowReporter | undefined,
  checkers: ResolvedCheckerConfig[] = getActiveCheckers(config),
): void {
  if (!flow) {
    return;
  }

  const buildExecution: string[] = [];
  const typecheckExecution: string[] = [];
  const sourceGraph: string[] = [];
  const noSourceGraph: string[] = [];

  for (const checker of checkers) {
    const adapter = getCheckerAdapter(checker.preset);
    const label = `${checker.name} (${checker.preset})`;

    if (adapter?.execution === 'build') {
      buildExecution.push(label);
    } else if (adapter?.execution === 'typecheck') {
      typecheckExecution.push(label);
    }

    if (adapter?.sourceGraph) {
      sourceGraph.push(label);
    } else {
      noSourceGraph.push(label);
    }
  }

  flow.info(
    [
      'checker capability summary:',
      `  first-class build execution: ${buildExecution.length > 0 ? buildExecution.join(', ') : '(none)'}`,
      `  second-class typecheck execution: ${typecheckExecution.length > 0 ? typecheckExecution.join(', ') : '(none)'}`,
      `  source graph: ${sourceGraph.length > 0 ? sourceGraph.join(', ') : '(none)'}`,
      `  no source graph: ${noSourceGraph.length > 0 ? noSourceGraph.join(', ') : '(none)'}`,
      ...(typecheckExecution.length > 0
        ? [
            '  note: second-class checkers run through checker:typecheck; source graph participation is reported separately.',
          ]
        : []),
    ].join('\n'),
    { depth: 1 },
  );
}

function usesAutoCheckers(config: ResolvedLiminaConfig): boolean {
  return (
    config.config?.checkers === undefined ||
    isAutoCheckerConfigMode(config.config.checkers)
  );
}

function createSourceIssueReportOptions(
  options: RunPipelineOptions,
): SourceIssueReportOptions | undefined {
  if (!options.sourceIssueReport && !options.packageNames?.length) {
    return undefined;
  }

  return {
    ...options.sourceIssueReport,
    packageNames:
      options.sourceIssueReport?.packageNames ?? options.packageNames,
  };
}

function isBuiltinTaskName(value: string): value is BuiltinTaskName {
  return builtInTaskNames.has(value);
}

function assertNeverTaskName(taskName: never): never {
  throw new Error(`Unsupported built-in task: ${taskName}`);
}

function getPipelineStepLabel(step: NormalizedPipelineStep): string {
  if (step.type === 'task') {
    return step.name;
  }

  return [step.command, ...(step.args ?? [])].join(' ');
}

function describePipelineStep(
  step: NormalizedPipelineStep,
): LiminaCheckRunTaskPlan {
  return {
    kind: step.type,
    name: getPipelineStepLabel(step),
  };
}

function getPipelineSteps(
  config: ResolvedLiminaConfig,
  pipelineName: string,
): readonly PipelineStep[] {
  const steps = config.pipelines?.[pipelineName];

  if (!steps) {
    throw new Error(
      [
        `Pipeline instruction "${pipelineName}" was not found.`,
        `Define it in ${path.relative(config.rootDir, config.configPath)} under the "pipelines" field, then run "limina check ${pipelineName}" again.`,
      ].join('\n'),
    );
  }

  return steps;
}

function createCommandStepEnvironment(
  cwd: string,
  step: Extract<PipelineStep, { type: 'command' }>,
): NodeJS.ProcessEnv {
  const basePath = step.env?.PATH ?? process.env.PATH;

  return {
    ...process.env,
    ...step.env,
    PATH: [path.join(cwd, 'node_modules/.bin'), basePath]
      .filter(Boolean)
      .join(path.delimiter),
  };
}

function isVueTsgoCommand(command: string): boolean {
  const commandName = path.basename(command).toLowerCase();

  return commandName === 'vue-tsgo' || commandName === 'vue-tsgo.cmd';
}

function collectVueTsgoCommandConfigPaths(
  step: Extract<PipelineStep, { type: 'command' }>,
  cwd: string,
): string[] {
  if (!isVueTsgoCommand(step.command)) {
    return [];
  }

  const args = step.args ?? [];
  const configPaths: string[] = [];

  for (const [index, arg] of args.entries()) {
    if (
      arg !== '--build' &&
      arg !== '-b' &&
      arg !== '--project' &&
      arg !== '-p'
    ) {
      continue;
    }

    const configArg = args[index + 1];

    if (!configArg || configArg.startsWith('-')) {
      continue;
    }

    configPaths.push(path.resolve(cwd, configArg));
  }

  return configPaths.length > 0
    ? configPaths
    : [path.resolve(cwd, 'tsconfig.json')];
}

async function prepareCommandStepCache(
  step: Extract<PipelineStep, { type: 'command' }>,
  cwd: string,
): Promise<void> {
  await Promise.all(
    collectVueTsgoCommandConfigPaths(step, cwd).map((configPath) =>
      prepareVueTsgoCache({
        args: step.args ?? [],
        command: step.command,
        configPath,
        cwd,
        label: getPipelineStepLabel(step),
      }),
    ),
  );
}

function createCheckerTaskStats(
  result: CheckerTaskStatsInput,
): LiminaCheckRunTaskStats {
  if (result.rootConfigPaths.length === 0) {
    const issues = result.passed
      ? 0
      : Math.max(1, result.problems?.length ?? 1);

    return {
      items: [
        createCheckItemStats({
          issues,
          name: result.passed
            ? 'second-class checker entries'
            : 'checker dependency preflight',
          total: result.passed ? 0 : 1,
        }),
      ],
      passed: 0,
      total: result.passed ? 0 : 1,
    };
  }

  const failedConfigPaths = new Set(
    result.failedTargets.map((target) => target.configPath),
  );
  const targetResultsByConfigPath = new Map(
    result.targetResults?.map((targetResult) => [
      targetResult.configPath,
      targetResult,
    ]),
  );

  return {
    items: result.rootConfigPaths.map((configPath) =>
      createCheckItemStats({
        durationMs: targetResultsByConfigPath.get(configPath)?.durationMs,
        issues: failedConfigPaths.has(configPath) ? 1 : 0,
        name: formatCheckerEntryName(result.projectRootDir, configPath),
        total: 1,
      }),
    ),
    passed: Math.max(
      0,
      result.rootConfigPaths.length - result.failedTargets.length,
    ),
    total: result.rootConfigPaths.length,
  };
}

function createCommandTaskStats(options: {
  durationMs: number;
  passed: boolean;
}): LiminaCheckRunTaskStats {
  return {
    items: [
      createCheckItemStats({
        durationMs: options.durationMs,
        issues: options.passed ? 0 : 1,
        name: 'command execution',
        total: 1,
      }),
    ],
    passed: options.passed ? 1 : 0,
    total: 1,
  };
}

function renderFlowCheckItems(
  flow: LiminaFlowReporter | undefined,
  stats: LiminaCheckRunTaskStats | undefined,
): void {
  if (!flow || !stats?.items?.length) {
    return;
  }

  for (const item of stats.items) {
    const options = {
      depth: 2,
      ...(item.durationMs === undefined
        ? {}
        : { elapsedTimeMs: item.durationMs }),
    };

    if (item.status === 'passed') {
      flow.pass(item.name, options);
      continue;
    }

    flow.fail(item.name, options);
  }
}

function formatCheckerEntryName(
  projectRootDir: string,
  configPath: string,
): string {
  const relativePath = toRelativePath(projectRootDir, configPath);
  const checkerEntryMatch = /^\.limina\/tsconfig\/checkers\/([^/]+)\//u.exec(
    relativePath,
  );

  return checkerEntryMatch
    ? `${checkerEntryMatch[1]} checker entry`
    : relativePath;
}

async function runBuiltinTask(
  config: ResolvedLiminaConfig,
  taskName: BuiltinTaskName,
  options: RunPipelineOptions = {},
): Promise<BuiltinTaskResult> {
  let stats: LiminaCheckRunTaskStats | undefined;
  const onStats = (nextStats: LiminaCheckRunTaskStats): void => {
    stats = nextStats;
  };

  switch (taskName) {
    case 'graph:check': {
      const passed = await runGraphCheck(config, {
        clearScreen: false,
        core: options.core,
        flow: options.flow,
        flowDepth: 1,
        generatedGraphProvider: options.generatedGraphProvider,
        onStats,
        preflight: options.preflight,
        report: options.checkIssueReport,
      });

      return { passed, stats };
    }
    case 'graph:prepare': {
      const passed = await runGraphPrepare(config, {
        clearScreen: false,
        core: options.core,
        flow: options.flow,
        flowDepth: 1,
        generatedGraphProvider: options.generatedGraphProvider,
        preflight: options.preflight,
      });

      return { passed, stats };
    }
    case 'proof:check': {
      const passed = await runProofCheck(config, {
        clearScreen: false,
        core: options.core,
        flow: options.flow,
        flowDepth: 1,
        generatedGraphProvider: options.generatedGraphProvider,
        onStats,
        preflight: options.preflight,
        report: options.checkIssueReport,
      });

      return { passed, stats };
    }
    case 'source:check': {
      const passed = await runSourceCheck(config, {
        clearScreen: false,
        core: options.core,
        flow: options.flow,
        flowDepth: 1,
        generatedGraphProvider: options.generatedGraphProvider,
        onStats,
        preflight: options.preflight,
        report: createSourceIssueReportOptions(options),
      });

      return { passed, stats };
    }
    case 'package:check': {
      const passed = await runPackageCheck({
        clearScreen: false,
        config,
        core: options.core,
        cwd: options.cwd,
        flow: options.flow,
        flowDepth: 1,
        onStats,
        packageNames: options.packageNames,
        preflight: options.preflight,
        report: options.checkIssueReport,
      });

      return { passed, stats };
    }
    case 'release:check': {
      const passed = await runReleaseCheck({
        clearScreen: false,
        config,
        core: options.core,
        cwd: options.cwd,
        flow: options.flow,
        flowDepth: 1,
        onStats,
        packageNames: options.packageNames,
        preflight: options.preflight,
        report: options.checkIssueReport,
      });

      return { passed };
    }
    case 'checker:typecheck': {
      const result = await runCheckerTypecheck({
        clearScreen: false,
        config,
        core: options.core,
        cwd: config.rootDir,
        flow: options.flow,
        flowDepth: 1,
        generatedGraphProvider: options.generatedGraphProvider,
        preflight: options.preflight,
        report: options.checkIssueReport,
      });

      return {
        passed: result.passed,
        stats: createCheckerTaskStats(result),
      };
    }
    case 'checker:build': {
      const result = await runCheckerBuild({
        clearScreen: false,
        config,
        core: options.core,
        cwd: config.rootDir,
        flow: options.flow,
        flowDepth: 1,
        generatedGraphProvider: options.generatedGraphProvider,
        preflight: options.preflight,
        report: options.checkIssueReport,
      });

      return {
        passed: result.passed,
        stats: createCheckerTaskStats(result),
      };
    }
    default: {
      return assertNeverTaskName(taskName);
    }
  }
}

export function normalizePipelineStep(
  step: PipelineStep,
): NormalizedPipelineStep {
  if (typeof step !== 'string') {
    return step;
  }

  if (isBuiltinTaskName(step)) {
    return {
      name: step,
      type: 'task',
    };
  }

  const [command, ...args] = step.split(/\s+/u).filter(Boolean);

  if (!command) {
    throw new Error('Pipeline command step must not be empty.');
  }

  return {
    args,
    command,
    type: 'command',
  };
}

export function describeDefaultCheckPipeline(): LiminaCheckRunTaskPlan[] {
  return defaultCheckPipeline
    .map(normalizePipelineStep)
    .map(describePipelineStep);
}

export function describePipeline(
  config: ResolvedLiminaConfig,
  pipelineName: string,
): LiminaCheckRunTaskPlan[] {
  return getPipelineSteps(config, pipelineName)
    .map(normalizePipelineStep)
    .map(describePipelineStep);
}

async function runCommandStep(
  config: ResolvedLiminaConfig,
  step: Extract<PipelineStep, { type: 'command' }>,
  options: RunPipelineOptions = {},
): Promise<boolean> {
  const label = getPipelineStepLabel(step);
  const task = options.flow?.start(`command: ${label}`, { depth: 1 });
  const cwd = step.cwd
    ? path.resolve(config.rootDir, step.cwd)
    : config.rootDir;
  const commandOptions = {
    cwd,
    env: createCommandStepEnvironment(cwd, step),
    shell: process.platform === 'win32',
  };

  await prepareCommandStepCache(step, cwd);

  if (options.flow?.interactive) {
    return new Promise((resolve, reject) => {
      const child = spawn(step.command, step.args ?? [], {
        ...commandOptions,
        stdio: ['inherit', 'pipe', 'pipe'],
      });

      child.stdout?.on('data', (chunk: Uint8Array) => {
        options.flow?.writeOutput(chunk, { stream: 'stdout' });
      });
      child.stderr?.on('data', (chunk: Uint8Array) => {
        options.flow?.writeOutput(chunk, { stream: 'stderr' });
      });

      child.on('error', (error) => {
        task?.fail(undefined, { error });
        reject(error);
      });
      child.on('close', (code) => {
        const passed = (code ?? 1) === 0;

        if (passed) {
          task?.pass();
        } else {
          task?.fail(`command failed: ${label} exited with code ${code ?? 1}`);
        }

        const snapshotWrite = passed
          ? Promise.resolve()
          : appendCheckIssues({
              issues: [
                createTaskFailureIssue({
                  code: 'LIMINA_COMMAND_FAILED',
                  evidence: [
                    { label: 'command', value: step.command },
                    { label: 'exit code', value: String(code ?? 1) },
                  ],
                  fix: 'Inspect the command output above, then rerun the pipeline.',
                  fixSteps: [
                    'Inspect the command output above this issue.',
                    'Fix the failing task or command configuration.',
                    `Rerun the pipeline command that includes "${label}".`,
                  ],
                  reason: `Pipeline command "${label}" exited with code ${code ?? 1}.`,
                  rootDir: config.rootDir,
                  task: 'command',
                  title: 'Pipeline command failed',
                  tool: step.command,
                  verifyCommands: [step.command],
                }),
              ],
              rootDir: config.rootDir,
            });

        snapshotWrite.then(() => {
          resolve(passed);
        }, reject);
      });
    });
  }

  const result = spawnSync(step.command, step.args ?? [], {
    ...commandOptions,
    stdio: 'inherit',
  });

  if (result.error) {
    task?.fail(undefined, { error: result.error });
    throw result.error;
  }

  const passed = (result.status ?? 1) === 0;

  if (passed) {
    task?.pass();
  } else {
    await appendCheckIssues({
      issues: [
        createTaskFailureIssue({
          code: 'LIMINA_COMMAND_FAILED',
          evidence: [
            { label: 'command', value: step.command },
            { label: 'exit code', value: String(result.status ?? 1) },
          ],
          fix: 'Inspect the command output above, then rerun the pipeline.',
          fixSteps: [
            'Inspect the command output above this issue.',
            'Fix the failing task or command configuration.',
            `Rerun the pipeline command that includes "${label}".`,
          ],
          reason: `Pipeline command "${label}" exited with code ${result.status ?? 1}.`,
          rootDir: config.rootDir,
          task: 'command',
          title: 'Pipeline command failed',
          tool: step.command,
          verifyCommands: [step.command],
        }),
      ],
      rootDir: config.rootDir,
    });
    task?.fail(
      `command failed: ${label} exited with code ${result.status ?? 1}`,
    );
  }

  return passed;
}

export async function runPipeline(
  config: ResolvedLiminaConfig,
  pipelineName: string,
  options: RunPipelineOptions = {},
): Promise<boolean> {
  const normalizedSteps = getPipelineSteps(config, pipelineName).map(
    normalizePipelineStep,
  );
  const pipelineTask = options.flow?.start(`pipeline: ${pipelineName}`, {
    collapseOnSuccess: false,
  });
  const preflight =
    options.preflight ??
    new LiminaPreflightManager({
      config,
      core: options.core,
      generatedGraphProvider: options.generatedGraphProvider,
    });
  const core = preflight.core;
  const taskOptions = {
    ...options,
    core,
    generatedGraphProvider: () => preflight.ensureGeneratedGraph(),
    preflight,
  };
  let hasFailure = false;

  for (const [stepIndex, step] of normalizedSteps.entries()) {
    const label = getPipelineStepLabel(step);

    await options.checkRunRecorder?.start(label);

    let passed: boolean;
    let stats: LiminaCheckRunTaskStats | undefined;

    try {
      if (step.type === 'task') {
        const result = await runBuiltinTask(config, step.name, taskOptions);

        passed = result.passed;
        stats = result.stats;
      } else {
        const startedAt = performance.now();

        passed = await runCommandStep(config, step, options);
        stats = createCommandTaskStats({
          durationMs: performance.now() - startedAt,
          passed,
        });
      }
    } catch (error) {
      await options.checkRunRecorder?.block(
        label,
        error instanceof Error ? error.message : String(error),
      );
      pipelineTask?.fail(`pipeline blocked: ${pipelineName} at ${label}`);

      for (const remainingStep of normalizedSteps.slice(stepIndex + 1)) {
        const remainingLabel = getPipelineStepLabel(remainingStep);

        options.flow?.skip(`skipped: ${remainingLabel} (blocked by ${label})`, {
          depth: 1,
        });
        await options.checkRunRecorder?.skip(remainingLabel, label);
      }

      await options.checkRunRecorder?.finish('blocked');
      throw error;
    }

    if (step.type === 'command') {
      preflight.invalidateAll();
    }

    renderFlowCheckItems(options.flow, stats);

    if (!passed) {
      if (step.type === 'command') {
        await options.checkRunRecorder?.block(label, `${label} failed`, stats);
        pipelineTask?.fail(`pipeline blocked: ${pipelineName} at ${label}`);

        for (const remainingStep of normalizedSteps.slice(stepIndex + 1)) {
          const remainingLabel = getPipelineStepLabel(remainingStep);

          options.flow?.skip(
            `skipped: ${remainingLabel} (blocked by ${label})`,
            {
              depth: 1,
            },
          );
          await options.checkRunRecorder?.skip(remainingLabel, label);
        }

        await options.checkRunRecorder?.finish('blocked');
        return false;
      }

      await options.checkRunRecorder?.fail(label, `${label} failed`, stats);
      hasFailure = true;
      continue;
    }

    await options.checkRunRecorder?.pass(label, stats);
  }

  if (hasFailure) {
    pipelineTask?.fail(`pipeline finished with failures: ${pipelineName}`);
  } else {
    pipelineTask?.pass();
  }
  await completeCheckIssueSnapshot({
    rootDir: config.rootDir,
  });
  await options.checkRunRecorder?.finish(hasFailure ? 'failed' : 'passed');

  return !hasFailure;
}

export async function runDefaultCheck(
  config: ResolvedLiminaConfig,
  options: RunPipelineOptions = {},
): Promise<boolean> {
  const normalizedSteps = defaultCheckPipeline.map(normalizePipelineStep);
  const pipelineTask = options.flow?.start('default check', {
    collapseOnSuccess: false,
  });
  const preflight =
    options.preflight ??
    new LiminaPreflightManager({
      config,
      core: options.core,
      generatedGraphProvider: options.generatedGraphProvider,
    });
  const core = preflight.core;
  const taskOptions = {
    ...options,
    core,
    generatedGraphProvider: () => preflight.ensureGeneratedGraph(),
    preflight,
  };
  let hasFailure = false;

  if (!usesAutoCheckers(config)) {
    reportCheckerCapabilities(config, options.flow);
  }

  for (const [stepIndex, step] of normalizedSteps.entries()) {
    const label = getPipelineStepLabel(step);

    await options.checkRunRecorder?.start(label);

    let passed: boolean;
    let stats: LiminaCheckRunTaskStats | undefined;

    try {
      if (step.type === 'task') {
        const result = await runBuiltinTask(config, step.name, taskOptions);

        passed = result.passed;
        stats = result.stats;
      } else {
        const startedAt = performance.now();

        passed = await runCommandStep(config, step, options);
        stats = createCommandTaskStats({
          durationMs: performance.now() - startedAt,
          passed,
        });
      }
    } catch (error) {
      await options.checkRunRecorder?.block(
        label,
        error instanceof Error ? error.message : String(error),
      );
      pipelineTask?.fail(`default check blocked at ${label}`);

      for (const remainingStep of normalizedSteps.slice(stepIndex + 1)) {
        const remainingLabel = getPipelineStepLabel(remainingStep);

        options.flow?.skip(`skipped: ${remainingLabel} (blocked by ${label})`, {
          depth: 1,
        });
        await options.checkRunRecorder?.skip(remainingLabel, label);
      }

      await options.checkRunRecorder?.finish('blocked');
      throw error;
    }

    if (step.type === 'command') {
      preflight.invalidateAll();
    }

    renderFlowCheckItems(options.flow, stats);

    if (passed) {
      await options.checkRunRecorder?.pass(label, stats);
    } else {
      if (step.type === 'command') {
        await options.checkRunRecorder?.block(label, `${label} failed`, stats);
        pipelineTask?.fail(`default check blocked at ${label}`);

        for (const remainingStep of normalizedSteps.slice(stepIndex + 1)) {
          const remainingLabel = getPipelineStepLabel(remainingStep);

          options.flow?.skip(
            `skipped: ${remainingLabel} (blocked by ${label})`,
            {
              depth: 1,
            },
          );
          await options.checkRunRecorder?.skip(remainingLabel, label);
        }

        await options.checkRunRecorder?.finish('blocked');
        return false;
      }

      await options.checkRunRecorder?.fail(label, `${label} failed`, stats);
      hasFailure = true;
    }

    if (usesAutoCheckers(config) && step.type === 'task') {
      if (step.name === 'graph:check' || step.name === 'graph:prepare') {
        reportCheckerCapabilities(
          config,
          options.flow,
          (await preflight.ensureGeneratedGraph()).checkers,
        );
      }
    }
  }

  if (hasFailure) {
    pipelineTask?.fail('default check finished with failures');
  } else {
    pipelineTask?.pass();
  }
  await completeCheckIssueSnapshot({
    rootDir: config.rootDir,
  });
  await options.checkRunRecorder?.finish(hasFailure ? 'failed' : 'passed');

  return !hasFailure;
}
