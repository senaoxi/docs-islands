# How It Works

## Overview

<Landing client:load spa:sync-render />

[`@docs-islands/vitepress`](https://www.npmjs.com/package/@docs-islands/vitepress) keeps a `VitePress` site organized around Markdown while letting selected parts of the page render React components. This page uses the `react` adapter as the concrete example, but the same container-and-strategy model applies to future framework adapters as well.

### How the Responsibilities Split

| Layer          | Responsibility                                                                                                                                      |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VitePress`    | Page generation, themes, route changes, and Markdown rendering.                                                                                     |
| `docs-islands` | Finds React tags in Markdown, emits render containers, and decides whether each container is prerendered, hydrated, or rendered on the client only. |
| React runtime  | Takes over only the containers that were marked for interaction, not the whole page.                                                                |

This keeps the static-site shape intact and moves rendering decisions to the component boundary instead of introducing a separate frontend application for the whole page.

### Why `spa:sync-render` Exists

`VitePress` ships static HTML on the first visit. During `SPA` route changes, the main `Vue` content updates synchronously, while the HTML, `CSS`, and hydration resources for non-`Vue` components often arrive later. The default behavior is still correct, but it can leave a noticeable gap where the page content has changed and the component has not fully landed yet.

**The following demo environment is running with `CPU: 20x slowdown` and `0.75x` playback speed:**

![spa:sync-render:disable](/spa-sync-render-disable-screenshot.webp)

<video controls>
  <source src="/spa-sync-render-disable-video.mp4" type="video/mp4">
</video>

In the first recording, the main content has already changed while the component HTML and `CSS` are still catching up. Most of the `Layout shift score` comes from visible content movement, reaching `0.1486`, which is already inside Chrome's [**needs improvement**](https://web.dev/articles/cls?utm_source=devtools&utm_campaign=stable&hl=en) range.

> During `VitePress` `SPA` navigation, the main `Vue` content updates earlier than the prerendered `HTML` and `CSS` for non-`Vue` components. That timing gap causes visible flicker and reduces the practical benefit of prerendering during route changes.

`spa:sync-render` addresses that gap by merging the marked component output into Vue's client-side route-transition flow so the prerendered content can land earlier.

![spa:sync-render](/spa-sync-render-screenshot.webp)

<video controls>
  <source src="/spa-sync-render-video.mp4" type="video/mp4">
</video>

With `spa:sync-render` enabled, the recording only shows a small shift caused by resource loading, and the `Layout shift score` drops to `0.0013`.

The trade-off is straightforward: route changes become more visually stable, but the target page needs earlier `CSS` loading and larger client scripts. Use it for components that should appear in lockstep with surrounding content, not as the default for every interactive widget.

::: warning Note on Render-Blocking Critical Styles

When switching routes to a specific page, if the page contains components using the `spa:sync-render` directive, the rendering of the main content will be deferred until all `css` modules required by those components have been loaded. This can block the page from rendering, impacting the user experience.

<video controls>
  <source src="/spa-sync-render-side-effects-video.mp4" type="video/mp4">
</video>

From the video, we can see that before rendering the main content, it's necessary to complete the loading and parsing of all `css` modules for components using the `spa:sync-render` directive, which introduces some rendering blocking and impacts user experience.

This is intentional. Once a component opts into `spa:sync-render`, its styles are treated as resources that need to be ready before the page shows the main content, which avoids component flicker and `FOUC`.

:::

::: warning Client Bundle Size Increase Explanation

When `vitepress` initially renders a page (not route switching), it completes the application's `hydration` work through a simplified `vue` client script (`.lean.js`). Simplified means that `vitepress` filters out all static nodes during compilation to reduce the script size for initial `hydration`.

When routes switch, `vitepress` loads the client-side scripts that the target route page depends on, completing partial client-side rendering work. This is a complete client-side rendering, and client-side scripts must contain all information for rendering components.

The size increase mentioned above **only applies to** client-side scripts loaded during route switching, and **does not affect** the `vue` client script (`.lean.js`) size during initial page rendering (not route switching).

The additional size mostly comes from two places:

| Part                | Description                                                                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `client-runtime.js` | About `13 KB`, used to manage preloading for the `CSS` required by `spa:sync-render` components.                                                                                     |
| Page client module  | Size depends on component count and component size. It now includes the prerendered output for those components plus the `CSS` modules that must be loaded early for sync rendering. |

```js [xxx.md.js]
import { __CSS_LOADING_RUNTIME__ } from './chunks/client-runtime.41d9d1b5.js';
await __CSS_LOADING_RUNTIME__(['/assets/styles.css', '/assets/styles2.css', '/assets/styles3.css']);
```

For the current example page, `Landing`, `ReactComp2`, and `ReactComp3` all use the `spa:sync-render` directive:

The module script without using the `spa:sync-render` directive is approximately `207 KB`, while with the `spa:sync-render` directive it's approximately `212 KB` and requires additional dependency on the `client-runtime.js` module script (about `13 KB`), requiring an additional **`18 KB`** of client-side scripts to be loaded.

:::

It is easiest to think of `spa:sync-render` as a stricter rendering contract: you spend earlier `CSS` loading and extra client bytes in exchange for a more stable static appearance during navigation.

Components that only ever render with `ssr:only` opt into `spa:sync-render` by default. If the same component also appears on the page with a client strategy, it should no longer depend on Node-only APIs.

| Situation                           | Default behavior                                                                              |
| ----------------------------------- | --------------------------------------------------------------------------------------------- |
| `client:only`                       | `spa:sync-render` is not supported.                                                           |
| `client:*` other than `client:only` | Disabled by default. Enable it explicitly with `spa:sync-render` or `spa:sr`.                 |
| `ssr:only` or no explicit strategy  | Enabled by default. Disable it explicitly with `spa:sync-render:disable` or `spa:sr:disable`. |

::: warning SPA Sync-Render Feature Does Not Work in Development

The `spa:sync-render` (or `spa:sr`) feature does not take effect during the development phase. The fundamental technical reason for this limitation lies in the architectural design of VitePress during development: in the development environment, VitePress uses `spa` modules to dynamically render key local content. These `spa` module scripts are executed using dynamic evaluation, a mechanism that is not conducive to the rendering container, which relies on the Vue engine, for obtaining and passing complete initial `props`.

1. **Why is the production environment not affected by this limitation?**

   There is a fundamental difference in the timing of parsing `spa` module scripts between the two environments. In the production environment, the design intentionally completes the pre-rendering of the page's `HTML` first, and only then parses the corresponding `spa` module script. Under this timing arrangement, when the `spa` module script begins to execute, the rendering container's initial `props` have already completed their evaluation process. Therefore, the rendering component corresponding to the rendering container can be safely pre-rendered.

   In contrast, the development environment cannot obtain the complete post-rendering context information. The `props` obtained solely through the dynamic evaluation of the `spa` module script are often incomplete or inaccurate. Under these circumstances, it is not possible to safely pre-render the component for the rendering container in advance. The system can only safely render the corresponding component after the page has finished rendering and the `props` for the rendering container have been obtained.

2. **Design Trade-offs and Solutions**

   The essential reason for this limitation comes from the architectural differences caused by VitePress adopting different rendering strategies in the development and production environments. To minimize environmental discrepancies while ensuring a good development experience, the current library uses intermediate-layer technology during the development phase to simulate the rendering behavior of the production environment as closely as possible. This aims to ensure that the rendering behavior in development remains consistent with the user-specified rendering strategy in production. This is a technical trade-off between development experience and environmental consistency: prioritizing a stable and smooth development experience while using technical means to simulate production environment behavior to the greatest extent possible.

:::

## Usage

<script setup>
  import VueComp1 from './rendering-strategy-comps/vue/VueComp1.vue';
  const page = {
    title: 'Rendering Strategy',
  };
  const vueUniqueId = 'vue-unique-id';
</script>

<script lang="react">
  import ReactComp1 from './rendering-strategy-comps/react/ReactComp1';
  import { ReactComp2 } from './rendering-strategy-comps/react/ReactComp2';
  import ReactComp3 from './rendering-strategy-comps/react/ReactComp3';
  import { ReactComp4 } from './rendering-strategy-comps/react/ReactComp4';
  import { ReactComp5 } from './rendering-strategy-comps/react/ReactComp5';
  import ReactVueSharedComp from './rendering-strategy-comps/react/ReactVueSharedComp';
  import { Landing } from './rendering-strategy-comps/react/Landing';
</script>

::: code-group

```md [playground.md]
<script setup>
  import VueComp1 from './rendering-strategy-comps/vue/VueComp1.vue';
  const page = {
    title: 'Rendering Strategy',
  };
  const vueUniqueId = 'vue-unique-id';
</script>

<script lang="react">
  import ReactComp1 from './rendering-strategy-comps/react/ReactComp1';
  import { ReactComp2 } from './rendering-strategy-comps/react/ReactComp2';
  import ReactComp3 from './rendering-strategy-comps/react/ReactComp3';
  import { ReactComp4 } from './rendering-strategy-comps/react/ReactComp4';
  import { ReactComp5 } from './rendering-strategy-comps/react/ReactComp5';
  import ReactVueSharedComp from './rendering-strategy-comps/react/ReactVueSharedComp';
  import { Landing } from './rendering-strategy-comps/react/Landing';
</script>
```

:::

## Strategy Design

The [`@docs-islands/vitepress`](https://www.npmjs.com/package/@docs-islands/vitepress) cross-framework rendering strategy currently provides four core rendering modes for `react` components, with each mode optimized for specific application scenarios.

### Client:Only

**Feature Analysis**:

1. Suitable for client-side components with strong dependencies on the host environment, such as components that depend on the browser host environment's `window`, `document` objects or host environment `API`.

2. This mode is typically used for rendering non-critical or lightweight components, benefiting `TTFB` metrics (reducing server load), but not beneficial for `FCP`, `LCP` metrics (no content on first screen), `TTI` metrics (need to wait for JS loading), and `SEO` (content not in initial HTML). The impact on `INP` metrics depends on component complexity.

3. This mode has low (or almost no) server load, with the entire rendering overhead borne entirely by the user's host environment. Providers can typically host scripts on `CDN` or use it as a fallback solution during high server load.

4. This mode has low mental burden for developers. It's commonly used when there's no need to integrate complex rendering logic in development environments and when partially updating components in production environments. It's currently the most common rendering mode.

::: code-group

```md [playground.md]
<script lang="react">
  import ReactComp1 from './rendering-strategy-comps/react/ReactComp1';
</script>

<ReactComp1 client:only render-strategy="client:only" component-name="ReactComp1" :page-title="page.title" :render-count="1" />
```

```tsx [ReactComp1.tsx]
import { useState } from 'react';
import type { CompProps } from '../type';
import './css/rc1.css';
import { renderSharedLicense } from './shared/renderSharedLicense';

export default function ReactComp1(props: CompProps) {
  const [count, setCount] = useState(0);
  return (
    <div className="react-comp1-example">
      <strong>
        {props['render-count']}: Rendering Strategy: {props['render-strategy']}
      </strong>
      <ol>
        <li>
          <strong>Component Name:</strong> <span>{props['component-name']}</span>
        </li>
        <li>
          <strong>Page Title:</strong> <span>{props['page-title']}</span>
        </li>
        <li>
          <strong>License:</strong> <span>{renderSharedLicense()}</span>
        </li>
        <li>
          <button className="rc1-button" onClick={() => setCount(count + 1)} type="button">
            Click Me!
          </button>
          <strong>Client-Only Rendering Mode, React Instance Count:</strong> <span>{count}</span>
        </li>
      </ol>
    </div>
  );
}
```

```ts [shared/renderSharedLicense.ts]
export const renderSharedLicense = () => {
  return 'Released under the MIT License. [SHARED MODULE FOR HMR TEST]';
};
```

```css [rc1.css]
.rc1-button {
  padding: 5px;
  border-radius: 8px;
  font-size: 14px;
  margin-right: 8px;
  background-color: #56a8ab;
  color: #9ee2d3;
  border: none;
}
```

:::

The container is pre-processed into:

```html
<div
  __render_id__="5abc056a"
  __render_directive__="client:only"
  __render_component__="ReactComp1"
  __spa_sync_render__="false"
  render-strategy="client:only"
  component-name="ReactComp1"
  page-title="Rendering Strategy"
  render-count="1"
></div>
```

Rendering result:

---

<ReactComp1 client:only render-strategy="client:only" component-name="ReactComp1" :page-title="page.title" :render-count="1" />

---

### SSR:Only

**Feature Analysis**:

1. Suitable for pure static content components, such as data display, `SEO` critical content, and other components that don't require client-side interaction. Server rendering priority strategy is the most commonly used rendering strategy for document content-oriented (`SSG`). This is the default rendering strategy for [`@docs-islands/vitepress`](https://www.npmjs.com/package/@docs-islands/vitepress). `astro` also adopts this strategy as the [default rendering strategy](https://docs.astro.build/en/concepts/why-astro/#server-first):

   > **Astro leverages server rendering over client-side rendering in the browser as much as possible.**

2. Combined with `SSG` mode, pre-rendering overhead only occurs during project build time. After build completion, the generated static `HTML` can be hosted on `CDN` without affecting production server load. If specific real-time rendering support is needed, it can be combined with [`ISR`](https://nextjs.org/docs/app/guides/incremental-static-regeneration) for implementation. This mode can also serve as a fallback solution during high server load.

3. Except for not being beneficial for real-time rendering and interactivity requirements, this mode is beneficial for all other metrics (`FCP`, `LCP`, `SEO`, etc.) while avoiding increases in client-side `JavaScript` bundle size.

> This is the default rendering strategy for [`@docs-islands/vitepress`](https://www.npmjs.com/package/@docs-islands/vitepress), aligning with the core needs of document-oriented projects.

::: code-group

```md [playground.md]
<script lang="react">
  import { ReactComp2 } from './rendering-strategy-comps/react/ReactComp2';
</script>

<ReactComp2 ssr:only spa:sr render-strategy="ssr:only" component-name="ReactComp2" :page-title="page.title" :render-count="2" />
```

```tsx [ReactComp2.tsx]
import { readFileSync } from 'node:fs';
import { join } from 'pathe';
import { useState } from 'react';
import type { CompProps } from '../type';
import './css/rc2.css';
import { renderSharedLicense } from './shared/renderSharedLicense';

interface LocalData {
  data: {
    id: number;
    name: string;
    email: string;
  }[];
}

const targetPath = join(import.meta.dirname, 'local-data.json');
export function ReactComp2(props: CompProps) {
  const [count, setCount] = useState(0);
  const data = JSON.parse(readFileSync(targetPath, 'utf8')) as LocalData;
  const displayLocalData = () => {
    const showLocalList = data.data.map((item) => (
      <li key={item.id}>
        <span>
          <strong>ID:</strong> {item.id}
        </span>
        <br />
        <span>
          <strong>Name:</strong> {item.name}
        </span>
        <br />
        <span>
          <strong>Email:</strong> {item.email}
        </span>
      </li>
    ));
    return <ul>{showLocalList}</ul>;
  };
  return (
    <div className="react-comp2-example">
      <strong>
        {props['render-count']}: Rendering Strategy: {props['render-strategy']}
      </strong>
      <ol>
        <li>
          <strong>Component Name:</strong> <span>{props['component-name']}</span>
        </li>
        <li>
          <strong>Page Title:</strong> <span>{props['page-title']}</span>
        </li>
        <li>
          <button className="rc2-button" onClick={() => setCount(count + 1)} type="button">
            Click Me!
          </button>
          <strong>Pre-rendering Mode Only, React Instance Count:</strong> <span>{count}</span>
        </li>
      </ol>
      <div>{displayLocalData()}</div>
      <div>
        <span>
          <strong>License:</strong> {renderSharedLicense()}
        </span>
      </div>
    </div>
  );
}
```

```ts [shared/renderSharedLicense.ts]
export const renderSharedLicense = () => {
  return 'Released under the MIT License. [SHARED MODULE FOR HMR TEST]';
};
```

```json [local-data.json]
{
  "data": [
    {
      "id": 1,
      "name": "Senao Xi",
      "email": "senaoxi@gmail.com"
    },
    {
      "id": 2,
      "name": "Doe",
      "email": "doe@gmail.com"
    },
    {
      "id": 3,
      "name": "Jane Doe",
      "email": "jane.doe@gmail.com"
    }
  ]
}
```

```css [rc2.css]
.rc2-button {
  padding: 5px;
  border-radius: 8px;
  font-size: 14px;
  margin-right: 8px;
  background-color: pink;
  color: orange;
  border: none;
}
```

:::

The container is pre-processed into:

```html
<div
  __render_id__="17fe40ca"
  __render_directive__="ssr:only"
  __render_component__="ReactComp2"
  __spa_sync_render__="true"
  render-strategy="ssr:only"
  component-name="ReactComp2"
  page-title="Rendering Strategy"
  render-count="2"
></div>
```

Rendering result:

---

<ReactComp2 ssr:only spa:sr render-strategy="ssr:only" component-name="ReactComp2" :page-title="page.title" :render-count="2" />

---

### Client:Load

**Feature Analysis**:

1. This is a typical isomorphic application component that requires server-side rendering to improve first-screen performance while needing client-side interaction functionality, suitable for critical component rendering.
2. Adopts an architecture similar to traditional `SSR`, pre-rendering components at build time to generate initial `HTML`, with client-side scripts executing `hydration` work immediately after loading to take over component interaction. Traditional `SSR` applications may encounter performance bottleneck issues, including server rendering performance issues during high concurrency and client-side `FID`, `INP` metric issues, giving users the feeling of a fake site with weak interactivity. **Islands Architecture** simplifies the complexity of traditional `SSR` architecture, allowing each component container to independently complete rendering and `hydration` processes without waiting for all components to finish rendering before performing one-time root container `hydration`.
3. Note that this is different from traditional `SSR` architecture - this completes `hydration` work on top of `SSG` architecture. Pre-rendering is completed at build time, generating static `HTML`, rather than runtime rendering in traditional `SSR`. After build completion, it can be hosted on `CDN` without affecting production server load. Therefore, using this mode compared to `ssr:only` mode adds client-side `hydration` process, with this overhead borne by `CDN` and user host environment.
4. This mode typically benefits `FCP`, `LCP` metrics (quickly displaying content) but is not beneficial for `TTI` metrics (requires `hydration` time). The impact on `FID`, `INP` metrics depends on the degree of main thread blocking during `hydration` and component complexity.

::: code-group

```md [playground.md]
<script lang="react">
  import ReactComp3 from './rendering-strategy-comps/react/ReactComp3';
</script>

<ReactComp3 client:load spa:sync-render render-strategy="client:load" component-name="ReactComp3" :page-title="page.title" :render-count="3" />
```

```tsx [ReactComp3.tsx]
import { useState } from 'react';
import type { CompProps } from '../type';
import './css/rc3.css';

export default function ReactComp3(props: CompProps) {
  const [count, setCount] = useState(0);
  return (
    <div className="react-comp3-example">
      <strong>
        {props['render-count']}: Rendering Strategy: {props['render-strategy']}
      </strong>
      <ol>
        <li>
          <strong>Component Name:</strong> <span>{props['component-name']}</span>
        </li>
        <li>
          <strong>Page Title:</strong> <span>{props['page-title']}</span>
        </li>
        <li>
          <button className="rc3-button" onClick={() => setCount(count + 1)} type="button">
            Click Me!
          </button>
          <strong>Pre-rendering Client Hydration Mode, React Instance Count:</strong>{' '}
          <span>{count}</span>
        </li>
      </ol>
    </div>
  );
}
```

```css [rc3.css]
.rc3-button {
  padding: 5px;
  border-radius: 8px;
  font-size: 14px;
  margin-right: 8px;
  background-color: #9ceaca63;
  color: #1dd270;
  border: none;
}
```

:::

The container is pre-processed into:

```md
<div
  __render_id__="1194afdb"
  __render_directive__="client:load"
  __render_component__="ReactComp3"
  __spa_sync_render__="true"
  render-strategy="client:load"
  component-name="ReactComp3"
  page-title="Rendering Strategy"
  render-count="3"
></div>
```

Rendering result:

---

<ReactComp3 client:load spa:sync-render render-strategy="client:load" component-name="ReactComp3" :page-title="page.title" :render-count="3" />

---

### Client:Visible

<!-- TODO: Support custom visibility threshold and root margin configuration. -->

**Feature Analysis**:

<!-- markdownlint-disable MD051 -->

1. Suitable for interactive components that are not critical content on the first screen, such as comment systems at the bottom of pages, chart components, etc. However, note that component scripts will adopt preloading strategy by default, not pure lazy loading.
2. Features can refer to [`client:load`](#client-load).

::: code-group

```md [playground.md]
<script lang="react">
  import { ReactComp4 } from './rendering-strategy-comps/react/ReactComp4';
</script>

<ReactComp4 client:visible render-strategy="client:visible" component-name="ReactComp4" :page-title="page.title" :render-count="4" />
```

```tsx [ReactComp4.tsx]
import { useState } from 'react';
import type { CompProps } from '../type';

export function ReactComp4(props: CompProps) {
  const [count, setCount] = useState(0);
  return (
    <div className="react-comp4-example">
      <strong>
        {props['render-count']}: Rendering Strategy: {props['render-strategy']}
      </strong>
      <ol>
        <li>
          <strong>Component Name:</strong> <span>{props['component-name']}</span>
        </li>
        <li>
          <strong>Page Title:</strong> <span>{props['page-title']}</span>
        </li>
        <li>
          <button
            style={{
              padding: '5px',
              borderRadius: '8px',
              fontSize: '14px',
              marginRight: '8px',
              backgroundColor: '#56a8ab',
              color: '#9ee2d3',
              border: 'none',
            }}
            onClick={() => setCount(count + 1)}
            type="button"
          >
            Click Me!
          </button>
          <strong>Pre-rendering Client Visible Hydration Mode, React Instance Count:</strong>{' '}
          <span>{count}</span>
        </li>
      </ol>
    </div>
  );
}
```

:::

The container is pre-processed into:

```md
<div
  __render_id__="473801e9"
  __render_directive__="client:visible"
  __render_component__="ReactComp4"
  __spa_sync_render__="false"
  render-strategy="client:visible"
  component-name="ReactComp4"
  page-title="Rendering Strategy"
  render-count="4"
></div>
```

Rendering result:

---

<ReactComp4 client:visible render-strategy="client:visible" component-name="ReactComp4" :page-title="page.title" :render-count="4" />

---

### Default Strategy

The default rendering strategy is equivalent to `ssr:only` mode. For details, see [`ssr:only`](#ssr-only).

::: code-group

```md [playground.md]
<script lang="react">
  import { ReactComp5 } from './rendering-strategy-comps/react/ReactComp5';
</script>

<ReactComp5 render-strategy="default" component-name="ReactComp5" :page-title="page.title" :render-count="5" />
```

```tsx [ReactComp5.tsx]
import { useState } from 'react';
import type { CompProps } from '../type';

export function ReactComp5(props: CompProps) {
  const [count, setCount] = useState(0);
  return (
    <div className="react-comp5-example">
      <strong>
        {props['render-count']}: Rendering Strategy: {props['render-strategy']}
      </strong>
      <ol>
        <li>
          <strong>Component Name:</strong> <span>{props['component-name']}</span>
        </li>
        <li>
          <strong>Page Title:</strong> <span>{props['page-title']}</span>
        </li>
        <li>
          <button
            style={{
              padding: '5px',
              borderRadius: '8px',
              fontSize: '14px',
              marginRight: '8px',
              backgroundColor: '#56a8ab',
              color: '#9ee2d3',
              border: 'none',
            }}
            onClick={() => setCount(count + 1)}
            type="button"
          >
            Click Me!
          </button>
          <strong>Default Rendering Mode (Pre-rendering Mode Only), React Instance Count:</strong>{' '}
          <span>{count}</span>
        </li>
      </ol>
    </div>
  );
}
```

:::

The container is pre-processed into:

```md
<div
  __render_id__="75efecde"
  __render_directive__="ssr:only"
  __render_component__="ReactComp5"
  __spa_sync_render__="true"
  render-strategy="default"
  component-name="ReactComp5"
  page-title="Rendering Strategy"
  render-count="5"
></div>
```

Rendering result:

---

<ReactComp5 render-strategy="default" component-name="ReactComp5" :page-title="page.title" :render-count="5" />

---

### Rendering Strategy Combination

This library supports nested usage of `vue` components and `react` components. During component **initial rendering**, the `vue` parent component can **one-time** pass data as `props` to `react` child components through `slot` for initializing `react` component state.

> **The initial snapshot of the rendering root container is first processed by the `vue` rendering engine, then completed by the corresponding `UI` framework's rendering work, so the rendering component's `props` can access the root container snapshot properties.**

```md [playground.md]
<script setup>
import VueComp1 from './rendering-strategy-comps/vue/VueComp1.vue';
const page = {
  title: 'Rendering Strategy'
};
const vueUniqueId = 'vue-unique-id';
</script>

<script lang="react">
import ReactVueSharedComp from './rendering-strategy-comps/react/ReactVueSharedComp';
</script>

<VueComp1 :unique-id="vueUniqueId" render-strategy="client:only" component-name="VueComp1" :page-title="page.title" :render-count="6"

> <template #default="{ vueInfo }">

    <ReactVueSharedComp client:only render-strategy="client:only" component-name="ReactVueSharedComp" :page-title="page.title" render-count="3-7" :vue-info="vueInfo" />

  </template>
</VueComp1>
```

::: code-group

```tsx [ReactVueSharedComp.tsx]
import { useState } from 'react';
import type { CompProps } from '../type';

interface ReactVueSharedCompProps extends CompProps {
  'vue-info': string;
}

export default function ReactVueSharedComp(props: ReactVueSharedCompProps) {
  const [count, setCount] = useState(0);
  return (
    <div className="react-vue-shared-comp">
      <strong>
        {props['render-count']}: Rendering Strategy: {props['render-strategy']}
      </strong>
      <ol>
        <li>
          <strong>Component Name:</strong> <span>{props['component-name']}</span>
        </li>
        <li>
          <strong>Page Title:</strong> <span>{props['page-title']}</span>
        </li>
        <li>
          <strong>Vue Component Info:</strong> <span>{props['vue-info']}</span>
        </li>
        <li>
          <button
            style={{
              padding: '5px',
              borderRadius: '8px',
              fontSize: '14px',
              marginRight: '8px',
              backgroundColor: '#56a8ab',
              color: '#9ee2d3',
              border: 'none',
            }}
            onClick={() => setCount(count + 1)}
            type="button"
          >
            Click Me!
          </button>
          <strong>Client-Only Rendering Mode, React Instance Count:</strong> <span>{count}</span>
        </li>
      </ol>
    </div>
  );
}
```

```vue [VueComp1.vue]
<script setup lang="ts">
export interface CompProps {
  componentName: string;
  renderStrategy: string;
  pageTitle: string;
  renderCount: number;
}

const props = defineProps<CompProps>();
const vueInfo = 'VueComp1';
</script>

<template>
  <div class="vue-comp1-example">
    <strong>
      {{ props.renderCount }}: Rendering Strategy:
      {{ props.renderStrategy }}
    </strong>
    <ol>
      <li>
        <strong>Component Name:</strong>
        <span>{{ props.componentName }}</span>
      </li>
      <li>
        <strong>Page Title:</strong> <span>{{ props.pageTitle }}</span>
      </li>
      <li>
        <strong>Child Component Rendering:</strong>
        <slot :vue-info="vueInfo" />
      </li>
    </ol>
  </div>
</template>
```

:::

The container is pre-processed into:

```md
<div
  __render_id__="354a7a63"
  __render_directive__="client:only"
  __render_component__="ReactVueSharedComp"
  __spa_sync_render__="false"
  render-strategy="client:only"
  component-name="ReactVueSharedComp"
  page-title="Rendering Strategy"
  render-count="3-7"
  vue-info="VueComp1"
></div>
```

Rendering result:

---

<VueComp1 :unique-id="vueUniqueId" render-strategy="client:only" component-name="VueComp1" :page-title="page.title" :render-count="6">
  <template #default="{ vueInfo }">
    <ReactVueSharedComp client:only render-strategy="client:only" component-name="ReactVueSharedComp" :page-title="page.title" render-count="3-7" :vue-info="vueInfo" />
  </template>
</VueComp1>

---

## Integration

To enable cross-framework rendering strategies in a `vitepress` project, you need to introduce the corresponding plugins in the build configuration:

::: code-group

```ts [.vitepress/config.ts]
import { defineConfig } from 'vitepress';
import vitepressReactRenderingStrategies from '@docs-islands/vitepress/react';

const vitePressConfig = defineConfig({
  // ...
});

vitepressReactRenderingStrategies(vitePressConfig);

export default vitePressConfig;
```

```ts [.vitepress/theme/index.ts]
import DefaultTheme from 'vitepress/theme';
import reactClientIntegration from '@docs-islands/vitepress/react/client';
import type { Theme } from 'vitepress';

const theme: Theme = {
  extends: DefaultTheme,
  async enhanceApp(context) {
    await reactClientIntegration();
  },
};

export default theme;
```

:::

::: warning Conventions

These rules decide whether a component tag is recognized and transformed. If a tag seems to do nothing, start here.

| Item            | Requirement                                                                                                                                                                                                                                                                                                                                                       |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Component name  | The tag must start with a capital letter and exactly match the local import name from the same page's `<script lang="react">` block. For example, `import { Landing as HomeLanding } from '...';` must be used as `<HomeLanding />`. Any mismatch is skipped during compilation.                                                                                  |
| Tag form        | Only self-closing tags are supported, such as `<Comp />`. `<Comp></Comp>` is skipped and reported with a warning.                                                                                                                                                                                                                                                 |
| Import location | The component must be imported from a `<script lang="react">` block on the same page. Components inside Vue slots or templates are still discovered and transformed correctly.                                                                                                                                                                                    |
| `Props`         | Non-strategic attributes are forwarded to the React container as string `props`. Vue bindings such as `:page-title="page.title"` are evaluated first, written to the DOM, and then read during React render or hydration. This is initialization data, not a reactive bridge. Functions and event handlers cannot be passed across frameworks through attributes. |
| Node-only API   | A component can rely on APIs such as `node:fs` only when it appears on the page exclusively through `ssr:only` containers. As soon as the same component also uses a client strategy on that page, move the Node-only work back to server-side data preparation.                                                                                                  |

When a component uses environment APIs in `ssr:only` mode, two extra constraints apply. First, dependent file paths should be resolved with `import.meta.dirname`. Second, those dependencies do not participate in `HMR` by default, so you need to wire updates through `handleHotUpdate` or refresh the page manually.

```ts
import { readFileSync } from 'node:fs';
const targetPath = join(import.meta.dirname, 'local-data.json'); // [!code focus]
try {
  const data = JSON.parse(readFileSync(targetPath, 'utf8'));
} catch (error) {
  console.error(error);
}
```

```ts [.vitepress/config.ts]
import { defineConfig } from 'vitepress';
const vitepressConfig = defineConfig({
  vite: {
    plugins: [
      {
        name: 'vite-plugin-environment-api-dependency-modules-hot-update',
        apply: 'serve',
        async handleHotUpdate(ctx) {
          const { file, server, modules } = ctx;

          if (file.includes('local-data.json')) {
            const updateModuleEntryPath = join(file, '../', 'ReactComp2.tsx');
            const updateModuleEntry =
              await server.moduleGraph.getModuleByUrl(updateModuleEntryPath);
            if (updateModuleEntry) {
              server.moduleGraph.invalidateModule(updateModuleEntry, new Set(), Date.now(), true);
              return [updateModuleEntry];
            }
          }

          return modules;
        },
      },
    ],
  },
});

export default vitepressConfig;
```

:::
