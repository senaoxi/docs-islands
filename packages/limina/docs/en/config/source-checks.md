# Source Checks

::: warning
This page documents the top-level `source` option — the **Knip-driven dependency and module reachability checks** run by `source:check`. It is different from `config.source`, which defines the governed-file boundary used by proof coverage. For that option, see [Source Boundary](./source-boundary.md).
:::

`source check` owns package authority and ordinary typecheck ownership checks. Its Knip-backed branch uses package entries instead of `include` / `exclude` to report unused workspace dependencies and unused source modules from Limina's package owner module sets.

```js
import { defineConfig } from 'limina';

export default defineConfig({
  source: {
    knip: {
      workspaces: {},
    },
    tsconfigOwnership: { ignore: [] },
  },
});
```

## knip

- **Type:** `boolean | SourceKnipCheckConfig`
- **Default:** `true`

`source.knip` controls the Knip-backed parts of `source:check`: unused workspace dependencies and unused source modules.

Use `knip: true` or omit the option to use Limina's generated default Knip config. Use `knip: false` to skip these Knip-backed checks. Use an object to configure Limina's semantic Knip rules by workspace package name:

```ts
interface SourceKnipEntryConfig {
  files: string[];
  reason: string;
}

interface SourceKnipIgnoredDependencyConfig {
  dep: string;
  reason: string;
}

interface SourceKnipIgnoredFileConfig {
  file: string;
  reason: string;
}

interface SourceKnipWorkspaceConfig {
  entry?: SourceKnipEntryConfig[];
  ignoreDependencies?: SourceKnipIgnoredDependencyConfig[];
  ignoreFiles?: SourceKnipIgnoredFileConfig[];
}

interface SourceKnipCheckConfig {
  workspaces?: Record<string, SourceKnipWorkspaceConfig>;
}
```

`source.knip.workspaces` keys are package names discovered from the pnpm workspace, such as `@acme/app`. Unknown package names fail `source check`.

`source.knip.workspaces[pkg]` only configures extra reachability and ignore rules. It does not accept `tsConfig`. Limina derives the Knip tsconfig for each analyzed package from static package scripts that call `limina build <config>`, for example:

```json
{
  "scripts": {
    "build:types": "limina build tsconfig.json"
  }
}
```

The `<config>` path is resolved from the package directory. Limina supports static forms such as `limina build tsconfig.json`, `limina build --checker vue-tsc tsconfig.json`, `pnpm limina build tsconfig.json`, and `pnpm exec limina build tsconfig.json`. Dynamic shell scripts such as `limina build $CONFIG` are not used as Knip tsconfig sources.

If a package participates in Knip-backed source or dependency analysis but Limina cannot statically derive a build config from its package scripts, `source check` reports `Missing generated Knip tsconfig source`.

::: warning
`knip` is an optional peer dependency of Limina. If `source.knip` is enabled but `knip` is not installed in the workspace running Limina, `source check` fails with a missing peer dependency error.
:::

Limina disables Knip's implicit `index` / `main` / `cli` entry guessing by writing `entry: []` for governed owner workspaces. Default reachability still includes package manifest entries (`exports`, `main`, `module`, `browser`, `bin`, `types`, `typings`), Knip plugin-discovered entries, package scripts, and Limina-generated virtual entries for application-style owners.

When package entries point at build artifacts, Knip needs a tsconfig with enough `rootDir` / `outDir` information to map those artifacts back to source files. Point a static `limina build <config>` package script at the config that describes emitted artifact layout.

This is a general package design pattern: `package.json` describes the built files that consumers import, while the selected source tsconfig describes the source tree that writes those files. For example, `@docs-islands/utils` can expose only built files:

```json
{
  "exports": {
    "./env": "./dist/src/env.js"
  }
}
```

Then `utils/tsconfig.dts.json` can describe the source side:

```json
{
  "compilerOptions": {
    "rootDir": ".",
    "outDir": "./dist"
  },
  "include": ["src/**/*.ts"]
}
```

