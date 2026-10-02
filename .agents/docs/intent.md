# Implemented scope and unresolved direction

[English](./intent.md) | [简体中文](./zh/intent.md)

## Evidence boundary

This record describes the scope established by the current source, tests, manifests, configuration, build inputs, public exports, and command execution.

Target audience, long-term product positioning, future framework coverage, design rationale, and permanent non-goals are not established by the implementation alone. The human-stated documentation direction below is recorded separately from shipped support; other direction questions still require human confirmation.

## Current implementation

The root manifest describes the repository in terms of documentation sites, and the public Docs Islands package is `@docs-islands/vitepress`.

The current documentation-framework integration is VitePress-specific:

- `@docs-islands/vitepress` accepts and mutates VitePress `UserConfig` objects.
- Its node integration imports VitePress types and maps VitePress configuration and build hooks into the package runtime.
- Its client integration imports `vitepress/client` lifecycle APIs and adapts them to the shared client contract.
- The published package exports VitePress-specific node, client, theme, and development-tooling entry points.

The current UI framework implementation is React:

- `DocsIslandsAdapter` is the adapter contract used by `createDocsIslands()`.
- `createDocsIslands()` accepts an array of adapters and validates each adapter against the supported framework set.
- The supported framework set currently contains only `react`.
- Source directories, build inputs, and package exports currently expose only the React adapter.

`@docs-islands/core` provides client, node, shared, and types entry points used by the VitePress integration. Its manifest marks the package as private.

The current public Docs Islands entry point is not a general Web application framework. Its configuration, lifecycle integration, exports, peer dependencies, tests, playground, and smoke package are centered on VitePress documentation sites.

The repository development environment enforces pnpm through the root `preinstall` script and package-manager configuration. This is a repository constraint. It does not establish that consumers of published packages must use pnpm.

Logaria and `@docs-islands/vitepress` are the public release units in this workspace. The release configuration assigns each its own package directory, publish directory, version, changelog, and tag prefix. Limina is consumed as an external development dependency pinned to npm `0.4.0`; its source and release are outside this workspace.

## Derived implementation consequences

The adapter array and adapter contract permit more than one adapter instance to participate in orchestration, subject to the supported framework set and duplicate-framework validation. This is an implementation property. It does not establish support for multiple UI frameworks today.

The separation between `@docs-islands/core` and `@docs-islands/vitepress` permits framework-neutral abstractions to be consumed by a framework-specific package. The source establishes the structure, but not the design rationale.

The repository can develop and release Docs Islands and Logaria from one workspace without making them one published package. Their manifests, build outputs, release entries, and tags remain separate; the external Limina CLI governs that workspace.

## Human-stated documentation direction

On 2026-10-01, the user stated that Docs Islands should bridge multiple documentation frameworks and multiple UI frameworks: documentation frameworks form the bottom layer, Docs Islands is the middle bridge, and UI frameworks form the top layer. This is product direction, not evidence that additional integrations ship today.

The [landing diagram](../../docs/.vitepress/theme/components/landing/DocsHeroMockup.vue) must make that relationship readable and distinguish current support from planned integrations. VitePress and React are the current supported path, established by the [supported adapter set](../../packages/vitepress/src/node/constants/adapters/index.ts), [orchestrator](../../packages/vitepress/src/node/core/orchestrator.ts), and [package exports](../../packages/vitepress/package.json). Docusaurus, Nextra, Astro, Vue, Svelte, and Solid appear only as planned examples. Their presence in the diagram does not establish implementation, priority, a release date, or a committed individual integration roadmap.

For this homepage change, the user requested a restrained upward response to hover, keyboard focus, or touch on a documentation framework, inspired by the layered interaction at [Vite](https://vite.dev/). The diagram must keep keyboard access, respect reduced motion, and work in both site themes and on phones. Core controls is removed from this homepage, including unused component-specific copy and styles; this does not remove Logaria or Limina product capabilities, packages, or documentation.

Source: the user's explicit homepage request on 2026-10-01. This record has no human vouch. Validation of the homepage's implementation is separate from this direction and must be reported by the change that implements it.

## Not established by the current implementation

The current implementation establishes that VitePress is the only documentation-framework integration. It does not establish a plan to support other documentation frameworks.

The current implementation establishes that React is the only UI framework adapter. It does not establish a plan to add Vue, Svelte, Solid, or other adapters.

The current implementation is not a general Web application framework. It does not establish that becoming one is a permanent non-goal.

The source does not establish whether the primary audience is documentation teams, component-library maintainers, enterprise users, or another group.

## Human direction requiring confirmation

- Which additional documentation-framework integrations should be prioritized, and what would establish their support?
- Which additional UI framework adapters should be prioritized, and what would establish their support?
- What is the long-term product relationship between the root Docs Islands project, Limina, and Logaria?
- Who are the primary intended users?
- Which directions are permanent non-goals?
- What design rationale should be recorded for the separation between `@docs-islands/core` and the VitePress integration?
