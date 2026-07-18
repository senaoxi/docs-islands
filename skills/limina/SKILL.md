---
name: limina
description: Use when configuring or operating the `limina` CLI in a TypeScript pnpm monorepo. Triggers on tasks involving `limina.config.mts`, supported config files such as `limina.config.ts`, `limina.config.mjs`, or `limina.config.js`, `defineConfig` from `limina`, the commands `limina init/migration/check/graph/proof/source/build/checker/package/release`, the built-in tasks `graph:prepare`/`graph:check`/`source:check`/`proof:check`/`checker:build`/`checker:typecheck`/`package:check`/`release:check`, generated `.limina` checker graphs, source `tsconfig.json` entries, checker `include` selectors, `tsc -b` project references, source-vs-artifact import resolution, `publint`/`@arethetypeswrong/core`/runtime boundary checks before publishing, or source-vs-built package manifest alignment.
---

# Limina

Configurable governance CLI for TypeScript pnpm monorepos. Coordinates `tsc`/`tsgo`/`vue-tsc`/`vue-tsgo`/`svelte-check`, generates an internal checker graph from ordinary source `tsconfig.json` entries, validates source and package boundaries, keeps source manifests aligned with source imports, and audits built package outputs before publish.

Limina is not a bundler and does not replace `tsc`, `tsgo`, `vue-tsc`, `vue-tsgo`, tests, or release tooling. It coordinates them.

## Mental model

The repository under Limina governance has these layers; downstream work usually touches one or more of them:

| Layer                    | File pattern                                            | Role                                                                                                                                                 |
| ------------------------ | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source entry             | `tsconfig.json`                                         | Ordinary workspace-root-relative checker entry. `checker.include` may only select these entry files. Auto checker discovery starts from these files. |
| Source project config    | `tsconfig*.json` reached from a selected source entry   | Owns typecheck semantics for source files. Limina follows ordinary `tsconfig.json` solution references from selected entries.                        |
| Generated checker graph  | `.limina/tsconfig/checkers/<checker>/**`                | Internal declaration/build files materialized by `graph prepare`, managed build/checker execution, or check pipelines that require them.             |
| Package manifest surface | `package.json#dependencies`, `#exports`, and `#imports` | Defines consumer-visible package access, dependency authorization, and source-vs-artifact dependency semantics.                                      |

Generated `.limina` files are implementation artifacts. Users should maintain source `tsconfig*.json`, package manifests, and `limina.config.mts`; do not ask users to handwrite generated declaration graph files or generated `.limina` build configs.

Dependency semantics have two separate decisions:

- A declaration in `dependencies`, `devDependencies`, `peerDependencies`, or `optionalDependencies` authorizes the package import regardless of whether its version uses `workspace:`, `link:`, `file:`, `catalog:`, or semver.
- The actual TypeScript/import resolution target decides the relationship. A target owned by a governed source config is a **source dependency** and needs the generated project-reference edge. A target in declarations or built output is **declaration/artifact consumption** and does not need that source reference; artifact edges are available through `graph export`.

Local protocols are valid authorization in source manifests. They are rejected only when they leak into publish-ready built or release manifests.

## Quick start

```sh
pnpm add -D limina@latest typescript
pnpm exec limina init           # interactive
pnpm exec limina init --yes     # non-TTY / CI
```

`limina init` searches upward for `pnpm-workspace.yaml`, confirms the workspace root, writes an auto-first `limina.config.mts`, ensures `.limina/` is ignored, creates or updates the root `package.json`, and adds missing `limina` / `typescript` devDependencies. It writes or preserves a root `limina:build` script with `limina checker build` and keeps the generated graph lifecycle separate: files are materialized later by `limina graph prepare`, managed build/checker execution, or check pipelines that require them. Validation-only graph/source/proof checks calculate the graph in memory.

Interactive `limina init` asks whether to install this skill for the current project. `limina init --yes` skips skill installation and prints the manual command.

After init: `pnpm i && pnpm limina:build`. Run the full default validation with `pnpm exec limina check`.

Minimal config:

