# Limina CLI Reference

Every public command, action, flag, and exit-code rule emitted by `limina`.

Invocation form:

```sh
limina [--config <path>] [--config-loader <loader>] [--mode <mode>] <command> [...]
```

## Global Flags

| Flag                       | Effect                                                                                                                 |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `--config <path>`          | Resolve config from this file instead of searching upward. Path is resolved relative to the current working directory. |
| `--config-loader <loader>` | Use `native` (default) or `tsx`; the latter requires workspace-local `tsx`.                                            |
| `--mode <mode>`            | Set the `mode` passed to function-style configs. Default = `process.env.NODE_ENV ?? 'default'`.                        |
| `--help` / `-h`            | Print help.                                                                                                            |

When `--config` is omitted, Limina walks upward from cwd looking for `limina.config.mts`, `limina.config.mjs`, `limina.config.ts`, or `limina.config.js`, bounded by the `pnpm-workspace.yaml` root.

## `limina init [--yes]`

Bootstrap root config, ignored generated directory, dependencies, and the `limina:build` script for a pnpm workspace.

| Flag    | Effect                                                                                            |
| ------- | ------------------------------------------------------------------------------------------------- |
| `--yes` | Accept core confirmations and skip optional skill installation. Required in non-TTY environments. |

What it does:

1. Locates the pnpm workspace root (`pnpm-workspace.yaml`).
2. Confirms the workspace root.
3. Writes an auto-first `limina.config.mts` with `config.checkers: { mode: 'auto', exclude: [] }`.
4. Ensures `.limina/` is ignored in the root `.gitignore`.
5. Creates or updates the root `package.json` with `"limina:build": "limina checker build"` and missing `limina` / `typescript` devDependencies.
6. Normalizes the root script surface around `"limina:build": "limina checker build"`.
7. Clears an existing root `.limina` path and leaves materialization to `limina graph prepare`, managed build/checker execution, or check pipelines that require generated files.
8. In interactive mode, asks whether to install the Limina skill for the current project. `--yes` skips skill installation and prints the manual command.

The generated config uses this explicit auto form:

```js
config: {
  checkers: {
    mode: 'auto',
    exclude: [],
  },
},
```

Refusal conditions include a missing `pnpm-workspace.yaml`, declined required confirmation, and unsafe or failed writes. Nameless workspace packages do not make initialization fail merely because they lack `name`.

Exit code: non-zero on any refusal or write error.

## `limina migration`

Migrates governed source configs into the current `liminaOptions.outputs` model. It validates the activated workspace, plans all edits before writing, requires every affected Git worktree to be clean, and applies one bounded transaction across the authenticated worktree roots.

Exit code: 1 on validation, planning, safety, or transactional write failure.

## `limina check [-p name]`

Run the built-in default pipeline.

The plan contains `graph:check`, `source:check`, `proof:check`, `checker:build`, and `checker:typecheck`. The default check schedules these built-in tasks as independent bounded work; they may run concurrently when dependencies and resource locks permit, and reporting remains deterministic. Task failures do not hide unrelated later results.

`-p, --package <name>` passes one or more package entry names to package-aware tasks when they appear in a pipeline. The built-in default pipeline does not include `package:check` or `release:check`.

Exit code: 1 if any step fails, 0 otherwise.

Flags accepted while running a check:

| Flag                  | Effect                                                                 |
| --------------------- | ---------------------------------------------------------------------- |
| `--verbose`           | Expand live summaries, or human issue cards with `--issues`.           |
| `--rule <code>`       | Filter issue details by stable rule code.                              |
| `--file <path>`       | Filter issue details by exact file path.                               |
| `--scope <glob>`      | Filter issue details by path scope.                                    |
| `--package <name>`    | Filter package-aware pipeline tasks or issue inventory; repeatable.    |
| `--task <name>`       | Requires `--issues`; filter by stable task name.                       |
| `--checker <name>`    | Requires `--issues`; filter by checker.                                |
| `--format <format>`   | Requires `--issues`; use `human`, `json`, or `ndjson`.                 |
| `--limit <N\|all>`    | Requires `--issues` and human format; bound visible issue cards.       |
| `--invocation <uuid>` | Requires `--issues`; read one immutable standalone failure invocation. |
| `--issues`            | Read issue inventory without importing config or running a pipeline.   |

## `limina check <pipeline> [-p name]`

Run the user-defined pipeline at `pipelines[<name>]`. This only runs configured pipelines; there is no fallback to the default.

Exit code: 1 if the name is missing or any step fails.

## `limina check --issues [filters]`

Read issue inventory without importing or validating the Limina config. By default it reads the last completed v7 check snapshot at `.limina/check/last-run.json`; `--invocation <uuid>` reads one v1 standalone invocation under `.limina/check/invocations/`. Source snapshot v1 is a separate contract and is never promoted into a completed check snapshot. This standalone reporting mode:

