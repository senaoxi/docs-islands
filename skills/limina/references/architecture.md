# Limina Architecture Reference

The mental model Limina expects, and the structural rules it enforces.

## Two Validation Surfaces

Limina separates two independent surfaces:

| Surface            | Validated by                                                                    | Purpose                                                                                     |
| ------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Source graph       | `graph:prepare`, `graph:check`, `proof:check`, `source:check`, checker commands | The repository as authors edit it: source files, ordinary `tsconfig.json` entries, imports. |
| Published artifact | `package:check`, `release:check`                                                | The package as consumers install it: tarball contents, exports, types, runtime imports.     |

A green source graph does not imply a publishable package. A green package check does not imply consistent source.

## Project Layout

Users maintain ordinary source configs and package manifests:

```text
.
├─ pnpm-workspace.yaml
├─ limina.config.mts
├─ tsconfig.json
└─ packages/<pkg>/
   ├─ package.json
   ├─ tsconfig.json              # source entry: leaf or pure solution aggregator
   ├─ tsconfig.lib.json          # optional ordinary source env
   ├─ tsconfig.test.json         # optional ordinary source env
   └─ src/
```

Limina generates checker build/declaration configs under:

```text
.limina/tsconfig/checkers/<checker>/
├─ tsconfig.build.json
├─ solutions/**/tsconfig.build.json
└─ projects/**/tsconfig*.dts.json
```

Generated `.limina` files are internal artifacts. Do not ask users to handwrite generated declaration leaves or generated build aggregators.

## Source Config Roles

### Source Entry: `tsconfig.json`

Manual `config.checkers.<name>.include` may only match ordinary `tsconfig.json` entry files. Auto mode also starts from ordinary `**/tsconfig.json`.

A source entry can be:

1. A leaf with normal `include`/`files` and `compilerOptions`.
2. A pure solution aggregator with `files: []` and `references` to ordinary source `tsconfig*.json` files.

When a directory has multiple ordinary environments, `tsconfig.json` should be the pure solution aggregator. When there is only one environment, `tsconfig.json` should be the leaf.

### Source Leaf: `tsconfig*.json`

Source leaves own typecheck semantics: files, `extends`, `compilerOptions`, `include`, `exclude`, and Limina metadata such as `liminaOptions.graphRules` or `liminaOptions.implicitRefs`.

Source typecheck leaf configs must not hand-maintain `references`. Limina infers static source edges from imports and `liminaOptions.implicitRefs`, then writes the generated declaration references under `.limina`.

### Source Solution Aggregator: `tsconfig.json`

Pure source aggregators are allowed to reference ordinary source configs. They must not point at generated configs, declaration configs, or build configs.

Pure aggregators may only declare `$schema`, `files`, `references`, and allowed Limina metadata. Source inputs and compiler options belong in source leaves.

## Generated Checker Graph

`limina graph prepare` and graph-consuming commands prepare the generated checker graph to:

- Resolve checkers from manual `config.checkers` or auto mode.
- Expand each selected `tsconfig.json` entry through ordinary source references.
- Reject checker `include` patterns that match non-entry `tsconfig.*.json` files directly.
- Generate declaration project configs under `.limina/tsconfig/checkers/<checker>/projects/**`.
- Generate solution build configs under `.limina/tsconfig/checkers/<checker>/solutions/**`.
- Generate root checker build entries under `.limina/tsconfig/checkers/<checker>/tsconfig.build.json`.
- Write a manifest with `sourceToBuild`, `sourceToDts`, `dtsToSource`, Knip routing data, and provider edges.

Same-preset checkers must not govern the same source tsconfig after solution references are expanded. Different presets may overlap when they represent different checker capabilities, but build execution warns about incompatible cache-sharing combinations except for the file-compatible `tsc` + `vue-tsc` combination.

## `liminaOptions`

Limina metadata lives in ordinary source `tsconfig*.json` files.

### `liminaOptions.graphRules`

```jsonc
{
  "liminaOptions": {
    "graphRules": ["runtime-client"],
  },
}
```

The labels are carried to generated declaration configs. `graph:check` evaluates the labeled generated project against `graph.rules.<label>`.

### `liminaOptions.implicitRefs`

```jsonc
{
  "liminaOptions": {
    "implicitRefs": [
      {
        "path": "../runtime/tsconfig.json",
        "reason": "loaded through generated runtime manifest",
      },
    ],
  },
}
```

