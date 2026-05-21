import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Runtime label used by package boundary checks.
 *
 * Use `browser` for code that must stay free of Node.js runtime imports,
 * `node` for server-only output, or a custom string when a package has its own
 * environment naming.
 */
export type RuntimeEnvironment = 'browser' | 'node' | string;

/**
 * One step in a named Lattice pipeline.
 *
 * A string can be either a built-in task such as `graph:check`, or a command
 * split on whitespace. Use the object form when you need args, cwd, or env to
 * be unambiguous.
 */
export type PipelineStep =
  | string
  | {
      /**
       * Arguments passed to the command.
       *
       * Prefer this over a single command string when an argument contains
       * spaces or when you want the config to be easy to review.
       */
      args?: string[];
      /**
       * Executable name, for example `pnpm`, `tsc`, or `vue-tsc`.
       *
       * The command runs from the inferred workspace root unless `cwd` is set.
       */
      command: string;
      /**
       * Working directory for this step, relative to the inferred workspace root.
       */
      cwd?: string;
      /**
       * Extra environment variables for this step.
       *
       * Values are merged on top of `process.env`.
       */
      env?: Record<string, string>;
      /**
       * Marks this pipeline step as an external command.
       */
      type: 'command';
    }
  | {
      /**
       * Built-in Lattice task to run.
       */
      name: BuiltinTaskName;
      /**
       * Marks this pipeline step as a built-in task.
       */
      type: 'task';
    };

/**
 * Built-in task names understood by Lattice pipelines.
 */
export type BuiltinTaskName =
  | 'graph:check'
  | 'package:check'
  | 'proof:check'
  | 'tsc:run';

/**
 * Shared TypeScript route roots used by several Lattice checks.
 */
export interface LatticeRootsConfig {
  /**
   * Root solution tsconfig for build graph traversal, relative to
   * the inferred workspace root.
   *
   * @default "tsconfig.graph.json"
   */
  graph?: string;
  /**
   * Root IDE/typecheck solution config, relative to the inferred workspace root.
   *
   * @default "tsconfig.json"
   */
  typecheck?: string;
}

/**
 * Source boundary that must be covered by graph, sidecar, or allowlist proof.
 */
export interface SourceBoundaryConfig {
  /**
   * Glob patterns for source files that need proof coverage.
   *
   * @default: [
   *   "**\/*.{ts,tsx,cts,mts}",
   *   "**\/*.d.{ts,cts,mts}",
   *   "**\/*.json",
   * ]
   */
  include?: string[];
  /**
   * Glob patterns or directory shorthands to omit from proof coverage.
   *
   * @default: [
   *   "node_modules",
   *   "dist",
   *   ".git",
   *   ".tsbuild",
   *   "coverage",
   *   "**\/tsconfig*.json",
   *   "**\/package.json",
   *   ".prettierrc.json",
   *   ".markdownlint.json",
   *   "vercel.json",
   * ]
   */
  exclude?: string[];
}

/**
 * Shared project facts used by graph, paths, proof, and related checks.
 */
export interface SharedLatticeConfig {
  /**
   * TypeScript route roots shared by checks.
   */
  roots?: LatticeRootsConfig;
  /**
   * Source file boundary used by coverage proof.
   */
  source?: SourceBoundaryConfig;
}

/**
 * Options for generated TypeScript `paths` compatibility files.
 */
export interface PathsConfig {
  /**
   * Directory names treated as build artifacts when mapping package exports
   * back to source files.
   */
  artifactDirectories?: string[];
  /**
   * Export condition priority when resolving package exports.
   *
   * Put more specific conditions earlier when your package exports use several
   * entries such as `types`, `import`, `node`, or `default`.
   */
  conditionPriority?: string[];
  /**
   * File name used for generated path mapping configs.
   *
   * @default "tsconfig.graph.paths.generated.json"
   */
  generatedFileName?: string;
  /**
   * Header marker written into generated files.
   *
   * Lattice uses this to know which files it is allowed to refresh.
   */
  generatedFileMarker?: string;
  /**
   * Source extensions tried when replacing artifact exports with source files.
   */
  sourceExtensions?: string[];
}

