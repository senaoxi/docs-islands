# Tree-Shaking

Use this reference when production builds should remove statically suppressed logger calls.

## Requirements

A call can be removed only when the plugin can statically prove all of these:

- `createLogger` is a named, unaliased import from `logaria`.
- `main`, `group`, and message are string literals.
- The logger binding is a `const` and is not reassigned.
- The log call is a standalone expression statement.
- The plugin is running in a build context.
- `treeshake` is not `false`.

## Supported Shape

```ts
import { createLogger } from 'logaria';

const logger = createLogger({ main: '@acme/docs' }).getLoggerByGroup('userland.metrics');

logger.info('static metric ready');
logger.warn('static metric delayed');
logger.error('static metric failed');
logger.success('static metric uploaded');
logger.debug('static metric details');
```

## Kept For Runtime Filtering

These patterns are preserved and filtered at runtime:

- Dynamic `main`, `group`, or message values
- Aliased `createLogger` imports
- Reassigned logger bindings
- Destructured logger methods
- Computed method access
- Non-standalone expressions, such as assigning the result of a log call

## Config Example

```ts
loggerPlugin.vite({
  config: { levels: ['warn', 'error'] },
  treeshake: true,
});
```

With that config, a supported static `logger.info('...')` call can be removed from a production build. Unsupported shapes remain in the bundle and are suppressed by runtime policy.

## Related

- [Plugin Guide](guide-plugin.md)
- [Plugin Config](config-plugin.md)
- [Log Groups](concept-log-groups.md)
