# Authoring Rules

Use this when writing Markdown pages that render React components.

## Required Shape

```md
<script lang="react">
  import HeroCard from './HeroCard';
  import { MetricsPanel as Metrics } from './MetricsPanel';
</script>

<HeroCard />
<Metrics client:visible />
```

- Use one `<script lang="react">` block per Markdown page.
- Use static ESM imports. Default, named, alias, namespace, and resolved re-exports are supported when the final component reference can be resolved.
- Use PascalCase local names. Lowercase or mixed lowercase tags are ignored or rejected.
- Render the same local name imported in the script block.
- Use self-closing tags. `<HeroCard></HeroCard>` is skipped.
- Keep React component props compatible with string HTML attributes and Vue-style bound attributes used in Markdown.

## Strategy Directives

Supported render directives:

- `ssr:only`
- `client:load`
- `client:visible`
- `client:only`

Supported SPA sync modifiers:

- `spa:sync-render`
- `spa:sr`
- `spa:sync-render:disable`
- `spa:sr:disable`

When no render directive is present, the component uses `ssr:only`.

## Data and Environment Rules

- Keep `node:fs`, `node:path`, `process.cwd()`, and similar Node-only logic in components that are only used with `ssr:only`.
- Move browser-only logic into effects or use `client:only`.
- Avoid time, randomness, viewport size, or `localStorage` in the first render of `client:load` and `client:visible` components unless the first server and browser output remain identical.
- Put component CSS in component imports so the build can track CSS needed for SSR output and SPA sync rendering.

## Common Mistakes

```md
<!-- Wrong: tag does not match imported local name. -->
<script lang="react">
  import { Landing as HomeLanding } from './Landing';
</script>
<Landing />

<!-- Correct. -->
<HomeLanding />
```

```md
<!-- Wrong: not self-closing. -->

<SearchBox client:load></SearchBox>

<!-- Correct. -->
<SearchBox client:load />
```