- It does not accept a pipeline name.
- `--task`, `--checker`, `--format`, `--invocation`, and `--limit` require `--issues`.
- `--format` accepts `human`, `json`, or `ndjson`; omitted means human output.
- `--verbose` is the only detail-expansion knob.
- `--limit` accepts a positive decimal integer or `all`, applies only to human cards, and never truncates JSON or NDJSON.
- Filters may be repeated: `--task`, `--checker`, `--package`/`-p`, `--rule`, `--file`, and `--scope`.
- `--rule` rejects unknown stable rule codes and suggests `limina check --issues --rule --help`.
- Filter help is available through `--task --help`, `--checker --help`, `--package --help`, and `--rule --help` after `--issues`.
- If no snapshot exists, Limina prints `No check issue snapshot found.` instead of running a check.

Examples:

```sh
limina check --issues
limina check --issues --verbose
limina check --issues --task source:check --rule LIMINA_SOURCE_UNUSED_MODULE
limina check --issues --format json
limina check --issues --format ndjson
limina check --issues --limit 20
limina check --issues --invocation 00000000-0000-4000-8000-000000000000
limina check --issues --rule --help
```

## `limina graph <prepare|check|export>`

Action must be `prepare`, `check`, or `export`.

### `limina graph prepare`

Calculates the generated graph and explicitly materializes `.limina/manifest.json` plus `.limina/tsconfig/checkers/<checker>/**` from selected ordinary source `tsconfig.json` entries.

Exit code: 1 when graph generation fails.

### `limina graph check`

Validates the generated checker graph and source-derived architecture:

`graph check` calculates the graph in memory and does not materialize checker files merely to perform validation.

`--verbose` shows full graph issue details.

- Generated declaration configs have build-safe compiler options.
- Generated declaration configs and source configs keep type-affecting compiler option parity.
- Project references match real source imports and `liminaOptions.implicitRefs`.
- Cross-package generated references imply declared workspace dependencies.
- Imports that require source project references resolve to governed source; imports resolving to declarations or built output are classified as declaration/artifact consumption regardless of manifest version protocol.
- Labels declared through source `liminaOptions.graphRules` match configured `graph.rules`; denied refs and denied deps are flagged.
- Configured condition domains keep expected `customConditions` through their reference trees.

Exit code: 1 on any violation.

### `limina graph export [--view V] [--output P]`

Exports Limina's package dependency graph JSON.

| Flag              | Values                      | Effect                                                       |
| ----------------- | --------------------------- | ------------------------------------------------------------ |
| `--view <view>`   | `all`, `source`, `artifact` | Select dependency edge kinds. Invalid values are rejected.   |
| `--output <path>` | file path                   | Write JSON to a file. Without it, JSON is printed to stdout. |

## `limina source check`

Action must be `check`.

Validates package-owner and source usage rules:

- Every governed source file has a nearest package owner.
- Non-aggregator generated/source config coverage stays within one nearest `package.json` owner.
- Relative source imports do not cross package owner boundaries.
- Bare package imports are checked from TypeScript's resolved entry first. Current-owner targets are allowed; other workspace or artifact-package targets require manifest authorization.
- Dependency authorization accepts `dependencies`, `devDependencies`, `peerDependencies`, and `optionalDependencies`.
- `#imports` specifiers must match the current package's `imports` field, must stay within the owner unless resolving to a declared artifact package, and must not resolve to another workspace owner.
- Knip-backed unused workspace dependency and unused module checks run unless `source.knip` is `false`.
- Package-owned source modules must resolve upward to one ordinary `tsconfig.json` governance unit. Fix the `tsconfig.json` coverage/reference shape when this check fails.

`--package`, `--rule`, `--file`, and `--scope` filter source issue details and may be repeated. `--verbose` expands them.

If `knip` is unavailable, the Knip-backed portion is reported as skipped and the remaining source checks continue. Missing `knip` alone does not make the command fail.

Exit code: 1 on any runnable violation.

## `limina proof check`

Action must be `check`.

Validates source coverage proof:

- Declaration configs are generated under `.limina`; source-level `tsconfig*.dts.json` files are invalid.
- Source typecheck leaf configs must not hand-maintain `references`; use a solution-style `tsconfig.json` or `liminaOptions.implicitRefs`.
- Pure aggregators contain only `$schema`, `files: []`, `references`, and allowed Limina metadata.
- A default `tsconfig.json` aggregator references only ordinary typecheck configs, not build or declaration configs.
- The generated declaration config and its source config have matching files and type-affecting compiler options.
- Every file in `config.source` is covered by generated graph coverage, checker entry coverage, or `proof.allowlist`.
- Allowlist files are inside the source boundary and not already covered.

`--verbose` shows full proof issue details.

Exit code: 1 on any violation.

## `limina build <config> [--preset P] [--raw] [-w|--watch]`

Builds user-consumable artifacts.

- Managed mode accepts a governed source leaf or aggregator whose selected leaves declare `liminaOptions.outputs`, materializes the generated output-build configs, and runs a compatible build checker.
- Raw mode requires `--raw --preset <tsc|tsgo|vue-tsc>`, invokes that checker directly on the user-maintained config, and does not read or materialize the generated graph.
- `--preset` selects a build-capable checker; managed mode requires it when more than one compatible preset reaches the target.
- `--watch` uses the selected adapter's watch support.

