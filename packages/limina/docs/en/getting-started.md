# Getting Started

## Requirements

Limina expects a pnpm workspace and an ESM config file.

- Node.js `^20.19.0 || >=22.12.0`
- A `pnpm-workspace.yaml` at the workspace root
- TypeScript installed in the consuming repository
- `limina.config.mjs` inside the workspace

## Install

::: code-group

```sh [pnpm]
pnpm add -D limina typescript
```

:::

If a workspace package calls `limina` from its own scripts, add `limina` to that package too:

```json
{
  "devDependencies": {
    "limina": "workspace:*"
  }
}
```

## Initialize an Existing Workspace

For a pnpm monorepo that has not adopted Limina's declaration graph layout yet, run:

```sh
pnpm exec limina init
```

`limina init` searches upward for the nearest `pnpm-workspace.yaml`, confirms the workspace root, scans ordinary `tsconfig*.json` files, and writes the Limina files it can infer.

For non-interactive environments, use:

```sh
pnpm exec limina init --yes
```

Initialization can create:

- paired `tsconfig*.dts.json` declaration configs;
- `tsconfig.build.json` aggregators;
- a root `limina.config.mjs`;
- a root `limina:check` script;
- a missing root `limina` dev dependency.

It refuses ambiguous inputs instead of guessing, including existing `tsconfig*.build.json` or `tsconfig*.dts.json` files and `tsconfig.json` files that mix source files with project references.

After initialization, run:

```sh
pnpm i
pnpm limina:check
```

You only need `pnpm i` when init changed dependencies or created a root `package.json`.

## Minimal Manual Config

If you already have a declaration build graph, create `limina.config.mjs` at the workspace root:

```js
import { defineConfig } from 'limina';

export default defineConfig({
  config: {
    checkers: {
      typescript: {
        preset: 'tsc',
        entry: 'tsconfig.build.json',
      },
    },
  },
});
```

Add a root script:

```json
{
  "scripts": {
    "typecheck": "limina check"
  }
}
```

Run it:

```sh
pnpm typecheck
```

The default check pipeline runs:

1. `graph:check`
2. `source:check`
3. `proof:check`
4. `checker:typecheck`

## Add Framework Checkers

Limina can also run framework-aware checkers. Add another checker entry when part of the workspace needs it:

```js
import { defineConfig } from 'limina';

export default defineConfig({
  config: {
    checkers: {
      typescript: {
        preset: 'tsc',
        entry: 'tsconfig.build.json',
      },
      vue: {
        preset: 'vue-tsc',
        entry: 'tsconfig.vue.build.json',
      },
    },
  },
});
```

Built-in presets are `tsc`, `vue-tsc`, and `svelte-check`. Install the matching package when you enable a checker.

## Next Steps

- Learn the model in [Core Concepts](./concepts.md).
- See each command in [Checks & Workflows](./checks-and-workflows.md).
- Add package output validation with [`packageChecks.targets`](./reference.md#packagecheckstargets).
