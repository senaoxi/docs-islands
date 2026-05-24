# 快速开始

## 环境要求

Limina 面向 pnpm workspace，并要求配置文件使用 ESM。

- Node.js `^20.19.0 || >=22.12.0`
- workspace 根目录有 `pnpm-workspace.yaml`
- 接入仓库中安装了 TypeScript
- `limina.config.mjs` 位于 workspace 内部

## 安装

::: code-group

```sh [pnpm]
pnpm add -D limina typescript
```

:::

如果某个 workspace package 会在自己的 scripts 中调用 `limina`，也建议在该 package 中声明：

```json
{
  "devDependencies": {
    "limina": "workspace:*"
  }
}
```

## 初始化已有 workspace

如果一个 pnpm monorepo 还没有采用 Limina 的声明图结构，可以运行：

```sh
pnpm exec limina init
```

`limina init` 会向上查找最近的 `pnpm-workspace.yaml`，确认 workspace root，扫描普通 `tsconfig*.json`，并写出它能安全推导的 Limina 文件。

非交互环境使用：

```sh
pnpm exec limina init --yes
```

初始化可能创建：

- 配对的 `tsconfig*.dts.json` 声明配置；
- `tsconfig.build.json` 聚合器；
- 根目录 `limina.config.mjs`；
- 根目录 `limina:check` 脚本；
- 缺失的根目录 `limina` dev dependency。

遇到含糊输入时，init 会拒绝而不是猜测。例如已经存在 `tsconfig*.build.json` 或 `tsconfig*.dts.json`，或者 `tsconfig.json` 同时混合源码文件和 project references。

初始化后执行：

```sh
pnpm i
pnpm limina:check
```

只有 init 修改依赖或创建根 `package.json` 时才需要先运行 `pnpm i`。

## 最小手动配置

如果你已经有声明构建图，可以在 workspace 根目录创建 `limina.config.mjs`：

```js
import { defineConfig } from 'limina';

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

添加根脚本：

```json
{
  "scripts": {
    "typecheck": "limina check"
  }
}
```

运行：

```sh
pnpm typecheck
```

默认检查 pipeline 会依次运行：

1. `graph:check`
2. `source:check`
3. `proof:check`
4. `checker:typecheck`

## 添加框架 checker

Limina 也可以运行框架感知 checker。当 workspace 某部分需要它时，增加一个 checker entry：

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
    },
  },
});
```

内置 preset 包括 `tsc`、`vue-tsc`、`svelte-check`。启用某个 checker 时，请安装对应 package。

## 下一步

- 在 [核心概念](./concepts.md) 中理解模型。
- 在 [检查与工作流](./checks-and-workflows.md) 中了解每个命令。
- 用 [`packageChecks.targets`](./reference.md#packagecheckstargets) 添加发布产物检查。
