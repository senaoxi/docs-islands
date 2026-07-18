# Limina Config Schema Reference

Source-backed reference for the `LiminaConfig` surface.

## File Format

- Filename: `limina.config.mts` for new projects. `limina.config.mjs`, `limina.config.ts`, and `limina.config.js` are also supported when loading existing configs.
- Module format: follows the selected loader and Node module rules. `.mts`/`.mjs` are ESM; `limina.config.js` may be CommonJS when Node treats it as CommonJS. Use `--config-loader tsx` for TypeScript syntax the native runtime cannot load.
- Default export: `LiminaConfig`, `Promise<LiminaConfig>`, `(env) => LiminaConfig`, or `(env) => Promise<LiminaConfig>`

```ts
import { defineConfig } from 'limina';

export default defineConfig({
  config: {
    checkers: {
      mode: 'auto',
      exclude: [],
    },
  },
});
```

Function form receives:

```ts
interface LiminaConfigEnv {
  command: 'check' | 'graph' | 'package' | 'proof' | 'release' | 'source' | (string & {});
  mode: string; // --mode flag, process.env.NODE_ENV, or 'default'
}
```

## Top-Level Shape

```ts
interface LiminaConfig {
  config?: SharedLiminaConfig;
  execution?: ExecutionConfig;
  graph?: GraphConfig;
  package?: PackageConfig;
  pipelines?: Record<string, PipelineStep[]>;
  proof?: ProofConfig;
  regions?: RegionsConfig;
  release?: ReleaseConfig;
  source?: SourceCheckConfig;
}
```

Top-level `paths` is not part of `LiminaConfig`.

## `regions`

```ts
type RegionExcludeKind = 'workspace-package' | 'package-scope';

interface RegionsConfig {
  extendNestedPackageScopes?: boolean;
  exclude?: RegionExcludeConfig[];
}

interface RegionExcludeConfig {
  kind: RegionExcludeKind;
  include: string[];
  reason: string;
}
```

Rules:

- `extendNestedPackageScopes` defaults to `false`; `exclude` defaults to `[]` and may be explicitly empty.
- `kind` is required. Do not accept, infer, or document a kind-less compatibility form.
- `include` is a non-empty array of workspace-root-relative globs matched only against candidate root directories. Package names and descriptor paths are not selectors.
- `workspace-package` candidates are packages activated by the root pnpm workspace. `include: ['.']` may exclude the root package without excluding the root workspace.
- `package-scope` candidates are recognized nested `package.json` roots, whether extended or already stopped.
- Every rule must match at least one candidate of the same kind. Multiple rules may not match the same candidate.
- Fixed discovery ignores and configured output directories do not create candidates.
- Nested `pnpm-workspace.yaml` roots are automatic owner-local boundaries, not configurable exclusion candidates.

## `config.checkers`

Checker configuration is either omitted/explicit auto mode or an object keyed by checker name:

```ts
type CheckerConfigMode = AutoCheckerConfig | Record<string, CheckerConfig>;

interface AutoCheckerConfig {
  mode: 'auto';
  exclude?: string[];
}

interface CheckerConfig {
  preset: 'tsc' | 'tsgo' | 'vue-tsc' | 'vue-tsgo' | 'svelte-check';
  include: string[];
  exclude?: string[];
}
```

Rules:

- `config.checkers` may be omitted; omission enables auto mode for generated graph preparation and the default check pipeline.
- Explicit auto mode uses `config.checkers: { mode: 'auto', exclude?: string[] }`.
- Auto mode must not be mixed with named checker entries.
- Manual `include` entries are workspace-root-relative glob selectors that must match ordinary `tsconfig.json` entry files only. Non-entry `tsconfig.*.json` files become governed only when a selected `tsconfig.json` reaches them through ordinary references.
- `exclude` is optional and filters matched source entry configs.
- Built-in checker adapters own extension discovery.
- Manual checker entries consist of `preset`, `include`, and optional `exclude`.
- Checker presets must be one of Limina's built-in presets.

