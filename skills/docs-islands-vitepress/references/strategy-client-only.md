# client:only

Use `client:only` when a component cannot be rendered on the server.

## Use When

- The first render depends on `window`, `document`, `localStorage`, layout measurements, browser-only libraries, maps, or embedded third-party widgets.
- Hydration mismatch would be unavoidable with SSR.
- SEO for that component is not important.

## Markdown

```md
<script lang="react">
  import BrowserChart from './BrowserChart';
</script>

<BrowserChart client:only />
```

## Component Pattern

```tsx
import { useEffect, useState } from 'react';

export default function BrowserChart() {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    setWidth(window.innerWidth);
  }, []);

  return <div style={{ minHeight: 240 }}>Viewport width: {width}</div>;
}
```

## Caveats

- Initial HTML contains no component content, so SEO is weak.
- Layout can shift unless the container reserves space.
- `spa:sync-render` is not supported and is disabled if requested.
- Prefer `client:load` or `client:visible` when the component can SSR with deterministic first output.
