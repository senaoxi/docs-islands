# limina

<p align="center">
  <a href="https://npmjs.com/package/limina"><img src="https://img.shields.io/npm/v/limina.svg" alt="npm package"></a>
  <a href="https://nodejs.org/en/about/previous-releases"><img src="https://img.shields.io/node/v/limina.svg" alt="node compatibility"></a>
  <a href="https://github.com/XiSenao/docs-islands/actions/workflows/ci.yml"><img src="https://github.com/XiSenao/docs-islands/actions/workflows/ci.yml/badge.svg?branch=main" alt="build status"></a>
  <a href="https://github.com/XiSenao/docs-islands/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/limina.svg" alt="license"></a>
</p>

[English](./README.md) | 简体中文

`limina` 是一个面向 TypeScript monorepo 的可配置治理 CLI。它把 TypeScript project references、源码 typecheck、兼容 `paths`、包导出策略和发布前 package 检查统一收敛到一个显式的 `limina.config.mjs` 文件中。

Limina 不是 bundler，也不会替代 `tsc`、`vue-tsc`、测试框架或发布工具。它的职责是编排这些工具，并验证它们依赖的工程架构是否始终一致。

## 为什么需要 Limina？

大型 TypeScript workspace 往往不只是运行一次 `tsc --noEmit`：

- project references 必须与真实跨项目 import 保持一致；
- production graph project 不应依赖 tools 或 tests；
- browser/runtime 产物不应导入 Node builtins；
- `workspace:*` 依赖在 graph 检查中应按源码依赖处理；
- generated compatibility `paths` 不应悄悄漂移；
- 构建后的 package output 在发布前需要从消费者视角检查；
- Vue、docs、playground、smoke 等检查可能需要位于原生 `tsc -b` 之外的 checker 专属工具。

Limina 让这些规则变得可审查、可执行，并适合放进 CI。

## 特性

- **Project graph validation**：检查可达的 TypeScript 声明叶子、references、graph-owned imports、包边界和基于 label 的 deny rules。
- **Typecheck coverage proof**：验证可达声明叶子与严格的本地 typecheck companion 保持一致，并确认源码文件被 checker entry 或 allowlist 覆盖。
- **Compatibility path generation**：当 `workspace:*` 依赖的 package exports 仍指向 build artifacts 时，生成可选的 `tsconfig.dts.paths.generated.json` 源码 paths 配置。
- **Checker target runner**：按 `typecheck` 或 `build` 执行模式运行已配置的 TypeScript 与 UI 框架 checker entry。
- **Published package checks**：使用 `publint`、Are The Types Wrong 和 runtime import boundary audit 校验构建后的 package output。
- **Composable pipelines**：把内置检查和 shell 命令组合成 `typecheck`、`package`、`publish` 等命名 workflow。
- **Typed configuration**：提供 `defineConfig(...)`，让用户配置拥有编辑器提示和类型约束。

## 环境要求

- Node.js `^20.19.0 || >=22.12.0`
- 包含 `pnpm-workspace.yaml` 的 pnpm workspace
- 接入仓库中已安装 TypeScript
- ESM 形式的 `limina.config.mjs`

## 安装

```sh
pnpm add -D limina typescript
```

如果某个 workspace package 会在自己的 scripts 中调用 `limina`，也请在该 package 中声明 Limina：

```json
{
  "devDependencies": {
    "limina": "workspace:*"
  }
}
```

## 快速开始

