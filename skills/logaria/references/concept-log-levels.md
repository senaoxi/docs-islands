# Log Levels

Use this reference to choose the right log method and config value.

## Available Methods

| Method                              | Config value          | Console method  | Use for                                           |
| ----------------------------------- | --------------------- | --------------- | ------------------------------------------------- |
| `logger.error(message, options?)`   | `error`               | `console.error` | Failed operations and actionable errors           |
| `logger.warn(message, options?)`    | `warn`                | `console.warn`  | Risk, fallback, deprecation, or degraded behavior |
| `logger.info(message, options?)`    | `info`                | `console.log`   | Important lifecycle and progress events           |
| `logger.success(message, options?)` | `success`             | `console.log`   | Completed operations                              |
| `logger.debug(message)`             | separate `debug` flag | `console.debug` | Development diagnostics                           |

`options` is only `{ elapsedTimeMs: number }`. Do not pass arbitrary metadata objects to logger methods.

## Visibility

Default visible non-debug levels:

```ts
['error', 'warn', 'info', 'success'];
```

Production allowlist:

```ts
setLoggerConfig({
  levels: ['warn', 'error'],
});
```

Development diagnostics:

```ts
setLoggerConfig({
  debug: true,
  levels: ['info', 'success', 'warn', 'error'],
});
```

## Debug Handling

`debug` is not a `levels` value.

Use `debug: true` plus non-debug `levels`; do not put `debug` inside `levels`.

In rule mode, current runtime behavior suppresses `logger.debug()`. Use `debug: true` there to add contributing rule labels to visible non-debug logs and render elapsed timing when `{ elapsedTimeMs }` is provided.

## Message Style

Format context into strings before logging.

```ts
import { formatErrorMessage, formatDebugMessage } from 'logaria/helper';

logger.error(`build failed: ${formatErrorMessage(error)}`);

logger.debug(
  formatDebugMessage({
    context: 'build.pipeline',
    decision: 'using cached transform',
    summary: { cacheKey, changedFiles },
  }),
);
```

Use elapsed timing for visible operational milestones.

```ts
import { createElapsedTimer } from 'logaria/helper';

logger.info('build started');
const elapsed = createElapsedTimer();
await build();
logger.success('build finished', elapsed());
```

## Related

- [Simple Config](config-simple.md)
- [Rule Config](config-rules.md)
- [API Reference](reference-api.md)
