import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isPathInsideDirectory } from './utils/path';

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
  | 'tsc:build'
  | 'tsc:run';

export type BuiltinCheckerPreset = 'svelte-check' | 'tsc' | 'vue-tsc';

export type CheckerPreset = BuiltinCheckerPreset | (string & {});

export type CheckerRouteKind = 'build' | 'typecheck';

/**
 * Project routes used by one checker.
 */
export interface CheckerRoutesConfig {
  /**
   * Route used by `lattice tsc` / `tsc:run`.
   */
  typecheck?: string;
  /**
   * Route used by `lattice tsc --build` / `tsc:build`.
   */
  build?: string;
}

/**
 * Checker capability for one source module family.
 */
export interface CheckerConfig {
  /**
   * Built-in checker preset, such as `tsc`, `vue-tsc`, or `svelte-check`.
   */
  preset: CheckerPreset;
  /**
   * Source file suffixes covered by this checker.
   *
   * Built-in presets may omit this and use their default suffixes.
   */
  extensions?: string[];
  /**
   * Typecheck/build routes. Omit routes to keep the checker inactive.
   */
  routes?: CheckerRoutesConfig;
}

export interface ResolvedCheckerConfig {
  extensions: string[];
  name: string;
  preset: CheckerPreset;
  routes: Required<Pick<CheckerConfig, 'routes'>>['routes'];
}

/**
 * Source boundary that must be covered by graph, checker routes, or allowlist proof.
 */
