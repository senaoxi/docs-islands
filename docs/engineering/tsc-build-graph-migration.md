# TypeScript Build Graph Migration Baseline

This document records the historical baseline and current operating model for migrating
the monorepo from workspace-script-driven TypeScript checks to a `tsc -b`
project-reference graph check.

The existing rolldown builds, `rolldown-plugin-dts` declaration publishing
flow, `vue-tsc` checks, and dist artifact checks should remain intact during
the migration.

Permanent ownership rules and the full tsconfig inventory now live in
[`typescript-project-graph.md`](./typescript-project-graph.md).

## Current Typecheck Commands

The root `pnpm typecheck` command is now the primary TypeScript source graph
check. It runs the full graph check, then runs the Vue SFC checks.

- `pnpm typecheck`: primary local and CI source check. It builds required
  artifact-only private packages, validates graph references, runs `tsc -b`,
  and then runs source-owned Vue SFC checks.
- `pnpm typecheck:consumer`: builds package artifacts and runs consumer checks
  that intentionally use `link:` dist dependencies.
- `pnpm typecheck:graph`: default graph check. It validates graph references
  and architecture rules, then runs the default graph build through
  `tsc -b tsconfig.graph.json --pretty false`.
- `pnpm typecheck:lib`: production library/runtime declaration graph
  check through `tsconfig.lib.graph.json`.
- `pnpm typecheck:vue`: Vue SFC/template checks for source-owned Vue configs
  such as `docs/tsconfig.json` and `packages/vitepress/theme/tsconfig.json`.
- `pnpm tsconfig:graph:paths`: compatibility helper that generates source
  `paths` configs only for `workspace:*` dependencies whose package exports
  still resolve to build artifacts.

Pass one-off build-mode flags directly to `typecheck:graph` when needed, for
example `pnpm typecheck:graph -- --force` or
`pnpm typecheck:graph -- --verbose`.

Run `vue-tsc` through `pnpm typecheck:vue` or the package-local Vue scripts
whenever changing `.vue` files, VitePress theme files, or docs theme code.
Native `tsc -b` intentionally does not parse Vue SFC templates.

Graph build leaves emit declarations and `.tsbuildinfo` artifacts into their
own owner directory's `.tsbuild/` cache. Root tools use the root `.tsbuild/`;
workspace/package leaves use package-local `.tsbuild/` directories. These
files are not package build output and must not be published or committed.

Dist artifact checks remain explicit post-build validation. For example,
`packages/vitepress/tsconfig.check.json` still checks `dist/**/*` after the
VitePress package build creates that output.

Generated graph paths are not part of the default source graph. They are an
opt-in compatibility bridge for packages that intentionally keep artifact
exports in the workspace manifest while still being consumed as `workspace:*`
source dependencies. The generator never edits `tsconfig*.build.json`; affected
build leaves must manually extend the generated file first.

## Retired Legacy TypeScript Check Topology

The former root `typecheck:legacy` script was removed during the breaking
graph cleanup. It used orchestration, not TypeScript build mode:

The first step checked root-level TypeScript files under `scripts/` and root
`*.ts` files. The second step fanned out to workspace `typecheck` scripts in
parallel. The last step fanned out to workspace test TypeScript checks.

Former legacy workspace checks:

