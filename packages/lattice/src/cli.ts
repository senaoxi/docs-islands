#!/usr/bin/env node
import { cac } from 'cac';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { runGraphCheck } from './commands/graph';
import { runPackageCheck } from './commands/package';
import { runPaths } from './commands/paths';
import { runProofCheck } from './commands/proof';
import { runTypecheck } from './commands/typecheck';
import {
  loadConfig,
  type BuiltinTaskName,
  type LatticeCommand,
  type PackageAttwProfile,
  type PackageCheckToolSelection,
  type PipelineStep,
  type ResolvedLatticeConfig,
} from './config';
import { CliLogger, formatErrorMessage } from './logger';

interface GlobalFlags {
  config?: string;
  mode?: string;
}

interface PackageFlags extends GlobalFlags {
  attwProfile?: string;
  package?: string;
  tool?: string;
}

interface TscFlags extends GlobalFlags {
  concurrency?: string;
  project?: string;
}

type NormalizedPipelineStep = Exclude<PipelineStep, string>;

async function load(
  flags: GlobalFlags,
  command: LatticeCommand,
): Promise<ResolvedLatticeConfig> {
  return loadConfig({
    command,
    configPath: flags.config,
    cwd: process.cwd(),
    mode: flags.mode,
  });
}

async function runBuiltinTask(
  config: ResolvedLatticeConfig,
  taskName: BuiltinTaskName,
): Promise<boolean> {
  switch (taskName) {
    case 'graph:check': {
      return runGraphCheck(config);
    }
    case 'proof:check': {
      return runProofCheck(config);
    }
    case 'package:check': {
      return runPackageCheck({ config });
    }
    case 'tsc:run': {
      const result = await runTypecheck({
        cwd: config.rootDir,
      });

      return result.passed;
    }
  }
}

function normalizePipelineStep(step: PipelineStep): NormalizedPipelineStep {
  if (typeof step !== 'string') {
    return step;
  }

  if (
    step === 'graph:check' ||
    step === 'proof:check' ||
    step === 'package:check' ||
    step === 'tsc:run'
  ) {
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

function parsePackageTool(
  tool: string | undefined,
): PackageCheckToolSelection | undefined {
  if (!tool) {
    return undefined;
  }

  if (
    tool === 'all' ||
    tool === 'publint' ||
    tool === 'attw' ||
    tool === 'boundary'
  ) {
    return tool;
  }

  throw new Error(
    `Invalid package check --tool "${tool}". Expected one of: all, publint, attw, boundary.`,
  );
}

function parsePackageAttwProfile(
  profile: string | undefined,
): PackageAttwProfile | undefined {
  if (!profile) {
    return undefined;
  }

  if (profile === 'strict' || profile === 'node16' || profile === 'esm-only') {
    return profile;
  }

  throw new Error(
    `Invalid package check --attw-profile "${profile}". Expected one of: strict, node16, esm-only.`,
  );
}

function parseConcurrency(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(
      'Invalid --concurrency value. Expected a positive integer.',
    );
  }

  return parsed;
}

function runCommandStep(
  config: ResolvedLatticeConfig,
  step: Extract<PipelineStep, { type: 'command' }>,
): boolean {
  const result = spawnSync(step.command, step.args ?? [], {
    cwd: step.cwd ? path.resolve(config.rootDir, step.cwd) : config.rootDir,
    env: {
      ...process.env,
      ...step.env,
    },
    shell: process.platform === 'win32',
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  return (result.status ?? 1) === 0;
}

async function runPipeline(
  config: ResolvedLatticeConfig,
  pipelineName: string,
): Promise<boolean> {
  const steps = config.pipelines?.[pipelineName];

  if (!steps) {
    throw new Error(`Unknown lattice pipeline "${pipelineName}".`);
  }

  for (const rawStep of steps) {
    const step = normalizePipelineStep(rawStep);
    const passed =
      step.type === 'task'
        ? await runBuiltinTask(config, step.name)
        : runCommandStep(config, step);

    if (!passed) {
      return false;
    }
  }

  return true;
}

async function main(): Promise<void> {
  const cli = cac('lattice');

  cli.option('--config <path>', 'Path to lattice.config.mjs');
  cli.option('--mode <mode>', 'Mode passed to lattice config functions');
  cli.help();

  cli
    .command('check <pipeline>', 'Run a configured governance pipeline')
    .action(async (pipeline: string, flags: GlobalFlags) => {
      const config = await load(flags, 'check');
      const passed = await runPipeline(config, pipeline);

      if (!passed) {
        process.exitCode = 1;
      }
    });

  cli
    .command(
      'paths <action>',
      'Generate source paths for workspace dependency artifact exports',
    )
    .action(async (action: string, flags: GlobalFlags) => {
      if (action !== 'generate' && action !== 'apply' && action !== 'check') {
        throw new Error(
          `Unknown paths action "${action}". Expected generate, apply, or check.`,
        );
      }
      const config = await load(flags, 'paths');
      const result = await runPaths(config, { check: action === 'check' });

      if (action === 'check' && result.changed) {
        process.exitCode = 1;
      }
    });

  cli
    .command('graph <action>', 'Check TypeScript graph architecture')
    .action(async (action: string, flags: GlobalFlags) => {
      if (action !== 'check') {
        throw new Error(`Unknown graph action "${action}". Expected check.`);
      }
      const config = await load(flags, 'graph');

      if (!(await runGraphCheck(config))) {
        process.exitCode = 1;
      }
    });

  cli
    .command('proof <action>', 'Check root typecheck coverage proof')
    .action(async (action: string, flags: GlobalFlags) => {
      if (action !== 'check') {
        throw new Error(`Unknown proof action "${action}". Expected check.`);
      }
      const config = await load(flags, 'proof');

      if (!(await runProofCheck(config))) {
        process.exitCode = 1;
      }
    });

  cli
    .command('tsc', 'Run tsc for TypeScript typecheck target configs')
    .option('-p, --project <path>', 'Tsconfig file or directory')
    .option('--concurrency <n>', 'Maximum concurrent tsc processes')
    .action(async (flags: TscFlags) => {
      const result = await runTypecheck({
        concurrency: parseConcurrency(flags.concurrency),
        cwd: process.cwd(),
        project: flags.project,
      });

      if (!result.passed) {
        process.exitCode = 1;
      }
    });

  cli
    .command('package <action>', 'Check configured published package outputs')
    .option('-p, --package <name>', 'Run a single package check target')
    .option('--tool <tool>', 'Run one package check tool')
    .option('--attw-profile <profile>', 'Override the configured ATTW profile')
    .action(async (action: string, flags: PackageFlags) => {
      if (action !== 'check') {
        throw new Error(`Unknown package action "${action}". Expected check.`);
      }
      const config = await load(flags, 'package');

      if (
        !(await runPackageCheck({
          attwProfile: parsePackageAttwProfile(flags.attwProfile),
          config,
          targetName: flags.package,
          tool: parsePackageTool(flags.tool),
        }))
      ) {
        process.exitCode = 1;
      }
    });

  cli.parse(process.argv, { run: false });

  try {
    await cli.runMatchedCommand();
  } catch (error) {
    CliLogger.error(`lattice failed: ${formatErrorMessage(error)}`);
    process.exitCode = 1;
  }
}

await main();
