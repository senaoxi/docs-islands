# 工作原理

## 概述

<Landing client:load spa:sync-render />

[`@docs-islands/vitepress`](https://www.npmjs.com/package/@docs-islands/vitepress) 让 `VitePress` 页面继续保持 Markdown-first 的组织方式，同时在局部位置接入 React 组件。当前文档以 `react` 适配器为例说明；后续如引入其他框架适配器，也会沿用同样的容器和策略模型。

### 这条链路如何分工

| 层             | 负责内容                                                                                      |
| -------------- | --------------------------------------------------------------------------------------------- |
| `VitePress`    | 页面生成、主题、路由切换与 Markdown 渲染。                                                    |
| `docs-islands` | 识别 Markdown 里的 React 标签，生成渲染容器，并根据指令决定预渲染、hydration 或纯客户端渲染。 |
| React 运行时   | 只接管被标记的容器，不接管整页。                                                              |

这种设计保留了静态站点的结构，也让渲染策略停留在组件级，而不是把整页改成单独的前端应用。

### 为什么需要 `spa:sync-render`

`VitePress` 在首次访问时直接交付静态 HTML；发生 `SPA` 路由切换时，`Vue` 主体内容的更新是同步完成的，而非 `Vue` 组件对应的 HTML、`CSS` 和 hydration 资源往往稍后才到位。默认行为能够保证最终结果正确，但切页过程中可能看到组件晚于正文出现，或者先出现无样式内容。

**下述演示环境在 `CPU: 20x slowdown`、`0.75` 倍速播放：**

![spa:sync-render:disable](/spa-sync-render-disable-screenshot.webp)

<video controls>
  <source src="/spa-sync-render-disable-video.mp4" type="video/mp4">
</video>

从第一段录屏可以看到，主要内容已经切换完成，而组件相关的 HTML 和 `CSS` 还在补齐。`Layout shift score` 的主要来源是正文区域的偏移，数值达到 `0.1486`，已经落在 Chrome 定义的 [**需要改善**](https://web.dev/articles/cls?utm_source=devtools&utm_campaign=stable&hl=en) 区间。

> 在 `VitePress` 的 `SPA` 路由切换里，`Vue` 主体内容更新更早完成，非 `Vue` 组件对应的预渲染 `HTML` 与 `CSS` 往往稍后才到位。这个时间差会造成明显的视觉闪烁，并让预渲染在切页场景里的收益打折。

`spa:sync-render` 的作用，就是把标记组件的预渲染产物并入 `Vue` 的客户端渲染流程，让这些内容在路由切换时更早落到正确位置。

![spa:sync-render](/spa-sync-render-screenshot.webp)

<video controls>
  <source src="/spa-sync-render-video.mp4" type="video/mp4">
</video>

开启 `spa:sync-render` 后，主要区域更新时只剩资源加载带来的细小位移，`Layout shift score` 降到 `0.0013`。

`spa:sync-render` 的收益很直接：切页时的布局更稳定；代价也同样直接：目标页面需要更早加载相关 `CSS`，客户端脚本也会变大。因此它更适合那些在切页瞬间就应该稳定出现的组件，而不是所有交互组件的默认选项。

::: warning 关键样式阻塞渲染说明

当路由切换到具体页面时，若页面中存在使用 `spa:sync-render` 指令的组件，则需等待所有使用该指令的组件依赖的 `css` 模块加载完成后才会开始渲染主要内容，这可能会导致页面渲染阻塞，影响用户体验。

<video controls>
  <source src="/spa-sync-render-side-effects-video.mp4" type="video/mp4">
</video>

视频中可以看到，渲染主要内容之前需要先完成对于所有使用 `spa:sync-render` 指令的组件的 `css` 模块的加载和解析工作，因此存在一定的渲染阻塞，影响用户体验。

这是有意为之的默认行为。只要组件声明了 `spa:sync-render`，它的样式就会被视为切页时必须先到位的资源，这样页面在显示主要内容时才能避免组件闪烁或 `FOUC`。

:::

::: warning 客户端包体积增加说明

`vitepress` 首次页面渲染(非路由切换)时，会通过简化的 `vue` 客户端脚本(`.lean.js`)完成应用的 `hydration` 工作，简化意味着 `vitepress` 在编译阶段会过滤掉所有静态节点来减少首次 `hydration` 的脚本体积。

当路由切换时，`vitepress` 会加载目标路由页面所依赖的客户端脚本，完成局部客户端渲染工作，这是一个完整的客户端渲染，客户端脚本必须包含渲染组件的所有信息。

上述提到的体积增加 **仅针对** 路由切换时加载的客户端脚本，并 **不会影响** 首次页面渲染(非路由切换)时 `vue` 客户端脚本(`.lean.js`)的体积。

额外体积主要来自两部分：

| 部分                | 说明                                                                                                              |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `client-runtime.js` | 大约 `13 KB`，用于管理 `spa:sync-render` 组件所需 `CSS` 的预加载。                                                |
| 页面客户端模块      | 体积取决于组件数量和组件自身大小，其中会额外包含这些组件的预渲染产物，以及为了同步渲染必须提前加载的 `CSS` 模块。 |

```js [xxx.md.js]
import { __CSS_LOADING_RUNTIME__ } from './chunks/client-runtime.41d9d1b5.js';
await __CSS_LOADING_RUNTIME__(['/assets/styles.css', '/assets/styles2.css', '/assets/styles3.css']);
```

对当前示例页面来说，`Landing`、`ReactComp2`、`ReactComp3` 均使用 `spa:sync-render` 指令：

未使用 `spa:sync-render` 指令的模块脚本大小约为 `207 KB`，使用 `spa:sync-render` 指令的模块脚本大小约为 `212 KB` 且需额外依赖 `client-runtime.js` 模块脚本(约 `13 KB`)，需要额外加载 **`18 KB`** 的客户端脚本。

:::

把 `spa:sync-render` 当成一种更严格的渲染约束会更容易理解：你是在用更早的 `CSS` 加载和额外的客户端脚本，换取切页时更稳定的静态外观。

对于只以 `ssr:only` 出现的组件，系统默认启用 `spa:sync-render`。如果同一组件在当前页还采用了其他客户端策略，就不应该再依赖 Node-only API。

| 情况                             | 默认行为                                                                      |
| -------------------------------- | ----------------------------------------------------------------------------- |
| `client:only`                    | 不支持 `spa:sync-render`。                                                    |
| `client:*`（不含 `client:only`） | 默认关闭，只有显式写上 `spa:sync-render` 或 `spa:sr` 才开启。                 |
| `ssr:only` 或未写策略            | 默认开启，只有显式写上 `spa:sync-render:disable` 或 `spa:sr:disable` 才关闭。 |

::: warning SPA 同步渲染特性在开发阶段不生效

`spa:sync-render`(即 `spa:sr`) 特性并不会在开发阶段生效。这个技术限制的根本原因在于开发阶段 `vitepress` 的架构设计：开发环境下 `vitepress` 均采用 `spa` 模块完成局部关键内容的动态渲染，而这些 `spa` 模块脚本采用动态求值的执行方式，这种执行机制并不利于依赖 `vue` 引擎的渲染容器获取和传递完整的初始 `props`。

1. **生产环境为何不受此限制影响？**

   两个环境下解析 `spa` 模块脚本的时机存在根本性差异。在生产环境中，有意设计为先完成页面 `HTML` 的预渲染工作，然后会再次解析对应的 `spa` 模块脚本。在这个时序安排下，当 `spa` 模块脚本开始执行时，渲染容器的初始 `props` 已经完成求值过程，因此可以安全地预渲染渲染容器对应的渲染组件。

   相比之下，开发环境由于无法获取到完整的渲染完成后的上下文信息，仅凭 `spa` 模块脚本动态求值获取到的 `props` 往往是不完整或不准确的，在这种情况下无法安全地提前渲染渲染容器对应的渲染组件，只能等待页面渲染完成后获取渲染容器对应的 `props` 后才能安全渲染对应的渲染组件。

2. **设计权衡与解决方案**

   这个限制的本质原因来自 `vitepress` 在开发阶段和生产环境下采用不同渲染策略所导致的架构差异。为了在保证开发体验的同时尽可能减少环境差异，当前库在开发阶段通过中间层技术来尽可能模拟生产环境下的渲染行为，力求确保开发阶段的渲染行为与生产环境保持一致，遵循用户指定的渲染策略。这是一种在开发体验与环境一致性之间的技术权衡：优先保证开发阶段的稳定性和流畅体验，同时通过技术手段最大程度地模拟生产环境行为。

:::

## 使用方式

<script setup>
  import VueComp1 from './rendering-strategy-comps/vue/VueComp1.vue';
  const page = {
    title: '渲染策略',
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
    title: '渲染策略',
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

## 策略设计

[`@docs-islands/vitepress`](https://www.npmjs.com/package/@docs-islands/vitepress) 跨框架渲染策略目前为 `react` 组件提供了四种核心渲染模式，每种模式都针对特定的应用场景进行了优化。

### Client:Only

**特征分析**:

1. 适用于强依赖宿主环境的客户端组件，如依赖浏览器宿主环境的 `window`、`document` 对象或宿主环境的 `API` 的组件。

2. 该模式通常用于非关键组件或轻量组件的渲染，利好 `TTFB` 指标（减少服务器负载），但不利好 `FCP`、`LCP` 指标（首屏无内容）、`TTI` 指标（需等待 `JS` 加载）以及 `SEO`（内容不在初始 `HTML` 中）。对 `INP` 指标影响取决于组件复杂度。

3. 该模式对于服务器负载较低(或几乎没有)，整个渲染开销完全由用户宿主环境承担，提供商通常可以将脚本托管到 `CDN` 上或用作服务器高负载时的回退方案。

4. 该模式对于开发者来说心智负担较低，开发环境若无需集成复杂的渲染逻辑以及生产环境中局部更新组件时常见使用到的渲染模式，是现阶段最常见的渲染模式。

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
        {props['render-count']}: 渲染策略: {props['render-strategy']}
      </strong>
      <ol>
        <li>
          <strong>组件名称:</strong> <span>{props['component-name']}</span>
        </li>
        <li>
          <strong>页面标题:</strong> <span>{props['page-title']}</span>
        </li>
        <li>
          <strong>协议:</strong> <span>{renderSharedLicense()}</span>
        </li>
        <li>
          <button className="rc1-button" onClick={() => setCount(count + 1)} type="button">
            点击我!
          </button>
          <strong>仅客户端渲染模式, React 实例数量:</strong> <span>{count}</span>
        </li>
      </ol>
    </div>
  );
}
```

```ts [shared/renderSharedLicense.ts]
export const renderSharedLicense = () => {
  return '根据 MIT 许可证发布。[共享模块用于 HMR 测试]';
};
```

```css [rc1.css]
.rc1-button {
  padding: 5px;
  border-radius: 8px;
  font-size: 14px;
  margin-right: 8px;
  background-color: #ff6d0563;
  color: #0f3923;
  border: none;
}
```

:::

容器预处理为：

```html
<div
  __render_id__="7b68f067"
  __render_directive__="client:only"
  __render_component__="ReactComp1"
  __spa_sync_render__="false"
  render-strategy="client:only"
  component-name="ReactComp1"
  page-title="渲染策略"
  render-count="1"
></div>
```

渲染结果如下：

---

<ReactComp1 client:only render-strategy="client:only" component-name="ReactComp1" :page-title="page.title" :render-count="1" />

---

### SSR:Only

**特征分析**：

1. 适用于纯静态内容组件，如数据展示、`SEO` 关键内容等不需要客户端交互的组件。服务器渲染优先策略是文档内容导向(`SSG`)最常用的渲染策略，这是 [`@docs-islands/vitepress`](https://www.npmjs.com/package/@docs-islands/vitepress) 默认的渲染策略。`astro` 也采取该策略作为 [默认渲染策略](https://docs.astro.build/en/concepts/why-astro/#server-first)：

   > **Astro leverages server rendering over client-side rendering in the browser as much as possible.**

2. 该模式与 `SSG` 模式结合，预渲染开销仅在项目构建时产生，构建完成后生成的静态 `HTML` 可托管到 `CDN` 上，不会影响生产服务器的负载。若需满足特定的实时渲染支持，可结合 [`ISR`](https://nextjs.org/docs/app/guides/incremental-static-regeneration) 来实现。该模式也可作为服务器高负载时的回退方案。

3. 该模式除了不利好实时性渲染和交互性需求外，对其他各指标(`FCP`、`LCP`、`SEO` 等)来说是利好的，同时避免了客户端 `javascript` 包体积的增加。

> 这是 [`@docs-islands/vitepress`](https://www.npmjs.com/package/@docs-islands/vitepress) 的默认渲染策略，符合文档导向型项目的核心需求。

::: code-group

```md [playground.md]
<script lang="react">
  import { ReactComp2 } from './rendering-strategy-comps/react/ReactComp2';
</script>

<ReactComp2 ssr:only render-strategy="ssr:only" component-name="ReactComp2" :page-title="page.title" :render-count="2" />
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
          <strong>标识位:</strong> {item.id}
        </span>
        <br />
        <span>
          <strong>名称:</strong> {item.name}
        </span>
        <br />
        <span>
          <strong>邮箱:</strong> {item.email}
        </span>
      </li>
    ));
    return <ul>{showLocalList}</ul>;
  };
  return (
    <div className="react-comp2-example">
      <strong>
        {props['render-count']}: 渲染策略: {props['render-strategy']}
      </strong>
      <ol>
        <li>
          <strong>组件名称:</strong> <span>{props['component-name']}</span>
        </li>
        <li>
          <strong>页面标题:</strong> <span>{props['page-title']}</span>
        </li>
        <li>
          <button className="rc2-button" onClick={() => setCount(count + 1)} type="button">
            点击我!
          </button>
          <strong>仅预渲染模式, React 实例数量:</strong> <span>{count}</span>
        </li>
      </ol>
      <div>{displayLocalData()}</div>
      <div>
        <span>
          <strong>协议:</strong> {renderSharedLicense()}
        </span>
      </div>
    </div>
  );
}
```

```ts [shared/renderSharedLicense.ts]
export const renderSharedLicense = () => {
  return '根据 MIT 许可证发布。[共享模块用于 HMR 测试]';
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
  background-color: #9ceaca63;
  color: #1dd270;
  border: none;
}
```

:::

容器预处理为：

```html
<div
  __render_id__="381f7181"
  __render_directive__="ssr:only"
  __render_component__="ReactComp2"
  __spa_sync_render__="true"
  render-strategy="ssr:only"
  component-name="ReactComp2"
  page-title="渲染策略"
  render-count="2"