```ts
// limina.config.mts
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

## CLI quick reference

| Command                                                            | Purpose                                                                                                | Exit non-zero when                                                                                                      |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `limina init [--yes]`                                              | Bootstrap config, root build script, ignored generated directory, dependencies, optional skill install | No pnpm workspace root, confirmation refusal, or a write fails                                                          |
| `limina migration`                                                 | Migrate governed source output options into `liminaOptions.outputs`                                    | Workspace/config validation, migration planning, or transactional writes fail                                           |
| `limina check [-p name] [--verbose]`                               | Run built-in default pipeline                                                                          | Any of `graph:check`, `source:check`, `proof:check`, `checker:build`, `checker:typecheck` fails                         |
| `limina check <pipeline> [-p name] [--verbose]`                    | Run a user pipeline from `pipelines`                                                                   | Pipeline name missing, or any step fails                                                                                |
| `limina check --issues [filters] [--format F] [--verbose]`         | Read a completed check snapshot or standalone invocation without loading config                        | Invalid filter/format/limit/invocation, unknown rule code, or snapshot lookup fails                                     |
| `limina graph prepare`                                             | Generate or refresh `.limina` checker graph files from source tsconfig entries                         | Graph generation fails                                                                                                  |
| `limina graph check [--verbose]`                                   | Generated graph refs match real imports; deny/allow rules; generated dts option parity                 | Reference mismatch, denied dep/ref, missing project reference, source dependency resolved to artifact, etc.             |
| `limina graph export [--view V] [--output P]`                      | Export package dependency graph JSON (`source`, `artifact`, or `all`)                                  | Invalid view/output or dependency graph collection failure                                                              |
| `limina source check [filters] [--verbose]`                        | Package-owner boundary checks                                                                          | Relative import crosses package, bare import lacks manifest authorization, or `#imports` crosses the owner boundary     |
| `limina proof check`                                               | Generated declaration config ↔ source config alignment, source coverage                               | Drifted compilerOptions, uncovered source file, duplicate graph coverage, invalid source config shape                   |
| `limina build <config> [--raw --preset P] [-w] [--verbose]`        | Build user-facing artifacts from managed outputs or run an explicit raw build                          | Target/preset/output validation fails, a checker peer is missing, or the checker exits non-zero                         |
| `limina checker build [config] [--preset P] [-w] [--verbose]`      | Build execution for build-capable checkers (`tsc`, `tsgo`, `vue-tsc`)                                  | Any checker exits non-zero, a selected source config has no build-capable checker, or peer dep missing                  |
| `limina checker typecheck [--verbose]`                             | Direct execution for second-class checkers (`vue-tsgo`, `svelte-check`)                                | Any checker exits non-zero, or peer dep missing                                                                         |
| `limina package check [--package N] [--tool T] [--attw-profile P]` | publint + attw + boundary on built outputs                                                             | A runnable check fails; missing `publint` or ATTW alone is reported as skipped                                          |
| `limina release check [--package N] [--verbose]`                   | Release hygiene and dependency consistency for package entries                                         | Cwd package name is not configured, package output is private/missing/dirty, or workspace publish deps are inconsistent |

Global flags on every command: `--config <path>` (override config file), `--config-loader native|tsx` (select the module loader), and `--mode <mode>` (passed to function-style configs, defaults to `NODE_ENV` then `"default"`).

For complete flag tables and exit semantics: see [references/cli.md](references/cli.md).

`limina check --issues` is a standalone issue-inventory reader. It locates the workspace but does not import the Limina config or run a pipeline. By default it reads the last completed v7 check snapshot under `.limina/check/last-run.json`; `--invocation <uuid>` reads one v1 standalone failure invocation instead. Source snapshot v1 and check snapshot v7 are independent and must not be promoted or synthesized into one another. Use `--task`, `--checker`, `--package`/`-p`, `--rule`, `--file`, and `--scope` to filter; use `--format human|json|ndjson`; use `--limit <positive integer|all>` only for human issue cards; use `--verbose` for human detail expansion.

## Built-in task names (use inside `pipelines`)

`graph:prepare`, `graph:check`, `source:check`, `proof:check`, `checker:build`, `checker:typecheck`, `package:check`, `release:check`

