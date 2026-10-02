# Architecture

[English](./architecture.md) | [简体中文](./zh/architecture.md)

## Evidence boundary

This record describes workspace units and boundaries established by manifests, source imports, public exports, build configuration, Limina configuration, and release scripts.

Package names and descriptions do not establish design rationale, future publication plans, or permanent product boundaries. Those points require human confirmation.

## Workspace layout

`pnpm-workspace.yaml` includes these workspace areas:

| Workspace pattern          | Current contents                                                                        |
| -------------------------- | --------------------------------------------------------------------------------------- |
| `packages/*`               | Primary library, CLI, configuration, and internal workspace packages                    |
| `packages/*/docs`          | Package-specific documentation sites                                                    |
| `packages/*/playground`    | Package-specific playground applications                                                |
| `packages/*/smoke`         | Package-specific smoke-test workspaces                                                  |
| `packages/plugins/*`       | Private plugin packages; the current matching package is `@docs-islands/plugin-license` |
| `packages/**/__tests__/**` | Nested test workspaces with their own manifests                                         |
| `docs`                     | Root documentation site workspace                                                       |
| `utils`                    | Shared private utilities package                                                        |

Generated `dist` directories are excluded from workspace discovery.

The current discovered workspace includes the root project, published packages, private packages, package documentation sites, the VitePress playground and smoke workspace, the Logaria plugin test workspace.

## Documentation publication boundary

The root documentation site and package documentation sites build independently. The root `docs:build` deployment path selects only `@docs-islands/monorepo-docs`, `@docs-islands/logaria-docs`, and `@docs-islands/vitepress-docs`. `scripts/merge-docs.ts` then merges the package documentation that remains owned by this site into `docs/.vitepress/dist/<target>/`; the current merged package targets are Logaria and `@docs-islands/vitepress`. Their public VitePress bases share the fixed `/repos/docs-islands/` namespace.

Limina documentation is explicitly excluded from this merge because its standalone deployment owns `/repos/limina/`. The root landing page does not present Limina as a Docs Islands integration requirement and does not publish a duplicate `/repos/docs-islands/limina/` copy.

The Docs Islands Vercel project owns only the merged static output and does not rewrite the public prefix internally. The Senao site is the external routing authority for `/repos/docs-islands/*` and proxies those requests to the independent Docs Islands Vercel deployment. The previous `docs.senao.me/docs-islands/*` entry redirects to the new namespace; its legacy Limina subtree redirects to `/repos/limina/*`.

### Root landing presentation

The bilingual root landing is owned by `docs/en/index.md`, `docs/zh/index.md`, `DocsProductMatrix.vue`, `DocsMarkdownExample.vue`, and the homepage-scoped rules in `docs/.vitepress/theme/styles/main.css`. Its reading order is product introduction and guide CTA, the existing architecture diagram, a current-support strip, rendering principles, and a Markdown integration example. The support strip identifies VitePress + React; future adapters are not established by this presentation. See [implemented scope](./intent.md).

The presentation uses sans-serif headings, restrained purple accents, shared alignment, and open sections separated by rules. This keeps the integration path prominent without presenting Logaria and Limina as prerequisite controls. Light and dark tokens are scoped to `VPHome`; package themes and documentation publication remain separate. The example is explicitly post-configuration and links to the complete setup guide. Both integration CTAs use `target="_self"` to trigger document navigation: package docs have an independent VitePress route manifest, so the root SPA router cannot resolve them even when their static files share an origin. Diagram internals retain their component owner; shell styling does not establish keyboard or selection behavior. Homepage animation and transitions are disabled when the browser reports reduced motion.

`DocsMarkdownExample.vue` owns the example's character input, cursor, pause/resume, replay, and complete-text copy. It presents an `index.md` source file without a shell prompt or simulated command output. The complete example is available in SSR, to screen readers, and when reduced motion is requested. A hidden full-text layout reserve prevents the panel from changing height during typing. Normal playback starts when the example enters the viewport, runs once, and keeps its progress while offscreen or while the document is hidden; resuming resets the tick clock rather than consuming background time. Turning on reduced motion finishes immediately, and turning it off leaves the complete example until replay is requested. The copy control always uses the complete Markdown; selecting and copying during typing also copies the complete example instead of a truncated prefix. Clipboard failure reveals the full selectable text. Timers, the visibility observer, and media/document listeners are released on unmount. These controls and styles belong only to this example region and add no package dependency or execution capability.

