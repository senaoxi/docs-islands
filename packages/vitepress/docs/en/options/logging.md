# `logging`

<script lang="react">
  import LoggingPresetCatalog from '../../components/react/LoggingPresetCatalog';
  import LoggerScopePlayground from '../../components/react/LoggerScopePlayground';
</script>

`logging` controls the package-owned logs emitted by `createDocsIslands()` and the public logger helpers exposed by this package. It does not change rendering; it only decides which `@docs-islands/*` messages stay visible in Node and in the browser.

Each `createDocsIslands()` instance owns an isolated logger scope. VitePress injects that scope into the build graph, and the shared `logaria` runtime reads it when no explicit scope is passed. Parallel VitePress instances or test runs therefore do not overwrite each other's logging config. Use `logaria` for framework-agnostic direct logger usage.

## When to Use It

Use `logging` when the integration works but the console is too noisy, or when you need focused diagnostics for one docs-islands subsystem. During normal setup you may only keep `warn` and `error`; during investigation you can enable `debug` to see which rule allowed a visible log and how long the logger has been active.

## Minimal Example

```ts [.vitepress/config.ts]
import { createDocsIslands } from '@docs-islands/vitepress';
import { react } from '@docs-islands/vitepress/adapters/react';
import { vitepress as vitepressLogger } from '@docs-islands/vitepress/logger/presets';

const islands = createDocsIslands({
  adapters: [react()],
  logging: {
    levels: ['warn', 'error'],
    plugins: { vitepress: vitepressLogger },
    extends: ['vitepress/hmr'],
    rules: {
      'vitepress/markdownUpdate': 'off',
    },
  },
});

islands.apply(vitepressConfig);
```

This imports the VitePress HMR rule set, lets those rules inherit the root `warn` / `error` levels, and then removes `vitepress/markdownUpdate` from the resolved rules.

## Mental Model

When `logging.rules` is not configured, the logger uses the default visibility set:

- `debug: false`: `error`, `warn`, `info`, and `success` are visible.
- `debug: true`: `error`, `warn`, `info`, `success`, and `debug` are visible.

When `logging.extends` or `logging.rules` produces resolved rules, the logger switches to rule mode:

1. `plugins` only registers rule templates. It does not enable any rule by itself.
2. `extends` imports plugin configs such as `vitepress/hmr` and expands local rule ids into full rule ids.
3. `rules` is applied last. An object enables or overrides a rule, and `'off'` deletes that rule so no resolved rule is emitted.
4. Every resolved rule is checked against the log's `main`, `group`, and `message`. Declared fields use AND semantics.
5. A matching rule uses `rule.levels ?? logging.levels ?? defaultResolvedLevels` as its effective levels.
6. A log is visible when at least one matching resolved rule allows the current level. If rule mode is active but no rule matches, nothing is printed.

If every imported rule is deleted and no resolved rules remain, the logger falls back to the default no-rule behavior.

Multiple rules can contribute to the same log. Their allowed levels form a union, and debug labels keep the declaration order from `logging.rules`.

## Root Options

| Option      | Meaning                                                                                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `debug`     | Enables diagnostic output. Visible `error`, `warn`, `info`, and `success` logs include matching labels and a relative elapsed-time suffix such as `12.34ms`. |
| `levels`    | Root visibility set. In rule mode, it is the default effective levels for rules that use `levels: 'inherit'`; it is not a maximum that narrows rules.        |
| `plugins`   | Optional preset-plugin registry. The object key becomes the namespace used by `logging.rules["<plugin>/<rule>"]`.                                            |
| `extends`   | Optional list of plugin configs such as `"vitepress/runtime"` to import before user rule overrides.                                                          |
| `rules`     | Final rule override map keyed by custom labels or preset references such as `"vitepress/viteAfterUpdate"`. Objects require `levels`; `'off'` deletes a rule. |
| `treeshake` | Controls the managed VitePress logger tree-shaking transform. Defaults to `false`; set `true` to enable build-time pruning.                                  |

## Plugin Rules

`logging.plugins` is the recommended entrypoint when you only want to filter docs-islands internal logs.

