# Limina

Limina 用来让 TypeScript monorepo 保持一致。它会检查源码依赖图、package 归属、类型检查覆盖、兼容 `paths` 和构建后的 package 产物是否真的描述着同一个项目。

小项目可能只需要 `tsc --noEmit`。但大型 workspace 通常会多出很多层：

- package 之间通过 `workspace:*` 相互依赖；
- TypeScript project references 描述构建图；
- Vue、Svelte、文档、工具脚本、测试和 runtime 代码可能需要不同 checker；
- 发布出去的 package 还需要正确的 `exports`、类型入口、依赖声明、README 和 license。

Limina 不替代这些工具。它负责把这些工具串起来，并在 CI 或发布前验证它们依赖的工程约束是否仍然一致。

## Limina 检查什么

Limina 围绕一份 `limina.config.mjs` 配置工作，核心检查可以分成几类：

- **Graph checks**：确认真实 import、TypeScript project references 和 workspace 依赖规则一致。
- **Source checks**：确认源码文件没有跑出自己所属的 package，import 也写在正确的依赖声明里。
- **Proof checks**：证明声明配置、本地 typecheck 配置、checker entry 和 allowlist 覆盖了应该覆盖的源码。
- **Checker runs**：根据图里的目标调用 `tsc`、`vue-tsc` 或 `svelte-check`。
- **Path generation**：当 workspace 依赖按源码消费但 package exports 仍指向构建产物时，生成显式的 TypeScript `paths` 兼容文件。
- **Package checks**：从消费者安装后的视角检查构建产物，使用 `publint`、Are The Types Wrong 和 runtime import boundary scan。
- **Pipelines**：把 Limina 内置任务和 shell 命令组合成本地、PR、发布前工作流。

## 什么时候适合用

Limina 适合以下仓库：

- 使用 pnpm workspace 管理多个 package；
- 已经使用 TypeScript project references，或准备迁移到 `tsc -b`；
- 需要约束生产代码、工具代码、测试代码、浏览器代码和 Node 代码之间的边界；
- 会发布 npm package，希望发布前检查构建产物；
- 有框架文件或文档项目，单靠普通 `tsc -b` 无法完整 typecheck。

Limina 不是 bundler、测试框架、发布工具，也不是隐藏 preset。它的目标是让 monorepo 规则显式、可审查，并能稳定放进 CI。

## 文档地图

- 阅读 [为什么需要 Limina](./why.md) 理解它解决的问题。
- 按 [快速开始](./getting-started.md) 安装并运行第一次检查。
- 在 [核心概念](./concepts.md) 中理解常见术语。
- 在 [检查与工作流](./checks-and-workflows.md) 中了解每个命令负责什么。
- 在 [参考](./reference.md) 中查完整配置字段、CLI、FAQ 和维护者发布检查清单。