></div>
```

渲染结果如下：

---

<ReactComp2 ssr:only render-strategy="ssr:only" component-name="ReactComp2" :page-title="page.title" :render-count="2" />

---

### Client:Load

**特征分析**：

1. 这是典型的同构应用组件，需要服务端渲染以提升首屏性能，同时需要客户端交互功能，适用于关键组件的渲染。
2. 采用类似传统 `SSR` 的架构模式，在构建时预渲染组件生成初始 `HTML`，客户端脚本加载完成后立即执行 `hydration` 工作接管组件交互。在传统 `SSR` 应用中可能会遇到性能瓶颈问题，包括高并发时服务器渲染性能问题和客户端 `FID`、`INP` 指标问题，给用户感觉是虚假站点而弱交互性体验。**孤岛架构** 简化了传统 `SSR` 架构的复杂度，各组件容器可独立完成渲染和 `hydration` 流程，无需等待所有组件渲染完成后进行根容器的一次性 `hydration`。
3. 需要注意的是，这与传统的 `SSR` 架构不同，这是在 `SSG` 架构基础上完成 `hydration` 工作。预渲染在构建时完成，生成静态 `HTML`，而非传统 `SSR` 的运行时渲染，构建完成后可托管到 `CDN` 上，不会影响生产服务器的负载。因此使用该模式相对于 `ssr:only` 模式，增加的是客户端 `hydration` 流程，这部分开销由 `CDN` 和用户宿主环境承担。
4. 该模式通常情况下利好 `FCP`、`LCP` 指标（快速显示内容），但不利好 `TTI` 指标（需要 `hydration` 时间）。对 `FID`、`INP` 指标的影响取决于 `hydration` 期间的主线程阻塞程度和组件复杂度。

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
        {props['render-count']}: 渲染策略: {props['render-strategy']}
      </strong>
      <ol>
        <li>
          <strong>组件名称:</strong> <span>{props['component-name']}</span>
        </li>
        <li>
          <strong>页面标题:</strong> <span>{props['page-title']}</span>
        </li>
        <li>
          <button className="rc3-button" onClick={() => setCount(count + 1)} type="button">
            点击我!
          </button>
          <strong>预渲染客户端 hydration 模式, React 实例数量:</strong> <span>{count}</span>
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
  background-color: #56a8ab;
  color: #9ee2d3;
  border: none;
}
```

