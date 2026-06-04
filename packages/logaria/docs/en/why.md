# Why Logaria

Logging is one of those problems that looks simple from a distance and gets uncomfortable up close. As soon as a TypeScript package, CLI, or build tool grows past a single file, three pressures collide:

- **Engineers want rich logs while developing**, so they can see what the system is doing and why.
- **Users want a quiet, fast, small bundle in production**, with no debug noise.
- **Library authors want to ship logs that don't surprise their consumers** — the application, not the library, should decide what is visible.

Most logging libraries pick a side. Some are full-featured but heavy and framework-bound. Others are minimal but force you to delete `console.log` calls before shipping. None of them solve the ownership problem cleanly: who decides whether a log is shown — the library, the app, or the bundler?

Logaria was built to give a small, predictable answer to all three pressures at once.

## The Idea: Logs That Disappear

The core idea is simple. A logger should let you:

1. **Write logs freely** in library, script, and application code, with one tiny API.
2. **Filter them at runtime** by level, by group, by message, or by preset rule — never recompile to change visibility.
3. **Prune the suppressed ones** at build time when they can be statically proven dead, so production bundles stay small.

The runtime filter is the canonical source of truth. The build-time pruner is an optimization that only runs when it can prove a call cannot ever pass the filter — never a heuristic, never destructive.

In practice, this means a debug-rich library can ship to production without leaving `console.log` strings, formatter calls, or unused string literals behind in the bundle.

## Why Framework-Agnostic

Logaria deliberately does not target one framework or one bundler. There is no preferred framework, no preferred bundler, and no special path for "the popular one".

- The **runtime** is a handful of pure functions. It runs in Node.js, in browsers, in workers, in CLIs — anywhere ESM is supported. No DOM, no Node-only globals, no peer dependency on a meta-framework.
- The **bundler plugin** is built on [unplugin](https://github.com/unjs/unplugin), so the same plugin object exposes Vite, Rollup, Rolldown, esbuild, webpack, Rspack, and Farm adapters.
- The **integration story** is designed so framework authors and tooling vendors can register their own scope without colliding with the application — see [Scoped Integrations](./scoped-integrations.md).

The same `createLogger` you call in a CLI is the one a Vite plugin uses. We resist features that would only make sense in one framework: if a capability can be expressed as a generic Logaria primitive, it belongs in the core; if it can't, it belongs in a preset plugin contributed by that ecosystem.

## Why Explicit Ownership

Most logger libraries assume there is one global config and let everyone write to it. That works until two packages disagree about what should print, and the last one to call `configure()` wins.

Logaria draws a hard line: **the runtime has one default scope, and only one owner**. That owner is either the application (calling `setLoggerConfig` / `resetLoggerConfig` directly) or the bundler plugin (injecting the config as build constants). When the plugin is installed, the runtime APIs that mutate the default scope throw — there is no quiet drift between what the plugin pruned and what the runtime allows.

This is the rule that keeps Logaria safe to depend on from a library: a transitive dependency cannot quietly redirect or silence your logs. Host integrations that need their own visibility policy use [`logaria/core`](./scoped-integrations.md) to register an explicit scope, with its own config, that never touches the default one.

## Why Conservative Pruning

The bundler plugin removes a log call only when it can prove **every** static fact it needs:

- `createLogger` is imported as a named, unaliased import from `logaria`.
- `main`, `group`, and the log message are string literals.
- The logger binding is never reassigned.
- The log call is a standalone expression.
- The plugin is running in a build context with `treeshake: true`.

Anything dynamic — computed messages, aliased imports, destructured methods — stays in the bundle and falls back to runtime filtering. This is on purpose, and the trade is asymmetric: a missed removal costs you a few bytes, while a wrong removal costs you a missing log on a real incident. Logaria optimizes against the second risk and trades the first away.

## Why a Small, Predictable Runtime

Adding more to the runtime would have been easy; the discipline is in not doing it.

- One default scope, plus an optional set of explicit scopes.
- Five log methods on every logger (`info`, `success`, `warn`, `error`, `debug`) — no levels invented just to add variety.
- No transports, no runtime-configured formatters, no async sinks. Logaria writes to `console`; if your app needs more, wrap it.
- Helpers (`createElapsedTimer`, `formatErrorMessage`, `formatDebugMessage`) live in a separate `logaria/helper` entry, so the root entry stays minimal.

It is also type-safe by default: public types ship from `logaria/types`, and preset plugins are typed so that `extends` and `rules` references autocomplete and reject misspelled labels. The result is an API surface you can read in five minutes and re-derive without the docs.

## Evolving the Ecosystem, Not the Library

Most interesting visibility decisions in real projects are not "show errors" — they're "show this subsystem when it's slow", or "show this rule when CI is rerunning the dev build". The way to scale that without bloating the core is **preset plugins**: small, shareable bundles of rule templates and configs that projects enable via `extends` and override per project.

Logaria's job is to keep the primitives sharp; the ecosystem's job is to assemble them into the shapes individual projects need.

## Where Logaria Is Heading

Logaria is still small, and intentionally so. The runtime stays minimal, the plugin stays conservative, and new features are added only when they preserve those properties. The roadmap focuses on:

- Better introspection of resolved rules and pruning decisions for tooling.
- More preset templates contributed by ecosystem packages.
- Continued correctness work around the static-analysis gates the plugin relies on.

If those constraints match the kind of logger you've been wanting, the [quick start](./getting-started.md#your-first-logger) is the next page.