As long as the Knip tsconfig explains the source and output directories, such as `rootDir: "."` and `outDir: "./dist"`, Knip can map `utils/dist/src/env.js` back to `utils/src/env.ts`. The source module is then considered reachable from the package entry even without an `exports.source` condition.

Expose that intent through a static package script:

```json
{
  "scripts": {
    "build:types": "limina build tsconfig.dts.json"
  }
}
```

If the derived Knip tsconfig does not clearly describe `outDir` / `rootDir`, Knip can see the `dist` entry but may not find the source module behind it. That source file may be reported as unused. Prefer pointing `limina build <config>` at the right package-local config over adding a tool-only `source` condition to `package.json` just to satisfy Knip.

Limina also determines Knip's `project` file set automatically from governed source modules. Users do not configure `project`.

```js
import { defineConfig } from 'limina';

export default defineConfig({
  source: {
    knip: {
      workspaces: {
        '@acme/app': {
          entry: [
            {
              files: ['packages/app/src/**/*.spec.ts'],
              reason: 'Vitest loads spec modules directly.',
            },
          ],
          ignoreDependencies: [
            {
              dep: '@acme/runtime',
              reason: 'Loaded by generated code outside the entry graph.',
            },
          ],
          ignoreFiles: [
            {
              file: 'packages/app/src/generated/runtime.ts',
              reason: 'Generated runtime module loaded by the framework.',
            },
          ],
        },
      },
    },
  },
});
```

### workspaces[pkg].entry

- **Type:** `Array<{ files: string[]; reason: string }>`

Use `entry` for package-owned source modules that are legitimate direct roots without being package exports. For example, test runners may load `*.spec.ts` files directly.

Entry configs must use positive workspace-root-relative glob patterns inside the keyed package directory and a non-empty reason.

### workspaces[pkg].ignoreDependencies

- **Type:** `Array<{ dep: string; reason: string }>`

`source check` verifies that workspace packages declared in `package.json` are reachable from the importing package's public entry graph. This applies to every workspace package, including the workspace root.

For dependencies used by generated code, runtime strings, or another path Knip cannot see, add an ignore entry under the importing package key.

Ignore entries must name an existing workspace package in `dep` and a dependency pair still declared in the keyed importer package manifest. If the dependency is intentionally retained, keep the reason close to the config; if it is no longer needed, remove the dependency instead.

### workspaces[pkg].ignoreFiles

- **Type:** `Array<{ file: string; reason: string }>`

Use `ignoreFiles` only when a source module is intentionally retained but not visible to Knip.

Ignore entries must use a workspace-root-relative file path that stays inside the repository and a non-empty reason. The file must belong to the keyed package's source module set known to Limina.

## tsconfigOwnership.ignore

- **Type:** `Array<{ owner: string; files: string[]; reason: string }>`

`source check` searches upward from each governed module's directory for bare `tsconfig.json` files, matching the project-config lookup used by Rolldown and TypeScript's Go to Project Configuration action. A candidate may include the module directly, or it may reach exactly one ordinary typecheck config through transitive `references`. If the nearest candidate does not match the module, Limina keeps searching parent directories until the workspace root.

Limina only follows ordinary typecheck configs in this search. It does not treat `tsconfig*.dts.json`, `tsconfig*.build.json`, `tsconfig*.base.json`, or `tsconfig*.check.json` as ownership configs.

Tests and fixtures may be loaded by tools in ways that do not fit this local tsconfig shape. Keep those modules governed, but skip only this ownership rule with a scoped ignore:

```js
import { defineConfig } from 'limina';

export default defineConfig({
  source: {
    tsconfigOwnership: {
      ignore: [
        {
          owner: '@acme/app',
          files: ['packages/app/src/**/*.spec.ts'],
          reason: 'Vitest loads test modules directly.',
        },
      ],
    },
  },
});
```

Ignore entries must use a named package owner, positive workspace-root-relative glob patterns inside that owner directory, and a non-empty reason. They only skip upward `tsconfig.json` owner resolution; package ownership, import authority, proof coverage, and unused-module checks still run.
