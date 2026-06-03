# Rules & Presets

`levels` is a useful first knob — but real projects often need finer control. You want to see API timeouts in production but not regular info chatter. You want HMR logs from the build subsystem but not the rest of `dev.*`. Rules and presets are how Logaria expresses that.

Rules switch Logaria from a broad level filter to a **focused allowlist**: once at least one rule resolves, a log must match a rule, and that rule must allow the log level. Unmatched logs do **not** fall back to the root `levels`.

## Quick Example

```ts
import { setLoggerConfig } from 'logaria';

setLoggerConfig({
  debug: true,
  levels: ['warn', 'error'],
  rules: {
    'custom:metrics': {
      main: '@acme/docs',
      group: 'userland.metrics',
      message: '*timeout*',
      levels: ['info', 'warn'],
    },
  },
});
```

The map key (`custom:metrics`) is the rule label. In debug mode, visible rule-based logs include the matching label so you can see which rule let them through.

::: info Rule mode vs. level mode
A config with no resolved rules is **level mode** — `levels` is the only filter.
A config with at least one resolved rule is **rule mode** — `levels` becomes the default for rules that say `'inherit'`, unmatched logs are dropped, and `logger.debug()` is always suppressed (even with `debug: true`). See [Runtime Config — Debug Mode](./runtime-config.md#debug-mode).
:::

## Rule Fields

| Field     | Meaning                                                                 |
| --------- | ----------------------------------------------------------------------- |
| map key   | Required unique label.                                                  |
| `main`    | Exact package or subsystem match.                                       |
| `group`   | Exact match by default, or glob match when glob characters are present. |
| `message` | Exact match by default, or glob match when glob characters are present. |
| `levels`  | Required. Use explicit levels or `'inherit'` to inherit root `levels`.  |

`group` and `message` upgrade to glob matching automatically when the string contains glob syntax — `*`, `?`, `[a-z]`, or `{a,b}`.

::: tip Pick exact when you can
Exact matches are faster and easier to reason about. Use globs when you genuinely need to span multiple groups (`api.*`) or messages (`*timeout*`).
:::

## Preset Plugins

Preset plugins are how packages and frameworks ship **reusable rule templates** with optional named configs. Registering a preset does not enable anything by itself — you enable preset behavior through `extends` or `rules` references.

```ts
import type { LoggerPresetPlugin } from 'logaria/types';
import { setLoggerConfig } from 'logaria';

const viteLoggingPlugin = {
  rules: {
    build: {
      main: '@acme/vite',
      group: 'build.pipeline',
    },
    hmr: {
      main: '@acme/vite',
      group: 'dev.hmr',
    },
  },
  configs: {
    recommended: {
      rules: {
        build: { levels: 'inherit' },
        hmr: { levels: 'inherit' },
      },
    },
  },
} satisfies LoggerPresetPlugin;

setLoggerConfig({
  plugins: {
    vite: viteLoggingPlugin,
  },
  extends: ['vite/recommended'],
  rules: {
    'vite/hmr': {
      levels: ['warn', 'error'],
      message: '*slow*',
    },
    'custom:api-timeout': {
      group: 'api.*',
      message: '*timeout*',
      levels: ['warn'],
    },
  },
});
```

What this config does, end to end:

1. Registers the `vite` preset's `build` and `hmr` rule templates.
2. Enables them via `extends: ['vite/recommended']`.
3. Overrides `vite/hmr` to surface only `warn`/`error` messages that look slow.
4. Adds a project-owned `custom:api-timeout` rule for API timeouts.

## Precedence

Config resolves in this order:

1. **`plugins`** registers preset rule templates.
2. **`extends`** imports plugin-provided configs.
3. **`rules`** applies the final override layer.

Preset rule settings support:

| Setting | Meaning                                                                   |
| ------- | ------------------------------------------------------------------------- |
| `'off'` | Removes the preset rule during resolution — it produces no resolved rule. |
| object  | Enables and tunes the rule (see the override scope below).                |

How much an object override may change depends on how the preset rule was activated:

- **Activated via `extends`, then overridden in `rules`** — you may tune only `message` and `levels`. The template's `main` and `group` are locked; changing either throws `The user rule cannot override "<plugin>/<rule>" plugin rule's main and group fields.`. A preset author owns _what_ a rule targets; consumers decide only _how loud_ it is.
- **Referenced directly in `rules` (not in `extends`)** — the object may override any template field: `main`, `group`, `message`, and `levels`.

Either way, `levels` is required on an object setting — use an explicit array or `'inherit'`.

Use custom labels such as `custom:api-timeout` for project-owned rules that aren't tied to a preset plugin. The `namespace/name` form (e.g. `vite/hmr`) is reserved for references to a registered preset plugin.

## Naming Patterns

A few conventions that have worked well in practice:

- **Preset namespace**: lowercase, short, one word (`vite`, `nuxt`, `acme`).
- **Preset rule names**: lowercase, short, dot-free (`build`, `hmr`, `metrics`).
- **Custom labels**: prefix with `custom:` or your team's namespace so they don't collide with future presets.

## What to Read Next

- [Runtime Config](./runtime-config.md) — how `levels` and `debug` interact with rules.
- [Bundler Plugin](./bundler-plugin.md) — how rules are honoured by static pruning.
- [API Reference](./api-reference.md#logaria-types) — the `LoggerPresetPlugin` type used to author presets.
