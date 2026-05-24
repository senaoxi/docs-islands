---
layout: home

hero:
  name: Limina
  text: Architecture governance for TypeScript monorepos
  tagline: Keep project references, package boundaries, checker coverage, and publish output aligned before drift reaches CI.
  image:
    src: /logo.svg
    alt: Limina
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started
    - theme: alt
      text: View on npm
      link: https://www.npmjs.com/package/limina

features:
  - title: See the real dependency graph
    details: Resolve source imports with TypeScript, then compare them with project references, workspace protocols, and architecture rules.
  - title: Keep packages in their lanes
    details: Catch cross-package relative imports, undeclared dependencies, and #imports that escape the package that owns them.
  - title: Know every file is checked
    details: Connect declaration leaves to local typecheck companions and framework checkers, with explicit allowlists for generated code.
  - title: Ship what consumers install
    details: Validate built packages with publint, Are The Types Wrong, README and license checks, and runtime import boundaries.
---
