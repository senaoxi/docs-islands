# Simple Configuration

Use simple config when visibility can be expressed with a `levels` allowlist and optional debug diagnostics.

## Shape

```ts
import { setLoggerConfig } from 'logaria';

setLoggerConfig({
  debug: false,
  levels: ['info', 'success', 'warn', 'error'],
});
```

`levels` accepts only `error`, `warn`, `info`, and `success`. `debug` is controlled by the separate `debug` flag.

## Production Preset

```ts
setLoggerConfig({
  levels: ['warn', 'error'],
});
```

## Development Preset

```ts
setLoggerConfig({
  debug: true,
  levels: ['info', 'success', 'warn', 'error'],
});
```

## Quiet Preset

```ts
setLoggerConfig({
  levels: ['error'],
});
```

## Environment-Based Config

```ts
const isProduction = process.env.NODE_ENV === 'production';

setLoggerConfig({
  debug: !isProduction,
  levels: isProduction ? ['warn', 'error'] : ['info', 'success', 'warn', 'error'],
});
```

## Notes

- `levels` is an allowlist, not a threshold. `['warn', 'error']` hides `info` and `success`.
- In simple config, `debug: true` enables `logger.debug()` output.
- Elapsed timing options are rendered for visible non-debug logs when debug diagnostics are enabled.
- Prefer simple config for most applications; use rules only when a focused area needs different visibility.

## Related

- [Configuration Guide](guide-configuration.md)
- [Rule Config](config-rules.md)
- [Log Levels](concept-log-levels.md)
