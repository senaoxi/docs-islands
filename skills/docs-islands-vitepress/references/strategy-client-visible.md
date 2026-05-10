# client:visible

Use `client:visible` for SSR HTML plus lazy hydration when the component enters the viewport.

## Use When

- The component is below the fold.
- The component is interactive, but not immediately needed.
- Initial page responsiveness matters more than instant widget readiness.

## Markdown

```md
<script lang="react">
  import CommentSection from './CommentSection';
</script>

<CommentSection client:visible />
```

## Behavior

- The component is prerendered into the initial HTML.
- Browser interactivity is delayed until visibility scheduling runs.
- SEO remains strong because the static HTML exists before hydration.
- The component still contributes client JavaScript when the page needs it.

## Best Practices

- Reserve stable height for interactive areas to prevent layout jump.
- Keep the first browser render deterministic, just like `client:load`.
- Prefer `client:load` if the user can interact before the component becomes visible.
- Prefer `ssr:only` when no browser interactivity is required.
- Use `spa:sync-render` only for components whose route-change flicker is visible and worth the CSS/blocking trade-off.
