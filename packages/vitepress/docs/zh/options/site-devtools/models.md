# 提供商与模型

Provider helper 用来声明密钥和入口，每个 provider 对象再创建它负责执行的 build report model。这样 model config 里不需要再写 provider 绑定字段。分析请求只在文档构建期间执行。

## 最小示例

```ts [.vitepress/config.ts]
import { claude, doubao } from '@docs-islands/vitepress/models';

const doubaoCN = doubao.provider({
  label: 'Doubao CN',
  apiKey: process.env.DOUBAO_API_KEY!,
  baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
  timeoutMs: 300_000,
});

const claudeUS = claude.provider({
  label: 'Claude US',
  apiKey: process.env.CLAUDE_API_KEY!,
  baseUrl: 'https://api.anthropic.com/v1',
  timeoutMs: 300_000,
});

const doubaoPro = doubaoCN.model({
  label: 'Doubao Pro',
  default: true,
  model: 'doubao-seed-2-0-pro-260215',
  thinking: true,
  maxTokens: 4096,
  temperature: 0.2,
});

const claudeSonnet = claudeUS.model({
  label: 'Claude Sonnet',
  model: 'claude-sonnet-4-20250514',
  maxTokens: 4096,
  temperature: 0.2,
});

const analysis = {
  providers: [doubaoCN, claudeUS],
  buildReports: {
    models: [doubaoPro, claudeSonnet],
  },
};
```

## Provider 字段

| 字段        | 含义                                            |
| ----------- | ----------------------------------------------- |
| `label`     | 可选展示名称，只影响显示。                      |
| `apiKey`    | 调用 provider 所需的 secret。不要直接写进仓库。 |
| `baseUrl`   | provider 请求入口。修改它会改变有效请求语义。   |
| `timeoutMs` | 本地单次请求超时时间。                          |

Claude 的 Anthropic API version header 由内部固定为当前支持的最新协议版本，不支持用户侧透传。

## Model config 字段

| 字段          | 含义                                 |
| ------------- | ------------------------------------ |
| `label`       | 可选展示名称。                       |
| `default`     | 默认执行模型。                       |
| `model`       | provider 真实请求的模型名。          |
| `thinking`    | 是否启用推理型能力。仅 Doubao 支持。 |
| `maxTokens`   | 最大输出 token。                     |
| `temperature` | 生成随机度，越低越稳定。             |

## 什么时候需要多个 instance

当你需要区分地域、账户或网关入口时，就创建另一个 provider 对象。model 会绑定到创建它的 provider，所以 `claudeUS.model(...)` 和 `claudeEU.model(...)` 会自然走不同入口。
