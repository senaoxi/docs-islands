# Project Philosophy

Logaria's design is shaped by a small number of choices we keep applying. They are the reason the runtime stays tiny and the bundler plugin stays conservative.

## Small, Predictable Runtime

Logaria's runtime is a handful of pure functions. Adding more would have been easy; the discipline is in not doing it.

- One default scope, one optional set of explicit scopes.
- Five log methods on every logger (`info`, `success`, `warn`, `error`, `debug`) — no log levels invented just to add variety.
- No transports, no formatters configured at runtime, no async sinks. Logaria writes to `console`; if your app needs more, wrap it.
- Helpers (`createElapsedTimer`, `formatErrorMessage`, `formatDebugMessage`) live in a separate entry (`logaria/helper`) so the root entry stays minimal.

The result is an API surface you can read in five minutes and re-derive without the docs.

## Runtime Is Canonical

The runtime filter is the single source of truth for what gets printed. The bundler plugin is an **optimisation** on top, never a replacement.

That order matters:

- Every call left in the bundle still passes through the same runtime gate, even after pruning.
- Disagreements between "what the plugin pruned" and "what runtime would allow" are impossible by construction: when the plugin is installed, the runtime APIs that mutate the default scope refuse to run.
- When in doubt, behaviour is decided by runtime config — not by what was statically analysed.

If you turn the plugin off tomorrow, nothing changes about which logs print. That's the property we're protecting.

## Conservative by Default

The bundler plugin removes a log call only when it can prove a fixed set of static facts (named import, literal `main`/`group`/`message`, no rebinding, standalone expression, build context, `treeshake: true`). Anything outside that envelope stays in the bundle.

We optimise for **no surprises in production** over **maximum stripping**. A missed removal costs you a few bytes; a wrong removal costs you a missing log on a real incident. The trade is asymmetric and we trade accordingly.

## Explicit Ownership

There is one default scope, and exactly one entity that may own it at a time — either the application (via `setLoggerConfig` / `resetLoggerConfig`) or the bundler plugin (via injected constants). The runtime detects which is which and refuses to mix them.

Host integrations that need a private logger don't share the default scope at all. They use [`logaria/core`](./scoped-integrations.md) to register an explicit scope id, with its own config, that the application never sees.

This is the rule that keeps Logaria safe to depend on from libraries: a transitive dependency cannot quietly redirect or silence your logs.

## Framework Agnostic by Design

Logaria has no preferred framework, no preferred bundler, and no special path for "the popular one". The same `createLogger` you call in a CLI is the one a Vite plugin uses; the same `loggerPlugin` works in Rollup, Rolldown, esbuild, webpack, Rspack, and Farm.

We resist features that would only make sense in one framework. If a feature can be expressed as a generic Logaria primitive, it belongs in the core. If it can't, it belongs in a preset plugin contributed by that ecosystem.

## Type-Safe by Default

Logaria is written in TypeScript and exposes its public types from `logaria/types`. Preset plugins are typed so that `extends` and `rules` references autocomplete and refuse misspelled labels. Config shape changes are surfaced by the compiler before they reach users — this is how a small library stays trustworthy as it evolves.

## Evolving the Ecosystem, Not Just the Library

Most of the interesting visibility decisions in real projects are not “show errors” — they’re “show this subsystem when it's slow", or "show this rule when CI is rerunning the dev build". The way to scale that without bloating the core is **preset plugins**: small, sharable bundles of rule templates and configs that consumer projects enable via `extends` and override per project.

Logaria's job is to keep the primitives sharp; the ecosystem's job is to assemble them into the shapes individual projects need.
