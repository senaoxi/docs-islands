# Rendering Strategies

Use this when choosing how a React component should render inside a VitePress page.

## Decision Tree

1. Choose `ssr:only` when the component is static, SEO-sensitive, or needs Node-only data.
2. Choose `client:load` when the component must be interactive immediately after page load.
3. Choose `client:visible` when the component can wait until it enters the viewport.
4. Choose `client:only` only when SSR is impossible because the first render depends on browser-only APIs.
5. Add `spa:sync-render` only when production SPA navigation shows visible component flicker or layout shift.

## Comparison

| Strategy         | Initial HTML    | Hydration/render timing | SEO    | Main cost                       |
| ---------------- | --------------- | ----------------------- | ------ | ------------------------------- |
| `ssr:only`       | Full            | None                    | Strong | No interactivity                |
| `client:load`    | Full            | Immediate hydration     | Strong | Initial hydration work          |
| `client:visible` | Full            | Hydrates on visibility  | Strong | Delayed interactivity           |
| `client:only`    | Empty container | Browser render          | Weak   | Layout shift and no SSR content |

## Production Bias

Start with the least client JavaScript that satisfies the user experience:

- Prefer `ssr:only` for reference content, generated examples, tables, cards, and SEO text.
- Prefer `client:visible` for below-the-fold demos, galleries, comments, and optional widgets.
- Use `client:load` for search, navigation, primary controls, and above-the-fold interaction.
- Use `client:only` for maps, browser storage, viewport APIs, and third-party widgets that cannot SSR.

## Hydration Safety

`client:load` and `client:visible` prerender on the server and then hydrate. Their first browser render must match the server HTML. If not, move unstable logic into `useEffect`, pass deterministic props, or switch to `client:only` when SSR cannot be made stable.

## SPA Navigation Stability

During VitePress SPA route changes, Vue page content can update before React HTML/CSS finishes landing. `spa:sync-render` tightens that timing for selected components, but it can block route rendering on CSS and adds route-change client bytes.
