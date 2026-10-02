# 技术栈

[English](../technology-stack.md) | [简体中文](./technology-stack.md)

## 证据边界

本记录覆盖仓库可执行配置、manifest、脚本、构建输入和治理 pipelines 中实际存在的工具与约束。

除非可执行约束明确编码了相关内容，否则这些文件不能建立工具选型理由、长期迁移计划或偏好的 agent 工作流程。

## 仓库强制约束

根 `preinstall` 脚本运行 `only-allow pnpm`，因此仓库安装被限制为使用 pnpm。

根 manifest 将 `packageManager` 固定为 `pnpm@11.9.0`，并要求 pnpm `>=11.9.0`。`pnpm-workspace.yaml` 启用了 `engineStrict`、包管理器版本管理和严格 catalog 模式。

根 Node.js 范围为 `^22.18.0 || >=24.11.0`。实现强制执行这个精确范围，但仓库没有建立排除中间版本的理由。

根项目和主要 TypeScript workspace 包使用 `"type": "module"`。已检查的公开与内部包产物，其 Rolldown 和 tsdown 构建配置均输出 ESM。

应用和 library 源码以及发布构建产物以 ESM 为主。工具要求的 CommonJS 配置仍然存在，例如 `.pnpmfile.cjs` 通过 `module.exports` 导出 pnpm hooks。

## 依赖版本管理

`pnpm-workspace.yaml` 定义以下命名 catalogs：

- `dev`
- `docs-dev`
- `format`
- `frameworks`
- `lint`
- `prod`
- `test`

共享 dependency 和 development dependency 版本主要通过 pnpm catalogs 引用。

Peer dependency 兼容范围保留在各包 manifest 中。部分依赖值还使用 workspace protocols 或包内局部值。实现没有将所有版本都限定在 catalogs 中。

### Vue compiler 声明依赖

在 `hoist: false` 下，每个 Vue compiler 都必须拥有其发布声明导入的依赖。Vue 3.5.39 的 `@vue/compiler-core` 与 `@vue/compiler-sfc` 声明都导入了 `@babel/types`，但它们发布的 manifest 只将其列为开发依赖。[pnpm read-package hook](../../../.pnpmfile.cjs) 使用各 compiler 声明的 `@babel/parser` 范围为两者补齐缺失依赖，并保留已有的显式 Babel types 依赖。此前的通配版本让 Babel 8 与 Babel 7 parser 并存；现在 lockfile 复用 Babel 7.29.7，没有引入新包，也没有放宽声明检查。

祖先目录中的 `node_modules/@babel/types` 可能掩盖开发机上的依赖缺失。[安装回归测试](../../../packages/vitepress/src/node/__tests__/compiler-type-dependencies.test.ts) 要求 compiler 在自身 pnpm 依赖范围内拥有该依赖，并与其 parser 使用同一份 Babel types 安装。VitePress 产物的严格检查保持启用。2026-09-25 的本地复现通过隔离 virtual store 排除了祖先目录中的 Babel 包：旧 hook 在 `compiler-sfc.d.ts` 中产生两条 `TS2307`；只对齐 compiler-core 的 Babel 版本仍然失败。修复后的安装通过了直接导入、根目录另装 Babel 8 的 Vue 传递依赖 workspace，以及 NodeNext 声明检查；错误声明仍被拒绝。这些检查在 macOS、Node 22.18.0 与 24.21.0、pnpm 11.9.0、TypeScript 6.0.3、Vue 3.5.39 下运行，不能证明远端 GitHub Actions 重跑通过。

## 发布版本排序

根发布规划与 changelog 标签选择共用 catalog 中的 `semver` 比较器。预发布的数字标识按数值排序（`beta.10` 晚于 `beta.9`）；稳定版排在对应预发布之后。既有版本输入解析、包标签与旧标签选择规则仍由[共享发布辅助代码](../../../scripts/release/shared.ts)负责。[回归测试](../../../scripts/release/shared.spec.ts)覆盖规划守卫与标签消费者，包括反向比较与层级。根项目通过既有 catalog 声明 `semver` 和 `@types/semver` 开发依赖；它们用于发布脚本，不增加已交付包的运行时依赖。

