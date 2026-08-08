# Checker Configuration

`config.checkers` decides which build checker owns each source `tsconfig.json` and, optionally, which discovered Astro or Svelte checks remain enabled. Checker names are fixed identities:

| Key            | Role                 | Declaration owner |
| -------------- | -------------------- | ----------------- |
| `tsc`          | build checker        | yes               |
| `tsgo`         | build checker        | yes               |
| `vue-tsc`      | build checker        | yes               |
| `svelte-check` | supplemental checker | no                |
| `astro`        | supplemental checker | no                |

The key is the checker identity. There is no `preset` field and no custom checker alias. This keeps ownership, generated paths, execution, and cache behavior under one name.

When `config.checkers` is omitted, Limina uses auto mode. Use an explicit object when different parts of a workspace must be built by `tsc`, `tsgo`, and `vue-tsc`.

```js
import { defineConfig } from 'limina';

export default defineConfig({
  config: {
    checkers: {
      tsc: {
        include: ['packages/shared/tsconfig.json'],
      },
      tsgo: {
        include: ['packages/native/**/tsconfig.json'],
      },
      'vue-tsc': {
        include: ['apps/web/tsconfig.json'],
      },
      'svelte-check': {
        include: ['apps/**/tsconfig.json'],
        exclude: ['apps/legacy/tsconfig.json'],
      },
    },
  },
});
```

An explicit configuration must contain at least one build checker. Every `include` must be a non-empty array; `exclude` is optional. Auto fields cannot be mixed with fixed checker keys.

## Auto mode

- **Type:** `{ mode: 'auto'; exclude?: string[]; useTsgo?: boolean }`
- **Default:** used when `config.checkers` is omitted

By default, auto mode routes ordinary TypeScript scopes to `tsc` and Vue scopes to `vue-tsc`:

```text
ordinary TypeScript -> tsc
Vue                 -> vue-tsc
```

Set `useTsgo: true` to route ordinary TypeScript scopes to `tsgo` instead. Vue remains on `vue-tsc`.

```js
export default defineConfig({
  config: {
    checkers: {
      mode: 'auto',
      useTsgo: true,
      exclude: ['packages/playground/tsconfig.json'],
    },
  },
});
```

`useTsgo` changes only the initial owner for ordinary TypeScript. If a TypeScript consumer depends on a Vue scope, fixed-point promotion can still move that consumer to `vue-tsc`. A Vue consumer that depends on a `tsgo` provider does not move the provider back to `tsc`; Limina preserves ownership and reports the cache limitation before build targets start.

Vue capability is confirmed from the checker-resolved file set, not from `vueCompilerOptions` alone. Limina first traverses entries, solutions, referenced leaves, and effective `extends`, then asks the Vue parser for its actual extensions and files. A custom Vue extension is routed to `vue-tsc` only when a matching file exists. A configuration hint without a matching module does not change ownership.

Auto `exclude` filters entry selection inside activated [regions](./regions.md). It does not prune valid project references reached from a selected entry and is separate from `config.source.exclude`.

## Explicit build ownership

The build checker scopes use the same shape:

```ts
interface CheckerScope {
  include: string[];
  exclude?: string[];
}
```

`include` selects direct `tsconfig.json` entries relative to `config.rootDir`. Selectors can use `../` for external activated packages, but cannot pull an unactivated path or a path behind a workspace boundary into the graph. `exclude` removes direct entries after inclusion. It does not cut the normal project-reference closure.

Limina assigns ownership in two stages:

1. It calculates direct ownership from each build checker's `include` and `exclude`.
2. It expands TypeScript project references.

The same source config cannot directly match multiple build checkers. During reference expansion, an explicitly owned config keeps its owner: the referring checker stops inheriting at that boundary, the reference relationship remains, and Limina creates a cross-checker dependency edge. An unassigned referenced config inherits the referring checker's owner. If different checker paths try to inherit the same unassigned config, graph preparation fails and asks you to assign it explicitly.

This makes gradual migration possible. For example, a `vue-tsc` app can reference a shared project explicitly owned by `tsc`; the shared project is built by `tsc` and is not also owned by `vue-tsc`.

Non-entry configs such as `tsconfig.lib.json` or `tsconfig.test.json` enter the managed graph only when selected `tsconfig.json` entries reference them. Generated files stay under Limina's `.limina` namespace; source config paths remain the paths used in user configuration and diagnostics.

## Supplemental Astro and Svelte policy

Astro and Svelte capability comes only from actual `.astro` and `.svelte` modules. The `astro` and `svelte-check` keys filter capabilities that Limina already discovered; they cannot create a target, take declaration ownership, or participate in project-reference traversal.

