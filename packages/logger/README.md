# @docs-islands/logger

<p align="center">
  <a href="https://npmjs.com/package/@docs-islands/logger"><img src="https://img.shields.io/npm/v/@docs-islands/logger.svg" alt="npm package"></a>
  <a href="https://nodejs.org/en/about/previous-releases"><img src="https://img.shields.io/node/v/@docs-islands/logger.svg" alt="node compatibility"></a>
  <a href="https://github.com/XiSenao/docs-islands/actions/workflows/ci.yml"><img src="https://github.com/XiSenao/docs-islands/actions/workflows/ci.yml/badge.svg?branch=main" alt="build status"></a>
  <a href="https://github.com/XiSenao/docs-islands/blob/main/packages/logger/LICENSE.md"><img src="https://img.shields.io/npm/l/@docs-islands/logger.svg" alt="license"></a>
</p>

English | [简体中文](./README.zh-CN.md)

Framework-agnostic runtime logging and build-time pruning for docs-islands packages and userland tooling. It gives Node.js and browser code one small logging API, a predictable runtime visibility policy, and an optional bundler plugin that removes statically suppressed log calls from production output.

## Features

- **Tiny public runtime API**: import `createLogger`, `setLoggerConfig`, and `resetLoggerConfig` from `@docs-islands/logger`.
- **Node.js and browser output**: uses colored terminal output when available and styled browser console output in web runtimes.
- **Scoped log groups**: organize messages by package `main` and lowercase dot-namespace groups such as `build.pipeline`.
- **Configurable visibility**: allow `error`, `warn`, `info`, and `success` globally or by focused rules.
- **Debug diagnostics**: enable debug output for simple configs, and add rule labels plus elapsed timing metadata to visible rule-based logs.
- **Production pruning**: `loggerPlugin` removes supported static log calls that the resolved config suppresses.
- **Scoped integration API**: host packages can create explicit logger scopes without mutating the root runtime policy.
- **Bundler coverage through unplugin**: supports Vite, Rollup, Rolldown, esbuild, webpack, Rspack, and Farm.
- **TypeScript first**: ships ESM and TypeScript declarations through package exports.

## Installation

```sh
pnpm add @docs-islands/logger
```

```sh
npm install @docs-islands/logger
```

```sh
yarn add @docs-islands/logger
```

```sh
bun add @docs-islands/logger
```

Requirements:

- Node.js `^20.19.0 || >=22.12.0`
- ESM-compatible runtime or bundler
- Optional peer packages for the bundler plugin you use, for example `@rollup/plugin-replace` with Rollup and `rolldown` with Rolldown

## Quick Start

```ts
import { createLogger, setLoggerConfig } from '@docs-islands/logger';
import { createElapsedTimer, formatErrorMessage } from '@docs-islands/logger/helper';

setLoggerConfig({
  debug: true,
  levels: ['info', 'warn', 'error'],
});

const logger = createLogger({
  main: '@acme/docs',
}).getLoggerByGroup('build.pipeline');

logger.info('build started');
const elapsed = createElapsedTimer();
try {
  await build();
  logger.success('build finished', elapsed());
} catch (error) {
  logger.error(`build failed: ${formatErrorMessage(error)}`, elapsed());
  throw error;
}
logger.warn('cache is cold');
logger.debug('debug details');
```

`createLogger({ main })` identifies the package or subsystem that owns the log stream. `getLoggerByGroup(group)` identifies a narrower area inside that stream. Group names must use lowercase dot namespaces without package identifiers, for example `runtime.react` or `build.pipeline`.

If you use the runtime without `loggerPlugin` or an explicit `setLoggerConfig(...)` call, the package falls back to its default visibility.

## Configuration Ownership

`@docs-islands/logger` has a default scope behind the root entry and explicit scopes for host integrations. Decide who owns configuration before creating loggers:

| Scenario                                             | Entry                                                     | Config owner                                                                                                                      |
| ---------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Direct app, script, or standalone tool               | `@docs-islands/logger`                                    | The application calls `setLoggerConfig(...)` and `resetLoggerConfig()` on the default scope.                                      |
| Bundler-controlled runtime                           | `@docs-islands/logger` plus `@docs-islands/logger/plugin` | The bundler plugin injects the default scope config. Application calls to `setLoggerConfig(...)` and `resetLoggerConfig()` throw. |
| Host or framework integration with private ownership | `@docs-islands/logger/core`                               | The host creates an explicit scope and calls `setScopedLoggerConfig(scopeId, config)` before `createScopedLogger(...)`.           |

