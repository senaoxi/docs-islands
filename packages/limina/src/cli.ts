#!/usr/bin/env node
import { cac } from 'cac';
import path from 'pathe';
import {
  runGraphCheck,
  runGraphExport,
  runGraphPrepare,
} from './commands/graph';
import { runInit } from './commands/init';
import { runPackageCheck } from './commands/package';
import { runProofCheck } from './commands/proof';
import { runReleaseCheck } from './commands/release';
import { runSourceCheck } from './commands/source';
import {
  runBuild,
  runCheckerBuild,
  runCheckerTypecheck,
} from './commands/typecheck';
import {
  type BuildCheckerPreset,
  type LiminaCommand,
  loadConfig,
  type PackageAttwProfile,
  type PackageCheckToolSelection,
  type ResolvedLiminaConfig,
} from './config';
import {
  type DependencyGraphView,
  stringifyDependencyGraph,
} from './dependency-graph';
import { createLiminaFlowReporter } from './flow';
import { clearCliScreen, CliLogger, formatErrorMessage } from './logger';
import { runDefaultCheck, runPipeline } from './pipeline';
import type { SourceIssueReportOptions } from './source-check/report';

interface GlobalFlags {
  config?: string;
  mode?: string;
}

interface PackageSelectionFlags {
  package?: string | string[];
}

interface SourceIssueSelectionFlags extends PackageSelectionFlags {
  file?: string | string[];
  rule?: string | string[];
  scope?: string | string[];
  verbose?: boolean;
}

interface CheckFlags extends GlobalFlags, SourceIssueSelectionFlags {}

interface SourceFlags extends GlobalFlags, SourceIssueSelectionFlags {}

interface PackageFlags extends GlobalFlags, PackageSelectionFlags {
  attwProfile?: string;
  tool?: string;
}

interface CheckerFlags extends GlobalFlags {
  '--'?: string[];
  checker?: unknown;
  preset?: string;
  project?: unknown;
  w?: boolean;
  watch?: boolean;
}

interface GraphFlags extends GlobalFlags {
  output?: string;
  view?: string;
}

interface InitFlags {
  yes?: boolean;
}

