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

## Pick an Adoption Path

If your workspace does not yet have a Limina config, start with `limina init`. It writes a source-selector based `limina.config.mjs`, adds the root script, and ensures `.limina/` is ignored.

If your repository already has a clear tsconfig convention, write the minimal `limina.config.mjs` directly. Limina generates its declaration graph from the source configs selected by `checker.include`. See [Checker Entries](./config/checkers.md) and [Config File](./config/config-file.md) for the full shape of these settings.

## Initialize an Existing Workspace

For a pnpm monorepo that has not adopted Limina's declaration graph layout yet, run:

```sh
pnpm exec limina init
```

`limina init` searches upward for the nearest `pnpm-workspace.yaml`, confirms the workspace root, and writes Limina config files.

For non-interactive environments, use:

```sh
pnpm exec limina init --yes
```

Initialization can create or update:

- a root `limina.config.mjs`;
- a root `.gitignore` entry for `.limina/`;
- a root `limina:check` script;
- a missing root `limina` dev dependency.

::: warning
Generated checker graphs are written later under `.limina/` by `limina graph prepare` and by graph-consuming commands.
:::

When graph preparation fails, it usually means `checker.include` matched a reserved or non-source tsconfig. Narrow `include` or add `exclude` entries until only ordinary source configs are selected.

After initialization, run:

```sh
pnpm i
pnpm limina:check
```

::: tip
You only need `pnpm i` when init changed dependencies or created a root `package.json`.
:::

## Minimal Manual Config

Create `limina.config.mjs` at the workspace root:

```js
import { defineConfig } from 'limina';

export default defineConfig({
  config: {
    checkers: {
      typescript: {
        preset: 'tsc',
        include: ['packages/**/tsconfig.json'],
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

1. `graph:check` (which prepares the generated graph first)
2. `source:check`
3. `proof:check`
4. `checker:build`
5. `checker:typecheck`

The first failure usually tells you which layer to inspect:

- `graph:check` usually points to imports, generated project references, package dependencies, or label rules that are out of sync;
- `source:check` usually points to file ownership, cross-package relative imports, dependency declarations, or `#imports`;
- `proof:check` usually points to checker includes, generated declaration coverage, or allowlists that do not cover source files;
- `checker:build` means a first-class build execution checker such as `tsc`, `tsgo`, or `vue-tsc` found type errors;
- `checker:typecheck` means a second-class typecheck execution checker such as `vue-tsgo` or `svelte-check` found type errors.

For example, if `@acme/app` adds an import from `@acme/core` and the first `pnpm typecheck` fails in graph checking, start with the importing file and source tsconfig shown in the report. Re-run the same command after the fix to confirm graph, source ownership, coverage proof, and checker execution together.

## Add Framework Checkers

Limina can also run framework-aware checkers. Add another checker entry when part of the workspace needs it:

```js
import { defineConfig } from 'limina';

export default defineConfig({
  config: {
    checkers: {
      typescript: {
        preset: 'tsc',
        include: ['packages/**/tsconfig.json'],
        exclude: ['packages/web/tsconfig.json'],
      },
      vue: {
        preset: 'vue-tsc',
        include: ['packages/web/tsconfig.json'],
      },
    },
  },
});
```

Checker entries are always `tsconfig.json` files. If a package has `tsconfig.lib.json` or `tsconfig.test.json`, reference them from that package's `tsconfig.json`; Limina will follow those references.

Built-in presets are `tsc`, `tsgo`, `vue-tsc`, `vue-tsgo`, and `svelte-check`. Install the matching package when you enable a checker; `tsgo` and `vue-tsgo` require `@typescript/native-preview`, and `vue-tsc` entries also require `@vue/compiler-sfc` so Limina can parse SFC imports.
