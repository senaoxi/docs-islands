# Scoped Configuration

Use this reference for framework-owned config isolated from the default logger scope.

## Simple Scoped Config

```ts
import { setScopedLoggerConfig } from '@docs-islands/logger/core';

setScopedLoggerConfig(scopeId, {
  debug: false,
  levels: ['warn', 'error'],
});
```

## Rule Scoped Config

```ts
setScopedLoggerConfig(scopeId, {
  debug: true,
  levels: ['warn', 'error'],
  rules: {
    'custom:renderer': {
      group: 'runtime.renderer',
      levels: ['info', 'warn', 'error'],
    },
  },
});
```

Rules behave the same inside explicit scopes as they do in the default scope: non-debug logs are allowed only by resolved rules whose scope and effective levels match, unmatched logs are hidden, and current runtime behavior suppresses `logger.debug()` while rules are active.

## Dynamic Host API

```ts
import type { LoggerConfig } from '@docs-islands/logger/types';

const LEVEL_PRESETS = {
  debug: { debug: true, levels: ['info', 'success', 'warn', 'error'] },
  info: { levels: ['info', 'success', 'warn', 'error'] },
  warn: { levels: ['warn', 'error'] },
  error: { levels: ['error'] },
} satisfies Record<string, LoggerConfig>;

export function setHostLogLevel(level: keyof typeof LEVEL_PRESETS) {
  setScopedLoggerConfig(scopeId, LEVEL_PRESETS[level]);
}
```

## Scope Isolation

Each scope has an independent config.

```ts
setScopedLoggerConfig(serverScopeId, {
  levels: ['warn', 'error'],
});

setScopedLoggerConfig(clientScopeId, {
  debug: true,
  levels: ['info', 'success', 'warn', 'error'],
});
```

## Cleanup

```ts
import { resetScopedLoggerConfig } from '@docs-islands/logger/core';

afterEach(() => {
  resetScopedLoggerConfig(scopeId);
});
```

## Related

- [Scoped Integration Guide](guide-scoped-integration.md)
- [Scoped API](api-scoped.md)
- [Rule Config](config-rules.md)
