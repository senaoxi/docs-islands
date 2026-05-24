# API Reference

This page lists every public entry point Logaria exports. It follows the source exports exactly — no aspirational shapes, no aliases — so it stays accurate as the package evolves.

For tutorials and usage patterns, see the [Getting Started](./getting-started.md) and topic guides. This page is the spec.

## `logaria`

The root entry. Use this in applications, scripts, and packages that own the default scope.

```ts
import { createLogger, resetLoggerConfig, setLoggerConfig } from 'logaria';
```

| API                 | Signature                               | Notes                                                                                                 |
| ------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `createLogger`      | `(options: { main: string }) => Logger` | Creates or reuses a main logger in the default scope. Call `.getLoggerByGroup(group)` before logging. |
| `setLoggerConfig`   | `(config: LoggerConfig) => void`        | Sets the default runtime config for direct non-plugin usage. Throws in plugin-controlled runtimes.    |
| `resetLoggerConfig` | `() => void`                            | Clears the default runtime config for direct non-plugin usage. Throws in plugin-controlled runtimes.  |

The root entry does **not** export `resolveLoggerConfig`; import that from [`logaria/core`](#logaria-core).

## Logger Objects

Loggers returned by `createLogger` and `createScopedLogger` expose the same surface:

```ts
const logger = createLogger({ main: '@acme/docs' }).getLoggerByGroup('build');

logger.info('message');
logger.success('message');
logger.warn('message');
logger.error('message');
logger.debug('message');
```

`info`, `success`, `warn`, and `error` accept an optional elapsed log option:

```ts
logger.info('finished', { elapsedTimeMs: 12.34 });
```

`debug` accepts only the message — diagnostic output stays cheap.

## `logaria/helper`

Stateless helpers for elapsed timing and error formatting. No runtime config.

```ts
import { createElapsedTimer, formatDebugMessage, formatErrorMessage } from 'logaria/helper';
```

| API                  | Signature                                  | Notes                                                                   |
| -------------------- | ------------------------------------------ | ----------------------------------------------------------------------- |
| `createElapsedTimer` | `() => () => { elapsedTimeMs: number }`    | Creates a timer function suitable for logger elapsed options.           |
| `formatDebugMessage` | `(options: DebugMessageOptions) => string` | Formats structured debug context, decision, summary, and timing fields. |
| `formatErrorMessage` | `(error: unknown) => string`               | Converts unknown thrown values into readable strings.                   |

`createElapsedLogOptions` and `formatElapsedTime` are internal module exports and are **not** part of the `logaria/helper` package entry.

## `logaria/plugin`

The universal bundler adapter and supporting constants.

```ts
import { loggerPlugin, transformLoggerTreeShaking } from 'logaria/plugin';
```

| API                               | Notes                                                                                                            |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `loggerPlugin`                    | Universal unplugin adapter with `.vite`, `.rollup`, `.rolldown`, `.esbuild`, `.webpack`, `.rspack`, and `.farm`. |
| `transformLoggerTreeShaking`      | Direct transform helper used by tests and advanced tooling.                                                      |
| `DEFAULT_LOGGER_MODULE_ID`        | The public logger module id used by the transform.                                                               |
| `LOGGER_TREE_SHAKING_PLUGIN_NAME` | The transform plugin name.                                                                                       |

Most applications need only `loggerPlugin`. See [Bundler Plugin](./bundler-plugin.md) for usage.

### `LoggerPluginOptions`

```ts
interface LoggerPluginOptions {
  config?: LoggerConfig | null;
  treeshake?: boolean;
}
```

| Field       | Default | Meaning                                                                          |
| ----------- | ------- | -------------------------------------------------------------------------------- |
| `config`    | `null`  | Runtime `LoggerConfig` injected into the bundle. Omit to use the default policy. |
| `treeshake` | `false` | Set `true` to enable build-time pruning. No effect in dev or watch mode.         |

## `logaria/core`

Scoped APIs for host integrations and tooling.

```ts
import {
  createScopedLogger,
  getScopedLoggerConfig,
  resetScopedLoggerConfig,
  resolveLoggerConfig,
  setScopedLoggerConfig,
  shouldSuppressLog,
} from 'logaria/core';
```

| API                       | Signature                                                | Notes                                                      |
| ------------------------- | -------------------------------------------------------- | ---------------------------------------------------------- |
| `createScopedLogger`      | `(options: { main: string }, scopeId: string) => Logger` | Creates or reuses a logger in a registered explicit scope. |
| `getScopedLoggerConfig`   | `(scopeId: string) => LoggerConfig \| undefined`         | Reads the raw config for a registered scope.               |
| `setScopedLoggerConfig`   | `(scopeId: string, config: LoggerConfig) => void`        | Registers or updates an explicit scope.                    |
| `resetScopedLoggerConfig` | `(scopeId: string) => void`                              | Removes scope config.                                      |
| `shouldSuppressLog`       | `(kind, context, scopeId?) => boolean`                   | Returns whether a log should be hidden.                    |
| `resolveLoggerConfig`     | `(config: LoggerConfig) => NormalizedLoggerConfig`       | Normalizes and validates public config for host packages.  |

See [Scoped Integrations](./scoped-integrations.md) for usage patterns.

## `logaria/core/helper`

```ts
import { DEFAULT_LOGGER_SCOPE_ID, createLoggerScopeId } from 'logaria/core/helper';
```

| API                       | Notes                                                          |
| ------------------------- | -------------------------------------------------------------- |
| `DEFAULT_LOGGER_SCOPE_ID` | Internal default scope id exposed for host integrations.       |
| `createLoggerScopeId`     | Creates a unique scope id string for explicit scope ownership. |

## `logaria/types`

Public TypeScript types — use these when authoring presets, accepting user config, or extending Logaria.

```ts
import type {
  LoggerConfig,
  LoggerPresetPlugin,
  LoggerVisibilityLevel,
  LogKind,
} from 'logaria/types';
```

The `types` entry exposes public runtime config, rule, logger, plugin, and transform result types for TypeScript consumers. Notable exports:

| Type                      | Use case                                                                    |
| ------------------------- | --------------------------------------------------------------------------- |
| `LoggerConfig`            | The shape accepted by `setLoggerConfig`, `loggerPlugin`, and scoped APIs.   |
| `LoggerPresetPlugin`      | Preset author entry point — see [Rules & Presets](./rules-and-presets.md).  |
| `LoggerVisibilityLevel`   | Union of allowed level strings: `'error' \| 'warn' \| 'info' \| 'success'`. |
| `LogKind`                 | Union of all log kinds: visibility levels plus `'debug'`.                   |
| `DebugMessageOptions`     | Argument shape for `formatDebugMessage`.                                    |
| `Logger` / `ScopedLogger` | Logger object shapes returned by `createLogger` / `.getLoggerByGroup`.      |
