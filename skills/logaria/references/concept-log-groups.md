# Log Groups

Use this reference for `main` and `group` naming.

## Main

`main` identifies the package or subsystem that owns the log stream.

```ts
createLogger({ main: '@acme/docs' });
createScopedLogger({ main: '@acme/docs-host' }, scopeId);
```

`main` is trimmed and must be non-empty. Rules match `main` exactly.

## Group

`group` identifies an area inside `main`.

```ts
const logger = createLogger({ main: '@acme/docs' }).getLoggerByGroup('build.pipeline');
```

Runtime logger groups must be lowercase dot namespaces without package identifiers.

Good examples:

- `build.pipeline`
- `runtime.react`
- `config.loader`
- `userland.metrics`

Avoid:

- `@acme/docs:build`
- `BuildPipeline`
- `runtime/react`
- empty strings

## Tree-Shaking Hint

When build-time pruning matters, keep both `main` and `group` as string literals in the supported static shape.

```ts
import { createLogger } from 'logaria';

const logger = createLogger({ main: '@acme/docs' }).getLoggerByGroup('build.pipeline');
logger.info('static build started');
```

## Related

- [Tree-Shaking](feature-tree-shaking.md)
- [Rule Config](config-rules.md)
- [API Reference](reference-api.md)
