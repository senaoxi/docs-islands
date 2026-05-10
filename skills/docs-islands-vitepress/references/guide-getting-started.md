# Getting Started

Use this when adding `@docs-islands/vitepress` to a VitePress consumer site.

## Prerequisites

| Dependency                 | Required version          |
| -------------------------- | ------------------------- |
| Node.js                    | `^20.19.0` or `>=22.12.0` |
| VitePress                  | `^1.6.3`                  |
| React / ReactDOM           | `^18.2.0`                 |
| `@vitejs/plugin-react-swc` | `^3.9.0`                  |

## Install

```bash
pnpm add -D @docs-islands/vitepress @vitejs/plugin-react-swc
pnpm add react react-dom
```

Use the package manager already used by the consumer project when it is not `pnpm`.

## Configure VitePress

```ts
// .vitepress/config.ts
import { createDocsIslands } from '@docs-islands/vitepress';
import { react } from '@docs-islands/vitepress/adapters/react';
import { defineConfig } from 'vitepress';

const vitepressConfig = defineConfig({
  title: 'Docs',
});

const islands = createDocsIslands({
  adapters: [react()],
});

islands.apply(vitepressConfig);

export default vitepressConfig;
```

Call `islands.apply(vitepressConfig)` after the VitePress config object exists and before exporting it.

## Register the Theme Runtime

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

`reactClient()` has no public options. Do not pass hydration or debug options to it.

## First Island

```tsx
// docs/components/CounterCard.tsx
import './CounterCard.css';

export default function CounterCard() {
  return <section className="counter-card">Hello Docs Islands</section>;
}
```

```md
<script lang="react">
  import CounterCard from './components/CounterCard';
</script>

<CounterCard />
```

Verify the static `ssr:only` result first. Add `client:load`, `client:visible`, or `client:only` only after the static rendering path is known to work.

## Production Verification

- Run the site's normal VitePress build.
- Open a dev server page that imports a React component.
- Confirm the Markdown tag is replaced with rendered output instead of staying as literal text.
- Confirm no browser console errors appear before adding client directives.
