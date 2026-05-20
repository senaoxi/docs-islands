# @docs-islands/lattice

<p align="center">
  <a href="https://npmjs.com/package/@docs-islands/lattice"><img src="https://img.shields.io/npm/v/@docs-islands/lattice.svg" alt="npm package"></a>
  <a href="https://nodejs.org/en/about/previous-releases"><img src="https://img.shields.io/node/v/@docs-islands/lattice.svg" alt="node compatibility"></a>
  <a href="https://github.com/XiSenao/docs-islands/actions/workflows/ci.yml"><img src="https://github.com/XiSenao/docs-islands/actions/workflows/ci.yml/badge.svg?branch=main" alt="build status"></a>
  <a href="https://github.com/XiSenao/docs-islands/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/@docs-islands/lattice.svg" alt="license"></a>
</p>

[English](./README.md) | 简体中文

`@docs-islands/lattice` 是面向 TypeScript project references monorepo 的可配置架构治理 CLI。它把分散且冗长的根脚本收束为一个显式规则文件和一个 `lattice` 命令，用来检查项目图架构、局部 typecheck 覆盖证明、发布产物包边界，以及自定义 pipeline。

## 特性

- **单一治理入口**：用 `lattice check <pipeline>` 替代冗长的根 `package.json` 脚本。
- **显式配置**：所有架构规则都写在 `lattice.config.mjs` 中，不依赖隐藏 preset。
- **项目图校验**：约束 project reference 边、包导入边界、package exports 源码归属、推断项目归属和 Node builtin 导入规则。
- **兼容 paths 生成**：为 package exports 仍指向构建产物的 `workspace:*` 依赖生成可选的源码 `paths` 文件。
- **Typecheck 覆盖证明**：确认 build config 与本地 typecheck config 和 IDE/typecheck 路线一致。
- **TypeScript runner**：从 `process.cwd()` 或 `lattice tsc -p` 发现普通 `tsconfig*.json` 类型检查目标并逐个执行。
- **发布产物包边界审计**：扫描构建后的 `.js` 文件，确认 runtime import 与 dependencies、自身 exports、browser/node 环境匹配。
- **Pipeline 组合**：在 `typecheck`、`package`、`publish` 等命名 pipeline 中组合内置检查和 shell 命令。
- **统一日志输出**：通过 `@docs-islands/logger` 输出稳定的 `@docs-islands/lattice[task.*]` 日志分组。
- **TypeScript 优先**：提供 ESM、类型声明、CLI bin 和 `defineConfig(...)`。

## 环境要求

- Node.js `^20.19.0 || >=22.12.0`
- 由接入仓库安装 TypeScript
- pnpm workspace，并包含 `pnpm-workspace.yaml`
- 支持 ESM 配置文件

Lattice 专门为 pnpm 设计。它通过 `pnpm-workspace.yaml` 推断 workspace root，优先用 `pnpm recursive list --depth -1 --json` 做包发现，再合并 `pnpm-workspace.yaml` 和根 `package.json#workspaces` 里的 glob 作为兜底。各 package manifest 用来判断 `workspace:*` 依赖语义。

## 安装

```sh
pnpm add -D @docs-islands/lattice typescript
```

如果某个 workspace package 自己的脚本中也要调用 `lattice`，请把它作为 workspace 依赖接入：

```json
{
  "devDependencies": {
    "@docs-islands/lattice": "workspace:*"
  }
}
```

## 快速开始

在仓库根目录创建 `lattice.config.mjs`：

