# @docs-islands/lattice

<p align="center">
  <a href="https://npmjs.com/package/@docs-islands/lattice"><img src="https://img.shields.io/npm/v/@docs-islands/lattice.svg" alt="npm package"></a>
  <a href="https://nodejs.org/en/about/previous-releases"><img src="https://img.shields.io/node/v/@docs-islands/lattice.svg" alt="node compatibility"></a>
  <a href="https://github.com/XiSenao/docs-islands/actions/workflows/ci.yml"><img src="https://github.com/XiSenao/docs-islands/actions/workflows/ci.yml/badge.svg?branch=main" alt="build status"></a>
  <a href="https://github.com/XiSenao/docs-islands/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/@docs-islands/lattice.svg" alt="license"></a>
</p>

English | [简体中文](./README.zh-CN.md)

`@docs-islands/lattice` is a configurable governance CLI for TypeScript monorepos. It keeps TypeScript project references, source typechecks, compatibility paths, package export policy, and publish-time package checks in one explicit `lattice.config.mjs` file.

Lattice is not a bundler and does not replace `tsc`, `vue-tsc`, tests, or release tooling. It coordinates them and verifies that the architecture they depend on stays consistent.

## Why Lattice?

Large TypeScript workspaces often need more than `tsc --noEmit`:

- project references must match real cross-project imports;
- production graph projects should not depend on tools or tests;
- browser/runtime output should not import Node builtins;
- `workspace:*` dependencies should resolve to source during graph checks;
- generated compatibility `paths` should not silently drift;
- built package outputs need consumer-facing checks before release;
- Vue, docs, playground, and smoke checks may need checker-specific tooling outside native `tsc -b`.

Lattice makes these rules reviewable, runnable, and suitable for CI.

## Features

- **Project graph validation**: checks reachable TypeScript build leaves, references, graph-owned imports, package boundaries, and label-based deny rules.
- **Typecheck coverage proof**: verifies that build configs match strict local typecheck companions and that source files are covered by graph, checker routes, or allowlist entries.
- **Compatibility path generation**: writes opt-in `tsconfig.graph.paths.generated.json` files for `workspace:*` dependencies whose package exports still point at build artifacts.
- **Checker target runner**: runs configured TypeScript and UI-framework checker routes for `typecheck` and `build`.
- **Published package checks**: validates built package outputs with `publint`, Are The Types Wrong, and a runtime import boundary audit.
- **Composable pipelines**: combines built-in checks and shell commands into named workflows such as `typecheck`, `package`, and `publish`.
- **Typed configuration**: ships `defineConfig(...)` for editor hints and typed user configs.

## Requirements

- Node.js `^20.19.0 || >=22.12.0`
- pnpm workspace with `pnpm-workspace.yaml`
- TypeScript installed in the consuming repository
- ESM-compatible `lattice.config.mjs`

## Installation

```sh
pnpm add -D @docs-islands/lattice typescript
```

## Quick start

Create `lattice.config.mjs` at the workspace root:

```js
import { defineConfig } from '@docs-islands/lattice/config';

export default defineConfig({
  config: {
    checkers: {
      typescript: {
        preset: 'tsc',
        routes: {
          typecheck: 'tsconfig.json',
          build: 'tsconfig.graph.json',
        },
      },
      vue: {
        preset: 'vue-tsc',
        routes: {
          typecheck: 'tsconfig.vue.json',
          build: 'tsconfig.vue.graph.json',
        },
      },
    },
  },

  graph: {
    rules: {
      'runtime-client': {
        deny: {
          refs: [
            {
              path: 'packages/app/src/node/tsconfig.lib.build.json',
              reason: 'client runtime must not depend on the Node runtime',
            },
          ],
        },
      },
    },
  },

  proof: {
    allowlist: [
      {
        file: 'src/generated/runtime.d.ts',
        reason: 'Generated declaration stub covered by the runtime build process.',
      },
    ],
  },

  packageChecks: {
    targets: [
      {
        name: '@acme/core',
        outDir: 'packages/core/dist',
      },
    ],
  },

  pipelines: {
    typecheck: ['graph:check', 'proof:check', 'tsc:run', 'tsc:build'],
    package: ['package:check'],
    publish: ['graph:check', 'proof:check', 'package:check'],
  },
});
```

Add scripts:

```json
{
  "scripts": {
    "typecheck": "lattice check typecheck",
    "lint:package": "lattice package check",
    "prepublishOnly": "lattice check publish"
  }
}
```

Run checks:

```sh
pnpm typecheck
pnpm exec lattice graph check
pnpm exec lattice package check --package @acme/core
```

## Concepts

### Build graph route

For the TypeScript checker, starts at `config.checkers.<name>.routes.build`, usually `tsconfig.graph.json`, and reaches `tsconfig*.build.json` leaves used by `tsc -b` and architecture checks.

### Typecheck route

For the TypeScript checker, starts at `config.checkers.<name>.routes.typecheck`, usually `tsconfig.json`, and reaches ordinary local `tsconfig*.json` configs used by editors and `tsc --noEmit`.

Build leaves should have strict local companions. For example, `tsconfig.lib.build.json` should pair with `tsconfig.lib.json`.

### Source dependencies and artifact dependencies

A dependency declared as `workspace:*` is considered a source dependency. It should be represented by project references and source-facing package exports.

A dependency declared as `link:`, `file:`, `catalog:`, or normal semver is treated as an artifact dependency. It should not be modeled as a project reference unless it is intentionally consumed as source.

### Package checks

