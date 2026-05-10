# Diagnostics

Use this for the fastest first checks before deeper troubleshooting.

## Component Tag Stays Literal

- Confirm `.vitepress/config.ts` calls `islands.apply(vitepressConfig)`.
- Confirm `react()` is in `adapters`.
- Confirm the page has one `<script lang="react">`.
- Confirm the imported local name is PascalCase and exactly matches the rendered tag.
- Confirm the tag is self-closing.
- Restart the dev server once to rule out stale HMR state.

## Static Output Works but Interactivity Does Not

- Confirm `.vitepress/theme/index.ts` awaits `reactClient()`.
- Confirm the component uses `client:load`, `client:visible`, or `client:only`; `ssr:only` has no interactivity.
- Check the browser console for hydration or runtime import errors.

## Hydration Mismatch

- Remove time, randomness, viewport, and browser storage from the first render.
- Move browser-only logic into `useEffect`.
- Switch to `client:only` only when SSR cannot be made deterministic.

## SPA Navigation Flicker

- Reproduce in a production build or preview.
- Add `spa:sync-render` only to visible components that shift during route changes.
- Use Site DevTools render metrics to compare status, visible wait, and bundle relation.

## Node API Fails in Browser

- Keep Node-only APIs inside components that are used only with `ssr:only`.
- Split server data preparation from interactive client rendering.
- Do not reuse the same Node-bound component with a client strategy on the same page.

## Logs Are Too Noisy

- Configure top-level `logging`.
- Prefer preset plugins before broad direct rules.
- Use Site DevTools Debug Logs when runtime evidence matters.