Exit code: 1 on target, output, preset, peer-dependency, safety, or checker execution failure.

## `limina checker build [config] [--preset P] [-w|--watch]`

Build-capable checker execution.

Without `config`, Limina prepares the generated graph and runs every build-capable checker entry (`tsc`, `tsgo`, `vue-tsc`) through the generated root configs.

With `config`, Limina resolves the argument from cwd:

- If it is an ordinary source tsconfig governed by Limina, it builds the generated module for that source config and recursively includes build-capable provider edges.
- If it is not governed by Limina, the command fails and directs the user to `limina build <config> --raw --preset <checker>` for an explicit raw build.

| Flag            | Values                   | Effect                                                               |
| --------------- | ------------------------ | -------------------------------------------------------------------- |
| `--preset <p>`  | `tsc`, `tsgo`, `vue-tsc` | Select a build-capable checker preset. Requires a `config` argument. |
| `-w`, `--watch` | boolean                  | Watch and preserve rebuild output. Requires a `config` argument.     |
| `--verbose`     | boolean                  | Show full checker issue details.                                     |

Option rules:

- Select a checker with `--preset`.
- Pass the config as the positional argument.
- Use `--preset` only with a config argument.
- Use `--watch` only with a config argument.

Exit code: 1 if dependency preflight fails, the selected managed target has no build-capable checker, the selected preset is not available for the source config, or any checker exits non-zero.

## `limina checker typecheck`

Runs direct typecheck execution for typecheck-only checkers:

- `vue-tsgo --project <generated checker entry>`
- `svelte-check --tsconfig <generated checker entry>`

It accepts `--verbose`, but not a config argument, `--preset`, or `--watch`.

Exit code: 1 if dependency preflight fails or any target exits non-zero. If no typecheck-only entries are configured, the command succeeds after reporting no targets.

## `limina package check [--package N] [--tool T] [--attw-profile P]`

Action must be `check`.

| Flag                      | Values                                  | Effect                                                                                                                                                                          |
| ------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--package <name>` / `-p` | Configured entry `name`                 | Limit to one or more entries. If omitted, Limina compares the nearest `package.json#name` from cwd to configured entry names; runs only that match, or all entries if no match. |
| `--tool <name>`           | `publint`, `attw`, `boundary`, or `all` | Limit to one tool. `all` is identical to omitting the flag.                                                                                                                     |
| `--attw-profile <name>`   | `strict`, `node16`, `esm-only`          | Override the configured ATTW profile for this invocation only.                                                                                                                  |
| `--verbose`               | boolean                                 | Show full package check issue details.                                                                                                                                          |

For every selected entry:

1. Read `<outDir>/package.json`.
2. Reject publish-ready output manifests that still expose `workspace:`, `link:`, `file:`, or `catalog:` specifiers.
3. If `publint` or `attw` is enabled, pack `outDir` with `@publint/pack` and feed the tarball to the selected tools.
4. Run boundary check if enabled: parse emitted `.js`/`.mjs`/`.cjs`, extract bare-package imports, and validate them against the output manifest and runtime environment.

If `publint` or `@arethetypeswrong/core` is unavailable, Limina marks that optional analyzer as skipped and continues. A skipped analyzer alone, including one selected through `--tool`, does not make the command fail.

Exit code: 1 if any runnable selected check fails, or if tool selection resolves to no enabled check. Missing optional analyzer packages alone may still exit 0.

## `limina release check [--package N]`

Action must be `check`.

| Flag                      | Values                  | Effect                                                                                         |
| ------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------- |
| `--package <name>` / `-p` | Configured entry `name` | Limit to one or more entries and skip cwd matching. Repeat the flag to check multiple entries. |
| `--verbose`               | boolean                 | Show full release check issue details.                                                         |

Without `--package`, Limina walks from cwd to the workspace root, reads the nearest `package.json#name`, and requires it to match exactly one configured `package.entries[].name`.

For every selected entry, Limina reads `<outDir>/package.json`, rejects `private: true`, rejects local dependency specifiers in output manifests, packs the npm tarball, checks tarball publish hygiene, and verifies source/packed manifest consistency plus workspace publish dependency consistency.

Exit code: 1 if cwd matching fails, a requested entry is missing, or any release consistency check fails.

## Help And Errors

`limina --help` and command help surfaces print help and exit 0. An unknown command or unsupported action prints help or an error and exits 1.

Known command families: `init`, `migration`, `check`, `graph`, `proof`, `source`, `build`, `checker`, `package`, `release`.

All command failures print the structured field/value/reason error format. Boundary, graph, proof, and source failures group multiple issues into one error block separated by `\n\n`.

## Exit-Code Summary

- `0` — every step succeeded.
- `1` — any check failed, an unsupported action was passed, a config validation issue surfaced, or a missing pipeline name was used.

CLI `main()` catches command errors, formats them, and sets `process.exitCode = 1`.