async function load(
  flags: GlobalFlags,
  command: LiminaCommand,
): Promise<ResolvedLiminaConfig> {
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

function parseBuildPreset(
  preset: string | undefined,
): BuildCheckerPreset | undefined {
  if (!preset) {
    return undefined;
  }

  if (preset === 'tsc' || preset === 'vue-tsc' || preset === 'tsgo') {
    return preset;
  }

  throw new Error(
    `Invalid checker build --preset "${preset}". Expected one of: tsc, vue-tsc, tsgo.`,
  );
}

function rejectUnknownCheckerOptions(flags: CheckerFlags): void {
  if (flags.checker !== undefined) {
    throw new Error('Unknown option: --checker. Use --preset instead.');
  }

  if (flags.project !== undefined) {
    throw new Error(
      'Unknown option: --project. Pass the config as a positional argument.',
    );
  }

  const knownOptions = new Set([
    '--',
    'config',
    'mode',
    'preset',
    'w',
    'watch',
    'checker',
    'project',
  ]);

  for (const option of Object.keys(flags)) {
    if (!knownOptions.has(option)) {
      throw new Error(`Unknown option: --${option}.`);
    }
  }
}

function getCheckerWatchFlag(flags: CheckerFlags): boolean | undefined {
  return flags.watch ?? flags.w;
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

function parsePackageNames(
  packageName: string | string[] | undefined,
): string[] | undefined {
  if (!packageName) {
    return undefined;
  }

  const packageNames = (
    Array.isArray(packageName) ? packageName : [packageName]
  )
    .map((name) => name.trim())
    .filter(Boolean);

  return packageNames.length > 0 ? packageNames : undefined;
}

function parseRepeatedStrings(
  value: string | string[] | undefined,
): string[] | undefined {
  if (!value) {
    return undefined;
  }

  const values = (Array.isArray(value) ? value : [value])
    .map((item) => item.trim())
    .filter(Boolean);

  return values.length > 0 ? values : undefined;
}

function createSourceIssueReportOptions(
  flags: SourceIssueSelectionFlags,
  command: string,
): SourceIssueReportOptions {
  return {
    command,
    files: parseRepeatedStrings(flags.file),
    packageNames: parsePackageNames(flags.package),
    rules: parseRepeatedStrings(flags.rule),
    scopes: parseRepeatedStrings(flags.scope),
    verbose: flags.verbose,
  };
}

function parseDependencyGraphView(
  view: string | undefined,
): DependencyGraphView | undefined {
  if (!view) {
    return undefined;
  }

  if (view === 'all' || view === 'artifact' || view === 'source') {
    return view;
  }

  throw new Error(
    `Invalid graph export --view "${view}". Expected one of: all, artifact, source.`,
  );
}

function createCliFlow() {
  clearCliScreen();

  return createLiminaFlowReporter();
}

async function main(): Promise<void> {
  const cli = cac('limina');

  cli.option('--config <path>', 'Path to limina.config.mjs');
  cli.option('--mode <mode>', 'Mode passed to limina config functions');
  cli.help();

  cli
    .command('init', 'Initialize Limina files for a pnpm workspace')
    .option('--yes', 'Accept all init prompts')
    .action(async (flags: InitFlags) => {
      const flow = createCliFlow();
      flow.intro('limina init');
      await runInit({
        clearScreen: false,
        cwd: process.cwd(),
        flow,
        yes: flags.yes,
      });
      flow.outro('limina init finished');
    });

  cli
    .command(
      'check [pipeline]',
      'Run the default check or a configured pipeline',
    )
    .option(
      '-p, --package <name>',
      'Run package-aware pipeline tasks for one package entry',
    )
    .option('--verbose', 'Show full source issue details')
    .option('--rule <code>', 'Filter source issue details by stable rule code')
    .option('--file <path>', 'Filter source issue details by exact file path')
    .option('--scope <glob>', 'Filter source issue details by path scope')
    .action(async (pipeline: string | undefined, flags: CheckFlags) => {
      const flow = createCliFlow();
      flow.intro('limina check');
      const config = await load(flags, 'check');
      const packageNames = parsePackageNames(flags.package);
      const sourceIssueReport = createSourceIssueReportOptions(
        flags,
        pipeline ? `limina check ${pipeline}` : 'limina check',
      );
      const passed = pipeline
        ? await runPipeline(config, pipeline, {
            cwd: process.cwd(),
            flow,
            packageNames,
            sourceIssueReport,
          })
        : await runDefaultCheck(config, {
            cwd: process.cwd(),
            flow,
            packageNames,
            sourceIssueReport,
          });

      if (!passed) {
        process.exitCode = 1;
      }

      flow.outro(passed ? 'limina check passed' : 'limina check failed');
    });

  cli
    .command(
      'graph <action>',
      'Prepare, check, or export TypeScript graph architecture',
    )
    .option('--view <view>', 'Dependency graph view: all, source, or artifact')
    .option('--output <path>', 'Write graph export JSON to this file')
    .action(async (action: string, flags: GraphFlags) => {
      if (action !== 'check' && action !== 'prepare' && action !== 'export') {
        throw new Error(
          `Unknown graph action "${action}". Expected check, prepare, or export.`,
        );
      }

      if (action === 'export') {
        const config = await load(flags, 'graph');
        const graph = await runGraphExport(config, {
          outputPath: flags.output
            ? path.resolve(process.cwd(), flags.output)
            : undefined,
          view: parseDependencyGraphView(flags.view),
        });

        if (!flags.output) {
          process.stdout.write(stringifyDependencyGraph(graph));
        }

        return;
      }

      const flow = createCliFlow();
      flow.intro(`limina graph ${action}`);
      const config = await load(flags, 'graph');

      if (action === 'check') {
        const passed = await runGraphCheck(config, {
          clearScreen: false,
          flow,
        });

        if (!passed) {
          process.exitCode = 1;
        }

        flow.outro(passed ? 'limina graph passed' : 'limina graph failed');
        return;
      }

      const passed = await runGraphPrepare(config, {
        clearScreen: false,
        flow,
      });

      if (!passed) {
        process.exitCode = 1;
      }

      flow.outro(passed ? 'limina graph passed' : 'limina graph failed');
    });

  cli
    .command('proof <action>', 'Check root typecheck coverage proof')
    .action(async (action: string, flags: GlobalFlags) => {
      if (action !== 'check') {
        throw new Error(`Unknown proof action "${action}". Expected check.`);
      }
      const flow = createCliFlow();
      flow.intro('limina proof check');
      const config = await load(flags, 'proof');
      const passed = await runProofCheck(config, {
        clearScreen: false,
        flow,
      });

      if (!passed) {
        process.exitCode = 1;
      }

      flow.outro(passed ? 'limina proof passed' : 'limina proof failed');
    });

  cli
    .command('source <action>', 'Check source package boundaries')
    .option('-p, --package <name>', 'Filter source issue details by package')
    .option('--verbose', 'Show full source issue details')
    .option('--rule <code>', 'Filter source issue details by stable rule code')
    .option('--file <path>', 'Filter source issue details by exact file path')
    .option('--scope <glob>', 'Filter source issue details by path scope')
    .action(async (action: string, flags: SourceFlags) => {
      if (action !== 'check') {
        throw new Error(`Unknown source action "${action}". Expected check.`);
      }
      const flow = createCliFlow();
      flow.intro('limina source check');
      const config = await load(flags, 'source');
      const passed = await runSourceCheck(config, {
        clearScreen: false,
        flow,
        report: createSourceIssueReportOptions(flags, 'limina source check'),
      });

      if (!passed) {
        process.exitCode = 1;
      }

      flow.outro(passed ? 'limina source passed' : 'limina source failed');
    });

  cli
    .command(
      'checker <action> [config]',
      'Run checker build or typecheck entries',
    )
    .option('--preset <preset>', 'Build checker preset: tsc, vue-tsc, or tsgo')
    .option('-w, --watch', 'Watch input files and rebuild on changes')
    .allowUnknownOptions()
    .action(
      async (
        action: string,
        configPath: string | undefined,
        flags: CheckerFlags,
      ) => {
        rejectUnknownCheckerOptions(flags);

        if (action !== 'typecheck' && action !== 'build') {
          throw new Error(
            `Unknown checker action "${action}". Expected build or typecheck.`,
          );
        }

        const flow = createCliFlow();
        flow.intro(`limina checker ${action}`);

        if (action === 'build') {
          const watch = getCheckerWatchFlag(flags);

          if (!configPath && flags.preset) {
            throw new Error(
              'checker build --preset requires a config argument.',
            );
          }

          if (!configPath && watch) {
            throw new Error(
              'checker build --watch requires a config argument.',
            );
          }

          const config = await load(flags, configPath ? 'build' : 'check');
          const result = configPath
            ? await runBuild({
                checker: parseBuildPreset(flags.preset),
                clearScreen: false,
                config,
                configPath,
                cwd: process.cwd(),
                flow,
                watch,
              })
            : await runCheckerBuild({
                clearScreen: false,
                config,
                cwd: process.cwd(),
                flow,
              });

          if (!result.passed) {
            process.exitCode = 1;
          }

          flow.outro(
            result.passed ? 'limina checker passed' : 'limina checker failed',
          );

          return;
        }

        if (configPath) {
          throw new Error(
            'checker typecheck does not accept a config argument.',
          );
        }

        if (flags.preset) {
          throw new Error('checker typecheck does not accept --preset.');
        }

        if (getCheckerWatchFlag(flags)) {
          throw new Error('checker typecheck does not accept --watch.');
        }

        const config = await load(flags, 'check');
        const result = await runCheckerTypecheck({
          clearScreen: false,
          config,
          cwd: process.cwd(),
          flow,
        });

        if (!result.passed) {
          process.exitCode = 1;
        }

        flow.outro(
          result.passed ? 'limina checker passed' : 'limina checker failed',
        );
      },
    );

  cli
    .command('package <action>', 'Check configured published package outputs')
    .option('-p, --package <name>', 'Run one package check entry')
    .option('--tool <tool>', 'Run one package check tool')
    .option('--attw-profile <profile>', 'Override the configured ATTW profile')
    .action(async (action: string, flags: PackageFlags) => {
      if (action !== 'check') {
        throw new Error(`Unknown package action "${action}". Expected check.`);
      }
      const flow = createCliFlow();
      flow.intro('limina package check');
      const config = await load(flags, 'package');
      const passed = await runPackageCheck({
        attwProfile: parsePackageAttwProfile(flags.attwProfile),
        clearScreen: false,
        config,
        cwd: process.cwd(),
        flow,
        packageNames: parsePackageNames(flags.package),
        tool: parsePackageTool(flags.tool),
      });

      if (!passed) {
        process.exitCode = 1;
      }

      flow.outro(passed ? 'limina package passed' : 'limina package failed');
    });

  cli
    .command('release <action>', 'Check package release readiness')
    .option('-p, --package <name>', 'Run one release check package entry')
    .action(async (action: string, flags: CheckFlags) => {
      if (action !== 'check') {
        throw new Error(`Unknown release action "${action}". Expected check.`);
      }
      const flow = createCliFlow();
      flow.intro('limina release check');
      const config = await load(flags, 'release');
      const passed = await runReleaseCheck({
        clearScreen: false,
        config,
        cwd: process.cwd(),
        flow,
        packageNames: parsePackageNames(flags.package),
      });

      if (!passed) {
        process.exitCode = 1;
      }

      flow.outro(passed ? 'limina release passed' : 'limina release failed');
    });

  cli.parse(process.argv, { run: false });

  try {
    const commandName = cli.args[0];

    if (!cli.matchedCommand && commandName) {
      throw new Error(`Unknown command "${commandName}".`);
    }

    await cli.runMatchedCommand();
  } catch (error) {
    CliLogger.error(`limina failed: ${formatErrorMessage(error)}`);
    process.exitCode = 1;
  }
}

await main();