/**
 * Build graph boundary denied to projects with a matching Lattice label.
 */
export interface GraphRuleRefDenyEntry {
  /**
   * Target `tsconfig*.build.json` path, relative to the inferred workspace root.
   */
  path: string;
  /**
   * Human-readable explanation shown when the rule fails.
   */
  reason: string;
}

/**
 * Workspace package dependency denied to projects with a matching Lattice label.
 */
export interface GraphRuleDepDenyEntry {
  /**
   * Target workspace package name.
   */
  name: string;
  /**
   * Human-readable explanation shown when the rule fails.
   */
  reason: string;
}

/**
 * Deny lists for a Lattice graph label.
 */
export interface GraphRuleDenyConfig {
  /**
   * Build graph boundaries that matching projects must not reference or import.
   */
  refs?: GraphRuleRefDenyEntry[];
  /**
   * Workspace packages that matching projects must not reference or import.
   */
  deps?: GraphRuleDepDenyEntry[];
}

/**
 * Package-level graph governance rule keyed by a label declared in
 * `tsconfig*.build.json`.
 */
export interface GraphRule {
  /**
   * Denied graph boundaries and workspace package dependencies.
   */
  deny?: GraphRuleDenyConfig;
}

/**
 * TypeScript project graph policy.
 */
export interface GraphConfig {
  /**
   * Label-based package and build-boundary access rules.
   *
   * A `tsconfig*.build.json` can opt into one rule by declaring
   * `"lattice": "<label>"`.
   */
  rules?: Record<string, GraphRule>;
}

/**
 * Explicit exception for a source file that is intentionally not covered by the
 * normal proof rules.
 */
export interface ProofAllowlistEntry {
  /**
   * File path to allow, relative to the inferred workspace root.
   */
  file: string;
  /**
   * Why this file is safe to exclude from normal proof coverage.
   */
  reason: string;
}

/**
 * Additional typecheck target that covers files outside the main graph.
 */
export interface ProofSidecarTarget {
  /**
   * Tsconfig path for the sidecar typecheck, relative to the inferred workspace root.
   */
  config: string;
  /**
   * Friendly name shown in reports.
   */
  label?: string;
  /**
   * Typecheck command used for this target, for example `tsc` or `vue-tsc`.
   */
  tool: 'tsc' | 'vue-tsc' | string;
}

/**
 * Typecheck coverage proof settings.
 */
export interface ProofConfig {
  /**
   * Intentional file-level exceptions.
   */
  allowlist?: ProofAllowlistEntry[];
  /**
   * Extra typecheck targets that are not part of the root graph.
   */
  sidecarTargets?: ProofSidecarTarget[];
}

/**
 * Package check tools that can run against a built package output.
 */
export type PackageCheckTool = 'attw' | 'boundary' | 'publint';

/**
 * CLI package check tool selection.
 */
export type PackageCheckToolSelection = PackageCheckTool | 'all';

/**
 * Are The Types Wrong profile used for package type resolution checks.
 */
export type PackageAttwProfile = 'esm-only' | 'node16' | 'strict';

/**
 * publint package check settings.
 */
export interface PackagePublintCheckConfig {
  /**
   * Whether publint should run in strict mode.
   *
   * @default true
   */
  strict?: boolean;
}

/**
 * Are The Types Wrong package check settings.
 */
export interface PackageAttwCheckConfig {
  /**
   * Problem profile to enforce.
   *
   * `esm-only` ignores CJS resolution failures for pure ESM packages.
   *
   * @default "esm-only"
   */
  profile?: PackageAttwProfile;
}

/**
 * Built package import boundary settings.
 */
