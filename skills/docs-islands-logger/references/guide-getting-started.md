# Getting Started

Use this reference for first-time production integration of `@docs-islands/logger`.

## Contents

- [Install](#install)
- [Direct App Or Script](#direct-app-or-script)
- [Reusable Library](#reusable-library)
- [Error And Context Messages](#error-and-context-messages)
- [Elapsed Time](#elapsed-time)
- [Tests](#tests)

## Install

```bash
pnpm add @docs-islands/logger
```

Other package managers are fine. The package expects Node.js `^20.19.0 || >=22.12.0` and an ESM-compatible runtime or bundler.

## Direct App Or Script

Configure the default scope before creating loggers.

```ts
import { createLogger, setLoggerConfig } from '@docs-islands/logger';

setLoggerConfig({
  debug: process.env.NODE_ENV !== 'production',
  levels:
    process.env.NODE_ENV === 'production'
      ? ['warn', 'error']
      : ['info', 'success', 'warn', 'error'],
});

const logger = createLogger({ main: '@acme/docs' }).getLoggerByGroup('build.pipeline');

logger.info('Build started');
logger.success('Build finished');
logger.warn('Cache is cold');
logger.error('Build failed');
logger.debug('Resolved build config');
```

`main` identifies the package or subsystem. `group` identifies the area inside it and must be a lowercase dot namespace such as `build.pipeline` or `runtime.react`.

## Reusable Library

Libraries may create loggers, but should not call `setLoggerConfig()` at module initialization. Let the application or bundler host own visibility.

```ts
import { createLogger } from '@docs-islands/logger';

const logger = createLogger({ main: '@acme/library' }).getLoggerByGroup('runtime.core');

export function runFeature() {
  logger.info('Feature started');
}
```

## Error And Context Messages

Logger methods do not accept arbitrary metadata objects. Format context into the message first.

```ts
import { createLogger } from '@docs-islands/logger';
import { formatErrorMessage, formatDebugMessage } from '@docs-islands/logger/helper';

const logger = createLogger({ main: '@acme/docs' }).getLoggerByGroup('build.pipeline');

try {
  await build();
  logger.success('Build complete');
} catch (error) {
  logger.error(`Build failed: ${formatErrorMessage(error)}`);
}

logger.debug(
  formatDebugMessage({
    context: 'build.pipeline',
    decision: 'selected incremental build',
    summary: { changedFiles: 12, cacheHit: true },
  }),
);
```

## Elapsed Time

`createElapsedLogOptions(startTimeMs, endTimeMs?)` computes elapsed time from a start timestamp. The elapsed suffix is rendered for visible non-debug logs when debug diagnostics are enabled and elapsed options are provided.

```ts
import { createElapsedLogOptions } from '@docs-islands/logger/helper';

const startTimeMs = performance.now();
await build();
logger.success('Build finished', createElapsedLogOptions(startTimeMs));
```

## Tests

Tests that mutate config should clean up after each test.

```ts
import { resetLoggerConfig } from '@docs-islands/logger';

afterEach(() => {
  resetLoggerConfig();
});
```

## Next References

- [Configuration Guide](guide-configuration.md) - choose config ownership
- [Simple Config](config-simple.md) - direct `levels` setup
- [Plugin Guide](guide-plugin.md) - bundler-controlled production config
- [API Reference](reference-api.md) - signatures and public entries
