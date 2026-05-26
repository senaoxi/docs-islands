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
- A log is visible only when at least one resolved rule matches its scope and allows its level.
- Unmatched logs do not fall back to root `levels`.
- If all imported rules are deleted with `'off'`, no resolved rules remain and the logger falls back to default no-rule behavior.
- `debug: true` adds contributing rule labels to visible non-debug logs and renders elapsed timing when `{ elapsedTimeMs }` is provided.
- In current runtime behavior, `logger.debug()` is suppressed while rule mode is active.

## Shape

```ts
import { setLoggerConfig } from 'logaria';

setLoggerConfig({
  debug: true,
  levels: ['warn', 'error'],
  rules: {
    'custom:metrics': {
      main: '@acme/docs',
      group: 'userland.metrics',
      levels: ['info', 'warn'],
    },
  },
});
```

`levels` at the root is used as the fallback allowed levels for rules that use `levels: 'inherit'`. It is not a fallback for unmatched logs.

## Rule Fields

```ts
type LoggerRuleLevelsUserConfig = 'inherit' | Array<'error' | 'warn' | 'info' | 'success'>;

type LoggerRuleSetting = 'off' | LoggerRuleUserConfig;

interface LoggerRuleUserConfig {
  main?: string;
  group?: string;
  message?: string;
  levels: LoggerRuleLevelsUserConfig;
}
```

- `rules` is an object map. The map key is the label, must be unique, and cannot be `<root>`.
- `'off'` deletes a rule, so no resolved rule is emitted.
- Object settings always require `levels`; use `levels: 'inherit'` to inherit root `levels`.
- `main` matches exactly after trimming.
- `group` and `message` match exactly unless the pattern contains documented glob syntax. Stable coverage is `*`, `?`, and `[]`; richer picomatch syntax is implementation behavior until covered by tests.
- `levels` controls non-debug visibility for the matching rule.
- Preset references use `"<plugin>/<rule>"`; custom rule keys should not contain `/`.

## Common Patterns

Focus on one package and area:

```ts
rules: {
  'custom:docs-build': {
    main: '@acme/docs',
    group: 'build.*',
    levels: ['info', 'warn', 'error'],
  },
};
```

Use root `levels` as rule defaults, with extra info for one area:

```ts
setLoggerConfig({
  levels: ['warn', 'error'],
  rules: {
    'custom:build-info': {
      group: 'build.pipeline',
      levels: ['info', 'warn', 'error'],
    },
    'custom:runtime-defaults': {
      group: 'runtime.*',
      levels: 'inherit',
    },
  },
});
```

Delete an imported preset rule:

```ts
setLoggerConfig({
  plugins: { runtime },
  extends: ['runtime/recommended'],
  rules: {
    'runtime/reactComponentManager': 'off',
  },
});
```

## Related

- [Rule Mode](feature-rule-mode.md)
- [Configuration Guide](guide-configuration.md)
- [Log Groups](concept-log-groups.md)