:::

容器预处理为：

```md
<div
  __render_id__="57eb78e7"
  __render_directive__="client:load"
  __render_component__="ReactComp3"
  __spa_sync_render__="true"
  render-strategy="client:load"
  component-name="ReactComp3"
  page-title="渲染策略"
  render-count="3"
></div>
```

渲染结果如下：

---

<ReactComp3 client:load spa:sync-render render-strategy="client:load" component-name="ReactComp3" :page-title="page.title" :render-count="3" />

---

### Client:Visible

<!-- TODO: 支持自定义可见性阈值和根边距配置。 -->

**特征分析**：

<!-- markdownlint-disable MD051 -->

1. 适用于非首屏关键内容的交互式组件，如页面底部的评论系统、图表组件等。但需要注意的是，组件脚本默认会采取预加载策略，并非存粹的懒加载。
2. 特征可参考 [`client:load`](#client-load)。

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
        {props['render-count']}: 渲染策略: {props['render-strategy']}
      </strong>
      <ol>
        <li>
          <strong>组件名称:</strong> <span>{props['component-name']}</span>
        </li>
        <li>
          <strong>页面标题:</strong> <span>{props['page-title']}</span>
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
            点击我!
          </button>
          <strong>预渲染客户端可见 hydration 模式, React 实例数量:</strong> <span>{count}</span>
        </li>
      </ol>
    </div>
  );
}
```

:::

容器预处理为：

```md
<div
  __render_id__="3948d788"
  __render_directive__="client:visible"
  __render_component__="ReactComp4"
  __spa_sync_render__="false"
  render-strategy="client:visible"
  component-name="ReactComp4"
  page-title="渲染策略"
  render-count="4"
