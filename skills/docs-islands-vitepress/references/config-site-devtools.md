# Site DevTools Configuration

Use this when configuring optional build-time analysis reports for Site DevTools.

## Mental Model

`siteDevtools.analysis` has two parts:

- `providers`: provider objects created by `doubao.provider()` or `claude.provider()`.
- `buildReports`: page report model selection, cache, page filtering, and evidence size.

The runtime console can work without `siteDevtools.analysis`; reports are generated only during docs build when analysis is configured.

## Minimal Configuration

```ts
import { claude, doubao } from '@docs-islands/vitepress/models';

const doubaoCN = doubao.provider({
  apiKey: process.env.DOUBAO_API_KEY!,
  baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
});
const claudeUS = claude.provider({
  apiKey: process.env.CLAUDE_API_KEY!,
});
const doubaoPro = doubaoCN.model({
  default: true,
  model: 'doubao-seed-2-0-pro-260215',
});
const claudeSonnet = claudeUS.model({
  model: 'claude-sonnet-4-20250514',
  maxTokens: 4096,
});

const islands = createDocsIslands({
  adapters: [react()],
  siteDevtools: {
    analysis: {
      providers: [doubaoCN, claudeUS],
      buildReports: {
        models: [doubaoPro, claudeSonnet],
      },
    },
  },
});
```

Do not use `enabled`, `providers: ['anthropic']`, `providers: ['openai']`, `defaultProvider`, `models` at `analysis` root, `apiKeys`, `fallbackChain`, `cacheDir`, `cacheTTL`, or `reports`; those are not the current public config shape.

## Provider Fields

| Field       | Meaning                               |
| ----------- | ------------------------------------- |
| `label`     | Optional console label                |
| `apiKey`    | Secret; keep it out of source control |
| `baseUrl`   | Provider endpoint                     |
| `timeoutMs` | Request timeout in milliseconds       |

Claude's Anthropic API version header is fixed internally to the latest supported protocol version.

## Build Report Model Fields

| Field         | Meaning                        |
| ------------- | ------------------------------ |
| `label`       | Optional console label         |
| `default`     | Default report model           |
| `model`       | Provider model identifier      |
| `thinking`    | Optional Doubao reasoning mode |
| `maxTokens`   | Output token budget            |
| `temperature` | Generation randomness          |

## Build Report Options

```ts
buildReports: {
  cache: {
    dir: '.vitepress/cache/site-devtools-reports',
    strategy: 'exact',
  },
  includeChunks: false,
  includeModules: false,
  models: [/* model configs */],
  resolvePage({ page }) {
    return page.routePath === '/guide/performance'
      ? { model: doubaoPro, includeChunks: true }
      : null;
  },
}
```

`resolvePage` returns `undefined`, `null`, or `false` to skip a page, and an object to generate a report with page-local overrides.
