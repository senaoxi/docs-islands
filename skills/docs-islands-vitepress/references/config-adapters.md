# Adapters

Use this when configuring `createDocsIslands()` and the React adapter.

## Current Public API

```ts
import { createDocsIslands } from '@docs-islands/vitepress';
import { react } from '@docs-islands/vitepress/adapters/react';

const islands = createDocsIslands({
  adapters: [react()],
});

islands.apply(vitepressConfig);
```

The current `react()` adapter takes no public options. Do not pass `compiler`, `jsxRuntime`, `babel`, `swc`, `defaultSyncRender`, or `disableSyncRender` to `react()`.

## Ownership Rules

- Use one `createDocsIslands({ adapters: [...] })` call per VitePress config.
- Put all adapters for the site in the same `adapters` array.
- Do not apply multiple `createDocsIslands()` instances to the same VitePress config.
- Keep adapter setup in `.vitepress/config.ts`, not in the theme runtime.

## What the React Adapter Provides

- Finds imports from `<script lang="react">`.
- Resolves final component references, including valid re-exports.
- Rewrites matching Markdown component tags into render containers.
- Builds SSR output for `ssr:only`, `client:load`, and `client:visible`.
- Builds browser bundles and hydration/runtime wiring for client strategies.
- Participates in development HMR and production SPA sync rendering.

## Dependency Notes

`@vitejs/plugin-react-swc`, `react`, and `react-dom` are peer dependencies for consumer projects that use the React adapter. The adapter loads the React Vite plugin internally; consumers do not need to add a separate React plugin to VitePress just for docs-islands.

## Future Adapter Safety

If another framework adapter is added later, avoid duplicate component local names across framework script blocks in the same Markdown page. Duplicate local names make it impossible to know which framework owns a tag.
