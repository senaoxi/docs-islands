# Troubleshooting

Use this after the quick diagnostics identify the likely failure class.

## Markdown Tags Are Ignored

Most causes are in the recognition pipeline:

1. Verify `createDocsIslands({ adapters: [react()] })` exists.
2. Verify `islands.apply(vitepressConfig)` runs before export.
3. Verify the Markdown page has exactly one `<script lang="react">` block.
4. Verify the import can resolve to the final component file.
5. Verify the rendered tag name is the imported local name.
6. Verify the tag is PascalCase and self-closing.

If all are correct, restart the dev server to rule out stuck HMR state.

## Component Renders but Is Not Interactive

`ssr:only` is the default and intentionally has no browser interactivity.

- Add `client:load` for immediate interactivity.
- Add `client:visible` for deferred below-the-fold interactivity.
- Add `client:only` only when SSR is impossible.
- Confirm the theme awaits `reactClient()`.

## Hydration Mismatch

Hydration mismatch means the prerendered HTML and first browser render differ.

Recovery order:

1. Move back to `ssr:only` and confirm stable static output.
2. Remove nondeterministic first-render values.
3. Move browser-only reads into `useEffect`.
4. Pass deterministic props from Markdown.
5. Use `client:only` only if the component cannot SSR.

## Browser Error Mentions Node APIs

The component is probably using Node-only code with a client strategy.

- Keep Node-only logic in `ssr:only` components.
- Precompute data in server-side code and pass serializable props to interactive components.
- Split `DataBlock.server.tsx` and `DataBlock.client.tsx` style responsibilities when needed.

## Flicker During SPA Navigation

First reproduce with a production build or preview, because `spa:sync-render` does not take effect in development mode.

Use this order:

1. Confirm the component really needs interactivity.
2. Prefer `ssr:only` for presentational output.
3. Add `spa:sync-render` to visible `client:load` or `client:visible` components that shift.
4. Avoid it for heavy below-the-fold UI.
5. Inspect Site DevTools render metrics for status and bundle evidence.

## HMR Is Slow or Noisy

- Use `logging` presets to focus on `hmr`, `runtime`, or `transform`.
- Open Site DevTools and inspect HMR metrics.
- If a Markdown page has multiple `<script lang="react">` blocks, merge them.
- If only SSR-only local data changed, remember Node file reads do not automatically create HMR dependencies unless explicitly wired.

## Site DevTools Is Missing

- Confirm `SiteDevToolsConsole` is mounted in the theme layout.
- Confirm `@docs-islands/vitepress/devtools/client/style.css` is imported.
- Open the page with `?site-devtools=1`.
- Optional UI dependencies have fallbacks; missing `vue-json-pretty`, `prettier`, or `shiki` should not prevent the console from mounting.

## Build-Time Reports Are Missing

- Confirm `siteDevtools.analysis.providers.doubao` or `siteDevtools.analysis.providers.claude` has at least one provider.
- Confirm `siteDevtools.analysis.buildReports.models` has at least one model.
- Confirm `providerRef.provider` is `doubao` or `claude`.
- Confirm `resolvePage` does not skip the page.
- Remember pure static Markdown pages without docs-islands analysis signals are not report targets just because `buildReports` exists.
