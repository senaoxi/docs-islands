---
name: docs-islands-vitepress
description: Production integration guidance for @docs-islands/vitepress in VitePress sites. Use when installing or configuring the package, wiring the React adapter and theme runtime, authoring React islands in Markdown, choosing render strategies, enabling spa:sync-render, using logging or Site DevTools, or debugging component rendering, hydration, HMR, or build-time analysis.
---

# @docs-islands/vitepress

Use this skill to help a VitePress site consume `@docs-islands/vitepress` safely in production.

## Production Workflow

1. Verify the target site uses Node.js `^20.19.0` or `>=22.12.0`, VitePress `^1.6.3`, React/ReactDOM `^18.2.0`, and `@vitejs/plugin-react-swc` `^3.9.0`.
2. Install the package and React peer dependencies.
3. Apply `createDocsIslands({ adapters: [react()] })` exactly once to the VitePress config.
4. Register `reactClient()` in `.vitepress/theme/index.ts`.
5. Start with `ssr:only` output, confirm the component tag compiles, then opt into client strategies only when the component needs browser interactivity.
6. Run the consumer site's normal VitePress dev/build checks after changing config, theme runtime, Markdown component tags, or render strategy directives.

```bash
pnpm add -D @docs-islands/vitepress @vitejs/plugin-react-swc
pnpm add react react-dom
```

```ts
// .vitepress/config.ts
import { createDocsIslands } from '@docs-islands/vitepress';
import { react } from '@docs-islands/vitepress/adapters/react';
import { defineConfig } from 'vitepress';

const vitepressConfig = defineConfig({
  // Existing VitePress config.
});

const islands = createDocsIslands({
  adapters: [react()],
});

islands.apply(vitepressConfig);

export default vitepressConfig;
```

```ts
// .vitepress/theme/index.ts
import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import { reactClient } from '@docs-islands/vitepress/adapters/react/client';

const theme: Theme = {
  extends: DefaultTheme,
  async enhanceApp() {
    await reactClient();
  },
};

export default theme;
```

## Authoring Baseline

```md
<script lang="react">
  import CounterCard from './CounterCard';
</script>

<CounterCard />
<CounterCard client:load />
<CounterCard client:visible />
<CounterCard client:only />
```

- Import React components from the page's single `<script lang="react">` block.
- Use PascalCase local import names and render the exact same tag name.
- Use self-closing tags only.
- Keep props serializable as HTML/Vue attribute values.
- Keep Node-only APIs in components that are used only as `ssr:only`.

## Strategy Selection

| Strategy                     | Use when                                     | Production note                                           |
| ---------------------------- | -------------------------------------------- | --------------------------------------------------------- |
| `ssr:only`                   | Static or SEO-sensitive output               | Default. No browser interactivity.                        |
| `client:load`                | Above-the-fold or immediately interactive UI | SSR HTML plus immediate hydration.                        |
| `client:visible`             | Below-the-fold interactive UI                | SSR HTML plus lazy hydration on visibility.               |
| `client:only`                | Browser-only APIs or widgets                 | No SSR HTML; expect poorer SEO and possible layout shift. |
| `spa:sync-render` / `spa:sr` | SPA navigation flicker must be reduced       | Production-only SPA optimization; use selectively.        |

## Reference Map

Read only the reference needed for the current task:

- [Getting Started](references/guide-getting-started.md): install, base config, theme runtime, first verification.
- [Authoring Rules](references/guide-authoring-rules.md): Markdown syntax, import/tag constraints, props, and export resolution.
- [Rendering Strategies](references/concept-rendering-strategies.md): strategy decision tree and trade-offs.
- [SSR Only](references/strategy-ssr-only.md): static output, SEO, Node-only data preparation.
- [Client Load](references/strategy-client-load.md): immediate hydration and mismatch avoidance.
- [Client Visible](references/strategy-client-visible.md): lazy hydration for non-critical UI.
- [Client Only](references/strategy-client-only.md): browser-only components and fallback layout.
- [SPA Sync Render](references/feature-spa-sync-render.md): SPA navigation stability, defaults, production caveats.
- [Adapters](references/config-adapters.md): current adapter API and `createDocsIslands()` ownership.
- [Theme](references/config-theme.md): `reactClient()` and optional Site DevTools layout mounting.
- [Site DevTools](references/feature-site-devtools.md): runtime console, browser helper, optional UI dependencies.
- [Site DevTools Config](references/config-site-devtools.md): Doubao provider and build report configuration.
- [Logging](references/config-logging.md): top-level `logging` config, presets, and logger facade rules.
- [Diagnostics](references/guide-diagnostics.md): fastest checks by symptom.
- [How It Works](references/guide-how-it-works.md): architecture and render pipeline summary.
- [Troubleshooting](references/guide-troubleshooting.md): recovery steps for common integration failures.
