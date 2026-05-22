# TypeScript Project Graph

This guide records the ownership rules for the `tsc -b` graph. The graph is
layered so editor entrypoints, declaration build graph aggregators, and
declaration leaves do not drift into each other.

## Commands

- `pnpm typecheck` runs the full graph check, then runs the Vue SFC checks.
- `pnpm typecheck:consumer` builds dist artifacts and runs consumer-style
  checks that intentionally use `link:` dependencies.
- `pnpm typecheck:graph` verifies graph references and architecture rules, then
  runs `tsc -b tsconfig.build.json --pretty false`.
- `pnpm typecheck:lib` checks only the production library/runtime declaration
  graph through `tsconfig.lib.build.json`.
- `pnpm typecheck:vue` runs `vue-tsc` for source-owned Vue checks such as docs
  and the VitePress theme.
- `pnpm tsconfig:graph:paths` generates opt-in compatibility source paths for
  `workspace:*` dependencies whose package exports still point at build
  artifacts.

For one-off build-mode flags, run the raw TypeScript build command directly,
for example `pnpm exec tsc -b tsconfig.build.json --pretty false --force`.

Do not add dist artifact checks to normal `pnpm typecheck` unless the command
also builds the corresponding dist output first.

## Graph Layers

```text
tsconfig.json
  editor solution entry

packages/*/tsconfig.json
  package-local source/editor check entry

tsconfig.<kind>.json
  strict local typecheck entry paired with tsconfig.<kind>.dts.json

tsconfig.build.json
  default full TypeScript graph: production graph + tools + tests

tsconfig.lib.build.json
  production library/runtime declaration graph

tsconfig.dts.base.json
  optional shared build-mode overlay for declaration leaves

packages/*/tsconfig.build.json
  package/domain-level graph aggregator

tsconfig*.dts.json
  declaration leaf; owns output/cache paths and references
```

Root graph entries should only know first-class domains. Package graph
aggregators own package internals. Declaration leaf configs inherit typecheck
semantics from their paired local config, then add build-mode output paths and
direct references.

## Permanent Rules

- Every graph-owned cross-project import must be backed by a direct project
  reference to the owning graph project.
- `tsconfig.lib.dts.json` projects include production source only. They must not
  include tooling, tests, docs, playground, or smoke files.
- `tsconfig.tools.dts.json` projects may depend on libraries/runtime projects, but
  must not depend on tests.
- `tsconfig.test.dts.json` projects are leaves. Playground, smoke, and
  package docs that consume dist through `link:` stay outside the source graph.
- `workspace:*` internal dependencies are source dependencies. Their package
  `exports` must resolve to files owned by the source graph, and importing
  projects must reference the owning declaration leaf.
- If a `workspace:*` dependency must keep artifact-facing package exports for
  compatibility, run `lattice paths generate` and manually place the generated
  config first in the affected `tsconfig*.dts.json` `extends` array. Generated
  paths are a compatibility bridge, not an implicit graph rule.
- `link:`, `catalog:`, and normal semver internal dependencies are artifact
  dependencies. They must not be represented as project references.
- Production lib/runtime/type projects must not depend on tools or tests.
- VitePress `src/client` must not depend on `src/node` or import `node:*`.
- VitePress `src/shared` must not depend on `src/node`, `src/client`, or import
  `node:*`.
- Vue SFC projects remain under `vue-tsc`; native `tsc -b` does not parse
  `.vue` templates.
- `.tsbuild/` is transient graph cache only. Root tools use the root cache;
  workspace/package declaration leaves use owner-local `.tsbuild/` directories.
  These caches must stay ignored and must not be published or committed.
- Every `tsconfig*.dts.json` file must have a paired strict local config.
  For example, `tsconfig.lib.dts.json` pairs with `tsconfig.lib.json`, and
  `tsconfig.dts.json` pairs with `tsconfig.json`.
- Declaration leaves must preserve the paired local config's final file set and
  typecheck compiler options. Only build-mode options such as `composite`,
  `noEmit`, declaration emit, `rootDir`, `outDir`, and `tsBuildInfoFile` may
  differ. `paths` and `baseUrl` are module-resolution policy and are ignored by
  proof.
