# Bundler Plugin

Use `logaria/plugin` when a bundler should:

1. **Inject runtime logger config** as compile-time constants, taking ownership of the default scope.
2. **Optionally prune statically suppressed log calls** during production builds.

The plugin is built on [unplugin](https://github.com/unjs/unplugin), so a single import gives you adapters for every major bundler in the ecosystem.

::: warning Ownership change
Installing the plugin makes the default runtime scope **controlled**. Application code must update the plugin `config` option instead of calling `setLoggerConfig()` or `resetLoggerConfig()`; both throw under plugin control. See [Runtime Config — Controlled Runtime](./runtime-config.md#controlled-runtime).
:::

## Vite Example

```ts
import { defineConfig } from 'vite';
import { loggerPlugin } from 'logaria/plugin';

export default defineConfig({
  plugins: [
    loggerPlugin.vite({
      config: {
        levels: ['warn', 'error'],
      },
      treeshake: true,
    }),
  ],
});
```

## Adapters

`loggerPlugin` exposes one adapter per bundler:

::: code-group

```ts [Vite]
import { loggerPlugin } from 'logaria/plugin';

loggerPlugin.vite({ config, treeshake });
```

```ts [Rollup]
import { loggerPlugin } from 'logaria/plugin';

loggerPlugin.rollup({ config, treeshake });
```

```ts [Rolldown]
import { loggerPlugin } from 'logaria/plugin';

loggerPlugin.rolldown({ config, treeshake });
```

```ts [esbuild]
import { loggerPlugin } from 'logaria/plugin';

loggerPlugin.esbuild({ config, treeshake });
```

```ts [webpack]
import { loggerPlugin } from 'logaria/plugin';

loggerPlugin.webpack({ config, treeshake });
```

```ts [Rspack]
import { loggerPlugin } from 'logaria/plugin';

loggerPlugin.rspack({ config, treeshake });
```

```ts [Farm]
import { loggerPlugin } from 'logaria/plugin';

loggerPlugin.farm({ config, treeshake });
```

:::

All adapters share the same options and behave identically — the runtime semantics do not change between bundlers.

## Options

| Option      | Meaning                                                                                          |
| ----------- | ------------------------------------------------------------------------------------------------ |
| `config`    | Runtime `LoggerConfig` injected into the bundle. Omit to use the default visibility policy.      |
| `treeshake` | Defaults to `false`. Set `true` to enable build-time pruning of statically suppressed log calls. |

::: tip Dev vs build
Tree-shaking only runs in **build** contexts. In dev and watch mode, calls stay in place and runtime filtering is the only gate. This keeps source maps clean and HMR fast.
:::

## Rollup Peer Dependency

Rollup hosts must install `@rollup/plugin-replace` before using `loggerPlugin.rollup(...)`:

```sh
pnpm add -D @rollup/plugin-replace
```

The Rollup adapter prepends `@rollup/plugin-replace` so Logaria can inline the same control constants that other bundlers inject through their native `define` hooks. Other adapters do **not** need this peer dependency.

## Tree-Shaking Coverage

Pruning is **deliberately conservative**. A log call can be removed only when the plugin can prove **all** of these static facts:

- `createLogger` is imported as a named, unaliased import from `logaria`.
- `main`, `group`, and the log message are string literals.
- The logger binding is not reassigned.
- The log call is a standalone expression.
- The plugin is running in a build context with `treeshake: true`.

### Supported Static Shape

```ts
import { createLogger } from 'logaria';

const logger = createLogger({
  main: '@acme/docs',
}).getLoggerByGroup('userland.metrics');

logger.info('static metric ready');
logger.warn('static metric delayed');
logger.error('static metric failed');
logger.success('static metric uploaded');
logger.debug('static metric details');
```

### Shapes That Stay (Falls Back to Runtime)

The plugin keeps any call shape that it cannot statically verify. Runtime filtering remains canonical for these:

- Dynamic `main`, `group`, or message values.
- Aliased `createLogger` imports (`import { createLogger as cl } from 'logaria'`).
- Reassigned logger bindings.
- Destructured methods (`const { info } = logger`).
- Computed method access (`logger['info']`).
- Non-standalone expressions, such as assigning the result of a log call.

::: info Why conservative
A missed removal costs you a few bytes. A wrong removal costs you a missing log on a real incident. Logaria trades the second risk away on purpose. See [Project Philosophy — Conservative by Default](./philosophy.md#conservative-by-default).
:::

## What to Read Next

- [Runtime Config](./runtime-config.md) — the gate every surviving call still passes through.
- [Rules & Presets](./rules-and-presets.md) — match by `main`, `group`, message.
- [Troubleshooting](./troubleshooting.md) — common reasons calls don't get pruned.
