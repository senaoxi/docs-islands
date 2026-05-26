---
name: limina
description: Use when configuring or operating the `limina` CLI in a TypeScript pnpm monorepo. Triggers on tasks involving `limina.config.mjs`, `defineConfig` from `limina`, the commands `limina init/check/graph/proof/source/paths/checker/package`, the built-in tasks `graph:check`/`source:check`/`proof:check`/`checker:build`/`checker:typecheck`/`package:check`, paired `tsconfig*.dts.json` declaration leaves with `tsconfig*.json` local companions, `tsc -b` project references, `workspace:*` source vs artifact dependencies, `publint`/`@arethetypeswrong/core`/runtime boundary checks before publishing, or generated `tsconfig.dts.paths.generated.json` files.
---

# Limina

Configurable governance CLI for TypeScript pnpm monorepos. Coordinates `tsc`/`vue-tsc`/`svelte-check`, validates the project-reference graph, enforces architecture rules, generates compatibility paths for `workspace:*` artifact exports, and audits built package outputs before publish.

Limina is not a bundler and does not replace `tsc`, `vue-tsc`, tests, or release tooling. It coordinates them.

## Mental model

The repository under Limina governance has these layers; downstream work usually touches one or more of them:

| Layer            | File pattern                                | Role                                                                                                                                                           |
| ---------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Graph aggregator | `tsconfig*.build.json`                      | Pure aggregator — only `$schema`, `files: []`, `references`. The single checker entry.                                                                         |
| Declaration leaf | `tsconfig*.dts.json`                        | Emits declarations via `tsc -b`. Has strict build options + direct `references`. Optionally carries a `"limina": "<label>"` field that opts into a graph rule. |
| Local companion  | `tsconfig*.json` (e.g. `tsconfig.lib.json`) | Owns strict typecheck semantics. Paired one-to-one with a declaration leaf of the same scope.                                                                  |
| IDE/default leaf | `tsconfig.json`                             | Either a pure aggregator with `references` OR a single typecheck leaf — never both.                                                                            |

Pairing rule: `tsconfig.lib.dts.json` ↔ `tsconfig.lib.json`, `tsconfig.tools.dts.json` ↔ `tsconfig.tools.json`, `tsconfig.test.dts.json` ↔ `tsconfig.test.json`, and `tsconfig.dts.json` ↔ `tsconfig.json` when the directory has a single environment.

Dependency semantics (driven by the package-manifest specifier, not the import statement):

- `workspace:*` → **source dependency**: must be modeled as a `tsc -b` project reference; package exports for that dep should point at source files. If they point at `dist`, Limina either rejects the import or requires a generated paths compatibility file (see `paths` below).
- `link:`, `file:`, `catalog:`, normal semver → **artifact dependency**: must NOT be modeled as a project reference; consumed as already-built output.

## Quick start

```sh
pnpm add -D limina typescript
pnpm exec limina init           # interactive
pnpm exec limina init --yes     # non-TTY / CI
```

`limina init` searches upward for `pnpm-workspace.yaml`, generates `tsconfig*.dts.json` for every valid local companion, generates `tsconfig.build.json` aggregators at each workspace and root, writes a minimal `limina.config.mjs`, and adds a `limina:check` script plus a `limina` devDependency to the root `package.json`. It refuses to overwrite existing `tsconfig*.build.json` / `tsconfig*.dts.json` files.

After init: `pnpm i && pnpm limina:check`.

Minimal config:

```js
// limina.config.mjs
import { defineConfig } from 'limina';

export default defineConfig({
  config: {
    checkers: {
      typescript: { preset: 'tsc', entry: 'tsconfig.build.json' },
    },
  },
});
```

## CLI quick reference

| Command                                                            | Purpose                                                        | Exit non-zero when                                                                                                      |
| ------------------------------------------------------------------ | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `limina init [--yes]`                                              | Bootstrap declaration graph, aggregators, config, root script  | Reserved tsconfig names already exist, ambiguous `tsconfig.json` role, `workspace:*` import can't be mapped to a leaf   |
| `limina check`                                                     | Run built-in default pipeline                                  | Any of `graph:check`, `source:check`, `proof:check`, `checker:build`, `checker:typecheck` fails                         |
| `limina check <pipeline>`                                          | Run a user pipeline from `pipelines`                           | Pipeline name missing, or any step fails                                                                                |
| `limina graph check`                                               | Project refs match real imports; deny rules; dts option parity | Reference mismatch, denied dep/ref, missing project reference, cross-package relative import, etc.                      |
| `limina source check`                                              | Package-owner boundary checks                                  | Relative import crosses package, bare import not in deps/devDeps, `#imports` outside owner scope                        |
| `limina proof check`                                               | Declaration leaf ↔ companion alignment, source coverage       | Missing companion, drifted compilerOptions, uncovered source file, duplicate graph coverage                             |
| `limina paths generate`                                            | Write `tsconfig.dts.paths.generated.json`                      | (Never fails on stale; use `paths check` for CI)                                                                        |
| `limina paths apply`                                               | Alias for `paths generate`                                     | —                                                                                                                       |
| `limina paths check`                                               | Fail if generated path files are stale                         | Any generated file is outdated or missing                                                                               |
| `limina checker build`                                             | Build execution for first-class checkers (`tsc`, `vue-tsc`)    | Any checker exits non-zero                                                                                              |
| `limina checker typecheck`                                         | Direct execution for source-only checkers (`svelte-check`)     | Any checker exits non-zero, or peer dep missing                                                                         |
| `limina package check [--package N] [--tool T] [--attw-profile P]` | publint + attw + boundary on built outputs                     | Any configured package tool fails                                                                                       |
| `limina release check [--package N]`                               | Release hygiene and dependency consistency for package entries | Cwd package name is not configured, package output is private/missing/dirty, or workspace publish deps are inconsistent |