- `tsconfig.json` is the default TypeScript entry for its directory. Single
  environment directories should use it as the local leaf; multi-environment
  directories should make it a pure aggregator.
- A `tsconfig.json` with `references` must contain only `$schema`, `files: []`,
  and `references`. It must not contain `include`, `compilerOptions`,
  `extends`, `noEmit`, or declaration emit settings.

The `lattice graph check` task enforces missing references, forbidden project
references, forbidden graph imports, source-export ownership for `workspace:*`
dependencies, and forbidden Node builtin imports for client/shared runtime
graph leaves.

## Compatibility Generated Paths

`tsc -b` follows normal TypeScript module resolution. A project reference tells
TypeScript build mode about scheduling and declaration redirection, but it does
not rewrite a dependency package's `exports`. When package A depends on package
B through `workspace:*`, references B, and imports B through its package name,
B's exports must still resolve to source graph files.

If B's workspace manifest exports `dist`, `build`, `lib`, or another artifact
directory, `lattice graph check` fails because A is trying to model B as both a
source dependency and an artifact dependency. The preferred fix is to expose
source entries from B while it is consumed through `workspace:*`. The
compatibility fallback is:

1. Run `pnpm tsconfig:graph:paths` or `lattice paths generate`.
2. Read the command output and add the generated config to the first position
   of each listed `tsconfig*.dts.json` `extends` array.
3. Re-run `lattice graph check` and `tsc -b`.

The generator writes package-local `tsconfig.dts.paths.generated.json` files
only when it sees the noncompliant shape: `workspace:*` dependency, project
reference present, TypeScript resolving through package exports to an artifact,
and a source target that can be inferred from the dependency package exports.
It does not edit declaration configs automatically.

## Naming Policy

- root `tsconfig.build.json` is the default full-check graph aggregator.
- `tsconfig.lib.build.json` is an optional production lib graph aggregator.
- package/domain `tsconfig.build.json` files are package graph aggregators.
- package-local `tsconfig.json` files are source/editor checks and package
  script entrypoints, not native build graph leaves.
- `tsconfig.lib.dts.json` is the canonical production library/runtime build
  leaf.
- `tsconfig.lib.json` is the strict same-name production local check for
  `tsconfig.lib.dts.json`.
- `src/<runtime>/tsconfig.lib.dts.json` is the canonical VitePress
  runtime-specific declaration leaf.
- `src/<runtime>/tsconfig.json` is the strict same-name runtime local check.
- `tsconfig.tools.dts.json` is the canonical tooling/build-config declaration leaf.
- `tsconfig.tools.json` is the strict same-name tooling local check.
- `tsconfig.test.dts.json` is the canonical test declaration leaf.
- `tsconfig.test.json` is the strict same-name test local check.
- `tsconfig.source.json` can still be used by fixture/app local scripts, but
  dist consumer fixtures are not native source-graph declaration leaves.

Declaration-leaf references should point at canonical `tsconfig*.dts.json`
names. Graph aggregators should use canonical `tsconfig*.build.json` names.

VitePress runtime local configs under `packages/vitepress/src/*/tsconfig.json`
stay next to their runtime declaration leaves. Package scripts and
`rolldown-plugin-dts` still consume the local `tsconfig.json` files, while the
native graph references the adjacent `tsconfig.lib.dts.json` files.

## Config Inventory