## 任务编排

### 发布构建环境与缓存

[release.ts](../../../scripts/release/release.ts) 中的 release 与 publish 编排为包构建和 VitePress 依赖构建显式设置 production 模式、`DOCS_ISLANDS_SOURCEMAP=false` 和 `DOCS_ISLANDS_MINIFY=true`。这些子进程环境值覆盖继承的开发设置。VitePress 仍通过 `DOCS_ISLANDS_TEST=1` 标识本地测试构建，通过 `DOCS_ISLANDS_TEST=0` 标识最终构建；普通开发构建保留可配置的 sourcemap。

2026-09-28 排查的 Logaria 发布失败涉及两个条件：普通包的发布构建继承了 Nx 加载的根 `.env` sourcemap 默认值，而构建缓存输入未包含构建环境。因此，仅修改环境仍可能恢复出开发 tarball 缓存。[Nx 配置](../../../nx.json) 现在将模式、sourcemap、压缩和 debug 环境变量纳入构建输入。发布门禁继续拒绝 `.map` 文件和 JavaScript source-map 指令；应重新构建生成产物，不应手动清洗。

[编排回归测试](../../../scripts/release/release.spec.ts) 使用相冲突的继承环境，通过公开 publish 入口覆盖两个 workspace 发布包，并拦截外部进程。真实 Nx/Rolldown 复现另行覆盖冷构建、开发与生产缓存切换以及打包产物。原先三个包的复现是 macOS 上 Node 24.21.0、pnpm 11.9.0、Nx 23.2.1、Rolldown 1.2.10 与 rolldown-plugin-dts 0.28.6 的本地证据，不能证明远端 CI 或 npm 发布成功。

### 任务运行器

Nx 为已配置的 `build` 和 `docs:build` targets 提供理解依赖图的编排与缓存。根 `build` 脚本调用 `nx run-many`，发布脚本通过 `pnpm nx run` 调用包的 build targets。

Nx 不是仓库唯一的任务编排器：

- 根 linting 直接调用 ESLint，再通过 pnpm 递归运行各包的 lint 脚本。
- 格式化直接调用 Prettier。
- 多项测试、文档、链接和清理操作使用仓库 `_run` 脚本，其实现在 `scripts/run-workspace-script.ts`。
- 其他命令直接使用 pnpm 递归或过滤执行。
- 架构和类型治理命令调用 Limina pipelines。

`AGENTS.md` 中的 agent 工作流程偏好属于操作指令，不能据此描述运行时只使用一种编排方式。

## TypeScript 与构建工具

TypeScript 是已检查包中的主要源码语言与类型系统。

根 Limina 配置将 TypeScript checker scope 指定为 `tsgo` preset，将 Vue 相关 scope 指定为 `vue-tsc` preset。`graph` 和 `lib` pipelines 执行 `tsgo -b`，`vue` pipeline 执行 `vue-tsc -b`。

根 pipelines 执行安装的 `tsgo` 与 `vue-tsc` 工具。Limina 专属的 checker adapter 实现与测试不再属于本 workspace。

各包使用不同的构建工具：

- `@docs-islands/core`、`@docs-islands/vitepress`、Logaria 和 `@docs-islands/agents` 的主要 JavaScript 构建使用 Rolldown。
- 已检查的这些 Rolldown 配置使用 `rolldown-plugin-dts` 输出声明。
- VitePress theme 构建使用 tsdown。
- `@docs-islands/eslint-config`、`@docs-islands/utils` 和 `@docs-islands/plugin-license` 通过 Limina 命令构建，不使用同一套 Rolldown 配置模式。

仓库没有对所有包统一使用一种构建工具。

## CI 状态汇总

[CI 状态门禁](../../../.github/workflows/ci.yml)等待保留的 build、quality、test、smoke 和 docs 任务。任一已声明依赖失败或被取消都会使门禁失败；既有变更过滤器跳过的任务仍可接受。Limina 的实现矩阵与 integration 任务随源码移出。2026-10-02 的分离验证检查了投影历史中全部 24 份不同 CI 配置的任务依赖有效性。候选分支已明确启用 push CI；只有候选精确 SHA 上的 Actions 执行才能建立远端结果。

