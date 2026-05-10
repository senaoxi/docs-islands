# Logging Configuration

Use this when controlling package-owned logs or adding logs inside modules handled by the managed VitePress graph.

## Minimal Internal Log Filtering

```ts
import { createDocsIslands } from '@docs-islands/vitepress';
import { react } from '@docs-islands/vitepress/adapters/react';
import { hmr } from '@docs-islands/vitepress/logger/presets';

const islands = createDocsIslands({
  adapters: [react()],
  logging: {
    levels: ['warn', 'error'],
    plugins: { hmr },
    rules: {
      'hmr/markdownUpdate': 'off',
      'hmr/viteAfterUpdate': {},
    },
  },
});
```

`logging` is a top-level `createDocsIslands()` option. Do not put `logLevel` or `logGroups` under `siteDevtools`.

## Root Options

| Option    | Meaning                                                                                                  |
| --------- | -------------------------------------------------------------------------------------------------------- |
| `debug`   | Enables diagnostic labels and elapsed-time suffixes; also allows debug logs when no rules are configured |
| `levels`  | Root visible levels, used directly or as rule fallback                                                   |
| `plugins` | Preset plugin registry, e.g. `{ hmr, runtime }`                                                          |
| `rules`   | Either object-form preset rules or array-form direct rules                                               |

Visible levels are `error`, `warn`, `info`, and `success`. `debug` output is controlled by the `debug` gate.

## Preset Rule Form

```ts
import { hmr, runtime } from '@docs-islands/vitepress/logger/presets';

const logging = {
  debug: true,
  levels: ['warn'],
  plugins: { hmr, runtime },
  rules: {
    'hmr/viteAfterUpdate': {},
    'runtime/reactDevRender': {
      levels: ['warn', 'error'],
    },
    'runtime/renderValidation': 'off',
  },
};
```

`{}` enables a preset rule with its default matcher. `'off'` is equivalent to `{ enabled: false }`. Preset overrides can set only `enabled`, `message`, and `levels`.

Built-in preset exports include `build`, `config`, `hmr`, `parser`, `plugin`, `resolver`, `runtime`, `siteDevtools`, and `transform`.

## Direct Rule Form

```ts
const logging = {
  debug: true,
  rules: [
    {
      label: 'userland-metrics',
      main: '@acme/custom-docs',
      group: 'userland.metrics',
      levels: ['info'],
    },
  ],
};
```

Direct rules support `label`, `enabled`, `main`, `group`, `message`, and `levels`. `main` is exact-match. `group` and `message` support exact strings or glob patterns.

## Logger Facade

Use `@docs-islands/vitepress/logger` only inside modules processed by the VitePress Vite graph controlled by `createDocsIslands()`.

```ts
import { createLogger } from '@docs-islands/vitepress/logger';

const logger = createLogger({
  main: '@acme/custom-docs',
}).getLoggerByGroup('userland.metrics');

logger.info('visible userland info');
```

Do not call the VitePress logger facade from `.vitepress/config.ts` or standalone Node scripts. Use `@docs-islands/logger` for framework-agnostic direct logger usage.

## Production Tree Shaking

The managed VitePress build installs logger tree-shaking for statically analyzable `@docs-islands/vitepress/logger` calls. Best coverage requires string-literal `main`, string-literal `getLoggerByGroup(...)`, and standalone literal log calls such as `logger.info('message')`.
