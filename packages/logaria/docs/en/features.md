# Features

This page tours what Logaria gives you, each with the smallest example that shows it. For the model underneath, see [Core Concepts](./concepts.md); for the full reference, see the Deep Dive pages.

## A tiny runtime API

Create a logger for a package (`main`), narrow it to an area (`group`), then log. Every logger exposes five methods: `info`, `success`, `warn`, `error`, and `debug`.

```ts
import { createLogger } from 'logaria';

const logger = createLogger({ main: '@acme/docs' }).getLoggerByGroup('build.pipeline');

logger.info('build started');
logger.success('build finished');
```

::: info
`debug` is special: it is hidden unless you opt in, and it never prints once rules are active. See [Debug across the two modes](./concepts.md#debug-across-the-two-modes).
:::

See [Getting Started](./getting-started.md#your-first-logger) and the [API Reference](./api-reference.md#logaria) for details.

## Level filtering

In **level mode** (no rules configured), `levels` is the allowlist for the four non-debug methods. A method whose level is not listed is dropped.

- **Default:** `['info', 'success', 'warn', 'error']`

```ts
import { setLoggerConfig } from 'logaria';

// Only warnings and errors print.
setLoggerConfig({ levels: ['warn', 'error'] });
```

::: tip
`debug` is not part of `levels` — it is controlled by the separate `debug` flag below.
:::

See [Runtime Config — Levels](./runtime-config.md#levels) for details.

## Debug mode

`debug: true` does two things **in level mode**: it reveals `logger.debug()` output, and it appends elapsed time to visible non-debug logs that pass an elapsed option.

```ts
import { createLogger, setLoggerConfig } from 'logaria';
import { createElapsedTimer } from 'logaria/helper';

setLoggerConfig({ debug: true, levels: ['info', 'success', 'warn', 'error'] });

const logger = createLogger({ main: '@acme/docs' }).getLoggerByGroup('build');
const elapsed = createElapsedTimer();
logger.success('done', elapsed()); // appends elapsed time to the line
```

::: warning Debug behaves differently once rules exist
In **rule mode** (any rule resolved), `logger.debug()` is **always suppressed**, even with `debug: true`. There, `debug: true` only adds `[label]` prefixes and elapsed time to visible non-debug logs — it never reveals `debug()`.
:::

See [Core Concepts — Debug across the two modes](./concepts.md#debug-across-the-two-modes).

## Elapsed time and formatting helpers

The `logaria/helper` entry holds small, config-free utilities: `createElapsedTimer()` for timing, `formatErrorMessage()` to turn any thrown value into a string, and `formatDebugMessage()` for structured debug lines.

```ts
import { createElapsedTimer, formatErrorMessage } from 'logaria/helper';

const elapsed = createElapsedTimer();
try {
  await build();
  logger.success('build finished', elapsed());
} catch (error) {
  logger.error(`build failed: ${formatErrorMessage(error)}`, elapsed());
}
```

::: info
The elapsed value only shows when `debug` is on (level mode) or a contributing rule matches (rule mode).
:::

See the [API Reference](./api-reference.md#logaria-helper).

## Rule mode: a focused allowlist

Add `rules` and Logaria switches from a broad level filter to a **focused allowlist**: a log must match a rule, and that rule must allow its level. Unmatched logs are dropped — they do **not** fall back to `levels`. `rules` is an object map keyed by label.

```ts
setLoggerConfig({
  levels: ['error'],
  rules: {
    'build-flow': {
      main: '@acme/docs',
      group: 'build.pipeline',
      levels: ['info', 'warn'],
    },
  },
});
```

::: warning
Once any rule resolves you are in rule mode. A rule set that is too narrow silences everything else — there is no fallback to `levels`.
:::

See [Rules & Presets](./rules-and-presets.md).

## Glob matching for group and message

`group` and `message` match exactly by default, and upgrade to glob matching automatically when the value contains glob syntax (`*`, `?`, `[a-z]`, `{a,b}`). `main` is always an exact match, even if it contains glob characters.

```ts
setLoggerConfig({
  levels: ['warn'],
  rules: {
    'api-timeouts': {
      group: 'api.*',
      message: '*timeout*',
      levels: ['warn'],
    },
  },
});
```

::: tip
Prefer exact matches — they are faster and easier to reason about. Reach for globs only when you genuinely need to span multiple groups or messages.
:::

See [Rules & Presets — Rule Fields](./rules-and-presets.md#rule-fields).

## Composable presets

Packages and frameworks can ship reusable rule templates as a `LoggerPresetPlugin`. Register one under `plugins`, activate a named config via `extends`, then override per project in `rules`. Setting a rule to `'off'` deletes it.

```ts
setLoggerConfig({
  plugins: { vite: viteLoggingPlugin },
  extends: ['vite/recommended'],
  rules: {
    'vite/hmr': { levels: ['warn', 'error'], message: '*slow*' },
  },
});
```

::: warning Preset templates are partly frozen
A rule activated via `extends` may override only `message` and `levels`. Setting `main` or `group` throws:

```
The user rule cannot override "<plugin>/<rule>" plugin rule's main and group fields.
```

:::

See [Rules & Presets — Preset Plugins](./rules-and-presets.md#preset-plugins).

## Build-time pruning, across every major bundler

The `logaria/plugin` entry injects your runtime config as build constants and — with `treeshake: true` — deletes log calls it can prove are suppressed. One unplugin object exposes seven adapters: `.vite`, `.rollup`, `.rolldown`, `.esbuild`, `.webpack`, `.rspack`, and `.farm`.

- **Default:** `treeshake: false` (build mode only; no effect in dev/watch)

```ts
// vite.config.ts
import { loggerPlugin } from 'logaria/plugin';

export default {
  plugins: [
    loggerPlugin.vite({
      config: { levels: ['warn', 'error'] },
      treeshake: true,
    }),
  ],
};
```

::: warning Installing the plugin takes ownership
Under the plugin, the default scope is **controlled**: `setLoggerConfig` / `resetLoggerConfig` throw at runtime. Change visibility through the plugin's `config` option instead.
:::

::: info Pruning is deliberately conservative
A call is removed only when everything is static: a named, unaliased `createLogger` import, literal `main`/`group`/message, a binding that is never reassigned, and a standalone statement. Anything dynamic stays and falls back to runtime filtering.
:::

See [Bundler Plugin](./bundler-plugin.md) and [Core Concepts — Runtime canonical, build-time pruning](./concepts.md#runtime-canonical-build-time-pruning).

## Scoped integrations

Framework and tooling authors can register their own isolated logger scope through [`logaria/core`](./scoped-integrations.md), with its own config that never mutates the application-owned default scope — which is what makes Logaria safe to depend on from a library.

See [Scoped Integrations](./scoped-integrations.md).

## Try it live

The demo below imports the real `logaria` package. Pick a profile — default, quiet, debug, or rule mode — and run it to see the captured console output.

<script setup>
import LoggerRuntimeDemo from '../.vitepress/theme/components/LoggerRuntimeDemo.vue'
</script>

<LoggerRuntimeDemo locale="en" />
