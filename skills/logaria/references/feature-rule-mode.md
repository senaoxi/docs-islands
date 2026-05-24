# Rule Mode

Use this short reference when debugging rule visibility.

## Activation

Rule mode is active when normalized config has at least one resolved rule.

```ts
setLoggerConfig({
  rules: {
    'custom:focus-build': {
      group: 'build.*',
      levels: ['info', 'warn', 'error'],
    },
  },
});
```

## Matching

All provided fields on a rule must match:

- `main`: exact package or subsystem match
- `group`: exact match unless documented glob syntax is present (`*`, `?`, `[]`)
- `message`: exact match unless documented glob syntax is present (`*`, `?`, `[]`)
- `levels`: explicit levels, or `levels: 'inherit'` to use root levels and then the default resolved levels

## Gotchas

- Unmatched logs are hidden.
- Root `levels` can feed scope-matched rules that use `levels: 'inherit'`, but cannot show unmatched logs.
- `'off'` deletes a rule during normalization. If no resolved rules remain, the logger falls back to default no-rule behavior.
- `debug` is not a rule level.
- Current runtime suppresses `logger.debug()` while rules are active.
- With `debug: true`, visible non-debug rule logs include contributing rule labels and elapsed timing when `{ elapsedTimeMs }` is provided.
- Public `rules` is an object map. The map key is the label; do not put `label` inside custom rule objects.

## Related

- [Rule Config](config-rules.md)
- [Configuration Guide](guide-configuration.md)
- [Log Groups](concept-log-groups.md)
