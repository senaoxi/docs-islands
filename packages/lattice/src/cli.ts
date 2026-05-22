#!/usr/bin/env node
import { cac } from 'cac';
import { runGraphCheck } from './commands/graph';
import { runPackageCheck } from './commands/package';
import { runPaths } from './commands/paths';
import { runProofCheck } from './commands/proof';
import { runCheckerBuild, runCheckerTypecheck } from './commands/typecheck';
import {
  loadConfig,
  type LatticeCommand,
  type PackageAttwProfile,
  type PackageCheckToolSelection,
  type ResolvedLatticeConfig,
} from './config';
import { createLatticeFlowReporter } from './flow';
import { CliLogger, clearCliScreen, formatErrorMessage } from './logger';
import { runPipeline } from './pipeline';

interface GlobalFlags {
  config?: string;
  mode?: string;
}

interface PackageFlags extends GlobalFlags {
  attwProfile?: string;
  package?: string;
  tool?: string;
}

interface CheckerFlags extends GlobalFlags {
  concurrency?: string;
}

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

function createCliFlow() {
  clearCliScreen();

  return createLatticeFlowReporter();
}

async function main(): Promise<void> {
  const cli = cac('lattice');

  cli.option('--config <path>', 'Path to lattice.config.mjs');
  cli.option('--mode <mode>', 'Mode passed to lattice config functions');
  cli.help();

  cli
    .command('check <pipeline>', 'Run a configured governance pipeline')
    .action(async (pipeline: string, flags: GlobalFlags) => {
      const flow = createCliFlow();
      flow.intro('lattice check');
      const config = await load(flags, 'check');
      const passed = await runPipeline(config, pipeline, {
        cwd: process.cwd(),
        flow,
      });

      if (!passed) {
        process.exitCode = 1;
      }

      flow.outro(passed ? 'lattice check passed' : 'lattice check failed');
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
      const flow = createCliFlow();
      flow.intro(`lattice paths ${action}`);
      const config = await load(flags, 'paths');
      const result = await runPaths(config, {
        check: action === 'check',
        clearScreen: false,
        flow,
      });

      if (action === 'check' && result.changed) {
        process.exitCode = 1;
      }

      flow.outro(
        action === 'check' && result.changed
          ? 'lattice paths failed'
          : 'lattice paths passed',
      );
    });

  cli
    .command('graph <action>', 'Check TypeScript graph architecture')
    .action(async (action: string, flags: GlobalFlags) => {
      if (action !== 'check') {
        throw new Error(`Unknown graph action "${action}". Expected check.`);
      }
      const flow = createCliFlow();
      flow.intro('lattice graph check');
      const config = await load(flags, 'graph');
      const passed = await runGraphCheck(config, {
        clearScreen: false,
        flow,
      });

      if (!passed) {
        process.exitCode = 1;
      }

      flow.outro(passed ? 'lattice graph passed' : 'lattice graph failed');
    });

  cli
    .command('proof <action>', 'Check root typecheck coverage proof')
    .action(async (action: string, flags: GlobalFlags) => {
      if (action !== 'check') {
        throw new Error(`Unknown proof action "${action}". Expected check.`);
      }
      const flow = createCliFlow();
      flow.intro('lattice proof check');
      const config = await load(flags, 'proof');
      const passed = await runProofCheck(config, {
        clearScreen: false,
        flow,
      });

      if (!passed) {
        process.exitCode = 1;
      }

      flow.outro(passed ? 'lattice proof passed' : 'lattice proof failed');
    });

  cli
    .command(
      'checker <action>',
      'Run configured checker typecheck or build routes',
    )
    .option('--concurrency <n>', 'Maximum concurrent checker processes')
    .action(async (action: string, flags: CheckerFlags) => {
      if (action !== 'typecheck' && action !== 'build') {
        throw new Error(
          `Unknown checker action "${action}". Expected typecheck or build.`,
        );
      }

      const flow = createCliFlow();
      flow.intro(`lattice checker ${action}`);

      if (action === 'build') {
        const config = await load(flags, 'check');
        const result = await runCheckerBuild({
          clearScreen: false,
          config,
          cwd: process.cwd(),
          flow,
        });

        if (!result.passed) {
          process.exitCode = 1;
        }

        flow.outro(
          result.passed ? 'lattice checker passed' : 'lattice checker failed',
        );

        return;
      }

      const config = await load(flags, 'check');
      const result = await runCheckerTypecheck({
        clearScreen: false,
        config,
        concurrency: parseConcurrency(flags.concurrency),
        cwd: process.cwd(),
        flow,
      });

      if (!result.passed) {
        process.exitCode = 1;
      }

      flow.outro(
        result.passed ? 'lattice checker passed' : 'lattice checker failed',
      );
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
      const flow = createCliFlow();
      flow.intro('lattice package check');
      const config = await load(flags, 'package');
      const passed = await runPackageCheck({
        attwProfile: parsePackageAttwProfile(flags.attwProfile),
        clearScreen: false,
        config,
        cwd: process.cwd(),
        flow,
        targetName: flags.package,
        tool: parsePackageTool(flags.tool),
      });

      if (!passed) {
        process.exitCode = 1;
      }

      flow.outro(passed ? 'lattice package passed' : 'lattice package failed');
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
