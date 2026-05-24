# Limina

Limina keeps a TypeScript monorepo honest. It checks that the source graph, package ownership, typecheck coverage, generated compatibility paths, and built package outputs all describe the same project.

For a small package, `tsc --noEmit` may be enough. In a larger workspace, there are usually more moving parts:

- packages import each other through `workspace:*`;
- TypeScript project references describe the build graph;
- Vue, Svelte, docs, tools, tests, and runtime code may need different checkers;
- published packages need their own `exports`, types, dependency declarations, README, and license files.

Limina does not replace those tools. It coordinates them and verifies the assumptions between them before CI or a release surprises you.

## What Limina Checks

Limina is built around a single config file, `limina.config.mjs`, and a few focused checks:

- **Graph checks** verify that real imports match TypeScript project references and workspace dependency rules.
- **Source checks** keep files inside the package that owns them and make sure imports are declared where they are used.
- **Proof checks** show that declaration configs, local typecheck configs, checker entries, and allowlists cover the intended source files.
- **Checker runs** call `tsc`, `vue-tsc`, or `svelte-check` against the right targets derived from the graph.
- **Path generation** creates explicit TypeScript `paths` files only when a workspace dependency is consumed as source but still exports build artifacts.
- **Package checks** inspect built output the way consumers install it, using `publint`, Are The Types Wrong, and a runtime import boundary scan.
- **Pipelines** compose Limina tasks and shell commands into local, PR, and publish workflows.

## When to Use It

Limina is a good fit when your repository:

- uses pnpm workspaces with multiple packages;
- uses TypeScript project references or wants to migrate to `tsc -b`;
- needs clear boundaries between production code, tooling, tests, browser code, and Node code;
- publishes packages and wants to validate the built output before release;
- has framework-specific files that plain `tsc -b` does not typecheck by itself.

Limina is not a bundler, test runner, package publisher, or hidden preset. The goal is to make monorepo rules explicit, reviewable, and runnable in CI.

## Documentation Map

- Read [Why Limina](./why.md) to understand the problem it solves.
- Follow [Getting Started](./getting-started.md) to install Limina and run the first check.
- Learn the terms in [Core Concepts](./concepts.md).
- See what each command does in [Checks & Workflows](./checks-and-workflows.md).
- Use [Reference](./reference.md) for full config fields, CLI commands, FAQ, and release notes for maintainers.
