# 核心概念

Limina 使用 TypeScript 的一些概念，但模型并不大。最重要的一点是：让“源码实际导入了什么”、“TypeScript 构建了什么”、“包发布了什么”保持一致。

## 检查器入口

[检查器入口](./config/checkers.md)为一个检查器命名空间选择普通源码 `tsconfig*.json`。

```js
export default defineConfig({
  config: {
    checkers: {
      typescript: {
        preset: 'tsc',
        include: ['packages/**/tsconfig*.json'],
        exclude: ['**/tsconfig*.dts.json', '**/tsconfig*.build.json'],
      },
    },
  },
});
```

对 TypeScript 来说，它通常是一组源码配置选择器。Limina 会展开 `include` 减去 `exclude`，再把检查器作用域内的声明图生成到 `.limina/`。

对框架文件来说，检查器入口可以使用 `vue-tsc`、`vue-tsgo` 或 `svelte-check`。这些检查器负责普通 `tsc` 无法独立理解的文件。

只要你希望 Limina 检查某一类源码，就需要在 `limina.config.mjs` 中给它一个检查器入口。普通 TypeScript 包通常用 `typescript` 检查器加源码 tsconfig glob；Vue 或 Svelte 项目则增加对应框架检查器。后续的图、覆盖证明、源码和检查器命令都会从这些入口生成的 manifest 出发。

## 生成声明叶子

生成声明叶子是 `.limina/tsconfig/checkers/<checker>/.../*.dts.json` 项目。它是能被 `tsc -b` 或 `vue-tsc -b` 消费的图节点。

它应该只输出声明文件，并带有构建模式需要的选项：

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

生成叶子负责图结构。它继承源码配置，强制声明 emit，记录 `liminaOptions.sourceConfig`，并引用从源码导入推导或通过 `liminaOptions.implicitRefs` 声明的其他生成叶子。

当一个包或一个包内的某个环境需要进入检查器图时，把它的源码 tsconfig 放进 `include`。例如选中 `packages/core/tsconfig.lib.json` 后，Limina 会为 `@acme/core` 生成声明边界。`@acme/app` 导入 `@acme/core` 时，Limina 就能验证并生成对应的声明引用。

## 源码配置

源码配置是用户可见的规范配置：

```text
packages/core/tsconfig.lib.json
packages/core/tsconfig.tools.json
packages/core/tsconfig.test.json
```

源码配置负责严格类型检查语义，例如 `strict`、`lib`、`types`、`jsx` 和框架设置。覆盖证明检查会验证生成覆盖；检查器构建则通过 `tsc -b`、`tsgo -b` 或 `vue-tsc -b` 运行生成入口。

::: warning
当前 `vue-tsgo` 在执行上是二等公民，因为它的构建模式不能保持 TypeScript 项目引用边界，也不具备增量构建语义；但选中的源码 tsconfig 仍会参与 Limina 图检查和覆盖证明。
:::

这样可以把生成声明输出设置和普通源码类型检查设置分开。

## 聚合器配置

聚合器是只包含 `files: []` 和 `references` 的 tsconfig。它只负责聚合其他项目，不拥有源码文件。

如果默认 `tsconfig.json` 带有 `references`，Limina 仍然期望它是纯 IDE / 类型检查聚合器。

如果一个源码配置只是负责把多个源码项目组合起来，就让它保持聚合器角色。生成构建聚合器位于 `.limina/`，由 `limina graph prepare` 重新创建。

## 源码边与产物边

一个包可以让一部分公开入口指向源码，也可以让另一部分公开入口指向构建产物。`package.json` 里的依赖协议负责声明访问权限，但不决定这段关系是源码消费还是产物消费；解析到的文件才决定。

对于声明了 `exports` 的工作区包，Limina 会预解析每一个公开子路径。TypeScript 解析必须能找到稳定类型入口：`.d.ts` 系列声明、`.ts` / `.tsx` / `.mts` / `.cts` 这类源码、`.json`，或检查器支持的源码扩展名，例如 `.vue`。如果 TypeScript 只能解析到运行时 JavaScript，或者 TypeScript / Oxc 无法解析某个导出，图检查会报告这个包导出。

当 `@acme/app` 导入了 `@acme/core` 的某个公开入口时，只有这个入口解析到被生成声明项目管辖的文件，图引用才要求对应的生成叶子引用 core 的生成叶子。`dist/*.d.ts` 这类构建后的声明产物已经是输出，不要求项目引用。互补的一侧会出现在 `limina graph export --view artifact` 里，作为限定范围内的架构事实。

## 依赖图导出

`limina graph export` 会以 JSON 导出 package 节点和 source/artifact 边：

```sh
pnpm exec limina graph export --view all
```

需要源码关系时使用 `--view source`；需要检查产物消费事实时使用 `--view artifact`。每条边都在 Limina 管辖的 tsconfig 域内解析，并尊重该域的 `compilerOptions.customConditions`。这份导出不是权威任务图，也不是构建顺序来源。

产物输出仍然由 `limina package check` 在包输出层检查，而不是假装它的源码属于当前类型图。

## 标签与规则

声明叶子可以通过 `liminaOptions.graphRules` 启用一条或多条[图规则](./config/graph-rules.md)：

```jsonc
{
  "liminaOptions": {
    "graphRules": ["runtime-client"],
  },
}
```

对应的 `graph.rules.runtime-client` 可以禁止引用或依赖：

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

适合用标签表达重要架构边界，例如浏览器与 Node、公开 API 与内部工具、生产代码与测试，或某个包自己的规则。

当一组源码有明确边界时，可以在对应 `tsconfig*.dts.json` 的 `liminaOptions.graphRules` 里写一个或多个标签，并在 `limina.config.mjs` 中写规则。例如浏览器运行时叶子写 `"graphRules": ["runtime-client"]`，规则里禁止 `node:*` 和 `@acme/internal-node`。边界就不再只靠约定；只要有人在浏览器项目里导入 `node:fs`，图检查会直接失败，并显示规则里的 `reason`。
