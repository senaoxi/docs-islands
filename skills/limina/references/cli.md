# Limina CLI Reference

Every command, action, flag, and exit-code rule emitted by `limina`.

Invocation form:

```sh
limina [--config <path>] [--mode <mode>] <command> [...]
```

## Global flags (every command)

| Flag              | Effect                                                                                                                 |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `--config <path>` | Resolve config from this file instead of searching upward. Path is resolved relative to the current working directory. |
| `--mode <mode>`   | Set the `mode` passed to function-style configs. Default = `process.env.NODE_ENV ?? 'default'`.                        |
| `--help` / `-h`   | Print help.                                                                                                            |

When `--config` is omitted, Limina walks upward from cwd looking for `limina.config.mjs`, bounded by the `pnpm-workspace.yaml` root.

## `limina init [--yes]`

Bootstrap declaration graph, aggregators, root config, and the `limina:check` script for a workspace that has not yet adopted Limina conventions.

| Flag    | Effect                                                                                                                                                                          |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--yes` | Accept all confirmations (root selection, missing root `package.json`, overwriting an existing `limina.config.mjs` or `limina:check` script). Required in non-TTY environments. |

What it does:

1. Locates the pnpm workspace root (`pnpm-workspace.yaml`).
2. Refuses to run if any `tsconfig*.build.json` or `tsconfig*.dts.json` files already exist (these names are reserved init outputs).
3. Scans ordinary `tsconfig*.json` files and classifies each as either a leaf or an aggregator (mutually exclusive; both = error).
4. For every leaf, creates a paired `tsconfig*.dts.json` with strict declaration emit options. Adds inferred `references` derived from TypeScript's resolution of real imports.
5. Writes a `tsconfig.build.json` per workspace that has declaration leaves, and a root `tsconfig.build.json` referencing those plus root-owned leaves. Empty aggregators are omitted.
6. Writes a minimal `limina.config.mjs`.
7. Updates root `package.json` to add `"limina:check": "limina check"` and a `limina` devDependency.

Refusal conditions:

- Reserved `tsconfig*.build.json` / `tsconfig*.dts.json` already exist.
- A `tsconfig.json` has BOTH `references` and source files.
- A `tsconfig.<scope>.json` has `references`.
- A `workspace:*` import cannot be mapped to an ordinary `tsconfig*.json` leaf.

Exit code: non-zero on any refusal or write error.

## `limina check`

Run the BUILT-IN default pipeline.

```sh
limina check
```

Order: `graph:check` → `source:check` → `proof:check` → `checker:build` → `checker:typecheck`. Stops on the first failure; remaining steps are reported as skipped.

Exit code: 1 if any step fails, 0 otherwise.

## `limina check <pipeline>`

Run the user-defined pipeline at `pipelines[<name>]`. ONLY runs pipelines from `limina.config.mjs#pipelines` — there is no fallback to the default.

Exit code: 1 if the name is missing OR any step fails.

## `limina graph <check>`

Action must be `check` (only valid action).

Validates:

- Every `tsconfig*.dts.json` reachable from a checker entry has correct build options (`composite`, `incremental`, `noEmit: false`, `declaration`, `emitDeclarationOnly`, plus `rootDir`/`outDir`/`tsBuildInfoFile`).
- Every dts leaf has a matching local companion with parity on type-affecting compilerOptions.
- Project references match real source imports.
- A cross-package dts reference implies a `workspace:*` dep in the importing package manifest.
- Labels declared on dts leaves match `graph.rules.<label>`; denied refs and denied deps are flagged.
- `workspace:*` source dependencies resolve to files owned by the source graph, not to artifacts under `dist`.
- Cross-package relative imports are rejected (use the package name).

Exit code: 1 on any violation.

## `limina source <check>`

Action must be `check`.

Validates package-owner boundary rules:

- A non-aggregator `tsconfig*.dts.json` (or its companion) must stay within ONE nearest-`package.json` owner. Mixing owners is an error.
- Every source file must have a package owner.
- A relative source import must not cross the nearest package.json owner boundary.
- A bare package import must be authorized by the nearest package.json `dependencies` or `devDependencies` (`peerDependencies` / `optionalDependencies` alone are NOT authorizing).
- `#xxx` package imports must match the nearest package.json `imports` field AND resolve inside the owner scope.

Exit code: 1 on any violation.

## `limina proof <check>`

Action must be `check`.

Validates source coverage proof:

