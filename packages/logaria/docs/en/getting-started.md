# Getting Started

## Overview

Logaria is a small, framework-agnostic logger for TypeScript packages, scripts, CLIs, and browser code. It gives application code a tiny logging API while keeping configuration ownership explicit — and pairs with an optional bundler plugin that prunes statically suppressed log calls at build time.

It consists of three parts you can opt in to:

- **A tiny runtime API** ([`logaria`](./api-reference.md#logaria)) for creating loggers and configuring visibility.
- **A bundler plugin** ([`logaria/plugin`](./bundler-plugin.md)) that injects runtime config and optionally removes suppressed calls from production bundles.
- **A scoped core** ([`logaria/core`](./scoped-integrations.md)) for host integrations that need their own logger scope without touching the default one.

If you are new here, read [Why Logaria](./why.md) to understand the problem it solves, or jump straight into the quick start below.

## Runtime Support

Logaria targets ESM-compatible runtimes:

- **Node.js**: `^20.19.0 || >=22.12.0`
- **Browsers**: any modern browser served through an ESM-aware bundler
- **Module format**: ESM only (`"type": "module"`)

The bundler plugin is built on [unplugin](https://github.com/unjs/unplugin) and ships adapters for Vite, Rollup, Rolldown, esbuild, webpack, Rspack, and Farm.

## Installation

::: code-group

```sh [pnpm]
pnpm add logaria
```

```sh [npm]
npm install logaria
```

```sh [yarn]
yarn add logaria
```

```sh [bun]
bun add logaria
```

:::

::: tip Peer dependency for Rollup hosts
If you plan to use [`loggerPlugin.rollup(...)`](./bundler-plugin.md#adapters), also install `@rollup/plugin-replace`. Other adapters use the bundler's native `define` hook and need no peer dependency.
:::

## Your First Logger

Configure the default scope, create a main logger, then derive a group logger before you log:

```ts
import { createLogger, resetLoggerConfig, setLoggerConfig } from 'logaria';
import { createElapsedTimer, formatErrorMessage } from 'logaria/helper';

setLoggerConfig({
  debug: true,
  levels: ['info', 'success', 'warn', 'error'],
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

resetLoggerConfig();
```

What each piece does:

- `createLogger({ main })` names the package or subsystem that owns the log stream.
- `.getLoggerByGroup(group)` names a narrower area inside that stream.
- `setLoggerConfig()` / `resetLoggerConfig()` adjust the **default scope** at runtime. Use them only when your application owns the default scope.

## Naming Conventions

A clear `main` and `group` is what lets [rules](./rules-and-presets.md) target the right logs.

- **`main`** — the package or subsystem identity, usually the package name (`@acme/docs`, `@scope/cli`, `app`).
- **`group`** — a lowercase dot namespace **inside** that stream. Do **not** repeat the package name.

Good `group` values: `runtime.react`, `build.pipeline`, `dev.hmr`, `userland.metrics`.

## Configuration Ownership

Logaria has one default scope behind the root entry and optional explicit scopes for host integrations. Choose the owner before creating loggers:

| Situation                               | Entry                        | Config owner                                                                |
| --------------------------------------- | ---------------------------- | --------------------------------------------------------------------------- |
| Direct app, script, or package runtime  | `logaria`                    | The application calls `setLoggerConfig()` / `resetLoggerConfig()`.          |
| Bundler-controlled runtime              | `logaria` + `logaria/plugin` | The bundler plugin injects the default scope config.                        |
| Host integration with private ownership | `logaria/core`               | The host registers an explicit scope before calling `createScopedLogger()`. |
| Formatting and elapsed-time helpers     | `logaria/helper`             | No runtime config.                                                          |
| Scope helper utilities                  | `logaria/core/helper`        | No runtime config.                                                          |

::: warning Library authors
Reusable libraries should **not** call `setLoggerConfig()` or `resetLoggerConfig()` at module initialization. The default scope belongs to the application or bundler host that owns the runtime. Libraries that need private visibility should use [scoped integrations](./scoped-integrations.md) instead.
:::

## Next Steps

- Tune which logs print: [Runtime Config](./runtime-config.md)
- Match logs by `main`, `group`, message: [Rules & Presets](./rules-and-presets.md)
- Strip suppressed calls from production: [Bundler Plugin](./bundler-plugin.md)
- Own a private scope from a host package: [Scoped Integrations](./scoped-integrations.md)
- Look up every export: [API Reference](./api-reference.md)

## Runtime Demo

The demo below imports the real `logaria` package from this docs site. Pick a profile and run the scenario to see the captured console output.

<script setup>
import LoggerRuntimeDemo from '../.vitepress/theme/components/LoggerRuntimeDemo.vue'
</script>

<LoggerRuntimeDemo locale="en" />