```ts
import { vitepress as vitepressLogger } from '@docs-islands/vitepress/logger/presets';

const logging = {
  debug: true,
  levels: ['warn'],
  plugins: { vitepress: vitepressLogger },
  extends: ['vitepress/hmr', 'vitepress/runtime'],
  rules: {
    'vitepress/viteAfterUpdate': {
      levels: ['warn', 'error'],
    },
    'vitepress/reactDevRender': {
      levels: ['warn', 'error'],
    },
    'vitepress/renderValidation': 'off',
  },
};
```

- `plugins` registers the built-in VitePress preset plugin under the `vitepress` namespace.
- `extends: ["vitepress/<config>"]` imports one of the built-in preset configs.
- `rules["<plugin>/<rule>"] = { levels: 'inherit' }` enables the preset rule with its template matcher and root levels.
- `rules["<plugin>/<rule>"] = 'off'` deletes that preset rule from the resolved config.
- The override object can set `main`, `group`, `message`, and `levels`; provided fields override the preset template fields.

### Built-in Presets and Coverage

The `vitepress` preset exported by `@docs-islands/vitepress/logger/presets` contains predefined `main/group` matchers for built-in docs-islands log streams. It exposes grouped configs such as `vitepress/hmr`, plus `vitepress/recommended` for all rules. The catalog below lists every config, every rule, and its default matcher.

<LoggingPresetCatalog
  client:load
  spa:sync-render
  locale="en"
/>

## Public Logger Usage

`@docs-islands/vitepress/logger` is the VitePress logger facade. It exposes `createLogger`; shared helpers such as `formatDebugMessage` live in `logaria/helper`, and generic direct runtime configuration lives in `logaria`.

`logging` defines the runtime visibility policy. It decides whether a log is emitted at runtime, and in `debug` mode it also controls which rule labels and elapsed-time metadata are attached to visible logs.

`logaria` stays framework-agnostic. In managed VitePress builds, `createDocsIslands()` resolves `@docs-islands/vitepress/logger` to a scope-bound virtual module, so each integration instance uses its own logger registry entry.

Monorepo packages that need a single runtime logger entry should use `@docs-islands/utils/logger`. It falls back to `logaria` when no host controls it, and VitePress rewrites it to `@docs-islands/vitepress/logger` when bundling controlled internal modules.

### Entry Ownership

| Situation                                                  | Import from                      | Config owner                                     |
| ---------------------------------------------------------- | -------------------------------- | ------------------------------------------------ |
| Code processed by the managed VitePress Vite pipeline      | `@docs-islands/vitepress/logger` | `createDocsIslands({ logging })`                 |
| VitePress internals that already carry a `loggerScopeId`   | `logaria/core`                   | The current `createDocsIslands()` instance       |
| Reusable docs-islands packages that may need host takeover | `@docs-islands/utils/logger`     | Host alias when bundled, otherwise root fallback |
| Framework-agnostic user code outside the managed graph     | `logaria`                        | The root logger runtime or `loggerPlugin`        |
| Shared formatting and elapsed-time helpers                 | `logaria/helper`                 | No runtime config                                |

`@docs-islands/vitepress/logger` is not a generic logger entry. Do not call it from `.vitepress/config.ts` or from standalone Node scripts; those files run before the Vite module graph can replace the facade with the active scope-bound virtual module.

For this package, the project-level constraints are:

- Use `@docs-islands/vitepress/logger` for logs that are created inside the Vite module graph owned by `createDocsIslands()`. This is the only entry covered by VitePress automatic scope injection and VitePress automatic tree-shaking.
- Use `logaria/core` only for VitePress internals that run outside that Vite graph but already receive the active `loggerScopeId`. Those callers must register or consume an explicit scope through the core API.
- A reusable monorepo package should use `@docs-islands/utils/logger` as its runtime logger entry. It falls back to the generic logger outside managed bundling, and VitePress aliases it to `@docs-islands/vitepress/logger` when the package must participate in the current `createDocsIslands()` scope.
- A reusable package that does not need VitePress takeover should use the generic `logaria` entry. If a host installs `loggerPlugin`, that generic default scope becomes plugin-controlled; otherwise it remains directly configurable with `setLoggerConfig(...)` / `resetLoggerConfig()`.
- Shared formatting, elapsed-time, and diagnostic helpers should come from `logaria/helper` or `logaria/core/helper`; do not import a runtime logger entry only to access helpers.

