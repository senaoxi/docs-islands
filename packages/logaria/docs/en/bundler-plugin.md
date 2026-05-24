# Bundler Plugin

Use `logaria/plugin` when a bundler should inject runtime logger config and optionally remove statically suppressed log calls during production builds.

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

Installing the plugin makes the default runtime scope controlled. Application code should update the plugin `config` instead of calling `setLoggerConfig()` or `resetLoggerConfig()`.

## Adapters

`loggerPlugin` is built on unplugin and exposes these adapters:

```ts
loggerPlugin.vite(options);
loggerPlugin.rollup(options);
loggerPlugin.rolldown(options);
loggerPlugin.esbuild(options);
loggerPlugin.webpack(options);
loggerPlugin.rspack(options);
loggerPlugin.farm(options);
```

## Options

| Option      | Meaning                                                                                        |
| ----------- | ---------------------------------------------------------------------------------------------- |
| `config`    | Runtime `LoggerConfig` injected into the bundle. Omit it to use the default visibility policy. |
| `treeshake` | Defaults to `false`. Set `true` to enable build-time pruning.                                  |

Tree-shaking only runs in build contexts. Dev and watch mode keep calls in place and rely on runtime filtering.

## Rollup Peer Dependency

Rollup hosts must install `@rollup/plugin-replace` before using `loggerPlugin.rollup(...)`.

The Rollup adapter prepends the replace plugin so Logaria can inline the same control constants that other bundlers inject through their define hooks.

## Tree-Shaking Coverage

Pruning is deliberately conservative. A log call can be removed only when the plugin can prove all of these static facts:

- `createLogger` is imported as a named, unaliased import from `logaria`.
- `main`, `group`, and the message are string literals.
- The logger binding is not reassigned.
- The log call is a standalone expression.
- The plugin is running in a build context with `treeshake: true`.

Supported static shape:

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

These shapes are kept for runtime filtering:

- dynamic `main`, `group`, or message values
- aliased `createLogger` imports
- reassigned logger bindings
- destructured methods
- computed method access
- non-standalone expressions, such as assigning the result of a log call

Runtime filtering remains canonical for every call that stays in the bundle.