| Preset         | Source graph | Execution | Required peer packages                   |
| -------------- | ------------ | --------- | ---------------------------------------- |
| `tsc`          | yes          | build     | `typescript`                             |
| `tsgo`         | yes          | build     | `@typescript/native-preview`             |
| `vue-tsc`      | yes          | build     | `vue-tsc`                                |
| `vue-tsgo`     | yes          | typecheck | `vue-tsgo`, `@typescript/native-preview` |
| `svelte-check` | no           | typecheck | `svelte-check`                           |

`getActiveCheckers(config)` returns manually configured checkers sorted by name. In omitted/auto mode it returns an empty array at plain config-validation time; generated graph preparation resolves real auto checkers by scanning ordinary `**/tsconfig.json` scopes.

`@vue/compiler-sfc` is required only when `config.imports.vue: 'compiler-sfc'` enables compiler-backed Vue import parsing. Configuring `vue-tsc` alone does not require it.

## Auto Checker Mode

Auto mode scans ordinary `tsconfig.json` files outside ignored generated/build folders. Each scope is parsed with TypeScript plus capability-discovery extensions, then classified:

- TypeScript/JavaScript/JSON-only scopes become `typescript` (`tsc`).
- Scopes that contain Vue-only files become `vue` (`vue-tsc`).
- A TypeScript scope that imports or references a Vue scope is promoted to `vue-tsc`, so a generated `tsc` consumer does not depend on a Vue provider.
- Unsupported auto-scope extensions fail with a suggestion to configure checkers manually.

## `config.imports`

Import analysis settings shared by graph, proof, source, and checker tasks.

```ts
interface ImportAnalysisConfig {
  vue?: 'heuristic' | 'compiler-sfc';
}
```

- Omitted `vue` uses the heuristic Vue SFC script parser.
- `vue: 'compiler-sfc'` uses `@vue/compiler-sfc` for Vue import extraction.
- Any other value is rejected.

## `config.source`

Global source boundary used by `proof:check`.

```ts
interface SourceBoundaryConfig {
  include?: string[];
  exclude?: string[];
}
```

- If `include` is omitted, Limina uses its TypeScript-neutral defaults for `.ts`, `.tsx`, declaration, `.cts`, and `.mts` families. Checker capabilities do not add `.vue`, `.svelte`, or other framework extensions automatically.
- If `include` is provided, it replaces the defaults. Use the exact `"..."` entry to expand the default patterns at that position before adding framework globs.
- `exclude` always filters the effective boundary.
- If `exclude` is omitted, Limina reads the root `.gitignore` and applies the built-in excludes: `nx.json`, `project.json`, root `tsconfig.json`, `**/tsconfig.*.json`, `dist`, `.nx`, `.git`, `.tsbuild`, `coverage`, and `node_modules`. `.limina` is excluded when it is ignored by the root `.gitignore`.

## `source`

Source-owned dependency usage checks.

```ts
interface SourceCheckConfig {
  declarations?: SourceDeclarationsConfig;
  knip?: boolean | SourceKnipCheckConfig;
  importAuthority?: SourceImportAuthorityConfig;
}

interface SourceDeclarationsConfig {
  ambient?: SourceAmbientDeclarationConfig[];
}

interface SourceAmbientDeclarationConfig {
  include: string[];
  allowSharedAcrossOwners?: boolean;
  allowTripleSlashReferences?: boolean;
  reason: string;
}

interface SourceKnipCheckConfig {
  workspaces?: Record<string, SourceKnipWorkspaceConfig>;
}

interface SourceKnipWorkspaceConfig {
  entry?: SourceKnipEntryConfig[];
  ignoreDependencies?: SourceKnipIgnoredDependencyConfig[];
  ignoreFiles?: SourceKnipIgnoredFileConfig[];
}

interface SourceKnipEntryConfig {
  files: string[];
  reason: string;
}

interface SourceKnipIgnoredDependencyConfig {
  dep: string;
  reason: string;
}

interface SourceKnipIgnoredFileConfig {
  file: string;
  reason: string;
}

interface SourceImportAuthorityConfig {
  allow?: Record<string, SourceImportAuthorityWorkspaceRootGrant[]>;
}

interface SourceImportAuthorityWorkspaceRootGrant {
  include?: string[];
  workspaceRootDependencies: string[];
  reason: string;
}
```

