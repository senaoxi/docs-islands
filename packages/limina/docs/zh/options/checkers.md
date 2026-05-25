# Checker entries

Checker entries 会被 graph、proof、paths 和 checker commands 共同使用。

```js
import { defineConfig } from 'limina';

export default defineConfig({
  config: {
    checkers: {
      typescript: {
        preset: 'tsc',
        entry: 'tsconfig.build.json',
      },
      vue: {
        preset: 'vue-tsc',
        entry: 'tsconfig.vue.build.json',
      },
      svelte: {
        preset: 'svelte-check',
        entry: 'tsconfig.svelte.build.json',
      },
    },
  },
});
```

## `<name>`

`checkers` 的 key 是这组 checker 的名字，例如 `typescript`、`vue` 或 `svelte`。它会出现在报告和调试信息里，用来区分是哪一类源码入口出了问题。

同一个 workspace 可以同时有多个 checker entry。普通 TypeScript 图可以用 `typescript`，Vue app 可以额外用 `vue`，Svelte package 可以额外用 `svelte`。

## `preset`

`preset` 决定 Limina 调用哪个 checker runner：

- `tsc`：处理 TypeScript 和 JSON；
- `vue-tsc`：处理 `.vue`；
- `svelte-check`：处理 `.svelte`。

内置 preset 可以省略 `extensions`。当前 runner 不支持自定义 preset，不能把它当作可执行 checker 使用。

## `entry`

`entry` 是 checker 的入口配置，通常是一个 build graph aggregator，例如 `tsconfig.build.json` 或 `tsconfig.vue.build.json`。Graph、proof、paths 和 checker commands 都会从这些 entry 推导检查范围。

如果 `entry` 指向的 graph 里包含 `packages/app/tsconfig.lib.dts.json`，而 app 源码 import 了 `@acme/core`，Limina 就会沿着这个入口检查 app 是否正确 reference 了 core。

## `extensions`

`extensions` 用来声明这个 checker 覆盖哪些文件后缀。内置 preset 通常不需要手写；只有需要覆盖额外后缀时才补。

配置了 `vue` checker 后，源码中如果出现 `.vue` 文件：

```vue
<!-- packages/app/src/App.vue -->
<script setup lang="ts">
const count: number = '1';
</script>
```

`limina checker typecheck` 会用 `vue-tsc` 覆盖这个入口下的 Vue 文件，而不是只跑普通 `tsc`。如果没有给 Vue 源码配置 checker entry，`proof check` 也更容易暴露“这些文件没有被任何 checker 覆盖”的问题。

完整一点看，目录通常类似这样：

```text
packages/app/
  tsconfig.vue.build.json
  tsconfig.vue.dts.json
  tsconfig.vue.json
  src/App.vue
```

模块里出现了 Vue 单文件组件：

```vue
<!-- packages/app/src/App.vue -->
<script setup lang="ts">
const count: number = '1';
</script>
```

运行 `pnpm exec limina checker typecheck` 时，Limina 会从 `config.checkers.vue.entry` 指向的 `tsconfig.vue.build.json` 出发，找到可达的 declaration leaf，再映射到 local companion，并用 `vue-tsc` 做 no-emit typecheck。

结果是这个类型错误由 `vue-tsc` 报出。这样用户能知道 `.vue` 文件不是靠普通 `tsc` 顺便覆盖，而是由专门的 checker entry 进入 Limina 的检查范围。
