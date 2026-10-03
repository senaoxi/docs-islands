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

The user requested on 2026-10-03 that the terminal occupy the right side of the homepage hero, as marked in the supplied screenshot. The subsequent request removes the progress sentence and explanatory paragraph beneath the terminal. The user clarified that Playground must be static text with no copy capability.

The user requested a restrained technical bilingual landing page on 2026-10-02, retaining current React support, effective installation/configuration/Markdown references, source-grounded development/build/SSR behavior, guide/example/options entries, existing navigation, deployment base and parent proxy boundary. Use the approved purple integration identity and coordinate desktop/phone and light/dark presentations. This is local work without commit, push or deployment.

The current terminal usecase follows the user's latest 2026-10-03 revision: show this landing page's actual `index.md` baseline and its existing React script, keep the existing `LandingDemo` import and element, enable its prepared React pet through its own string prop, and use the existing Sunset character from Codex My pets at a small size. The prototype, sprite atlas and CSS module exist before the demo. After the Markdown connection is saved, Sunset appears at the terminal's bottom left and plays the complete five-frame jump. Run right with all eight native frames; during the run, edit the existing CSS module's direction to run back with all eight native left-running frames. Preserve size, palette, position, frame phase and React instance. At the left endpoint, continuously and slowly loop the entire six-frame thinking sequence, as explicitly selected by the user. This supersedes the prior scale-change and stationary-right-end revisions, as well as the earlier kitten, climbing and top-right sleeping requirements. Remove the separate Page preview, counter and manual continuation stages. One automatic journey drives code and character; clicks, focus and hover must not gate it, and visibility changes preserve the clock without catch-up. Reduced motion shows the static completed state.

All simulated file editing retains the user's assisted-vi requirements: preserve existing contents and imports, show line numbers, NORMAL/INSERT and cursor position, visibly pair braces/quotes and JSX/HTML tags before filling their interiors, indent new lines, then save/quit with Esc and `:wq`. Open a newline before inserting so original following content is never concatenated with new input; this applies to the previously corrected `export default config;` and outer `};` as well as the homepage's script closures. Nested closing tags remain visible and move down during insertion; self-closing tags follow valid JSX behavior. Keep commands, save notices and rendering/HMR output in shell scrollback when vi exits. Increase typing speed by 20% (divide input delays by 1.2), while retaining reading pauses. Use deterministic natural token bursts and semantic pauses, with no background catch-up, and verify complete real browser playback with its duration.

The terminal files and logs remain disclosed simulation. The moving mark must be a real React component through the currently supported import-based integration; do not claim inline function registration or conceal a runtime capability gap. Verify actual CSS HMR behavior separately. Measure the route from terminal dimensions and keep the mark clear of text and overflow on mobile. Preserve the complete setup reference elsewhere on the page. After this version is stable and verified, the user authorized sequential migration of the same Docs Islands usecase to Senao `/repos`, preserving its Limina demonstration, public boundaries and existing work; no parallel builds or deployment are authorized.

Sunset is a page-local use of the existing visual asset, not a change to the user's active Codex pet or the approved site logo. Reuse its actual jumping, right-running, left-running and thinking rows rather than redrawing, mirroring or deforming the character. Each action retains its complete frame count. Only the required public artwork enters the site; local pet metadata, reference screenshots and personal paths must not be published. HMR now changes the prepared controller's CSS direction property; it does not resize or recolor the character.

Source: the user's integration-landing implementation and revision requests on 2026-10-02 through 2026-10-03. This record has no human vouch. Source-owned behavior is recorded in [the landing architecture](./architecture.md#vitepress-integration-landing-presentation); validation remains separate.

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