`source.knip` behavior:

- `true` or omitted enables Limina's generated Knip config.
- `false` skips Knip-backed unused dependency and unused module checks.
- Object form configures package-keyed source analysis through `source.knip.workspaces`.
- Workspace keys must name existing pnpm workspace packages.
- `entry` adds package-owned source modules that should be treated as reachable roots.
- `ignoreDependencies` suppresses declared workspace dependency findings by `dep` and `reason`.
- `ignoreFiles` suppresses unused source module findings by `file` and `reason`.
- Limina uses Knip defaults unless a package has a supported static script such as `limina build tsconfig.json`; `source.knip.workspaces` accepts `entry`, `ignoreDependencies`, and `ignoreFiles`.
- If `knip` is unavailable, the Knip-backed work is marked skipped and other source checks continue; missing `knip` alone may still exit 0.

`source.declarations.ambient` behavior:

- Each rule matches config-root-relative declaration-file globs already visible in the governed region and requires a non-empty reason.
- The declaration must have an ambient role; package public declaration entries, managed outputs, and external modules with imports/exports cannot be reclassified.
- `allowSharedAcrossOwners` and `allowTripleSlashReferences` default to `false`.
- Triple-slash permission applies only to `/// <reference path>` and does not authorize ordinary imports or `/// <reference types>`.

`source.importAuthority` behavior:

- Source imports must normally be authorized by the nearest pnpm workspace package manifest.
- `allow` is an object keyed by source owner identity: package name for named owners, or workspace-root-relative package directory for nameless owners.
- Each owner key maps to workspace root dependency grants with non-empty `workspaceRootDependencies` and `reason`.
- `include` is optional and matches owner-root-relative source file globs. When omitted, the grant applies to all governed source modules for that owner.
- `workspaceRootDependencies` lets matching owner sources use the workspace root `package.json` as a dependency authority manifest for listed package names or package-name globs. The root manifest must exist and must declare the package.
- Workspace root authority must not bypass intermediate workspace package manifests between the source owner and the workspace root.
- Tsconfig-governance failures are fixed by changing `tsconfig.json` ownership/coverage.

## `graph`

```ts
interface GraphConfig {
  conditionDomains?: GraphConditionDomain[];
  rules?: Record<string, GraphRule>;
}

interface GraphConditionDomain {
  name: string;
  entry: string;
  customConditions: string[];
}
```

`conditionDomains` describes declaration reference trees that must share configured TypeScript `customConditions`. `entry` is a workspace-root-relative source tsconfig selected by an active checker.

## `graph.rules`

Label-based graph rules. A source `tsconfig*.json` can opt into labels with `liminaOptions.graphRules`; Limina carries those labels onto generated declaration configs.

```ts
interface GraphRule {
  deny?: {
    refs?: { path: string; reason: string }[];
    deps?: { name: string; reason: string }[];
  };
  allow?: {
    refs?: { path: string; reason: string }[];
  };
}
```

Rules:

- `deny.refs[].path` and `allow.refs[].path` resolve relative to the workspace root and must point to a reachable generated declaration project or a source tsconfig that maps to one through the generated graph.
- `deny.deps[].name` accepts package roots, `package.json#imports` specifiers with optional `*`, Node builtins such as `fs` or `node:fs`, and `node:*`.
- Relative paths, absolute paths, URL/data/file specifiers, and package subpaths such as `@scope/pkg/subpath` are rejected as deny dependency names.
- Use `deny.deps` for workspace package, `package.json#imports`, and Node builtin rules.

## `liminaOptions.implicitRefs`

