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

Logaria deliberately does not target one framework or one bundler.

- The **runtime** is a handful of pure functions. It runs in Node.js, in browsers, in workers, in CLIs — anywhere ESM is supported. No DOM, no Node-only globals, no peer dependency on a meta-framework.
- The **bundler plugin** is built on [unplugin](https://github.com/unjs/unplugin), so the same plugin object exposes Vite, Rollup, Rolldown, esbuild, webpack, Rspack, and Farm adapters.
- The **integration story** is designed so framework authors and tooling vendors can register their own scope without colliding with the application — see [Scoped Integrations](./scoped-integrations.md).

This is what lets the same Logaria call site travel from a CLI tool to a Vite plugin to a browser app without rewriting.

## Why Explicit Ownership

Most logger libraries assume there is one global config and let everyone write to it. That works until two packages disagree about what should print, and the last one to call `configure()` wins.

Logaria draws a hard line: **the runtime has one default scope, and only one owner**. That owner is either the application (calling `setLoggerConfig` / `resetLoggerConfig` directly) or the bundler plugin (injecting the config as build constants). When the plugin is installed, the runtime APIs throw if you also try to mutate the default scope at runtime — there is no quiet drift between what the plugin pruned and what the runtime allows.

Host integrations that need their own visibility policy use [`logaria/core`](./scoped-integrations.md) to register an explicit scope, with its own config, that never touches the default one.

## Why Conservative Pruning

The bundler plugin removes a log call only when it can prove **every** static fact it needs:

- `createLogger` is imported as a named, unaliased import from `logaria`.
- `main`, `group`, and the log message are string literals.
- The logger binding is never reassigned.
- The log call is a standalone expression.
- The plugin is running in a build context with `treeshake: true`.

Anything dynamic — computed messages, aliased imports, destructured methods — stays in the bundle and falls back to runtime filtering. This is on purpose. The cost of a wrong removal is a silently missing log in production; the cost of a missed removal is a few bytes. Logaria optimises for the former.

## Where Logaria Is Heading

Logaria is still small and intentionally so. The runtime stays minimal, the plugin stays conservative, and new features are added only when they preserve those properties. The roadmap focuses on:

- Better introspection of resolved rules and pruning decisions for tooling.
- More preset templates contributed by ecosystem packages.
- Continued correctness work around the static-analysis gates the plugin relies on.

If those constraints match the kind of logger you've been wanting, the [quick start](./getting-started.md#your-first-logger) is the next page.
