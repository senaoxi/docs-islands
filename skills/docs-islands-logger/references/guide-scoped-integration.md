# Scoped Integration Guide

Use explicit scopes when a framework or host package owns logger policy independently from the consuming app.

## Minimal Flow

1. Create one scope id for the host.
2. Register scope config before creating scoped loggers.
3. Create scoped loggers with the host `main`.
4. Expose a host-level configuration API instead of exposing the raw scope id.
5. Reset the scope in tests or host shutdown paths when needed.

```ts
import type { LoggerConfig } from '@docs-islands/logger/types';
import {
  createScopedLogger,
  resetScopedLoggerConfig,
  setScopedLoggerConfig,
} from '@docs-islands/logger/core';
import { createLoggerScopeId } from '@docs-islands/logger/core/helper';

const scopeId = createLoggerScopeId();

export function configureHostLogging(config: LoggerConfig) {
  setScopedLoggerConfig(scopeId, config);
}

export function createHostLogger(group: string) {
  return createScopedLogger({ main: '@acme/docs-host' }, scopeId).getLoggerByGroup(group);
}

export function resetHostLogging() {
  resetScopedLoggerConfig(scopeId);
}
```

## Default Host Setup

```ts
configureHostLogging({
  levels: ['warn', 'error'],
});

const logger = createHostLogger('runtime.renderer');
logger.warn('Renderer fallback enabled');
```

## Gotchas

- `createScopedLogger()` throws if the scope has not been registered.
- The default root config does not apply to explicit scopes.
- Scoped config supports the same simple and rule config shapes as the default scope.
- Do not use scoped APIs for normal app code; use them for hosts that need private ownership.

## Related

- [Scoped API](api-scoped.md)
- [Scoped Config](config-scoped.md)
- [Configuration Guide](guide-configuration.md)