`liminaOptions.implicitRefs` lives in ordinary source `tsconfig*.json` files and documents dynamic or virtual source edges that static import analysis cannot infer.

```jsonc
{
  "liminaOptions": {
    "implicitRefs": [
      { "path": "../runtime/tsconfig.json", "reason": "loaded by generated runtime manifest" },
    ],
  },
}
```

Rules enforced during generated graph preparation:

- The value must be an array of objects with non-empty `path` and `reason`.
- `path` is relative to the tsconfig that declares it.
- The target must exist and be an ordinary source `tsconfig*.json`, not generated, declaration, build, base, or check config.
- Self references are rejected.
- Source typecheck leaf configs must not hand-maintain `references`; use a solution-style `tsconfig.json` or `implicitRefs`.

## `liminaOptions.outputs`

`liminaOptions.outputs` lives on an ordinary source leaf and declares a user-facing artifact build:

```ts
interface LiminaOutputOptions {
  target?: string;
  rootDir?: string;
  outDir?: string;
  declarationMap?: boolean;
}
```

- Path fields resolve relative to the declaring source config.
- `outDir` defaults to `dist` under that config directory.
- `target` inherits `compilerOptions.target` when present and otherwise defaults to `ESNext`.
- `declarationMap` defaults to `false`.
- Managed `limina build <config>` requires an output-enabled source leaf, or an aggregator reaching at least one such leaf. Use `--raw --preset <checker>` for a user-maintained build config that should bypass this model.

## `proof.allowlist`

```ts
interface ProofAllowlistEntry {
  file: string;
  reason: string;
}
```

Validation rules enforced by `proof:check`:

- The file must exist.
- It must fall inside `config.source`.
- It must not already be covered by generated graph coverage or checker entry coverage.

## `package.entries`

```ts
interface PackageEntry {
  name: string;
  outDir: string;
  checks?: ('publint' | 'attw' | 'boundary')[];
  publint?: boolean | { level?: 'error' | 'warning' | 'suggestion'; strict?: boolean };
  attw?:
    | boolean
    | {
        entrypoints?: string[];
        entrypointsLegacy?: boolean;
        excludeEntrypoints?: (string | RegExp)[];
        ignoreRules?: PackageAttwIgnoreRule[];
        includeEntrypoints?: string[];
        level?: 'error' | 'warn';
        profile?: 'strict' | 'node16' | 'esm-only';
      };
  boundary?: {
    environment?: 'browser' | 'node' | string | ((relativeFilePath: string) => string);
    ignoredExternalPackages?: string[];
  };
}
```

Behavior:

- `checks` defaults to all three tools.
- `outDir` resolves from workspace root and must contain the publish-ready `package.json`.
- `publint.strict` defaults to `true`; `publint.level` is passed to publint and any returned message fails the check.
- `attw.profile` defaults to `esm-only`; CLI `--attw-profile` overrides it for one run.
- `attw.level: 'warn'` logs remaining ATTW problems as warnings and passes that subcheck; default behavior fails.
- `attw.ignoreRules` filters ATTW problem kinds after profile filtering.
- `boundary.environment` defaults to `node` for files under `node/` or `plugin/`, and `browser` for all other emitted JS files.
- `boundary.ignoredExternalPackages` allows runtime shim exceptions across emitted modules.

CLI overrides for `limina package check`:

- `--package <name>` may be repeated and filters entries by exact name.
- `--tool <publint | attw | boundary | all>` runs one tool or all tools.
- `--attw-profile <strict | node16 | esm-only>` overrides the configured ATTW profile.

## `release`

Release check settings:

```ts
type ReleaseNpmPackageJsonLintSeverity = 'error' | 'off' | 'warning';
type ReleaseNpmPackageJsonLintRuleConfig =
  | ReleaseNpmPackageJsonLintSeverity
  | readonly [ReleaseNpmPackageJsonLintSeverity, readonly unknown[] | Record<string, unknown>];

interface ReleaseConfig {
  contentHash?: {
    baselineTag?: string | ((args: { importerName: string; dependencyName: string }) => string);
    builtinIgnore?: boolean;
    ignore?:
      | string[]
      | ((args: { importerName: string; dependencyName: string }) => string[] | undefined);
  };
  npmPackageJsonLint?:
    | boolean
    | {
        rules?: Record<string, ReleaseNpmPackageJsonLintRuleConfig>;
      };
}
```