The default `limina check` plan contains `graph:check`, `source:check`, `proof:check`, `checker:build`, and `checker:typecheck`. These built-in tasks are independent bounded work and may run concurrently when dependencies and resource locks allow; reporting remains deterministic. A named `limina check <name>` pipeline preserves its configured step order and does not fall back to the default if the name is missing.

## Checker presets

| Preset         | Supported extensions                           | Source graph | Execution | Class        | Required peer dep                        |
| -------------- | ---------------------------------------------- | ------------ | --------- | ------------ | ---------------------------------------- |
| `tsc`          | TypeScript compiler-supported extensions       | yes          | build     | first-class  | `typescript`                             |
| `tsgo`         | TypeScript compiler-supported extensions       | yes          | build     | first-class  | `@typescript/native-preview`             |
| `vue-tsc`      | TypeScript compiler-supported + Vue extensions | yes          | build     | first-class  | `vue-tsc`                                |
| `vue-tsgo`     | TypeScript compiler-supported + Vue extensions | yes          | typecheck | second-class | `vue-tsgo`, `@typescript/native-preview` |
| `svelte-check` | TypeScript compiler-supported + `.svelte`      | no           | typecheck | second-class | `svelte-check`                           |

Checker class is derived from the built-in checker adapter's execution kind: `build` means first-class; direct `typecheck` means second-class. Source graph is a separate capability: graph-capable checkers drive the generated declaration graph that `graph:check` validates, and `vue-tsgo` keeps graph/proof coverage even though execution is direct typecheck.

Prefer `vue-tsc` for first-class Vue project-reference builds. `vue-tsgo --build` expands source imports into a transient virtual TypeScript workspace, does not preserve TypeScript project-reference boundaries, and does not provide incremental build semantics, so Limina treats `vue-tsgo` as a built-in second-class execution checker.

Checker auto mode is either omitted `config.checkers` or `config.checkers: { mode: 'auto', exclude?: string[] }`. A manual checker uses `preset`, `include`, and optional `exclude`. `include` must select ordinary `tsconfig.json` entry files. Built-in checker adapters own extension discovery, and checker presets must be one of Limina's built-in presets.

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
        refs: [{ path: 'packages/app/src/node/tsconfig.lib.json', reason: 'client must not depend on node runtime' }],
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

Then opt the source tsconfig into the rule:

```jsonc
// tsconfig.lib.json
{
  "liminaOptions": {
    "graphRules": ["runtime-client"],
  },
  "extends": ["./tsconfig.base.json"],
  "include": ["src/**/*.ts"],
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

### When a workspace package import resolves to `dist`

Do not classify the edge from its version protocol. Inspect the actual TypeScript resolution:

1. If it resolves to a Limina-governed source file, keep the manifest declaration and make the target reachable through the generated source graph.
2. If it resolves to `.d.ts` or built output, treat it as declaration/artifact consumption and remove any stale source project-reference edge.

`workspace:`, `link:`, `file:`, `catalog:`, and semver can all authorize either result in a source manifest. Before publishing, ensure the generated output manifest has replaced every local protocol with an npm-compatible range.

Recommended source manifest:

```jsonc
{
  "exports": {
    ".": "./src/index.ts",
    "./feature": "./src/feature.ts",
  },
  "types": "./src/index.ts",
}
```

Recommended built or published manifest:

```jsonc
{
  "exports": {
    ".": "./index.js",
    "./feature": "./feature.js",
  },
  "types": "./index.d.ts",
}
```

Do not make `{ "source": "./src/index.ts", "default": "./dist/index.js" }` the default recommendation. Limina's built-in resolver only selects `source` when TypeScript `customConditions` includes it.

## Root Entry API

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

`defineConfig(value)` is an identity helper with overloads for: plain object, Promise, `(env) => config`, `(env) => Promise<config>`. The env argument is `{ command, mode }` where `mode` defaults to `process.env.NODE_ENV ?? 'default'`.

The `limina` root entry is CLI-first. Runtime values include `defineConfig`, `CancelledFailure`, `ConfigurationError`, and `ExecutionFailure`. It also exports config authoring types plus the `GovernanceIssue` type family and `IssueSeverity`. Runner functions, graph helpers, generated graph helpers, flow reporters, `loadConfig`, and resolved runtime types remain internal; use the CLI commands instead of importing them from the package root.

## Requirements

- Node `^22.18.0 || >=24.11.0`
- pnpm workspace with `pnpm-workspace.yaml` at the workspace root
- `typescript` installed locally (declared as an optional peerDep; `getActiveCheckers` needs it)
- `vue-tsc` / `vue-tsgo` / `svelte-check` only required if the corresponding preset is configured
- `@vue/compiler-sfc` is required only when `config.imports.vue: 'compiler-sfc'` enables that parser; it is not an unconditional `vue-tsc` dependency
- New projects use explicit ESM `limina.config.mts`. Existing `limina.config.mjs`, `limina.config.ts`, and `limina.config.js` files are supported; a `.js` file may use CommonJS when Node treats it as CommonJS.

## Common mistakes

| Symptom                                                  | Root cause                                                                    | Fix                                                                                                                                                          |
| -------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Unable to find limina config`                           | Running outside the workspace, or no supported Limina config reachable upward | `cd` into the workspace, pass `--config`, or run `limina init`                                                                                               |
| `no pnpm-workspace.yaml was found`                       | Limina infers the workspace root from `pnpm-workspace.yaml`                   | Add `pnpm-workspace.yaml` at the workspace root                                                                                                              |
| Pipeline `<name>` not found                              | `limina check <name>` only runs user pipelines, no fallback                   | Define it in `pipelines`, or run `limina check` (no arg) for the default                                                                                     |
| Invalid `config.checkers` shape                          | Auto checker config is not omitted or `{ mode: 'auto', exclude?: [] }`        | Omit `config.checkers`, or use `{ mode: 'auto', exclude?: [] }`                                                                                              |
| Workspace import resolves to `dist` but has a source ref | Classification was inferred from the version protocol instead of resolution   | Treat the resolved output as declaration/artifact consumption and remove the stale source reference; keep any valid manifest dependency declaration          |
| `Missing project reference for workspace import`         | Source dep imported but Limina cannot infer or generate the needed reference  | Make the target source config reachable from the selected `tsconfig.json` entry, or add `liminaOptions.implicitRefs` for dynamic/virtual edges               |
| `outDir package.json not found` during `package check`   | `outDir` is not the built package directory, or the package hasn't been built | Build first (`pnpm build`), then point `outDir` at the publish-ready directory                                                                               |
| `DTS config is not valid for tsc -b`                     | Leaf overrode required compiler options                                       | Restore `composite: true`, `incremental: true`, `noEmit: false`, `declaration: true`, `emitDeclarationOnly: true`, plus `rootDir`/`outDir`/`tsBuildInfoFile` |
| `Invalid Limina checker config: routes`                  | Checker routing must use source entries                                       | Configure `config.checkers.<name>.include` with source `tsconfig.json` selectors; use `exclude` to narrow matches                                            |

More failure modes and resolutions are in [references/troubleshooting.md](references/troubleshooting.md).

## Reference index

Load only what the task needs:

- [references/config-schema.md](references/config-schema.md) — Complete `LiminaConfig` schema, every field, defaults, and validation behavior.
- [references/cli.md](references/cli.md) — Every command, flag, action, and exit-code rule.
- [references/architecture.md](references/architecture.md) — Source config roles, generated checker graph rules, source-vs-artifact dependency semantics, and `tsconfig.json` governance.
- [references/package-checks.md](references/package-checks.md) — `publint`, `@arethetypeswrong/core`, runtime import-boundary auditing, ATTW profiles, and the release-only tarball hygiene split.
- [references/troubleshooting.md](references/troubleshooting.md) — Failure-by-failure cause/fix table for every error class Limina emits.

## Design principles (project-side guarantees Limina enforces)

- Explicit policy beats hidden presets — all rules live in `limina.config.mts`.
- Source graph checks and package artifact checks validate different surfaces; both are required.
- Source entries stay ordinary and user-owned; generated checker graph files stay internal.
- Source manifests and built manifests intentionally describe different surfaces.
- Failures come with actionable messages, not silent acceptance.
