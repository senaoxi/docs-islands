# Docs Islands

<p align="center">
  <a href="https://docs.senao.me/docs-islands" target="_blank" rel="noopener noreferrer">
    <img width="180" src="https://docs.senao.me/docs-islands/favicon.svg" alt="Docs Islands logo">
  </a>
</p>
<br/>
<p align="center">
  <a href="https://nodejs.org/en/about/previous-releases"><img src="https://img.shields.io/node/v/@docs-islands/vitepress.svg" alt="node compatibility"></a>
  <a href="https://github.com/senaoxi/docs-islands/actions/workflows/ci.yml"><img src="https://github.com/senaoxi/docs-islands/actions/workflows/ci.yml/badge.svg?branch=main" alt="build status"></a>
  <a href="https://pr.new/senaoxi/docs-islands/tree/stackblitz?file=docs/en/index.md"><img src="https://developer.stackblitz.com/img/start_pr_dark_small.svg" alt="Start new PR in StackBlitz Codeflow"></a>
</p>
<br/>

English | [简体中文](./README.zh-CN.md)

> **⚡ Project Status**: Actively developed - VitePress integration production ready.

Brings the performance benefits of Islands Architecture to documentation frameworks. Static content loads instantly while interactive components activate on-demand, enabling documentation sites to achieve both the speed of static websites and the interactivity of modern applications. Supports cross-framework UI usage, currently providing production-grade integration for VitePress.

## Key Features

- **🏝️ Exceptional Performance** - Static content renders instantly while interactive components load on-demand. Documentation sites achieve both the speed of static websites and the interactivity of modern applications, delivering a seamless reading experience.

- **🎯 Flexible Rendering Strategies** - Fine-grained control over each component's rendering and hydration timing. Supports server-side rendering (`ssr:only`), eager loading (`client:load`), viewport-triggered loading (`client:visible`), and client-only rendering (`client:only`). Eliminates unnecessary JavaScript execution, ensuring interactions happen at precisely the right moment.

- **🧩 Extensible Architecture** - Design philosophy supports extension to other mainstream documentation frameworks. Currently provides production-grade integration for VitePress, with gradual platform coverage as the community evolves, maintaining flexibility in technology choices.

- **⚛️ Cross-Framework Support** - Freely use React, Vue, Solid, Svelte, or any preferred UI framework within documentation. Teams can leverage existing component libraries and development expertise without learning new technology stacks.

- **🔌 Rapid Integration** - Enable Islands capabilities in existing documentation projects with minimal configuration. No code refactoring required, no disruption to existing functionality—progressively enhance interactivity.

- **📦 Polished Developer Experience** - Instant feedback through hot module replacement in development, consistent behavior across dev and production environments. Complete TypeScript support and performance optimization options ensure a smooth experience from development to deployment.

> For more details and usage guides, visit the [documentation site](https://docs.senao.me/docs-islands/).

## Packages

| Package                                       | Version (click for changelogs)                                                                                              |
| --------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------- |
| [@docs-islands/vitepress](packages/vitepress) | [![vitepress version](https://img.shields.io/npm/v/@docs-islands/vitepress.svg?label=%20)](packages/vitepress/CHANGELOG.md) |
| [limina](packages/limina)                     | [![logaria version](https://img.shields.io/npm/v/limina.svg?label=%20)](packages/limina/CHANGELOG.md)                       |
| [logaria](packages/logaria)                   | [![logaria version](https://img.shields.io/npm/v/logaria.svg?label=%20)](packages/logaria/CHANGELOG.md)                     |

## Contributing

Community contributions are welcome! Please see the [Contributing Guide](https://github.com/senaoxi/docs-islands/blob/main/.github/CONTRIBUTING.md) for details.

## License

MIT © [senaoxi](https://github.com/senaoxi)
