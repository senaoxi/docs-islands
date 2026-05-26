# Getting Started

Use this reference for first-time production integration of `logaria`.

## Contents

- [Install](#install)
- [Direct App Or Script](#direct-app-or-script)
- [Reusable Library](#reusable-library)
- [Error And Context Messages](#error-and-context-messages)
- [Elapsed Time](#elapsed-time)
- [Tests](#tests)

## Install

```bash
pnpm add logaria
```

Other package managers are fine. The package expects Node.js `^20.19.0 || >=22.12.0` and an ESM-compatible runtime or bundler.

## Direct App Or Script

Configure the default scope before creating loggers.

```ts
import { createLogger, setLoggerConfig } from 'logaria';

setLoggerConfig({
  debug: process.env.NODE_ENV !== 'production',
  levels:
    process.env.NODE_ENV === 'production'
      ? ['warn', 'error']
      : ['info', 'success', 'warn', 'error'],
});

const logger = createLogger({ main: '@acme/docs' }).getLoggerByGroup('build.pipeline');

logger.info('build started');
logger.success('build finished');
logger.warn('cache is cold');
logger.error('build failed');
logger.debug('resolved build config');
```

`main` identifies the package or subsystem. `group` identifies the area inside it and must be a lowercase dot namespace such as `build.pipeline` or `runtime.react`.

## Reusable Library

Libraries may create loggers, but should not call `setLoggerConfig()` at module initialization. Let the application or bundler host own visibility.

```ts
import { createLogger } from 'logaria';

const logger = createLogger({ main: '@acme/library' }).getLoggerByGroup('runtime.core');

export function runFeature() {
  logger.info('feature started');
}
```

## Error And Context Messages

Logger methods do not accept arbitrary metadata objects. Format context into the message first.

```ts
import { createLogger } from 'logaria';
import { createElapsedTimer, formatErrorMessage, formatDebugMessage } from 'logaria/helper';

const logger = createLogger({ main: '@acme/docs' }).getLoggerByGroup('build.pipeline');

logger.info('build started');
const elapsed = createElapsedTimer();
try {
  await build();
  logger.success('build finished', elapsed());
} catch (error) {
  logger.error(`build failed: ${formatErrorMessage(error)}`, elapsed());
  throw error;
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

`createElapsedTimer()` records a start timestamp and returns a function that produces elapsed log options. `createElapsedLogOptions(elapsedTimeMs)` wraps a precomputed elapsed value. The elapsed suffix is rendered for visible non-debug logs when debug diagnostics are enabled and elapsed options are provided.

```ts
import { createElapsedTimer } from 'logaria/helper';

logger.info('build started');
const elapsed = createElapsedTimer();
await build();
logger.success('build finished', elapsed());
```

## Tests

Tests that mutate config should clean up after each test.

```ts
import { resetLoggerConfig } from 'logaria';

afterEach(() => {
  resetLoggerConfig();
});
```

## Next References

- [Configuration Guide](guide-configuration.md) - choose config ownership
- [Simple Config](config-simple.md) - direct `levels` setup
- [Plugin Guide](guide-plugin.md) - bundler-controlled production config
- [API Reference](reference-api.md) - signatures and public entries
