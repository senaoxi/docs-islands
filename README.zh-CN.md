# Docs Islands

<p align="center">
  <a href="https://docs.senao.me/docs-islands" target="_blank" rel="noopener noreferrer">
    <img width="180" src="https://docs.senao.me/docs-islands/favicon.svg" alt="Docs Islands logo">
  </a>
</p>
<br/>
<p align="center">
  <a href="https://nodejs.org/en/about/previous-releases"><img src="https://img.shields.io/node/v/@docs-islands/vitepress.svg" alt="node compatibility"></a>
  <a href="https://github.com/XiSenao/docs-islands/actions/workflows/ci.yml"><img src="https://github.com/XiSenao/docs-islands/actions/workflows/ci.yml/badge.svg?branch=main" alt="build status"></a>
  <a href="https://pr.new/XiSenao/docs-islands/tree/stackblitz?file=docs/zh/index.md"><img src="https://developer.stackblitz.com/img/start_pr_dark_small.svg" alt="Start new PR in StackBlitz Codeflow"></a>
</p>
<br/>

[English](./README.md) | 简体中文

> **⚡ 项目状态**: 积极开发中 - VitePress 项目生产可用。

为文档框架带来 Islands 架构的性能优势。静态内容保持极速加载，交互组件按需激活，让文档站点兼具静态网站的速度与现代应用的交互能力。支持跨 UI 框架使用，当前为 VitePress 提供生产级集成。

## 核心特性

- **🏝️ 极致性能体验** - 静态内容即时呈现，交互组件按需加载。让文档站点兼具静态网站的速度与现代应用的交互体验，为用户提供流畅的阅读体验。

- **🎯 灵活渲染策略** - 灵活控制每个组件的渲染与注水时机，支持服务端渲染（`ssr:only`）、立即加载（`client:load`）、可见时加载（`client:visible`）、纯客户端（`client:only`）等多种策略。避免不必要的 JavaScript 执行，让交互在最合适的时候发生。

- **🧩 架构可扩展** - 设计理念支持扩展到其他主流文档框架。当前为 VitePress 提供生产级集成，随着社区发展逐步覆盖更多平台，保持技术栈选择的灵活性。

- **⚛️ 跨框架支持** - 在文档中自由使用 React、Vue、Solid、Svelte 等任何喜欢的 UI 框架。团队无需学习新技术栈，直接复用现有组件库和开发经验。

- **🔌 快速集成** - 最小化配置即可在现有文档项目中启用 Islands 能力。无需重构代码，不影响现有功能，渐进式增强文档交互性。

- **📦 完善开发体验** - 开发环境热更新即时反馈，开发与生产环境行为一致。提供完整的类型支持和性能优化选项，确保从开发到部署的流畅体验。

> 更多详细信息和使用指南，请访问 [文档站点](https://docs.senao.me/docs-islands/zh/)。

## 包

| 包名称                                        | 版本（点击查看变更日志）                                                                                                    |
| --------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------- |
| [@docs-islands/vitepress](packages/vitepress) | [![vitepress version](https://img.shields.io/npm/v/@docs-islands/vitepress.svg?label=%20)](packages/vitepress/CHANGELOG.md) |
| [limina](packages/limina)                     | [![logaria version](https://img.shields.io/npm/v/limina.svg?label=%20)](packages/limina/CHANGELOG.md)                       |
| [logaria](packages/logaria)                   | [![logaria version](https://img.shields.io/npm/v/logaria.svg?label=%20)](packages/logaria/CHANGELOG.md)                     |

## 贡献

欢迎社区贡献！请查看 [贡献指南](https://github.com/XiSenao/docs-islands/blob/main/.github/CONTRIBUTING.zh-CN.md) 了解详情。

## 许可证

MIT © [XiSenao](https://github.com/XiSenao)
