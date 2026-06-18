# 检查器入口

检查器入口用来告诉 Limina：每个检查器应该接管哪些源码入口 `tsconfig.json`。如果没有配置 `config.checkers`，Limina 会使用 auto 模式：自动发现普通 `tsconfig.json` 源码作用域，根据每个作用域实际包含的文件选择 `tsc` 或 `vue-tsc`，并把依赖 Vue 作用域的 TypeScript 作用域提升到 `vue-tsc`，让首次接入不需要手写路由。

需要使用 `tsgo`、第二类 checker、更小的 Vue 覆盖范围，或迁移期 include / exclude 规则时，再改用显式 checker 对象。Limina 会从这些入口出发，继续跟随 solution references，再把声明图、检查器构建入口、声明输出目录、tsbuildinfo 和产物清单生成到 `.limina/`。

```js
import { defineConfig } from 'limina';

export default defineConfig({
  config: {
    // 可选。快速接入时可以省略这个字段，或写成 checkers: 'auto'。
    checkers: {
      typescript: {
        preset: 'tsc',
        include: ['tsconfig.json', 'packages/**/tsconfig.json'],
        exclude: ['**/docs/**'],
      },
      vue: {
        preset: 'vue-tsc',
        include: ['packages/*/docs/tsconfig.json', 'packages/app/tsconfig.json'],
      },
    },
  },
});
```

## auto

- **类型：** `'auto'`
- **默认值：** 省略 `config.checkers` 时使用

auto 模式把每个普通 `tsconfig.json` 当作源码作用域。只包含 TypeScript、JavaScript 和 JSON 的作用域会交给 `tsc`；包含 `.vue` 文件的作用域会交给 `vue-tsc`。solution-style `tsconfig.json` 仍然兼容，Limina 会根据它引用到的源码叶子判断能力。

如果 TypeScript 作用域 import 到 Vue 作用域，auto 模式会把这个 TypeScript 作用域提升到 `vue-tsc`。提升会沿依赖链重复执行，所以生成的 checker 输出不会出现 `tsc` consumer 依赖 `vue-tsc` provider 的情况。

auto 模式只会在 `tsc` 和 `vue-tsc` 之间选择。需要其他 preset 或更细的拆分时，改用显式 checker 对象。

## \<name\>

- **类型：** `config.checkers` 的字符串 key（`Record<string, CheckerConfig>`）

这个 key 是检查器命名空间，例如 `typescript`、`vue` 或 `svelte`。生成文件会放在 `.limina/tsconfig/checkers/<name>/` 下，所以诊断能明确告诉你：哪个检查器生成了配置，哪个检查器又触达了它。

## preset

- **类型：** `'tsc' | 'tsgo' | 'vue-tsc' | 'vue-tsgo' | 'svelte-check'`

`preset` 选择解析器和执行器：

- `tsc`：TypeScript 和 JSON；
- `tsgo`：通过 `@typescript/native-preview` 执行 TypeScript 和 JSON；
- `vue-tsc`：TypeScript、JSON 和 `.vue`；
- `vue-tsgo`：通过 `vue-tsgo` 和 `@typescript/native-preview` 执行 Vue；
- `svelte-check`：Svelte 源码覆盖和第二类 typecheck 执行。

只接受内置 preset。自定义 preset 和自定义 `extensions` 都会被拒绝。

## include

- **类型：** `string[]`
- **必填：** 是

`include` 是非空的、相对工作区根目录的选择器列表，只能选中文件名正好为 `tsconfig.json` 的源码入口。不要让它选中 `tsconfig.lib.json`、`tsconfig.test.json`、`tsconfig.build.json`、`.limina` 里的生成文件、base config、check config 或其他保留 tsconfig。

`limina graph prepare` 会展开 `include` 减去 `exclude`，得到这个 checker 的入口集合。每个入口只能属于一个 checker。之后 Limina 会跟随 solution-style `tsconfig.json` 上的 TypeScript `references`，把被引用到的源码配置也纳入治理。

