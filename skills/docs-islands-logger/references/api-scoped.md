# Scoped API

Use this reference for explicit scope function signatures.

## createLoggerScopeId

```ts
import { createLoggerScopeId } from '@docs-islands/logger/core/helper';

const scopeId = createLoggerScopeId();
```

Returns a unique string such as `docs-islands-logger-scope-...`.

## setScopedLoggerConfig

```ts
import { setScopedLoggerConfig } from '@docs-islands/logger/core';
import type { LoggerConfig } from '@docs-islands/logger/types';

setScopedLoggerConfig(scopeId, {
  levels: ['warn', 'error'],
} satisfies LoggerConfig);
```

Registers or updates a config for the scope.

## createScopedLogger

```ts
import { createScopedLogger } from '@docs-islands/logger/core';

const mainLogger = createScopedLogger({ main: '@acme/host' }, scopeId);
const logger = mainLogger.getLoggerByGroup('runtime.renderer');
```

The scope must already be registered. The returned main logger exposes `.getLoggerByGroup(group)`.

## getScopedLoggerConfig

```ts
import { getScopedLoggerConfig } from '@docs-islands/logger/core';

const config = getScopedLoggerConfig(scopeId);
```

Returns the normalized internal `ResolvedLoggerConfig | undefined`.

## resetScopedLoggerConfig

```ts
import { resetScopedLoggerConfig } from '@docs-islands/logger/core';

resetScopedLoggerConfig(scopeId);
```

Removes the scope config. Creating a scoped logger for that scope will throw until config is registered again.

## shouldSuppressLog

```ts
import { shouldSuppressLog } from '@docs-islands/logger/core';

const suppressed = shouldSuppressLog(
  'info',
  {
    main: '@acme/host',
    group: 'runtime.renderer',
    message: 'Renderer hydrated',
  },
  scopeId,
);
```

Signature:

```ts
shouldSuppressLog(
  kind: 'info' | 'success' | 'warn' | 'error' | 'debug',
  options: {
    group: string;
    main: string;
    message?: string;
  },
  scopeId?: string,
): boolean;
```

Use this for custom host logic that needs to mirror logger visibility without emitting a console message.

## Related

- [Scoped Integration Guide](guide-scoped-integration.md)
- [Scoped Config](config-scoped.md)
- [API Reference](reference-api.md)
