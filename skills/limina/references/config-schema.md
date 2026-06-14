# Limina Config Schema Reference

Complete reference for `LiminaConfig`. Every field, default, and validation rule.

## File format

- Filename: `limina.config.mjs`
- Module format: ESM
- Default export: `LiminaConfig`, `Promise<LiminaConfig>`, `(env) => LiminaConfig`, or `(env) => Promise<LiminaConfig>`

```js
import { defineConfig } from 'limina';

export default defineConfig({
  /* LiminaConfig */
});
```

Function form receives `env`:

```ts
interface LiminaConfigEnv {
  command: 'check' | 'graph' | 'package' | 'proof' | 'source' | string;
  mode: string; // --mode flag, or process.env.NODE_ENV, or 'default'
}
```

## Top-level shape

```ts
interface LiminaConfig {
  config?: SharedLiminaConfig;
  graph?: GraphConfig;
  package?: PackageConfig;
  pipelines?: Record<string, PipelineStep[]>;
  proof?: ProofConfig;
  source?: SourceCheckConfig;
}
```

## `config.checkers`

Each entry registers one checker capability.

```ts
interface CheckerConfig {
  preset: 'tsc' | 'tsgo' | 'vue-tsc' | 'vue-tsgo' | 'svelte-check' | string;
  entry: string; // required, non-empty
  extensions?: string[]; // each must start with '.'
}
```

| Preset         | Default `extensions`                                  | Graph-capable | Build execution |
| -------------- | ----------------------------------------------------- | ------------- | --------------- |
| `tsc`          | `.ts, .tsx, .cts, .mts, .d.ts, .d.cts, .d.mts, .json` | yes           | yes             |
| `tsgo`         | `.ts, .tsx, .cts, .mts, .d.ts, .d.cts, .d.mts, .json` | yes           | yes             |
| `vue-tsc`      | `.vue`                                                | yes           | yes             |
| `vue-tsgo`     | `.vue`                                                | yes           | **no**          |
| `svelte-check` | `.svelte`                                             | no            | **no**          |

`vue-tsgo` is intentionally source-only for execution but remains graph-aware for Limina coverage proof. Current `vue-tsgo --build` does not preserve TypeScript project-reference boundaries and does not provide incremental build semantics; prefer `vue-tsc` for first-class Vue build checks.

Validation:

- `entry` is required and must be a non-empty string. Resolved relative to the workspace root.
- For built-in presets, `extensions` may be omitted; defaults apply. Explicit `extensions` REPLACE the preset default (no merge).
- For a non-built-in preset name (e.g. `'custom-checker'`), `extensions` is required AND there must be an adapter registered for that preset — otherwise the config is rejected.
- The legacy `routes` field (and `routes.build` / `routes.typecheck`) is explicitly rejected with a migration hint.

## `config.source`

Controls Limina's global source boundary for `proof:check`. `source:check` handles package authority and ordinary typecheck ownership separately, and its unused workspace dependency analysis is Knip-backed from package entries rather than this boundary.

```ts
interface SourceBoundaryConfig {
  include?: string[];
  exclude?: string[];
}
```

- If `include` is omitted, the effective global source boundary starts with `**/*.ts`, `**/*.d.ts`, `**/*.tsx`, `**/*.cts`, `**/*.d.cts`, `**/*.mts`, `**/*.d.mts`, `**/*.mjs`, and `**/*.json`, then adds non-base checker extensions such as `**/*.vue` or `**/*.svelte`.
- If `include` is provided, it is the COMPLETE global source boundary — checker extensions are NOT merged in.
- `exclude` always filters the effective boundary.

Default `exclude` (used when not specified) reads the workspace root `.gitignore` and always also applies:

```js
[
  'nx.json',
  'project.json',
  'tsconfig.json',
  '**/tsconfig.*.json',
  'dist',
  '.nx',
  '.git',
  '.tsbuild',
  'coverage',
  'node_modules',
];
```

`exclude` accepts:

- Glob patterns (`**/*.test.ts`)
- Directory shorthands (`node_modules` expands to both `node_modules/**` and `**/node_modules/**`)
- Plain non-glob strings without `/` expand to both the bare entry and `**/<entry>`

## `source`

Controls source-owned dependency usage checks.

```ts
interface SourceCheckConfig {
  additionalEntries?: SourceAdditionalEntryConfig[];
  unusedDependencies?: SourceUnusedDependenciesConfig;
  unusedModules?: SourceUnusedModulesConfig;
}

interface SourceUnusedDependenciesConfig {
  ignore?: SourceUnusedDependencyIgnoreEntry[];
}

interface SourceUnusedDependencyIgnoreEntry {
  importer: string;
  dependency: string;
  reason: string;
}

interface SourceUnusedModulesConfig {
  ignore?: SourceUnusedModuleIgnoreEntry[];
}

interface SourceAdditionalEntryConfig {
  owner: string;
  files: string[];
  reason: string;
}

interface SourceUnusedModuleIgnoreEntry {
  owner: string;
  file: string;
  reason: string;
}
```

