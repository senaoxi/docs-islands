# Build-time Analysis

`siteDevtools.analysis` declares the provider, model, and page-report settings required for build-time analysis reports. You only need it when `Site DevTools` should read those build outputs at runtime.

## What It Controls

| Part           | Responsibility                                                                   |
| -------------- | -------------------------------------------------------------------------------- |
| `providers`    | Declares provider objects created by `claude.provider()` or `doubao.provider()`. |
| `buildReports` | Decides which pages generate reports and which model each page uses.             |
| Runtime entry  | Makes emitted reports available to the runtime console.                          |

It does not change component render strategies, and it does not replace runtime evidence such as the page overlay, `Debug Logs`, or `Render Metrics`. AI analysis runs during docs build only; the runtime console reads saved report JSON.

## Minimal Example

```ts [.vitepress/config.ts]
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

## What Happens Without It

The runtime `Site DevTools` console still works, but build-time analysis reports are not generated, so the console has no page-level report payloads to display.

## When to Enable It

In practice, it is better to make the runtime console usable first and add `analysis` after that. Start with one provider and one model, then use `buildReports.resolvePage` to enable reports for a small set of important pages instead of the whole site.
