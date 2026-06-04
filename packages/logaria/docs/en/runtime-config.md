# Runtime Config

Runtime configuration controls **which calls actually print** once code reaches the logger. It is the canonical source of truth — even when the [bundler plugin](./bundler-plugin.md) prunes statically suppressed calls, every call that survives the prune still passes through this gate.

This page covers:

- The default visibility policy when nothing is configured.
- How to use `levels` and `debug` to widen or narrow output.
- How to reset the default scope.
- How a bundler-controlled runtime changes ownership.

If you want to filter by `main`, `group`, or message instead of just by level, see [Rules & Presets](./rules-and-presets.md).

## Default Visibility

If you do not call `setLoggerConfig()` and do not install `loggerPlugin`, Logaria falls back to:

```ts
{
  levels: ['info', 'success', 'warn', 'error'];
}
```

`debug` calls are hidden by default. Every other level prints.

## Levels

Use `levels` to set the **allowlist** for non-debug log methods:

```ts
import { setLoggerConfig } from 'logaria';

setLoggerConfig({
  levels: ['warn', 'error'],
});
```

Supported visibility levels:

| Level     | Logger method      |
| --------- | ------------------ |
| `error`   | `logger.error()`   |
| `warn`    | `logger.warn()`    |
| `info`    | `logger.info()`    |
| `success` | `logger.success()` |

::: tip Why `debug` is not in `levels`
`debug` is intentionally separate. It is controlled by the `debug` flag, not the level list, because it is meant for diagnostic-only output that should be opt-in even when info-level logs are on.
:::

## Debug Mode

In simple configs (no resolved rules), `debug: true` does two things:

1. **Reveals `logger.debug()` calls** that would otherwise be hidden.
2. **Appends elapsed metadata** to visible non-debug logs when an elapsed option is provided.

```ts
setLoggerConfig({
  debug: true,
  levels: ['info', 'success', 'warn', 'error'],
});
```

In **rule mode**, `debug: true` behaves differently: `logger.debug()` is always suppressed, and the flag only adds matching rule labels and elapsed time to the non-debug logs that rules let through. See [Core Concepts — Debug across the two modes](./concepts.md#debug-across-the-two-modes) for the full comparison.

## Resetting Config

Use `resetLoggerConfig()` to clear the default scope in direct, non-plugin usage:

```ts
import { resetLoggerConfig } from 'logaria';

resetLoggerConfig();
```

After reset, the next default-scope logger access falls back to the built-in default config above.

::: warning Tests
If you call `setLoggerConfig` from a test, pair it with `resetLoggerConfig` in `afterEach` so the next test starts from the same baseline.
:::

## Controlled Runtime

When a bundler installs [`loggerPlugin`](./bundler-plugin.md), the default scope becomes **controlled** by injected build constants. In that runtime:

- `setLoggerConfig()` throws.
- `resetLoggerConfig()` throws.

This is intentional. It prevents the runtime config and the build-time pruning policy from drifting apart — if they could drift, you'd end up with logs the runtime allows but the bundle no longer contains, or vice versa.

To change visibility under plugin control, update the plugin `config` option instead:

```ts
import { loggerPlugin } from 'logaria/plugin';

export default {
  plugins: [
    loggerPlugin.vite({
      config: {
        levels: ['warn', 'error'],
      },
    }),
  ],
};
```

The thrown error names exactly the plugin entry you need to edit, so you can find it quickly in CI logs.

## Interactive Behavior

The demo below uses the real `logaria` package and lets you swap profiles to see how runtime config affects what prints.

<script setup>
import LoggerRuntimeDemo from '../.vitepress/theme/components/LoggerRuntimeDemo.vue'
</script>

<LoggerRuntimeDemo locale="en" />