Source graph checks do not prove that an installed package works for consumers. `lattice package check` inspects built package outputs under `packageChecks.targets[].outDir` and checks the actual package manifest, exports, type resolution, and runtime imports.

## CLI

```sh
lattice [--config lattice.config.mjs] [--mode mode] <command>
```

| Command                                          | Description                                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `lattice check <pipeline>`                       | Run a named pipeline from `pipelines`.                                               |
| `lattice graph check`                            | Validate project references and architecture import rules.                           |
| `lattice proof check`                            | Prove build configs, local typecheck configs, and source coverage stay aligned.      |
| `lattice paths generate`                         | Generate compatibility source `paths` configs for artifact-facing workspace exports. |
| `lattice paths apply`                            | Compatibility alias for `paths generate`.                                            |
| `lattice paths check`                            | Fail when generated path files are stale.                                            |
| `lattice tsc`                                    | Run configured checker `typecheck` routes, or discover ordinary `tsconfig` targets.  |
| `lattice tsc --build`                            | Run configured checker `build` routes.                                               |
| `lattice tsc -p <path>`                          | Start typecheck target discovery from a specific config file or directory.           |
| `lattice tsc --concurrency <n>`                  | Limit concurrent `tsc` processes.                                                    |
| `lattice package check`                          | Run configured package output checks.                                                |
| `lattice package check --package <name>`         | Check one configured package target.                                                 |
| `lattice package check --tool <tool>`            | Run only `publint`, `attw`, or `boundary`.                                           |
| `lattice package check --attw-profile <profile>` | Override the ATTW profile: `strict`, `node16`, or `esm-only`.                        |

## Configuration reference

### `config`

```js
config: {
  checkers: {
    typescript: {
      preset: 'tsc',
      routes: {
        typecheck: 'tsconfig.json',
        build: 'tsconfig.graph.json',
      },
    },
    vue: {
      preset: 'vue-tsc',
      routes: {
        typecheck: 'tsconfig.vue.json',
        build: 'tsconfig.vue.graph.json',
      },
    },
  },
  source: {
    exclude: ['node_modules', 'dist', '.tsbuild'],
  },
}
```

`config.checkers` defines active checker routes. Built-in presets can omit `extensions`; if `source.include` is omitted, Lattice derives the source boundary from active checker extensions, then applies `source.exclude`.

### `graph`

```js
graph: {
  rules: {
    'runtime-client': {
      deny: {
        refs: [
          {
            path: 'packages/app/src/node/tsconfig.lib.build.json',
            reason: 'client runtime must stay independent from Node runtime',
          },
        ],
        deps: [
          {
            name: '@acme/internal-node',
            reason: 'client runtime must not consume Node-only packages',
          },
        ],
      },
    },
  },
}
```

A build config opts into a rule by adding a `lattice` label:

```jsonc
{
  "lattice": "runtime-client",
  "extends": ["./tsconfig.lib.json", "../../tsconfig.graph.base.json"],
  "references": [],
}
```

### `paths`

```js
paths: {
  generatedFileName: 'tsconfig.graph.paths.generated.json',
  conditionPriority: ['source', 'development', 'types'],
  artifactDirectories: ['dist', 'build', 'lib', 'esm', 'cjs', 'out'],
}
```

Use generated paths only when a workspace package must keep artifact-facing exports while still being consumed as a graph-owned source dependency.

### `proof`

```js
proof: {
  allowlist: [
    {
      file: 'src/generated/runtime.d.ts',
      reason: 'Generated file validated by the build pipeline.',
    },
  ],
}
```

Checker routes cover files checked outside the TypeScript build graph. Allowlist entries should be rare and must include a reason.

### `packageChecks`

```js
packageChecks: {
  targets: [
    {
      name: '@acme/core',
      outDir: 'packages/core/dist',
      checks: ['publint', 'attw', 'boundary'],
      publint: { strict: true },
      attw: { profile: 'esm-only' },
      boundary: {
        environment: (file) => file.startsWith('node/') ? 'node' : 'browser',
        ignoredExternalPackages: ['@acme/runtime-shim'],
      },
    },
  ],
}
```

`outDir` must point at the built package directory that contains the publish-ready `package.json`.

### `pipelines`

```js
pipelines: {
  typecheck: ['graph:check', 'proof:check', 'tsc:run', 'tsc:build'],
  package: [
    { type: 'command', command: 'pnpm', args: ['build'] },
    'package:check',
  ],
}
```

String steps can be built-in task names or simple commands. Use object command steps when arguments, `cwd`, or `env` need to be explicit.

## CI example

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

## Programmatic API

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

## Troubleshooting

### `Unable to find lattice config`

Run the command from inside the workspace, or pass `--config ./lattice.config.mjs`.

### `no pnpm-workspace.yaml was found`

Lattice infers the workspace root from `pnpm-workspace.yaml`. Place the config inside the workspace or pass a config path located under the workspace root.

### `packageChecks.targets[x].outDir` is invalid

Set `outDir` to the built package directory, not the source package directory, unless that directory is itself the publish-ready package output.

### Generated paths are stale

Run:

```sh
pnpm exec lattice paths generate
```

Then add the generated file to the first position of the listed `extends` arrays and commit the generated file if your repository policy requires reproducible `tsc -b` without a pre-generation step.

## Design principles

- Explicit policy is better than hidden presets.
- Source graph checks and package artifact checks validate different surfaces.
- Build graph configs should be strict, small, and directly referenced.
- Generated compatibility paths should be transitional, not the default architecture.
- Lattice should fail with actionable messages instead of silently accepting graph drift.

## License

MIT