| Workspace                            | Former source check                                                                                                                 | Former test check                    | Notes                                                                                    |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------- |
| root                                 | root source/script check                                                                                                            | workspace test TypeScript checks     | Root scripts import `@docs-islands/logger` and `@docs-islands/utils`.                    |
| `@docs-islands/utils`                | `tsc --noEmit`                                                                                                                      | none                                 | `utils/tsconfig.json` included the whole package; workspace exports now point to source. |
| `@docs-islands/core`                 | `tsc -p tsconfig.json --noEmit`                                                                                                     | `tsc -p tsconfig.test.json --noEmit` | Package exports point to source files in the workspace manifest.                         |
| `@docs-islands/logger`               | `tsc -p tsconfig.json --noEmit`                                                                                                     | `tsc -p tsconfig.test.json --noEmit` | Source check includes `rolldown.config.ts`, `packagePlugin.ts`, and `scripts/**/*.ts`.   |
| `@docs-islands/plugin-license`       | `tsc --noEmit`                                                                                                                      | none                                 | Private build plugin; source imports logger and utils.                                   |
| `@docs-islands/eslint-config`        | `tsc -p tsconfig.json --noEmit`                                                                                                     | `tsc -p tsconfig.test.json --noEmit` | Workspace exports now point to source.                                                   |
| `@docs-islands/vitepress`            | `tsc -p tsconfig.json --noEmit`, then `tsc -p src/node`, `src/client`, `src/shared`, then `vue-tsc -p theme/tsconfig.json --noEmit` | `tsc -p tsconfig.test.json --noEmit` | The old package-level solution config did not use `tsc -b` and was removed later.        |
| `@docs-islands/monorepo-docs`        | `vue-tsc --noEmit`                                                                                                                  | none                                 | Vue/VitePress site check.                                                                |
| `@docs-islands/vitepress-docs`       | `vue-tsc --noEmit`                                                                                                                  | none                                 | Vue/VitePress package docs check.                                                        |
| `@docs-islands/vitepress-playground` | `tsc -p tsconfig.json --noEmit`                                                                                                     | `tsc -p tsconfig.test.json --noEmit` | Consumer-style playground uses `@docs-islands/vitepress` via `link:../dist`.             |
| `@docs-islands/vitepress-smoke`      | `tsc -p tsconfig.json --noEmit`                                                                                                     | `tsc -p tsconfig.test.json --noEmit` | Smoke fixtures and Playwright config.                                                    |

Before the breaking graph cleanup, root and package `tsconfig.json` files
looked solution-style because they had `files: []` and `references`. They were
not a complete build-mode graph because:

- The root script never runs `tsc -b`.
- Referenced projects mostly inherit `noEmit` from `tsconfig.base.json`.
- Referenced projects do not consistently set `composite`, `tsBuildInfoFile`,
  declaration output, or reference their actual internal dependencies.
- Package-level solution configs often reference source and test projects
  together, but the test projects do not yet depend on source projects through
  TypeScript references.
- Package exports mix source-facing and dist-facing paths, so TypeScript
  resolution is not currently equivalent to a project-reference graph.

## Current Package Export Shape

The migration has to account for package exports because build-mode references
should not accidentally change whether TypeScript resolves source or dist.