在 workspace 根目录创建 `limina.config.mjs`：

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

  graph: {
    rules: {
      'runtime-client': {
        deny: {
          refs: [
            {
              path: 'packages/app/src/node/tsconfig.lib.dts.json',
              reason: 'client runtime must not depend on the Node runtime',
            },
          ],
        },
      },
    },
  },

  proof: {
    allowlist: [
      {
        file: 'src/generated/runtime.d.ts',
        reason: 'Generated declaration stub covered by the runtime build process.',
      },
    ],
  },

  packageChecks: {
    targets: [
      {
        name: '@acme/core',
        outDir: 'packages/core/dist',
      },
    ],
  },

  pipelines: {
    typecheck: ['graph:check', 'proof:check', 'checker:typecheck', 'checker:build'],
    package: ['package:check'],
    publish: ['graph:check', 'proof:check', 'package:check'],
  },
});
```

添加脚本：

```json
{
  "scripts": {
    "typecheck": "limina check typecheck",
    "lint:package": "limina package check",
    "prepublishOnly": "limina check publish"
  }
}
```

运行检查：

```sh
pnpm typecheck
pnpm exec limina graph check
pnpm exec limina package check --package @acme/core
```

## 核心概念

### Checker entry

每个 checker 都必须有一个 `config.checkers.<name>.entry`，通常是一个 `tsconfig*.build.json` graph 聚合配置。`limina checker build` 会在 preset 支持时从这个 entry 执行 build 模式；`limina checker typecheck` 会遍历同一个 entry，找到可达的 `tsconfig*.dts.json` 声明叶子，并检查它们配对的本地 companion。

### 声明叶子与 local companion

声明叶子应该拥有严格的本地 companion。例如，`tsconfig.lib.dts.json` 配对 `tsconfig.lib.json`，`tsconfig.dts.json` 配对 `tsconfig.json`。

默认 `tsconfig.json` 是当前目录的 IDE/typecheck 入口。单环境目录应直接用它作为 local leaf；多环境目录应让它成为只包含 `files: []` 和 `references` 的纯聚合器。

### Source dependencies 与 artifact dependencies

使用 `workspace:*` 声明的依赖会被视为源码依赖。它应该通过 project references 和指向源码的 package exports 来表达。

使用 `link:`、`file:`、`catalog:` 或普通 semver 声明的依赖会被视为 artifact dependency。除非有意作为源码消费，否则不应建模为 project reference。

### Package checks

Source graph checks 不能证明安装后的 package 对消费者可用。`limina package check` 会检查 `packageChecks.targets[].outDir` 下的构建产物，并验证实际 package manifest、exports、类型解析和 runtime imports。如果产物 `package.json` 没有设置 `private: true`，还必须在产物根目录包含 `README.md` 和 `LICENSE.md`。

## CLI

```sh
limina [--config limina.config.mjs] [--mode mode] <command>
```

| 命令                                            | 说明                                                             |
| ----------------------------------------------- | ---------------------------------------------------------------- |
| `limina check <pipeline>`                       | 运行 `pipelines` 中的命名 pipeline。                             |
| `limina graph check`                            | 校验 project references 和架构 import 规则。                     |
| `limina proof check`                            | 证明声明 configs、本地 typecheck configs 和源码覆盖保持一致。    |
| `limina paths generate`                         | 为 artifact-facing workspace exports 生成源码 `paths` 兼容配置。 |
| `limina paths apply`                            | `paths generate` 的兼容别名。                                    |
| `limina paths check`                            | 当 generated path files 过期时失败。                             |
| `limina checker typecheck`                      | 运行从 checker entry 推导出的 typecheck targets。                |
| `limina checker build`                          | 对支持 build 模式的 checker entry 执行 build。                   |
| `limina checker typecheck --concurrency <n>`    | 限制并发 checker 进程数。                                        |
| `limina package check`                          | 运行已配置的 package output checks。                             |
| `limina package check --package <name>`         | 检查单个已配置 package target。                                  |
| `limina package check --tool <tool>`            | 只运行 `publint`、`attw` 或 `boundary`。                         |
| `limina package check --attw-profile <profile>` | 覆盖 ATTW profile：`strict`、`node16` 或 `esm-only`。            |

## 配置参考

### `config`

```js
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
  source: {
    exclude: ['node_modules', 'dist', '.tsbuild'],
  },
}
```

`config.checkers` 定义 checker entry。每个已配置的 checker 都必须声明非空 `entry`。内置 preset 可以省略 `extensions`；如果省略 `source.include`，Limina 会从已配置 checker 的 extensions 推导源码边界，然后再应用 `source.exclude`。

### `graph`

```js
graph: {
  rules: {
    'runtime-client': {
      deny: {
        refs: [
          {
            path: 'packages/app/src/node/tsconfig.lib.dts.json',
            reason: 'client runtime must stay independent from Node runtime',
          },
        ],
        deps: [
          {
            name: '@acme/internal-node',
            reason: 'client runtime must not consume Node-only packages',
          },
        ],
      },
    },
  },
}
```

声明叶子可以通过添加 `limina` label 启用某条规则：

```jsonc
{
  "limina": "runtime-client",
  "extends": ["./tsconfig.json", "../../tsconfig.dts.base.json"],
  "references": [],
}
```

### `paths`

```js
paths: {
  generatedFileName: 'tsconfig.dts.paths.generated.json',
  conditionPriority: ['source', 'development', 'types'],
  artifactDirectories: ['dist', 'build', 'lib', 'esm', 'cjs', 'out'],
}
```

只有当 workspace package 必须保留 artifact-facing exports，同时又需要在 graph 中作为源码依赖消费时，才建议使用 generated paths。

### `proof`

```js
proof: {
  allowlist: [
    {
      file: 'src/generated/runtime.d.ts',
      reason: 'Generated file validated by the build pipeline.',
    },
  ],
}
```

Checker entry 覆盖由 TypeScript 或框架感知工具验证的文件。allowlist 是所有 checker entry 都无法覆盖某个源码文件后的最后兜底；条目应该少而明确，并且必须包含 reason。

### `packageChecks`

```js
packageChecks: {
  targets: [
    {
      name: '@acme/core',
      outDir: 'packages/core/dist',
      checks: ['publint', 'attw', 'boundary'],
      publint: { strict: true },
      attw: { profile: 'esm-only' },
      boundary: {
        environment: (file) => file.startsWith('node/') ? 'node' : 'browser',
        ignoredExternalPackages: ['@acme/runtime-shim'],
      },
    },
  ],
}
```

`outDir` 必须指向包含可发布 `package.json` 的构建后 package 目录。如果该 manifest 没有设置 `private: true`，同一目录还必须包含 `README.md` 和 `LICENSE.md`。

### `pipelines`

```js
pipelines: {
  typecheck: ['graph:check', 'proof:check', 'checker:typecheck', 'checker:build'],
  package: [
    { type: 'command', command: 'pnpm', args: ['build'] },
    'package:check',
  ],
}
```

字符串步骤可以是内置任务名，也可以是简单命令。当参数、`cwd` 或 `env` 需要明确表达时，请使用对象形式的 command step。

## CI 示例

```yaml
name: Typecheck

