# logaria

`logaria` is the framework-agnostic logger package for docs-islands projects. Its root entry is intentionally small:

```ts
import { createLogger, resetLoggerConfig, setLoggerConfig } from 'logaria';
import { createElapsedTimer, formatErrorMessage } from 'logaria/helper';
```

Use it for framework-agnostic runtime logging, such as standalone scripts, shared packages, examples, or documentation-site utilities.

## Choosing an Entry

| Situation                                              | Entry                        | Who owns the config                                            |
| ------------------------------------------------------ | ---------------------------- | -------------------------------------------------------------- |
| Generic app, script, or package runtime                | `logaria`                    | Your code, through `setLoggerConfig()` / `resetLoggerConfig()` |
| Generic runtime with build-time pruning                | `logaria` + `logaria/plugin` | `loggerPlugin`, through its `config` option                    |
| Host integrations that need explicit isolated scopes   | `logaria/core`               | The host integration, through `setScopedLoggerConfig()`        |
| Formatting, elapsed-time, and message helper utilities | `logaria/helper`             | No runtime config                                              |
| Scope helper utilities for integrations                | `logaria/core/helper`        | No runtime config                                              |

Most application code should use the root entry. The `core` entry is for integration authors that need to create or consume explicit logger scopes.

## Runtime Demo

The demo below imports the real package from this docs site. Pick a runtime config and run the scenario; the component captures the console calls produced by `createLogger()`.

<script setup>
import LoggerRuntimeDemo from '../.vitepress/theme/components/LoggerRuntimeDemo.vue'
</script>

<LoggerRuntimeDemo locale="en" />

## Runtime API

Create a main logger, then derive a group logger:

```ts
import { createLogger, resetLoggerConfig, setLoggerConfig } from 'logaria';

setLoggerConfig({
  debug: true,
  levels: ['info', 'warn', 'error'],
});

const logger = createLogger({ main: 'my-package' }).getLoggerByGroup('build');

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
logger.debug('debug is visible only when debug is enabled');

resetLoggerConfig();
```

`setLoggerConfig()` updates the default runtime scope. `resetLoggerConfig()` clears that scope so the runtime falls back to its default visibility policy. Both APIs are intended for direct, non-plugin usage.

### Rules Map

Focused filtering uses the same public `plugins + extends + rules` model as the bundler plugin config. Preset plugins only register rule templates. Import preset configs with `extends`, then use `rules` as the final override layer. Custom rule labels are the map keys.

```ts
const viteLoggingPlugin = {
  rules: {
    build: { main: '@acme/vite', group: 'build.pipeline' },
    hmr: { main: '@acme/vite', group: 'dev.hmr' },
  },
  configs: {
    recommended: {
      rules: {
        build: { levels: 'inherit' },
        hmr: { levels: 'inherit' },
      },
    },
  },
};

setLoggerConfig({
  plugins: {
    vite: viteLoggingPlugin,
  },
  extends: ['vite/recommended'],
  rules: {
    'vite/hmr': 'off',
    'custom:api-timeout': {
      group: 'api.*',
      message: '*timeout*',
      levels: ['warn'],
    },
  },
});
```

### Controlled Runtime Behavior

When a host installs `loggerPlugin`, the plugin owns the default logger scope. In that controlled runtime, application code must not call `setLoggerConfig()` or `resetLoggerConfig()`; both calls throw so the injected runtime policy and build-time pruning policy cannot diverge.

```ts
import { loggerPlugin } from 'logaria/plugin';

export default {
  vite: {
    plugins: [
      loggerPlugin.vite({
        config: {
          levels: ['warn', 'error'],
        },
      }),
    ],
  },
};
```

Use the plugin `config` option to change visibility in a controlled build. Use `setLoggerConfig()` and `resetLoggerConfig()` only when the runtime is not controlled by a logger plugin.

## Tree-Shaking Plugin

The plugin entry lives under `logaria/plugin`:

```ts
import { loggerPlugin } from 'logaria/plugin';

export default {
  vite: {
    plugins: [loggerPlugin.vite()],
  },
};
```

The docs site uses this plugin during `docs:build`. A small static debug fixture is imported by the demo component, so production builds exercise compile-time pruning without changing the interactive runtime demo.

`loggerPlugin` controls the root `logaria` runtime. Tree-shaking is **disabled by default**. To enable build-time pruning, set `treeshake: true` in the plugin options. When enabled, the plugin removes statically provable logger calls that are hidden by the resolved logger config:

```ts
import { loggerPlugin } from 'logaria/plugin';

export default {
  vite: {
    plugins: [
      loggerPlugin.vite({
        treeshake: true,
      }),
    ],
  },
};
```

The plugin only removes statically provable calls. Dynamic messages, variable groups, aliases, destructured methods, and indirect wrappers are kept. Runtime filtering remains the canonical behavior for every call that stays in the bundle.

## Scoped Integration API

The `logaria/core` entry exposes explicit scope primitives for host integrations:

```ts
import { createScopedLogger, setScopedLoggerConfig } from 'logaria/core';

setScopedLoggerConfig('my-host-scope', {
  levels: ['warn', 'error'],
});

const logger = createScopedLogger({ main: '@acme/integration' }, 'my-host-scope').getLoggerByGroup(
  'build',
);
```

A scoped logger can only be created after its scope config has been registered. This is how host integrations keep multiple logger scopes isolated in the same JavaScript runtime. Application packages should prefer the root entry unless they are deliberately participating in a host-managed scope.