- Every dts leaf reachable from a graph-capable checker has exactly one owning entry. Duplicate ownership is an error.
- Each dts leaf has a paired local companion that exists.
- Pure aggregators (`tsconfig*.build.json` and `tsconfig.json` with `references`) contain only `$schema`, `files: []`, `references` — extra keys or non-empty `files` are errors.
- A `tsconfig.json` that has `references` must NOT reference dts/build configs — it is the IDE/typecheck entry.
- A directory with multiple ordinary `tsconfig*.json` environments must have an aggregator `tsconfig.json`. With one environment, the leaf should be `tsconfig.json`.
- The declaration leaf and its companion have identical file sets and identical type-affecting compilerOptions (a curated allowlist of options that affect typecheck semantics is compared, ignoring emit/path options).
- Every file in the configured source boundary is covered by either a graph project, a checker entry, or an explicit `proof.allowlist` entry.
- Allowlist files are inside the source boundary AND not already covered.

Exit code: 1 on any violation.

## `limina paths <action>`

Action must be `generate`, `apply`, or `check`.

- `generate` / `apply` (aliases) — write `tsconfig.dts.paths.generated.json` next to each affected declaration leaf. Stale generated files (recognized by their content marker) at unexpected paths are removed. Prints the list of leaves that must extend the generated file as the first `extends` entry.
- `check` — runs the same analysis without writing. Exits non-zero if any generated file would change.

Generation criteria:

- Source import resolves a `workspace:*` source dep through package exports.
- The resolved file is NOT owned by the source graph.
- A declaration leaf imports it AND has a project reference to a leaf in the target package's directory whose name ends with `/tsconfig.lib.dts.json`.
- The dep's package exports list an alias matching the specifier.

Files are not injected automatically — the user must add `"./tsconfig.dts.paths.generated.json"` (or whatever `paths.generatedFileName` resolves to) as the FIRST entry of the affected `extends` array.

Exit code: 1 only for `paths check` when files are stale.

## `limina checker <action> [--concurrency N]`

Action must be `typecheck` or `build`.

- `typecheck` — for every configured checker entry, walks reachable `tsconfig*.dts.json` leaves, finds their paired local companions, and runs the checker against each companion in no-emit mode. Run in parallel up to `--concurrency` (default = `availableParallelism()` reported by Node).
- `build` — runs the checker's build execution for every entry whose preset supports build (currently `tsc -b` and `vue-tsc -b`). `svelte-check` does NOT support build and is filtered out.

Both actions fail fast on missing peer dependencies (`typescript`, `vue-tsc`, `svelte-check`) and print a one-line `pnpm add -D <packages>` fix.

`--concurrency` accepts a positive integer; anything else is rejected.

Exit code: 1 if any target exits non-zero.

## `limina package <check> [--package N] [--tool T] [--attw-profile P]`

Action must be `check`.

| Flag                      | Values                                  | Effect                                                                                                                                                                  |
| ------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--package <name>` / `-p` | Configured target `name`                | Limit to one target. If omitted, Limina compares the nearest `package.json#name` from cwd to configured target names; runs only that match, or all targets if no match. |
| `--tool <name>`           | `publint`, `attw`, `boundary`, or `all` | Limit to one tool. `all` is identical to omitting the flag.                                                                                                             |
| `--attw-profile <name>`   | `strict`, `node16`, `esm-only`          | Override the configured ATTW profile for this invocation only.                                                                                                          |

For every selected target:

1. Read `<outDir>/package.json`. If `private !== true`, require `README.md` and `LICENSE.md` in the same directory.
2. If `publint` or `attw` is enabled, pack the directory with `@publint/pack` (ignoring scripts) into a temporary directory and feed the tarball to both tools.
3. Run boundary check if enabled: parse every `.js`/`.mjs`/`.cjs` in the output, extract bare-package imports, validate them against the output manifest's dependencies, self-export specifiers, and runtime environment classification.

`publint` is run in strict mode by default (overridable per target with `publint.strict`).

Exit code: 1 if any check on any target fails, or if no runnable target exists for the selected tool.

## Help and errors

`limina --help` and any unknown command or action prints CAC help and exits non-zero.

All command failures print the structured field/value/reason error format. Boundary, graph, proof, and source failures group multiple issues into one error block separated by `\n\n`.

## Exit-code summary

- `0` — every step succeeded.
- `1` — any check failed, an unsupported action was passed, a config validation issue surfaced, or a missing pipeline name was used.

`limina` never throws unhandled exceptions — caught errors are formatted and the process sets `process.exitCode = 1`.
