# Rules & Presets

Rules switch Logaria from a broad level filter to an allowlist. Once at least one rule resolves, a log must match a rule and that rule must allow the log level. Unmatched logs do not fall back to root `levels`.

## Rule Mode

Use the `rules` map when you need focused visibility:

```ts
import { setLoggerConfig } from 'logaria';

setLoggerConfig({
  debug: true,
  levels: ['warn', 'error'],
  rules: {
    'custom:metrics': {
      main: '@acme/docs',
      group: 'userland.metrics',
      message: '*timeout*',
      levels: ['info', 'warn'],
    },
  },
});
```

The map key is the rule label. In debug mode, visible rule-based logs include the matching label.

## Rule Fields

| Field     | Meaning                                                                 |
| --------- | ----------------------------------------------------------------------- |
| map key   | Required unique label.                                                  |
| `main`    | Exact package or subsystem match.                                       |
| `group`   | Exact match by default, or glob match when glob characters are present. |
| `message` | Exact match by default, or glob match when glob characters are present. |
| `levels`  | Required. Use explicit levels or `'inherit'` to inherit root levels.    |

`group` and `message` use exact matching unless the string contains glob syntax such as `*`, `?`, `[a-z]`, or braces.

## Preset Plugins

Preset plugins register named rule templates and optional configs. Registration alone does not enable rules. Enable preset behavior through `extends` or through `rules` references.

```ts
import type { LoggerPresetPlugin } from 'logaria/types';
import { setLoggerConfig } from 'logaria';

const viteLoggingPlugin = {
  rules: {
    build: {
      main: '@acme/vite',
      group: 'build.pipeline',
    },
    hmr: {
      main: '@acme/vite',
      group: 'dev.hmr',
    },
  },
  configs: {
    recommended: {
      rules: {
        build: { levels: 'inherit' },
        hmr: { levels: 'inherit' },
      },
    },
  },
} satisfies LoggerPresetPlugin;

setLoggerConfig({
  plugins: {
    vite: viteLoggingPlugin,
  },
  extends: ['vite/recommended'],
  rules: {
    'vite/hmr': {
      levels: ['warn', 'error'],
      message: '*slow*',
    },
    'custom:api-timeout': {
      group: 'api.*',
      message: '*timeout*',
      levels: ['warn'],
    },
  },
});
```

## Precedence

Config resolves in this order:

1. `plugins` registers preset rule templates.
2. `extends` imports plugin-provided configs.
3. `rules` applies the final override layer.

Preset rule settings support:

| Setting | Meaning                                                                                               |
| ------- | ----------------------------------------------------------------------------------------------------- |
| `'off'` | Delete the preset rule after expansion.                                                               |
| object  | Enable or override the rule; provided `main`, `group`, `message`, and `levels` override the template. |

Use custom labels such as `custom:api-timeout` for project-owned rules that are not tied to a preset plugin.
