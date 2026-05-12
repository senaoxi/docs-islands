# Providers and Models

Provider helpers define credentials and endpoints, and each provider object creates the build report models that run through it. This keeps provider binding out of model config objects. Analysis requests run during docs build only.

## Minimal Example

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

## Provider Fields

| Field       | Meaning                                                                 |
| ----------- | ----------------------------------------------------------------------- |
| `label`     | Optional display label.                                                 |
| `apiKey`    | Secret required to call the provider. Keep it out of the repository.    |
| `baseUrl`   | Provider endpoint. Changing it changes the effective request semantics. |
| `timeoutMs` | Local timeout for one request.                                          |

Claude's Anthropic API version header is fixed internally to the latest supported protocol version.

## Model Config Fields

| Field         | Meaning                                                          |
| ------------- | ---------------------------------------------------------------- |
| `label`       | Optional display label.                                          |
| `default`     | Default execution model.                                         |
| `model`       | The actual provider model name.                                  |
| `thinking`    | Whether reasoning-style behavior should be enabled. Doubao only. |
| `maxTokens`   | Maximum output token budget.                                     |
| `temperature` | Generation randomness. Lower values are more stable.             |

## When You Need More Than One Instance

Create another provider object when regions, accounts, or gateway paths need to stay separate. A model is bound to the provider object that creates it, so `claudeUS.model(...)` and `claudeEU.model(...)` naturally stay on different endpoints.
