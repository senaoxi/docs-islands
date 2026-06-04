# Scoped Integrations

The root `logaria` entry uses one **default scope**, owned by the application or the bundler plugin. Host integrations — frameworks, build tools, library middleware — should not mutate that default scope.

`logaria/core` is the answer. It lets a host package register an **explicit scope** with its own config, separate from the application-owned default scope. Application config and host config can coexist without conflict.

::: tip When to use this
Use scoped integrations whenever a library you ship cares about _its own_ logger visibility — for example a framework debugging panel, a build tool's internal log pipeline, or a runtime debug overlay. If you just want logs in a CLI or app, stick to the root `logaria` entry.
:::

## Scope Lifecycle

The pattern is **register → use → reset**:

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

`createScopedLogger()` requires the scope config to be registered first. If the scope is missing, it throws — Logaria refuses to fall back to the default scope silently, because the whole point of scoped integrations is to keep ownership explicit.

## Reading Scope Config

Use `getScopedLoggerConfig()` when integration code needs to inspect the raw config currently registered for a scope:

```ts
import { getScopedLoggerConfig } from 'logaria/core';

const config = getScopedLoggerConfig(scopeId);
```

It returns `undefined` when the scope is not registered. This is useful for "config has been set up before me?" checks or for diagnostic surfaces.

## Custom Visibility Decisions

Use `shouldSuppressLog()` when integration code needs Logaria's visibility decision without emitting through a logger method — for example to short-circuit expensive formatting work before constructing a message:

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

## Scope IDs

`createLoggerScopeId()` returns a unique string of the form `logaria-scope-...`. You may also use your own stable string when the host needs a named scope — just normalize empty strings and whitespace carefully. **Empty scope ids normalize to the default scope**, which is rarely what you want.

A simple rule of thumb:

- **Generated ids** (`createLoggerScopeId()`) — for per-instance scopes (e.g., one per `vite` plugin instance).
- **Stable ids** (your own string) — for singleton host integrations (e.g., one well-known id for the framework's debug panel).

## Normalising User Config

`resolveLoggerConfig()` validates and normalizes a public `LoggerConfig` into the internal shape Logaria uses to make decisions. Host packages that want to accept user-provided config — for example, exposing a `logger` option on their own plugin — should run input through this helper before storing it.

```ts
import { resolveLoggerConfig } from 'logaria/core';

const compiled = resolveLoggerConfig(userConfig);
```

This catches malformed rules, unknown levels, and conflicting `extends` references at the boundary, instead of letting them surface later as confusing runtime behaviour.

## What to Read Next

- [API Reference — `logaria/core`](./api-reference.md#logaria-core) — full signature list.
- [Core Concepts — Ownership and Scopes](./concepts.md#ownership-and-scopes) — why scopes exist.
- [Troubleshooting — Missing scope id](./troubleshooting.md#missing-scope-id) — common pitfalls when registering scopes.