## 浏览器测试

面向浏览器的测试使用 Vitest Node runner 编排，并通过 `playwright-chromium` library 直接驱动 Chromium。仓库不使用 Playwright Test、Vitest Browser Mode 或完整的 `playwright` 包。

VitePress playground 在 Vitest global setup 中保持共享的 VitePress development server 和 Chromium server。每项测试获得独立的 page，playground 内的异步 matchers 轮询真实 Playwright locators。这些自定义 matchers 使用自身的 timeout options，而不是 Vitest 的 `expect.poll` timeout。首次 `client:only` 渲染可能包含 Vite 和 React 的冷启动转换，因此浏览器测试使用限定范围的 timeout，等待组件在其 render container 内出现完整 markup，而不是把空的服务端渲染容器当成 client 已就绪。

VitePress consumer smoke suite 使用 Vitest fixtures：Chromium 的 scope 是 worker，而 consumer installation、development server、browser context 和 page 在每次测试尝试时重新创建。失败的 browser smoke tests 将文本诊断、截图和 trace 保留为 Vitest attachments。MPA integration smoke 仍是仅 Node 的 Vitest 测试。

## Limina

Workspace 通过 dev catalog 的精确版本和九个开发依赖引用使用真实 npm `limina@0.4.0`。根脚本使用它执行 default check、命名的 graph/lib/vue/consumer pipelines、package 产物检查与 release 检查。根配置仍是本仓库的策略 owner；分离没有新增 exception 或 allowlist。

CLI 的可选治理 peers `@arethetypeswrong/core`、`knip`、`npm-package-json-lint` 与 `publint` 现在是显式根开发依赖，保留原来由 Limina workspace 开发依赖提供支持的已配置检查。Knip 保持冻结基线的 `6.38.0`。这些是开发工具，不进入 VitePress 浏览器产物。

该精确 npm 版本使用 MIT、未标记废弃，并支持仓库的 Node 范围。它的 npm repository 与 provenance 仍指向 `97fc3accfcc4c4f6aaf9be05e28d0d8c4ec9b08e` 上原有 `docs-islands` 发布；如实保留这一事实，不将它表述为新的独立发布。安装的 CLI 配置与命令已直接执行验证。版本号或没有 breaking-change 标记不能作为能力证据。归档、tag 映射与验证边界见 [history-extraction.md](./history-extraction.md)。

## Logaria 与内部包

Logaria 是独立构建和发布的包，提供 runtime、helper、core、plugin、types 和 package exports。

`@docs-islands/vitepress` 将 Logaria 声明为 runtime dependency，其源码和构建产物 import Logaria runtime 与 plugin 入口。

以下包在当前 manifest 中是私有 workspace 包：

- `@docs-islands/eslint-config`
- `@docs-islands/utils`
- `@docs-islands/agents`
- `@docs-islands/plugin-license`

`@docs-islands/agents` 包含链接脚本，通过 symlinks 或 junctions 将 skill 目录分发到 `.claude`、`.cursor` 和 `.agent`。

包名与当前机制不能建立未来发布计划或更广泛的产品职责。

## 由实现推导的结果

严格 catalog 模式使未声明的 catalog references 和 catalog drift 成为仓库层面的依赖管理问题。这是 pnpm 配置的结果，并不是说所有包版本都被集中管理。

混合任务模型允许部分理解依赖的构建使用 Nx 缓存，同时保留 linting、格式化、自定义 workspace 脚本和 Limina 治理的直接执行方式。

## 需要人类确认的方向

- 仓库为什么强制使用这个精确的 Node.js 支持范围？
- 当前 Nx、`_run`、pnpm 递归执行和直接工具调用之间的分工，是否有意长期保持稳定？
- 是否预期由 `vue-tsgo` 替换当前某条 `vue-tsc` 执行路径？
- 私有 workspace 包中是否有计划未来发布的包？
