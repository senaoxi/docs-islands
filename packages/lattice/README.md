# @docs-islands/lattice

<p align="center">
  <a href="https://npmjs.com/package/@docs-islands/lattice"><img src="https://img.shields.io/npm/v/@docs-islands/lattice.svg" alt="npm package"></a>
  <a href="https://nodejs.org/en/about/previous-releases"><img src="https://img.shields.io/node/v/@docs-islands/lattice.svg" alt="node compatibility"></a>
  <a href="https://github.com/XiSenao/docs-islands/actions/workflows/ci.yml"><img src="https://github.com/XiSenao/docs-islands/actions/workflows/ci.yml/badge.svg?branch=main" alt="build status"></a>
  <a href="https://github.com/XiSenao/docs-islands/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/@docs-islands/lattice.svg" alt="license"></a>
</p>

English | [简体中文](./README.zh-CN.md)

`@docs-islands/lattice` is a configurable monorepo governance CLI for TypeScript project-reference graphs. It turns scattered root scripts into an explicit rules file plus one `lattice` command that can check graph architecture, local typecheck coverage, published package boundaries, and custom pipelines.

## Features

- **Single governance entrypoint**: use `lattice check <pipeline>` instead of long root `package.json` scripts.
- **Explicit config**: keep all architecture rules in `lattice.config.mjs`; there is no hidden preset.
- **Project graph validation**: enforce project-reference edges, package import boundaries, inferred project ownership, package export source ownership, and Node builtin restrictions.
- **Compatibility path generation**: generate opt-in source `paths` files for `workspace:*` dependencies whose package exports still point at build artifacts.
- **Typecheck coverage proof**: verify that build configs match local typecheck configs and the IDE/typecheck route.
- **TypeScript runner**: run every ordinary `tsconfig*.json` typecheck target discovered from `process.cwd()` or `lattice tsc -p`.
- **Published package boundary audit**: inspect built `.js` files and ensure runtime imports match package dependencies, self exports, and browser/node environments.
- **Pipeline composition**: combine built-in checks and shell commands in named pipelines such as `typecheck`, `package`, and `publish`.
- **First-class logs**: command output uses `@docs-islands/logger` with stable `@docs-islands/lattice[task.*]` groups.
- **TypeScript first**: ships ESM, type declarations, a CLI bin, and `defineConfig(...)`.

## Requirements

- Node.js `^20.19.0 || >=22.12.0`
- TypeScript, installed by the consuming repository
- A pnpm workspace with `pnpm-workspace.yaml`
- ESM config file support

Lattice is pnpm-only by design. It prefers `pnpm recursive list --depth -1 --json` for package discovery, then merges in `pnpm-workspace.yaml` and configured package globs as a fallback. Package manifests define `workspace:*` dependency semantics.

## Installation

```sh
pnpm add -D @docs-islands/lattice typescript
```

For a workspace package that calls `lattice` from its own scripts, add the package as a workspace dependency:

```json
{
  "devDependencies": {
    "@docs-islands/lattice": "workspace:*"
  }
}
```

## Quick Start

Create `lattice.config.mjs` at the repository root:

```js
import { defineConfig } from '@docs-islands/lattice/config';

export default defineConfig({
  graph: {
    rootConfig: 'tsconfig.graph.json',
    productionKinds: ['lib', 'runtime-client', 'runtime-node'],
    projectKinds: [
      { kind: 'solution', paths: ['tsconfig.graph.json'] },
      { kind: 'lib', suffixes: ['/tsconfig.lib.build.json'] },
      { kind: 'test', suffixes: ['/tsconfig.test.build.json'] },
    ],
    forbiddenEdges: [
      {
        fromKinds: ['lib', 'runtime-client', 'runtime-node'],
        toKinds: ['test'],
        reason: 'production graph must not depend on tests',
      },
    ],
  },
  proof: {
    sidecarTargets: [
      {
        config: 'docs/tsconfig.json',
        label: 'docs vue typecheck',
        tool: 'vue-tsc',
      },
    ],
    allowlist: [
      {
        file: 'src/generated/runtime.d.ts',
        reason: 'Declaration-only runtime shim checked by a sidecar target.',
      },
    ],
  },
  packageChecks: {
    targets: [
      {
        name: '@acme/core',
        distDir: 'packages/core/dist',
        boundary: {
          ignoredExternalPackages: ['@acme/runtime-shim'],
        },
      },
    ],
  },
  pipelines: {
    typecheck: ['graph:check', 'proof:check', 'tsc:run'],
    package: ['package:check'],
  },
});
```

Wire the root script:

```json
{
  "scripts": {
    "typecheck": "lattice check typecheck"
  }
}
```

Run checks:

```sh
pnpm typecheck
pnpm exec lattice package check --package @acme/core
```

## CLI

```sh
lattice [--config lattice.config.mjs] [--mode mode] <command>
```

