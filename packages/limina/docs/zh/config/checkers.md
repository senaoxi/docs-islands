# 检查器入口

检查器入口用来告诉 Limina：每个检查器应该接管哪些普通源码 `tsconfig*.json`。Limina 会把声明图、检查器构建入口、声明输出目录、tsbuildinfo 和产物清单全部生成到 `.limina/`。

```js
import { defineConfig } from 'limina';

export default defineConfig({
  config: {
    checkers: {
      typescript: {
        preset: 'tsc',
        include: ['tsconfig.json', 'packages/**/tsconfig*.json'],
        exclude: [
          '**/tsconfig*.dts.json',
          '**/tsconfig*.build.json',
          '**/tsconfig*.base.json',
          '**/tsconfig*.check.json',
        ],
      },
      vue: {
        preset: 'vue-tsc',
        include: ['packages/*/docs/tsconfig.json', 'packages/app/tsconfig.vue.json'],
      },
    },
  },
});
```

## \<name\>

- **类型：** `config.checkers` 的字符串 key（`Record<string, CheckerConfig>`）

这个 key 是检查器命名空间，例如 `typescript`、`vue` 或 `svelte`。生成文件会放在 `.limina/tsconfig/checkers/<name>/` 下，因此引用不会跨检查器命名空间。

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

`include` 是非空的、相对工作区根目录的选择器列表，只能选中普通源码 `tsconfig*.json`。不要让它选中 `.limina`、源码级 `tsconfig*.dts.json`、`tsconfig*.build.json`、base config 或其他保留 tsconfig。

`limina graph prepare` 会展开 `include` 减去 `exclude`，读取源码配置，并在 `.limina/tsconfig/checkers/<checker>/projects/...` 下生成声明叶子。生成叶子会 `extends` 源码配置，强制声明 emit 选项，把声明输出写到 `.limina/dts/checkers/<checker>/...`，并在 `.limina/manifest.json` 里记录映射。源码 `tsconfig.json` solution 聚合器会生成到 `.limina/tsconfig/checkers/<checker>/solutions/...` 下。

## exclude

- **类型：** `string[]`
- **默认值：** `[]`

`exclude` 从 `include` 结果里排除匹配项。常见写法：

```js
exclude: [
  '**/tsconfig*.dts.json',
  '**/tsconfig*.build.json',
  '**/tsconfig*.base.json',
  '**/tsconfig*.check.json',
];
```

## 已移除字段

`entry`、`routes` 和用户配置的 `extensions` 都会被拒绝。把旧的 `entry: 'tsconfig.build.json'` 迁移为源码选择器：

```js
// before
{ preset: 'tsc', entry: 'tsconfig.build.json' }

// after
{
  preset: 'tsc',
  include: ['packages/**/tsconfig*.json'],
  exclude: ['**/tsconfig*.dts.json', '**/tsconfig*.build.json'],
}
```

## 生成图

运行 `limina graph prepare` 会生成 `.limina/manifest.json` 和检查器作用域内的 tsconfig 图。消费图的命令也会在运行前自动 prepare。

用户配置和诊断中的规范路径是源码 tsconfig 路径。`.limina/tsconfig/checkers/.../*.dts.json` 是内部生成路径，只作为兼容输入。
