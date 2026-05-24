# Getting Started

`logaria` is a framework-agnostic logger for TypeScript packages, scripts, docs tooling, and browser runtimes. It gives application code a small logging API while keeping configuration ownership explicit.

Use the root entry for ordinary application or script logging:

```ts
import { createLogger, resetLoggerConfig, setLoggerConfig } from 'logaria';
import { createElapsedTimer, formatErrorMessage } from 'logaria/helper';
```

Use `logaria/plugin` only when a bundler should inject the runtime config. Use `logaria/core` when a host integration needs an isolated logger scope.

## Installation

Install the package with your package manager:

```sh
pnpm add logaria
```

```sh
npm install logaria
```

```sh
yarn add logaria
```

```sh
bun add logaria
```

Requirements:

- Node.js `^20.19.0 || >=22.12.0`
- An ESM-compatible runtime or bundler
- Optional peer dependencies for the bundler plugin you use, such as `@rollup/plugin-replace` for Rollup and `rolldown` for Rolldown

## Quick Start

Configure the default scope before creating loggers when your app owns runtime visibility:

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

`createLogger({ main })` identifies the package or subsystem that owns the log stream. `getLoggerByGroup(group)` identifies a narrower area inside that stream.

Use lowercase dot namespaces for groups, without repeating the package name. Good examples are `runtime.react`, `build.pipeline`, and `dev.hmr`.

## Configuration Ownership

Logaria has one default scope behind the root entry and optional explicit scopes for host integrations. Choose the owner before creating loggers:

| Situation                               | Entry                           | Config owner                                                                |
| --------------------------------------- | ------------------------------- | --------------------------------------------------------------------------- |
| Direct app, script, or package runtime  | `logaria`                       | The application calls `setLoggerConfig()` and `resetLoggerConfig()`.        |
| Bundler-controlled runtime              | `logaria` plus `logaria/plugin` | The bundler plugin injects the default scope config.                        |
| Host integration with private ownership | `logaria/core`                  | The host registers an explicit scope before calling `createScopedLogger()`. |
| Formatting and elapsed-time helpers     | `logaria/helper`                | No runtime config.                                                          |
| Scope helper utilities                  | `logaria/core/helper`           | No runtime config.                                                          |

Reusable libraries should not call `setLoggerConfig()` or `resetLoggerConfig()` at module initialization. The default scope belongs to the application or bundler host that owns the runtime.

## Runtime Demo

This demo imports the real `logaria` package from this docs site. Pick a profile and run the scenario to see the captured console output.

<script setup>
import LoggerRuntimeDemo from '../.vitepress/theme/components/LoggerRuntimeDemo.vue'
</script>

<LoggerRuntimeDemo locale="en" />