Global flags on every command: `--config <path>` (override config file), `--mode <mode>` (passed to function-style configs, defaults to `NODE_ENV` then `"default"`).

For complete flag tables and exit semantics: see [references/cli.md](references/cli.md).

## Built-in task names (use inside `pipelines`)

`graph:check`, `source:check`, `proof:check`, `checker:build`, `checker:typecheck`, `package:check`, `release:check`

The default `limina check` pipeline (no name argument) runs `graph:check` → `source:check` → `proof:check` → `checker:build` → `checker:typecheck` in that order. `limina check <name>` ONLY runs user pipelines — it does NOT fall back to the default if the name is missing.

## Checker presets

| Preset         | Default extensions                             | Graph-capable | Execution | Required peer dep              |
| -------------- | ---------------------------------------------- | ------------- | --------- | ------------------------------ |
| `tsc`          | `.ts .tsx .cts .mts .d.ts .d.cts .d.mts .json` | first-class   | build     | `typescript`                   |
| `vue-tsc`      | `.vue`                                         | first-class   | build     | `vue-tsc`, `@vue/compiler-sfc` |
| `svelte-check` | `.svelte`                                      | source-only   | typecheck | `svelte-check`                 |

Only graph-capable checkers (currently `tsc`) drive the declaration leaf graph that `graph:check` validates. Other checkers still need a `tsconfig*.build.json` entry and `tsconfig*.dts.json` leaves so `proof:check` can prove coverage.

A configured checker entry omitting `extensions` uses the preset defaults. Custom (non-built-in) preset strings MUST declare `extensions`.

## Typical usage patterns

### Run before sending a PR

```sh
pnpm exec limina check
```

### Pre-publish

```sh
pnpm build
pnpm exec limina package check
pnpm exec limina release check --package <name>
pnpm exec limina check publish    # only if a `publish` pipeline is defined
```

### Add a publish pipeline to the config

```js
export default defineConfig({
  // ...checker config...
  pipelines: {
    publish: [
      'graph:check',
      'proof:check',
      { type: 'command', command: 'pnpm', args: ['build'] },
      'package:check',
      'release:check',
    ],
  },
});
```

Pipeline step forms:

- Built-in task name as a bare string: `'graph:check'`
- External command as a string split on whitespace: `'pnpm build'` → `{ command: 'pnpm', args: ['build'] }`
- Explicit object: `{ type: 'command', command, args?, cwd?, env? }` (relative `cwd` resolves from workspace root; `env` merges over `process.env`)
- Explicit task object: `{ type: 'task', name: BuiltinTaskName }`

### Add an architecture deny rule

In the config:

```js
graph: {
  rules: {
    'runtime-client': {
      deny: {
        refs: [{ path: 'packages/app/src/node/tsconfig.lib.dts.json', reason: 'client must not depend on node runtime' }],
        deps: [
          { name: 'node:*', reason: 'client must not import Node builtins' },
          { name: '@acme/node-only', reason: 'client must not consume node-only packages' },
          { name: '#server/*', reason: 'client must not use server-only package imports' },
        ],
      },
    },
  },
},
```

Then opt the declaration leaf into the rule:

```jsonc
// tsconfig.lib.dts.json
{
  "limina": "runtime-client",
  "extends": ["./tsconfig.json", "../../tsconfig.dts.base.json"],
  "references": [],
}
```

`deny.deps[].name` supports:

- Workspace/external package roots: `@acme/internal`, `zod`
- `package.json#imports` specifiers with `*` wildcard: `#server/*`
- Node builtins: `fs`, `node:fs`, or the catch-all `node:*`

Relative paths, absolute paths, URL/data/file: specifiers are rejected as invalid deny names.

### Allow a single uncovered source file

```js
proof: {
  allowlist: [
    { file: 'src/generated/runtime.d.ts', reason: 'Generated declaration covered by the build pipeline.' },
  ],
},
```

Allowlist is the last resort after checker entries fail to cover a file. Limina reports an error if an allowlisted file is already covered, or is outside the source boundary.

### When a workspace:\* dep still exports `dist`

If a `workspace:*` source dep's `package.json#exports` resolves to a build artifact, `graph:check` fails. Either:

1. Make that package's exports point at source (preferred long-term fix), OR
2. Generate a compatibility paths file:

