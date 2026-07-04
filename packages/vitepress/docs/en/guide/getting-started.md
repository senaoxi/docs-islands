# Getting Started

## Prerequisites

| Dependency                 | Required version        |
| -------------------------- | ----------------------- |
| Node.js                    | `^22.18.0 or >=24.11.0` |
| VitePress                  | `^1.6.3`                |
| React / ReactDOM           | `^18.2.0`               |
| `@vitejs/plugin-react-swc` | `^3.9.0`                |

## 1. Install Dependencies

```bash
pnpm add -D @docs-islands/vitepress @vitejs/plugin-react-swc
pnpm add react react-dom
```

## 2. Apply the Plugin in `.vitepress/config.ts`

```ts [.vitepress/config.ts]
import { createDocsIslands } from '@docs-islands/vitepress';
import { react } from '@docs-islands/vitepress/adapters/react';
import { defineConfig } from 'vitepress';

const vitepressConfig = defineConfig({
  // your VitePress config
});

const islands = createDocsIslands({
  adapters: [react()],
});

islands.apply(vitepressConfig);

export default vitepressConfig;
```

## 3. Register the Client Runtime in Your Theme

```ts [theme/index.ts]
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

## 4. Render the First Island in Markdown

Create a component. Keeping the presentation in a separate CSS file makes the example closer to a real project:

::: code-group

```tsx [CounterCard.tsx]
import './CounterCard.css';

export default function CounterCard() {
  return (
    <section className="counter-card">
      <div className="counter-card__eyebrow">
        <span className="counter-card__dot" />
        Getting started example
      </div>
      <h3 className="counter-card__title">Hello Docs Islands</h3>
      <p className="counter-card__body">
        Your first React component is already rendering inside this VitePress page.
      </p>
    </section>
  );
}
```

```css [CounterCard.css]
.counter-card {
  padding: 20px;
  border-radius: 16px;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-soft);
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.08);
}

.counter-card__eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--vp-c-text-2);
  font-size: 13px;
  font-weight: 500;
}

.counter-card__dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--vp-c-brand-1);
  opacity: 0.65;
}

.counter-card__title {
  margin: 12px 0 6px;
  font-size: 20px;
  line-height: 1.2;
}

.counter-card__body {
  margin: 0;
  color: var(--vp-c-text-2);
  line-height: 1.6;
}
```

:::

Then import and render it in Markdown:

```md [index.md]
<script lang="react">
  import CounterCard from './CounterCard';
</script>

<CounterCard />
```

Then the page will render this result:

---

<script lang="react">
  import CounterCard from './CounterCard';
</script>

<CounterCard />

---

## 5. Verify the First Integration

Use `ssr:only` first and confirm the whole chain is working: the page should build successfully, the Markdown component tag should be recognized, and the component output should appear as stable static content. Only move to `client:load` or `client:visible` when the component actually needs interaction. If the first pass already looks wrong, start with [Troubleshooting](./troubleshooting.md).

## Optional: Mount `Site DevTools` in the Same Pass

If you want runtime visibility early, mount `Site DevTools` during the same setup pass. Keep the setup minimal here; model, cache, and page-scope settings belong in the reference pages.

### Mount the Console in Your Theme

```ts [theme/index.ts]
import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import SiteDevToolsLayout from './SiteDevToolsLayout.vue';
import { reactClient } from '@docs-islands/vitepress/adapters/react/client';
import '@docs-islands/vitepress/devtools/client/style.css';
// Optional: only import this when vue-json-pretty is installed.
import 'vue-json-pretty/lib/styles.css';

const theme: Theme = {
  extends: DefaultTheme,
  Layout: SiteDevToolsLayout,
  async enhanceApp() {
    await reactClient();
  },
};

export default theme;
```

```vue [SiteDevToolsLayout.vue]
<script setup lang="ts">
import SiteDevToolsConsole from '@docs-islands/vitepress/devtools/client';
import DefaultTheme from 'vitepress/theme';
</script>

<template>
  <DefaultTheme.Layout />
  <SiteDevToolsConsole />
</template>
```

### Turn It On

The console supports URL-based toggles. Use `?site-devtools=1` to force it on and `?site-devtools=0` to force it off; the current choice is persisted for later visits. This docs site also supports a triple-click on the top-left `logo` as a local toggle.

::: tip When to Add `siteDevtools.analysis`

If you only need the runtime overlay and `Debug Logs`, mounting the console is enough. If you want the console to read build-time analysis reports, continue with [Build-time Analysis](../options/site-devtools/analysis.md). If you also need provider selection, model choice, page scope, or cache strategy, continue with [Providers and Models](../options/site-devtools/models.md) and [Build Reports](../options/site-devtools/build-reports.md).

:::
