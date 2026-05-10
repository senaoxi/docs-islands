# Rule Mode

Use this short reference when debugging rule visibility.

## Activation

Rule mode is active when normalized config has at least one rule.

```ts
setLoggerConfig({
  rules: [
    {
      label: 'focus-build',
      group: 'build.*',
      levels: ['info', 'warn', 'error'],
    },
  ],
});
```

## Matching

All provided fields on a rule must match:

- `main`: exact package or subsystem match
- `group`: exact match unless documented glob syntax is present (`*`, `?`, `[]`)
- `message`: exact match unless documented glob syntax is present (`*`, `?`, `[]`)
- `enabled: false`: rule is ignored

## Gotchas

- Unmatched logs are hidden.
- Root `levels` can feed scope-matched rules that omit `levels`, but cannot show unmatched logs.
- `debug` is not a rule level.
- Current runtime suppresses `logger.debug()` while rules are active.
- With `debug: true`, visible non-debug rule logs include contributing rule labels and elapsed timing when `{ elapsedTimeMs }` is provided.

## Related

- [Rule Config](config-rules.md)
- [Configuration Guide](guide-configuration.md)
- [Log Groups](concept-log-groups.md)