on:
  pull_request:
  push:
    branches: [main]

jobs:
  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20.19.0
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec limina check typecheck
```

## Programmatic API

```ts
import { defineConfig, loadConfig } from 'limina';

export default defineConfig({
  pipelines: {
    typecheck: ['graph:check'],
  },
});

const config = await loadConfig();
```

大多数用户只需要 `defineConfig(...)`。`loadConfig(...)` 可用于自定义 wrapper 和测试。

## Troubleshooting

### `Unable to find limina config`

请从 workspace 内运行命令，或传入 `--config ./limina.config.mjs`。

### `no pnpm-workspace.yaml was found`

Limina 会通过 `pnpm-workspace.yaml` 推断 workspace root。请把配置文件放在 workspace 内，或传入位于 workspace root 下的配置路径。

### `packageChecks.targets[x].outDir` is invalid

请把 `outDir` 指向构建后的 package 目录，而不是源码 package 目录，除非该目录本身就是可发布的 package output。

### Generated paths are stale

运行：

```sh
pnpm exec limina paths generate
```

然后把生成文件添加到命令输出所列 `extends` 数组的第一项。如果仓库要求无需预生成步骤即可复现 `tsc -b`，请提交生成文件。

## 设计原则

- 显式策略优于隐藏 preset。
- Source graph checks 与 package artifact checks 验证的是不同层面。
- Build graph configs 应该严格、短小，并且直接可追踪。
- Generated compatibility paths 应该是过渡方案，而不是默认架构。
- Limina 应给出可执行的错误信息，而不是静默接受 graph drift。

## License

MIT