```js
import { defineConfig } from '@docs-islands/lattice/config';

export default defineConfig({
  config: {
    roots: {
      graph: 'tsconfig.graph.json',
      typecheck: 'tsconfig.json',
    },
  },
  graph: {
    rules: {
      runtime: {
        deny: {
          refs: [
            {
              path: 'packages/core/tsconfig.internal.build.json',
              reason: 'runtime code must not depend on internal build boundaries',
            },
          ],
          deps: [
            {
              name: '@acme/internal',
              reason: 'runtime packages must not consume internal packages directly',
            },
          ],
        },
      },
    },
  },
  proof: {
    sidecarTargets: [
      {
        config: 'docs/tsconfig.json',
        label: 'docs vue typecheck',
        tool: 'vue-tsc',
      },
    ],
    allowlist: [
      {
        file: 'src/generated/runtime.d.ts',
        reason: 'Declaration-only runtime shim checked by a sidecar target.',
      },
    ],
  },
  packageChecks: {
    targets: [
      {
        name: '@acme/core',
        distDir: 'packages/core/dist',
        boundary: {
          ignoredExternalPackages: ['@acme/runtime-shim'],
        },
      },
    ],
  },
  pipelines: {
    typecheck: ['graph:check', 'proof:check', 'tsc:run'],
    package: ['package:check'],
  },
});
```

配置根脚本：

```json
{
  "scripts": {
    "typecheck": "lattice check typecheck"
  }
}
```

运行检查：

```sh
pnpm typecheck
pnpm exec lattice package check --package @acme/core
```

## CLI

```sh
lattice [--config lattice.config.mjs] [--mode mode] <command>
```

| 命令                                     | 说明                                                           |
| ---------------------------------------- | -------------------------------------------------------------- |
| `lattice check <pipeline>`               | 运行 `pipelines` 中的命名 pipeline。                           |
| `lattice paths generate`                 | 为产物导向的 `workspace:*` exports 生成兼容源码 paths。        |
| `lattice paths check`                    | 检查生成的兼容 paths 文件是否是最新状态。                      |
| `lattice graph check`                    | 校验 project references 和架构导入规则。                       |
| `lattice proof check`                    | 证明 build config 与本地 typecheck companion 和 IDE 路线一致。 |
| `lattice tsc`                            | 从当前 cwd 发现 typecheck 目标配置并运行 `tsc --noEmit`。      |
| `lattice package check`                  | 对发布产物运行配置的 publint、ATTW 和边界检查。                |
| `lattice package check --package <name>` | 按配置的 `name` 检查单个 package 目标。                        |
| `lattice package check --tool <tool>`    | 只运行一个 package 检查工具：`publint`、`attw` 或 `boundary`。 |

graph、proof、typecheck 和 package 检查都是只读的。`lattice paths generate` 会写入生成的配置文件；`lattice paths check` 只报告生成文件是否过期。`lattice paths apply` 保留为 `generate` 的兼容别名。

## TypeScript Check

`lattice tsc` 不会加载 `lattice.config.mjs`。它默认从 `process.cwd()/tsconfig.json` 出发，递归跟随普通 `tsconfig*.json` references，并对发现的每个类型检查目标执行 `tsc -p <config> --noEmit`。一个 config 没有 references 时是目标；有 references 但自己仍通过非空 `files`/`include` 或 TypeScript 默认 include 行为拥有源文件输入时，也是目标。带 references 且显式 `files: []`、没有有效 `include` 的 config 会被视为纯聚合器。可以用 `lattice tsc -p <path>` 指定其他 config 文件或 config 目录。相对 `-p` 会从当前命令 cwd 解析，绝对路径按原样使用。可以用 `--concurrency <n>` 限制并发 `tsc` 进程数。

typecheck route 会拒绝 `tsconfig*.build.json` 和 `tsconfig*.graph.json`，报告缺失的 referenced config 和成环的 references，并在找不到目标时失败。Vue/SFC 检查仍应保留在显式 `vue-tsc` 脚本或 pipeline sidecar 中。

## 配置

`lattice.config.mjs` 必须 default export 一个配置对象、配置对象的 Promise，或接收 `{ command, mode }` 的配置函数。推荐使用 `defineConfig(...)` 获得编辑器提示和类型导出。`--mode` 会传给配置函数；省略时使用 `process.env.NODE_ENV`，再回退到 `default`。

Lattice 会从加载到的配置文件位置向上查找 `pnpm-workspace.yaml`，用找到的目录作为 workspace root。下面所有配置相对路径都从这个推断出的 root 解析。

### `config`

跨策略共享的项目事实放在 `config`，让 graph、paths、proof 和 pipeline 使用同一组 root 与源码边界。

