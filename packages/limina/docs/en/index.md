---
layout: home

hero:
  name: Limina
  text: TypeScript project-reference graph compiler and architecture governance CLI
  tagline: Start with incremental build, then turn on architecture governance.
  image:
    src: /logo.svg
    alt: Limina
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started
    - theme: alt
      text: Why Limina
      link: /why
    - theme: alt
      text: View on GitHub
      link: https://github.com/senaoxi/docs-islands/tree/main/packages/limina

features:
  - icon: 🧭
    title: Low-friction incremental build
    details: limina init adds limina:build, then Limina generates a TypeScript project-reference build graph from existing tsconfig files and source imports so users can first get tsc -b, tsgo, or vue-tsc incremental builds.
    link: /getting-started
    linkText: Start build-first
  - icon: 🕸️
    title: Generate type graphs automatically
    details: Generate type graphs for TypeScript, Vue, Svelte, and other checkers, allowing different stacks to build, check, and diagnose under one unified model.
    link: /config/checkers
    linkText: Configure checkers
  - icon: 🧱
    title: Govern project references
    details: Detect missing references, illegal dependencies, cross-runtime calls, and architecture rule violations to ensure project relationships match declared boundaries.
    link: /built-in-tasks
    linkText: View graph checks
  - icon: 🛡️
    title: Protect package boundaries
    details: Block cross-package relative imports, missing dependencies, private entry escapes, and internal dependencies that bypass declared package boundaries, ensuring each package is accessed only through public entry points.
    link: /built-in-tasks
    linkText: View source checks
  - icon: 🎯
    title: Verify check coverage
    details: Align source files with TypeScript, Vue, Svelte, test, tools, docs, and other check scopes to find uncovered files, duplicate coverage, or files assigned to the wrong project graph.
    link: /config/checkers
    linkText: Configure coverage
  - icon: 📦
    title: Validate published artifacts
    details: Inspect the npm tarball consumers actually install, and verify that package metadata, exports, types, runtime entries, and type resolution stay consistent.
    link: /config/package-checks
    linkText: Configure package checks
  - icon: 🚦
    title: Catch release risks early
    details: Check README, license, bundled files, missing files, source maps, and registry baseline differences before publishing to confirm the release contents match expectations.
    link: /config/release-checks
    linkText: Configure release checks
  - icon: 🧩
    title: Fit into existing workflows
    details: Integrate with local development, PR, CI, and release pipelines, and export scoped dependency graphs for architecture review when needed.
    link: /workflows
    linkText: Configure workflows
---