Use this for dynamic or virtual source edges that static import analysis cannot prove. `path` is relative to the declaring source tsconfig and must point to an existing ordinary source `tsconfig*.json`.

## Dependency Semantics

Limina derives source-vs-artifact semantics from the importing package manifest dependency specifier.

### `workspace:*` Source Dependency

Implications:

- Source imports should resolve to files governed by Limina's source graph.
- The generated checker graph should contain the needed project reference edge.
- If the source manifest exports resolve to `dist`, `graph:check` fails because a source dependency resolved to an artifact.

Fix options:

1. Source dependency: make the source manifest expose source entries.
2. Artifact dependency: use `link:`, `file:`, `catalog:`, or semver and remove the source project-reference relationship.

### `link:`, `file:`, `catalog:`, Semver Artifact Dependency

Implications:

- The dependency is consumed as already-built or already-published output.
- The generated source graph must not keep a source project reference for that relationship.
- Artifact build dependency relationships are available through `limina graph export` for external task tooling.

## Architecture Rules Via Labels

```ts
// limina.config.mts
graph: {
  rules: {
    'runtime-client': {
      deny: {
        refs: [
          {
            path: 'packages/server/tsconfig.runtime.json',
            reason: 'client must not depend on server runtime',
          },
        ],
        deps: [
          { name: 'node:*', reason: 'client must not import Node builtins' },
          { name: '@acme/node-only', reason: 'client must not consume node-only packages' },
          { name: '#server/*', reason: 'client must not use server-only package imports' },
        ],
      },
    },
  },
},
```

`deny.deps[].name` accepts package roots, `#imports` specifiers with optional wildcards, Node builtins, and `node:*`. Relative paths, absolute paths, URLs, file/data specifiers, and package subpaths are rejected.

`graph:check` evaluates both generated project references and imports inside files owned by the generated project.

## What `source:check` Adds

`source:check` validates package-owner boundaries and Knip-backed source usage:

- Every source file has a nearest `package.json` owner.
- Non-aggregator generated/source coverage stays within one nearest package owner.
- Relative source imports do not cross package owner boundaries.
- Bare package imports are authorized by the nearest package manifest.
- `#imports` specifiers match the current package's `imports` field and do not escape to another workspace owner.
- Node builtins and self-package imports are exempt from normal external dependency authorization.
- Knip-backed checks find unused workspace dependencies and unused source modules unless `source.knip` is `false`.
- Tsconfig governance verifies that package-owned source modules map upward to one ordinary `tsconfig.json` owner. Fix the source `tsconfig.json` coverage/reference shape when this fails.

## What `proof:check` Adds

`proof:check` validates source coverage and generated graph alignment:

- Declaration configs are generated under `.limina`; source-level `tsconfig*.dts.json` files are invalid.
- Source leaf configs must not hand-maintain `references`.
- Generated declaration configs and their source configs have matching files.
- Type-affecting compiler options match between generated declaration configs and source configs.
- Pure aggregators have the allowed shape.
- Default `tsconfig.json` aggregators reference only ordinary source typecheck configs.
- Every file inside `config.source` is covered by generated graph coverage, checker entry coverage, or `proof.allowlist`.
- Allowlist entries are valid only for existing files inside the source boundary that are not already covered.

## What `graph:check` Adds

`graph:check` validates generated project-reference edges:

- Generated declaration compiler options are valid for `tsc -b`.
- Generated references match imports and `liminaOptions.implicitRefs`.
- Cross-package generated references imply declared workspace dependencies.
- Workspace source imports resolve to governed source files instead of artifacts.
- Label-based deny and allow rules are applied.
- Configured condition domains keep expected `customConditions`.

## Checker Tiers

`tsc`, `tsgo`, and `vue-tsc` are build-capable checkers. `checker:build` runs `tsc -b`, `tsgo -b`, or `vue-tsc -b` against generated entries or selected generated targets.

`vue-tsgo` is graph-aware for Limina coverage proof but typecheck-only for execution, so `checker:typecheck` runs `vue-tsgo --project <generated entry>`.

`svelte-check` is typecheck-only and has no source graph capability, so `checker:typecheck` runs `svelte-check --tsconfig <generated entry>`.

Prefer `vue-tsc` for first-class Vue project-reference builds. `vue-tsgo --build` does not preserve TypeScript project-reference boundaries or incremental build semantics, so Limina treats it as second-class execution.
