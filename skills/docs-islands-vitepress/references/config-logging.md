# Logging Configuration

Use this when controlling package-owned logs or adding logs inside modules handled by the managed VitePress graph.

## Minimal Internal Log Filtering

```ts
import { createDocsIslands } from '@docs-islands/vitepress';
import { react } from '@docs-islands/vitepress/adapters/react';
import { vitepress as vitepressLogger } from '@docs-islands/vitepress/logger/presets';

const islands = createDocsIslands({
  adapters: [react()],
  logging: {
    levels: ['warn', 'error'],
    plugins: { vitepress: vitepressLogger },
    extends: ['vitepress/hmr'],
    rules: {
      'vitepress/markdownUpdate': 'off',
    },
  },
});
```

`logging` is a top-level `createDocsIslands()` option. Do not put `logLevel` or `logGroups` under `siteDevtools`.

## Root Options

| Option      | Meaning                                                                                                  |
| ----------- | -------------------------------------------------------------------------------------------------------- |
| `debug`     | Enables diagnostic labels and elapsed-time suffixes; also allows debug logs when no rules are configured |
| `levels`    | Root visible levels, used directly or by rules with `levels: 'inherit'`                                  |
| `plugins`   | Preset plugin registry, e.g. `{ vitepress: vitepressLogger }`                                            |
| `extends`   | Imports preset configs such as `vitepress/runtime`                                                       |
| `rules`     | Final object map keyed by preset references or custom labels; values are `'off'` or objects with levels  |
| `treeshake` | Controls managed logger build-time pruning; defaults to `false`; set `true` to opt in                    |

Visible levels are `error`, `warn`, `info`, and `success`. `debug` output is controlled by the `debug` gate.

## Preset Rule Form

```ts
import { vitepress as vitepressLogger } from '@docs-islands/vitepress/logger/presets';

const logging = {
  debug: true,
  levels: ['warn'],
  plugins: { vitepress: vitepressLogger },
  extends: ['vitepress/hmr', 'vitepress/runtime'],
  rules: {
    'vitepress/viteAfterUpdate': {
      levels: ['warn', 'error'],
    },
    'vitepress/reactDevRender': {
      levels: ['warn', 'error'],
    },
    'vitepress/renderValidation': 'off',
  },
};
```

`plugins` only registers preset templates. `extends` imports a preset config. Rule objects enable or override rules and must declare `levels`; use `levels: 'inherit'` to inherit root levels. `'off'` deletes a rule from the resolved config.

The built-in preset export is `vitepress`; its configs include `recommended`, `build`, `config`, `hmr`, `parser`, `plugin`, `resolver`, `runtime`, `siteDevtools`, and `transform`.

## Custom Rule Form

```ts
const logging = {
  debug: true,
  rules: {
    'custom:userland-metrics': {
      main: '@acme/custom-docs',
      group: 'userland.metrics',
      levels: ['info'],
    },
  },
};
```

Custom rules support `main`, `group`, `message`, and required `levels`. The map key is the label, and public rule objects do not accept `label`. `main` is exact-match. `group` and `message` support exact strings or glob patterns.

## Logger Facade

Use `@docs-islands/vitepress/logger` only inside modules processed by the VitePress Vite graph controlled by `createDocsIslands()`.

```ts
import { createLogger } from '@docs-islands/vitepress/logger';

const logger = createLogger({
  main: '@acme/custom-docs',
}).getLoggerByGroup('userland.metrics');

logger.info('visible userland info');
```

Do not call the VitePress logger facade from `.vitepress/config.ts` or standalone Node scripts. Use `logaria` for framework-agnostic direct logger usage.

## Production Tree Shaking

The managed VitePress build installs logger tree-shaking for statically analyzable `@docs-islands/vitepress/logger` calls. Best coverage requires string-literal `main`, string-literal `getLoggerByGroup(...)`, and standalone literal log calls such as `logger.info('message')`.
