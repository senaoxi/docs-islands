# Checker Entries

Checker entries tell Limina which ordinary source `tsconfig*.json` files belong to each checker. Limina generates the declaration graph, checker build entries, declaration output directories, tsbuildinfo paths, and manifest under `.limina/`.

```js
import { defineConfig } from 'limina';

export default defineConfig({
  config: {
    checkers: {
      typescript: {
        preset: 'tsc',
        include: ['tsconfig.json', 'packages/**/tsconfig*.json'],
        exclude: [
          '**/tsconfig*.dts.json',
          '**/tsconfig*.build.json',
          '**/tsconfig*.base.json',
          '**/tsconfig*.check.json',
        ],
      },
      vue: {
        preset: 'vue-tsc',
        include: ['packages/*/docs/tsconfig.json', 'packages/app/tsconfig.vue.json'],
      },
    },
  },
});
```

## \<name\>

- **Type:** `string` key of `config.checkers` (a `Record<string, CheckerConfig>`)

The `checkers` key is the checker namespace, such as `typescript`, `vue`, or `svelte`. Generated files are scoped by this name under `.limina/tsconfig/checkers/<name>/`, so references never cross checker namespaces.

## preset

- **Type:** `'tsc' | 'tsgo' | 'vue-tsc' | 'vue-tsgo' | 'svelte-check'`

`preset` chooses the parser and checker runner:

- `tsc`: TypeScript and JSON;
- `tsgo`: TypeScript and JSON through `@typescript/native-preview`;
- `vue-tsc`: TypeScript, JSON, and `.vue`;
- `vue-tsgo`: Vue through `vue-tsgo` and `@typescript/native-preview`;
- `svelte-check`: Svelte source coverage and second-class typecheck execution.

Only built-in presets are accepted. Custom presets and custom `extensions` are rejected.

## include

- **Type:** `string[]`
- **Required:** yes

`include` is a non-empty list of workspace-root-relative selectors for ordinary source `tsconfig*.json` files. It must not select generated `.limina` files, source-level `tsconfig*.dts.json`, `tsconfig*.build.json`, base configs, or other reserved TypeScript config files.

During `graph prepare`, Limina expands `include` minus `exclude`, reads each source config, and writes generated declaration leaves under `.limina/tsconfig/checkers/<checker>/projects/...`. The generated leaf extends the source config, forces composite declaration emit options, writes declaration output under `.limina/dts/checkers/<checker>/...`, and records the source mapping in `.limina/manifest.json`. Source `tsconfig.json` solution aggregators are generated under `.limina/tsconfig/checkers/<checker>/solutions/...`.

## exclude

- **Type:** `string[]`
- **Default:** `[]`

`exclude` removes selectors from `include`. Use it to avoid reserved configs and non-source helper configs:

```js
exclude: [
  '**/tsconfig*.dts.json',
  '**/tsconfig*.build.json',
  '**/tsconfig*.base.json',
  '**/tsconfig*.check.json',
];
```

## Removed Fields

`entry`, `routes`, and user-configured `extensions` are rejected. Migrate old entries such as `entry: 'tsconfig.build.json'` to source selectors:

```js
// before
{ preset: 'tsc', entry: 'tsconfig.build.json' }

// after
{
  preset: 'tsc',
  include: ['packages/**/tsconfig*.json'],
  exclude: ['**/tsconfig*.dts.json', '**/tsconfig*.build.json'],
}
```

## Generated Graph

Run `limina graph prepare` to materialize `.limina/manifest.json` and generated checker configs. Graph-consuming commands also prepare the graph automatically before they run.

Source tsconfig paths are the canonical paths in user config and diagnostics. Generated `.limina/tsconfig/checkers/.../*.dts.json` paths are internal compatibility inputs.