| 字段              | 说明                                                                                    |
| ----------------- | --------------------------------------------------------------------------------------- |
| `roots.graph`     | build graph 根 solution config，默认 `tsconfig.graph.json`。                            |
| `roots.typecheck` | IDE/typecheck 根 solution config，默认 `tsconfig.json`。                                |
| `source.include`  | 可选的源码覆盖 glob 覆盖项，默认包含 TS/TSX/CTS/MTS/declaration/JSON 文件。             |
| `source.exclude`  | 可选的源码排除 glob 或目录简写覆盖项，默认排除依赖、构建产物、coverage 和常见配置文件。 |

### `graph`

graph 检查会解析从 `config.roots.graph` 可达的 TypeScript project references，并检查每个项目中的 import。这是 build graph 路线：`tsconfig*.graph.json` 聚合 `tsconfig*.build.json` 叶子，用于 `tsc -b`、CI 和架构检查。通过 `workspace:*` 声明的 workspace package 是源码依赖，package `exports` 应该暴露源码入口。产物依赖不能再用 project reference 表达：本地构建产物使用 `link:`，已发布生产包使用 `catalog:` 或普通 semver。如果目标包是 `private: true`，它没有可消费的发布版本，产物消费者只能使用 `link:`。

如果 A 包通过 `workspace:*` 依赖 B 包，并且 A 的 `tsconfig*.build.json` reference 了 B，那么 TypeScript 仍然会按照 B 的 package exports 做模块解析。`tsc -b` 不会因为存在 project reference 就把产物 exports 自动改写成源码项目。如果 B 暴露的是 `./dist/index.js`，而 A 没有源码 `paths` 映射，`lattice graph check` 会直接失败并解释原因和修复方式。

graph 检查还会把 root graph 可达的每个 `tsconfig*.build.json` 与严格
同名的本地配置做最终语义对比：

- `tsconfig.build.json` 对比 `tsconfig.json`
- `tsconfig.lib.build.json` 对比 `tsconfig.lib.json`
- `tsconfig.test.build.json` 对比 `tsconfig.test.json`
- `tools`、`types` 等其他后缀遵循同一规则

build config 必须与本地配置保持相同的类型检查 `compilerOptions`，并且
build 会 emit 的每个文件都必须被 companion typecheck config 覆盖。
`composite`、`noEmit`、`declaration`、`outDir`、`rootDir`、
`tsBuildInfoFile` 等 build-only 选项允许不同。`paths` 和 `baseUrl`
属于模块解析策略，不参与对比。

graph rules 还可以做基于 label 的包层治理。`tsconfig*.build.json` 可以用
`"lattice": "runtime"` 声明一个 label，然后
`graph.rules.runtime.deny` 禁止它访问指定 build ref 或 workspace package。
`refs[].path`、`deps[].name` 和每个 `reason` 都是必填项。Lattice 只把这些
当作 graph/package 边界规则；DOM、Node builtin 等源码级运行时 API 约束更适合
放在 ESLint 中。

| 字段    | 说明                                                                                        |
| ------- | ------------------------------------------------------------------------------------------- |
| `rules` | 基于 label 的 deny 规则，约束 build ref（`deny.refs`）和 workspace package（`deny.deps`）。 |

### `paths`

大多数仓库不需要 generated `paths`：让 workspace package exports 指向源码入口，然后用 `workspace:*` 加 project reference 表达源码依赖即可。`paths` 命令是为兼容 exports 仍指向构建产物的 monorepo 提供的过渡工具。

`lattice paths generate` 会扫描 graph 管理的 import。当某个 `workspace:*` 依赖同时被 importing build config reference，但 TypeScript 通过 package exports 解析到了构建产物时，它会在 importing build config 旁边写入 `tsconfig.graph.paths.generated.json`，把对应 package exports 映射回源码文件。它不会修改任何 `tsconfig*.build.json`；请按命令输出提示，手动把生成文件放到对应 `extends` 数组的第一项。

