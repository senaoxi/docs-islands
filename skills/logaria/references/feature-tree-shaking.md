# Tree-Shaking

Use this reference when production builds should remove statically suppressed logger calls.

## Requirements

A call can be removed only when the plugin can statically prove all of these:

- `createLogger` is a named, unaliased import from `logaria`.
- `main`, `group`, and message are string literals.
- The options have one `main`, without spreads, computed keys, or methods.
- The logger binding is a `const` and is not reassigned.
- The log call is a standalone expression statement.
- The plugin is running in a build context.
- `treeshake` is `true`.
- Arguments after the message are absent or a literal elapsed-time options object with numeric values, including unary `+`/`-`.

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
- Ambiguous options or duplicate `main` keys
- Computed options, extra arguments, or spread arguments whose evaluation must remain
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

Removable statements become empty statements, preserving bare control-flow bodies. Each plugin instance owns its compiled pruning policy without changing the build process default scope. The direct transform API continues using its explicitly registered scope.

## Related

- [Plugin Guide](guide-plugin.md)
- [Plugin Config](config-plugin.md)
- [Log Groups](concept-log-groups.md)
