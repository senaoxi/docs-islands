# Checker Entries

Checker entries tell Limina which source `tsconfig.json` entry files belong to each checker. When `config.checkers` is omitted, Limina uses auto mode: it discovers ordinary `tsconfig.json` source scopes, chooses `tsc` or `vue-tsc` from the files each scope contains, and promotes TypeScript scopes that depend on Vue scopes so setup can pass without hand-written routing.

Use an explicit checker object when you need `tsgo`, second-class checkers, smaller Vue coverage, or migration-specific include / exclude rules. Limina starts from those entries, follows their solution references, and then generates the declaration graph, checker build entries, declaration output directories, tsbuildinfo paths, and manifest under `.limina/`.

```js
import { defineConfig } from 'limina';

export default defineConfig({
  config: {
    // Optional. Omit this field or set checkers: 'auto' for quick setup.
    checkers: {
      typescript: {
        preset: 'tsc',
        include: ['tsconfig.json', 'packages/**/tsconfig.json'],
        exclude: ['**/docs/**'],
      },
      vue: {
        preset: 'vue-tsc',
        include: ['packages/*/docs/tsconfig.json', 'packages/app/tsconfig.json'],
      },
    },
  },
});
```

## auto

- **Type:** `'auto'`
- **Default:** used when `config.checkers` is omitted

Auto mode treats every ordinary `tsconfig.json` as a source scope. A scope with only TypeScript, JavaScript, and JSON files is routed to `tsc`. A scope containing `.vue` files is routed to `vue-tsc`. Solution-style `tsconfig.json` files are still accepted for compatibility; Limina classifies them from the referenced source leaves.

If a TypeScript scope imports a Vue scope, auto mode promotes the TypeScript scope to `vue-tsc`. Promotion repeats through dependency chains, so generated checker output avoids `tsc` consumers depending on `vue-tsc` providers.

Auto mode only chooses between `tsc` and `vue-tsc`. Switch to an explicit checker object when you need another preset or a tighter split.

## \<name\>

- **Type:** `string` key of `config.checkers` (a `Record<string, CheckerConfig>`)

The `checkers` key is the checker namespace, such as `typescript`, `vue`, or `svelte`. Generated files are scoped by this name under `.limina/tsconfig/checkers/<name>/`, so diagnostics can always say which checker produced or reached a config.

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

`include` is a non-empty list of workspace-root-relative selectors for source entry files named exactly `tsconfig.json`. It must not select `tsconfig.lib.json`, `tsconfig.test.json`, `tsconfig.build.json`, generated `.limina` files, base configs, check configs, or other reserved TypeScript config files.

During `graph prepare`, Limina expands `include` minus `exclude` to get the checker entry set. Each entry must belong to only one checker. From there, Limina follows TypeScript `references` on solution-style `tsconfig.json` files and brings the referenced source configs into governance.

Non-entry configs such as `tsconfig.lib.json`, `tsconfig.test.json`, or `tsconfig.tools.json` are therefore useful, but they are not selected directly by `checker.include`. They become managed only when a selected `tsconfig.json` entry references them. A standalone base, build-only, or helper config that is not reachable from an entry is inert for Limina.

For every managed source config, Limina writes generated declaration leaves under `.limina/tsconfig/checkers/<checker>/projects/...`. The generated leaf extends the source config, forces composite declaration emit options, writes declaration output under `.limina/dts/checkers/<checker>/...`, and records the source mapping in `.limina/manifest.json`. Source `tsconfig.json` solution aggregators are generated under `.limina/tsconfig/checkers/<checker>/solutions/...`.

## Entry Uniqueness and Capability Coverage

After `include` and `exclude` are applied, checker entry sets must not overlap. The same `tsconfig.json` entry cannot be listed under both `typescript` and `vue`, even if the presets are different. Choose one checker as the entry owner.

This does not mean a referenced source config can only have one capability. Once entries expand through `references`, different presets may cover the same source config. This is how a repository can add Vue capability to a source config that also participates in a TypeScript graph. The duplicate case Limina rejects is narrower: two checkers with the same preset must not govern the same expanded source config.

Limina also checks file capability after expansion. If a source config includes `.vue` files but is only covered by `tsc` or `tsgo`, graph preparation fails and points to a checker preset that can handle that extension. Add a matching checker entry that reaches the config, or move those files to a config owned by the right checker.

## Cross-Checker Reachability

Source imports may cross checker boundaries. For example, a TypeScript-only entry may import a provider that is governed through a Vue checker entry. Limina records that provider relationship so build-capable checkers can run providers before consumers.

When build-capable presets with different cache behavior can reach the same generated declaration config, Limina prints a warning after the build:

```text
Potentially incompatible build checker combination:
  generated config: ...
  source config: packages/core/tsconfig.lib.json
  reachable from:
    - config.checkers.typescript (tsgo)
      entry tsconfigs:
        - packages/app/tsconfig.json
    - config.checkers.vue (vue-tsc)
      entry tsconfigs:
        - packages/theme/tsconfig.json
```

Read `reachable from` as the migration map. It tells you which checker and which entry `tsconfig.json` can reach the same generated config. To remove the warning, make that reachable area use cache-compatible build presets. Same-preset combinations are fine, and `tsc` with `vue-tsc` is treated as compatible. Combinations such as `tsgo` with `tsc` or `tsgo` with `vue-tsc` are warned because they do not safely share the same underlying build cache semantics.

## exclude

- **Type:** `string[]`
- **Default:** `[]`

`exclude` removes entry selectors from `include`. Use it to keep entry ownership clear:

```js
exclude: ['**/docs/**', 'packages/legacy/tsconfig.json'];
```

## Removed Fields

`entry`, `routes`, and user-configured `extensions` are rejected. Migrate old entries such as `entry: 'tsconfig.build.json'` to source selectors:

```js
// before
{ preset: 'tsc', entry: 'tsconfig.build.json' }

// after
{
  preset: 'tsc',
  include: ['packages/**/tsconfig.json'],
  exclude: ['**/docs/**'],
}
```

## Generated Graph

Run `limina graph prepare` to materialize `.limina/manifest.json` and generated checker configs. Graph-consuming commands also prepare the graph automatically before they run.

Source tsconfig paths are the canonical paths in user config and diagnostics. Generated `.limina/tsconfig/checkers/.../*.dts.json` paths are internal compatibility inputs.
