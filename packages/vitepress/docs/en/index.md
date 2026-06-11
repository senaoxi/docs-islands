---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: 'Docs Islands for VitePress'
  tagline: Cross-framework Islands Architecture for VitePress
  image:
    src: /favicon.svg
    alt: Docs Islands for VitePress
  actions:
    - theme: brand
      text: Guide
      link: /guide/
    - theme: alt
      text: View on GitHub
      link: https://github.com/senaoxi/docs-islands/tree/main/packages/vitepress

features:
  - title: Use React in Markdown
    details: 'Render React components directly inside VitePress Markdown pages while keeping existing JSX, TSX, and TypeScript workflows.'
    icon: '⚛️'

  - title: Per-component Rendering Strategies
    details: 'Choose `ssr:only`, `client:load`, `client:visible`, or `client:only` per component instead of turning the whole page into a separate app.'
    icon: '🎯'

  - title: Smoother SPA Route Changes
    details: '`spa:sync-render` lets selected components land earlier during route changes so flicker and layout shift stay under control.'
    icon: '⚡'

  - title: Keep the Static-site Model
    details: 'The site still follows the VitePress static-generation model, and client takeover only happens where interaction is actually needed.'
    icon: '🚀'

  - title: Fits the VitePress Workflow
    details: 'React components, Markdown content, and theme extensions stay in one documentation workflow with aligned `HMR` and build behavior.'
    icon: '🛠️'

  - title: Site DevTools
    details: 'Inspect page overlays, debug logs, bundle composition, and build reports when you need to understand rendering, `HMR`, or asset cost.'
    icon: '🔎'
---
