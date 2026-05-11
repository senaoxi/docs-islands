# 提供商与模型

`providers.doubao` 和 `providers.claude` 定义 provider instance，`buildReports.models` 定义真正执行的 model config。两者配合后，`buildReports` 才能知道“调用哪个入口”和“用哪个模型请求”。分析请求只在文档构建期间执行。

## 最小示例

```ts [.vitepress/config.ts]
const analysis = {
  providers: {
    doubao: [
      {
        id: 'cn',
        label: 'Doubao CN',
        default: true,
        // eslint-disable-next-line no-restricted-syntax
        apiKey: process.env.DOUBAO_API_KEY!,
        baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
        timeoutMs: 300_000,
      },
    ],
    claude: [
      {
        id: 'us',
        label: 'Claude US',
        // eslint-disable-next-line no-restricted-syntax
        apiKey: process.env.CLAUDE_API_KEY!,
        baseUrl: 'https://api.anthropic.com/v1',
        anthropicVersion: '2023-06-01',
        timeoutMs: 300_000,
      },
    ],
  },
  buildReports: {
    models: [
      {
        id: 'doubao-pro',
        label: 'Doubao Pro',
        default: true,
        model: 'doubao-seed-2-0-pro-260215',
        providerRef: {
          provider: 'doubao',
        },
        thinking: true,
        maxTokens: 4096,
        temperature: 0.2,
      },
      {
        id: 'claude-sonnet',
        label: 'Claude Sonnet',
        model: 'claude-sonnet-4-20250514',
        providerRef: {
          provider: 'claude',
        },
        maxTokens: 4096,
        temperature: 0.2,
      },
    ],
  },
};
```

## Provider instance 字段

| 字段        | 含义                                                      |
| ----------- | --------------------------------------------------------- |
| `id`        | provider instance 的稳定标识。`providerRef.id` 会引用它。 |
| `label`     | 可选展示名称，只影响显示。                                |
| `default`   | 当前分组的默认实例。一个分组最多只能有一个。              |
| `apiKey`    | 调用 provider 所需的 secret。不要直接写进仓库。           |
| `baseUrl`   | provider 请求入口。修改它会改变有效请求语义。             |
| `timeoutMs` | 本地单次请求超时时间。                                    |

Claude provider instance 还支持 `anthropicVersion`，它会作为 Anthropic API version header 发送。省略时默认使用 `2023-06-01`。

## Model config 字段

| 字段          | 含义                                                               |
| ------------- | ------------------------------------------------------------------ |
| `id`          | model config 的稳定标识。`resolvePage` 可以通过 `modelId` 引用它。 |
| `label`       | 可选展示名称。                                                     |
| `default`     | 默认执行模型。                                                     |
| `providerRef` | 指向 provider 分组，必要时也可以指定具体 instance。                |
| `model`       | provider 真实请求的模型名。                                        |
| `thinking`    | 是否启用推理型能力。仅 Doubao 支持。                               |
| `maxTokens`   | 最大输出 token。                                                   |
| `temperature` | 生成随机度，越低越稳定。                                           |

## 默认实例和 `providerRef`

如果 `providerRef` 只写 `provider: 'doubao'` 或 `provider: 'claude'`，系统会使用该分组的默认实例；如果你有多个实例，最好显式写上 `providerRef.id`。当数组里没有任何实例标记 `default: true` 时，第一个实例会被当作默认实例。

## 什么时候需要多个 instance

当你需要区分地域、账户或网关入口时，就应该拆成多个 instance。这样可以把默认 provider 和实验 provider 明确分开，也能避免频繁改动同一个实例的 `baseUrl`，影响缓存语义和调试判断。
