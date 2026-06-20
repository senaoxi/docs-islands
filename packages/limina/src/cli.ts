#!/usr/bin/env node
import {
  type BuildCheckerPreset,
  type LiminaCommand,
  loadConfig,
  type PackageAttwProfile,
  type PackageCheckToolSelection,
  type ResolvedLiminaConfig,
} from '#config/runner';
import { cac } from 'cac';
import path from 'pathe';
import {
  type CheckIssueInventoryFormat,
  formatCheckIssueSnapshotInventory,
  readCheckIssueSnapshot,
  writeNotRunCheckIssueSnapshot,
} from './check-reporting/snapshot';
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
  type DependencyGraphView,
  stringifyDependencyGraph,
} from './dependency-graph/runner';
import { createLiminaFlowReporter } from './flow';
import { clearCliScreen, CliLogger, formatErrorMessage } from './logger';
import { runDefaultCheck, runPipeline } from './pipeline/runner';
import type { SourceIssueReportOptions } from './source-check/report';
import { writeNotRunSourceIssueSnapshot } from './source-check/snapshot';

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

interface CheckFlags extends GlobalFlags, SourceIssueSelectionFlags {
  checker?: string | string[];
  details?: boolean;
  fixes?: boolean;
  format?: string;
  issues?: boolean;
  task?: string | string[];
  tool?: string | string[];
}

interface SourceFlags extends GlobalFlags, SourceIssueSelectionFlags {}

interface PackageFlags extends GlobalFlags, PackageSelectionFlags {
  attwProfile?: string;
  tool?: string;
  verbose?: boolean;
}

interface CheckerFlags extends GlobalFlags {
  '--'?: string[];
  checker?: unknown;
  preset?: string;
  project?: unknown;
  verbose?: boolean;
  w?: boolean;
  watch?: boolean;
}

interface GraphFlags extends GlobalFlags {
  output?: string;
  verbose?: boolean;
  view?: string;
}

