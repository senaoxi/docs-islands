# Implemented scope and unresolved direction

[English](./intent.md) | [简体中文](./zh/intent.md)

## Evidence boundary

This record describes the scope established by the current source, tests, manifests, configuration, build inputs, public exports, and command execution.

Target audience, long-term product positioning, future framework coverage, design rationale, and permanent non-goals are not established by implementation alone. The documented direction and constraints below remain separate from shipped support; open direction questions still require an explicit project decision.

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

## Documentation framework direction

Docs Islands is intended to bridge documentation frameworks and UI frameworks: documentation frameworks form the bottom layer, Docs Islands the middle bridge, and UI frameworks the top layer. This is product direction, not evidence that additional integrations ship today.

The [landing diagram](../../docs/.vitepress/theme/components/landing/DocsHeroMockup.vue) must distinguish current support from planned integrations. VitePress + React is the current Docs Islands integration, established by the [supported adapter set](../../packages/vitepress/src/node/constants/adapters/index.ts), [orchestrator](../../packages/vitepress/src/node/core/orchestrator.ts), and [package exports](../../packages/vitepress/package.json). Vue is available through VitePress's native rendering, not a Docs Islands adapter. Docusaurus, Nextra, Rspress, Svelte, and Solid are planned examples; their appearance does not establish implementation, priority, a release date, or an individual integration roadmap.

Hover, keyboard focus, or touch on a documentation framework should produce a restrained upward response, informed by [Vite](https://vite.dev/)'s layered interaction. Preserve keyboard access, reduced motion, both themes, and phone layouts. Core controls is removed from this homepage, including unused component-specific copy and styles; Logaria and Limina retain their separate capabilities, packages, and documentation.

These constraints have no human vouch. Implementation and validation evidence remain separate from product direction.

## Visual identity direction

The Docs Islands identity uses a lower-left document contour, a tall right contour, and a small detached, tilted island. Keep it simple, native SVG, legible at favicon sizes, and usable in one color or white. The primary color is `#7051E8`; ink and reverse variants use `#211E2E` and white. Reference artwork is not a site asset.

Logo and favicon entries share this identity and restrained finite animation, informed by the standalone Limina site's logo behavior. Outer contours remain stable while the island responds briefly to entry or interaction. The reference neither incorporates Limina into the product nor transfers its geometry.

Reduce diagram height through layout, tile spacing, and footer wrapping while preserving the three layers, readable labels, the VitePress + React path, native Vue distinction, planned labels, hover/focus/touch selection, keyboard dismissal, and reduced motion.

These constraints have no human vouch. [Visual architecture](./architecture.md#visual-identity-and-diagram-layout) owns implementation evidence; the implementing change must report validation.

## VitePress integration identity direction

The integration mark uses two offset rounded document boundaries surrounding a detached, tilted island. The simpler geometric document slot retains the parent's rounded solid forms and negative space; the former long curved V is excluded because its organic appearance obscured the document metaphor.

Purple `#7051E8` belongs to `@docs-islands/vitepress`, the Docs Islands adaptation layer, and does not claim the official upstream VitePress identity. Support remains VitePress + React. Package navigation, the homepage mark, favicons, and related brand entries use one native SVG source and the existing finite island animation and reduced-motion mechanism. Preserve the parent and other product identities; reference PNGs remain outside published assets.

These constraints have no human vouch. [`assets/logo/docs-islands-vitepress.svg`](../../assets/logo/docs-islands-vitepress.svg) preserves the adopted geometry; [visual architecture](./architecture.md#visual-identity-and-diagram-layout) owns implementation evidence and its validation boundary.

### Integration landing page

The Terminal demo integrates React components through `@docs-islands/vitepress`. Both homepage locales and the Terminal's before/after Markdown buffers configure `IntegrationWalkthrough` with `spa:sync-render client:load`. `client:load` schedules immediate hydration; the opt-in `spa:sync-render` synchronizes prerendered HTML and CSS with production SPA navigation. This source configuration does not resolve the [shared-loader hydration limitation](./architecture.md#vitepress-integration-landing-presentation).

The terminal occupies the right side of the desktop homepage hero. Omit the progress sentence and explanatory paragraph beneath it. Playground is static text without a copy capability.

The restrained technical bilingual page retains current React support, effective installation/configuration/Markdown references, source-grounded development/build/SSR explanations, guide/example/options entries, navigation, deployment base, and parent proxy boundary. Use the purple integration identity across desktop/phone and light/dark presentations.

The usecase shows the actual `index.md` baseline and its existing React script, preserves the `IntegrationWalkthrough` import and element, and enables the prepared small Sunset component through its ordinary string prop. The prototype, sprite atlas, and CSS module exist before playback. After the simulated Markdown save, Sunset appears at the bottom left and plays all five jump frames. It runs right with all eight native frames; a direction edit in the existing CSS module triggers the return with all eight native left-running frames. Preserve size, palette, position, frame phase, and React instance. At the left endpoint, slowly repeat all six thinking frames. This is one automatic journey without a separate Page preview, counter, manual continuation, click, focus, or hover gate. Visibility changes preserve the clock without catch-up; reduced motion shows the static completed state.

Assisted vi simulation preserves existing contents and imports, shows line numbers, NORMAL/INSERT and cursor position, pairs braces/quotes and JSX/HTML tags before filling them, indents new lines, then saves/quits with Esc and `:wq`. Reserve a newline before insertion so following content is not concatenated, including `export default config;`, outer `};`, and homepage script closures. Nested closing tags remain visible and move down with inserted content; self-closing tags retain valid JSX behavior. Shell scrollback retains commands, save notices, and rendering/HMR output after vi exits. Input delays are divided by 1.2; reading pauses remain unchanged. Use deterministic natural token bursts and semantic pauses without background catch-up. Acceptance requires complete real browser playback and measured duration.

Files and logs remain disclosed simulation. The moving mark must use the supported import-based React integration; do not imply inline function registration or hide a runtime gap. Actual CSS HMR continuity must be verified separately. Measure the route from terminal dimensions and prevent text overlap or mobile overflow. Preserve the complete setup reference. A follow-on Senao `/repos` integration remains a pending constraint: reuse this usecase sequentially after it is stable and verified, preserve the separate Limina demonstration, public boundaries and existing work, and avoid concurrent builds. Local implementation and validation do not establish deployment.

Sunset is page-local artwork, independent of site logos and application pet settings. Reuse the atlas's full native jumping, right-running, left-running, and thinking rows without redrawing, mirroring, or deforming it. Publish only the required artwork, excluding local pet metadata, reference screenshots, and personal paths. HMR changes the prepared controller's CSS direction property without resizing or recoloring the character.

These constraints have no human vouch. [Landing architecture](./architecture.md#vitepress-integration-landing-presentation) owns source behavior and known limitations; runtime, browser, and build verification must be reported separately.

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
