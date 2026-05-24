# Scoped Integrations

The root `logaria` entry uses the default scope. Host integrations can use `logaria/core` to create explicit scopes with independent configuration ownership.

Use this when a framework, build tool, or host package needs to manage logger visibility for its own graph without mutating application-owned runtime config.

## Scope Lifecycle

Create a scope id, register config, create scoped loggers, then reset when the host is done:

```ts
import { createScopedLogger, resetScopedLoggerConfig, setScopedLoggerConfig } from 'logaria/core';
import { createLoggerScopeId } from 'logaria/core/helper';

const scopeId = createLoggerScopeId();

setScopedLoggerConfig(scopeId, {
  levels: ['warn', 'error'],
});

const logger = createScopedLogger({ main: '@acme/docs-host' }, scopeId).getLoggerByGroup(
  'build.pipeline',
);

logger.warn('host warning');

resetScopedLoggerConfig(scopeId);
```

`createScopedLogger()` requires the scope config to be registered first. If the scope is missing, it throws instead of silently falling back to the default scope.

## Reading Scope Config

Use `getScopedLoggerConfig()` when integration code needs to inspect the raw config currently registered for a scope:

```ts
import { getScopedLoggerConfig } from 'logaria/core';

const config = getScopedLoggerConfig(scopeId);
```

It returns `undefined` when the scope is not registered.

## Custom Visibility Decisions

Use `shouldSuppressLog()` when custom integration code needs Logaria visibility decisions without emitting through a logger method:

```ts
import { shouldSuppressLog } from 'logaria/core';

const suppress = shouldSuppressLog(
  'info',
  {
    main: '@acme/docs-host',
    group: 'build.pipeline',
    message: 'build started',
  },
  scopeId,
);
```

The return value is `true` when the log should be hidden and `false` when it should be shown.

## Scope Ids

`createLoggerScopeId()` returns a unique string such as `logaria-scope-...`. You may also use your own stable string when the host needs a named scope, but normalize empty strings and whitespace carefully. Empty scope ids normalize to the default scope.

Prefer generated ids for per-instance scopes and stable ids for singleton host integrations.
