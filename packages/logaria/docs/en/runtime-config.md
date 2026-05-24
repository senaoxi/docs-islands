# Runtime Config

Runtime configuration controls which calls are printed after the code reaches the logger. Build-time pruning is optional; runtime filtering remains the canonical behavior for every call that stays in the bundle.

## Default Visibility

If you do not call `setLoggerConfig()` and do not install `loggerPlugin`, Logaria uses the default visibility policy:

```ts
{
  levels: ['info', 'success', 'warn', 'error'];
}
```

`debug` calls are hidden by default.

## Levels

Use `levels` to allow non-debug log methods:

```ts
import { setLoggerConfig } from 'logaria';

setLoggerConfig({
  levels: ['warn', 'error'],
});
```

Supported visibility levels are:

| Level     | Logger method      |
| --------- | ------------------ |
| `error`   | `logger.error()`   |
| `warn`    | `logger.warn()`    |
| `info`    | `logger.info()`    |
| `success` | `logger.success()` |

`debug` is not part of `levels`. It is controlled by `debug: true`.

## Debug Mode

In simple configs without resolved rules, `debug: true` reveals `logger.debug()` calls and appends elapsed metadata to visible non-debug logs when provided:

```ts
setLoggerConfig({
  debug: true,
  levels: ['info', 'success', 'warn', 'error'],
});
```

In rule mode, debug output also includes rule labels for visible rule-based logs.

## Resetting Config

Use `resetLoggerConfig()` to clear the default scope in direct, non-plugin usage:

```ts
import { resetLoggerConfig } from 'logaria';

resetLoggerConfig();
```

After reset, the next default-scope logger access falls back to the built-in default config.

## Controlled Runtime

When a bundler installs `loggerPlugin`, the default scope becomes controlled by injected constants. In that runtime, application code must not call `setLoggerConfig()` or `resetLoggerConfig()`; both throw to prevent the injected runtime policy and build-time pruning policy from drifting apart.

Update the plugin `config` option instead:

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

## Interactive Behavior

<script setup>
import LoggerRuntimeDemo from '../.vitepress/theme/components/LoggerRuntimeDemo.vue'
</script>

<LoggerRuntimeDemo locale="en" />
