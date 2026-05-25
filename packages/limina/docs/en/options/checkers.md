# Checker Entries

Checker entries are shared by graph, proof, paths, and checker commands.

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
      svelte: {
        preset: 'svelte-check',
        entry: 'tsconfig.svelte.build.json',
      },
    },
  },
});
```

## `<name>`

The `checkers` key is the name of that checker entry, such as `typescript`, `vue`, or `svelte`. It appears in reports and debugging output so you can tell which source family a problem came from.

One workspace can have several checker entries. A plain TypeScript graph can use `typescript`, a Vue app can add `vue`, and a Svelte package can add `svelte`.

## `preset`

`preset` chooses the checker runner Limina invokes:

- `tsc`: TypeScript and JSON;
- `vue-tsc`: `.vue`;
- `svelte-check`: `.svelte`.

Built-in presets can omit `extensions`. Custom presets are currently unsupported by the runner and must not be used as executable checkers.

## `entry`

`entry` is the checker entry config, usually a build graph aggregator such as `tsconfig.build.json` or `tsconfig.vue.build.json`. Graph, proof, paths, and checker commands all derive their scope from these entries.

If the graph under `entry` includes `packages/app/tsconfig.lib.dts.json` and app source imports `@acme/core`, Limina follows this entry and checks whether app references core correctly.

## `extensions`

`extensions` declares the file suffixes covered by the checker. Built-in presets usually do not need it; add it only when an entry must cover extra suffixes.

After configuring a `vue` checker, a `.vue` source file is handled by that checker:

```vue
<!-- packages/app/src/App.vue -->
<script setup lang="ts">
const count: number = '1';
</script>
```

`limina checker typecheck` uses `vue-tsc` for Vue files under that entry instead of relying only on plain `tsc`. Without a checker entry for Vue source, `proof check` is also more likely to reveal that those files are not covered by any checker.

In a fuller example, the directory usually looks like this:

```text
packages/app/
  tsconfig.vue.build.json
  tsconfig.vue.dts.json
  tsconfig.vue.json
  src/App.vue
```

The module is a Vue single-file component:

```vue
<!-- packages/app/src/App.vue -->
<script setup lang="ts">
const count: number = '1';
</script>
```

When `pnpm exec limina checker typecheck` runs, Limina starts from `config.checkers.vue.entry`, finds reachable declaration leaves, maps them to local companions, and runs `vue-tsc` in no-emit mode.

The result is that this type error is reported by `vue-tsc`. The user can tell that `.vue` files are not accidentally covered by plain `tsc`; they enter Limina through a dedicated checker entry.
