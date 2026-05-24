---
name: logaria
description: Production guidance for using logaria in applications, libraries, framework hosts, tests, and bundler configs. Use when adding logger calls, choosing runtime visibility, configuring rules, enabling build-time pruning, integrating explicit scoped logging, reviewing package usage, or debugging why logs are shown, hidden, or not tree-shaken.
---

# logaria

Use this skill to make production-safe decisions for `logaria`.

## Workflow

1. Identify the config owner before adding code:
   - Direct app, script, or CLI: use the root entry and configure with `setLoggerConfig()`.
   - Bundler-controlled runtime: use `loggerPlugin.*({ config })`; runtime `setLoggerConfig()` throws.
   - Reusable library: create loggers, but do not configure global visibility at module init.
   - Framework or host integration: create an explicit scope with `logaria/core`.
2. Pick the smallest relevant reference:
   - First production setup: [Getting started](references/guide-getting-started.md)
   - Ownership and defaults: [Configuration guide](references/guide-configuration.md)
   - `levels` allowlists: [Simple config](references/config-simple.md)
   - Rule allowlists: [Rule config](references/config-rules.md)
   - Bundler control: [Plugin guide](references/guide-plugin.md)
   - Build pruning: [Tree-shaking](references/feature-tree-shaking.md)
   - Framework-owned scopes: [Scoped integration](references/guide-scoped-integration.md)
   - Function signatures: [API reference](references/reference-api.md)
3. Preserve production behavior:
   - Keep `main`, `group`, and static log messages as string literals when build-time pruning matters.
   - Pass arbitrary context by formatting it into the message first; logger methods do not accept metadata objects.
   - Prefer simple `levels` config first; use `rules` only for focused allowlists.
   - Reset logger config in tests that mutate the default or scoped runtime policy.

## Guardrails

- `levels` is an explicit allowlist for `error`, `warn`, `info`, and `success`.
- `debug` is not a level. In simple config, `debug: true` emits `logger.debug()`.
- When normalized rules exist, non-debug logs become allowlisted by resolved rules whose scope and effective levels both match; unmatched logs do not fall back to root `levels`.
- In current runtime behavior, `logger.debug()` is suppressed when rule mode is active. `debug: true` in rule mode adds contributing rule labels to visible non-debug logs and renders elapsed timing when `{ elapsedTimeMs }` is provided.
- `info()`, `success()`, `warn()`, and `error()` accept `message` plus optional `{ elapsedTimeMs }`; `debug()` accepts only `message`.
- Use `formatErrorMessage()` and `formatDebugMessage()` from `logaria/helper` to turn structured data into strings before logging.
- `createScopedLogger()` requires a registered scope config first; call `setScopedLoggerConfig(scopeId, config)` before creating scoped loggers.
- Rollup users must have `@rollup/plugin-replace` available before `loggerPlugin.rollup(...)`.

## Reference Map

- [Getting Started](references/guide-getting-started.md) - install and first production-safe logger
- [Configuration Guide](references/guide-configuration.md) - choose direct, plugin, library, or scoped ownership
- [Simple Config](references/config-simple.md) - root `levels` and `debug`
- [Rule Config](references/config-rules.md) - rule matching and allowlist behavior
- [Rule Mode](references/feature-rule-mode.md) - concise behavior summary and gotchas
- [Log Levels](references/concept-log-levels.md) - level semantics and message style
- [Log Groups](references/concept-log-groups.md) - `main` and `group` naming
- [Plugin Guide](references/guide-plugin.md) - Vite/Rollup/Rolldown/esbuild/webpack/Rspack/Farm setup
- [Plugin Config](references/config-plugin.md) - plugin options and controlled runtime behavior
- [Tree-Shaking](references/feature-tree-shaking.md) - supported static shapes
- [Scoped Integration](references/guide-scoped-integration.md) - framework/host workflow
- [Scoped API](references/api-scoped.md) - explicit scope function signatures
- [Scoped Config](references/config-scoped.md) - per-scope config patterns
- [API Reference](references/reference-api.md) - public imports and signatures