```sh
pnpm exec limina paths generate
```

Limina writes `tsconfig.dts.paths.generated.json` next to the declaration leaf and prints which leaves need to extend it manually. Add it as the FIRST entry of the leaf's `extends` array:

```jsonc
// tsconfig.lib.dts.json
{
  "extends": [
    "./tsconfig.dts.paths.generated.json",
    "./tsconfig.json",
    "../../tsconfig.dts.base.json",
  ],
}
```

Add `limina paths check` to CI to fail when generated files drift.

## Programmatic API

```ts
import { defineConfig, loadConfig } from 'limina';

const config = await loadConfig({ cwd: process.cwd() });
// → ResolvedLiminaConfig: LiminaConfig & { configPath, rootDir }
```

`defineConfig(value)` is an identity helper with overloads for: plain object, Promise, `(env) => config`, `(env) => Promise<config>`. The env argument is `{ command, mode }` where `mode` defaults to `process.env.NODE_ENV ?? 'default'`.

`loadConfig` options: `{ command?, configPath?, cwd?, mode? }`. With no `configPath`, Limina walks up from `cwd` to find the nearest `limina.config.mjs`, bounded by the `pnpm-workspace.yaml` root.

Other named exports from the `limina` entry: `validateLiminaConfig`, `getActiveCheckers`, `getActiveCheckerExtensions`, `runInit`, `runSourceCheck`, `runCheckerBuild`, `runCheckerTypecheck`, `createLiminaFlowReporter`, `LiminaFlowReporter`, `isOrdinaryTypecheckConfigPath`, and the full set of config types (`LiminaConfig`, `ResolvedLiminaConfig`, etc.). For a typed config file with no runtime use, import only from the `limina/config` subpath.

## Requirements

- Node `^20.19.0 || >=22.12.0`
- pnpm workspace with `pnpm-workspace.yaml` at the workspace root
- `typescript` installed locally (declared as an optional peerDep; `getActiveCheckers` needs it)
- `vue-tsc` / `svelte-check` only required if the corresponding preset is configured
- Config file must be ESM: `limina.config.mjs`

## Common mistakes

| Symptom                                                | Root cause                                                                    | Fix                                                                                                                                                          |
| ------------------------------------------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Unable to find limina config`                         | Running outside the workspace, or no `limina.config.mjs` reachable upward     | `cd` into the workspace, pass `--config`, or run `limina init`                                                                                               |
| `no pnpm-workspace.yaml was found`                     | Limina infers the workspace root from `pnpm-workspace.yaml`                   | Add `pnpm-workspace.yaml` at the workspace root                                                                                                              |
| Pipeline `<name>` not found                            | `limina check <name>` only runs user pipelines, no fallback                   | Define it in `pipelines`, or run `limina check` (no arg) for the default                                                                                     |
| Generated paths file rewritten on every run            | The leaf does not `extends` the generated file as the FIRST entry             | Move the generated path to position 0 in `extends`; commit it if reproducible `tsc -b` is required                                                           |
| `Missing project reference for workspace import`       | Source dep imported but the dts leaf is missing the reference                 | Add `{ "path": "../dep/tsconfig.lib.dts.json" }` to the importing leaf's `references`                                                                        |
| `outDir package.json not found` during `package check` | `outDir` is not the built package directory, or the package hasn't been built | Build first (`pnpm build`), then point `outDir` at the publish-ready directory                                                                               |
| `DTS config is not valid for tsc -b`                   | Leaf overrode required compiler options                                       | Restore `composite: true`, `incremental: true`, `noEmit: false`, `declaration: true`, `emitDeclarationOnly: true`, plus `rootDir`/`outDir`/`tsBuildInfoFile` |
| `Invalid Limina checker config: routes`                | Old config shape                                                              | Replace `routes.build` with `entry`; migrate `routes.typecheck` targets to `tsconfig*.dts.json` leaves reachable from `entry`                                |

More failure modes and resolutions are in [references/troubleshooting.md](references/troubleshooting.md).

## Reference index

Load only what the current task needs:

- [references/config-schema.md](references/config-schema.md) — Complete `LiminaConfig` schema, every field, defaults, and validation behavior.
- [references/cli.md](references/cli.md) — Every command, flag, action, and exit-code rule.
- [references/architecture.md](references/architecture.md) — Declaration leaf vs companion, project graph rules, source-vs-artifact dependency semantics, `tsconfig.json` role rules.
- [references/package-checks.md](references/package-checks.md) — `publint`, `@arethetypeswrong/core`, runtime import-boundary auditing, ATTW profiles, and the release-only tarball hygiene split.
- [references/troubleshooting.md](references/troubleshooting.md) — Failure-by-failure cause/fix table for every error class Limina emits.

## Design principles (project-side guarantees Limina enforces)

- Explicit policy beats hidden presets — all rules live in `limina.config.mjs`.
- Source graph checks and package artifact checks validate different surfaces; both are required.
- Build graph configs must be strict, small, and directly referenced.
- Generated compatibility paths are transitional, not the default architecture.
- Failures come with actionable messages, not silent acceptance.
