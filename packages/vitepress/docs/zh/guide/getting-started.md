# 快速上手

## 先决条件

| 依赖                       | 版本要求                 |
| -------------------------- | ------------------------ |
| Node.js                    | `^22.18.0` 或 `>=24.0.0` |
| VitePress                  | `^1.6.3`                 |
| React / ReactDOM           | `^18.2.0`                |
| `@vitejs/plugin-react-swc` | `^3.9.0`                 |

## 1. 安装依赖

```bash
pnpm add -D @docs-islands/vitepress @vitejs/plugin-react-swc
pnpm add react react-dom
```

## 2. 应用插件

```ts [.vitepress/config.ts]
import { createDocsIslands } from '@docs-islands/vitepress';
import { react } from '@docs-islands/vitepress/adapters/react';
import { defineConfig } from 'vitepress';

const vitepressConfig = defineConfig({
  // 你的 VitePress 配置
});

const islands = createDocsIslands({
  adapters: [react()],
});

islands.apply(vitepressConfig);

export default vitepressConfig;
```

## 3. 在主题里注册客户端运行时

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

## 4. 在 Markdown 中渲染第一个孤岛组件

先准备一个组件。这里把展示样式单独拆到 CSS 文件里，方便在真实项目里继续扩展：

::: code-group

```tsx [CounterCard.tsx]
import './CounterCard.css';

export default function CounterCard() {
  return (
    <section className="counter-card">
      <div className="counter-card__eyebrow">
        <span className="counter-card__dot" />
        快速上手示例
      </div>
      <h3 className="counter-card__title">你好，Docs Islands</h3>
      <p className="counter-card__body">
        你的第一个 React 组件已经成功渲染在这篇 VitePress 页面里。
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

然后在 Markdown 中导入并渲染它：

```md [index.md]
<script lang="react">
  import CounterCard from './CounterCard';
</script>

<CounterCard />
```

那么你将会看到页面渲染结果：

---

<script lang="react">
  import CounterCard from './CounterCard';
</script>

<CounterCard />

---

## 5. 验证第一次接入

先用 `ssr:only` 验证整条链路是否打通：页面应能正常构建，Markdown 里的组件标签不会被忽略，组件输出会和普通静态内容一起稳定出现。只有在组件确实需要交互时，再改成 `client:load` 或 `client:visible`。如果一开始就有异常，先看 [排障](./troubleshooting.md)。

## 可选：把 `Site DevTools` 一起接上

如果你希望尽早看到页面运行时状态，可以在同一轮接入里把 `Site DevTools` 挂上。这里保留最小配置，更细的模型、缓存和页面范围设置放到 reference 页面。

### 在主题里挂载控制台

```ts [theme/index.ts]
import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import SiteDevToolsLayout from './SiteDevToolsLayout.vue';
import { reactClient } from '@docs-islands/vitepress/adapters/react/client';
import '@docs-islands/vitepress/devtools/client/style.css';
// 可选：只有安装了 vue-json-pretty 才需要引入。
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

### 开启方式

控制台支持 URL 参数开关。`?site-devtools=1` 表示强制开启，`?site-devtools=0` 表示强制关闭；当前选择会持久化到后续访问。这份文档站还提供了左上角 `logo` 连续点击 3 次的本地切换方式。

::: tip 什么时候再配 `siteDevtools.analysis`

如果你现在只想看页面浮层和 `Debug Logs`，挂上控制台就够了。如果希望在控制台里读取构建期分析报告，再继续看 [构建期分析](../options/site-devtools/analysis.md)。需要继续控制 provider、模型、页面范围和缓存策略时，再读 [Provider 与模型](../options/site-devtools/models.md) 和 [构建报告](../options/site-devtools/build-reports.md)。

:::