Rules:

- `baselineTag` defaults to `latest` and must resolve to a non-empty string.
- `builtinIgnore: true` enables Limina's built-in dependency artifact ignore set only when `ignore` is omitted or a function returns `undefined`.
- `ignore` patterns are package-relative glob patterns and must be non-empty strings.
- `npmPackageJsonLint` defaults to `false`. `true` enables Limina's packed-manifest rules; object form merges rule overrides using `off`, `warning`, `error`, or supported severity/options tuples.
- When `npmPackageJsonLint` is enabled, missing `npm-package-json-lint` is a command failure with an installation hint. Limina does not search for a separate npm-package-json-lint config file.

`limina release check` also uses `package.entries` selection, rejects `private: true`, packs `outDir`, checks tarball hygiene, and validates source/output manifest consistency plus workspace publish dependency consistency.

## `execution`

Bounded parallelism settings shared by pipeline tasks, checker execution, package checks, and release checks.

```ts
type ExecutionConcurrency = number | 'auto';

interface ExecutionConfig {
  checkerBuild?: ExecutionConcurrency;
  checkerTypecheck?: ExecutionConcurrency;
  packageEntries?: ExecutionConcurrency;
  releaseEntries?: ExecutionConcurrency;
  tasks?: ExecutionConcurrency;
}
```

Rules:

- Concurrency values must be positive integers or `'auto'`.
- Unknown `execution` fields are rejected.
- Defaults are `tasks: 'auto'`, `checkerBuild: 'auto'`, `checkerTypecheck: 2`, `packageEntries: 'auto'`, and `releaseEntries: 2`.

## `pipelines`

```ts
type BuiltinTaskName =
  | 'checker:build'
  | 'checker:typecheck'
  | 'graph:prepare'
  | 'graph:check'
  | 'package:check'
  | 'proof:check'
  | 'release:check'
  | 'source:check';
```

Step forms:

- Built-in task name as a bare string.
- External command as a bare string split on whitespace.
- `{ type: 'task', name }`.
- `{ type: 'command', command, args?, cwd?, env? }`.

Command step details:

- `cwd` resolves relative to the workspace root.
- `env` merges over `process.env`.
- `node_modules/.bin` for the command cwd is prepended to `PATH`.
- After any command step, the cached generated graph provider is reset.
- `vue-tsgo --build/-b` and `vue-tsgo --project/-p` command steps trigger cache preparation for the referenced config.

`limina check` with no pipeline name plans `graph:check`, `source:check`, `proof:check`, `checker:build`, and `checker:typecheck` as independent bounded tasks. They may run concurrently when dependencies and resource locks allow. Named pipelines preserve configured step order.

`limina check <name>` only runs `pipelines[name]`; missing names are errors and do not fall back to the default.

## Root Entry Helpers

```ts
import {
  CancelledFailure,
  ConfigurationError,
  defineConfig,
  ExecutionFailure,
  type GovernanceIssue,
  type IssueSeverity,
  type LiminaConfig,
} from 'limina';
```

- `defineConfig(value)` is an identity helper with typed overloads.
- Runtime values at the package root are `defineConfig`, `CancelledFailure`, `ConfigurationError`, and `ExecutionFailure`.
- Public types include config authoring types, the `GovernanceIssue` type family, and `IssueSeverity`.
- Runtime helpers such as `loadConfig`, checker resolution helpers, command runners, generated graph helpers, and resolved runtime types are internal.

Deeper runtime validation for graph rules, package entries, proof allowlist, Knip workspace config, import authority rules, tsconfig governance, and `implicitRefs` happens inside the relevant commands.
