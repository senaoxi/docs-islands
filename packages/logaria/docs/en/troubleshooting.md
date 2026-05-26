# Troubleshooting

A short tour through the most common ways Logaria can surprise you — and the answer in each case.

## "Cannot call `setLoggerConfig()` under plugin control"

**Symptom**

```
Error: logaria is controlled by loggerPlugin.vite({ config }). setLoggerConfig(...) and
resetLoggerConfig() cannot be used in this runtime; update the loggerPlugin.vite({ config })
option in your bundler config instead.
```

**Why** — You installed [`loggerPlugin`](./bundler-plugin.md) in your bundler. The default scope is now controlled by the build constants the plugin injects, and the runtime APIs refuse to mutate it.

**Fix** — Edit the plugin `config` option in your bundler config:

```ts
loggerPlugin.vite({
  config: {
    levels: ['warn', 'error'],
  },
});
```

This applies to every adapter, not just Vite — the error message names the adapter you used. See [Runtime Config — Controlled Runtime](./runtime-config.md#controlled-runtime).

## Missing Scope ID

**Symptom**

```
Error: Logger config for scope "..." is not registered in this runtime. Call
setScopedLoggerConfig(scopeId, config) before creating a scoped logger.
```

**Why** — You called `createScopedLogger(options, scopeId)` before registering that scope.

**Fix** — Register the scope first:

```ts
import { createScopedLogger, setScopedLoggerConfig } from 'logaria/core';

setScopedLoggerConfig(scopeId, {
  levels: ['warn', 'error'],
});

const logger = createScopedLogger({ main: '@acme/host' }, scopeId).getLoggerByGroup('build');
```

::: tip Empty scope ids
An empty or whitespace-only string normalizes to the **default** scope id, which is rarely what you want. Always use `createLoggerScopeId()` or a non-empty stable string.
:::

## Rules Silently Drop Everything

**Symptom** — You added a `rules` block, and now nothing prints — not even errors that should obviously match.

**Why** — Once at least one rule resolves, Logaria switches to rule mode: unmatched logs are dropped and **do not** fall back to root `levels`.

**Fix options**

- Verify your rule matches: `main` is **exact**, `group` and `message` are exact unless they contain glob characters.
- Use `levels: 'inherit'` on a catch-all rule to keep root `levels` behaviour for other logs:

```ts
setLoggerConfig({
  levels: ['warn', 'error'],
  rules: {
    'custom:catch-all': {
      levels: 'inherit',
    },
    'custom:metrics': {
      group: 'userland.metrics',
      message: '*timeout*',
      levels: ['info', 'warn'],
    },
  },
});
```

See [Rules & Presets](./rules-and-presets.md) for full semantics.

## Glob Behaves Like Exact (or Vice Versa)

**Symptom** — A rule like `group: 'api.users'` does not match `api.users.detail`, or `group: 'api.*'` matches `api.users` but not `api`.

**Why** — Logaria upgrades a string to glob matching **only when it contains glob characters** (`*`, `?`, `[a-z]`, `{a,b}`). Otherwise it is an exact equality match.

**Fix**

- For prefix-style matching, use `api.*` or `api.**`.
- For one-of, use `{login,logout,refresh}`.
- For exact, drop the glob characters.

## `logger.debug()` Never Prints

**Symptom** — `debug` calls are completely silent even though `info` works.

**Why** — `debug` is controlled by the `debug` flag, not the `levels` list. By default, `debug: false` and debug output is hidden.

**Fix** — Set `debug: true`:

```ts
setLoggerConfig({
  debug: true,
  levels: ['info', 'success', 'warn', 'error'],
});
```

Under plugin control, set the same flag in `loggerPlugin({ config: { debug: true } })`.

## Tree-Shaking Did Not Remove a Call

**Symptom** — You enabled `treeshake: true` but a log call still appears in the production bundle.

**Why** — Pruning is intentionally conservative. A call is removed only when **every** static fact holds. Common reasons one fails:

- `createLogger` was imported with an alias (`import { createLogger as cl } from 'logaria'`).
- `main`, `group`, or the message is a template literal, variable, or computed expression rather than a string literal.
- The logger binding was reassigned.
- A method was destructured (`const { info } = logger`) or accessed via computed key (`logger['info']`).
- The log call is not a standalone expression (e.g. its result is assigned).
- The bundler is in dev or watch mode — pruning only runs in build mode.

**Fix** — Adjust the call site to fit the [supported static shape](./bundler-plugin.md#supported-static-shape), or accept that runtime filtering is doing its job and the call stays.

## `@rollup/plugin-replace` Not Installed

**Symptom**

```
Error: Failed to import module "@rollup/plugin-replace". Please ensure it is installed.
```

**Why** — `loggerPlugin.rollup(...)` requires `@rollup/plugin-replace` as a peer dependency; other adapters use their bundler's native define hook and do not need it.

**Fix**

```sh
pnpm add -D @rollup/plugin-replace
```

## Logs Print in Tests Across Files

**Symptom** — A `setLoggerConfig` call in one test changes the default scope and bleeds into the next test.

**Why** — The default scope is process-global. Mutating it from one test affects every other test running in the same worker.

**Fix** — Pair every `setLoggerConfig` call with `resetLoggerConfig`:

```ts
afterEach(() => {
  resetLoggerConfig();
});
```

For tests that need their own visibility policy without touching the default scope, use a [scoped integration](./scoped-integrations.md) and a generated `scopeId`.

## Still Stuck?

If a behaviour does not match anything on this page, please open an issue with:

- The Logaria version (`npm ls logaria`).
- A minimal repro — config shape and a single call site is usually enough.
- Whether the issue reproduces with `loggerPlugin` installed or only with the root runtime.