Reusable libraries should not call `setLoggerConfig(...)` or `resetLoggerConfig()` at module initialization. The default scope belongs to the application or bundler host that owns the runtime.

## Runtime Configuration

The default visibility set is `error`, `warn`, `info`, and `success`. `debug` logs are hidden unless `debug: true` is enabled in a simple, non-rule config.

```ts
setLoggerConfig({
  levels: ['warn', 'error'],
});
```

Use `resetLoggerConfig()` to clear the default runtime config in direct, non-plugin usage:

```ts
resetLoggerConfig();
```

When a runtime is controlled by `loggerPlugin`, both `setLoggerConfig(...)` and `resetLoggerConfig()` throw. Update the plugin `config` instead.

### Rule Mode

Rules make logging an allowlist. `plugins` only registers rule templates, `extends` imports plugin-provided configs, and `rules` is the final override layer. `rules` is an object map: the key is the rule label or preset reference, and the value is `'off'` or a rule object with `levels`. When at least one resolved rule exists, a log is visible only when a matching rule allows its level. There is no fallback to root `levels` for unmatched logs.

```ts
setLoggerConfig({
  debug: true,
  levels: ['warn', 'error'],
  rules: {
    'custom:metrics': {
      main: '@acme/docs',
      group: 'userland.metrics',
      levels: ['info', 'warn'],
    },
  },
});
```

Rule fields:

| Field     | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| map key   | Required unique label. In debug mode, visible rule-based logs include it.     |
| `main`    | Exact package or subsystem match.                                             |
| `group`   | Exact match by default, or a glob pattern when glob characters are present.   |
| `message` | Exact match by default, or a glob pattern when glob characters are present.   |
| `levels`  | Required. Use an explicit level array, or `'inherit'` to inherit root levels. |

`levels` accepts `error`, `warn`, `info`, and `success`. `debug` is controlled by `debug: true`, not by `levels`.

### Preset Plugins

Preset plugins register named rule templates, but registration alone does not enable anything. Import a plugin config with `extends`, or enable a preset rule from the same `rules` map using `"<plugin>/<rule>"`.

```ts
import type { LoggerPresetPlugin } from '@docs-islands/logger/types';

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

Preset rule settings are:

| Setting | Meaning                                                                                               |
| ------- | ----------------------------------------------------------------------------------------------------- |
| `'off'` | Delete the preset rule after expansion.                                                               |
| object  | Enable or override the rule; provided `main`, `group`, `message`, and `levels` override the template. |

## Bundler Plugin

Use `@docs-islands/logger/plugin` when you want bundler-injected runtime config and production tree-shaking.

```ts
import { defineConfig } from 'vite';
import { loggerPlugin } from '@docs-islands/logger/plugin';

export default defineConfig({
  plugins: [
    loggerPlugin.vite({
      config: {
        levels: ['warn', 'error'],
      },
    }),
  ],
});
```

The plugin exposes unplugin adapters:

```ts
loggerPlugin.vite(options);
loggerPlugin.rollup(options);
loggerPlugin.rolldown(options);
loggerPlugin.esbuild(options);
loggerPlugin.webpack(options);
loggerPlugin.rspack(options);
loggerPlugin.farm(options);
```

Plugin options:

| Option      | Description                                                                                    |
| ----------- | ---------------------------------------------------------------------------------------------- |
| `config`    | Runtime `LoggerConfig` injected into the bundle. Omit it to use the default visibility policy. |
| `treeshake` | Defaults to `true`. Set `false` to keep all logger calls and rely only on runtime filtering.   |

Rollup hosts must install `@rollup/plugin-replace` before using `loggerPlugin.rollup(...)`. The logger plugin prepends Rollup's replace plugin to inline the logger control constants, including `__DOCS_ISLANDS_DEFAULT_LOGGER_CONTROLLED__` and `__DOCS_ISLANDS_DEFAULT_LOGGER_CONFIG__`, so the bundle receives the same serialized runtime config that other bundlers inject through their `define` hooks.

When `loggerPlugin` controls a runtime, calling `setLoggerConfig(...)` or `resetLoggerConfig()` from application code throws. Update the plugin `config` instead so build-time pruning and runtime filtering share the same policy.

### Tree-Shaking Coverage

Tree-shaking is deliberately conservative. The runtime policy is always canonical; the plugin only removes calls it can prove safe.

A log call can be removed only when the plugin sees all of these static facts:

- `createLogger` is imported as a named, unaliased import from `@docs-islands/logger`
- `main`, `group`, and the message are string literals
- the logger binding is not reassigned
- the log call is a standalone expression
- the plugin is running in a build context and `treeshake` is not `false`

Supported static shape:

```ts
import { createLogger } from '@docs-islands/logger';

