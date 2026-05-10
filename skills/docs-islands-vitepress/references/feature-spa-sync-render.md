# SPA Sync Render

Use this when production VitePress SPA navigation shows React island flicker or layout shift.

## What It Solves

On first page load, VitePress serves static HTML. During SPA route changes, Vue page content may update before non-Vue island HTML, CSS, and hydration resources finish. `spa:sync-render` makes selected island output land earlier with the route transition.

## Directives

```md
<Hero client:load spa:sync-render />
<Hero client:load spa:sr />
<StaticHero ssr:only spa:sync-render:disable />
<StaticHero ssr:only spa:sr:disable />
```

## Defaults

| Strategy                   | Default SPA sync behavior |
| -------------------------- | ------------------------- |
| `ssr:only` or no directive | Enabled                   |
| `client:load`              | Disabled                  |
| `client:visible`           | Disabled                  |
| `client:only`              | Unsupported               |

## Production Caveats

- The feature does not take effect in development mode; verify it in a production build or preview.
- It can delay route rendering until required CSS is ready.
- It adds route-change client bytes because prerendered output and CSS loading coordination must be available to the route module.
- It is best for hero blocks, above-the-fold cards, and visible page structure that should arrive in lockstep with surrounding Markdown.

## When to Avoid

- Low-priority below-the-fold widgets.
- Large components with heavy CSS where route-blocking would feel worse than flicker.
- `client:only` components.
- Components whose route-change output is already stable.
