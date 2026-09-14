# 已实现的范围与未决方向

[English](../intent.md) | [简体中文](./intent.md)

## 证据边界

本记录描述由当前源码、测试、manifest、配置、构建输入、public exports 和命令执行建立的范围。

实现不能建立目标受众、长期产品定位、未来框架覆盖、设计理由和永久非目标。这些内容需要人类确认。

## 当前实现

根 manifest 以文档站点描述本仓库，对外的 Docs Islands 包是 `@docs-islands/vitepress`。

当前文档框架集成专属于 VitePress：

- `@docs-islands/vitepress` 接受并修改 VitePress `UserConfig` 对象。
- 其 node 集成 import VitePress types，将 VitePress 配置和 build hooks 映射到包的 runtime。
- 其 client 集成 import `vitepress/client` 生命周期 API，并适配为共享 client contract。
- 已发布包提供 VitePress 专属的 node、client、theme 和开发工具入口。

当前 UI 框架实现是 React：

- `DocsIslandsAdapter` 是 `createDocsIslands()` 使用的 adapter contract。
- `createDocsIslands()` 接受 adapter 数组，并按支持的框架集合校验每个 adapter。
- 当前支持的框架集合只有 `react`。
- 当前源码目录、构建输入和 package exports 只提供 React adapter。

`@docs-islands/core` 提供 VitePress 集成所使用的 client、node、shared 和 types 入口。其 manifest 将该包标记为私有。

当前公开的 Docs Islands 入口不是通用 Web 应用框架。其配置、生命周期集成、exports、peer dependencies、测试、playground 和 smoke 包均围绕 VitePress 文档站点展开。

仓库开发环境通过根 `preinstall` 脚本和包管理器配置强制使用 pnpm。这是仓库约束，并不意味着已发布包的消费者必须使用 pnpm。

Limina、Logaria 和 `@docs-islands/vitepress` 是独立的公开发布单元。发布配置为每个包分配独立的包目录、发布目录、版本、changelog 和 tag 前缀。

## 由实现推导的结果

Adapter 数组和 adapter contract 允许多个 adapter 实例参与编排，但受支持框架集合和重复框架校验的约束。这是实现性质，并不能证明当前支持多个 UI 框架。

`@docs-islands/core` 与 `@docs-islands/vitepress` 的分离，使框架专属包能够使用框架无关的抽象。源码建立了这种结构，但没有建立设计理由。

仓库可以在一个 workspace 内开发和发布 Docs Islands、Limina 和 Logaria，而不将它们合成一个发布包。这由独立的 manifest、构建产物、release entries 和 tags 推导而来。

## 当前实现未建立的内容

当前实现建立了 VitePress 是唯一文档框架集成的事实，没有建立支持其他文档框架的计划。

当前实现建立了 React 是唯一 UI 框架 adapter 的事实，没有建立新增 Vue、Svelte、Solid 或其他 adapter 的计划。

当前实现不是通用 Web 应用框架，但这不能建立“成为通用 Web 应用框架是永久非目标”的结论。

源码没有建立主要受众是文档团队、组件库维护者、企业用户还是其他群体。

## 需要人类确认的方向

- Docs Islands 是否计划支持 VitePress 以外的文档框架？
- Docs Islands 是否计划新增 React 以外的 UI 框架 adapter？
- 根 Docs Islands 项目、Limina 和 Logaria 的长期产品关系是什么？
- 主要目标用户是谁？
- 哪些方向是永久非目标？
- `@docs-islands/core` 与 VitePress 集成分离的哪些设计理由应记录下来？
