# Plugin Configuration

Use this reference for `loggerPlugin.*()` options and controlled runtime behavior.

## Options

```ts
interface LoggerPluginOptions {
  config?: LoggerConfig | null;
  treeshake?: boolean;
}
```

## Config

`config` is serialized into the bundle.

```ts
loggerPlugin.vite({
  config: {
    debug: false,
    levels: ['warn', 'error'],
  },
});
```

Omitting `config` injects the default visibility policy.

```ts
loggerPlugin.vite({
  treeshake: true,
});
```

## Treeshake

`treeshake` controls whether the plugin tries to remove statically suppressed logger calls during builds.

```ts
loggerPlugin.vite({ config, treeshake: true });
loggerPlugin.vite({ config, treeshake: false });
```

The runtime config remains canonical even when build-time pruning is disabled or cannot prove a call is removable.

## Controlled Runtime

When plugin config is present in a bundle:

- `setLoggerConfig()` throws.
- `resetLoggerConfig()` throws.
- Update the bundler `loggerPlugin.*({ config })` option instead.
- The same policy is used for runtime filtering and build-time pruning.

```ts
loggerPlugin.vite({
  config: { levels: ['warn', 'error'] },
});

// Later inside the bundled app:
setLoggerConfig({ levels: ['info'] }); // throws
```

## Bundler Notes

- Vite, esbuild, webpack, Rspack, and Farm receive defines through their native hooks.
- Rollup receives defines through `@rollup/plugin-replace`; ensure it is installed.
- Rolldown receives defines through `rolldown/plugins`.
- Tree-shaking runs only in build contexts, not Vite dev server usage.

## Related

- [Bundler Plugin Guide](guide-plugin.md)
- [Tree-Shaking](feature-tree-shaking.md)
- [Rule Config](config-rules.md)
