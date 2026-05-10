# client:load

Use `client:load` for SSR HTML plus immediate browser hydration.

## Use When

- A component is above the fold and must respond quickly.
- Search boxes, filters, tabs, forms, or primary controls need immediate interactivity.
- SEO still matters, so `client:only` would be too expensive.

## Markdown

```md
<script lang="react">
  import SearchBox from './SearchBox';
</script>

<SearchBox client:load />
```

## Hydration Safety

The first server render and first browser render must match. Avoid this pattern:

```tsx
export default function Clock() {
  return <span>{Date.now()}</span>;
}
```

Prefer stable initial output, then update after hydration:

```tsx
import { useEffect, useState } from 'react';

export default function Clock() {
  const [time, setTime] = useState('Loading');

  useEffect(() => {
    setTime(new Date().toLocaleTimeString());
  }, []);

  return <span>{time}</span>;
}
```

## SPA Sync

Add `spa:sync-render` only when this component visibly flickers during production SPA navigation:

```md
<HeroSearch client:load spa:sync-render />
```

Do not use `client:load` for static content, low-priority below-the-fold UI, or components that cannot render safely on the server.