export interface SourceBoundaryConfig {
  /**
   * Glob patterns for source files that need proof coverage.
   *
   * When omitted, Lattice derives the source boundary from active checker
   * extensions and then applies `exclude`.
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
   * Checker capabilities shared by graph, proof, paths, and tsc tasks.
   */
  checkers?: Record<string, CheckerConfig>;
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
 * Typecheck coverage proof settings.
 */
export interface ProofConfig {
  /**
   * Intentional file-level exceptions.
   */
  allowlist?: ProofAllowlistEntry[];
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
   * Shared project facts, such as checker routes and source boundary.
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
   * Rules that prove source files are covered by graph or checker routes.
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
   * Absolute workspace root inferred from `cwd` and its parent directories.
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

const builtinCheckerExtensions = {
  'svelte-check': ['.svelte'],
  tsc: ['.ts', '.tsx', '.cts', '.mts', '.d.ts', '.d.cts', '.d.mts', '.json'],
  'vue-tsc': ['.vue'],
} satisfies Record<BuiltinCheckerPreset, string[]>;

function formatUnknownValue(value: unknown): string {
  if (value === undefined) {
    return 'undefined';
  }

  return JSON.stringify(value);
}

function isBuiltinCheckerPreset(value: string): value is BuiltinCheckerPreset {
  return Object.hasOwn(builtinCheckerExtensions, value);
}

function normalizeExtensions(extensions: string[]): string[] {
  return [...new Set(extensions)].sort((left, right) => {
    const lengthDelta = right.length - left.length;

    return lengthDelta === 0 ? left.localeCompare(right) : lengthDelta;
  });
}

function getCheckerExtensions(checker: CheckerConfig): string[] {
  if (checker.extensions) {
    return normalizeExtensions(checker.extensions);
  }

  if (isBuiltinCheckerPreset(checker.preset)) {
    return normalizeExtensions(builtinCheckerExtensions[checker.preset]);
  }

  throw new Error(
    `Checker preset "${checker.preset}" must declare non-empty extensions because it is not a built-in preset.`,
  );
}

function validateRouteValue(options: {
  field: string;
  problems: string[];
  value: unknown;
}): void {
  if (typeof options.value === 'string' && options.value.trim().length > 0) {
    return;
  }

  options.problems.push(
    [
      'Invalid Lattice checker route config:',
      `  field: ${options.field}`,
      `  value: ${formatUnknownValue(options.value)}`,
      '  reason: checker routes must be non-empty string paths.',
    ].join('\n'),
  );
}

function collectCheckerConfigProblems(config: LatticeConfig): string[] {
  const problems: string[] = [];

  if (isRecord(config.config) && Object.hasOwn(config.config, 'roots')) {
    problems.push(
      [
        'Unsupported Lattice config field: config.roots',
        '  reason: config.roots was removed by the checker configuration breaking change.',
        '  fix: move graph/typecheck routes to config.checkers.typescript.routes.build/typecheck.',
      ].join('\n'),
    );
  }

  if (isRecord(config.proof) && Object.hasOwn(config.proof, 'sidecarTargets')) {
    problems.push(
      [
        'Unsupported Lattice config field: proof.sidecarTargets',
        '  reason: proof.sidecarTargets was removed by the checker configuration breaking change.',
        '  fix: move framework checker routes to config.checkers.<name>.routes.',
      ].join('\n'),
    );
  }

  const checkers = config.config?.checkers;

  if (checkers === undefined) {
    return problems;
  }

  if (!isRecord(checkers)) {
    problems.push(
      [
        'Invalid Lattice checker config:',
        '  field: config.checkers',
        `  value: ${formatUnknownValue(checkers)}`,
        '  reason: config.checkers must be an object keyed by checker name.',
      ].join('\n'),
    );

    return problems;
  }

  for (const [checkerName, checker] of Object.entries(checkers)) {
    const field = `config.checkers.${checkerName}`;

    if (!isRecord(checker)) {
      problems.push(
        [
          'Invalid Lattice checker config:',
          `  field: ${field}`,
          `  value: ${formatUnknownValue(checker)}`,
          '  reason: checker entries must be objects.',
        ].join('\n'),
      );
      continue;
    }

    const preset = checker.preset;

    if (typeof preset !== 'string' || preset.trim().length === 0) {
      problems.push(
        [
          'Invalid Lattice checker config:',
          `  field: ${field}.preset`,
          `  value: ${formatUnknownValue(preset)}`,
          '  reason: checker preset must be a non-empty string.',
        ].join('\n'),
      );
    }

    const extensions = checker.extensions;

    if (extensions !== undefined) {
      if (
        !Array.isArray(extensions) ||
        extensions.length === 0 ||
        extensions.some(
          (extension) =>
            typeof extension !== 'string' ||
            extension.trim().length === 0 ||
            !extension.startsWith('.'),
        )
      ) {
        problems.push(
          [
            'Invalid Lattice checker config:',
            `  field: ${field}.extensions`,
            `  value: ${formatUnknownValue(extensions)}`,
            '  reason: checker extensions must be a non-empty array of dot-prefixed strings.',
          ].join('\n'),
        );
      }
    } else if (typeof preset === 'string' && !isBuiltinCheckerPreset(preset)) {
      problems.push(
        [
          'Invalid Lattice checker config:',
          `  field: ${field}.extensions`,
          '  value: undefined',
          '  reason: extensions may only be omitted for built-in presets.',
        ].join('\n'),
      );
    }

    const routes = checker.routes;

    if (routes === undefined) {
      continue;
    }

    if (!isRecord(routes)) {
      problems.push(
        [
          'Invalid Lattice checker route config:',
          `  field: ${field}.routes`,
          `  value: ${formatUnknownValue(routes)}`,
          '  reason: checker routes must be an object with typecheck and/or build.',
        ].join('\n'),
      );
      continue;
    }

    const hasTypecheckRoute =
      Object.hasOwn(routes, 'typecheck') && routes.typecheck !== undefined;
    const hasBuildRoute =
      Object.hasOwn(routes, 'build') && routes.build !== undefined;

    if (!hasTypecheckRoute && !hasBuildRoute) {
      problems.push(
        [
          'Invalid Lattice checker route config:',
          `  field: ${field}.routes`,
          `  value: ${formatUnknownValue(routes)}`,
          '  reason: routes must include typecheck or build; remove routes entirely to keep this checker inactive.',
        ].join('\n'),
      );
      continue;
    }

    if (hasTypecheckRoute) {
      validateRouteValue({
        field: `${field}.routes.typecheck`,
        problems,
        value: routes.typecheck,
      });
    }

    if (hasBuildRoute) {
      validateRouteValue({
        field: `${field}.routes.build`,
        problems,
        value: routes.build,
      });
    }
  }

  return problems;
}

export function validateLatticeConfig(config: LatticeConfig): void {
  const problems = collectCheckerConfigProblems(config);

  if (problems.length > 0) {
    throw new Error(problems.join('\n\n'));
  }
}

export function getActiveCheckers(
  config: LatticeConfig,
): ResolvedCheckerConfig[] {
  validateLatticeConfig(config);

  const checkers = config.config?.checkers;

  if (!checkers) {
    return [];
  }

  return Object.entries(checkers)
    .flatMap(([name, checker]) => {
      if (!checker.routes) {
        return [];
      }

      const routes: CheckerRoutesConfig = {};

      if (checker.routes.typecheck !== undefined) {
        routes.typecheck = checker.routes.typecheck.trim();
      }

      if (checker.routes.build !== undefined) {
        routes.build = checker.routes.build.trim();
      }

      return [
        {
          extensions: getCheckerExtensions(checker),
          name,
          preset: checker.preset,
          routes,
        },
      ];
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function getActiveCheckerExtensions(config: LatticeConfig): string[] {
  return normalizeExtensions(
    getActiveCheckers(config).flatMap((checker) => checker.extensions),
  );
}

export function getTypeScriptRoute(
  config: LatticeConfig,
  routeKind: CheckerRouteKind,
): string {
  const matchingCheckers = getActiveCheckers(config).filter(
    (checker) =>
      checker.preset === 'tsc' && checker.routes[routeKind] !== undefined,
  );

  if (matchingCheckers.length === 0) {
    throw new Error(
      `Missing TypeScript ${routeKind} route: configure config.checkers.<name> with preset "tsc" and routes.${routeKind}.`,
    );
  }

  if (matchingCheckers.length > 1) {
    throw new Error(
      `Multiple TypeScript ${routeKind} routes are configured: ${matchingCheckers
        .map((checker) => checker.name)
        .join(', ')}.`,
    );
  }

  return matchingCheckers[0].routes[routeKind]!;
}

function normalizeConfig(value: unknown): LatticeConfig {
  if (!isRecord(value)) {
    throw new Error('lattice config must export or return an object.');
  }

  const config = value as LatticeConfig;

  validateLatticeConfig(config);

  return config;
}

export interface LoadConfigOptions {
  /**
   * Command family to expose to function-style configs.
   */
  command?: LatticeCommand;
  /**
   * Config file path, resolved from `cwd`. When omitted, Lattice searches for
   * the nearest `lattice.config.mjs` from `cwd` upward to the inferred pnpm
   * workspace root.
   *
   * @default nearest "lattice.config.mjs" in `cwd` or workspace parents
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

function findLatticeConfigPath(
  startDir: string,
  rootDir: string,
): string | null {
  let currentDir = path.resolve(startDir);
  const workspaceRootDir = path.resolve(rootDir);

  while (isPathInsideDirectory(currentDir, workspaceRootDir)) {
    const candidatePath = path.join(currentDir, 'lattice.config.mjs');

    if (existsSync(candidatePath)) {
      return candidatePath;
    }

    if (currentDir === workspaceRootDir) {
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

function inferWorkspaceRoot(startDir: string): string {
  const rootDir = findPnpmWorkspaceRoot(startDir);

  if (!rootDir) {
    throw new Error(
      [
        `Unable to infer Lattice workspace root from ${startDir}:`,
        'no pnpm-workspace.yaml was found in this directory or its parents.',
      ].join(' '),
    );
  }

  return rootDir;
}

function validateConfigPathInsideWorkspace(
  configPath: string,
  rootDir: string,
): void {
  if (isPathInsideDirectory(configPath, rootDir)) {
    return;
  }

  throw new Error(
    [
      `Unable to load Lattice config at ${configPath}:`,
      `config file must be inside the governed pnpm workspace at ${rootDir}.`,
    ].join(' '),
  );
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
  const rootDir = inferWorkspaceRoot(cwd);
  const configPath = options.configPath
    ? path.resolve(cwd, options.configPath)
    : findLatticeConfigPath(cwd, rootDir);

  if (configPath) {
    validateConfigPathInsideWorkspace(configPath, rootDir);
  }

  if (!configPath || !existsSync(configPath)) {
    throw new Error(
      options.configPath
        ? `Unable to find lattice config at ${configPath}`
        : `Unable to find lattice config. Searched for lattice.config.mjs from ${cwd} up to the pnpm workspace root at ${rootDir}.`,
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

  return {
    ...config,
    configPath,
    rootDir,
  };
}