`@docs-islands/vitepress` may contain `@docs-islands/vitepress/logger`, `@docs-islands/utils/logger`, and lower-level `logaria/*` imports. They intentionally represent different ownership models: the VitePress facade is tied to the current `createDocsIslands()` scope, the utils facade is the monorepo fallback-or-controlled entry, and lower-level logger imports provide helper, type, plugin, or explicit scope APIs.

### Runtime Policy vs Build-Time Optimization

The logger tree-shaking plugin is a build-time optimization layer. It reuses the resolved `logging` rules to prune statically analyzable logger calls during build.

These two layers are related, but they are not the same thing:

- `logging` always defines runtime behavior.
- The tree-shaking plugin only handles the static subset it can prove safely.
- If a log cannot be analyzed statically, it stays in the output and is still filtered by the runtime logger.

So a runtime-suppressed log is not automatically a pruned log.

| Dimension                                   | `logging`          | logger tree-shaking plugin           |
| ------------------------------------------- | ------------------ | ------------------------------------ |
| Stage                                       | Runtime            | Build                                |
| Controls final console output               | Yes                | No, runtime stays canonical          |
| Removes static message text from the bundle | No                 | Yes, for the supported static subset |
| Reuses the resolved `logging` rules         | Yes                | Yes                                  |
| Coverage                                    | Full runtime model | Static, provable subset only         |
| Fallback when analysis is not possible      | Runtime matching   | Keep the call and defer to runtime   |

Configure visibility in `.vitepress/config.ts`:

```ts [.vitepress/config.ts]
import { createDocsIslands } from '@docs-islands/vitepress';
import { react } from '@docs-islands/vitepress/adapters/react';

const islands = createDocsIslands({
  adapters: [react()],
  logging: {
    debug: true,
    rules: {
      'custom:userland-metrics': {
        main: '@acme/custom-docs',
        group: 'userland.metrics',
        levels: ['info'],
      },
    },
  },
});

islands.apply(vitepressConfig);
```

Then import the facade from modules that are actually handled by the managed Vite graph:

```ts [src/userland-metrics.ts]
import { createLogger } from '@docs-islands/vitepress/logger';

const logger = createLogger({
  main: '@acme/custom-docs',
}).getLoggerByGroup('userland.metrics');
const hiddenLogger = createLogger({
  main: '@acme/custom-docs',
}).getLoggerByGroup('userland.hidden');

logger.info('visible userland info');
hiddenLogger.info('suppressed userland info');
```

With this setup, `userland.metrics` stays visible, while `userland.hidden` is suppressed. If you later change `createLogger({ main: ... })`, update your rules to match that `main` or remove the `main` filter.

### Logger Tree-Shaking Plugin

In `createDocsIslands()` managed builds, docs-islands can install a logger tree-shaking transform when `logging.treeshake` is enabled. This VitePress transform only targets `@docs-islands/vitepress/logger` imports in the managed VitePress module graph, including user component browser/SSR bundles and Vite-bundled runtime modules such as the unified loader. It does not prune framework-agnostic `logaria` imports.

Set `logging.treeshake: true` when you want build-time pruning in addition to the managed VitePress logger facade and runtime filtering.

The shared utils facade participates in this takeover. For example, `@docs-islands/core` imports `@docs-islands/utils/logger`; the VitePress package rewrites that facade to `@docs-islands/vitepress/logger` while building its own output. Keeping the rewritten import external in the VitePress package output is intentional: the final consumer site's Vite pipeline must still see and resolve `@docs-islands/vitepress/logger` so the scope-bound virtual module and VitePress tree-shaking transform can run. Do not externalize `@docs-islands/vitepress/logger` in the consumer site's Vite build.