export interface PackageBoundaryCheckConfig {
  /**
   * Runtime environment for each emitted file.
   *
   * Use a string when the whole package has one environment, or a function when
   * different files have different environments.
   */
  environment?:
    | RuntimeEnvironment
    | ((relativeFilePath: string) => RuntimeEnvironment);
  /**
   * External package imports that are intentionally allowed even when they are
   * not listed in the built package manifest.
   */
  ignoredExternalPackages?: string[];
}

/**
 * One published package output to check.
 */
export interface PackageCheckTarget {
  /**
   * Built package directory to scan, relative to the inferred workspace root.
   */
  outDir: string;
  /**
   * Package check tools enabled for this target.
   *
   * @default ["publint", "attw", "boundary"]
   */
  checks?: PackageCheckTool[];
  /**
   * publint settings for this package output.
   */
  publint?: PackagePublintCheckConfig;
  /**
   * Are The Types Wrong settings for this package output.
   */
  attw?: PackageAttwCheckConfig;
  /**
   * Built package import boundary settings.
   */
  boundary?: PackageBoundaryCheckConfig;
  /**
   * Friendly target name used by CLI filters and reports.
   *
   * Defaults to the `outDir` path.
   */
  name?: string;
}

/**
 * Published package check settings.
 */
export interface PackageChecksConfig {
  /**
   * Built package outputs to check.
   */
  targets?: PackageCheckTarget[];
}

/**
 * Lattice user config.
 */
export interface LatticeConfig {
  /**
   * Shared project facts, such as TypeScript route roots and source boundary.
   */
  config?: SharedLatticeConfig;
  /**
   * TypeScript project graph and architecture rules.
   */
  graph?: GraphConfig;
  /**
   * Rules for checking built package outputs before publishing.
   */
  packageChecks?: PackageChecksConfig;
  /**
   * Options for generating TypeScript source `paths` compatibility files.
   */
  paths?: PathsConfig;
  /**
   * Named command pipelines runnable through `lattice check <name>`.
   */
  pipelines?: Record<string, PipelineStep[]>;
  /**
   * Rules that prove source files are covered by graph or sidecar typechecks.
   */
  proof?: ProofConfig;
}

/**
 * CLI command currently loading the config.
 */
export type LatticeCommand =
  | 'check'
  | 'graph'
  | 'package'
  | 'paths'
  | 'proof'
  | (string & {});

/**
 * Environment passed to function-style configs.
 */
export interface LatticeConfigEnv {
  /**
   * CLI command family, such as `check`, `graph`, or `paths`.
   */
  command: LatticeCommand;
  /**
   * Mode passed through `--mode`.
   *
   * Defaults to `process.env.NODE_ENV`, then `default`.
   */
  mode: string;
}

export type LatticeConfigFnObject = (env: LatticeConfigEnv) => LatticeConfig;
export type LatticeConfigFnPromise = (
  env: LatticeConfigEnv,
) => Promise<LatticeConfig>;
export type LatticeConfigFn = (
  env: LatticeConfigEnv,
) => LatticeConfig | Promise<LatticeConfig>;

export type LatticeConfigExport =
  | LatticeConfig
  | Promise<LatticeConfig>
  | LatticeConfigFnObject
  | LatticeConfigFnPromise
  | LatticeConfigFn;

export interface ResolvedLatticeConfig extends LatticeConfig {
  /**
   * Absolute path to the loaded config file.
   */
  configPath: string;
  /**
   * Absolute workspace root inferred from the nearest parent `pnpm-workspace.yaml`.
   */
  rootDir: string;
}

/**
 * Type helper for lattice.config.mjs.
 *
 * Accepts a direct config object, a Promise, or a function that receives the
 * current {@link LatticeConfigEnv}.
 */