| Package                        | Workspace export shape                                                                                                                             | Published/build export shape                                                                                                                      |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@docs-islands/core`           | Exports source files such as `./src/index.ts`, `./src/client/index.ts`, and `./src/node/index.ts`.                                                 | No package build script currently emits public dist.                                                                                              |
| `@docs-islands/logger`         | Exports source files such as `./src/index.ts`, `./src/helper/index.ts`, and `./src/plugin/index.ts`.                                               | `packagePlugin.ts` rewrites source exports to dist JS and d.ts paths during rolldown build.                                                       |
| `@docs-islands/utils`          | Export `types` conditions point to source files such as `./env.ts`, `./logger.ts`, and `./path.ts`; runtime `default` conditions point to dist.    | Rolldown preserves modules and dts into `dist`.                                                                                                   |
| `@docs-islands/plugin-license` | Exports `./dist/index.mjs` and `./dist/index.d.ts`.                                                                                                | Build-only private package, consumed by rolldown configs.                                                                                         |
| `@docs-islands/eslint-config`  | Export `types` conditions point to source files under `src/`; runtime `default` conditions point to dist.                                          | Rolldown preserves modules and dts into `dist`.                                                                                                   |
| `@docs-islands/vitepress`      | Exports source entries for node/client/shared public APIs, plus some theme and internal-helper paths that point to `theme/`, `types/`, or `dist/`. | `packagePlugin.ts` rewrites most source paths into `node/*.js`, `client/*.mjs`, `shared/*.js`, or d.ts paths and filters internal-helper exports. |

The build graph models `workspace:*` source dependencies directly with
references. Dist-facing package export checks stay as post-build or consumer
pipeline checks. If a package keeps dist-facing exports but is referenced as a
`workspace:*` source dependency, `lattice graph check` reports the mismatch and
`lattice paths generate` can produce an explicit source-path shim for the
importing build configs.

## Internal Import Edges

Important observed internal edges:

| From                              | To                                                                         | Representative reason                                                                              |
| --------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| root scripts                      | `@docs-islands/logger`, `@docs-islands/utils`                              | `scripts/build.ts`, `scripts/merge-docs.ts`, `scripts/run-workspace-script.ts`, release scripts.   |
| `utils`                           | `@docs-islands/logger` as `catalog:prod`                                   | `utils/env.ts`, `utils/logger.ts`, `utils/bin/link-guard.ts` consume the released/logger artifact. |
| `plugin-license`                  | `@docs-islands/logger` as `catalog:prod`, `@docs-islands/utils` as source  | `src/index.ts` uses logger helper and utils logger; rolldown config uses `loadEnv`.                |
| `logger` build tooling            | `@docs-islands/plugin-license` as `link:`, `@docs-islands/utils` as source | `packages/logger/rolldown.config.ts`.                                                              |
| `core`                            | `@docs-islands/logger` as `catalog:prod`, `@docs-islands/utils` as source  | Runtime and test helpers import logger helper/facade utilities.                                    |
| `eslint-config` tooling/tests     | `@docs-islands/utils`, `@docs-islands/logger`                              | Rolldown config uses `loadEnv`; tests cover logger import rules.                                   |
| `vitepress` runtime               | `@docs-islands/core`, `@docs-islands/logger`, `@docs-islands/utils`        | Node, client, shared, scripts, and tests import all three.                                         |
| `vitepress` build tooling         | `@docs-islands/plugin-license` as `link:`, `@docs-islands/utils` as source | Rolldown configs and package scripts.                                                              |
| `vitepress` docs/playground/smoke | `@docs-islands/vitepress`, `@docs-islands/logger`, `@docs-islands/utils`   | Consumer examples, fixtures, VitePress configs, and test utilities.                                |

Some `@docs-islands/test`, `@docs-islands/test_b`,
`@docs-islands/logger-fixture`, and `@docs-islands/missing` strings are test
fixture package names, not real workspace graph nodes.

## Current Layered TypeScript Routes

The repository now keeps two TypeScript reference routes separate. The
IDE/typecheck route uses ordinary `tsconfig*.json` files, while the build graph
route uses `tsconfig*.graph.json` aggregators and `tsconfig*.build.json` leaves.
Package scripts are convenience entrypoints, not the source of truth for graph
ownership or coverage proof.

```text
tsconfig.json
  -> scripts/tsconfig.json
  -> utils/tsconfig.json
  -> packages/*/tsconfig.json

packages/*/tsconfig.json
  -> tsconfig.lib.json
  -> tsconfig.tools.json
  -> tsconfig.test.json
  -> runtime/type subproject tsconfig.json files where needed
```

The build graph uses `tsconfig.graph.json` as the default full `tsc -b` check
entry. The full check graph and production library graph are separate entries:

```text

tsconfig.graph.json
  -> tsconfig.lib.graph.json
  -> scripts/tsconfig.build.json
  -> utils/tsconfig.graph.json
  -> packages/*/tsconfig.graph.json