If you use the framework-agnostic `logaria` entry in a VitePress site and still want production pruning for that generic logger, install the public plugin explicitly:

```ts [.vitepress/config.ts]
import { defineConfig } from 'vitepress';
import { loggerPlugin } from 'logaria/plugin';

export default defineConfig({
  vite: {
    plugins: [
      loggerPlugin.vite({
        config: {
          levels: ['warn', 'error'],
        },
      }),
    ],
  },
});
```

`loggerPlugin` controls the generic logger runtime config and enables tree-shaking by default. If `config` is omitted, the plugin uses the default logger visibility policy, which still prunes statically analyzable `debug` logs. Use `treeshake: false` when you want runtime control without build-time pruning. In this controlled generic runtime, application code must not call `setLoggerConfig(...)` or `resetLoggerConfig()`; update the plugin `config` instead.

### Production Tree-Shaking

When the tree-shaking transform is active, a static user-authored log that is provably suppressed by the resolved `logging` rules is removed from the generated JavaScript, so its static message text does not stay in the bundle.

Use this direct shape when you want pruning coverage:

```ts
import { createLogger } from '@docs-islands/vitepress/logger';

const logger = createLogger({
  main: '@acme/custom-docs',
}).getLoggerByGroup('userland.metrics');

logger.info('static metric ready');
logger.success('static metric uploaded');
logger.warn('static metric delayed');
logger.error('static metric failed');
logger.debug('static metric details');
```

The VitePress optimizer only analyzes this constrained static form:

- `createLogger` must be a named import from `@docs-islands/vitepress/logger`.
- `main`, `getLoggerByGroup(...)`, and the log message must all be string literals.
- The log call must be a standalone statement such as `logger.info('message')`.

| Pattern                                                                     | Included in pruning |
| --------------------------------------------------------------------------- | ------------------- |
| `const logger = createLogger({ main: 'x' }).getLoggerByGroup('y')`          | Yes                 |
| `logger.info('msg')` / `warn` / `error` / `success` / `debug`               | Yes                 |
| Template strings, concatenation, variables, dynamic `main`, dynamic `group` | No                  |
| Aliasing, destructuring, reassignment, dynamic method access                | No                  |
| Non-standalone expressions such as `const result = logger.info('msg')`      | No                  |

Dynamic logs still work, but they are intentionally left for runtime filtering:

```ts
logger.info(`metric ${name}`);
logger.info(`metric ${name}`);
logger.info(message);
createLogger({ main }).getLoggerByGroup(group).info('dynamic binding');
```

Those forms remain compatible, but docs-islands does not guarantee that their message text disappears from production output. Pruning coverage is a static subset of runtime logging coverage, not a replacement for it.

### Generic Logger Usage

For direct logger usage outside VitePress managed builds, import from the framework-agnostic package:

```ts
import { createLogger, resetLoggerConfig, setLoggerConfig } from 'logaria';

setLoggerConfig({
  levels: ['warn', 'error'],
});

const logger = createLogger({
  main: '@acme/custom-docs',
}).getLoggerByGroup('userland.metrics');

logger.warn('visible generic warning');

resetLoggerConfig();
```

Without `loggerPlugin`, this generic runtime uses the default scope and can be configured directly with `setLoggerConfig(...)` / `resetLoggerConfig()`, but it is not covered by the automatic VitePress tree-shaking transform. `@docs-islands/vitepress/logger` should not be used as a generic logger entry. It is reserved for the VitePress build graph established by `createDocsIslands()`.

### Interactive Scope Probe

The playground below runs the VitePress logger facade from inside this docs site:

- A normal `@docs-islands/vitepress/logger` import uses the current `createDocsIslands()` logger scope through runtime injection.
- The framework-agnostic `logaria` runtime demo lives on the standalone logger package page.

<LoggerScopePlayground
  client:load
  spa:sync-render
  locale="en"
/>

::: warning Reusing Built-in `main/group`

If your user-authored logs intentionally or accidentally reuse the same `main` / `group` values as built-in docs-islands logs, they may also match the same preset rules or direct `logging.rules` entries:

