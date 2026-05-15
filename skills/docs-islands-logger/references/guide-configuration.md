# Configuration Guide

Use this reference to decide who owns `@docs-islands/logger` visibility.

## Ownership Decision

| Scenario                      | Entry                                                     | Owner                                  |
| ----------------------------- | --------------------------------------------------------- | -------------------------------------- |
| App, script, CLI              | `@docs-islands/logger`                                    | Runtime code calls `setLoggerConfig()` |
| Bundled production app        | `@docs-islands/logger` plus `@docs-islands/logger/plugin` | Bundler plugin injects config          |
| Reusable library              | `@docs-islands/logger`                                    | The consuming app or bundler host      |
| Framework or host integration | `@docs-islands/logger/core`                               | Explicit scope owned by the host       |

Decide the owner before creating loggers. Do not mix runtime `setLoggerConfig()` with plugin-controlled config in the same bundle.

## Defaults

- Default visible non-debug logs: `error`, `warn`, `info`, `success`.
- `debug` logs are hidden unless `debug: true` is set and rule mode is inactive.
- `levels` is an explicit allowlist; it is not a severity threshold.
- A normalized `rules` config switches non-debug logs to allowlist matching.
- When rules are active, unmatched logs do not fall back to root `levels`.
- In current runtime behavior, `logger.debug()` is suppressed while rules are active.

## Direct Runtime Config

Use for apps, scripts, and CLIs that are not controlled by `loggerPlugin`.

```ts
import { setLoggerConfig } from '@docs-islands/logger';

setLoggerConfig({
  levels: ['warn', 'error'],
});
```

Read [Simple Config](config-simple.md) for global visibility and [Rule Config](config-rules.md) for focused allowlists and preset plugin rules.

## Bundler-Controlled Config

Use plugin config when production output should receive the same policy at runtime and build time.

```ts
import { loggerPlugin } from '@docs-islands/logger/plugin';

loggerPlugin.vite({
  config: { levels: ['warn', 'error'] },
  treeshake: true,
});
```

When the plugin controls the runtime, `setLoggerConfig()` and `resetLoggerConfig()` throw. Update the plugin `config` instead.

## Library Guidance

Reusable packages should only create and use loggers.

```ts
import { createLogger } from '@docs-islands/logger';

const logger = createLogger({ main: '@acme/lib' }).getLoggerByGroup('runtime.core');
```

Do not call `setLoggerConfig()` or `resetLoggerConfig()` from library module initialization.

## Scoped Host Guidance

Frameworks or hosts that need private ownership should use explicit scopes.

```ts
import { createScopedLogger, setScopedLoggerConfig } from '@docs-islands/logger/core';
import { createLoggerScopeId } from '@docs-islands/logger/core/helper';

const scopeId = createLoggerScopeId();
setScopedLoggerConfig(scopeId, { levels: ['warn', 'error'] });

const logger = createScopedLogger({ main: '@acme/host' }, scopeId).getLoggerByGroup('runtime');
```

Read [Scoped Integration](guide-scoped-integration.md) for the full host workflow.
