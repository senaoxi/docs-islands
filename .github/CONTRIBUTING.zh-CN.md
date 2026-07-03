<!-- markdownlint-disable MD014 MD034 -->

# Docs Islands 贡献指南

你好！我们非常高兴你对为 Docs Islands 做出贡献感兴趣。在提交你的贡献之前，请花些时间阅读以下指南：

- [贡献类型](#贡献类型)
- [如何报告问题](#如何报告问题)
- [Pull Request 指南](#pull-request-指南)
- [开发环境配置](#开发环境配置)

## 贡献类型

我们欢迎多种不同类型的贡献：

### Bug 报告

通过详细的重现步骤帮助我们识别和修复错误。

### 功能请求

建议新功能或对现有功能的改进。

### 文档

改进我们的文档，修正错误，或添加示例。

### 代码贡献

修复错误，实现新功能，或提高性能。

### 翻译

通过贡献翻译帮助更多人使用该项目。

### 测试

编写测试，提高测试覆盖率，或帮助进行手动测试。

## 如何报告问题

在报告错误或请求功能时，请：

### 对于 Bug 报告

1. **搜索现有问题** 以避免重复
2. **使用清晰的标题** 来描述问题
3. **提供详细的重现步骤**：

   - 你做了什么
   - 你期望发生什么
   - 实际发生了什么

4. **包含系统信息**：

   - 操作系统和版本
   - Node.js 版本
   - 包版本

5. **添加相关的代码示例** 或截图（如适用）

### 对于功能请求

1. **搜索现有问题** 以避免重复
2. **描述你试图解决的问题**
3. **解释你提议的解决方案** 以及为什么它有用
4. **考虑替代方案** 并提及你考虑过的任何方案
5. **提供示例** 说明如何使用该功能

## Pull Request 指南

- 从 `main` 分支创建一个主题分支，开发完成后再合并回 `main` 分支。

- 如果添加新功能：

  - 添加相应的测试用例。
  - 请提供一个有说服力的理由来添加此功能。理想情况下，你应该先提出一个建议性的 issue，并在获得批准后再开始工作。

- 如果修复 Bug：

  - 如果你要解决一个特殊问题，请在 PR 标题中添加 `(fix #xxxx[,#xxxx])` （#xxxx 是问题 ID），以便更好地生成发布日志（例如 `fix: update entities encoding/decoding (fix #3899)`）。
  - 请在 PR 中提供 Bug 的详细描述，最好能提供一个在线示例。
  - 如果适用，请添加相应的测试覆盖。

- 如果是杂项任务：

  - 对于拼写错误和注释更改，请尝试将多个更改合并到一个 PR 中。
  - **注意，我们不鼓励贡献者提交主要是风格化的代码重构。** 代码重构只有在提高性能或客观地改善代码质量（例如使相关的 bug 修复或功能实现更容易，并且是作为单独的 PR 以改进 git 历史记录）时才会被接受。
    - 原因是代码可读性是主观的。该项目的维护者根据我们的偏好选择以当前风格编写代码，我们不想花时间解释我们的风格偏好。贡献者在贡献代码时应该尊重既定的约定。另一个方面是，大规模的风格更改会导致涉及多个文件的大量差异，为 git 历史记录增加噪音，并使跨提交跟踪行为更改变得更加繁琐。

- 在开发 PR 的过程中，可以有多个小的提交 —— GitHub 可以在合并前自动将它们压缩为一个。

- 这是一个 monorepo 项目，在提交之前，请确保在根目录执行以下命令：

  ```sh
  pnpm format
  pnpm lint
  pnpm check
  pnpm test
  ```

- 只要安装了开发依赖项，就不需要担心代码风格。修改的文件会在提交时自动使用 Prettier 格式化，并经过 ESLint 检查。

- PR 标题必须遵循 [提交信息约定](./commit-convention.md)，以便自动生成变更日志。

### DevDependencies 排版顺序

为提升可读性与可维护性，`package.json` 中的 `devDependencies` 采用"分组顺序 + 组内字母序"的排版策略。

分组顺序（自上而下）：

1. **代码质量工具** - 代码检查、格式化和 Git 钩子
2. **TypeScript 工具链** - TypeScript 编译器和相关工具
3. **类型定义** - @types/\* 包的类型声明
4. **构建和打包工具** - 构建工具、打包工具和开发工具
5. **测试工具** - 测试框架、运行器和工具
6. **UI 框架（开发时）** - 框架特定的开发依赖
7. **运行时辅助工具** - 支持运行时操作的工具库
8. **Babel 工具链** - 代码转换和兼容性工具
9. **内部工作区** - 本地工作区包链接

规则：

- 各分组内部依赖按包名字母序排列。
- 避免跨组重复；新增依赖时遵循既有分组语义。
- 此排序遵循开发工作流程：从代码质量基础到特定框架实现。

## 开发环境配置

你需要 [Node.js](https://nodejs.org) `^22.18.0 || >=24.0.0` 以及 [pnpm](https://pnpm.io) 10.17.0+。

克隆仓库：

```sh
git clone git@github.com:senaoxi/docs-islands.git
```

进入仓库目录：

```sh
cd docs-islands
```

安装项目依赖：

```sh
pnpm install
```

### 文档开发模式

测试你所做更改的最简单方法是在本地运行文档站点。

本仓库提供了一个优化的开发体验，你可以在开发 `Docs Islands` 源代码的同时，通过 JavaScript 调试终端设置断点，在文档中实时预览更改，无需手动重启服务。

1. 准备文档以使用本地包：

   ```bash
   pnpm install
   pnpm build          # 一次性构建，为开发时运行时构建生成 dist/* 文件
   pnpm docs:link:dev
   ```

2. 在 JavaScript 调试终端中启动文档：

   - **在 VS Code 中**：终端 → 新建 `JavaScript 调试终端`
   - 为指定项目启动文档，通过

   ```bash
   pnpm docs:dev
   ```

   启用的是默认 `@docs-islands/monorepo-docs` 文档项目，你可以通过指定项目名称来启动其他项目：

   例如：

   ```bash
   pnpm docs:dev vitepress
   ```

   启用的是 `@docs-islands/vitepress-docs` 文档项目。

   你可以在库的源代码中（例如 `packages/vitepress/src/node/**`、`packages/vitepress/src/client/**`）放置 `debugger;` 语句，当代码路径运行时，执行将在附加的调试器中暂停。

   执行上述命令后，访问 http://localhost:5173/docs-islands/vitepress/ 并尝试修改源代码，你将在开发过程中获得实时更新。

3. 编辑、保存、继续：

   - 对于 **客户端** 和 **服务端** 源代码调试，推荐使用 `JavaScript Debug` 终端配合 `debugger;` 语句进行调试。客户端代码更改将自动触发完整的浏览器刷新，而服务端源代码更改将触发 Vite 服务器重新构建配置模块并自动重启服务。
   - 对于 **构建时注入的客户端运行时** 源代码调试，例如 `packages/vitepress/src/shared/runtime` 中包含的所有模块，这些是在构建过程中为客户端优化的构建时运行时产物，不支持热模块替换（HMR）。对于此类源代码的开发，建议启用 `pnpm build:watch` 模式。设置 `debugger;` 断点并手动执行构建来完成运行时产物的构建工作，然后通过预览环境在浏览器中进行调试。这个过程相当繁琐，未来将进一步优化开发体验。幸运的是，**构建时注入的客户端运行时** 源代码通常不会频繁更改。

提示：要将文档切换回已构建的包（默认），请运行：

```bash
pnpm docs:link:prod
```

## 发布公开包

公开 npm 包从仓库根目录统一发布。本地 `pnpm release` 负责生成版本提交和 package 级 git tag；真正的 npm publish 会交给 `Publish npm packages` GitHub Actions workflow 执行，这样 npm 能生成 Provenance 并显示绿色标记。

- 交互式预览可发布目标：

  ```bash
  pnpm release
  ```

- 为一个或多个公开包生成 changelog：

  ```bash
  pnpm changelog logaria --type patch
  pnpm changelog --package limina --type patch
  pnpm changelog --package logaria,vitepress --type prerelease --preid beta
  ```

- 对指定包做不改文件的预览：

  ```bash
  pnpm release logaria --type patch --dry-run --yes
  pnpm release --package limina --type patch --dry-run --yes
  pnpm release --package vitepress --type prerelease --preid beta --dry-run --yes
  ```

- 从仓库根目录执行正式 release。本地执行时，npm publish 会等 tag push 后由 GitHub Actions 接管：

  ```bash
  pnpm release --package vitepress --type patch --yes
  ```

- 如需在已经打好 tag 的 checkout 上只重试 publish 步骤：

  ```bash
  pnpm release publish --package vitepress --dry-run
  pnpm release publish --package vitepress
  ```

当前公开发布目标：

- `logaria` -> `logaria`
- `limina` -> `limina`
- `vitepress` -> `@docs-islands/vitepress`

对应的 package 级 git tag：

- `logaria/v<version>`
- `limina/v<version>`
- `vitepress/v<version>`

发布 workflow 已配置 `id-token: write`，并默认启用 npm Provenance。npm package 设置中需要信任这个仓库 workflow，并使用 `Release` environment。发布成功后，对应版本应在 npm 页面显示绿色 Provenance 标记。

## 许可证

通过为 Docs Islands 做出贡献，你同意你的贡献将在 [MIT 许可证](https://github.com/senaoxi/docs-islands/blob/main/LICENSE) 下许可。

这意味着：

- 你的贡献成为开源项目的一部分
- 它们可以被自由使用、修改和分发
- 你保留对原始贡献的版权
- 你授予他人在 MIT 许可证下使用你的贡献的权利

---

感谢你为 Docs Islands 做出贡献！🚀