- Your user logs may become visible or suppressed together with built-in logs.
- In `debug` mode, they may show the same rule labels as built-in logs, which makes diagnosis noisier.
- Later tuning of built-in preset coverage can unintentionally affect your user logs too.

Unless you explicitly want both streams to share the same filtering space, prefer a dedicated namespace such as `@acme/custom-docs` with `userland.*`.

:::

## Custom Rule Fields

Custom rules live in the same `logging.rules` object map as preset rules. Use a key without `/`; that key becomes the debug label. The public custom rule object does not accept `label`.

| Field     | Meaning                                                                                                                                            |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| map key   | Required stable identifier. When `debug` is enabled, visible logs show contributing labels as `[LabelA][LabelB]`.                                  |
| `main`    | Optional exact package match, for example `@docs-islands/vitepress`. Glob patterns are not applied to `main`.                                      |
| `group`   | Optional logger group matcher. Plain strings are exact; patterns with glob magic use `picomatch`, for example `runtime.react.*` or `test.case.?1`. |
| `message` | Optional message matcher. Plain strings are exact; patterns with glob magic use `picomatch`, for example `*timeout*`, `request *`, or `task-[ab]`. |
| `levels`  | Required. Use an explicit level list, or `levels: 'inherit'` to inherit root `logging.levels` and then the default resolved levels.                |

## Matching Examples

Custom rules remain useful when you want broad wildcards or message-text filtering that is not tied to one preset label.

```ts
const islands = createDocsIslands({
  adapters: [react()],
  logging: {
    debug: true,
    levels: ['warn'],
    rules: {
      'custom:react-runtime-warnings': {
        main: '@docs-islands/vitepress',
        group: 'runtime.react.*',
        levels: 'inherit',
      },
      'custom:runtime-timeouts': {
        group: 'runtime.*',
        message: '*timeout*',
        levels: ['error'],
      },
    },
  },
});
```

A `warn` from `runtime.react.component-manager` is visible through `react-runtime-warnings`. An `error` message containing `timeout` is visible through `runtime-timeouts`. If one log matches both rules and its level is allowed by both, debug mode prints both labels in declaration order.

Debug output looks like this:

```bash
[react-runtime-warnings][runtime-timeouts] @docs-islands/vitepress[runtime.react.component-manager]: request timeout 12.34ms
```

## Common Patterns

### Keep Only Warnings and Errors for React Runtime Logs

```ts
const islands = createDocsIslands({
  adapters: [react()],
  logging: {
    levels: ['warn', 'error'],
    rules: {
      'custom:react-runtime-warn-error': {
        main: '@docs-islands/vitepress',
        group: 'runtime.react.*',
        levels: 'inherit',
      },
    },
  },
});
```

### Combine a Broad Rule with a Specific Message Rule

```ts
const islands = createDocsIslands({
  adapters: [react()],
  logging: {
    levels: ['warn'],
    rules: {
      'custom:runtime-warnings': {
        group: 'runtime.*',
        levels: 'inherit',
      },
      'custom:timeout-errors': {
        message: '*timeout*',
        levels: ['error'],
      },
    },
  },
});
```

This keeps runtime warnings while also allowing timeout errors anywhere. The two rules do not override each other; they contribute together.

### Temporarily Disable One Preset Rule

```ts
const islands = createDocsIslands({
  adapters: [react()],
  logging: {
    plugins: { vitepress: vitepressLogger },
    extends: ['vitepress/runtime'],
    rules: {
      'vitepress/reactComponentManager': 'off',
    },
  },
});
```

The deleted preset rule does not emit a resolved rule, so it cannot match, allow levels, or appear in debug labels. Other imported `vitepress/runtime` rules remain active.

### Filter by Message Text

```ts
const islands = createDocsIslands({
  adapters: [react()],
  logging: {
    rules: {
      'custom:hydration-timeouts': {
        message: '*hydration*timeout*',
        levels: ['warn', 'error'],
      },
    },
  },
});
```

Use message rules for short investigation windows, especially when a noisy group contains only a few messages you care about.
