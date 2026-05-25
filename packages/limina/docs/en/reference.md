# Reference

This page collects CLI commands, common workflows, and FAQ details. Configuration options now live in separate pages. Start with [Getting Started](./getting-started.md) if you are new to Limina.

## Options

Limina configuration starts from `limina.config.mjs` inside the workspace. Read the option pages by topic:

- [Config File](./options/config.md): `defineConfig`, function config, `mode`, and `command`.
- [Checker Entries](./options/checkers.md): `config.checkers.<name>`, `preset`, `entry`, and `extensions`.
- [Source Coverage](./options/source.md): `config.source.include` and `config.source.exclude`.
- [Graph Rules](./options/graph-rules.md): `graph.rules.<label>`, `deny.refs`, and `deny.deps`.
- [Paths](./options/paths.md): generated compatibility path settings.
- [Proof Allowlist](./options/proof-allowlist.md): source coverage exceptions with `file` and `reason`.
- [Package Checks](./options/package-checks.md): built output targets, tools, and runtime boundaries.
- [Pipelines](./options/pipelines.md): named workflows, built-in tasks, and external command steps.

If you only want the first check running, start with [Config File](./options/config.md) and [Checker Entries](./options/checkers.md). If you are preparing to publish packages, add [Package Checks](./options/package-checks.md).

## CLI

```sh
limina [--config limina.config.mjs] [--mode mode] <command>
```

| Command                                         | Description                                                                                                                   |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `limina init [--yes]`                           | Generate declaration leaves, build aggregators, root config, and a `limina:check` script for an uninitialized pnpm workspace. |
| `limina check`                                  | Run the default pipeline: graph, source, proof, and checker typecheck.                                                        |
| `limina check <pipeline>`                       | Run a named user pipeline from `pipelines`.                                                                                   |
| `limina graph check`                            | Validate project references, workspace imports, graph rules, and source/artifact dependency semantics.                        |
| `limina source check`                           | Validate package ownership, relative import boundaries, bare dependency declarations, and `#imports`.                         |
| `limina proof check`                            | Validate declaration leaves, local companions, checker coverage, pure aggregators, and source coverage.                       |
| `limina paths generate`                         | Generate compatibility TypeScript `paths` configs.                                                                            |
| `limina paths apply`                            | Compatibility alias for `paths generate`.                                                                                     |
| `limina paths check`                            | Fail when generated path configs are stale.                                                                                   |
| `limina checker typecheck [--concurrency n]`    | Run local companion typechecks derived from checker entries.                                                                  |
| `limina checker build`                          | Run build execution for checker entries that support it.                                                                      |
| `limina package check`                          | Run configured package output checks.                                                                                         |
| `limina package check --package <name>`         | Run one package target by configured name.                                                                                    |
| `limina package check --tool <tool>`            | Run only `publint`, `attw`, `boundary`, or `all`.                                                                             |
| `limina package check --attw-profile <profile>` | Override ATTW profile: `strict`, `node16`, or `esm-only`.                                                                     |

## Recommended Workflows

### Local Development

```sh
pnpm exec limina checker typecheck
pnpm exec limina graph check
```

Use these while changing TypeScript configs or package boundaries.

### Pull Requests

```sh
pnpm exec limina check
```

This proves graph, source ownership, coverage, and local typechecks together.

### Pre-publish

```sh
pnpm build
pnpm exec limina package check
pnpm exec limina check publish
```

Build first so `packageChecks.targets[].outDir` contains the files consumers will install.

## CI Example

```yaml
name: ci

on:
  pull_request:
  push:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec limina check
```

## Best Practices

- Keep `tsconfig.build.json` files as pure aggregators with `files: []` and `references`.
- Keep declaration leaves close to local companions, and let declaration leaves add only declaration-output settings.
- Prefer source-facing package exports over long-term generated paths.
- Run source checks and package checks; they protect different layers.
- Keep allowlists small and explain why each exception is safe.

## FAQ

### How does `limina checker typecheck` choose targets?

It loads `limina.config.mjs`, walks each configured checker entry, finds reachable `tsconfig*.dts.json` leaves, maps every leaf to its local companion, and runs the checker in no-emit mode.

### Why do package checks require a build first?

They inspect the package output under `packageChecks.targets[].outDir`. That output must already contain the built `package.json`, exports, JavaScript, declarations, README, and license files.

### Why do workspace exports pointing to dist cause graph problems?

`workspace:*` means source dependency, but TypeScript resolves package imports through package exports. If exports point to `dist`, the graph is no longer consuming source. Limina asks you to fix exports, change the dependency model, or generate explicit compatibility paths.

### Should Vue or Svelte files be placed in the TypeScript graph?

Framework files should be covered by their framework checker entry. Limina can prove coverage through `vue-tsc` or `svelte-check` without pretending those files are ordinary `tsc -b` declaration leaves.

### What is `--mode` for?

Use `--mode` when `limina.config.mjs` exports a function and returns different configuration for local, CI, or release workflows.

## Maintainer Release Checklist

Before publishing Limina itself or a package governed by Limina, check that:

- normal tests pass;
- `pnpm exec limina check` passes;
- the package build has run;
- `pnpm exec limina package check --package <name>` passes;
- generated paths are current with `pnpm exec limina paths check` when paths are used.

## License

MIT
