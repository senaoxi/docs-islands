# ssr:only

Use `ssr:only` for static output. It is the default when no directive is written.

## Use When

- Content should be visible in the initial HTML.
- The component has no browser interaction.
- The component needs Node-only APIs during build-time rendering.
- SEO and minimal client JavaScript matter more than interactivity.

## Markdown

```md
<script lang="react">
  import DataTable from './DataTable';
</script>

<DataTable />
<DataTable ssr:only />
```

## Node-Only Data

```tsx
import { readFileSync } from 'node:fs';
import { join } from 'pathe';

export default function DataTable() {
  const rows = JSON.parse(readFileSync(join(import.meta.dirname, 'rows.json'), 'utf8'));

  return <pre>{JSON.stringify(rows, null, 2)}</pre>;
}
```

Use `import.meta.dirname` for local file paths. File dependencies read by Node-only code do not automatically participate in HMR; refresh manually or wire explicit update handling when needed.

## Caveats

- No click handlers, state updates, or effects run in the browser.
- If the same component is also used with a client strategy on the same page, remove Node-only dependencies from that component or split it into server and client pieces.
- `ssr:only` opts into SPA sync rendering by default. Disable it with `spa:sync-render:disable` or `spa:sr:disable` only when the optimization is causing unnecessary route-blocking work.
