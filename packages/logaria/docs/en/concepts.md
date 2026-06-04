# Core Concepts

Three ideas explain almost all of Logaria's behavior: the two filtering modes, who owns a scope, and why the runtime — not the bundler — is the source of truth. This page is the model that the how-to pages assume.

## Level mode vs rule mode

Logaria filters in one of two modes, and the rule for which one you are in is simple:

> If the resolved config has **zero** rules, you are in **level mode**. If it has **one or more**, you are in **rule mode**.

```ts
// Level mode — `levels` is the allowlist.
setLoggerConfig({ levels: ['warn', 'error'] });

// Rule mode — a single rule turns the config into a focused allowlist.
setLoggerConfig({
  levels: ['warn', 'error'],
  rules: {
    'build-flow': { group: 'build.pipeline', levels: ['info', 'warn'] },
  },
});
```

The two modes differ in every meaningful way:

|                    | Level mode (no rules)                    | Rule mode (≥ 1 rule)                                                             |
| ------------------ | ---------------------------------------- | -------------------------------------------------------------------------------- |
| What filters       | the global `levels` allowlist            | a rule match (`main` / `group` / `message`) **and** that rule's effective levels |
| An unmatched log   | n/a                                      | **dropped** — there is no fallback to `levels`                                   |
| Role of `levels`   | the allowlist itself                     | the default for rules that say `levels: 'inherit'`                               |
| `logger.debug()`   | shown only if `debug: true`              | **always suppressed**                                                            |
| `debug: true` adds | reveals `debug()` + appends elapsed time | `[label]` prefixes + elapsed time on non-debug logs only                         |

::: info
An empty `rules` object, or rules that are all set to `'off'`, normalize to **no rules** — so the config stays in level mode.
:::

## How a Log Is Decided

When you call a logger method, Logaria decides visibility in a fixed order:

1. **Resolve the config.** `plugins` register rule templates → `extends` activates named preset configs → `rules` applies the final override layer.
2. **Check for rules.** If the resolved config has no rules, use level mode; otherwise use rule mode.
3. **Level mode** — the log is shown when its level is listed in `levels`, and suppressed otherwise.
4. **Rule mode** — keep the rules whose scope matches the log (`main` exact; `group` / `message` exact or glob). Among those, the **contributing** rules are the ones whose effective levels include this log's level. The log is shown when at least one contributing rule exists.
5. **Effective levels** of a rule are `rule.levels` if set, otherwise the config's `levels`, otherwise the built-in default (`['info', 'success', 'warn', 'error']`).

The labels shown in debug mode come from the **contributing** rules only — a rule that matches the scope but not the level neither shows the log nor contributes its label.

::: info Matching
`main` is matched exactly — even a value containing `*` is treated literally. `group` and `message` are matched exactly too, unless they contain glob characters (`*`, `?`, `[]`, `{}`), in which case they upgrade to glob matching.
:::

## Debug Across the Two Modes

`debug` is the one knob whose meaning depends on the mode:

- **Level mode** — `debug: true` reveals `logger.debug()` output and appends elapsed time to visible non-debug logs that pass an elapsed option.
- **Rule mode** — `logger.debug()` is **always suppressed**, even with `debug: true`. The flag only adds the matching `[label]` prefixes and elapsed time to the non-debug logs that rules let through; it never reveals `debug()`.

So once any rule resolves, `logger.debug()` goes quiet. If you need diagnostic output under rules, raise it to `info` or add a rule that targets it. See [Runtime Config — Debug Mode](./runtime-config.md#debug-mode) for the level-mode knob and [Rules & Presets](./rules-and-presets.md) for rule mode.

## Ownership and Scopes

Every logger reads from a **scope**. There is one default scope, plus any number of explicit scopes, and ownership of the default scope is exclusive.

| State                            | Who owns it        | Entry                        | What happens                                                          |
| -------------------------------- | ------------------ | ---------------------------- | --------------------------------------------------------------------- |
| Default scope, app-owned         | the application    | `logaria`                    | `setLoggerConfig` / `resetLoggerConfig` set the config                |
| Default scope, plugin-controlled | the bundler plugin | `logaria` + `logaria/plugin` | config is injected as build constants; runtime mutators throw         |
| Explicit scope                   | a host integration | `logaria/core`               | register with `setScopedLoggerConfig` before creating a scoped logger |

Under plugin control, calling a runtime mutator throws — verbatim:

```
logaria is controlled by loggerPlugin.vite({ config }). setLoggerConfig(...) and resetLoggerConfig() cannot be used in this runtime; update the loggerPlugin.vite({ config }) option in your bundler config instead.
```

Explicit scopes never touch the default scope. `createScopedLogger()` requires its scope to be registered first and throws if it is missing — Logaria refuses to fall back to the default scope silently.

::: warning One owner at a time
Exactly one entity owns the default scope at a time. A transitive dependency must never call `setLoggerConfig` — it should register an explicit scope instead, so it cannot quietly redirect or silence the application's logs.
:::

For the rationale, see [Why Logaria — Why Explicit Ownership](./why.md#why-explicit-ownership); for the how-to, see [Scoped Integrations](./scoped-integrations.md).

## Runtime Canonical, Build-Time Pruning

The runtime filter is the single source of truth for what prints. The [bundler plugin](./bundler-plugin.md) is an optimization layered on top: at build time it evaluates the same suppression decision the runtime would, and deletes only the calls it can prove are already dead.

Two properties follow:

- **Turn the plugin off and nothing changes** about which logs print. Pruning removes calls that were never going to pass the filter anyway.
- **The two cannot drift.** Under plugin control the runtime mutators throw, so "what the plugin pruned" and "what the runtime allows" are computed from one and the same config.

::: info Pruning is conservative
A call is removed only when every static fact holds: a named, unaliased `createLogger` import, literal `main` / `group` / message, a binding that is never reassigned, a standalone statement, and a build context with `treeshake: true`. Anything dynamic stays in the bundle and falls back to runtime filtering. See [Bundler Plugin — Tree-Shaking Coverage](./bundler-plugin.md#tree-shaking-coverage).
:::

## What to Read Next

- See the capabilities in action — [Features](./features.md)
- Tune level-mode output — [Runtime Config](./runtime-config.md)
- Write rules and presets — [Rules & Presets](./rules-and-presets.md)
- Prune at build time — [Bundler Plugin](./bundler-plugin.md)
- Own a private scope — [Scoped Integrations](./scoped-integrations.md)
