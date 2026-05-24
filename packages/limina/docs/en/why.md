# Why Limina

TypeScript monorepos tend to start simple. A root `tsconfig.json`, a few packages, and a `typecheck` script feel enough.

As the repository grows, the same files begin to serve different jobs:

- the editor wants fast local type information;
- `tsc -b` wants a clean project reference graph;
- framework files may need `vue-tsc` or `svelte-check`;
- packages may import each other through `workspace:*`;
- published output must work after it is packed and installed.

Those jobs are related, but TypeScript does not automatically prove that they agree with each other. Limina exists for that gap.

## The Project Graph Can Drift

Project references are supposed to describe which project depends on which other project. Real imports are the source of truth, though. If a file imports another workspace package but the declaration project does not reference the target project, the graph is stale.

Limina reads the projects reachable from your checker entries, resolves real imports with TypeScript, and reports missing or forbidden references. It also checks label-based rules, so a browser runtime project can be denied access to Node-only projects or dependencies.

## Workspace Dependencies Need Clear Meaning

`workspace:*` means "this package is part of the source workspace". That is different from `link:`, `file:`, `catalog:`, or a normal semver dependency, which usually means "consume this package as an artifact".

That distinction matters because TypeScript project references do not rewrite package exports. If package A references package B but imports `@scope/b`, TypeScript still follows B's package exports. When those exports point to `dist`, the graph may silently consume build output instead of source.

Limina detects this situation. It asks you to either expose source entries, stop modeling the edge as a source dependency, or generate an explicit compatibility `paths` file.

## Source Ownership Should Be Boring

In a monorepo, relative imports that jump across package folders make ownership unclear. A package can also import a bare dependency that is not declared in its nearest `package.json`.

Limina's source check keeps these rules plain:

- source files must belong to a nearest package owner;
- a non-aggregator tsconfig should not mix several package owners;
- relative imports must stay inside the same package owner;
- bare imports must be listed in `dependencies` or `devDependencies`;
- `#imports` must match the nearest package's `imports` field and resolve inside that package.

## Passing Source Checks Is Not Enough

A source graph can pass while the published package is still broken. Consumers install the built output, not your source tsconfigs.

Limina package checks run after your build. They pack the output and check package metadata, type resolution, runtime imports, dependency declarations, self imports, README, and license files. This catches a different class of release bugs than `tsc`.

## The Design Goal

Limina tries to keep the rules visible. Instead of hiding policy in a preset, it keeps checker entries, graph rules, package targets, allowlists, paths options, and pipelines in `limina.config.mjs`.

That makes architecture changes something reviewers can read, not something CI discovers only after the merge.
