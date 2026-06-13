# Core Concepts

Limina uses TypeScript concepts, but the model is small. The important idea is to keep "what the source imports", "what TypeScript builds", and "what packages publish" aligned.

## Checker Entry

A [checker entry](./config/checkers.md) selects ordinary source `tsconfig*.json` files for one checker namespace.

```js
export default defineConfig({
  config: {
    checkers: {
      typescript: {
        preset: 'tsc',
        include: ['packages/**/tsconfig*.json'],
        exclude: ['**/tsconfig*.dts.json', '**/tsconfig*.build.json'],
      },
    },
  },
});
```

For TypeScript, this is usually a set of source config selectors. Limina expands `include` minus `exclude`, then generates the checker-scoped declaration graph under `.limina/`.

For framework files, a checker entry can use `vue-tsc`, `vue-tsgo`, or `svelte-check`. These checkers cover files that normal `tsc` does not understand by itself.

Any source family you want Limina to govern needs a checker entry in `limina.config.mjs`. Plain TypeScript packages usually use a `typescript` checker with source tsconfig globs; Vue or Svelte projects add their framework checker entries. Graph, proof, source, and checker commands all start from the generated manifest built from these entries.

## Generated Declaration Leaf

A generated declaration leaf is a `.limina/tsconfig/checkers/<checker>/.../*.dts.json` project. It is the part of the graph consumed by `tsc -b` or `vue-tsc -b`.

It should emit declarations only, with build-mode options such as:

```jsonc
{
  "compilerOptions": {
    "composite": true,
    "incremental": true,
    "noEmit": false,
    "declaration": true,
    "emitDeclarationOnly": true,
    "rootDir": "src",
    "outDir": "./.tsbuild",
    "tsBuildInfoFile": "./.tsbuild/lib.tsbuildinfo",
  },
}
```

The generated leaf owns graph structure. It extends the source config, forces declaration emit, records `liminaOptions.sourceConfig`, and references other generated leaves inferred from source imports.

When a package, or one environment inside a package, belongs in the checker graph, include its source tsconfig. For example, selecting `packages/core/tsconfig.lib.json` lets Limina generate the declaration boundary for `@acme/core`. When `@acme/app` imports `@acme/core`, Limina can verify and generate the corresponding declaration reference.

## Source Config

The source config is the canonical user-facing config:

```text
packages/core/tsconfig.lib.json
packages/core/tsconfig.tools.json
packages/core/tsconfig.test.json
```

The source config owns strict typecheck semantics such as `strict`, `lib`, `types`, `jsx`, and framework settings. Proof check verifies generated coverage, while checker build runs generated entries through `tsc -b`, `tsgo -b`, or `vue-tsc -b`.

::: warning
Current `vue-tsgo` support is second-class for execution because its build mode does not preserve TypeScript project-reference boundaries or provide incremental build semantics; selected source tsconfigs still participate in Limina graph/proof coverage.
:::

This split keeps generated declaration output settings out of the ordinary source config.

## Aggregator Config

An aggregator is a tsconfig with only `files: []` and `references`. It groups other projects and does not own source files.

Limina still expects default `tsconfig.json` files with `references` to be pure IDE/typecheck aggregators.

If a source config only groups several source projects, keep it as an aggregator. Generated build aggregators live under `.limina/` and are recreated by `limina graph prepare`.

## Source Dependency

A dependency declared with `workspace:*` links another package from the same workspace. A package can expose some public entries as source and other public entries as built artifacts.

Limina pre-resolves every public `exports` subpath for workspace packages that declare `exports`. TypeScript resolution must find a stable type entry: `.d.ts` family declarations, source files such as `.ts` / `.tsx` / `.mts` / `.cts`, `.json`, or checker-supported source extensions such as `.vue`. If TypeScript only reaches runtime JavaScript, or if TypeScript or Oxc cannot resolve an export, graph checking reports the package export.

When `@acme/app` imports a public entry of `@acme/core`, graph references are required only when that resolved entry is owned by a generated declaration project. Built declaration artifacts such as `dist/*.d.ts` are already output, so they do not require a project reference. Nx checks cover the complementary case: if app actually imports a `workspace:*` entry that resolves into core's artifact directory, app's `project.json` should depend on core's build target.

## Artifact Dependency

A dependency declared with `link:`, `file:`, `catalog:`, or normal semver is treated as an artifact dependency. It usually should not be modeled as a source project reference.

Artifact dependencies are checked at the package-output layer, not by pretending their source belongs to the current graph.

If a package only wants to consume another package the way an outside user would, treat it as an artifact dependency. For example, a tooling package might use the published output of `@acme/core` through normal semver instead of joining core's source build graph. The source graph stays smaller, and output problems are handled by `limina package check`.

## Labels and Rules

A declaration leaf can opt into one or more [graph rules](./config/graph-rules.md) with `liminaOptions.graphRules`:

```jsonc
{
  "liminaOptions": {
    "graphRules": ["runtime-client"],
  },
}
```

The matching `graph.rules.runtime-client` entry can deny references or dependencies:

```js
export default defineConfig({
  graph: {
    rules: {
      'runtime-client': {
        deny: {
          deps: [
            {
              name: 'node:*',
              reason: 'browser runtime must not import Node builtins',
            },
          ],
        },
      },
    },
  },
});
```

Use labels for boundaries that matter to the architecture: browser vs Node, public API vs internal tools, production vs tests, or package-specific rules.

When a group of source files has a real boundary, put one or more graph rule labels on the matching `tsconfig*.dts.json` and define those rules in `limina.config.mjs`. For example, a browser runtime leaf can declare `"graphRules": ["runtime-client"]` under `liminaOptions` while the rule denies `node:*` and `@acme/internal-node`. The boundary no longer depends on convention alone; an import of `node:fs` from the browser project fails Graph check with the rule's reason.
