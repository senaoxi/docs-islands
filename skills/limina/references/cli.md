# Limina CLI Reference

Every public command, action, flag, and exit-code rule emitted by `limina`.

Invocation form:

```sh
limina [--config <path>] [--mode <mode>] <command> [...]
```

## Global Flags

| Flag              | Effect                                                                                                                 |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `--config <path>` | Resolve config from this file instead of searching upward. Path is resolved relative to the current working directory. |
| `--mode <mode>`   | Set the `mode` passed to function-style configs. Default = `process.env.NODE_ENV ?? 'default'`.                        |
| `--help` / `-h`   | Print help.                                                                                                            |

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
7. Clears an existing root `.limina` path and leaves graph generation to `limina graph prepare`, graph-consuming commands, or `limina check`.
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

Refusal conditions:

- No `pnpm-workspace.yaml` exists in the current directory or its parents.
- Workspace packages are missing required `name` fields.

Exit code: non-zero on any refusal or write error.

## `limina check [-p name]`

Run the built-in default pipeline.

Order: `graph:check` → `source:check` → `proof:check` → `checker:build` → `checker:typecheck`. The default check schedules these built-in tasks as independent bounded work and reports every completed task; task failures do not hide later built-in task results.

`-p, --package <name>` passes one or more package entry names to package-aware tasks when they appear in a pipeline. The built-in default pipeline does not include `package:check` or `release:check`.

Exit code: 1 if any step fails, 0 otherwise.

Flags accepted while running a check:

| Flag                | Effect                                                                            |
| ------------------- | --------------------------------------------------------------------------------- |
| `--verbose`         | Show full issue details in deferred reports and the final check issue guidance.   |
| `--rule <code>`     | Filter source issue details by stable rule code while source issues are printed.  |
| `--file <path>`     | Filter source issue details by exact workspace-root-relative file path.           |
| `--scope <glob>`    | Filter source issue details by path scope.                                        |
| `--package <name>`  | Filter package-aware pipeline tasks and source/check issue reports by package.    |
| `--task <name>`     | Requires `--issues`; not valid while running the check pipeline.                  |
| `--checker <name>`  | Requires `--issues`; not valid while running the check pipeline.                  |
| `--format <format>` | Requires `--issues`; use `human`, `json`, or `ndjson` for issue inventory output. |
| `--issues`          | Read the last-run issue inventory instead of running the pipeline.                |

## `limina check <pipeline> [-p name]`

Run the user-defined pipeline at `pipelines[<name>]`. This only runs configured pipelines; there is no fallback to the default.

Exit code: 1 if the name is missing or any step fails.

## `limina check --issues [filters]`

Read `.limina/check/last-run.json` and print a filtered issue inventory from the last recorded check-like command. This is a standalone reporting mode:

- It does not accept a pipeline name.
- `--task`, `--checker`, and `--format` require `--issues`.
- `--format` accepts `human`, `json`, or `ndjson`; omitted means human output.
- `--verbose` is the only detail-expansion knob.
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
limina check --issues --rule --help
```

## `limina graph <prepare|check|export>`

Action must be `prepare`, `check`, or `export`.

### `limina graph prepare`

Generates or refreshes `.limina/tsconfig/checkers/<checker>/**` from selected ordinary source `tsconfig.json` entries. It uses the same generated graph preparation used by graph-consuming commands and pipelines.

Exit code: 1 when graph generation fails.

### `limina graph check`

Validates the generated checker graph and source-derived architecture:

- Generated declaration configs have build-safe compiler options.
- Generated declaration configs and source configs keep type-affecting compiler option parity.
- Project references match real source imports and `liminaOptions.implicitRefs`.
- Cross-package generated references imply declared workspace dependencies.
- `workspace:*` source dependencies resolve to files owned by the source graph, not artifacts under `dist`.
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

Exit code: 1 on any violation.

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

Exit code: 1 on any violation.

## `limina checker build [config] [--preset P] [-w|--watch]`

Build-capable checker execution.

Without `config`, Limina prepares the generated graph and runs every build-capable checker entry (`tsc`, `tsgo`, `vue-tsc`) through the generated root configs.

With `config`, Limina resolves the argument from cwd:

- If it is an ordinary source tsconfig governed by Limina, it builds the generated module for that source config and recursively includes build-capable provider edges.
- If it is not governed by Limina, it falls back to raw checker build mode and runs the selected build checker against that config.

| Flag            | Values                   | Effect                                                               |
| --------------- | ------------------------ | -------------------------------------------------------------------- |
| `--preset <p>`  | `tsc`, `tsgo`, `vue-tsc` | Select a build-capable checker preset. Requires a `config` argument. |
| `-w`, `--watch` | boolean                  | Watch and preserve rebuild output. Requires a `config` argument.     |

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

It does not accept a config argument, `--preset`, or `--watch`.

Exit code: 1 if dependency preflight fails or any target exits non-zero. If no typecheck-only entries are configured, the command succeeds after reporting no targets.

## `limina package check [--package N] [--tool T] [--attw-profile P]`

Action must be `check`.

| Flag                      | Values                                  | Effect                                                                                                                                                                          |
| ------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--package <name>` / `-p` | Configured entry `name`                 | Limit to one or more entries. If omitted, Limina compares the nearest `package.json#name` from cwd to configured entry names; runs only that match, or all entries if no match. |
| `--tool <name>`           | `publint`, `attw`, `boundary`, or `all` | Limit to one tool. `all` is identical to omitting the flag.                                                                                                                     |
| `--attw-profile <name>`   | `strict`, `node16`, `esm-only`          | Override the configured ATTW profile for this invocation only.                                                                                                                  |

For every selected entry:

1. Read `<outDir>/package.json`.
2. Reject publish-ready output manifests that still expose `workspace:`, `link:`, `file:`, or `catalog:` specifiers.
3. If `publint` or `attw` is enabled, pack `outDir` with `@publint/pack` and feed the tarball to the selected tools.
4. Run boundary check if enabled: parse emitted `.js`/`.mjs`/`.cjs`, extract bare-package imports, and validate them against the output manifest and runtime environment.

Exit code: 1 if any selected check fails, or if no runnable entry exists for the selected tool.

## `limina release check [--package N]`

Action must be `check`.

| Flag                      | Values                  | Effect                                                                                         |
| ------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------- |
| `--package <name>` / `-p` | Configured entry `name` | Limit to one or more entries and skip cwd matching. Repeat the flag to check multiple entries. |

Without `--package`, Limina walks from cwd to the workspace root, reads the nearest `package.json#name`, and requires it to match exactly one configured `package.entries[].name`.

For every selected entry, Limina reads `<outDir>/package.json`, rejects `private: true`, rejects local dependency specifiers in output manifests, packs the npm tarball, checks tarball publish hygiene, and verifies source/packed manifest consistency plus workspace publish dependency consistency.

Exit code: 1 if cwd matching fails, a requested entry is missing, or any release consistency check fails.

## Help And Errors

`limina --help` and any unknown command or action prints CAC help and exits non-zero.

Known command families: `init`, `check`, `graph`, `proof`, `source`, `checker`, `package`, `release`.

All command failures print the structured field/value/reason error format. Boundary, graph, proof, and source failures group multiple issues into one error block separated by `\n\n`.

## Exit-Code Summary

- `0` — every step succeeded.
- `1` — any check failed, an unsupported action was passed, a config validation issue surfaced, or a missing pipeline name was used.

CLI `main()` catches command errors, formats them, and sets `process.exitCode = 1`.