| Command                                  | Description                                                                      |
| ---------------------------------------- | -------------------------------------------------------------------------------- |
| `lattice check <pipeline>`               | Run a named pipeline from `pipelines`.                                           |
| `lattice paths generate`                 | Generate compatibility source paths for artifact-facing `workspace:*` exports.   |
| `lattice paths check`                    | Check that generated compatibility path files are up to date.                    |
| `lattice graph check`                    | Validate project references and architecture import rules.                       |
| `lattice proof check`                    | Prove build configs match their local typecheck companions and IDE route.        |
| `lattice tsc`                            | Run `tsc --noEmit` for typecheck target configs from the current cwd.            |
| `lattice package check`                  | Run configured publint, ATTW, and boundary checks for published package outputs. |
| `lattice package check --package <name>` | Check one package target by configured `name`.                                   |
| `lattice package check --tool <tool>`    | Run one package check tool: `publint`, `attw`, or `boundary`.                    |

Graph, proof, typecheck, and package checks are read-only. `lattice paths generate` writes generated config files; `lattice paths check` only reports stale generated files. `lattice paths apply` is kept as a compatibility alias for `generate`.

## TypeScript Check

`lattice tsc` does not load `lattice.config.mjs`. It starts from `process.cwd()/tsconfig.json` by default, recursively follows ordinary `tsconfig*.json` references, and runs `tsc -p <config> --noEmit` for every discovered typecheck target. A config is a target when it has no references, or when it has references and still owns source inputs through non-empty `files`/`include` entries or TypeScript's implicit include behavior. A config with `references` plus `files: []` and no effective `include` is treated as a pure aggregator. Use `lattice tsc -p <path>` to choose a different config file or config directory. Relative `-p` values are resolved from the command cwd; absolute values are used as-is. Use `--concurrency <n>` to cap concurrent `tsc` processes.

The typecheck route rejects `tsconfig*.build.json` and `tsconfig*.graph.json`, reports missing referenced configs and circular reference routes, and fails when no target can be found. Vue/SFC checks should stay in explicit `vue-tsc` scripts or pipeline sidecars.

## Configuration

`lattice.config.mjs` must default-export a config object, a Promise for one, or a function receiving `{ command, mode }`. Use `defineConfig(...)` for editor hints and typed package exports. `--mode` is forwarded to config functions; when omitted, Lattice uses `process.env.NODE_ENV` or `default`.

### `workspace`

| Field             | Description                                                   |
| ----------------- | ------------------------------------------------------------- |
| `rootDir`         | Repository root relative to the config file. Defaults to `.`. |
| `packagePatterns` | Additional workspace package globs.                           |
| `ignore`          | Extra glob ignores for workspace package discovery.           |

Lattice prefers pnpm's recursive package list and also reads package globs from the fixed `pnpm-workspace.yaml` file for fallback discovery and extra configured patterns.

### `graph`

Graph checks parse TypeScript project references reachable from `rootConfig`, then inspect imports in each project. This is the build graph route: `tsconfig*.graph.json` files aggregate `tsconfig*.build.json` leaves for `tsc -b`, CI, and architecture checks. Workspace packages declared through `workspace:*` are source dependencies and should expose source entries from package `exports`. Artifact dependencies must not be represented as project references: use `link:` for local built output, or `catalog:`/normal semver to consume a published production package. If the target package is `private: true`, it has no published production package, so artifact consumers must use `link:`.

If package A depends on package B through `workspace:*` and A references B in a `tsconfig*.build.json`, TypeScript still resolves B through B's package exports. `tsc -b` does not rewrite artifact exports to referenced source projects. If B exports `./dist/index.js` and A has no source `paths` mapping, `lattice graph check` fails with an explanation and fix hint.

Graph checks also validate every `tsconfig*.build.json` reachable from
`rootConfig` against its strict same-name local config:

- `tsconfig.build.json` compares with `tsconfig.json`
- `tsconfig.lib.build.json` compares with `tsconfig.lib.json`
- `tsconfig.test.build.json` compares with `tsconfig.test.json`
- the same rule applies to other suffixes such as `tools` and `types`

The build config must use the same typecheck compiler options as the local
config, and every emitted build file must be covered by that companion
typecheck config. Build-only options such as `composite`, `noEmit`,
`declaration`, `outDir`, `rootDir`, and `tsBuildInfoFile` may differ. `paths`
and `baseUrl` are treated as module-resolution policy and are not compared.

| Field              | Description                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------- |
| `rootConfig`       | Root solution config. Defaults to `tsconfig.graph.json`.                                                |
| `projectKinds`     | Ordered matchers that classify config paths into kinds such as `lib`, `test`, or `runtime-client`.      |
| `productionKinds`  | Kinds treated as production graph leaves for stricter import checks.                                    |
| `forbiddenEdges`   | Disallowed project-reference or inferred-import edges with human-readable reasons.                      |
| `nodeBuiltinRules` | Project kinds that must not import Node builtins.                                                       |
| `inferredProjects` | Rules that map source path prefixes to owning project configs when direct file ownership is not enough. |

