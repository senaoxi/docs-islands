# Bundler Plugin Guide

Use `@docs-islands/logger/plugin` when production bundles should receive injected runtime config and build-time pruning.

## Vite

```ts
import { defineConfig } from 'vite';
import { loggerPlugin } from '@docs-islands/logger/plugin';

export default defineConfig({
  plugins: [
    loggerPlugin.vite({
      config: { levels: ['warn', 'error'] },
      treeshake: true,
    }),
  ],
});
```

## Supported Adapters

```ts
loggerPlugin.vite(options);
loggerPlugin.rollup(options);
loggerPlugin.rolldown(options);
loggerPlugin.esbuild(options);
loggerPlugin.webpack(options);
loggerPlugin.rspack(options);
loggerPlugin.farm(options);
```

Rollup hosts must install `@rollup/plugin-replace`; the logger plugin uses it to inline control constants.

## Production Contract

- Plugin `config` becomes the default runtime config inside the bundle.
- Application calls to `setLoggerConfig()` and `resetLoggerConfig()` throw in plugin-controlled runtimes.
- Build-time pruning uses the same config, but only removes supported static shapes.
- `treeshake` defaults to `true`; set `false` to keep all calls and rely on runtime filtering.

## Environment-Based Config

```ts
const isProduction = process.env.NODE_ENV === 'production';

loggerPlugin.vite({
  config: {
    debug: !isProduction,
    levels: isProduction ? ['warn', 'error'] : ['info', 'success', 'warn', 'error'],
  },
  treeshake: isProduction,
});
```

## Related

- [Plugin Config](config-plugin.md)
- [Tree-Shaking](feature-tree-shaking.md)
- [Configuration Guide](guide-configuration.md)
