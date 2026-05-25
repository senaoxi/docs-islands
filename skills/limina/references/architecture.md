# Limina Architecture Reference

The mental model Limina expects, and the structural rules it enforces. Read this when a `graph:check` / `proof:check` / `source:check` failure mentions architecture concepts.

## Two layers of validation

Limina separates two independent surfaces:

| Surface            | Validated by                                                                       | Purpose                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Source graph       | `graph:check`, `proof:check`, `source:check`, `checker:build`, `checker:typecheck` | The repository as the author sees it: source files, project references, imports.            |
| Published artifact | `package:check`                                                                    | The package as the consumer installs it: tarball contents, exports, types, runtime imports. |

A green source graph does NOT imply a publishable package. A green package check does NOT imply consistent source.

## Project layout

```
.
├─ pnpm-workspace.yaml
├─ tsconfig.json                # root: IDE/typecheck entry (leaf or pure aggregator)
├─ tsconfig.build.json          # root: graph aggregator (pure)
├─ tsconfig.dts.base.json       # shared declaration emit options
├─ limina.config.mjs
└─ packages/<pkg>/
   ├─ tsconfig.json             # local IDE entry (leaf OR aggregator)
   ├─ tsconfig.build.json       # local graph aggregator
   ├─ tsconfig.lib.json         # typecheck companion for the production env
   ├─ tsconfig.lib.dts.json     # declaration leaf for the production env
   ├─ tsconfig.tools.json       # typecheck companion for build scripts
   ├─ tsconfig.tools.dts.json   # declaration leaf for build scripts
   ├─ tsconfig.test.json        # typecheck companion for tests
   └─ tsconfig.test.dts.json    # declaration leaf for tests
```

## Roles

### Graph aggregator — `tsconfig*.build.json`

Only allowed keys: `$schema`, `files: []`, `references`. Validated by `proof:check` (`addPureAggregatorProblems`).

```jsonc
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "files": [],
  "references": [
    { "path": "./tsconfig.lib.dts.json" },
    { "path": "./tsconfig.tools.dts.json" },
    { "path": "./tsconfig.test.dts.json" },
  ],
}
```

Any extra key (`include`, `compilerOptions`, `extends`, etc.) or a non-empty `files` is an error.

### Declaration leaf — `tsconfig*.dts.json`

Required compilerOptions (final, after `extends` resolution):

| Option                | Required value               |
| --------------------- | ---------------------------- |
| `composite`           | `true`                       |
| `incremental`         | `true`                       |
| `noEmit`              | `false` (NOT `true`)         |
| `declaration`         | `true`                       |
| `emitDeclarationOnly` | `true`                       |
| `rootDir`             | a path (any non-empty value) |
| `outDir`              | a path                       |
| `tsBuildInfoFile`     | a path                       |

Plus direct `references` to other leaves. Optionally `"limina": "<label>"` to opt into a `graph.rules.<label>` deny rule.

The leaf MUST cover the SAME file set as its local companion. `graph:check` flags any file in the leaf that is missing from the companion.

```jsonc
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "limina": "runtime-client",
  "extends": ["./tsconfig.json", "../../tsconfig.dts.base.json"],
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "./.tsbuild",
    "tsBuildInfoFile": "./.tsbuild/lib.tsbuildinfo",
  },
  "references": [{ "path": "../utils/tsconfig.lib.dts.json" }],
}
```

Do NOT redeclare type-affecting options (`strict`, `lib`, `types`, `target`, `module`, `moduleResolution`, etc.) here — they belong in the companion. `proof:check` enforces parity for these and several dozen related options; drift is an error.

### Local companion — `tsconfig*.json` (paired)

Strict typecheck semantics live here. Includes the source files, `extends` from a shared base, sets `strict`, `lib`, `types`, etc.

Pairing rule (derived from the filename):

| Leaf                        | Companion               |
| --------------------------- | ----------------------- |
| `tsconfig.lib.dts.json`     | `tsconfig.lib.json`     |
| `tsconfig.tools.dts.json`   | `tsconfig.tools.json`   |
| `tsconfig.test.dts.json`    | `tsconfig.test.json`    |
| `tsconfig.<scope>.dts.json` | `tsconfig.<scope>.json` |
| `tsconfig.dts.json`         | `tsconfig.json`         |

The companion defines strict local typecheck semantics. Proof check compares it with the declaration leaf, while first-class checker build runs the build graph.

### Default / IDE entry — `tsconfig.json`

Two valid roles, mutually exclusive:

1. **Pure aggregator** (when the directory has multiple ordinary environments) — only `$schema`, `files: []`, `references`. References must point at other ordinary `tsconfig*.json` files, not at `tsconfig*.dts.json` or `tsconfig*.build.json`.
2. **Leaf** (when the directory has only one ordinary environment) — pairs with `tsconfig.dts.json` and is the single local companion.