`source.unusedDependencies.ignore` configures exceptions for `source:check` unused workspace dependency analysis:

- Only workspace package dependencies are checked; third-party npm dependencies are ignored.
- Usage is delegated to Knip and counted from source-facing package entries, binaries, scripts, and Knip-supported tool entries.
- `importer` and `dependency` must name existing workspace packages.
- The dependency pair must still be declared in the importer's `dependencies`, `devDependencies`, `peerDependencies`, or `optionalDependencies`.
- `reason` must be a non-empty explanation for why Knip cannot see the usage.

`source.additionalEntries` configures extra owner-scoped source entries on top of Limina's default entry surface:

- Owners with `package.json#exports` use package exports, package binaries, package scripts, and Knip-supported plugin entries as default entries.
- Package owners without `package.json#exports` are treated as application-style owners: Limina generates a temporary Knip entry that imports the full owner source module set for dependency analysis and skips unused-file coverage for that owner.
- Additional entries are for test runners, local tooling, or build steps that should not be package exports.
- Entry `files` must be positive workspace-root-relative glob patterns inside that owner package directory.
- `owner` must name an existing package owner with a package.json name.
- `reason` must be a non-empty explanation for why these modules are legitimate entries.

`source.unusedModules.ignore` configures exceptions for unused source module analysis:

- Limina provides Knip with each named package owner's known source module set.
- Knip counts modules reachable from source-facing package entries, binaries, scripts, Knip-supported plugin entries, and `source.additionalEntries`.
- `file` must be a workspace-root-relative path inside the repository and must belong to that owner's source module set.
- `reason` must be a non-empty explanation for why Knip cannot see the usage.

## `graph.rules`

Label-based graph rules. A declaration leaf opts in by declaring labels under `liminaOptions.graphRules` in its `tsconfig*.dts.json`.

```ts
interface GraphConfig {
  rules?: Record<string, GraphRule>;
}

interface GraphRule {
  deny?: GraphRuleDenyConfig;
  allow?: GraphRuleAllowConfig;
}

interface GraphRuleDenyConfig {
  refs?: GraphRuleRefDenyEntry[]; // forbidden declaration-leaf targets
  deps?: GraphRuleDepDenyEntry[]; // forbidden package / package-import / node-builtin names
}

interface GraphRuleAllowConfig {
  refs?: GraphRuleRefAllowEntry[]; // extra declared refs allowed when static imports cannot prove them
}

interface GraphRuleRefDenyEntry {
  path: string;
  reason: string;
}
interface GraphRuleRefAllowEntry {
  path: string;
  reason: string;
}
interface GraphRuleDepDenyEntry {
  name: string;
  reason: string;
}
```

`deny.refs[].path` requirements:

- Resolves relative to the workspace root.
- MUST be reachable from at least one checker entry, otherwise validation fails.
- MUST be a `tsconfig*.dts.json` declaration leaf.

`deny.deps[].name` accepted forms:

- Plain package root: `zod`, `@acme/internal`
- `package.json#imports` specifier (may contain `*`): `#server/*`, `#internal/db`
- Node builtin: `fs`, `node:fs`
- Catch-all builtins: `node:*` (matches every Node builtin)

Rejected forms (cause config error): relative specifiers (`.`, `./`, `../`), absolute paths, URL/data/file: specifiers, sub-paths (`@acme/internal/sub` — limit to the root specifier).

Removed legacy fields with explicit error messages: `deny.workspaceDeps`, `deny.nodeBuiltins`. Migrate everything to `deny.deps`.

## `proof.allowlist`

Per-file exceptions for source coverage proof.

```ts
interface ProofAllowlistEntry {
  file: string; // workspace-relative path; required, non-empty
  reason: string; // human explanation; required, non-empty
}
```

Validation rules enforced by `proof:check`:

- File must exist.
- File must fall inside the configured source boundary — an allowlist for a file the boundary already excludes is an error.
- File must NOT already be covered by a checker entry — redundant allowlists are an error.

## `package.entries`

Each entry describes one built package output that must be inspected before publish.

```ts
interface PackageEntry {
  name: string; // required; used by --package and release cwd matching
  outDir: string; // required
  checks?: ('publint' | 'attw' | 'boundary')[]; // defaults to all three
  publint?: { strict?: boolean }; // default { strict: true }
  attw?: { profile?: 'strict' | 'node16' | 'esm-only' }; // default 'esm-only'
  boundary?: {
    environment?: 'browser' | 'node' | string | ((relativeFilePath: string) => string);
    ignoredExternalPackages?: string[];
  };
}
```

Behavior:

