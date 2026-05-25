# 配置文件

Limina 从 workspace 内部的 `limina.config.mjs` 读取配置。这个文件通常放在 workspace root：

```js
import { defineConfig } from 'limina';

export default defineConfig({
  config: {},
});
```

配置也可以是函数：

```js
export default defineConfig(({ command, mode }) => ({
  config: {
    // 可以按 CI、本地或发布模式返回不同配置
  },
}));
```

`mode` 来自 `--mode`，然后是 `NODE_ENV`，最后回退到 `default`。

## `mode`

本地、CI、发布前需要使用不同 checker 或 package targets 时，可以用函数配置根据 `mode` 返回不同内容。环境差异会留在一个可审查的配置文件里。

例如发布前才需要检查构建产物时，可以让 `--mode release` 返回额外的 `packageChecks.targets`。之后运行：

```sh
pnpm exec limina --mode release package check
```

Limina 会按 release 模式读取这些目标；本地普通 `limina check` 仍然可以保持轻量。

## `command`

`command` 表示当前加载配置的命令族，例如 `check`、`graph`、`paths` 或 `package`。当某些昂贵配置只服务于特定命令时，可以按 `command` 分支返回。

例如只在 package 命令里声明发布产物目标：

```js
export default defineConfig(({ command }) => ({
  packageChecks:
    command === 'package'
      ? {
          targets: [
            {
              name: '@acme/core',
              outDir: 'packages/core/dist',
            },
          ],
        }
      : undefined,
}));
```

这样普通 graph/proof 检查不会被发布产物配置干扰。

完整一点看，目录可以是：

```text
limina.config.mjs
packages/core/
  src/index.ts
  dist/package.json
```

配置里可以让 release 模式才声明 package output：

```js
export default defineConfig(({ mode }) => ({
  config: {
    checkers: {
      typescript: {
        preset: 'tsc',
        entry: 'tsconfig.build.json',
      },
    },
  },
  packageChecks:
    mode === 'release'
      ? {
          targets: [
            {
              name: '@acme/core',
              outDir: 'packages/core/dist',
            },
          ],
        }
      : undefined,
}));
```

运行 `pnpm exec limina check` 时，Limina 加载配置得到的是默认模式，只分析 graph、source、proof 和 checker typecheck 需要的内容。运行 `pnpm exec limina --mode release package check` 时，Limina 会用 release 模式重新加载配置，并读取 `packageChecks.targets`。

结果是本地日常检查不需要关心 `dist` 是否存在；发布检查则会明确要求 `packages/core/dist` 已经构建好，并按 package target 做产物验证。
