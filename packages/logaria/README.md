# logaria

<p align="center">
  <a href="https://docs.senao.me/docs-islands/logaria" target="_blank" rel="noopener noreferrer">
    <img width="180" src="https://docs.senao.me/docs-islands/logaria/logo.svg" alt="logaria logo">
  </a>
</p>
<p align="center">
  <a href="https://npmjs.com/package/logaria"><img src="https://img.shields.io/npm/v/logaria.svg" alt="npm package"></a>
  <a href="https://nodejs.org/en/about/previous-releases"><img src="https://img.shields.io/node/v/logaria.svg" alt="node compatibility"></a>
  <a href="https://github.com/XiSenao/docs-islands/actions/workflows/ci.yml"><img src="https://github.com/XiSenao/docs-islands/actions/workflows/ci.yml/badge.svg?branch=main" alt="build status"></a>
  <a href="https://github.com/XiSenao/docs-islands/blob/main/packages/logaria/LICENSE.md"><img src="https://img.shields.io/npm/l/logaria.svg" alt="license"></a>
</p>

English | [简体中文](./README.zh-CN.md)

> Lightweight logging for TypeScript tools and libraries

- Share one logger API across Node.js and browsers
- Keep output visible by level, scope, and rules
- Organize logs by package and feature area
- Let host integrations own private logger scopes
- Inject runtime policy through bundler plugins
- Prune statically suppressed logs from production builds

Logaria gives tools and libraries a small, framework-agnostic logging layer for console output that needs to stay predictable across development, build, and runtime environments. It keeps visibility policy explicit while supporting scoped integrations, rule-based filtering, debug diagnostics, and build-time optimization for supported static logger calls.

Logaria is not an observability platform, telemetry pipeline, or monitoring service. It focuses on local runtime logging, configurable console visibility, and optional production pruning through supported bundler integrations.

[Read the Docs to Learn More](https://docs.senao.me/docs-islands/logaria/)
