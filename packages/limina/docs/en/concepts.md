# Core Concepts

Limina uses TypeScript concepts, but the model is small. The important idea is to keep "what the source imports", "what TypeScript builds", and "what packages publish" aligned.

## Checker Entry

A checker entry is the root config Limina starts from.

```js
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

For TypeScript, this is usually a build graph aggregator. It points to declaration projects through `references`. Limina walks that graph to discover what should be checked.

For framework files, a checker entry can use `vue-tsc` or `svelte-check`. These checkers cover files that normal `tsc` does not understand by itself.

## Declaration Leaf

A declaration leaf is a `tsconfig*.dts.json` project. It is the part of the graph that can be consumed by `tsc -b`.

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

The declaration leaf owns graph structure. It says which other declaration leaves this project references.

## Local Companion

Every declaration leaf should have a local companion for normal typechecking:

```text
tsconfig.lib.dts.json    <->    tsconfig.lib.json
tsconfig.tools.dts.json  <->    tsconfig.tools.json
tsconfig.test.dts.json   <->    tsconfig.test.json
```

The companion owns strict typecheck semantics such as `strict`, `lib`, `types`, `jsx`, and framework settings. `limina checker typecheck` runs these companions with `--noEmit`.

This split keeps build output settings out of the ordinary typecheck config.

## Aggregator Config

An aggregator is a tsconfig with only `files: []` and `references`. It groups other projects and does not own source files.

Limina expects build graph configs such as `tsconfig.build.json` to be pure aggregators. If a default `tsconfig.json` has `references`, Limina expects it to be a pure IDE/typecheck aggregator too.

## Source Dependency

A dependency declared with `workspace:*` is a source dependency. It means this workspace package should be represented by project references and source-facing resolution.

If TypeScript resolves a `workspace:*` import to `dist`, Limina reports it. You can fix that by exposing source entries, removing the source graph edge, or generating explicit compatibility paths.

## Artifact Dependency

A dependency declared with `link:`, `file:`, `catalog:`, or normal semver is treated as an artifact dependency. It usually should not be modeled as a source project reference.

Artifact dependencies are checked at the package-output layer, not by pretending their source belongs to the current graph.

## Labels and Rules

A declaration leaf can opt into a graph rule with a `limina` label:

```jsonc
{
  "limina": "runtime-client",
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