export function defineConfig(config: LatticeConfig): LatticeConfig;
export function defineConfig(
  config: Promise<LatticeConfig>,
): Promise<LatticeConfig>;
export function defineConfig(
  config: LatticeConfigFnObject,
): LatticeConfigFnObject;
export function defineConfig(
  config: LatticeConfigFnPromise,
): LatticeConfigFnPromise;
export function defineConfig(config: LatticeConfigFn): LatticeConfigFn;
export function defineConfig(config: LatticeConfigExport): LatticeConfigExport {
  return config;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeConfig(value: unknown): LatticeConfig {
  if (!isRecord(value)) {
    throw new Error('lattice config must export or return an object.');
  }

  return value as LatticeConfig;
}

export interface LoadConfigOptions {
  /**
   * Command family to expose to function-style configs.
   */
  command?: LatticeCommand;
  /**
   * Config file path, resolved from `cwd`. When omitted, Lattice searches for
   * the nearest `lattice.config.mjs` from `cwd` upward.
   *
   * @default nearest "lattice.config.mjs" in `cwd` or its parents
   */
  configPath?: string;
  /**
   * Directory used to resolve `configPath`.
   *
   * @default process.cwd()
   */
  cwd?: string;
  /**
   * Mode exposed to function-style configs.
   *
   * @default process.env.NODE_ENV ?? "default"
   */
  mode?: string;
}

function createConfigEnv(options: LoadConfigOptions): LatticeConfigEnv {
  return {
    command: options.command ?? 'check',
    mode: options.mode ?? process.env.NODE_ENV ?? 'default',
  };
}

function findPnpmWorkspaceRoot(startDir: string): string | null {
  let currentDir = path.resolve(startDir);

  while (true) {
    if (existsSync(path.join(currentDir, 'pnpm-workspace.yaml'))) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);

    if (parentDir === currentDir) {
      return null;
    }

    currentDir = parentDir;
  }
}

function findLatticeConfigPath(startDir: string): string | null {
  let currentDir = path.resolve(startDir);

  while (true) {
    const candidatePath = path.join(currentDir, 'lattice.config.mjs');

    if (existsSync(candidatePath)) {
      return candidatePath;
    }

    const parentDir = path.dirname(currentDir);

    if (parentDir === currentDir) {
      return null;
    }

    currentDir = parentDir;
  }
}

function inferWorkspaceRoot(configPath: string): string {
  const configDir = path.dirname(configPath);
  const rootDir = findPnpmWorkspaceRoot(configDir);

  if (!rootDir) {
    throw new Error(
      [
        `Unable to infer Lattice workspace root from ${configPath}:`,
        'no pnpm-workspace.yaml was found in this directory or its parents.',
      ].join(' '),
    );
  }

  return rootDir;
}

async function resolveConfigExport(
  configExport: unknown,
  configEnv: LatticeConfigEnv,
): Promise<LatticeConfig> {
  const config =
    typeof configExport === 'function'
      ? await (configExport as LatticeConfigFn)(configEnv)
      : await configExport;

  return normalizeConfig(config);
}

export async function loadConfig(
  options: LoadConfigOptions = {},
): Promise<ResolvedLatticeConfig> {
  const cwd = options.cwd ? path.resolve(options.cwd) : process.cwd();
  const configPath = options.configPath
    ? path.resolve(cwd, options.configPath)
    : findLatticeConfigPath(cwd);

  if (!configPath || !existsSync(configPath)) {
    throw new Error(
      options.configPath
        ? `Unable to find lattice config at ${configPath}`
        : `Unable to find lattice config. Searched for lattice.config.mjs from ${cwd} and its parent directories.`,
    );
  }

  const module = (await import(
    `${pathToFileURL(configPath).href}?t=${Date.now()}`
  )) as {
    default?: unknown;
  };
  const config = await resolveConfigExport(
    module.default,
    createConfigEnv(options),
  );
  const rootDir = inferWorkspaceRoot(configPath);

  return {
    ...config,
    configPath,
    rootDir,
  };
}