| 字段                  | 说明                                                                                                     |
| --------------------- | -------------------------------------------------------------------------------------------------------- |
| `generatedFileName`   | 生成配置文件名，默认 `tsconfig.graph.paths.generated.json`。                                             |
| `generatedFileMarker` | 用于识别可刷新或可删除生成文件的标记。                                                                   |
| `conditionPriority`   | 选择源码目标时使用的 package export condition 优先级，默认从 `source`、`development` 再到 `types` 开始。 |
| `sourceExtensions`    | 将产物 exports 映射回源码时尝试的源码扩展名。                                                            |
| `artifactDirectories` | 被视为构建产物的目录前缀，例如 `dist`、`build`、`lib`、`esm`、`cjs`、`out`。                             |

### `proof`

proof 检查使用两条显式 TypeScript 路线。build graph 路线从
`config.roots.graph` 出发，必须到达所有 `tsconfig*.build.json`。IDE/typecheck
路线从 `config.roots.typecheck` 出发，只允许引用普通 `tsconfig*.json`
文件。package scripts 不作为 proof 的事实来源。

对于每个发现的 `tsconfig*.build.json`，proof 会检查严格同名的本地配置是否
存在、解析后的文件集合和类型检查语义是否一致，并确认该本地配置能从
IDE/typecheck 路线到达。`composite`、`noEmit`、`outDir`、`rootDir`、
`tsBuildInfoFile` 等 build-only 选项允许不同。
proof 还会扫描 `config.source`，要求每个匹配到的源码文件被 root graph、
sidecar target 或 allowlist entry 覆盖。

| 字段             | 说明                                                         |
| ---------------- | ------------------------------------------------------------ |
| `sidecarTargets` | 在 `tsc -b` 外额外覆盖的配置，例如 `vue-tsc` 项目。          |
| `allowlist`      | 显式允许在 graph/sidecar 覆盖外的文件，每项都必须写 reason。 |

### `packageChecks`

package checks 会扫描配置 dist 目录下的构建后 package 产物。

| 字段                                         | 说明                                                                   |
| -------------------------------------------- | ---------------------------------------------------------------------- |
| `targets[].name`                             | `--package` 使用的目标名，通常是 package name。                        |
| `targets[].distDir`                          | 包含构建产物和 `package.json` 的目录。                                 |
| `targets[].checks`                           | 启用的工具：`publint`、`attw` 和/或 `boundary`，默认三项全跑。         |
| `targets[].publint.strict`                   | publint 是否使用 strict 模式，默认 `true`。                            |
| `targets[].attw.profile`                     | ATTW profile：`strict`、`node16` 或 `esm-only`，默认 `esm-only`。      |
| `targets[].boundary.environment`             | 固定环境，或将文件分类为 `browser`、`node` 或其他字符串的函数。        |
| `targets[].boundary.ignoredExternalPackages` | 即使没有列在构建后 manifest dependencies 中也允许的额外 package root。 |

默认情况下，`node/` 或 `plugin/` 下的文件被视为 Node 产物，其他文件被视为 browser/runtime 产物。

### `pipelines`

Pipeline 可以组合内置任务和命令步骤：

```js
pipelines: {
  typecheck: [
    'graph:check',
    'proof:check',
    'tsc:run',
  ],
}
```

内置任务字符串：

- `graph:check`
- `proof:check`
- `package:check`
- `tsc:run`

命令步骤默认在推断出的 workspace root 下运行，并继承 `process.env`。可以用 `cwd` 和 `env` 覆盖。

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
      - run: pnpm exec lattice check typecheck
```

## API

```ts
import { defineConfig, loadConfig } from '@docs-islands/lattice';

export default defineConfig({
  pipelines: {
    typecheck: ['graph:check'],
  },
});

const config = await loadConfig();
```

大多数用户只需要 `defineConfig(...)`。`loadConfig(...)` 主要面向自定义 wrapper 和测试。

## 设计说明

- Lattice 是治理工具，不替代 `tsc`、`vue-tsc`、测试运行器或发布工具。
- Lattice 不发布包。发布自动化应放在项目自己的脚本里，并把 `lattice check publish` 作为 gate。
- Lattice 强调显式策略。优先把规则写进 `lattice.config.mjs`，而不是依赖隐式约定。
- 只读检查和会写文件的命令有意分离。

## License

MIT