### `paths`

Most repositories should not need generated `paths`: make workspace package exports point at source entries, then express source dependencies with `workspace:*` plus project references. The `paths` command is a compatibility bridge for monorepos whose workspace package exports still point at build artifacts.

`lattice paths generate` scans graph-owned imports. When it finds a `workspace:*` dependency that is also referenced by the importing build config, but TypeScript resolves the package export to a build artifact, it writes `tsconfig.graph.paths.generated.json` next to the importing build config and maps the package exports back to source files. It never edits `tsconfig*.build.json`; add the generated file manually to the first position of the listed `extends` arrays.

| Field                 | Description                                                                                                            |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `generatedFileName`   | Generated config file name. Defaults to `tsconfig.graph.paths.generated.json`.                                         |
| `generatedFileMarker` | Marker used to identify generated files that can be refreshed or removed.                                              |
| `conditionPriority`   | Package export condition priority used when choosing a source target. Defaults to `source`, `development`, then types. |
| `sourceExtensions`    | Source file extensions tried when mapping artifact exports back to source.                                             |
| `artifactDirectories` | Directory prefixes treated as build output, such as `dist`, `build`, `lib`, `esm`, `cjs`, and `out`.                   |

### `proof`

Proof checks use two explicit TypeScript routes. The build graph route starts
at `graph.rootConfig` and must reach every `tsconfig*.build.json`. The
IDE/typecheck route starts at `proof.typecheckRootConfig` and may only reference
ordinary `tsconfig*.json` files. Package scripts are not used as proof inputs.

For each discovered `tsconfig*.build.json`, proof checks that the strict
same-name local config exists, has the same file set and typecheck semantics,
and is reachable from the IDE/typecheck route. Build-only options such as
`composite`, `noEmit`, `outDir`, `rootDir`, and `tsBuildInfoFile` may differ.

| Field                 | Description                                                                |
| --------------------- | -------------------------------------------------------------------------- |
| `typecheckRootConfig` | Root IDE/typecheck solution config. Defaults to `tsconfig.json`.           |
| `sidecarTargets`      | Extra configs covered outside `tsc -b`, such as `vue-tsc` projects.        |
| `allowlist`           | Explicit files allowed outside graph/sidecar coverage, each with a reason. |
| `sourceFilePattern`   | File pattern included in coverage accounting.                              |

### `packageChecks`

Package checks inspect built package outputs under configured dist directories.

| Field                                        | Description                                                                                  |
| -------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `targets[].name`                             | Target name used by `--package`. Usually the package name.                                   |
| `targets[].distDir`                          | Directory containing built package files and `package.json`.                                 |
| `targets[].checks`                           | Enabled tools: `publint`, `attw`, and/or `boundary`. Defaults to all three.                  |
| `targets[].publint.strict`                   | Whether publint runs in strict mode. Defaults to `true`.                                     |
| `targets[].attw.profile`                     | ATTW profile: `strict`, `node16`, or `esm-only`. Defaults to `esm-only`.                     |
| `targets[].boundary.environment`             | Fixed environment or function that classifies files as `browser`, `node`, or another string. |
| `targets[].boundary.ignoredExternalPackages` | Extra package roots allowed even when not listed in the built manifest dependencies.         |

By default, files under `node/` or `plugin/` are treated as Node output; other files are treated as browser/runtime output.

### `pipelines`

Pipelines combine built-in tasks and command steps:

```js
pipelines: {
  typecheck: [
    'graph:check',
    'proof:check',
    'tsc:run',
  ],
}
```

Built-in task strings:

- `graph:check`
- `proof:check`
- `package:check`
- `tsc:run`

Command steps run from `workspace.rootDir` by default and inherit `process.env`. Use `cwd` and `env` to override.

## CI Example

```yaml
name: Typecheck

on:
  pull_request:
  push:
    branches: [main]

jobs:
  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20.19.0
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec lattice check typecheck
```

## API

```ts
import { defineConfig, loadConfig } from '@docs-islands/lattice';

export default defineConfig({
  pipelines: {
    typecheck: ['graph:check'],
  },
});

const config = await loadConfig();
```

Most users only need `defineConfig(...)`. `loadConfig(...)` is available for custom wrappers and tests.

## Design Notes

- Lattice is a governance tool, not a replacement for `tsc`, `vue-tsc`, test runners, or package publish tooling.
- Lattice does not publish packages. Put release automation in your own scripts and call `lattice check publish` as a gate.
- Lattice keeps policy explicit. Prefer copying rules into `lattice.config.mjs` over relying on implicit conventions.
- Read-only checks and mutating commands are separate by design.

## License

MIT