const logger = createLogger({
  main: '@acme/docs',
}).getLoggerByGroup('userland.metrics');

logger.info('static metric ready');
logger.warn('static metric delayed');
logger.error('static metric failed');
logger.success('static metric uploaded');
logger.debug('static metric details');
```

Kept for runtime filtering:

- dynamic `main`, `group`, or message values
- aliased `createLogger` imports
- reassigned logger bindings
- destructured methods
- computed method access
- non-standalone expressions such as assigning the result of a log call

## API

Root entry:

```ts
import {
  createLogger,
  resetLoggerConfig,
  resolveLoggerConfig,
  setLoggerConfig,
} from '@docs-islands/logger';
```

| API                     | Description                                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| `createLogger()`        | Creates or reuses a main logger in the default scope. Call `.getLoggerByGroup(group)` to log.        |
| `resolveLoggerConfig()` | Resolves public `LoggerConfig` input into the runtime config shape used by host packages.            |
| `setLoggerConfig()`     | Sets the default runtime config for direct non-plugin usage. Throws in plugin-controlled runtimes.   |
| `resetLoggerConfig()`   | Clears the default runtime config for direct non-plugin usage. Throws in plugin-controlled runtimes. |

Plugin entry:

```ts
import { loggerPlugin } from '@docs-islands/logger/plugin';
```

Scoped integration entry:

```ts
import {
  createScopedLogger,
  getScopedLoggerConfig,
  resetScopedLoggerConfig,
  setScopedLoggerConfig,
  shouldSuppressLog,
} from '@docs-islands/logger/core';
import { createLoggerScopeId } from '@docs-islands/logger/core/helper';

const scopeId = createLoggerScopeId();

setScopedLoggerConfig(scopeId, {
  levels: ['warn', 'error'],
});

const scopedLogger = createScopedLogger({ main: '@acme/docs-host' }, scopeId);
const logger = scopedLogger.getLoggerByGroup('build.pipeline');

logger.warn('host warning');

resetScopedLoggerConfig(scopeId);
```

| API                         | Description                                                                            |
| --------------------------- | -------------------------------------------------------------------------------------- |
| `setScopedLoggerConfig()`   | Registers or updates an explicit logger scope. Must run before `createScopedLogger()`. |
| `createScopedLogger()`      | Creates or reuses a main logger inside an explicit scope.                              |
| `getScopedLoggerConfig()`   | Reads the current config for a scope. Returns `undefined` when it is not registered.   |
| `resetScopedLoggerConfig()` | Removes an explicit scope config.                                                      |
| `shouldSuppressLog()`       | Resolves runtime visibility for custom integration logic.                              |

Advanced type and helper entries:

```ts
import type { LoggerConfig } from '@docs-islands/logger/types';
import { createElapsedLogOptions, createElapsedTimer } from '@docs-islands/logger/helper';
import { createLoggerScopeId } from '@docs-islands/logger/core/helper';
```

Prefer the root entry for application code. Use `@docs-islands/logger/core` only when an integration needs an explicit scope. Use `@docs-islands/logger/helper` for shared formatting, elapsed-time, and error/debug-message utilities. Use `@docs-islands/logger/core/helper` for scope helpers.

## Documentation

- [Logger guide](https://docs.senao.me/docs-islands/logger)
- [VitePress logging integration](https://docs.senao.me/docs-islands/vitepress/options/logging)
- [Changelog](./CHANGELOG.md)

## Contributing

Contributions are welcome. From the repository root:

```sh
pnpm --filter @docs-islands/logger test
pnpm --filter @docs-islands/logger typecheck
pnpm --filter @docs-islands/logger lint:package
```

Please read the [Contributing Guide](https://github.com/XiSenao/docs-islands/blob/main/.github/CONTRIBUTING.md) before opening a pull request.

## License

MIT © [XiSenao](https://github.com/XiSenao)
