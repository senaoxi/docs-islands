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
       * The command runs from `workspace.rootDir` unless `cwd` is set.
       */
      command: string;
      /**
       * Working directory for this step, relative to `workspace.rootDir`.
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
 * Workspace discovery and path settings.
 */
export interface WorkspaceConfig {
  /**
   * Extra glob patterns to ignore while discovering workspace packages.
   */
  ignore?: string[];
  /**
   * Extra package.json globs when `pnpm-workspace.yaml` is not enough.
   */
  packagePatterns?: string[];
  /**
   * Repository root, relative to the config file.
   *
   * @default "."
   */
  rootDir?: string;
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
 * Rule that assigns a TypeScript config file to a project kind.
 */
export interface ProjectKindMatcher {
  /**
   * Path fragments that must appear in the config path.
   */
  includes?: string[];
  /**
   * Project kind to assign when this matcher applies.
   *
   * Examples: `lib`, `test`, `runtime-client`, `runtime-node`.
   */
  kind: string;
  /**
   * Exact config paths, relative to `workspace.rootDir`.
   */
  paths?: string[];
  /**
   * Path suffixes that match this kind.
   *
   * Example: `/tsconfig.test.build.json`.
   */
  suffixes?: string[];
}

/**
 * Architecture rule that forbids references or imports from one kind to another.
 */
export interface GraphForbiddenEdge {
  /**
   * Source project kinds the rule applies to.
   */
  fromKinds: string[];
  /**
   * Human-readable explanation shown when the rule fails.
   */
  reason: string;
  /**
   * Target project kinds that must not be depended on.
   */
  toKinds: string[];
}

/**
 * Rule that blocks Node.js built-in imports for selected project kinds.
 */
export interface GraphNodeBuiltinRule {
  /**
   * Project kinds that must not import Node.js built-ins.
   */
  kinds: string[];
  /**
   * Human-readable explanation shown when the rule fails.
   */
  reason: string;
}

/**
 * Manual source ownership hint for files that TypeScript cannot infer cleanly.
 */
export interface GraphInferredProject {
  /**
   * Package name this source prefix belongs to.
   */
  packageName?: string;
  /**
   * Graph project that owns the source prefix, relative to `workspace.rootDir`.
   */
  project: string;
  /**
   * Source path prefix owned by the project, relative to `workspace.rootDir`.
   */
  sourcePrefix: string;
}

/**
 * TypeScript project graph policy.
 */
export interface GraphConfig {
  /**
   * Forbidden project-kind dependency rules.
   */
  forbiddenEdges?: GraphForbiddenEdge[];
  /**
   * Extra ownership hints for source folders that are not obvious from includes.
   */
  inferredProjects?: GraphInferredProject[];
  /**
   * Rules that prevent selected project kinds from importing Node.js built-ins.
   */
  nodeBuiltinRules?: GraphNodeBuiltinRule[];
  /**
   * Project kinds considered production code.
   *
   * These are useful when a rule should apply to every distributable project.
   */
  productionKinds?: string[];
  /**
   * Ordered matchers used to classify each TypeScript config in the graph.
   */
  projectKinds?: ProjectKindMatcher[];
  /**
   * Root solution tsconfig for graph traversal, relative to `workspace.rootDir`.
   *
   * @default "tsconfig.graph.json"
   */
  rootConfig?: string;
  /**
   * Project kinds that act as solution/aggregator configs instead of source
   * leaves.
   */
  solutionKinds?: string[];
}

/**
 * Explicit exception for a source file that is intentionally not covered by the
 * normal proof rules.
 */
export interface ProofAllowlistEntry {
  /**
   * File path to allow, relative to `workspace.rootDir`.
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
   * Tsconfig path for the sidecar typecheck, relative to `workspace.rootDir`.
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
  /**
   * Regular expression string used to decide which source files need coverage.
   */
  sourceFilePattern?: string;
  /**
   * Root IDE/typecheck solution config, relative to `workspace.rootDir`.
   *
   * @default "tsconfig.json"
   */
  typecheckRootConfig?: string;
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
   * Built package directory to scan, relative to `workspace.rootDir`.
   */
  distDir: string;
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
   * Defaults to the `distDir` path.
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
  /**
   * Workspace discovery and root path settings.
   */
  workspace?: WorkspaceConfig;
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
   * Absolute workspace root after resolving `workspace.rootDir`.
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
   * Config file path, resolved from `cwd`.
   *
   * @default "lattice.config.mjs"
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
  const configPath = path.resolve(
    cwd,
    options.configPath ?? 'lattice.config.mjs',
  );

  if (!existsSync(configPath)) {
    throw new Error(`Unable to find lattice config at ${configPath}`);
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
  const rootDir = path.resolve(
    path.dirname(configPath),
    config.workspace?.rootDir ?? '.',
  );

  return {
    ...config,
    configPath,
    rootDir,
  };
}