interface ProofFlags extends GlobalFlags {
  verbose?: boolean;
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
    'verbose',
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

function parseIssueInventoryFormat(
  format: string | undefined,
): CheckIssueInventoryFormat | undefined {
  if (!format) {
    return undefined;
  }

  if (format === 'human' || format === 'json' || format === 'ndjson') {
    return format;
  }

  throw new Error(
    `Invalid check --issues --format "${format}". Expected one of: human, json, ndjson.`,
  );
}

function assertStandaloneIssuesFlag(
  pipeline: string | undefined,
  flags: CheckFlags,
): void {
  if (!flags.issues) {
    if (
      flags.task ||
      flags.checker ||
      flags.tool ||
      flags.details ||
      flags.fixes ||
      flags.format
    ) {
      throw new Error(
        '`limina check --task`, `--checker`, `--tool`, `--details`, `--fixes`, and `--format` require --issues.',
      );
    }

    return;
  }

  if (pipeline) {
    throw new Error('`limina check --issues` does not accept a pipeline name.');
  }
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
    .option('--verbose', 'Show full check issue details')
    .option('--rule <code>', 'Filter check issue details by stable rule code')
    .option('--file <path>', 'Filter check issue details by exact file path')
    .option('--scope <glob>', 'Filter check issue details by path scope')
    .option('--task <name>', 'Filter last-run issue inventory by task')
    .option('--checker <name>', 'Filter last-run issue inventory by checker')
    .option('--tool <name>', 'Filter last-run issue inventory by package tool')
    .option('--issues', 'Show check issue filters from the last run')
    .option('--details', 'Show detailed issues from the last run')
    .option('--fixes', 'Show fix steps from the last run')
    .option('--format <format>', 'Issue output format: human, json, or ndjson')
    .action(async (pipeline: string | undefined, flags: CheckFlags) => {
      assertStandaloneIssuesFlag(pipeline, flags);

      if (flags.issues) {
        const config = await load(flags, 'check');
        const snapshot = await readCheckIssueSnapshot(config.rootDir);

        process.stdout.write(
          `${formatCheckIssueSnapshotInventory({
            filters: {
              checkerNames: parseRepeatedStrings(flags.checker),
              files: parseRepeatedStrings(flags.file),
              packageNames: parsePackageNames(flags.package),
              rules: parseRepeatedStrings(flags.rule),
              scopes: parseRepeatedStrings(flags.scope),
              tasks: parseRepeatedStrings(flags.task),
              tools: parseRepeatedStrings(flags.tool),
            },
            details: flags.details ?? flags.verbose,
            fixes: flags.fixes,
            format: parseIssueInventoryFormat(flags.format),
            rootDir: config.rootDir,
            snapshot,
          })}\n`,
        );
        return;
      }

      const flow = createCliFlow();
      flow.intro('limina check');
      const config = await load(flags, 'check');
      const packageNames = parsePackageNames(flags.package);
      const sourceIssueReport = createSourceIssueReportOptions(
        flags,
        pipeline ? `limina check ${pipeline}` : 'limina check',
      );
      const checkIssueReport = {
        command: sourceIssueReport.command,
        verbose: flags.verbose,
      };

      await writeNotRunCheckIssueSnapshot({
        command: sourceIssueReport.command ?? 'limina check',
        rootDir: config.rootDir,
      });

      const passed = pipeline
        ? await runPipeline(config, pipeline, {
            cwd: process.cwd(),
            flow,
            packageNames,
            checkIssueReport,
            sourceIssueReport,
          })
        : await runDefaultCheck(config, {
            cwd: process.cwd(),
            flow,
            packageNames,
            checkIssueReport,
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
    .option('--verbose', 'Show full graph check issue details')
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
        await writeNotRunCheckIssueSnapshot({
          command: 'limina graph check',
          rootDir: config.rootDir,
        });

        const passed = await runGraphCheck(config, {
          clearScreen: false,
          flow,
          report: {
            command: 'limina graph check',
            verbose: flags.verbose,
          },
        });

        if (!passed) {
          process.exitCode = 1;
        }

        flow.outro(passed ? 'limina graph passed' : 'limina graph failed');
        return;
      }

      await writeNotRunCheckIssueSnapshot({
        command: 'limina graph prepare',
        rootDir: config.rootDir,
      });

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
    .option('--verbose', 'Show full proof check issue details')
    .action(async (action: string, flags: ProofFlags) => {
      if (action !== 'check') {
        throw new Error(`Unknown proof action "${action}". Expected check.`);
      }
      const flow = createCliFlow();
      flow.intro('limina proof check');
      const config = await load(flags, 'proof');
      await writeNotRunCheckIssueSnapshot({
        command: 'limina proof check',
        rootDir: config.rootDir,
      });
      const passed = await runProofCheck(config, {
        clearScreen: false,
        flow,
        report: {
          command: 'limina proof check',
          verbose: flags.verbose,
        },
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
      await writeNotRunCheckIssueSnapshot({
        command: 'limina source check',
        rootDir: config.rootDir,
      });
      await writeNotRunSourceIssueSnapshot({
        command: 'limina source check',
        rootDir: config.rootDir,
      });
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
    .option('--verbose', 'Show full checker issue details')
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
          await writeNotRunCheckIssueSnapshot({
            command: 'limina checker build',
            rootDir: config.rootDir,
          });
          const result = configPath
            ? await runBuild({
                checker: parseBuildPreset(flags.preset),
                clearScreen: false,
                config,
                configPath,
                cwd: process.cwd(),
                flow,
                report: {
                  command: 'limina checker build',
                  verbose: flags.verbose,
                },
                watch,
              })
            : await runCheckerBuild({
                clearScreen: false,
                config,
                cwd: process.cwd(),
                flow,
                report: {
                  command: 'limina checker build',
                  verbose: flags.verbose,
                },
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
        await writeNotRunCheckIssueSnapshot({
          command: 'limina checker typecheck',
          rootDir: config.rootDir,
        });
        const result = await runCheckerTypecheck({
          clearScreen: false,
          config,
          cwd: process.cwd(),
          flow,
          report: {
            command: 'limina checker typecheck',
            verbose: flags.verbose,
          },
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
    .option('--verbose', 'Show full package check issue details')
    .action(async (action: string, flags: PackageFlags) => {
      if (action !== 'check') {
        throw new Error(`Unknown package action "${action}". Expected check.`);
      }
      const flow = createCliFlow();
      flow.intro('limina package check');
      const config = await load(flags, 'package');
      await writeNotRunCheckIssueSnapshot({
        command: 'limina package check',
        rootDir: config.rootDir,
      });
      const passed = await runPackageCheck({
        attwProfile: parsePackageAttwProfile(flags.attwProfile),
        clearScreen: false,
        config,
        cwd: process.cwd(),
        flow,
        packageNames: parsePackageNames(flags.package),
        report: {
          command: 'limina package check',
          verbose: flags.verbose,
        },
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
    .option('--verbose', 'Show full release check issue details')
    .action(async (action: string, flags: CheckFlags) => {
      if (action !== 'check') {
        throw new Error(`Unknown release action "${action}". Expected check.`);
      }
      const flow = createCliFlow();
      flow.intro('limina release check');
      const config = await load(flags, 'release');
      await writeNotRunCheckIssueSnapshot({
        command: 'limina release check',
        rootDir: config.rootDir,
      });
      const passed = await runReleaseCheck({
        clearScreen: false,
        config,
        cwd: process.cwd(),
        flow,
        packageNames: parsePackageNames(flags.package),
        report: {
          command: 'limina release check',
          verbose: flags.verbose,
        },
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
