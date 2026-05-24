---
layout: home

hero:
  name: Logaria
  text: Logs that disappear when you ship
  tagline: A framework-agnostic TypeScript logger with rule-based runtime filtering and conservative build-time pruning — so debug-rich code stays debug-rich, and production bundles stay clean.
  image:
    src: /logo.svg
    alt: Logaria
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started
    - theme: alt
      text: API Reference
      link: /api-reference
    - theme: alt
      text: View on GitHub
      link: https://github.com/SenaoXi/docs-islands

features:
  - title: Tiny, framework-agnostic API
    details: A handful of functions to create loggers and configure visibility — no framework lock-in, no bundler coupling, no global state to fight.
  - title: Rule-based visibility
    details: Combine levels, debug mode, glob matching, and preset-backed allowlists to make every log intentional in dev, CI, and production.
  - title: Vanishes at build time
    details: An optional unplugin adapter statically proves and removes suppressed log calls, so silenced logs leave nothing behind in your production bundle.
  - title: Works with every major bundler
    details: One plugin, seven adapters — Vite, Rollup, Rolldown, esbuild, webpack, Rspack, and Farm — all backed by the same runtime semantics.
  - title: Composable presets
    details: Ship reusable rule templates as preset plugins, enable them through `extends`, and override per project when a team needs something tighter.
  - title: Scoped for host integrations
    details: Frameworks and build tools register isolated logger scopes that never mutate application-owned runtime config — safe for libraries to depend on.
---
