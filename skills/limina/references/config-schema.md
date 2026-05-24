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
  command: 'check' | 'graph' | 'package' | 'paths' | 'proof' | 'source' | string;
  mode: string; // --mode flag, or process.env.NODE_ENV, or 'default'
}
```

## Top-level shape

```ts
interface LiminaConfig {
  config?: SharedLiminaConfig;
  graph?: GraphConfig;
  packageChecks?: PackageChecksConfig;
  paths?: PathsConfig;
  pipelines?: Record<string, PipelineStep[]>;
  proof?: ProofConfig;
}
```

## `config.checkers`

Each entry registers one checker capability.

```ts
interface CheckerConfig {
  preset: 'tsc' | 'vue-tsc' | 'svelte-check' | string;
  entry: string; // required, non-empty
  extensions?: string[]; // each must start with '.'
}
```

| Preset         | Default `extensions`                                  | Graph-capable | Build execution |
| -------------- | ----------------------------------------------------- | ------------- | --------------- |
| `tsc`          | `.ts, .tsx, .cts, .mts, .d.ts, .d.cts, .d.mts, .json` | yes           | yes             |
| `vue-tsc`      | `.vue`                                                | no            | yes             |
| `svelte-check` | `.svelte`                                             | no            | **no**          |

Validation:

- `entry` is required and must be a non-empty string. Resolved relative to the workspace root.
- For built-in presets, `extensions` may be omitted; defaults apply. Explicit `extensions` REPLACE the preset default (no merge).
- For a non-built-in preset name (e.g. `'custom-checker'`), `extensions` is required AND there must be an adapter registered for that preset — otherwise the config is rejected.
- The legacy `routes` field (and `routes.build` / `routes.typecheck`) is explicitly rejected with a migration hint.

## `config.source`

Controls which files `proof:check` requires coverage for.

```ts
interface SourceBoundaryConfig {
  include?: string[];
  exclude?: string[];
}
```

- If `include` is omitted, the effective source boundary is derived from the union of all configured checker `extensions` (built-in or explicit).
- If `include` is provided, it is the COMPLETE boundary — checker extensions are NOT merged in.
- `exclude` always filters the effective boundary.

Default `exclude` (used when not specified):

```js
[
  'node_modules',
  'dist',
  '.git',
  '.tsbuild',
  'coverage',
  '**/tsconfig*.json',
  '**/package.json',
  '.prettierrc.json',
  '.markdownlint.json',
  'vercel.json',
];
```

`exclude` accepts:

- Glob patterns (`**/*.test.ts`)
- Directory shorthands (`node_modules` expands to both `node_modules/**` and `**/node_modules/**`)
- Plain non-glob strings without `/` expand to both the bare entry and `**/<entry>`

## `graph.rules`

Label-based deny lists. A declaration leaf opts in by declaring `"limina": "<label>"` at the top level of its `tsconfig*.dts.json`.

```ts
interface GraphConfig {
  rules?: Record<string, GraphRule>;
}

interface GraphRule {
  deny?: GraphRuleDenyConfig;
}

interface GraphRuleDenyConfig {
  refs?: GraphRuleRefDenyEntry[]; // forbidden declaration-leaf targets
  deps?: GraphRuleDepDenyEntry[]; // forbidden package / package-import / node-builtin names
}

interface GraphRuleRefDenyEntry {
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

## `paths`

Controls generation of `tsconfig.dts.paths.generated.json` files for `workspace:*` source dependencies whose package exports still resolve to build artifacts.

```ts
interface PathsConfig {
  generatedFileName?: string; // default: 'tsconfig.dts.paths.generated.json'
  generatedFileMarker?: string; // default: 'GENERATED FILE - DO NOT EDIT BY HAND.'
  conditionPriority?: string[]; // export-condition priority during resolution
  artifactDirectories?: string[]; // dirs treated as build artifacts
  sourceExtensions?: string[]; // extensions tried when remapping artifact exports
}
```

Common values shown in upstream docs:

```js
{
  generatedFileName: 'tsconfig.dts.paths.generated.json',
  conditionPriority: ['source', 'development', 'types'],
  artifactDirectories: ['dist', 'build', 'lib', 'esm', 'cjs', 'out'],
}
```

The generated file is identified by its content marker, NOT by name — `limina paths` will refuse to rewrite a file at the configured name if the marker is absent. Generated files are NOT injected into `extends` arrays automatically; the user must add the relative path as the FIRST entry of the declaration leaf's `extends`.

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

## `packageChecks.targets`

Each target describes one built package output that must be inspected before publish.

```ts
interface PackageCheckTarget {
  outDir: string; // required
  name?: string; // defaults to outDir relpath
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

- `outDir` is resolved relative to the workspace root and MUST be the publish-ready directory (the one containing the built `package.json`, JS files, and declarations).
- If `<outDir>/package.json` does not set `private: true`, the same directory MUST also contain `README.md` and `LICENSE.md`, or `package:check` fails.
- `boundary.environment` defaults to a heuristic: paths starting with `node/` or `plugin/` are classified `node`, everything else is `browser`. Override with a string for whole-package environments, or a function for per-file rules.
- `attw.profile = 'esm-only'` ignores `node16-cjs` resolutions; `node16` ignores none; `strict` ignores none.

CLI overrides for `limina package check`:

- `--package <name>` filters to one target by `name` (or runs all when the cwd's nearest `package.json#name` does not match a configured target).
- `--tool <publint | attw | boundary | all>` runs only the listed tool (passing `all` is equivalent to omitting the flag).
- `--attw-profile <strict | node16 | esm-only>` overrides the configured ATTW profile for this invocation.

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
  | 'source:check';
```

Rules:

- A bare string equal to a built-in task name is treated as a task step.
- A bare string with a different value is split on whitespace and run as `{ command, args }` — error if the resulting command is empty.
- `cwd` (command steps) resolves relative to the workspace root.
- `env` (command steps) is merged over `process.env`.
- On the first failing step, remaining steps are skipped (not run).

`limina check` (no arg) runs the BUILT-IN default pipeline (NOT defined in `pipelines`): `graph:check` → `source:check` → `proof:check` → `checker:typecheck`. To override the default, define your own and invoke it by name.

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
- Custom preset without explicit `extensions`

Pipeline / graph rule / package check / paths / proof.allowlist deeper-shape validation happens inside each command rather than at `validateLiminaConfig` — those errors surface at runtime with the same field/value/reason format.