- If a supplemental key is omitted, every discovered target for that family is enabled.
- If it is present, `include` and `exclude` filter targets by source-config path.
- Matching a config with no corresponding module creates no target.
- A source config may have both Astro and Svelte targets.

The primary build checker owns the complete source set for governance, but its declaration projection contains only files its parser can compile. `tsc` and `tsgo` project TypeScript, JavaScript, declarations, JSON, and relative `types` inputs supported by their parser. `vue-tsc` additionally projects `.vue` and configured Vue extensions. `.astro` and `.svelte` never enter Limina's declaration build.

When `checker:typecheck` has no actual framework target, it is recorded as `disabled`, exits successfully, and does not run peer preflight or materialize generated checker artifacts.

### Framework prerequisites

Framework commands and parser packages resolve from the leaf package that owns the source config:

- Astro requires `astro`, `@astrojs/check`, and `typescript`, plus the leaf's generated `.astro/types.d.ts`. Limina runs `astro check --noSync --root <leaf> --tsconfig <source-config>` and never runs `astro sync`.
- Svelte requires `svelte-check`, `svelte`, and `typescript`. Limina runs `svelte-check --workspace <leaf> --tsconfig <source-config>` without SvelteKit sync, incremental mode, a `.svelte-check` cache, or an output-format override.

Astro import analysis also resolves `@astrojs/compiler` from the leaf; Svelte import analysis resolves `svelte/compiler`. Missing dependencies fail preflight before checker processes start.

`checker typecheck` is a full rerun, not framework watch mode. Stable target IDs preserve target identity between runs but do not provide incremental invalidation.

## Vue import parsing

- **Type:** `config.imports.vue?: 'heuristic' | 'compiler-sfc'`
- **Default:** `'heuristic'`

Limina extracts imports from Vue SFC `<script>` and `<script setup>` blocks when building the source graph. The default heuristic parser needs no additional package. To parse these blocks through Vue's compiler, use:

```js
export default defineConfig({
  config: {
    imports: {
      vue: 'compiler-sfc',
    },
  },
});
```

This mode requires `@vue/compiler-sfc` in the workspace running Limina. A missing compiler package fails preflight before checker processes start.

## Cross-checker dependencies and cache reuse

Limina distinguishes declaration dependencies from framework scheduling dependencies:

- `declaration-provider` means a real compiler declaration relationship and can become a generated TypeScript project reference.
- `framework-schedule` orders framework checks or builds but never becomes a generated `tsconfig` reference.

Providers run before consumers. Pure framework-scheduling cycles run as one scheduling component; declaration cycles still fail.

Cache reuse is directional:

| Consumer                      | Provider           | Cache reuse |
| ----------------------------- | ------------------ | ----------- |
| same checker identity         | same identity      | yes         |
| `vue-tsc`                     | `tsc`              | yes         |
| any other cross-identity pair | different identity | no          |

When the consumer can compile the provider's complete declaration closure, Limina preserves the reference. If cache reuse is unavailable, it warns before the first build target starts because the underlying tools may rebuild work or churn their caches. When the consumer cannot compile the provider closure, graph preparation fails. For example, a `tsc` or `tsgo` consumer cannot depend on a provider closure containing `.vue` or a custom Vue extension.

## Migrating from named aliases and `preset`

Move each old entry to the key named by its `preset`, then delete `preset`:

```js
// before
checkers: {
  typescript: {
    preset: 'tsgo',
    include: ['packages/**/tsconfig.json'],
  },
  vue: {
    preset: 'vue-tsc',
    include: ['apps/web/tsconfig.json'],
  },
}

// after
checkers: {
  tsgo: {
    include: ['packages/**/tsconfig.json'],
  },
  'vue-tsc': {
    include: ['apps/web/tsconfig.json'],
  },
}
```

If multiple aliases previously used the same `preset`, merge their non-overlapping selectors into one fixed key. If their selectors overlap or their policies conflict, resolve that conflict explicitly; Limina will not guess which alias should win. Configuration files are TypeScript/MTS, so Limina reports a deterministic schema diagnostic but does not rewrite them automatically.

## Generated graph and manifest

Run `limina graph prepare` to materialize `.limina/manifest.json` and generated checker configs. Managed build/typecheck commands and pipelines materialize them when needed; read-only graph, source, and proof checks calculate the graph in memory.

The current manifest is version 4 and stores stable, sorted `dependencyEdges`. Manifest versions 1 through 3 are accepted only as old owned-artifact ledgers for safe cleanup before a fresh current manifest is written. Future or malformed versions fail closed.