></div>
```

渲染结果如下：

---

<ReactComp4 client:visible render-strategy="client:visible" component-name="ReactComp4" :page-title="page.title" :render-count="4" />

---

### 默认策略

默认渲染策略等价于 `ssr:only` 模式，详情可见 [`ssr:only`](#ssr-only)。

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
        {props['render-count']}: 渲染策略: {props['render-strategy']}
      </strong>
      <ol>
        <li>
          <strong>组件名称:</strong> <span>{props['component-name']}</span>
        </li>
        <li>
          <strong>页面标题:</strong> <span>{props['page-title']}</span>
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
            点击我!
          </button>
          <strong>默认渲染模式(仅预渲染模式), React 实例数量:</strong> <span>{count}</span>
        </li>
      </ol>
    </div>
  );
}
```

:::

容器预处理为：

```md
<div
  __render_id__="a0449579"
  __render_directive__="ssr:only"
  __render_component__="ReactComp5"
  __spa_sync_render__="true"
  render-strategy="default"
  component-name="ReactComp5"
  page-title="渲染策略"
  render-count="5"
></div>
```

渲染结果如下：

---

<ReactComp5 render-strategy="default" component-name="ReactComp5" :page-title="page.title" :render-count="5" />

---

### 渲染策略组合

本库支持 `vue` 组件与 `react` 组件的嵌套使用。在组件 **首次渲染** 时，`vue` 父组件可以通过 `slot` 将数据作为 `props` **一次性** 传递给 `react` 子组件，用于初始化 `react` 组件的状态。

