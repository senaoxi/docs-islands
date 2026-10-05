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

The hero's 1152 px desktop grid gives the introduction and diagram a 0.9:1.1 column ratio, with a 56 px gap that becomes 40 px at 1150 px and below. Below 1024 px, it stacks the introduction before the diagram within a 680 px column. Headline, description and actions retain a shared left edge in both layouts. The English headline explicitly breaks between its two sentences. A filled guide action and a quieter external GitHub link establish the action hierarchy. The diagram has one compact heading with its interaction hint; it does not repeat the hero's marketing introduction. Neutral tile borders, restrained shadow and more horizontal tile spacing reduce competing frames; support labels and dashed planned connections retain their meaning. These changes implement [the homepage composition request](./intent.md#visual-identity-direction).

`DocsMarkdownExample.vue` owns the example's character input, cursor, pause/resume, replay, and complete-text copy. It presents an `index.md` source file without a shell prompt or simulated command output. The complete example is available in SSR, to screen readers, and when reduced motion is requested. A hidden full-text layout reserve prevents the panel from changing height during typing. Normal playback starts when the example enters the viewport, runs once, and keeps its progress while offscreen or while the document is hidden; resuming resets the tick clock rather than consuming background time. Turning on reduced motion finishes immediately, and turning it off leaves the complete example until replay is requested. The copy control always uses the complete Markdown; selecting and copying during typing also copies the complete example instead of a truncated prefix. Clipboard failure reveals the full selectable text. Timers, the visibility observer, and media/document listeners are released on unmount. These controls and styles belong only to this example region and add no package dependency or execution capability.

### Visual identity and diagram layout

[`assets/logo/docs-islands.svg`](../../assets/logo/docs-islands.svg) is the geometry source for the parent identity. [`assets/logo/docs-islands-vitepress.svg`](../../assets/logo/docs-islands-vitepress.svg) independently owns the VitePress integration identity: two offset rounded document boundaries and a detached, tilted island. Each source separates its stable frame and island with product-specific SVG fragment IDs. [`scripts/sync-brand-assets.ts`](../../scripts/sync-brand-assets.ts) deterministically generates ten static variants: six parent assets and four integration assets; `pnpm exec tsx scripts/sync-brand-assets.ts --check` verifies their bytes. The integration source supplies `assets/logo/islands-vitepress.svg` and the package site's logo, favicon, and black Safari mask. Its bilingual package READMEs reference the canonical integration source. The parent and other product identities retain their own geometry; variants of one identity share that identity's paths. Unchanged generated files are not rewritten.

The root and package `NavBarLogo.vue` components reference their own identity's external fragments rather than copying path data. `withBase('/logo.svg')` preserves the package site's `/repos/docs-islands/vitepress/` asset prefix. Both package homepages use the generated favicon as their static hero mark, and the configured icon and mask entries resolve to the same integration source. The root diagram continues to reuse the parent component in its middle layer. The integration follows [the subproject identity constraints](./intent.md#vitepress-integration-identity-direction). The island uses a finite 700 ms activation with a 140 ms delay and `cubic-bezier(0.22, 1, 0.36, 1)`, informed by the independently maintained Limina site's finite reveal cadence. It runs once on viewport entry and may respond to pointer entry, link focus, theme change, or diagram activation. There is no idle loop. Leaving the viewport, hiding the document, enabling reduced motion, or unmounting cancels the animation; observers and listeners are released on unmount.

The root diagram owns a 304 px scene, 68 px framework tiles, and a 56 px bridge. Connector coordinates follow the tile rows and their active offsets. The footer may wrap naturally at narrow widths; compactness does not rely on a transform applied to the whole diagram or smaller label text. VitePress + React is the available Docs Islands bridge. Vue is marked as built in to VitePress: its direct green connection bypasses the bridge, and its tile and signal respond only to VitePress. Vue is excluded from the bridge's available and planned routes. A surface-colored clearance keeps crossing connectors visually separate, and native availability stays solid while another planned integration is previewed. The footer explains both support relationships. Focusing a documentation tile clears the previous pointer preview so keyboard navigation can select its own route even when the pointer remains over another tile. Other planned paths and input behavior remain. This layout and identity follow [the visual identity constraints](./intent.md#visual-identity-direction) and [native-support distinction](./intent.md#documentation-framework-direction).

Both framework rails use local, optimized upstream SVG marks in 22 px boxes: React, Vue, Svelte, Solid, VitePress, Docusaurus, Nextra, and Rspress. Vite imports resolve the asset URLs under the deployment base. The Nextra logomark is extracted from its official wordmark asset and inverted in the site's dark theme; each image is decorative alongside its visible framework name. [Asset provenance](../../docs/.vitepress/theme/components/landing/framework-logos/README.md) records the upstream sources. Rspress replaces the former Astro example according to [the framework-logo direction](./intent.md#documentation-framework-direction).

These facts are established by source ownership. Browser, build, typecheck, and governance results must be reported by the implementing change; this record does not itself claim a successful run.

### VitePress integration landing presentation

The integration landing is owned by the bilingual `packages/vitepress/docs/*/index.md` pages, [`VitePressLanding.vue`](../../packages/vitepress/docs/.vitepress/theme/components/VitePressLanding.vue), [`IslandPrototype.tsx`](../../packages/vitepress/docs/components/react/IslandPrototype.tsx), and [`IntegrationWalkthrough.tsx`](../../packages/vitepress/docs/components/react/IntegrationWalkthrough.tsx). [`integration-walkthrough-content.ts`](../../packages/vitepress/docs/components/react/integration-walkthrough-content.ts) owns snapshots of the actual homepage baseline and the prototype's existing CSS module. [`integration-walkthrough-source.ts`](../../packages/vitepress/docs/components/react/integration-walkthrough-source.ts) separately owns the complete installation/setup reference. The reading order is the introduction and terminal demo, component boundary and four rendering strategies, complete minimal setup, development/build behavior, and guide CTA. The root landing remains independently owned.

These names and the `walkthrough` slot belong to private documentation UI and do not extend the public adapter or configuration APIs. Reference-layout alignment remains pending; the current source retains the hero columns and breakpoints below.

The terminal slot sits inside the hero beside the introduction. Above 1100 CSS pixels, the left copy retains its 490 px column while the right demo extends toward the viewport edge. The terminal uses the hero's introduction instead of a duplicate demo heading; its code pane height depends on the viewport height. At 1100 px and below, the demo follows the copy in one column; at 700 px and below, its existing mobile rail, inner spacing and code height are retained. Both locales share this layout. The progress sentence and explanatory paragraph beneath the terminal are removed; its toolbar still identifies the assisted vi simulation, and Playground is static text with no button, link, clipboard action or copy feedback.

`IntegrationWalkthrough` remains imported in the homepage's existing `<script lang="react">` and rendered with `spa:sync-render client:load` through the Vue landing `walkthrough` slot in both locales. `client:load` schedules eager hydration once its loader and framework are ready; the explicit `spa:sync-render` opt-in synchronizes its prerendered output and CSS with production SPA navigation. The terminal's before and after Markdown buffers retain both directives while adding `pet="sunset"` to that element. `pet` is an ordinary string prop of this local demo component, not a Docs Islands configuration API. `IntegrationWalkthrough` imports the prepared `IslandPrototype` React child and displays it only after the simulated save. This uses the adapter's supported import-based registration and string-prop transport. It needs neither nested Markdown React children nor React portals; the current production runtime externalizes `react-dom` to its client root API, which does not expose `createPortal`. `IslandPrototype` displays the original Sunset v2 atlas through CSS: eight columns, eleven rows, 192 × 208 pixels per cell. The complete sequences use row 4 for five jumping frames, row 1 for eight right-running frames, row 2 for eight native left-running frames, and row 8 for six thinking frames. Vite resolves the colocated `sunset.webp` URL for each deployment base. The page uses the unchanged Sunset atlas; no pet metadata or reference screenshot is shipped. The approved logo and favicon remain independent.

The prototype and CSS module already exist in the configured site. The terminal edits this homepage's `en/index.md` or `zh/index.md` to enable the prepared component, replays recorded development-server messages, then changes the existing module's `--run-direction` from `right` to `left`. Neither scale nor palette changes. This custom property is consumed by this demo's prepared motion controller, not a browser or Docs Islands direction API. The toolbar identifies simulated vi editing and recorded logs; the production page does not write files or run a development server. The visible sprite host appears only after the simulated Markdown save. The CSS module contains the final direction; the presentation's initial-direction selector stops matching when the HMR line arrives. The running controller reads computed CSS, latches one return request, finishes its current complete stride with a short slowdown and runs back on the same route. Actual CSS HMR must be tested separately. The current development runtime can duplicate React roots when a Markdown HMR edit replaces an existing React entry; a following CSS edit can then reset the subtree. The captured development session reloads the preview after the Markdown connection and before changing CSS; that browser action is not a server log line. CSS-only HMR continuity is scoped to that clean page; live Markdown React-entry replacement without a reload is not claimed. This change does not repair or broaden the product runtime.

[`integration-walkthrough-playback.ts`](../../packages/vitepress/docs/components/react/integration-walkthrough-playback.ts) owns fixed buffer/cursor frames and deterministic token bursts, with pauses at semantic boundaries, lines, editor modes, and saves. New imports follow existing declarations. Opening a line reserves a newline before the first character, so original following content stays on a separate row. Braces, parentheses, brackets, quotes and JSX/HTML tags visibly pair before their contents are filled. Closing delimiters are traversed rather than duplicated; nested closing tags move down with child insertions. Arrows, comparisons and quoted `>` attributes do not complete a tag, and self-closing tags receive no extra closing tag. The editor displays line numbers, a positioned cursor, NORMAL/INSERT, navigation/edit keys, Esc and `:wq`, then returns to shell history. The UI identifies this as assisted vi rather than claiming native vi defaults. Commands and recorded server messages accumulate in shell scrollback; vi temporarily displays its alternate buffer and returns to that history on exit. The final transcript includes each recorded output once, without invented save or preview messages. Input delays are divided by 1.2 for 20% faster input playback; reading pauses remain unchanged.

The log snapshots in [`integration-walkthrough-content.ts`](../../packages/vitepress/docs/components/react/integration-walkthrough-content.ts) preserve terminal stdout captured on 2026-10-03 with Node.js 24.21.0, pnpm 11.9.0, VitePress 1.6.4, Vite 5.4.21, React 18.3.1, Logaria 0.0.3 and the local `@docs-islands/vitepress` 0.3.0 build. The connected page uses the docs site's runtime preset and Markdown message filter. ANSI control sequences, surrounding newlines and captured time prefixes are removed; `[vitepress] hmr update`, relative paths, and wording are retained. Each log receives the browser's current local time when its playback event first appears, using `h:mm:ss AM/PM` in both locales. The playback state retains that timestamp through later renders, visibility pauses and completion; it does not use page-load time or logical playback duration. Reduced motion stamps newly revealed logs when the client displays the completed transcript. SSR has no browser clock and leaves time prefixes absent, keeping server and initial client output identical. The Markdown path matches the edited language file. Updating `IslandPrototype.module.css` reaches its importing `IslandPrototype.tsx` React HMR boundary, so the captured server path remains `.tsx`. Browser `runtime.react.dev-render` and `[vite] hot updated` messages are excluded from terminal history. These are snapshots of the two demonstrated saves, not an exhaustive promise for other logger settings, client connections, or tool versions; live HMR event counts can vary. Recapture the relevant process output when those conditions change rather than synthesizing messages from source templates.

[`TerminalCode.tsx`](../../packages/vitepress/docs/components/react/TerminalCode.tsx) renders selectable syntax-colored text for the demo's Markdown with embedded React, CSS, and shell transcript. Its small lexer is limited to these prepared buffers and partially typed input; it renders React text nodes rather than injecting HTML and adds no dependency. Separate light and dark palettes distinguish keywords, tags, properties, strings, numbers, and log labels. The scroll containers retain keyboard focus and accessible read-only labels. Colored spans preserve the buffer's text and whitespace so highlighting does not change the line numbers, cursor coordinates, or playback timing.

A supplemental local build-artifact scan found host absolute module IDs in the generated page metafiles and absolute Vue `__file` values in the prebuilt Site DevTools chunks. This is a publication blocker for the stricter no-personal-path requirement of the landing demonstration. The page-local source and simulated logs use relative paths, but a successful build does not establish that all public metadata is sanitized. The presentation change does not repair the metadata generator or the prebuilt package.

Local UI validation must also account for the documentation configuration's build-time AI reports. With Nx 23.2.1, both root and task dotenv expansion can replace an explicitly empty provider environment variable with the file value. Clearing API-key variables before invoking Nx is therefore not a reliable way to disable analysis. The repository's environment utility retains empty runtime overrides when invoked directly, but the task launcher runs before it. Establish that no provider can execute in the final build process before another UI-only build; CI cache fallback and a failed fetch are not evidence that no request was attempted.

One timeline drives code, route and sprite frames. ResizeObserver measures the terminal border; Sunset plays its full 840 ms jump sequence at the left, runs right along the bottom edge, then returns left after the CSS direction update. Its frame box stays 48 × 52 CSS pixels on desktop and 36 × 39 on mobile. A reserved inner rail keeps it clear of text and controls. One scheduler advances logical time in at most 80 ms slices, preserving typing delays while frames and movement continue through reads and saves. [`sunset-motion.ts`](../../packages/vitepress/docs/components/react/sunset-motion.ts) separates normalized path progress from sprite selection. Both running directions use seven 120 ms frames and a final 220 ms frame; complete strides bound the turn and arrival, with 400 ms speed ramps. At the left endpoint, all six thinking frames repeat slowly: five 450 ms frames and a final 780 ms hold, totaling 3030 ms. The journey runs once. After the first thinking cycle, the JavaScript scheduler stops; CSS continues the thinking loop. Focus and hover do not pause playback. Hiding the page or fully leaving the viewport suspends both the logical clock and CSS loop; re-entry resumes without restart or catch-up. Reduced motion immediately shows a static final thinking frame. Unmount releases timers and observers.

Current support remains VitePress + React 18, matching adapter and peer declarations. Mode descriptions distinguish build-time SSR, client takeover and browser-only rendering. The complete setup reference retains installation, build-plugin configuration, mandatory client-theme registration, component and Markdown examples. Its SSR-selectable tabs retain roving keyboard focus. This terminal usecase does not replace that setup reference or expand runtime support. Existing navigation, deep documentation paths, parent proxy boundary, package runtime, manifests, and deployment configuration remain unchanged. Landing links use `withBase` and the active locale within `/repos/docs-islands/vitepress/`; the options entry continues to use `/options/logging`.

Production SPA navigation between the English and Chinese homepages has a separate hydration limitation: both pages receive the same loader module URL. The [generated React loader](../../packages/vitepress/src/node/adapters/react/client-loader-module-source.ts) registers components only for the active page when that module executes; the [shared component manager](../../packages/core/src/client/docs-component-manager.ts) skips a loader script already present in the document. The destination homepage can therefore show its prerendered terminal without starting playback. Local production previews on 2026-10-04 reproduced this with both the former `client:visible` markup and `spa:sync-render client:load`; fresh document loads hydrate both locales, and entering the updated English homepage from the guide also hydrates. Reproduce by building and previewing the docs site, opening the English homepage and switching to Chinese through the language menu. The directive update does not repair this existing shared-loader registration path.

The scoped Vue stylesheet wraps the complete dark ancestor/component selector in `:global(.dark .vitepress-landing)`. Splitting it as `:global(.dark) .vitepress-landing` targets the ancestor and fails to override the local palette. Dark screenshots and computed palette checks must catch that failure. The presentation follows [the landing constraints](./intent.md#integration-landing-page). Browser, actual CSS HMR, build, typecheck and governance results must be reported by the implementing change; this record does not itself claim a successful run.

### VitePress integration article theme

The package site's article presentation is owned by `.vitepress/article-markdown.ts`, `theme/styles/article-{tokens,navigation}.css`, `theme/styles/article.css`, and `theme/composables/useArticleAccessibility.ts` under `packages/vitepress/docs`. `EnhanceLayout.vue` applies `di-article` only to the resolved `doc` layout and excludes not-found pages. The bilingual homepage, terminal, logo, root documentation theme, runtime, and deployment configuration retain their separate owners. This first implementation does not add search or an article-context component.

The Markdown renderer marks its own headings, paragraphs, lists, quotes, links, inline code, and tables with `di-markdown`. Typography rules target those marked nodes so embedded React/Vue components keep their own presentation. Article tokens use the integration landing's purple identity, independently defined for light and dark themes. The reading column is capped at 704 px, prose/list/quote text uses 16/28 px, block code uses 14/24 px, and the outline includes wrapped level-two and level-three headings. Native navigation, page order, anchors, code groups, syntax highlighting, copy handling, locale routing, and island hydration remain in place.

Markdown tables receive a local overflow wrapper and column-header scope. VitePress 1.6's built-in `table_open` renderer hardcodes HTML and discards token attributes; this theme renders that token through Markdown's standard renderer instead. Keyboard focus belongs to the wrapper only while it overflows, with a localized label and visible scrolling hint. Component-owned tables are not wrapped. The accessibility composable also labels native copy controls, exposes the mobile outline's expanded state, returns focus on Escape, and confines mobile-sidebar focus while restoring the background's previous inert state on close. Route updates and unmount dispose observers and listeners; these helpers do not replace the native router or sidebar state.

Validation must cover both locales and themes, narrow and wide viewports, table overflow/focus, mobile sidebar and outline keyboard behavior, clipboard content, native code groups, repeated SPA transitions, and the existing island examples. Run the discovered documentation typecheck/build targets, the root documentation build, source lint with the existing docs configuration, and `pnpm exec limina check`. Build-generated `.vitepress/.temp` JavaScript can be discovered as uncovered proof sources, while linting generated bundles can produce an oversized report; remove only ignored temporary build output and distinguish source checks from whole-directory lint. This record describes the implementation and the reproducible checks, without asserting their outcome or a merge/deployment.

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

### Logger policy and lifetimes

Each bundler plugin instance holds a compiled pruning policy instead of registering it in the build process's default runtime scope. Runtime emission and pruning share the same config decision function. The public direct transform keeps its explicit scope contract. Pruning only removes statically supported calls with safe argument evaluation, and uses an empty statement to preserve bare control-flow bodies; ambiguous options remain for runtime filtering. See [`plugin/index.ts`](../../packages/logaria/src/plugin/index.ts), [`plugin/transform.ts`](../../packages/logaria/src/plugin/transform.ts) and [`tree-shaking-safety.spec.ts`](../../packages/logaria/src/__tests__/tree-shaking-safety.spec.ts).

Scope reset removes its config and logger reuse cache. New creation after re-registration gets fresh main/group objects; externally held references retain the existing behavior of reading current config and throwing while an explicit scope is missing. Live scopes still retain their cached names until reset. The cache is internal and adds no public disposal API. Default-scope mutations are guarded through both root and scoped public APIs when controlled by a bundler. Preset resolution does not mutate reusable or frozen inputs. Diagnostic summary property access is bounded to selected keys and serialization failures have fallbacks; key enumeration and sorting are not bounded by the output-key limit. See [`instances.ts`](../../packages/logaria/src/core/instances.ts), [`config.ts`](../../packages/logaria/src/core/config.ts), [`runtime-regressions.spec.ts`](../../packages/logaria/src/__tests__/runtime-regressions.spec.ts) and [`controlled-runtime.spec.ts`](../../packages/logaria/src/plugin/__tests__/controlled-runtime.spec.ts).

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