### Visual identity and diagram layout

[`assets/logo/docs-islands.svg`](../../assets/logo/docs-islands.svg) is the geometry source for the parent identity. [`assets/logo/docs-islands-vitepress.svg`](../../assets/logo/docs-islands-vitepress.svg) independently owns the VitePress integration identity: two offset rounded document boundaries and a detached, tilted island. Each source separates its stable frame and island with product-specific SVG fragment IDs. [`scripts/sync-brand-assets.ts`](../../scripts/sync-brand-assets.ts) deterministically generates ten static variants: six parent assets and four integration assets; `pnpm exec tsx scripts/sync-brand-assets.ts --check` verifies their bytes. The integration source supplies `assets/logo/islands-vitepress.svg` and the package site's logo, favicon, and black Safari mask. Its bilingual package READMEs reference the canonical integration source. The parent and other product identities retain their own geometry; variants of one identity share that identity's paths. Unchanged generated files are not rewritten.

The root and package `NavBarLogo.vue` components reference their own identity's external fragments rather than copying path data. `withBase('/logo.svg')` preserves the package site's `/repos/docs-islands/vitepress/` asset prefix. Both package homepages use the generated favicon as their static hero mark, and the configured icon and mask entries resolve to the same integration source. The root diagram continues to reuse the parent component in its middle layer. The integration follows [the human-stated subproject direction](./intent.md#human-stated-vitepress-integration-identity-direction). The island uses a finite 700 ms activation with a 140 ms delay and `cubic-bezier(0.22, 1, 0.36, 1)`, informed by the independently maintained Limina site's finite reveal cadence. It runs once on viewport entry and may respond to pointer entry, link focus, theme change, or diagram activation. There is no idle loop. Leaving the viewport, hiding the document, enabling reduced motion, or unmounting cancels the animation; observers and listeners are released on unmount.

The root diagram owns a 304 px scene, 68 px framework tiles, and a 56 px bridge. Connector coordinates follow the tile rows and their active offsets. The footer may wrap naturally at narrow widths; compactness does not rely on a transform applied to the whole diagram or smaller label text. Only VitePress + React is presented as available, with the existing planned paths and input behavior retained. This layout and identity follow [the human-stated visual direction](./intent.md#human-stated-visual-identity-direction).

These facts are established by source ownership. Browser, build, typecheck, and governance results must be reported by the implementing change; this record does not itself claim a successful run.

### VitePress integration landing presentation

The integration landing is owned by the bilingual `packages/vitepress/docs/*/index.md` pages, [`VitePressLanding.vue`](../../packages/vitepress/docs/.vitepress/theme/components/VitePressLanding.vue), [`LandingDemo.tsx`](../../packages/vitepress/docs/components/react/LandingDemo.tsx), and [`LandingCounter.tsx`](../../packages/vitepress/docs/components/react/LandingCounter.tsx). Shared complete snippets and verified log/event excerpts live in [`landing-demo-source.ts`](../../packages/vitepress/docs/components/react/landing-demo-source.ts); demo styles live in [`LandingDemo.css`](../../packages/vitepress/docs/components/react/LandingDemo.css). Its reading order is the component boundary, console integration demo, four rendering strategies, complete minimal setup, development/build behavior, and guide CTA. It replaces the package homepage's large glowing hero and repeated feature-card grid; the root landing remains independently owned.

The demo is a real `client:visible` React island passed through the Vue landing component's slot. Its initial HTML is prerendered; the counter enables when React switches from server to client snapshots during hydration. The reducer advances through the original Markdown page, build configuration, mandatory client-theme registration, component creation, Markdown integration, render logs, live counter, component-copy edit, HMR events, and updated preview. Playback represents simulated file input and recorded console/event excerpts, not writes to disk or an actual development server in the page. Excerpts name the adapter's `runtime.react.dev-render` log group and `docs-islands:react-hmr:prepare:fast-refresh` dev event; paths are shortened and timings are not invented.

Each file phase uses a simulated vi buffer over a fixed, already configured VitePress site. The existing config's title and description, the default theme, and Hello, world! remain visible while integration additions are inserted at their anchors. The editor shows line numbers, a positioned cursor, NORMAL/INSERT modes, the navigation/edit keys, Esc and `:wq`, then a saved/quit shell state. The component is created in vi; its copy update reopens vi and replaces only the heading line. [`landing-demo-playback.ts`](../../packages/vitepress/docs/components/react/landing-demo-playback.ts) owns these substates and deterministic token-burst plans: short bursts within identifiers, longer pauses between tokens, statements and lines, an initial read pause, and explicit mode/save holds. The scheduler advances one frame per timer and cancels while hidden or offscreen; returning resumes the same frame without consuming elapsed background time. Reduced motion retains separate manual editor steps. Existing directories and the initial VitePress setup are fixture prerequisites rather than demo actions.

The assisted editor stores real buffer snapshots and cursor positions from insertion, pairing, newline/indent and cursor-move actions. New imports are appended after existing dependency declarations; inserted newlines push the original following content down. Braces, parentheses, brackets and quotes appear as pairs before their contents are filled, and automatically inserted closing delimiters are traversed rather than duplicated. A line-opening action reserves the separating newline before typing any character of a new block, so the original `export default config;` and outer `};` remain on separate following lines in every intermediate buffer. The heading update preserves its surrounding JSX tags and the count hook. The UI explicitly names pairing/indent assistance; it does not claim these are native vi defaults.

The counter stays mounted through stage changes, and updating its title changes props on the same component instance. Playback stops at the first interactive stage; pointer/focus interaction pauses it. Stage continuation never resets user state. Only the explicit Restart demo control changes the counter key and resets the demonstration; the counter's own Reset remains an explicit user action. The demonstrated HMR case changes a string while preserving component export and hook structure. The adapter delegates that path to React Fast Refresh through [`createFrameworkComponentHmrPlugin`](../../packages/vitepress/src/node/plugins/vite-plugin-framework-component-hmr.ts) and the [React client integration](../../packages/vitepress/src/client/adapters/react/index.ts). This is not a promise of state preservation for every edit or a product-runtime change.

Current support is explicitly VitePress + React 18, matching the adapter and peer declarations. The mode descriptions distinguish build-time SSR, client takeover, and browser-only rendering. Complete setup includes dependency installation, the build plugin, client-theme registration, component, and Markdown. The bilingual getting-started guide's VitePress/SWC requirements and React install ranges match the package peer declarations. Setup reference tabs remain complete and selectable in SSR, with roving focus using arrows, Home, and End. The console starts as a static Hello, world! example; typing begins only after Play. Pause/continue, manual Next step, and Restart are keyboard controls with visible focus. Copy uses complete source during partial typing. Hidden documents and offscreen playback preserve progress; reduced motion offers manual steps without typing, a live motion-preference change stops playback, and unmount clears timers and listeners. The `spa:sync-render` link preserves its resource-loading trade-offs.

The scoped Vue stylesheet wraps the complete dark ancestor/component selector in `:global(.dark .vitepress-landing)`. Splitting it as `:global(.dark) .vitepress-landing` makes the compiled rule target the ancestor rather than override the component's local palette; dark screenshots and computed palette checks must catch that contrast failure.

The options entry uses the existing `/options/logging` document and its sidebar. The English navigation formerly linked to an absent `/options/` index; its target is corrected to match the Chinese configuration entry without changing navigation structure.

Landing links use `withBase` plus the active locale and remain within `/repos/docs-islands/vitepress/`. Existing navigation, deep documentation paths, the parent site's proxy boundary, package runtime, manifests, and deployment configuration are unchanged. The presentation follows [the human-stated integration landing direction](./intent.md#integration-landing-page). Browser, HMR, build, typecheck, and governance results must be reported by the implementing change; this record does not itself claim a successful run.

## Published packages

Release scripts and package manifests identify three independent publication targets:

| Package                   | Independently published | Current role                                                                                           |
| ------------------------- | ----------------------: | ------------------------------------------------------------------------------------------------------ |
| `@docs-islands/vitepress` |                     yes | VitePress integration package with node, client, React adapter, theme, and development-tooling exports |
| `logaria`                 |                     yes | Runtime logger with helper, core, plugin, and types exports, including build-time pruning facilities   |

Each release target has a separate package directory, built publish directory, version, changelog, tag prefix, build step, package checks, and release checks.

## Private workspace packages

| Package                        | Private | Current role                                                                                              |
| ------------------------------ | ------: | --------------------------------------------------------------------------------------------------------- |
| `@docs-islands/core`           |     yes | Shared client, node, runtime, transformation, and type abstractions consumed by the VitePress integration |
| `@docs-islands/eslint-config`  |     yes | Shared ESLint configuration and presets                                                                   |
| `@docs-islands/utils`          |     yes | Shared repository runtime and build utilities, including the `link-guard` binary                          |
| `@docs-islands/agents`         |     yes | Shared coding-agent skills and link tooling for `.claude`, `.cursor`, and `.agent`                        |
| `@docs-islands/plugin-license` |     yes | Private license plugin used by package build configurations                                               |

The current `packages/plugins/*` area contains the license plugin. The implementation does not establish a broader collection of Vite or Rollup plugins.

## Core and VitePress boundary

`@docs-islands/core` does not directly import VitePress APIs. Its manifest exposes client, node, shared, and types entry points.

`@docs-islands/vitepress` imports Core entry points across its client, node, shared, adapter, and type layers. It maps VitePress configuration, lifecycle APIs, build hooks, and runtime behavior onto those shared abstractions.

Core is private in its source manifest and is not a release target.

The VitePress Rolldown configuration externalizes declared runtime dependencies and peer dependencies. Core is a development dependency rather than an external runtime dependency. The current built VitePress manifest does not declare Core, and built JavaScript does not retain Core module imports. This establishes that the current VitePress build incorporates the required Core implementation into its output.

### Derived implementation consequence

The current structure separates framework-neutral runtime abstractions from the VitePress-specific integration. This permits the VitePress package to consume shared abstractions without publishing Core as a separate consumer dependency.

The source establishes the structure, but not the design rationale or future framework plan.

## UI framework adapter boundary

`DocsIslandsAdapter` is the current adapter contract. It provides a framework identifier and an `apply` operation over VitePress configuration and resolved Docs Islands configuration.

`createDocsIslands()` accepts an adapter array. It rejects an empty array, duplicate framework identifiers, and identifiers outside the supported framework set.

The current supported framework set contains only React. The current adapter source directories, Rolldown inputs, and package exports expose only the React adapter and its client entry.

### Derived implementation consequence

The adapter contract and array-based orchestration provide an extension point. They do not establish that multiple UI frameworks are currently implemented or that additional adapters are planned.

## Logaria boundary

Logaria does not depend on `@docs-islands/core` in its manifest or source imports.

`@docs-islands/vitepress` declares Logaria as a runtime dependency. Its source and built output use Logaria core, helper, plugin, and types entry points.

Logaria has independent public exports, build output, package checks, release checks, versioning, and release tags.

Logaria is packaged and released independently and is not structurally coupled to `@docs-islands/core`. The implementation does not establish whether its long-term product scope is Docs Islands-specific or general-purpose.

## Limina boundary

Limina is an external npm CLI dependency with a `limina` binary. All nine development consumers use the existing dev catalog pinned exactly to `0.4.0`, with no caret or tilde. Its source, docs, fixtures and release targets are outside this workspace; the [extraction record](./history-extraction.md) owns provenance and recovery.

The root repository uses Limina configuration and commands for:

- TypeScript project graph preparation and checking
- Source ownership and dependency checks
- Typecheck coverage proof
- Checker build and typecheck execution
- Built package output checks
- Release consistency checks
- Named graph, library, Vue, consumer, package, and publish pipelines

Current graph rules constrain client and shared runtime imports and project references. They reject configured Node.js built-in dependencies and configured references across client, shared, and node runtime boundaries.

Current package checks cover the configured built outputs for Logaria and `@docs-islands/vitepress`.

Limina is a development and release governance tool. It is not a frontend runtime dependency of the VitePress browser output.

A Limina failure indicates that a configured governance rule, package check, release check, proof, or checker did not pass. It requires investigation; the source does not define a universal defect classification for every failure.

The root configuration and the installed npm artifact establish the governed commands. Limina’s implementation records remain in the original-history archive. This architecture record owns only its relationship to the retained workspace units.

## Derived implementation consequences

The two published packages can version and release independently while sharing private implementation and build packages in one workspace.

The root release configuration does not include Core, repository utilities, agent tooling, ESLint configuration, or the license plugin as publication targets. Their manifests also mark them as private.

The configured graph rules enforce only the boundaries represented by their labels, dependencies, and reference entries. They do not establish every architectural boundary that maintainers may consider important.

## Human direction requiring confirmation

- Is support for documentation frameworks other than VitePress a long-term reason for the Core and VitePress separation?
- Should Logaria remain scoped to Docs Islands usage or develop as a general logging package?
- Are any current private packages intended for independent publication?
- Is the plugins workspace expected to expand into a broader plugin collection?