> **渲染根容器首次快照会先经 `vue` 渲染引擎处理，再完成对应 `UI` 框架的渲染工作，因此渲染组件的 `props` 可访问到根容器快照的属性。**

```md [playground.md]
<script setup>
import VueComp1 from './rendering-strategy-comps/vue/VueComp1.vue';
const page = {
  title: '渲染策略'
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
        {props['render-count']}: 渲染策略: {props['render-strategy']}
      </strong>
      <ol>
        <li>
          <strong>组件名称:</strong> <span>{props['component-name']}</span>
        </li>
        <li>
          <strong>页面标题:</strong> <span>{props['page-title']}</span>
        </li>
        <li>
          <strong>Vue 组件信息:</strong> <span>{props['vue-info']}</span>
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
            点击我!
          </button>
          <strong>仅客户端渲染模式, React 实例数量:</strong> <span>{count}</span>
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
    <strong> {{ props.renderCount }}: 渲染策略: {{ props.renderStrategy }} </strong>
    <ol>
      <li>
        <strong>组件名称:</strong> <span>{{ props.componentName }}</span>
      </li>
      <li>
        <strong>页面标题:</strong> <span>{{ props.pageTitle }}</span>
      </li>
      <li>
        <strong>子组件渲染:</strong>
        <slot :vue-info="vueInfo" />
      </li>
    </ol>
  </div>
</template>
```