tsconfig.lib.graph.json
  -> utils/tsconfig.lib.build.json
  -> packages/*/tsconfig.lib.build.json
  -> packages/vitepress/tsconfig.lib.graph.json

packages/vitepress/tsconfig.lib.graph.json
  -> types/tsconfig.build.json
  -> src/types/tsconfig.build.json
  -> src/shared/tsconfig.build.json
  -> src/node/tsconfig.build.json
  -> src/client/tsconfig.build.json
```

The source graph remains layered as follows:

```text
logger artifact
  -> utils
  -> plugin-license artifact
  -> logger:tools

logger:lib
  -> core:lib
  -> eslint-config:lib
  -> vitepress:runtime-shared
  -> vitepress:runtime-client
  -> vitepress:runtime-node

logger:lib + utils
  -> root:tools
  -> package tool projects

lib projects
  -> test projects

runtime projects
  -> source-owned docs/theme vue-tsc checks
  -> dist artifact checks after rolldown build
```

More precise project edges:

| Project                                             | References should include                                             | Notes                                                                                                         |
| --------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `packages/logger/tsconfig.lib.build.json`           | none, or only external types                                          | Runtime logger source only.                                                                                   |
| `utils/tsconfig.lib.build.json`                     | none                                                                  | Utils consumes `@docs-islands/logger` as a `catalog:prod` artifact dependency.                                |
| `packages/plugins/license/tsconfig.lib.build.json`  | `utils`                                                               | Plugin-license consumes `@docs-islands/logger` as a `catalog:prod` artifact dependency.                       |
| `packages/logger/tsconfig.tools.build.json`         | `logger:lib`, `utils`                                                 | Plugin-license is consumed through `link:` dist output; the typecheck pipeline prebuilds it.                  |
| `packages/core/tsconfig.lib.build.json`             | `utils`                                                               | Core consumes `@docs-islands/logger` as a `catalog:prod` artifact dependency.                                 |
| `packages/eslint-config/tsconfig.lib.build.json`    | none                                                                  | ESLint config runtime source stays separate from its rolldown config.                                         |
| `scripts/tsconfig.build.json` as `root:tools`       | `logger:lib`, `utils`                                                 | Root scripts import `@docs-islands/logger/helper` and `@docs-islands/utils/*`.                                |
| `packages/vitepress/src/shared/tsconfig.build.json` | `core:lib`, `logger:lib`, `utils`                                     | Universal shared runtime; owns `src/shared` plus `src/types`, with no Node ambient types or `node:*` imports. |
| `packages/vitepress/src/client/tsconfig.build.json` | `vitepress:runtime-shared`, `core:lib`, `logger:lib`, `utils`         | Client runtime keeps Node ambient types out.                                                                  |
| `packages/vitepress/src/node/tsconfig.build.json`   | `vitepress:runtime-shared`, `core:lib`, `logger:lib`, `utils`         | Node runtime owns Node-specific config resolution.                                                            |
| `packages/vitepress/tsconfig.tools.build.json`      | `vitepress:runtime-*`, `utils`, `logger:lib`                          | Plugin-license is consumed through `link:` dist output; the typecheck pipeline prebuilds it.                  |
| package test projects                               | corresponding source/runtime projects plus imported internal packages | Tests should depend on source projects, not be referenced by production libs.                                 |
| playground/smoke projects                           | none in source graph                                                  | They are dist consumer checks in the `consumer` pipeline, not project-reference build leaves.                 |

The graph should keep production source projects and tool/test projects
separate. That separation is the main way to make the dependency graph acyclic
without changing runtime source behavior.

The checker also enforces forbidden edges:

- Production lib/runtime/type projects must not depend on tools or tests.
- Tools projects must not depend on tests.
- VitePress client runtime must not depend on node runtime.
- VitePress shared runtime must not depend on node or client runtime.
- VitePress shared/client runtime projects must not import `node:*`.

## Project Classification

Current graph/local classification:

| Class            | Projects/configs                                                                                                                                                                                                                                                                                                      |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib`            | `packages/logger/tsconfig.lib.build.json`, `utils/tsconfig.lib.build.json`, `packages/plugins/license/tsconfig.lib.build.json`, `packages/core/tsconfig.lib.build.json`, `packages/eslint-config/tsconfig.lib.build.json`, `packages/lattice/tsconfig.lib.build.json`                                                 |
| `tools`          | `scripts/tsconfig.build.json`, `packages/logger/tsconfig.tools.build.json`, `utils/tsconfig.tools.build.json`, `packages/plugins/license/tsconfig.tools.build.json`, `packages/eslint-config/tsconfig.tools.build.json`, `packages/lattice/tsconfig.tools.build.json`, `packages/vitepress/tsconfig.tools.build.json` |
| `test`           | `packages/logger/tsconfig.test.build.json`, `packages/core/tsconfig.test.build.json`, `packages/eslint-config/tsconfig.test.build.json`, `packages/vitepress/tsconfig.test.build.json`                                                                                                                                |
| `runtime-node`   | `packages/vitepress/src/node/tsconfig.build.json` for graph, `packages/vitepress/src/node/tsconfig.json` for package scripts and dts                                                                                                                                                                                  |
| `runtime-client` | `packages/vitepress/src/client/tsconfig.build.json` for graph, `packages/vitepress/src/client/tsconfig.json` for package scripts and dts                                                                                                                                                                              |
| `runtime-shared` | `packages/vitepress/src/shared/tsconfig.build.json` for graph, `packages/vitepress/src/shared/tsconfig.json` for package scripts                                                                                                                                                                                      |
| `docs`           | `docs/tsconfig.json` in source typecheck; `packages/vitepress/docs/tsconfig.json` in the dist consumer pipeline                                                                                                                                                                                                       |
| `playground`     | Local source/test configs in the dist consumer pipeline                                                                                                                                                                                                                                                               |
| `smoke`          | Local source/test configs in the dist consumer pipeline                                                                                                                                                                                                                                                               |

## Likely Graph Cycles And Breaks

### `logger` -> `plugin-license` -> `utils` -> `logger`

Former source-level cycle risk:

- `packages/logger/tsconfig.json` includes `rolldown.config.ts`.
- `packages/logger/rolldown.config.ts` imports `@docs-islands/plugin-license`
  and `@docs-islands/utils/builtin`.
- `@docs-islands/plugin-license` imports `@docs-islands/logger/helper` and
  `@docs-islands/utils/logger`.
- `@docs-islands/utils` imports `@docs-islands/logger`.

Break:

- Treat logger runtime source as `logger:lib`.
- Move logger rolldown config, package plugin, and package scripts into
  `logger:tools`.
- Keep `utils` and `plugin-license` consuming logger as a built artifact, then
  place `logger:tools` after `utils`; `plugin-license` is prebuilt and consumed
  through `link:` by package tooling.

### `utils` -> `logger` and logger build tooling -> `utils`

Current risk:

- `utils/env.ts`, `utils/logger.ts`, and `utils/bin/link-guard.ts` depend on
  logger.
- Logger build tooling depends on utils.

Break:

- Same split as above. `utils` may reference `logger:lib`; only
  `logger:tools` may reference `utils`.

### VitePress node/client/shared self-imports

Current risk:

- Node and client runtime files import self package specifiers such as
  `@docs-islands/vitepress/logger` and
  `@docs-islands/vitepress/internal/devtools`.
- The source package exports map those specifiers back into `src/shared/*`.
- If the package source is one large project, or if package self-imports are
  resolved through the package manifest during build mode, the split
  `runtime-node` and `runtime-client` projects can look cyclic.

Break:

- Make `src/shared` the lower-level `runtime-shared` project.
- In source graph configs, resolve VitePress self-imports that point to shared
  internals directly to the shared project, either through existing `#shared/*`
  aliases or explicit source-graph paths.
- Keep node and client projects depending on shared, not on the package-level
  VitePress aggregate.

### VitePress theme/docs self-imports

Current risk:

- Theme files import `@docs-islands/vitepress/internal/devtools`.
- Docs examples/components import public VitePress entries.
- Docs package manifests point to `@docs-islands/vitepress` through `link:../dist`.

Break:

- Keep root docs and package theme checks as source-owned `vue-tsc` sidecar
  checks after runtime source checks.
- Keep package docs, playground, and smoke checks as consumer checks after
  package builds.
- Do not make runtime source projects depend on docs, theme, playground, or
  smoke projects.
- Keep dist-linked consumer checks after rolldown build where they intentionally
  validate built output.

### Test projects importing source projects

Current risk:

- Test configs import package public specifiers and source internals.
- If tests are included in production configs, they can pull fixture-only
  packages and dev-only dependencies into the production graph.

Break:

- Keep graph-owned tests in `tsconfig.test.build.json` projects.
- Add references from test projects to their corresponding source/runtime
  projects and imported internal packages.
- Do not reference test projects from lib/runtime projects.

## Configs That Should Remain Under `vue-tsc`

These should not be converted to plain `tsc` checks because they include Vue SFC
files or VitePress site SFC typing:

- `docs/tsconfig.json`
- `packages/vitepress/docs/tsconfig.json`
- `packages/vitepress/theme/tsconfig.json`

The current scripts are correct in principle:

- `docs/package.json`: `vue-tsc --noEmit`
- `packages/vitepress/docs/package.json`: `vue-tsc --noEmit`
- `packages/vitepress/package.json`: `vue-tsc -p theme/tsconfig.json --noEmit`

The source pipeline runs root docs and package theme after the `tsc -b` graph
check. Package docs stay in the consumer pipeline because they intentionally
consume `@docs-islands/vitepress` through `link:../dist`. All of them should
remain separate from plain TypeScript build mode unless a later task proves
`vue-tsc` build-mode references are safe for these configs.

## Configs And Scripts That Should Remain Dist Artifact Checks

The following checks validate built artifacts and should remain after rolldown
builds:

- `packages/vitepress/tsconfig.check.json`, which extends root
  `tsconfig.check.json` and includes `dist/**/*`.
- `packages/vitepress/package.json` `build-types-check`, currently
  `tsc -p tsconfig.check.json`.
- `lattice package check`, including its `publint`, `attw`, and `boundary`
  package artifact checks.
- Release checks that verify `dist/package.json` version and run
  `npm pack --dry-run`.
- Smoke checks that intentionally consume packed or dist-linked outputs.

Do not replace these with source project references. They protect a different
surface: the package that consumers actually install.

## First Safe Migration Order

1. Add a separate graph entry such as `tsconfig.graph.json`.
2. Split `@docs-islands/logger` into a runtime lib project and a tools project
   in TypeScript config only. Keep rolldown and `rolldown-plugin-dts` unchanged.
3. Add `utils` to the graph without a logger reference when it consumes logger
   as `catalog:prod`.
4. Add `plugin-license` with a source reference to `utils`, then prebuild it for
   package tooling that consumes it through `link:`.
5. Add `core:lib` and `eslint-config:lib` with references to their real
   internal dependencies.
6. Split VitePress runtime checks into `runtime-shared`, `runtime-client`, and
   `runtime-node` references. Keep package-level VitePress source/tool config
   separate from runtime projects.
7. Add root and package tool projects after the lib/runtime spine is acyclic.
8. Add test projects after their source projects. Keep fixture-only package
   names out of production graph references.
9. Move package docs, playground, and smoke TypeScript projects into consumer
   checks that run after package artifacts are built.
10. Continue to run source-owned `vue-tsc` checks and dist artifact checks
    after the graph check.
11. After parity is proven, make root `tsconfig.json` the IDE/typecheck
    solution over ordinary `tsconfig*.json` configs. Keep `tsconfig.graph.json`
    as the build graph entry for `tsc -b`, and keep `vue-tsc` sidecars
    explicit.

## Uncertainties For Later Code-Change Tasks

- Whether the graph should use declaration emit to a temporary internal output
  directory, or `tsc -b --noEmit`, needs a small prototype with the repository's
  TypeScript version. This report intentionally does not change configs.
- The exact source-graph resolution for VitePress self-imports should be tested
  before editing configs, especially `@docs-islands/vitepress/logger` and
  `@docs-islands/vitepress/internal/devtools`.
- The VitePress theme check may need either a dedicated `vue-tsc` project
  reference strategy or to remain fully outside the `tsc -b` graph.
- Playground and docs packages use dist links in manifests; decide per check
  whether they should validate source graph types, built dist types, or both.
- `packages/vitepress/src/node/framework-build/__tests__/source/rendering-strategy-comps/tsconfig.json`
  is a fixture tsconfig and should be inspected before including it in any
  automated root graph.
