# logaria

<p align="center">
  <a href="https://docs.senao.me/docs-islands/logaria/zh" target="_blank" rel="noopener noreferrer">
    <img width="180" src="https://docs.senao.me/docs-islands/logaria/logo.svg" alt="logaria logo">
  </a>
</p>
<p align="center">
  <a href="https://npmjs.com/package/logaria"><img src="https://img.shields.io/npm/v/logaria.svg" alt="npm package"></a>
  <a href="https://nodejs.org/en/about/previous-releases"><img src="https://img.shields.io/node/v/logaria.svg" alt="node compatibility"></a>
  <a href="https://github.com/XiSenao/docs-islands/actions/workflows/ci.yml"><img src="https://github.com/XiSenao/docs-islands/actions/workflows/ci.yml/badge.svg?branch=main" alt="build status"></a>
  <a href="https://github.com/XiSenao/docs-islands/blob/main/packages/logaria/LICENSE.md"><img src="https://img.shields.io/npm/l/logaria.svg" alt="license"></a>
</p>

[English](./README.md) | 简体中文

> 面向 TypeScript 工具和库的轻量日志系统

- 在 Node.js 与浏览器之间复用同一套 logger API
- 按级别、scope 与规则控制输出可见性
- 按 package 和功能区域组织日志
- 让宿主集成拥有私有 logger scope
- 通过构建插件注入运行时策略
- 在生产构建中裁剪静态判定为隐藏的日志

Logaria 为工具和库提供一个小型、框架无关的 console 日志层，让日志输出在开发、构建和运行时环境中保持可预测。它让可见性策略保持显式，同时支持 scoped 集成、基于规则的过滤、debug 诊断，以及面向受支持静态 logger 调用的构建期优化。

Logaria 不是 observability 平台、telemetry pipeline 或监控服务。它专注于本地运行时日志、可配置的 console 可见性，以及通过受支持构建工具集成提供的可选生产裁剪。

[阅读文档了解更多](https://docs.senao.me/docs-islands/logaria/zh/)
