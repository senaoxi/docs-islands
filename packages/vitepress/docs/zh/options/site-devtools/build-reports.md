# 构建报告

`buildReports` 决定哪些 eligible page 会生成 `Site DevTools` 的构建报告、每个页面使用哪个模型、是否启用缓存，以及 prompt 里包含多少构建证据。报告本身始终是 page-level 的，chunk 和 module 视图只是复用这份页面报告。

## 什么是 eligible page

只有已经包含 docs-islands page-build analysis signals 的页面才会进入这条链路。纯静态 Markdown 页面不会因为开启了 `buildReports` 就自动被分析。

## 最小配置

```ts [.vitepress/config.ts]
const buildReports = {
  cache: true,
  includeChunks: false,
  includeModules: false,
  models: [
    {
      id: 'doubao-pro',
      default: true,
      model: 'doubao-seed-2-0-pro-260215',
      providerRef: {
        provider: 'doubao',
      },
    },
    {
      id: 'claude-sonnet',
      model: 'claude-sonnet-4-20250514',
      maxTokens: 4096,
      providerRef: {
        provider: 'claude',
      },
    },
  ],
};
```

## 配置项

| 配置项                 | 含义                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `cache`                | 是否启用持久化 report cache。`true` 表示使用默认缓存配置，`false` 表示每次都重新生成，对象形式可继续配置 `dir` 和 `strategy`。 |
| `models`               | 可执行的模型配置列表。                                                                                                         |
| `includeChunks`        | 是否把 page-level chunk 细节加入 prompt。默认 `false`。                                                                        |
| `includeModules`       | 是否把 page-level 和 component-level module 细节加入 prompt。默认 `false`。                                                    |
| `resolvePage(context)` | 页面级过滤与局部 override 钩子。可以跳过页面，也可以只覆盖该页的 `modelId`、`cache`、`includeChunks`、`includeModules`。       |

## `resolvePage(context)` 如何工作

| 返回值                         | 行为                                 |
| ------------------------------ | ------------------------------------ |
| `undefined`、`null` 或 `false` | 跳过该页面。                         |
| `{}`                           | 保留该页面，并沿用全局默认配置。     |
| override 对象                  | 保留该页面，并只对该页局部覆盖配置。 |

```ts
const buildReports = {
  models: [
    {
      id: 'default-review',
      default: true,
      model: 'doubao-seed-2-0-pro-260215',
      providerRef: { provider: 'doubao' },
    },
    {
      id: 'perf-review',
      model: 'claude-sonnet-4-20250514',
      providerRef: { provider: 'claude', id: 'us' },
    },
  ],
  resolvePage({ page }) {
    if (page.routePath === '/guide/performance') {
      return {
        modelId: 'perf-review',
        includeChunks: true,
        includeModules: true,
      };
    }

    return null;
  },
};
```

## 缓存策略

当你写 `cache: true` 或省略 `cache` 时，默认配置如下：

| 字段       | 默认值                                   |
| ---------- | ---------------------------------------- |
| `dir`      | `.vitepress/cache/site-devtools-reports` |
| `strategy` | `exact`                                  |

常见策略如下：

| 写法                   | 适合场景                                                        |
| ---------------------- | --------------------------------------------------------------- |
| `cache: false`         | 一次性 correctness check，不想复用旧结果。                      |
| `strategy: 'exact'`    | 本地调 prompt、调模型或调页面范围时，希望缓存严格跟随当前语义。 |
| `strategy: 'fallback'` | CI 或发布环境，希望 provider 暂时不可用时也尽量复用旧报告。     |

`exact` 只会在 prompt 和有效请求语义仍然匹配时复用缓存。`fallback` 允许复用同一页面的旧报告，即使当前 prompt 已经变化。

## 什么时候打开 `includeChunks` / `includeModules`

建议先保持默认关闭，让报告先只回答页面级问题。当页面级结论还不足以解释“为什么这个组件这么重”时，再打开 `includeChunks`；只有在确实需要模块级证据时，再打开 `includeModules`。
