# 构建期分析

`siteDevtools.analysis` 用来声明构建期分析报告所需的 provider、model 和页面报告配置。只有当你希望 `Site DevTools` 在运行时读取这些构建产物时，才需要它。

## 它负责什么

| 部分           | 作用                                                                          |
| -------------- | ----------------------------------------------------------------------------- |
| `providers`    | 声明可用的 provider instance，例如 `providers.doubao` 或 `providers.claude`。 |
| `buildReports` | 决定哪些页面生成报告，以及每个页面使用哪个 model。                            |
| 运行时入口     | 把构建期产出的报告挂到控制台可以读取的位置。                                  |

它不会改变组件的渲染策略，也不会替代页面浮层、`Debug Logs` 或 `Render Metrics` 这类运行时信息。AI 分析只在文档构建期间执行；运行时控制台只读取已经保存的 report JSON。

## 最小示例

```ts [.vitepress/config.ts]
const islands = createDocsIslands({
  adapters: [react()],
  siteDevtools: {
    analysis: {
      providers: {
        doubao: [
          {
            id: 'cn',
            default: true,
            // eslint-disable-next-line no-restricted-syntax
            apiKey: process.env.DOUBAO_API_KEY!,
            baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
          },
        ],
        claude: [
          {
            id: 'us',
            // eslint-disable-next-line no-restricted-syntax
            apiKey: process.env.CLAUDE_API_KEY!,
          },
        ],
      },
      buildReports: {
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
      },
    },
  },
});
```

## 没有它时会怎样

`Site DevTools` 的运行时控制台仍然可以正常工作，只是不会生成构建期分析报告，因此控制台里也不会出现对应的 page-level report 数据。

## 什么时候开启它

通常建议先把运行时控制台单独接通，确认页面浮层和 `Debug Logs` 已经足够好用，再补上 `analysis`。第一轮配置里只保留一个 provider 和一个 model，用 `buildReports.resolvePage` 从少量关键页面开始，而不是一上来就给全站生成报告。