| Config                                                                                    | Class           | Owner and consumers                                                                |
| ----------------------------------------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------- |
| `tsconfig.json`                                                                           | solution        | Editor-facing solution that points at `tsconfig.build.json`.                       |
| `tsconfig.build.json`                                                                     | solution        | Default full graph check entry for root scripts, packages, and source-owned tests. |
| `tsconfig.lib.build.json`                                                                 | solution        | Production library/runtime declaration graph entry.                                |
| `tsconfig.dts.base.json`                                                                  | build base      | Optional shared build-mode overlay for declaration leaves.                         |
| `scripts/tsconfig.dts.json`                                                               | tools leaf      | Root scripts tooling declaration leaf.                                             |
| `utils/tsconfig.json`                                                                     | local source    | Utils package-local source/editor check.                                           |
| `utils/tsconfig.build.json`                                                               | aggregator      | Utils package graph.                                                               |
| `utils/tsconfig.lib.json`                                                                 | local lib       | Strict same-name local check for the utils lib leaf.                               |
| `utils/tsconfig.lib.dts.json`                                                             | lib leaf        | Utils production source graph.                                                     |
| `utils/tsconfig.tools.json`                                                               | local tools     | Strict same-name local check for the utils tools leaf.                             |
| `utils/tsconfig.tools.dts.json`                                                           | tools leaf      | Utils package tooling graph.                                                       |
| `packages/*/tsconfig.json`                                                                | local source    | Package-local source/editor check and package script entrypoint.                   |
| `packages/*/tsconfig.build.json`                                                          | aggregator      | Package/domain graph entry.                                                        |
| `packages/*/tsconfig.lib.json`                                                            | local lib       | Strict same-name local check for package lib leaves.                               |
| `packages/*/tsconfig.lib.dts.json`                                                        | lib leaf        | Package production source graph.                                                   |
| `packages/*/tsconfig.tools.json`                                                          | local tools     | Strict same-name local check for package tools leaves.                             |
| `packages/*/tsconfig.tools.dts.json`                                                      | tools leaf      | Package tooling/build-config graph.                                                |
| `packages/*/tsconfig.test.dts.json`                                                       | test leaf       | Package test graph.                                                                |
| `packages/vitepress/src/tsconfig.build.json`                                              | lib aggregator  | VitePress production runtime/type graph.                                           |
| `packages/vitepress/tsconfig.test.dts.json`                                               | test leaf       | VitePress package test graph.                                                      |
| `packages/vitepress/src/shared/tsconfig.lib.dts.json`                                     | runtime leaf    | Universal shared runtime graph; no Node ambient types.                             |
| `packages/vitepress/src/node/tsconfig.lib.dts.json`                                       | runtime leaf    | Node runtime graph.                                                                |
| `packages/vitepress/src/client/tsconfig.lib.dts.json`                                     | runtime leaf    | Client runtime graph; no Node ambient types.                                       |
| `packages/vitepress/playground/tsconfig*.json`, `packages/vitepress/smoke/tsconfig*.json` | consumer checks | Dist consumer checks run after package build output exists.                        |
| `tsconfig.vue.build.json`, `packages/vitepress/theme/tsconfig.json`                       | vue-tsc         | Source-owned Vue SFC/template checks outside native `tsc -b`.                      |
| `packages/vitepress/docs/tsconfig.json`                                                   | consumer check  | VitePress docs consume `@docs-islands/vitepress` through `link:../dist`.           |
| `tsconfig.check.json`, `packages/vitepress/tsconfig.check.json`                           | dist checks     | Post-build artifact validation only.                                               |

## Dist Checks

Dist checks validate package artifacts after build output exists. They should
stay explicit post-build commands, such as `packages/vitepress` running
`tsc -p tsconfig.check.json` after `dist/**/*` is present. The source graph
should resolve `workspace:*` imports through source package exports, while
consumer checks intentionally use `link:` or registry-style dependencies.

## Follow-Ups

The graph base intentionally only defines build-mode options such as
`composite`, `incremental`, declaration emit, and `noEmit: false`. It is a
convenience file, not a proof requirement. It does not define source-checking
semantics such as `strict`, `lib`, `types`, or `include`/`exclude`; declaration
leaves inherit those from their paired local config. It also does not define
`rootDir`, `outDir`, or `tsBuildInfoFile`; every declaration leaf owns those
paths.
The legacy `tsconfig.base.json` still defines `rootDir: "."` because existing
local checks and package scripts extend it. Removing that root directory from
the legacy base should be a separate compatibility task after the graph and
legacy checks have proven stable.
