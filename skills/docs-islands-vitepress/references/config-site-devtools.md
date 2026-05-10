# Site DevTools Configuration

Use this when configuring optional build-time analysis reports for Site DevTools.

## Mental Model

`siteDevtools.analysis` has two parts:

- `providers.doubao`: provider instances and credentials.
- `buildReports`: page report model selection, cache, page filtering, and evidence size.

The runtime console can work without `siteDevtools.analysis`; reports are generated only when analysis is configured.

## Minimal Configuration

```ts
const islands = createDocsIslands({
  adapters: [react()],
  siteDevtools: {
    analysis: {
      providers: {
        doubao: [
          {
            id: 'cn',
            default: true,
            apiKey: process.env.DOUBAO_API_KEY!,
            baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
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
        ],
      },
    },
  },
});
```

Do not use `enabled`, `providers: ['anthropic']`, `providers: ['openai']`, `defaultProvider`, `models` at `analysis` root, `apiKeys`, `fallbackChain`, `cacheDir`, `cacheTTL`, or `reports`; those are not the current public config shape.

## Provider Fields

| Field       | Meaning                                |
| ----------- | -------------------------------------- |
| `id`        | Stable provider instance id            |
| `label`     | Optional console label                 |
| `default`   | Default instance in the provider group |
| `apiKey`    | Secret; keep it out of source control  |
| `baseUrl`   | Provider endpoint                      |
| `timeoutMs` | Request timeout in milliseconds        |

## Build Report Model Fields

| Field         | Meaning                                 |
| ------------- | --------------------------------------- |
| `id`          | Stable model config id                  |
| `label`       | Optional console label                  |
| `default`     | Default report model                    |
| `providerRef` | Provider group and optional instance id |
| `model`       | Doubao model identifier                 |
| `thinking`    | Optional reasoning mode                 |
| `maxTokens`   | Output token budget                     |
| `temperature` | Generation randomness                   |

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
      ? { modelId: 'doubao-pro', includeChunks: true }
      : null;
  },
}
```

`resolvePage` returns `undefined`, `null`, or `false` to skip a page, and an object to generate a report with page-local overrides.
