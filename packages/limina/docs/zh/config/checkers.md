# 检查器配置

`config.checkers` 用来决定每个源码 `tsconfig.json` 由哪个构建检查器负责，也可以过滤已发现的 Astro 或 Svelte 检查。检查器名称是固定 identity：

| key            | 角色       | 可以拥有声明构建 |
| -------------- | ---------- | ---------------- |
| `tsc`          | 构建检查器 | 是               |
| `tsgo`         | 构建检查器 | 是               |
| `vue-tsc`      | 构建检查器 | 是               |
| `svelte-check` | 补充检查器 | 否               |
| `astro`        | 补充检查器 | 否               |

key 本身就是检查器 identity，不再有 `preset` 字段，也不再支持自定义检查器 alias。这样，源码归属、生成路径、执行工具和缓存行为只使用同一个名字。

省略 `config.checkers` 时，Limina 使用 auto 模式。需要让工作区的不同部分分别由 `tsc`、`tsgo` 和 `vue-tsc` 构建时，再使用显式对象：

```js
import { defineConfig } from 'limina';

export default defineConfig({
  config: {
    checkers: {
      tsc: {
        include: ['packages/shared/tsconfig.json'],
      },
      tsgo: {
        include: ['packages/native/**/tsconfig.json'],
      },
      'vue-tsc': {
        include: ['apps/web/tsconfig.json'],
      },
      'svelte-check': {
        include: ['apps/**/tsconfig.json'],
        exclude: ['apps/legacy/tsconfig.json'],
      },
    },
  },
});
```

显式配置至少要包含一个构建检查器。每个 `include` 都必须是非空数组，`exclude` 可省略。auto 字段不能与固定检查器 key 混用。

## Auto 模式

- **类型：** `{ mode: 'auto'; exclude?: string[]; useTsgo?: boolean }`
- **默认值：** 省略 `config.checkers` 时使用

默认情况下，普通 TypeScript 作用域由 `tsc` 负责，Vue 作用域由 `vue-tsc` 负责：

```text
普通 TypeScript -> tsc
Vue             -> vue-tsc
```

设置 `useTsgo: true` 后，普通 TypeScript 作用域改由 `tsgo` 负责，Vue 仍然使用 `vue-tsc`。

```js
export default defineConfig({
  config: {
    checkers: {
      mode: 'auto',
      useTsgo: true,
      exclude: ['packages/playground/tsconfig.json'],
    },
  },
});
```

`useTsgo` 只改变普通 TypeScript 的初始归属。如果 TypeScript consumer 依赖 Vue 作用域，fixed-point promotion 仍可把 consumer 提升为 `vue-tsc`。如果 Vue consumer 依赖 `tsgo` provider，Limina 不会把 provider 降回 `tsc`，而是保留归属，并在首个构建 target 启动前报告缓存限制。

Vue 能力由检查器实际解析出的文件集合确认，不能只看 `vueCompilerOptions`。Limina 会先遍历入口、solution、被引用 leaf 和有效 `extends`，再让 Vue parser 解析真实扩展名和文件。只有确实存在匹配文件时，自定义 Vue 扩展才会切到 `vue-tsc`；只有配置提示而没有实际模块时，不会改变归属。

Auto `exclude` 只过滤已激活[治理区域](./regions.md)中的入口选择，不会裁剪从已选入口到达的有效 project reference，也不同于控制源码覆盖的 `config.source.exclude`。

## 显式构建归属

构建检查器的 scope 使用同一个结构：

```ts
interface CheckerScope {
  include: string[];
  exclude?: string[];
}
```

`include` 选择相对 `config.rootDir` 的直接 `tsconfig.json` 入口。外部激活包可以使用 `../`，但 selector 不能把未激活路径或工作区边界后的路径拉入图中。`exclude` 在 include 之后移除直接入口，不会截断正常的 project-reference closure。

Limina 分两步分配归属：

1. 根据每个构建检查器的 `include` 和 `exclude` 计算直接归属。
2. 展开 TypeScript project references。

同一个源码配置不能直接匹配多个构建检查器。展开 reference 时，已有显式 owner 的配置会保留自己的归属：引用方在这个边界停止继承，但 reference 关系仍然保留，并形成跨检查器 dependency edge。未分配的被引用配置会继承引用方的 checker。如果不同 checker 路径试图让同一个未分配配置继承不同归属，图准备会失败，并要求显式分配。

这样就可以渐进迁移。例如，`vue-tsc` app 可以引用显式归 `tsc` 管辖的 shared project；shared 仍由 `tsc` 构建，不会再被 `vue-tsc` 重复拥有。

`tsconfig.lib.json`、`tsconfig.test.json` 等非入口配置，只有被已选 `tsconfig.json` 入口引用时才会进入治理图。生成配置都位于 Limina 的 `.limina` namespace；用户配置和诊断继续使用源码配置路径。

## Astro 与 Svelte 补充策略

Astro 和 Svelte 能力只来自实际 `.astro` 和 `.svelte` 模块。`astro` 与 `svelte-check` key 只能过滤 Limina 已经发现的 capability，不能凭空创建 target、取得声明归属，或参与 project-reference traversal。

