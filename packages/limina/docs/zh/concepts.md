# 核心概念

Limina 使用 TypeScript 的一些概念，但模型并不大。最重要的一点是：让“源码实际 import 了什么”、“TypeScript 构建了什么”、“package 发布了什么”保持一致。

## Checker entry

Checker entry 是 Limina 开始检查的根配置。

```js
export default defineConfig({
  config: {
    checkers: {
      typescript: {
        preset: 'tsc',
        entry: 'tsconfig.build.json',
      },
    },
  },
});
```

对 TypeScript 来说，它通常是一个 build graph 聚合器，通过 `references` 指向声明 project。Limina 会沿着这个图发现应该检查的目标。

对框架文件来说，checker entry 可以使用 `vue-tsc` 或 `svelte-check`。这些 checker 负责普通 `tsc` 无法独立理解的文件。

## Declaration leaf

Declaration leaf 是一个 `tsconfig*.dts.json` project。它是能被 `tsc -b` 消费的图节点。

它应该只输出声明文件，并带有 build-mode 需要的选项：

```jsonc
{
  "compilerOptions": {
    "composite": true,
    "incremental": true,
    "noEmit": false,
    "declaration": true,
    "emitDeclarationOnly": true,
    "rootDir": "src",
    "outDir": "./.tsbuild",
    "tsBuildInfoFile": "./.tsbuild/lib.tsbuildinfo",
  },
}
```

Declaration leaf 负责图结构。它说明这个 project reference 了哪些其他 declaration leaf。

## Local companion

每个 declaration leaf 都应该有一个普通 typecheck companion：

```text
tsconfig.lib.dts.json    <->    tsconfig.lib.json
tsconfig.tools.dts.json  <->    tsconfig.tools.json
tsconfig.test.dts.json   <->    tsconfig.test.json
```

Companion 负责严格 typecheck 语义，例如 `strict`、`lib`、`types`、`jsx` 和框架设置。`limina checker typecheck` 会用 `--noEmit` 运行这些 companion。

这样可以把构建输出设置和普通类型检查设置分开。

## Aggregator config

Aggregator 是只包含 `files: []` 和 `references` 的 tsconfig。它只负责聚合其他 project，不拥有源码文件。

Limina 期望 `tsconfig.build.json` 这类 build graph config 是纯 aggregator。如果默认 `tsconfig.json` 带有 `references`，Limina 也期望它是纯 IDE/typecheck aggregator。

## Source dependency

用 `workspace:*` 声明的依赖是 source dependency。它表示这个 workspace package 应该通过 project references 和源码解析来表达。

如果 TypeScript 把一个 `workspace:*` import 解析到了 `dist`，Limina 会报错。你可以让 exports 暴露源码入口，移除这条源码图边，或生成显式 compatibility paths。

## Artifact dependency

用 `link:`、`file:`、`catalog:` 或普通 semver 声明的依赖会被视为 artifact dependency。它通常不应该再建模成源码 project reference。

Artifact dependency 应该在 package output 层检查，而不是假装它的源码属于当前图。

## Labels 和 rules

Declaration leaf 可以用 `limina` label 启用某条 graph rule：

```jsonc
{
  "limina": "runtime-client",
}
```

对应的 `graph.rules.runtime-client` 可以禁止 reference 或 dependency：

```js
export default defineConfig({
  graph: {
    rules: {
      'runtime-client': {
        deny: {
          deps: [
            {
              name: 'node:*',
              reason: 'browser runtime must not import Node builtins',
            },
          ],
        },
      },
    },
  },
});
```

适合用 label 表达重要架构边界，例如 browser vs Node、public API vs internal tools、production vs tests，或某个 package 自己的规则。
