# Build Reports

`buildReports` decides which eligible pages generate build reports for `Site DevTools`, which model each page uses, whether cache applies, and how much build evidence enters the prompt. The report itself stays page-level; chunk and module views reuse that page report instead of running independent analyses.

## What Counts as an Eligible Page

Only pages that already contain docs-islands page-build analysis signals enter this flow. Purely static Markdown pages do not get analyzed just because `buildReports` exists.

## Minimal Configuration

```ts [.vitepress/config.ts]
import { claude, doubao } from '@docs-islands/vitepress/models';

const doubaoCN = doubao.provider({
  apiKey: process.env.DOUBAO_API_KEY!,
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

const buildReports = {
  cache: true,
  includeChunks: false,
  includeModules: false,
  models: [doubaoPro, claudeSonnet],
};
```

## Options

| Option                 | Meaning                                                                                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cache`                | Whether persisted report cache is enabled. `true` uses the default cache config. `false` always regenerates. An object lets you set `dir` and `strategy`. |
| `models`               | The executable model configuration list.                                                                                                                  |
| `includeChunks`        | Whether page-level chunk detail is added to the prompt. Default: `false`.                                                                                 |
| `includeModules`       | Whether page-level and component-level module detail is added to the prompt. Default: `false`.                                                            |
| `resolvePage(context)` | Page-level filter and override hook. It can skip a page or override `model`, `cache`, `includeChunks`, and `includeModules` for that page only.           |

## How `resolvePage(context)` Works

| Return value                    | Behavior                                              |
| ------------------------------- | ----------------------------------------------------- |
| `undefined`, `null`, or `false` | Skip the page.                                        |
| `{}`                            | Keep the page and inherit the global defaults.        |
| Override object                 | Keep the page and override config for that page only. |

```ts
const defaultReview = doubaoCN.model({
  default: true,
  model: 'doubao-seed-2-0-pro-260215',
});
const perfReview = claudeUS.model({
  model: 'claude-sonnet-4-20250514',
});

const buildReports = {
  models: [defaultReview, perfReview],
  resolvePage({ page }) {
    if (page.routePath === '/guide/performance') {
      return {
        model: perfReview,
        includeChunks: true,
        includeModules: true,
      };
    }

    return null;
  },
};
```

## Cache Strategy

When you write `cache: true` or omit `cache`, the default cache config is:

| Field      | Default                                  |
| ---------- | ---------------------------------------- |
| `dir`      | `.vitepress/cache/site-devtools-reports` |
| `strategy` | `exact`                                  |

Common choices:

| Setting                | Good for                                                                                                         |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `cache: false`         | One-off correctness checks where no reuse is desired.                                                            |
| `strategy: 'exact'`    | Local prompt tuning, model tuning, or page-scope tuning where cache should track the current semantics strictly. |
| `strategy: 'fallback'` | CI or publishing flows where stale-but-available reports are preferable to a missing report.                     |

`exact` only reuses cache when the prompt and effective request semantics still match. `fallback` can reuse an older report for the same page target even if the current prompt has changed.

## When to Enable `includeChunks` / `includeModules`

Keep both off first so the report only answers page-level questions. Enable `includeChunks` when the page-level summary is not enough to explain where weight is coming from, and enable `includeModules` only when you truly need module-level evidence.
