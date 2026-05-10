# Theme Integration

Use this when wiring the VitePress theme runtime.

## React Runtime

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

`reactClient()` initializes the browser runtime and development HMR integration when running in the browser. It has no public options.

## With Custom Theme Code

Preserve existing theme behavior and add `reactClient()` inside the existing `enhanceApp`:

```ts
const theme: Theme = {
  extends: DefaultTheme,
  async enhanceApp(ctx) {
    await DefaultTheme.enhanceApp?.(ctx);
    // Existing app setup can stay here.
    await reactClient();
  },
};
```

If the current theme already defines `Layout`, keep it unless Site DevTools must be mounted.

## Mount Site DevTools

```ts
// .vitepress/theme/index.ts
import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import SiteDevToolsLayout from './SiteDevToolsLayout.vue';
import { reactClient } from '@docs-islands/vitepress/adapters/react/client';
import '@docs-islands/vitepress/devtools/client/style.css';

const theme: Theme = {
  extends: DefaultTheme,
  Layout: SiteDevToolsLayout,
  async enhanceApp() {
    await reactClient();
  },
};

export default theme;
```

```vue
<!-- .vitepress/theme/SiteDevToolsLayout.vue -->
<script setup lang="ts">
import SiteDevToolsConsole from '@docs-islands/vitepress/devtools/client';
import DefaultTheme from 'vitepress/theme';
</script>

<template>
  <DefaultTheme.Layout />
  <SiteDevToolsConsole />
</template>
```

Optional UI packages `vue-json-pretty`, `prettier`, and `shiki` improve Site DevTools presentation but have fallbacks when absent.

## Failure Signs

- Literal `<Component />` text usually means config/plugin parsing failed.
- Static SSR output with no interactivity usually means `reactClient()` is missing or not awaited.
- Site DevTools not appearing usually means the layout is not mounted, CSS is missing, or `?site-devtools=1` was not used.