因此，`tsconfig.lib.json`、`tsconfig.test.json`、`tsconfig.tools.json` 这类非入口配置依然有用，但不要直接写进 `checker.include`。它们只有在被某个已选中的 `tsconfig.json` 入口 reference 到时，才会进入 Limina 管辖。单独存在的 base config、build-only config 或工具辅助配置，如果没有从入口可达，对 Limina 来说就是 inert。

对每个纳入治理的源码配置，Limina 会在 `.limina/tsconfig/checkers/<checker>/projects/...` 下生成声明叶子。生成叶子会 `extends` 源码配置，强制声明 emit 选项，把声明输出写到 `.limina/dts/checkers/<checker>/...`，并在 `.limina/manifest.json` 里记录映射。源码 `tsconfig.json` solution 聚合器会生成到 `.limina/tsconfig/checkers/<checker>/solutions/...` 下。

## 入口唯一性与能力覆盖

`include` 和 `exclude` 计算完成后，不同 checker 的入口集合不能重叠。同一个 `tsconfig.json` 入口不能同时写到 `typescript` 和 `vue` 下面，即使 preset 不同也不行。你需要先选定：这个入口由哪个 checker 负责。

这不表示被 reference 展开后的源码配置只能有一种能力。入口展开之后，不同 preset 可以共同覆盖同一个源码配置。这可以用来给同一份源码叠加能力，例如某个源码配置既在 TypeScript 图里，又需要 Vue 能力。Limina 真正拒绝的是更窄的情况：两个相同 preset 的 checker 同时管到同一个展开后的源码配置。

Limina 还会在展开后检查文件能力。如果某个源码配置包含 `.vue` 文件，却只被 `tsc` 或 `tsgo` 覆盖，graph prepare 会失败，并提示需要能处理这个扩展名的 checker。修复方式是加一个能到达该配置的匹配 checker 入口，或者把这些文件移到合适 checker 管辖的配置里。

## 跨 Checker 可达性

源码 import 可以跨 checker 边界。例如，一个纯 TypeScript 入口可能 import 到由 Vue checker 管辖的 provider。Limina 会记录这条 provider 关系，这样构建类 checker 执行时能让 provider 先于 consumer。

如果多个构建类 preset 能触达同一个生成声明配置，并且它们的底层 build cache 语义不适合共享，Limina 会在构建结束后打印 warning：

```text
Potentially incompatible build checker combination:
  generated config: ...
  source config: packages/core/tsconfig.lib.json
  reachable from:
    - config.checkers.typescript (tsgo)
      entry tsconfigs:
        - packages/app/tsconfig.json
    - config.checkers.vue (vue-tsc)
      entry tsconfigs:
        - packages/theme/tsconfig.json
```

把 `reachable from` 当成迁移地图看。它告诉你：同一个生成配置可以从哪个 checker 的哪些入口 `tsconfig.json` 到达。想消掉 warning，就要让这片可达区域使用 cache 兼容的构建 preset。同 preset 组合没问题，`tsc` 和 `vue-tsc` 也视为兼容；`tsgo` 和 `tsc`、`tsgo` 和 `vue-tsc` 这类组合会提示，因为它们不能安全共享同一套底层 build cache 语义。

## exclude

- **类型：** `string[]`
- **默认值：** `[]`

`exclude` 从 `include` 结果里排除入口匹配项，用来让入口归属更清楚：

```js
exclude: ['**/docs/**', 'packages/legacy/tsconfig.json'];
```

## 已移除字段

`entry`、`routes` 和用户配置的 `extensions` 都会被拒绝。把旧的 `entry: 'tsconfig.build.json'` 迁移为源码选择器：

```js
// before
{ preset: 'tsc', entry: 'tsconfig.build.json' }

// after
{
  preset: 'tsc',
  include: ['packages/**/tsconfig.json'],
  exclude: ['**/docs/**'],
}
```

## 生成图

运行 `limina graph prepare` 会生成 `.limina/manifest.json` 和检查器作用域内的 tsconfig 图。消费图的命令也会在运行前自动 prepare。

用户配置和诊断中的规范路径是源码 tsconfig 路径。`.limina/tsconfig/checkers/.../*.dts.json` 是内部生成路径，只作为兼容输入。
