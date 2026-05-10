# How It Works

Use this when the implementation model matters for a design or debugging decision.

## Responsibility Split

| Layer         | Responsibility                                                                        |
| ------------- | ------------------------------------------------------------------------------------- |
| VitePress     | Markdown, routing, themes, static site generation                                     |
| docs-islands  | Detect framework script blocks, transform component tags, build SSR/browser artifacts |
| React runtime | Hydrate or render only the marked React containers                                    |

## Build Pipeline

1. VitePress loads Markdown pages.
2. docs-islands finds `<script lang="react">` blocks.
3. The React parser resolves imported PascalCase component references.
4. Matching self-closing Markdown component tags are replaced with render containers.
5. `ssr:only`, `client:load`, and `client:visible` containers receive prerendered HTML.
6. Client strategies get browser runtime bundles.
7. The theme runtime `reactClient()` discovers containers and executes the selected strategy in the browser.

## Render Containers

Component tags become containers with internal attributes such as:

```html
<div
  __render_id__="abcd1234"
  __render_directive__="client:load"
  __render_component__="Hero"
  __spa_sync_render__="false"
></div>
```

User props remain attributes on the generated container and are passed to React as string-like props.

## Runtime Behavior

- `ssr:only`: static HTML is present; no browser React root is mounted for interaction.
- `client:load`: static HTML is present; React hydrates immediately.
- `client:visible`: static HTML is present; React hydrates when visible.
- `client:only`: initial container is empty; React renders in the browser.

## SPA Sync Model

`spa:sync-render` injects selected prerendered output into the SPA route transition so the component appears closer to surrounding Vue/Markdown content during navigation. This is a production optimization; development mode simulates enough behavior for iteration but does not apply the production sync path.

## HMR Model

Development HMR distinguishes Markdown updates, React Fast Refresh updates, and SSR-only direct re-render paths. When HMR evidence matters, use top-level `logging` to focus logs and Site DevTools HMR metrics to see trigger/apply/runtime-ready timing.
