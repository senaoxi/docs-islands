# Introduction

Logaria is a small, framework-agnostic logger for TypeScript packages, scripts, CLIs, and browser code. It gives application code a tiny logging API, keeps configuration ownership explicit, and pairs with an optional bundler plugin that prunes statically suppressed log calls at build time.

The smallest useful logger is a couple of lines:

```ts
import { createLogger } from 'logaria';

const logger = createLogger({ main: '@acme/docs' }).getLoggerByGroup('build.pipeline');

logger.info('build started');
```

## The Big Idea: Logs That Disappear

A logger should let you do three things, in this order:

1. **Write logs freely** in library, script, and application code, through one tiny API.
2. **Filter them at runtime** — by level, group, message, or preset rule — without recompiling to change what is visible.
3. **Prune the suppressed ones** at build time, but only when they can be statically proven dead, so production bundles stay small.

The runtime filter is the source of truth; build-time pruning is an optimization layered on top.

::: info Runtime stays canonical
Turn the bundler plugin off and the same logs print. The plugin never changes _which_ logs are visible — it only removes calls it can prove the runtime would have suppressed anyway.
:::

## The Three Parts

You opt in to as much of Logaria as you need:

- **A tiny runtime API** ([`logaria`](./api-reference.md#logaria)) — create loggers and configure visibility.
- **A bundler plugin** ([`logaria/plugin`](./bundler-plugin.md)) — inject runtime config and optionally remove suppressed calls from production bundles.
- **A scoped core** ([`logaria/core`](./scoped-integrations.md)) — for host integrations that need their own logger scope without touching the default one.

## Design Principles

A few choices keep the runtime tiny and the plugin conservative:

- **Small, predictable runtime** — a handful of pure functions and five log methods, with no transports or formatters to configure. See [Why Logaria](./why.md#why-a-small-predictable-runtime).
- **Runtime is canonical** — the runtime filter decides visibility; the plugin is only an optimization. See [Core Concepts](./concepts.md#runtime-canonical-build-time-pruning).
- **Conservative by default** — a call is pruned only when every static fact is provable; anything dynamic stays. See [Why Logaria](./why.md#why-conservative-pruning).
- **Explicit ownership** — one default scope, exactly one owner; integrations register their own scope instead of sharing it. See [Core Concepts](./concepts.md#ownership-and-scopes).
- **Framework-agnostic and type-safe** — the same API runs in Node, browsers, and CLIs, and public types ship from `logaria/types`. See [Why Logaria](./why.md#why-framework-agnostic).

## Next Steps

- Understand the problem it solves — [Why Logaria](./why.md)
- Install and write your first logger — [Getting Started](./getting-started.md)
- Tour the capabilities with examples — [Features](./features.md)
- Learn the model behind it — [Core Concepts](./concepts.md)
