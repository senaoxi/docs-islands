---
layout: home

hero:
  name: Logaria
  text: Runtime logging that can disappear at build time
  tagline: A small framework-agnostic logger for TypeScript packages, scripts, and tooling, with runtime filtering, scoped ownership, and conservative production pruning.
  image:
    src: /logo.svg
    alt: Logaria
  actions:
    - theme: brand
      text: Get started
      link: /getting-started
    - theme: alt
      text: API reference
      link: /api-reference

features:
  - title: Small runtime API
    details: Create a main logger, derive group loggers, and configure visibility without tying application code to a framework.
  - title: Rule-based visibility
    details: Use levels, debug mode, preset-backed rules, glob matching, and allowlist behavior to make logs intentional.
  - title: Build-time pruning
    details: Let the optional unplugin adapter remove statically suppressed calls in production while runtime filtering remains canonical.
---