- 省略某个补充 key 时，该 family 已发现的 target 默认全部启用。
- 配置该 key 时，`include` 和 `exclude` 按源码配置路径过滤 target。
- 匹配到没有对应模块的配置时，不创建 target。
- 同一个源码配置可以同时拥有 Astro 和 Svelte target。

主要构建检查器保留完整源码集用于治理，但声明投影只包含其 parser 真正可以编译的文件。`tsc` 和 `tsgo` 投影各自支持的 TypeScript、JavaScript、声明、JSON 和 relative `types` 输入；`vue-tsc` 还会投影 `.vue` 与已配置的 Vue 扩展。`.astro` 和 `.svelte` 永远不会进入 Limina 的声明构建。

如果 `checker:typecheck` 没有任何实际框架 target，它会被记录为 `disabled`，正常退出，不运行 peer preflight，也不物化生成的 checker artifact。

### 框架前置条件

框架命令和 parser package 都从拥有源码配置的叶子包解析：

- Astro 需要 `astro`、`@astrojs/check` 和 `typescript`，以及叶子包已生成的 `.astro/types.d.ts`。Limina 执行 `astro check --noSync --root <leaf> --tsconfig <source-config>`，不会运行 `astro sync`。
- Svelte 需要 `svelte-check`、`svelte` 和 `typescript`。Limina 执行 `svelte-check --workspace <leaf> --tsconfig <source-config>`，不会运行 SvelteKit sync、启用增量模式、写入 `.svelte-check` cache 或覆盖输出格式。

Astro import analysis 还会从叶子包解析 `@astrojs/compiler`；Svelte import analysis 会解析 `svelte/compiler`。依赖缺失时，预检会在启动检查器进程前失败。

`checker typecheck` 是完整重跑，不是框架 watch 模式。稳定 target ID 只表示多次运行之间的 target identity 稳定，不提供增量失效能力。

## Vue import 解析

- **类型：** `config.imports.vue?: 'heuristic' | 'compiler-sfc'`
- **默认值：** `'heuristic'`

构建源码图时，Limina 会从 Vue SFC 的 `<script>` 与 `<script setup>` 中提取 import。默认启发式 parser 不需要额外 package。若要使用 Vue 编译器解析这些 block，可以配置：

```js
export default defineConfig({
  config: {
    imports: {
      vue: 'compiler-sfc',
    },
  },
});
```

这个模式要求运行 Limina 的工作区安装 `@vue/compiler-sfc`。缺少编译器 package 时，预检会在启动检查器进程前失败。

## 跨检查器依赖与缓存复用

Limina 会区分声明依赖和框架调度依赖：

- `declaration-provider` 表示真实的编译器声明关系，可以成为生成的 TypeScript project reference。
- `framework-schedule` 只用于排列框架检查或构建顺序，绝不会写成生成的 `tsconfig` reference。

provider 会先于 consumer 运行。纯 framework-scheduling cycle 会作为一个调度 component 执行；declaration cycle 仍然失败。

缓存复用是有方向的：

| Consumer              | Provider      | 可以复用缓存 |
| --------------------- | ------------- | ------------ |
| 相同 checker identity | 相同 identity | 是           |
| `vue-tsc`             | `tsc`         | 是           |
| 其他跨 identity 组合  | 不同 identity | 否           |

如果 consumer 能编译 provider 的完整 declaration closure，Limina 会保留 reference。无法复用缓存时，会在首个 build target 启动前警告：底层工具可能重复构建或造成 cache churn。如果 consumer 不能处理 provider closure，图准备会直接失败。例如，`tsc` 或 `tsgo` consumer 不能依赖包含 `.vue` 或自定义 Vue 扩展的 provider closure。

## 从 alias 与 `preset` 迁移

把旧 entry 移到与其 `preset` 同名的固定 key，再删除 `preset`：

```js
// before
checkers: {
  typescript: {
    preset: 'tsgo',
    include: ['packages/**/tsconfig.json'],
  },
  vue: {
    preset: 'vue-tsc',
    include: ['apps/web/tsconfig.json'],
  },
}

// after
checkers: {
  tsgo: {
    include: ['packages/**/tsconfig.json'],
  },
  'vue-tsc': {
    include: ['apps/web/tsconfig.json'],
  },
}
```

如果多个 alias 以前使用同一个 `preset`，需要把不重叠的 selector 合并到一个固定 key。selector 重叠或策略冲突时，请显式决定如何处理；Limina 不会猜测哪个 alias 优先。配置文件是 TypeScript/MTS，因此 Limina 会给出确定的 schema diagnostic，但不会自动改写。

## 生成图与 manifest

运行 `limina graph prepare` 会物化 `.limina/manifest.json` 和生成的检查器配置。managed build/typecheck 命令与流水线会按需物化；只读的 graph、source 和 proof check 只在内存中计算图。

当前 manifest 为 version 4，使用稳定排序的 `dependencyEdges`。Version 1 到 3 只作为旧生成产物的归属 ledger，用于安全清理后写入新的当前 manifest。未来版本或格式错误的 manifest 会 fail closed。
