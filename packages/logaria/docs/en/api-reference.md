# API Reference

This reference lists the public entrypoints exported by the current `logaria` package. It intentionally follows source exports, not older README examples.

## `logaria`

```ts
import { createLogger, resetLoggerConfig, setLoggerConfig } from 'logaria';
```

| API                 | Signature                               | Notes                                                                                                 |
| ------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `createLogger`      | `(options: { main: string }) => Logger` | Creates or reuses a main logger in the default scope. Call `.getLoggerByGroup(group)` before logging. |
| `setLoggerConfig`   | `(config: LoggerConfig) => void`        | Sets the default runtime config for direct non-plugin usage. Throws in plugin-controlled runtimes.    |
| `resetLoggerConfig` | `() => void`                            | Clears the default runtime config for direct non-plugin usage. Throws in plugin-controlled runtimes.  |

The root entry does not export `resolveLoggerConfig`; import that from `logaria/core`.

## Logger Objects

```ts
const logger = createLogger({ main: '@acme/docs' }).getLoggerByGroup('build');

logger.info('message');
logger.success('message');
logger.warn('message');
logger.error('message');
logger.debug('message');
```

`info`, `success`, `warn`, and `error` accept optional elapsed log options:

```ts
logger.info('finished', { elapsedTimeMs: 12.34 });
```

`debug` accepts only the message.

## `logaria/helper`

```ts
import { createElapsedTimer, formatDebugMessage, formatErrorMessage } from 'logaria/helper';
```

| API                  | Signature                                  | Notes                                                                   |
| -------------------- | ------------------------------------------ | ----------------------------------------------------------------------- |
| `createElapsedTimer` | `() => () => { elapsedTimeMs: number }`    | Creates a timer function suitable for logger elapsed options.           |
| `formatDebugMessage` | `(options: DebugMessageOptions) => string` | Formats structured debug context, decision, summary, and timing fields. |
| `formatErrorMessage` | `(error: unknown) => string`               | Converts unknown thrown values into readable strings.                   |

`createElapsedLogOptions` and `formatElapsedTime` are internal module exports and are not part of the `logaria/helper` package entry.

## `logaria/plugin`

```ts
import { loggerPlugin, transformLoggerTreeShaking } from 'logaria/plugin';
```

| API                               | Notes                                                                                                            |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `loggerPlugin`                    | Universal unplugin adapter with `.vite`, `.rollup`, `.rolldown`, `.esbuild`, `.webpack`, `.rspack`, and `.farm`. |
| `transformLoggerTreeShaking`      | Direct transform helper used by tests and advanced tooling.                                                      |
| `DEFAULT_LOGGER_MODULE_ID`        | The public logger module id used by the transform.                                                               |
| `LOGGER_TREE_SHAKING_PLUGIN_NAME` | The transform plugin name.                                                                                       |

Most applications should use only `loggerPlugin`.

## `logaria/core`

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

## `logaria/core/helper`

```ts
import { DEFAULT_LOGGER_SCOPE_ID, createLoggerScopeId } from 'logaria/core/helper';
```

| API                       | Notes                                                          |
| ------------------------- | -------------------------------------------------------------- |
| `DEFAULT_LOGGER_SCOPE_ID` | Internal default scope id exposed for host integrations.       |
| `createLoggerScopeId`     | Creates a unique scope id string for explicit scope ownership. |

## `logaria/types`

```ts
import type {
  LoggerConfig,
  LoggerPresetPlugin,
  LoggerVisibilityLevel,
  LogKind,
} from 'logaria/types';
```

The `types` entry exposes public runtime config, rule, logger, plugin, and transform result types for TypeScript consumers.
