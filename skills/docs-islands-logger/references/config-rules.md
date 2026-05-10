# Rule-Based Configuration

Use rules when production visibility must focus on specific packages, groups, or message patterns.

## Contents

- [Behavior](#behavior)
- [Shape](#shape)
- [Rule Fields](#rule-fields)
- [Common Patterns](#common-patterns)
- [Related](#related)

## Behavior

- A normalized `rules` config with at least one rule switches non-debug logs to allowlist mode.
- A log is visible only when at least one enabled rule matches its scope and allows its level.
- Unmatched logs do not fall back to root `levels`.
- `debug: true` adds contributing rule labels to visible non-debug logs and renders elapsed timing when `{ elapsedTimeMs }` is provided.
- In current runtime behavior, `logger.debug()` is suppressed while rule mode is active.

## Shape

```ts
import { setLoggerConfig } from '@docs-islands/logger';

setLoggerConfig({
  debug: true,
  levels: ['warn', 'error'],
  rules: [
    {
      label: 'metrics',
      main: '@acme/docs',
      group: 'userland.metrics',
      levels: ['info', 'warn'],
    },
  ],
});
```

`levels` at the root is used as the fallback allowed levels for rules that omit their own `levels`. It is not a fallback for unmatched logs.

## Rule Fields

```ts
interface LoggerRule {
  label: string;
  enabled?: boolean;
  main?: string;
  group?: string;
  message?: string;
  levels?: Array<'error' | 'warn' | 'info' | 'success'>;
}
```

- `label` is required, must be unique, and cannot be `<root>`.
- `enabled: false` keeps a rule declared but inactive.
- `main` matches exactly after trimming.
- `group` and `message` match exactly unless the pattern contains documented glob syntax. Stable coverage is `*`, `?`, and `[]`; richer picomatch syntax is implementation behavior until covered by tests.
- `levels` controls non-debug visibility for the matching rule.

## Common Patterns

Focus on one package and area:

```ts
rules: [
  {
    label: 'docs-build',
    main: '@acme/docs',
    group: 'build.*',
    levels: ['info', 'warn', 'error'],
  },
];
```

Use root `levels` as rule defaults, with extra info for one area:

```ts
setLoggerConfig({
  levels: ['warn', 'error'],
  rules: [
    {
      label: 'build-info',
      group: 'build.pipeline',
      levels: ['info', 'warn', 'error'],
    },
    {
      label: 'runtime-defaults',
      group: 'runtime.*',
    },
  ],
});
```

Keep a candidate rule disabled:

```ts
rules: [
  {
    enabled: false,
    label: 'future-devtools',
    group: 'devtools.*',
    levels: ['info'],
  },
];
```

## Related

- [Rule Mode](feature-rule-mode.md)
- [Configuration Guide](guide-configuration.md)
- [Log Groups](concept-log-groups.md)