`proof:check` enforces:

- A directory with only one ordinary `tsconfig*.<scope>.json` should make `tsconfig.json` the leaf (move the scoped config into `tsconfig.json`).
- A directory with multiple ordinary environments MUST have a `tsconfig.json` aggregator with `references`.

## Dependency semantics

Limina derives semantics from the package-manifest specifier on the importing side, not from the import statement.

### `workspace:*` = source dependency

Implications:

- The importing package's declaration leaves MUST express the relationship as a `tsc -b` project reference.
- The source dep's `package.json#exports` SHOULD point at source files (not `dist`).
- The resolved import target must be a file owned by the source graph.

If exports still point at `dist`, two options:

1. Fix the source dep's exports (preferred long-term).
2. Use a generated compatibility paths config (`limina paths generate`).

### `link:`, `file:`, `catalog:`, semver = artifact dependency

Implications:

- The importing leaf MUST NOT express the relationship as a `tsc -b` project reference.
- The dep is consumed as an already-built or already-published artifact.
- Validation focuses on the artifact (`package:check`) rather than the source graph.

## Architecture rules via labels

A declaration leaf opts into one rule by declaring `"limina": "<label-name>"` at the top level of its `tsconfig*.dts.json`. The label is matched against `graph.rules.<label>` in `limina.config.mjs`.

```js
// limina.config.mjs
graph: {
  rules: {
    'runtime-client': {
      deny: {
        refs: [{ path: 'packages/app/src/node/tsconfig.lib.dts.json', reason: 'client must not depend on node runtime' }],
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

Each label can have a single rule. `deny.refs[].path` MUST resolve to a `tsconfig*.dts.json` reachable from a checker entry. `deny.deps[].name` MUST be a package root, a `#imports` specifier (wildcards allowed), or a Node builtin (`node:*` matches all). All other deny-name forms are rejected.

`graph:check` evaluates a labeled leaf's:

- direct `references` (must not include any `deny.refs.path` or a leaf whose package matches `deny.deps`).
- imports inside files owned by the leaf (must not import any denied dep / Node builtin / package-imports specifier).

## What `source:check` adds on top

`source:check` validates package-owner boundaries — independent of label rules:

- A non-aggregator leaf and its companion must keep their file set within ONE nearest-`package.json` owner.
- A relative source import must not cross the nearest package.json owner boundary — use the package name instead.
- A bare package import must be authorized by the importing package's `dependencies` or `devDependencies`. Presence in `peerDependencies` or `optionalDependencies` is NOT authorizing (Limina emits a hint pointing at which section the package was found in).
- A `#xxx` package-import specifier must match the importing package's `package.json#imports` field AND resolve within the same package owner directory.
- Self-package imports (`packageName` === own name) and Node builtins are exempt from authorization.

## What `proof:check` adds on top

`proof:check` validates structural alignment:

- Every dts leaf is reachable from at least one checker entry, AND owned by exactly ONE graph-capable checker entry.
- Every dts leaf has a paired local companion that exists.
- The dts leaf and the companion have identical file sets.
- A curated set of compilerOptions has identical values between the leaf and the companion. Build-only options (`composite`, `outDir`, `tsBuildInfoFile`, etc.) and emit-style options are explicitly excluded from the comparison; everything that affects type semantics is included.
- Every source file in the configured boundary is covered by either a graph project, a checker entry, or an explicit `proof.allowlist` entry.
- Allowlist entries refer to files inside the source boundary AND files not already covered without the allowlist.

## What `graph:check` adds on top

`graph:check` validates the project-reference edges:

- Dts leaf compilerOptions are valid for `tsc -b`.
- Type-affecting compilerOptions parity between leaf and companion (curated subset).
- File set of the leaf is contained in the companion's file set.
- A cross-package dts reference implies a `workspace:*` dep in the importing package's manifest.
- Every source import resolves to either:
  - A file owned by the graph (no further check), OR
  - A workspace package the importing leaf has a project reference to (otherwise: missing reference, unresolved import, or resolved-to-artifact).
- Cross-package relative imports (`../../other-pkg/src/x`) are rejected.
- Label-based deny rules are applied to both references and imported specifiers.

## Checker tiers

`tsc` and `vue-tsc` are first-class checkers: graph/source/proof collect their entries, and `checker:build` runs `tsc -b` / `vue-tsc -b`. `svelte-check` is source-only: Limina proves `.svelte` coverage and `checker:typecheck` runs `svelte-check --tsconfig <entry>`, but Limina does not parse `.svelte` import graphs yet.