- `name` is required and must match `package.json#name` for cwd-based `release:check`.
- `outDir` is resolved relative to the workspace root and MUST be the publish-ready directory (the one containing the built `package.json`, JS files, and declarations).
- `package:check` runs only the configured consumer-facing tools: `publint`, `attw`, and `boundary`.
- `release:check` uses the same entry selection, rejects `private: true`, packs the npm tarball, checks publish hygiene (`README.md`, `LICENSE.md`, no source maps), and runs npm registry-backed workspace publish dependency consistency.
- `boundary.environment` defaults to a heuristic: paths starting with `node/` or `plugin/` are classified `node`, everything else is `browser`. Override with a string for whole-package environments, or a function for per-file rules.
- `attw.profile = 'esm-only'` ignores `node16-cjs` resolutions; `node16` ignores none; `strict` ignores none.

CLI overrides for `limina package check`:

- `--package <name>` filters to one or more entries by `name` (or runs all when the cwd's nearest `package.json#name` does not match a configured entry).
- `--tool <publint | attw | boundary | all>` runs only the listed tool (passing `all` is equivalent to omitting the flag).
- `--attw-profile <strict | node16 | esm-only>` overrides the configured ATTW profile for this invocation.

CLI overrides for `limina release check`:

- `--package <name>` filters to one or more entries by `name` and skips cwd matching.
- Without `--package`, the cwd's nearest `package.json#name` MUST match one configured entry.

See [package-checks.md](package-checks.md) for the full check semantics.

## `pipelines`

Named ordered step lists.

```ts
type PipelineStep =
  | string // built-in task OR whitespace-split command
  | { type: 'task'; name: BuiltinTaskName }
  | {
      type: 'command';
      command: string;
      args?: string[];
      cwd?: string;
      env?: Record<string, string>;
    };

type BuiltinTaskName =
  | 'checker:build'
  | 'checker:typecheck'
  | 'graph:check'
  | 'package:check'
  | 'proof:check'
  | 'release:check'
  | 'source:check';
```

Rules:

- A bare string equal to a built-in task name is treated as a task step.
- A bare string with a different value is split on whitespace and run as `{ command, args }` — error if the resulting command is empty.
- `cwd` (command steps) resolves relative to the workspace root.
- `env` (command steps) is merged over `process.env`.
- On the first failing step, remaining steps are skipped (not run).

`limina check` (no arg) runs the BUILT-IN default pipeline (NOT defined in `pipelines`): `graph:check` → `source:check` → `proof:check` → `checker:build` → `checker:typecheck`. To override the default, define your own and invoke it by name.

`limina check <name>` ONLY runs `pipelines[<name>]`. Missing name is an error — Limina does not fall back to the default.

## Programmatic helpers

```ts
import {
  defineConfig,
  loadConfig,
  validateLiminaConfig,
  getActiveCheckers,
  getActiveCheckerExtensions,
  type LiminaConfig,
  type ResolvedLiminaConfig,
} from 'limina';
```

- `defineConfig(value)` — identity helper with typed overloads. Use in `limina.config.mjs`.
- `loadConfig({ command?, configPath?, cwd?, mode? })` — resolves and validates a config. Returns `ResolvedLiminaConfig` = `LiminaConfig & { configPath, rootDir }`. Throws when no config can be found, when the file lives outside the workspace, or when validation fails.
- `validateLiminaConfig(config)` — throws with a multi-issue message if checker shape is invalid.
- `getActiveCheckers(config)` — returns sorted `ResolvedCheckerConfig[]` (`{ name, entry, preset, extensions }`).
- `getActiveCheckerExtensions(config)` — deduped, length-then-locale-sorted extensions list across all checkers.

For pure type-only imports without paying the runtime cost, import from the `limina/config` subpath:

```ts
import type { LiminaConfig } from 'limina/config';
```

## Validation behavior

`validateLiminaConfig` throws a single `Error` with one or more issue blocks joined by `\n\n`. Each block formats as:

```
Invalid Limina checker config:
  field: config.checkers.typescript.entry
  value: ""
  reason: checker entry must be a non-empty string path.
```

Issue codes covered by built-in validation:

- Missing or empty `config.checkers.<name>.entry`
- Empty or non-dot-prefixed `extensions`
- Unsupported preset name (no adapter registered)
- Presence of removed `routes` field
- Presence of removed `paths` field
- Presence of removed `graph.unusedWorkspaceDependencies` field
- Presence of removed `config.source.unusedDependencies` field
- Presence of removed `config.source.unusedModules` field
- Custom preset without explicit `extensions`

Pipeline / graph rule / package check / proof.allowlist / source.additionalEntries / source.unusedDependencies / source.unusedModules deeper-shape validation happens inside each command rather than at `validateLiminaConfig` — those errors surface at runtime with the same field/value/reason format.
