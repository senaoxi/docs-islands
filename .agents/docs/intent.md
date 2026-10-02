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

## Human-stated visual identity direction

On 2026-10-02, the user selected the first purple concept: a lower-left document contour, a tall right contour, and a small detached, tilted island. The identity should remain simple and work as native SVG, at favicon sizes, and in one color or white. The flat primary color is `#7051E8`; the ink and reverse variants use `#211E2E` and white. The supplied concept board is a reference, not a site logo asset.

The user requested local adoption in the logo and favicon entries, with restrained finite animation informed by the standalone Limina site's current logo behavior. The outer contours remain stable while the small island responds briefly to entry or interaction. This reference does not make Limina part of the Docs Islands product or transfer its geometry into this identity.

The same request asks for less vertical space in the homepage diagram through layout, tile spacing, and footer wrapping. Preserve the three layers, readable labels, the VitePress + React available path, planned labels, hover/focus/touch selection, keyboard dismissal, and reduced motion. Local implementation does not authorize a commit, push, or deployment.

Source: the user's explicit logo selection and local implementation request on 2026-10-02. This record has no human vouch. Implementation evidence is owned by [the visual architecture record](./architecture.md#visual-identity-and-diagram-layout); validation must be reported by the implementing change.

## Human-stated VitePress integration identity direction

On 2026-10-02, the user accepted the revised integration mark: two offset rounded document boundaries surrounding a detached, tilted island. The earlier long, curved V was rejected because it suggested human organs. Keep the simpler geometric document slot and the parent's rounded solid forms and negative space; do not restore the rejected contour.

The primary color is purple `#7051E8`. This identity belongs to `@docs-islands/vitepress`, the Docs Islands adaptation layer for VitePress; it does not claim to be the official upstream VitePress identity. Current framework support remains VitePress + React. The user authorized local adoption in the package navigation, homepage mark, favicons, and related brand entries, with a single native SVG source and the existing finite island animation and reduced-motion mechanism. Preserve the parent Docs Islands and other product identities. This request does not authorize staging unrelated work, a commit, push, or deployment, or moving the user's reference PNGs.

Source: the user's explicit rejection, revised-logo acceptance, and local implementation request on 2026-10-02. This record has no human vouch. The adopted geometry is preserved in [`assets/logo/docs-islands-vitepress.svg`](../../assets/logo/docs-islands-vitepress.svg); implementation evidence is owned by [the visual architecture record](./architecture.md#visual-identity-and-diagram-layout). Validation must be reported by the implementing change.

### Integration landing page

On 2026-10-02, the user expanded local work to the VitePress integration's bilingual landing page. Make the page restrained and technical, with a complete reading order: why a VitePress document needs local interaction, current React support, effective installation/configuration/Markdown examples, and source-verified HMR, build output, and SSR behavior. The primary CTA must enter the correct guide; secondary entries expose examples and options. Use the approved purple integration identity, avoid generic feature-card repetition and oversized diagrams, and coordinate desktop/phone and light/dark presentations. Preserve existing navigation, deep links, deployment base, and the parent proxy boundary. New controls must support keyboard/focus and, when animation is offered, pause/replay and reduced motion. This is a local implementation request, without commit, push, or deployment.

The user's subsequent eleven-step demo direction requires simulated console input alongside the original Hello, world! page, complete build and client setup, React creation and Markdown use, source-grounded rendering/HMR logs, and an actual interactive preview. Editing the component's copy must preserve the user's count on the same instance; automatic stage changes must not clear it. Playback gives interaction priority and supports pause/continue, explicit restart, and reduced motion. Verify the adapter's real HMR behavior before presenting state preservation; a static simulation must not conceal a runtime capability gap or authorize an unrelated runtime refactor.

The user then required every file edit to use vi over an already installed/configured site: show the original minimal contents, preserve existing configuration, make NORMAL/INSERT and cursor position clear, and save/quit with Esc and `:wq`. Do not use heredocs, shell file redirection, or directory initialization as demo actions. Typing must be substantially slower, grouped by code token or phrase with reproducible bursts and pauses at semantic boundaries, lines, mode changes and saves. Verify a complete actual browser playback and report its duration; hidden/offscreen time must not cause progress catch-up.

The user further required developer-style insertion: append imports after the existing dependency declarations or open a line that pushes the following original content down, without temporarily overwriting or reordering it. Opening braces must visibly produce their closing partners; move the cursor inside, then enter/indent and fill the contents. Consistent assistance may cover other paired delimiters. Present this as an assisted editor, and inspect the actual insertion locations and intermediate paired states during browser playback.

The user explicitly clarified that `export default config;` and the theme’s closing `};` must first move down one line before the new statement or method is entered at their original positions. Intermediate input must never concatenate with those original lines.

Source: the user's explicit integration-landing implementation request on 2026-10-02. This record has no human vouch. Source-owned behavior is recorded in [the landing architecture](./architecture.md#vitepress-integration-landing-presentation); validation remains separate.

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