:::

容器预处理为：

```md
<div
  __render_id__="4b8c8047"
  __render_directive__="client:only"
  __render_component__="ReactVueSharedComp"
  __spa_sync_render__="false"
  render-strategy="client:only"
  component-name="ReactVueSharedComp"
  page-title="渲染策略"
  render-count="3-7"
  vue-info="VueComp1"
></div>
```

渲染结果如下：

---

<VueComp1 :unique-id="vueUniqueId" render-strategy="client:only" component-name="VueComp1" :page-title="page.title" :render-count="6">
  <template #default="{ vueInfo }">
    <ReactVueSharedComp client:only render-strategy="client:only" component-name="ReactVueSharedComp" :page-title="page.title" render-count="3-7" :vue-info="vueInfo" />
  </template>
</VueComp1>

---

## 集成方式

要在 `vitepress` 项目中启用跨框架渲染策略，需要在构建配置中引入相应的插件：

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

::: warning 约定事项

这些约定决定组件是否会被识别并转换。页面出现“标签没有生效”时，先检查这里。

| 项目          | 要求                                                                                                                                                                                                     |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 组件名称      | 标签名必须以大写字母开头，并与同页 `<script lang="react">` 里的本地导入名完全一致。比如 `import { Landing as HomeLanding } from '...';` 对应的标签必须写成 `<HomeLanding />`。名称不一致会直接跳过编译。 |
| 标签形式      | 只支持自闭合标签，例如 `<Comp />`。`<Comp></Comp>` 会跳过编译并给出警告。                                                                                                                                |
| 导入位置      | 组件必须在同一页的 `<script lang="react">` 中导入；未导入的标签不会被处理。组件也可以出现在 Vue 插槽或模板里，转换逻辑仍然有效。                                                                         |
| `Props`       | 非策略属性会以字符串 `props` 传给 React 容器。像 `:page-title="page.title"` 这样的 Vue 绑定会先写入 DOM，再在 React 渲染或 hydration 时读取；这不是响应式桥接。函数和事件处理器不能通过属性跨框架传递。  |
| Node-only API | 同一组件只在 `ssr:only` 容器里渲染时，才可以依赖 `node:fs` 这类 Node-only API。只要同一页同时出现客户端策略，就应把这类逻辑移回服务端数据准备阶段。                                                      |

如果组件在 `ssr:only` 模式下依赖环境 API，还需要注意两点。第一，依赖文件路径应通过 `import.meta.dirname` 求值。第二，这类依赖默认不参与 `HMR`，需要你自己用 `handleHotUpdate` 补上更新逻辑，否则改动后要手动刷新页面。

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
