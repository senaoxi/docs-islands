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
      text: Features
      link: /features
    - theme: alt
      text: Why Logaria
      link: /why
    - theme: alt
      text: View on GitHub
      link: https://github.com/senaoxi/docs-islands

features:
  - title: Tiny, framework-agnostic API
    details: Three root functions create loggers and own the default scope — no framework, no bundler, and no global state to fight.
  - title: Level mode, in one knob
    details: The `levels` allowlist decides which of `info`/`success`/`warn`/`error` print; `debug` is a separate opt-in flag.
  - title: Rule mode for focused output
    details: Add `rules` and Logaria switches to a focused allowlist matched by `main`, `group`, message, and level.
  - title: Composable presets
    details: Ship reusable rule templates as preset plugins, activate them via `extends`, and override per project in `rules`.
  - title: Vanishes at build time
    details: The optional unplugin adapter statically proves and deletes suppressed log calls — the runtime stays canonical.
  - title: Scoped for host integrations
    details: Frameworks register isolated scopes through `logaria/core` that never mutate application-owned runtime config.
---
