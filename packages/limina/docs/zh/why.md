# 为什么需要 Limina

TypeScript monorepo 往往一开始很简单。一个根 `tsconfig.json`，几个 package，再加一个 `typecheck` 脚本，看起来就够了。

仓库变大后，同一批文件会开始承担不同任务：

- 编辑器需要快速拿到本地类型信息；
- `tsc -b` 需要干净的 project reference 图；
- 框架文件可能需要 `vue-tsc` 或 `svelte-check`；
- package 之间可能通过 `workspace:*` 互相依赖；
- 发布产物必须在 pack 和 install 之后仍然可用。

这些任务有关联，但 TypeScript 不会自动证明它们彼此一致。Limina 解决的就是这个空隙。

## Project graph 会漂移

Project references 应该描述“哪个 project 依赖哪个 project”。但真实 import 才是事实来源。一个文件已经 import 了另一个 workspace package，而声明 project 却没有 reference 对方时，构建图就漂移了。

Limina 会从 checker entry 出发，读取可达 project，用 TypeScript 解析真实 import，然后报告缺失或禁止的 reference。它也支持基于 label 的规则，例如禁止 browser runtime project 访问 Node-only project 或 Node-only dependency。

## Workspace dependency 需要明确语义

`workspace:*` 表示“这个 package 是源码 workspace 的一部分”。这和 `link:`、`file:`、`catalog:` 或普通 semver 不一样，后者通常表示“把这个 package 当作已经构建好的 artifact 消费”。

这个区别很重要，因为 TypeScript project reference 不会改写 package exports。即使 A reference 了 B，只要 A 写的是 `import '@scope/b'`，TypeScript 仍然会按 B 的 package exports 解析。如果 exports 指向 `dist`，源码图就可能悄悄消费构建产物。

Limina 会发现这种情况，并要求你选择一种明确做法：让 exports 暴露源码入口，停止把这条边建模为源码依赖，或生成显式的 compatibility `paths` 文件。

## 源码归属应该清楚

在 monorepo 里，跨 package 的相对 import 会让归属变得含糊。一个 package 也可能 import 了某个 bare dependency，却忘了写进最近的 `package.json`。

Limina 的 source check 把规则说清楚：

- 源码文件必须属于最近的 package owner；
- 非聚合 tsconfig 不应该混合多个 package owner；
- 相对 import 不能逃出同一个 package owner；
- bare import 必须写在 `dependencies` 或 `devDependencies`；
- `#imports` 必须匹配最近 package 的 `imports` 字段，并解析到这个 package 内部。

## 源码通过不等于发布可用

源码图通过，只能说明源码层比较一致。消费者安装的是构建后的产物，不是你的源码 tsconfig。

Limina package checks 会在构建后运行。它会 pack 产物，并检查 package metadata、类型解析、runtime import、依赖声明、self import、README 和 license 文件。这类问题通常不是 `tsc` 能单独发现的。

## 设计目标

Limina 希望规则保持可见。它不会把策略藏在 preset 里，而是把 checker entry、graph rules、package targets、allowlist、paths options 和 pipelines 都放在 `limina.config.mjs`。

这样架构变更就是代码审查可以读到的内容，而不是 merge 后才由 CI 报出来的惊喜。
