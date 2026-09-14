# 架构

[English](../architecture.md) | [简体中文](./architecture.md)

## 证据边界

本记录描述由 manifest、源码 import、公开 exports、构建配置、Limina 配置和发布脚本建立的 workspace 单元与边界。

包名和描述不能建立设计理由、未来发布计划或永久产品边界。这些内容需要人类确认。

## Workspace 布局

`pnpm-workspace.yaml` 包含以下 workspace 区域：

| Workspace pattern          | 当前内容                                                  |
| -------------------------- | --------------------------------------------------------- |
| `packages/*`               | 主要 library、CLI、配置和内部 workspace 包                |
| `packages/*/docs`          | 各包的文档站点                                            |
| `packages/*/playground`    | 各包的 playground 应用                                    |
| `packages/*/smoke`         | 各包的 smoke-test workspace                               |
| `packages/plugins/*`       | 私有插件包；当前匹配的包是 `@docs-islands/plugin-license` |
| `packages/**/__tests__/**` | 带独立 manifest 的嵌套测试 workspace                      |
| `docs`                     | 根文档站点 workspace                                      |
| `utils`                    | 共享私有工具包                                            |

生成的 `dist` 目录不参与 workspace discovery。

当前发现的 workspace 包括根项目、已发布包、私有包、各包文档站点、VitePress playground 与 smoke workspace、Limina smoke workspace，以及 Logaria 插件测试 workspace。

## 已发布包

发布脚本和 package manifest 确定了三个独立发布目标：

| 包                        | 独立发布 | 当前职责                                                                           |
| ------------------------- | -------: | ---------------------------------------------------------------------------------- |
| `@docs-islands/vitepress` |       是 | VitePress 集成包，提供 node、client、React adapter、theme 和开发工具 exports       |
| `logaria`                 |       是 | 运行时日志工具，提供 helper、core、plugin 和 types exports，包括构建时裁剪能力     |
| `limina`                  |       是 | 用于 monorepo 架构、source、package、release、proof 和 TypeScript graph 治理的 CLI |

每个发布目标都有独立的包目录、构建后的发布目录、版本、changelog、tag 前缀、构建步骤、package checks 和 release checks。

## 私有 workspace 包

| 包                             | 私有 | 当前职责                                                                       |
| ------------------------------ | ---: | ------------------------------------------------------------------------------ |
| `@docs-islands/core`           |   是 | 供 VitePress 集成使用的共享 client、node、runtime、transformation 和 type 抽象 |
| `@docs-islands/eslint-config`  |   是 | 共享 ESLint 配置与 presets                                                     |
| `@docs-islands/utils`          |   是 | 仓库共享运行时与构建工具，包括 `link-guard` binary                             |
| `@docs-islands/agents`         |   是 | 共享编码 agent skills，以及面向 `.claude`、`.cursor` 和 `.agent` 的链接工具    |
| `@docs-islands/plugin-license` |   是 | 包构建配置使用的私有许可证插件                                                 |

当前 `packages/plugins/*` 区域包含许可证插件。实现没有建立更广泛的 Vite 或 Rollup 插件集合。

## Core 与 VitePress 边界

`@docs-islands/core` 不直接 import VitePress API。其 manifest 提供 client、node、shared 和 types 入口。

`@docs-islands/vitepress` 在 client、node、shared、adapter 和 type 各层 import Core 入口。它将 VitePress 配置、生命周期 API、build hooks 和运行时行为映射到这些共享抽象。

Core 在 source manifest 中为私有包，也不是发布目标。

VitePress 的 Rolldown 配置将声明的 runtime dependencies 和 peer dependencies externalize。Core 是 development dependency，并非外部 runtime dependency。当前构建后的 VitePress manifest 不声明 Core，构建后的 JavaScript 也不保留 Core module imports。这建立了一个当前事实：VitePress 构建将所需的 Core 实现纳入自身产物。

### 由实现推导的结果

当前结构将框架无关的运行时抽象与 VitePress 专属集成分开，使 VitePress 包可以使用共享抽象，而不必将 Core 作为单独的消费者依赖发布。

源码建立了这种结构，但没有建立设计理由或未来框架计划。

## UI 框架 adapter 边界

`DocsIslandsAdapter` 是当前 adapter contract。它提供 framework identifier，以及一个对 VitePress 配置和 resolved Docs Islands 配置执行的 `apply` 操作。

`createDocsIslands()` 接受 adapter 数组。它拒绝空数组、重复的 framework identifier，以及支持框架集合以外的 identifier。

当前支持的框架集合只有 React。当前 adapter 源码目录、Rolldown inputs 和 package exports 只提供 React adapter 及其 client 入口。

### 由实现推导的结果

Adapter contract 与基于数组的编排提供了扩展点，但不能据此认定当前已经实现多个 UI 框架，或已有新增 adapter 的计划。

## Logaria 边界

Logaria 的 manifest 和源码 imports 均不依赖 `@docs-islands/core`。

`@docs-islands/vitepress` 将 Logaria 声明为 runtime dependency。其源码和构建产物使用 Logaria 的 core、helper、plugin 和 types 入口。

Logaria 拥有独立的 public exports、构建产物、package checks、release checks、版本管理和 release tags。

Logaria 独立打包和发布，在结构上不与 `@docs-islands/core` 耦合。实现没有建立其长期产品范围是 Docs Islands 专属还是通用日志工具。

## Limina 边界

Limina 是独立构建和发布的 CLI 包，提供 `limina` binary。

根仓库通过 Limina 配置和命令完成：

- TypeScript project graph preparation 与检查
- Source ownership 与依赖检查
- Typecheck coverage proof
- Checker build 与 typecheck 执行
- 构建后 package output 检查
- Release 一致性检查
- 命名的 graph、library、Vue、consumer、package 和 publish pipelines

当前 graph rules 约束 client 和 shared runtime imports 及 project references。它们拒绝配置指定的 Node.js built-in dependencies，以及配置指定的跨 client、shared 和 node runtime 边界 references。

当前 package checks 只覆盖配置指定的 Logaria、Limina 和 `@docs-islands/vitepress` 构建产物。

Limina 是开发和发布治理工具，不是 VitePress 浏览器产物的前端 runtime dependency。

Limina 失败表示某项已配置的治理规则、package check、release check、proof 或 checker 未通过，需要调查；源码没有为每一种失败定义统一的缺陷分类。

从 [limina.md](./limina.md) 进入 Limina 包内知识索引。[系统模型](./limina-system-model.md) 拥有 authority 与关系定义；[生命周期记录](./limina-lifecycle.md) 拥有状态、发布和修改契约。本仓库架构记录只拥有 Limina 与其他 workspace 单元的关系。

## 由实现推导的结果

三个已发布包可以独立管理版本和发布，同时在同一 workspace 中共享私有实现与构建包。

根发布配置不将 Core、仓库 utilities、agent tooling、ESLint 配置或许可证插件列为发布目标。它们的 manifest 也将其标记为私有包。

已配置的 graph rules 只约束其 labels、dependencies 和 reference entries 表达的边界，并不能建立维护者可能重视的全部架构边界。

## 需要人类确认的方向

- 支持 VitePress 以外的文档框架，是否是 Core 与 VitePress 分离的长期理由？
- Logaria 应继续限定在 Docs Islands 用途，还是发展为通用日志包？
- Limina 与 Docs Islands 是否会长期保留在同一 monorepo？
- 当前私有包中是否有计划独立发布的包？
- Plugins workspace 是否预期扩展成更广泛的插件集合？
