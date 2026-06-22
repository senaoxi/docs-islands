# Limina Config Schema Reference

Source-backed reference for the `LiminaConfig` surface.

## File Format

- Filename: `limina.config.mjs`
- Module format: ESM
- Default export: `LiminaConfig`, `Promise<LiminaConfig>`, `(env) => LiminaConfig`, or `(env) => Promise<LiminaConfig>`

```js
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
  command: 'check' | 'graph' | 'package' | 'proof' | 'release' | 'source' | string;
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
  release?: ReleaseConfig;
  source?: SourceCheckConfig;
}
```

Top-level `paths` is not part of `LiminaConfig`.

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
| `vue-tsc`      | yes          | build     | `vue-tsc`, `@vue/compiler-sfc`           |
| `vue-tsgo`     | yes          | typecheck | `vue-tsgo`, `@typescript/native-preview` |
| `svelte-check` | no           | typecheck | `svelte-check`                           |

`getActiveCheckers(config)` returns manually configured checkers sorted by name. In omitted/auto mode it returns an empty array at plain config-validation time; generated graph preparation resolves real auto checkers by scanning ordinary `**/tsconfig.json` scopes.

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

- If `include` is omitted, Limina starts with TypeScript/JavaScript/JSON defaults and adds framework extensions from configured checker capabilities, such as `.vue` or `.svelte`.
- If `include` is provided, it is the complete global source boundary.
- `exclude` always filters the effective boundary.
- If `exclude` is omitted, Limina reads the root `.gitignore` and applies the built-in excludes: `nx.json`, `project.json`, root `tsconfig.json`, `**/tsconfig.*.json`, `dist`, `.nx`, `.git`, `.tsbuild`, `coverage`, and `node_modules`. `.limina` is excluded when it is ignored by the root `.gitignore`.

## `source`

Source-owned dependency usage checks.

```ts
interface SourceCheckConfig {
  knip?: boolean | SourceKnipCheckConfig;
  importAuthority?: SourceImportAuthorityConfig;
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
  allow?: SourceImportAuthorityAllowRule[];
}

interface SourceImportAuthorityAllowRule {
  files: string[];
  packages?: string[];
  specifiers?: string[];
  owner?: string;
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
- Limina uses Knip defaults unless a package has a static script such as `limina checker build tsconfig.json`; `source.knip.workspaces` accepts `entry`, `ignoreDependencies`, and `ignoreFiles`.

`source.importAuthority` behavior:

- Source imports must normally be authorized by the nearest pnpm workspace package manifest.
- `allow[].packages` lets matching files also use the workspace root `package.json` as an authority manifest for listed package names or package-name globs. The root manifest must exist and must declare the package.
- `allow[].specifiers` explicitly authorizes full import specifiers or specifier globs for matching files.
- `allow[].files` is required and matches workspace-root-relative source file globs.
- Each allow entry must include `packages` or `specifiers`, plus a non-empty `reason`.
- `owner` optionally scopes the rule to a source owner identity: package name for named owners, or workspace-root-relative package directory for nameless owners.
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

Release-only dependency artifact hash settings:

```ts
interface ReleaseConfig {
  contentHash?: {
    baselineTag?: string | ((args: { importerName: string; dependencyName: string }) => string);
    builtinIgnore?: boolean;
    ignore?:
      | string[]
      | ((args: { importerName: string; dependencyName: string }) => string[] | undefined);
  };
}
```

Rules:

- `baselineTag` defaults to `latest` and must resolve to a non-empty string.
- `builtinIgnore: true` enables Limina's built-in dependency artifact ignore set only when `ignore` is omitted or a function returns `undefined`.
- `ignore` patterns are package-relative glob patterns and must be non-empty strings.

`limina release check` also uses `package.entries` selection, rejects `private: true`, packs `outDir`, checks tarball hygiene, and validates source/output manifest consistency plus workspace publish dependency consistency.

## `execution`

Bounded parallelism settings shared by pipeline tasks, checker execution, package checks, and release checks.

```ts
type ExecutionConcurrency = number | 'auto';

interface ExecutionConfig {
  checkerBuild?: ExecutionConcurrency;
  checkerTypecheck?: ExecutionConcurrency;
  failFast?: boolean;
  packageEntries?: ExecutionConcurrency;
  releaseEntries?: ExecutionConcurrency;
  tasks?: ExecutionConcurrency;
}
```

Rules:

- Concurrency values must be positive integers or `'auto'`.
- `failFast` must be boolean when configured.
- Unknown `execution` fields are rejected.
- Defaults are `tasks: 'auto'`, `checkerBuild: 'auto'`, `checkerTypecheck: 2`, `packageEntries: 'auto'`, `releaseEntries: 2`, and `failFast: false`.

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

`limina check` with no pipeline name runs the built-in default pipeline:

`graph:check` → `source:check` → `proof:check` → `checker:build` → `checker:typecheck`

`limina check <name>` only runs `pipelines[name]`; missing names are errors and do not fall back to the default.

## Root Entry Helpers

```ts
import { defineConfig, type LiminaConfig } from 'limina';
```

- `defineConfig(value)` is an identity helper with typed overloads.
- The package root is config-only: `defineConfig` plus config authoring types are public.
- Runtime helpers such as `loadConfig`, checker resolution helpers, command runners, generated graph helpers, and resolved runtime types are internal.

Deeper runtime validation for graph rules, package entries, proof allowlist, Knip workspace config, import authority rules, tsconfig governance, and `implicitRefs` happens inside the relevant commands.
