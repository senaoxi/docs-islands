# 检查与工作流

Limina 的命令故意保持小而明确。每个命令检查仓库的一层，`limina check` 再把常用层组合起来。

## 默认检查

```sh
pnpm exec limina check
```

默认检查会依次运行：

1. `graph:check`
2. `source:check`
3. `proof:check`
4. `checker:typecheck`

仓库配置好后，可以把它作为本地和 PR 的常规命令。

## Graph check

```sh
pnpm exec limina graph check
```

Graph check 问的是：“TypeScript project references 和源码真实 imports 是否一致？”

它会检查：

- workspace import 是否缺少 project reference；
- 是否存在跨 package 的相对 import；
- `workspace:*` 依赖是否解析到了构建产物；
- declaration leaf 是否带有 `tsc -b` 需要的 compiler options；
- local companion 的关键 typecheck options 是否一致；
- 基于 label 的 refs 和 package dependency deny rules；
- 跨 package reference 是否有对应的 `workspace:*` 依赖声明。

失败时，先看报错里的 importing file 和 expected reference。常见修复是补 project reference、调整 dependency protocol、让 package exports 暴露源码，或收紧 graph rule。

## Source check

```sh
pnpm exec limina source check
```

Source check 问的是：“每个源码文件是否属于正在使用它的 package？”

它会检查：

- 每个被检查的源码文件都有最近的 `package.json` owner；
- 一个 leaf config 不混合多个 package owner；
- 相对 import 不逃出当前 owner package；
- bare package import 写在 `dependencies` 或 `devDependencies`；
- `#imports` 匹配最近 package 的 `imports` 字段，并留在这个 package 内部。

这个检查用来让 package 归属保持清楚、可审查。

## Proof check

```sh
pnpm exec limina proof check
```

Proof check 问的是：“我们能否证明源码文件被 graph、checker entry 或显式例外覆盖？”

它会检查：

- 每个 `tsconfig*.dts.json` 都能从 checker entry 到达；
- 每个 declaration leaf 都有 strict local companion；
- declaration leaf 和 companion 包含相同文件，并保持 typecheck 语义一致；
- build graph config 是纯 aggregator；
- 默认 `tsconfig.json` 使用预期角色；
- 源码文件由 graph project、checker entry 或 `proof.allowlist` 覆盖；
- allowlist entry 有非空 file 和 reason。

Allowlist 适合生成文件或有意例外，reason 应该写到 reviewer 能理解。

## Checker typecheck 和 build

```sh
pnpm exec limina checker typecheck
pnpm exec limina checker build
```

`checker typecheck` 会从每个 checker entry 找到可达 declaration leaf，映射到 local companion，然后用 no-emit 模式运行 checker。

`checker build` 会以 build 模式运行支持该模式的 checker entry。内置 preset 包括：

| Preset         | Typecheck | Build | 默认文件           |
| -------------- | --------- | ----- | ------------------ |
| `tsc`          | 是        | 是    | TypeScript 和 JSON |
| `vue-tsc`      | 是        | 是    | `.vue`             |
| `svelte-check` | 是        | 否    | `.svelte`          |

如果需要限制并发 checker 进程，可以给 `checker typecheck` 加 `--concurrency <n>`。

## Paths generate 和 check

```sh
pnpm exec limina paths generate
pnpm exec limina paths check
```

Paths generation 只处理一种兼容场景：某个 package 用 `workspace:*` 声明，graph 认为它应该按源码消费，但它的 package exports 仍然指向构建产物。

Limina 可以生成 `tsconfig.dts.paths.generated.json`，里面是指向源码的 aliases。它不会自动注入这些文件。你需要手动把生成文件放到对应 declaration leaf 的 `extends` 第一项。

CI 中可以用 `paths check` 在 generated files 过期时失败。

## Package check

```sh
pnpm exec limina package check
pnpm exec limina package check --package @acme/core
pnpm exec limina package check --tool publint
```

Package check 问的是：“构建后的 package 对消费者是否可用？”

它会运行 `packageChecks.targets` 中配置的目标：

- `publint` 检查 package metadata 和发布时问题；
- `attw` 使用 Are The Types Wrong 检查类型解析；
- `boundary` 扫描构建后的 JavaScript imports，发现 runtime 和依赖边界问题。

公开发布的 package output 必须包含 `README.md` 和 `LICENSE.md`，除非 output 的 `package.json` 设置了 `private: true`。

先 build，再运行 package checks。

## 自定义 pipelines

当仓库需要命名工作流时，使用 `pipelines`：

```js
export default defineConfig({
  pipelines: {
    package: ['checker:build', 'package:check'],
    publish: [
      'graph:check',
      'source:check',
      'proof:check',
      'checker:typecheck',
      'checker:build',
      'package:check',
    ],
  },
});
```

运行：

```sh
pnpm exec limina check package
pnpm exec limina check publish
```

Pipeline step 可以是 Limina 内置任务，也可以是外部命令。当参数、`cwd` 或环境变量需要写清楚时，建议使用 object form command step。
