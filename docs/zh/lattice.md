# @docs-islands/lattice

`@docs-islands/lattice` 是一个面向 TypeScript monorepo 的架构治理 CLI。它的核心目标不是替代 TypeScript，而是把大型仓库中分散的 TypeScript project references、源码类型检查、构建图边界、兼容路径生成、发布产物校验和自定义流水线收敛到一个显式配置文件中。

对于小型项目，你可能只需要 `tsc --noEmit`。但当仓库开始包含多个 workspace package、Node/runtime/client 多环境代码、docs/playground/smoke 项目、Vue SFC、构建工具脚本、发布产物检查时，单一 tsconfig 往往无法同时满足 IDE、源码检查、`tsc -b`、包发布和消费者验证。Lattice 就是为这类场景准备的。

## 适用场景

Lattice 适合以下项目：

- 使用 pnpm workspace 管理多个包。
- 使用 TypeScript project references 或准备迁移到 `tsc -b` 构建图。
- 希望约束生产代码、工具代码、测试代码之间的依赖方向。
- 同时维护 browser/client runtime 和 Node/server runtime。
- 希望在 CI 中证明所有源码文件都被 graph、checker routes 或 allowlist 覆盖。
- 希望发布前检查 dist package 的 package exports、类型解析和运行时 import 边界。
- 有 docs、playground、smoke、Vue SFC 等无法完全放进普通 `tsc -b` 的项目。

Lattice 不适合以下目标：

- 直接替代 bundler，例如 Rolldown、Rollup、Vite、tsup。
- 直接替代 `tsc` 或 `vue-tsc`。
- 自动发布 npm 包。
- 作为隐藏 preset 管理项目。Lattice 倾向于显式配置，所有规则都应写在 `lattice.config.mjs` 中。

## 核心概念

### 1. Build graph route

build graph route 是原生 TypeScript build mode 使用的路线。它默认从根 `tsconfig.graph.json` 出发，约定最终指向多个 `tsconfig*.build.json` 叶子项目。

这一层用于：

- `tsc -b` 构建/检查声明图；
- 校验 project references 是否与真实 import 一致；
- 约束 production、tools、tests、runtime-client、runtime-node 等边界；
- 发现错误的 workspace source dependency 和 package exports 组合。

推荐命名：

```text
tsconfig.graph.json               # 根或包级 graph 聚合器
tsconfig.lib.build.json           # 生产源码 build leaf
tsconfig.tools.build.json         # 工具/构建脚本 build leaf
tsconfig.test.build.json          # 测试 build leaf
```

### 2. Typecheck route

typecheck route 是编辑器和普通 `tsc --noEmit` 使用的路线。它通常从根 `tsconfig.json` 出发，最终指向普通本地配置，例如 `tsconfig.lib.json`、`tsconfig.tools.json`、`tsconfig.test.json`。

这一层用于：

- IDE 体验；
- 普通源码 typecheck；
- 与 build leaf 做同名 companion 对比；
- 让每个 build leaf 都有对应的严格本地检查配置。

推荐配对：

```text
tsconfig.lib.build.json    <->    tsconfig.lib.json
tsconfig.tools.build.json  <->    tsconfig.tools.json
tsconfig.test.build.json   <->    tsconfig.test.json
```

### 3. Source dependency 与 artifact dependency

Lattice 会根据 package manifest 的依赖协议区分依赖语义。

`workspace:*` 表示源码依赖：

- 应该通过 TypeScript project reference 表达；
- package exports 应尽量指向源码入口；
- importing project 应 reference 被导入源码所属的 build leaf。

`link:`、`file:`、`catalog:` 或普通 semver 表示产物依赖：

- 通常不应该建 project reference；
- 应视为已经构建或已发布的 artifact；
- 发布产物应通过 package checks 和 consumer checks 验证。

这个区分很重要。TypeScript project reference 不会自动改写 package exports。即使 A reference 了 B，如果 A 使用 `import '@scope/b'`，TypeScript 仍然会根据 B 的 package exports 解析入口。因此，当 B 的 workspace exports 指向 `dist`，但 A 又想把 B 当源码依赖时，就需要改 exports 或使用 Lattice 的 generated paths 兼容机制。

### 4. Package artifact checks

source graph 通过，只能证明源码图层相对一致；它不能证明消费者安装到的 package 没问题。

`lattice package check` 针对 `packageChecks.targets[].outDir` 下的构建产物运行检查：

- `publint`：检查 package manifest、exports、files 等发布规范问题；
- `attw`：用 Are The Types Wrong 检查类型解析问题；
- `boundary`：扫描构建后的 `.js` import，确认依赖声明、self exports、Node/browser runtime 边界匹配。

发布前必须先构建 dist，再运行 package checks。

## 安装

在 workspace 根目录执行：

```sh
pnpm add -D @docs-islands/lattice typescript
```

如果某个 workspace package 自己的 `package.json#scripts` 也需要调用 `lattice`，建议在该 package 的 `devDependencies` 中声明：

```json
{
  "devDependencies": {
    "@docs-islands/lattice": "workspace:*"
  }
}
```

## 最小配置

在 workspace 根目录创建 `lattice.config.mjs`：

```js
import { defineConfig } from '@docs-islands/lattice/config';

export default defineConfig({
  config: {
    checkers: {
      typescript: {
        preset: 'tsc',
        routes: {
          typecheck: 'tsconfig.json',
          build: 'tsconfig.graph.json',
        },
      },
    },
  },
  pipelines: {
    typecheck: ['graph:check', 'proof:check', 'tsc:run', 'tsc:build'],
  },
});
```

添加根脚本：

```json
{
  "scripts": {
    "typecheck": "lattice check typecheck"
  }
}
```

执行：

```sh
pnpm typecheck
```

## Workspace 模型

Lattice 会从当前工作目录向上查找 `pnpm-workspace.yaml`，由此确定要治理的
workspace root。默认情况下，它只会从当前目录向上查找到该 workspace root 为止，
加载最近的 `lattice.config.mjs`。如果传入 `--config`，该参数可以指向任意相对或
绝对路径，但解析后的配置模块绝对路径仍必须位于这个被治理的 pnpm workspace 内部。
所有配置中的相对路径都会从这个 workspace root 解析。

## 推荐 TypeScript 配置结构

一个典型 workspace 可以这样组织：

```text
.
├─ tsconfig.json
├─ tsconfig.graph.json
├─ tsconfig.lib.graph.json
├─ tsconfig.graph.base.json
├─ lattice.config.mjs
└─ packages/
   └─ core/
      ├─ tsconfig.json
      ├─ tsconfig.graph.json
      ├─ tsconfig.lib.json
      ├─ tsconfig.lib.build.json
      ├─ tsconfig.tools.json
      ├─ tsconfig.tools.build.json
      ├─ tsconfig.test.json
      └─ tsconfig.test.build.json
```

根 `tsconfig.graph.base.json` 可以只放 build leaf 需要的 build-mode 选项：

```jsonc
{
  "compilerOptions": {
    "composite": true,
    "incremental": true,
    "noEmit": false,
    "declaration": true,
    "emitDeclarationOnly": true,
    "declarationMap": false,
  },
}
```

本地类型检查配置负责严格语义：

```jsonc
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ESNext"],
    "types": ["node"],
  },
  "include": ["src/"],
}
```

build leaf 继承本地配置和 graph base，只补充 build 输出路径与 references：

```jsonc
{
  "extends": ["./tsconfig.lib.json", "../../tsconfig.graph.base.json"],
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "./.tsbuild",
    "tsBuildInfoFile": "./.tsbuild/lib.tsbuildinfo",
  },
  "references": [
    {
      "path": "../utils/tsconfig.lib.build.json",
    },
  ],
}
```

## 配置详解

### `config.checkers`

```js
config: {
  checkers: {
    typescript: {
      preset: 'tsc',
      routes: {
        typecheck: 'tsconfig.json',
        build: 'tsconfig.graph.json',
      },
    },
    vue: {
      preset: 'vue-tsc',
      routes: {
        typecheck: 'tsconfig.vue.json',
        build: 'tsconfig.vue.graph.json',
      },
    },
    svelte: {
      preset: 'svelte-check',
      routes: {
        typecheck: 'tsconfig.svelte.json',
      },
    },
  },
}
```

`config.checkers` 是 TypeScript 和 UI 框架检查能力的唯一入口。没有 `routes` 的 checker 会被忽略；`routes: {}` 是非法配置。`routes.typecheck` 参与 `lattice tsc` / `tsc:run`；`routes.build` 参与 `lattice tsc --build` / `tsc:build`。

内置 preset 可以省略 `extensions`。默认值分别是：`tsc` 使用 `.ts`、`.tsx`、`.cts`、`.mts`、`.d.ts`、`.d.cts`、`.d.mts`、`.json`；`vue-tsc` 使用 `.vue`；`svelte-check` 使用 `.svelte`。显式填写 `extensions` 时会覆盖 preset 默认值。

### `config.source`

```js
config: {
  source: {
    include: ['**/*.{ts,tsx,cts,mts}', '**/*.d.{ts,cts,mts}', '**/*.json'],
    exclude: [
      'node_modules',
      'dist',
      '.git',
      '.tsbuild',
      'coverage',
      '**/tsconfig*.json',
      '**/package.json',
    ],
  },
}
```

如果没有填写 `source.include`，`proof:check` 会从所有 active checker 的 extensions 推导有效 source boundary。如果填写了 `source.include`，则完全以用户配置为准，不再自动合并 checker extensions。`source.exclude` 永远只从有效 source boundary 中过滤，它本身不决定哪些模块有效。

### `graph.rules`

```js
graph: {
  rules: {
    'runtime-client': {
      deny: {
        refs: [
          {
            path: 'packages/app/src/node/tsconfig.lib.build.json',
            reason: 'client runtime must not depend on node runtime',
          },
        ],
        deps: [
          {
            name: '@acme/node-only',
            reason: 'client runtime must not consume node-only packages',
          },
        ],
      },
    },
  },
}
```

在 build leaf 中声明 label：

```jsonc
{
  "lattice": "runtime-client",
  "extends": ["./tsconfig.lib.json", "../../tsconfig.graph.base.json"],
  "references": [],
}
```

当该项目 reference 或 import 了被 deny 的目标时，`lattice graph check` 会失败并输出 reason。

### `paths`

```js
paths: {
  generatedFileName: 'tsconfig.graph.paths.generated.json',
  conditionPriority: ['source', 'development', 'types'],
  artifactDirectories: ['dist', 'build', 'lib', 'esm', 'cjs', 'out'],
}
```

使用场景：某个 `workspace:*` 依赖在 package exports 中仍指向 `dist`，但在 build graph 中又被当作源码依赖。此时可以运行：

```sh
pnpm exec lattice paths generate
```

Lattice 会生成 `tsconfig.graph.paths.generated.json`，并提示你把它加入相关 build config 的 `extends` 第一项：

```jsonc
{
  "extends": [
    "./tsconfig.graph.paths.generated.json",
    "./tsconfig.lib.json",
    "../../tsconfig.graph.base.json",
  ],
}
```

建议把 generated paths 作为迁移桥梁，而不是长期默认设计。长期方案仍然是让 workspace source dependency 的 package exports 指向源码入口。

### Checker coverage

```js
config: {
  checkers: {
    vue: {
      preset: 'vue-tsc',
      routes: {
        typecheck: 'docs/tsconfig.json',
      },
    },
  },
}
```

Checker routes 用来覆盖那些不进入 TypeScript build graph，但仍由框架感知工具验证的文件。典型例子是 Vue SFC、Svelte 组件、VitePress docs、主题项目、特殊 fixture 项目等。

### `proof.allowlist`

```js
proof: {
  allowlist: [
    {
      file: 'src/generated/runtime.d.ts',
      reason: 'Generated declaration-only runtime shim copied into dist.',
    },
  ],
}
```

allowlist 是最后手段。每个条目都必须解释为什么安全。建议在 code review 中严格审查新增 allowlist。

### `packageChecks.targets`

```js
packageChecks: {
  targets: [
    {
      name: '@acme/core',
      outDir: 'packages/core/dist',
      checks: ['publint', 'attw', 'boundary'],
      publint: {
        strict: true,
      },
      attw: {
        profile: 'esm-only',
      },
      boundary: {
        environment: (file) => file.startsWith('node/') ? 'node' : 'browser',
        ignoredExternalPackages: ['@acme/runtime-shim'],
      },
    },
  ],
}
```

`outDir` 必须指向已经构建好的、可发布的 package 输出目录，里面应包含构建后的 `package.json`、JS 文件和类型声明。

运行全部 package checks：

```sh
pnpm exec lattice package check
```

运行单个 package：

```sh
pnpm exec lattice package check --package @acme/core
```

只运行某个工具：

```sh
pnpm exec lattice package check --package @acme/core --tool publint
pnpm exec lattice package check --package @acme/core --tool attw
pnpm exec lattice package check --package @acme/core --tool boundary
```

临时覆盖 ATTW profile：

```sh
pnpm exec lattice package check --package @acme/core --attw-profile strict
```

### `pipelines`

```js
pipelines: {
  typecheck: [
    'graph:check',
    'proof:check',
    'tsc:run',
    'tsc:build',
  ],
  package: [
    {
      type: 'command',
      command: 'pnpm',
      args: ['build'],
    },
    'package:check',
  ],
}
```

pipeline 可以包含两类步骤：

- 内置任务：`graph:check`、`proof:check`、`tsc:run`、`tsc:build`、`package:check`；
- 命令步骤：用 `{ type: 'command', command, args, cwd, env }` 表达。

命令步骤默认在 workspace root 执行，并继承 `process.env`。

## CLI 参考

### `lattice check <pipeline>`

运行 `lattice.config.mjs#pipelines` 中的命名 pipeline。

```sh
pnpm exec lattice check typecheck
pnpm exec lattice check package
pnpm exec lattice check publish
```

### `lattice graph check`

检查 build graph 的 architecture policy。

```sh
pnpm exec lattice graph check
```

常见失败原因：

- 某个源码 import 没有对应 project reference；
- production build leaf 引用了 test/tools leaf；
- 带有 `lattice` label 的项目违反了 `graph.rules`；
- `workspace:*` dependency 通过 exports 解析到了构建产物；
- client/shared runtime 导入了不允许的 runtime 边界。

### `lattice proof check`

证明 build graph route、typecheck route 和 source boundary 是一致的。

```sh
pnpm exec lattice proof check
```

常见失败原因：

- build leaf 没有同名 local config；
- local config 不在 root typecheck route 中；
- build leaf 和 local config 的文件集合不一致；
- 某个源码文件既不在 graph 中，也不在 checker routes/allowlist 中。

### `lattice paths generate`

生成 source paths 兼容配置。

```sh
pnpm exec lattice paths generate
```

如果 CI 需要保证 generated 文件是最新的：

```sh
pnpm exec lattice paths check
```

### `lattice tsc`

运行已配置的 checker `typecheck` routes。传入 `-p` 时，从显式 TypeScript config 或目录开始运行普通 `tsc --noEmit` targets。

```sh
pnpm exec lattice tsc
pnpm exec lattice tsc -p packages/core/tsconfig.json
pnpm exec lattice tsc --concurrency 4
```

`lattice tsc --build` 会运行已配置的 checker `build` routes。

```sh
pnpm exec lattice tsc --build
```

### `lattice package check`

检查构建后的 package output。

```sh
pnpm exec lattice package check
pnpm exec lattice package check --package @acme/core
pnpm exec lattice package check --tool boundary
```

运行前请先构建对应 package，否则 `outDir` 中没有发布产物会导致检查失败。

## 推荐工作流

### 本地开发

```sh
pnpm exec lattice tsc
pnpm exec lattice graph check
```

### PR 检查

```sh
pnpm exec lattice check typecheck
```

建议 `typecheck` pipeline 包含：

1. 构建 graph 检查前必须存在的内部工具包；
2. `graph:check`；
3. `proof:check`；
4. `tsc:run`；
5. 需要 build-mode 校验时运行 `tsc:build`。

### 发布前检查

```sh
pnpm build
pnpm exec lattice package check
pnpm exec lattice check publish
```

建议 `publish` pipeline 至少包含：

- `graph:check`；
- `proof:check`；
- 构建所有待发布包；
- `package:check`；
- consumer docs/playground/smoke typecheck；
- `npm pack --dry-run` 或等价检查。

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

  package-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20.19.0
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - run: pnpm exec lattice package check
```

## 最佳实践

### 1. 不要把所有源码放进一个巨大的 tsconfig

大项目中，一个 package 往往同时包含 production source、build tools、tests、fixtures 和 docs。建议按职责拆分：

- `lib`：生产源码；
- `tools`：构建脚本、release 脚本、rollup/rolldown/vite 配置；
- `test`：单测与测试工具；
- `runtime-client`：浏览器运行时代码；
- `runtime-node`：Node 运行时代码；
- `runtime-shared`：两端共享代码。

### 2. build leaf 只做 build-mode 差异

`tsconfig*.build.json` 应继承同名 local config，尽量只增加：

- `composite`；
- `incremental`；
- `declaration` / `emitDeclarationOnly`；
- `rootDir`；
- `outDir`；
- `tsBuildInfoFile`；
- direct `references`。

不要在 build leaf 中偷偷改 `strict`、`types`、`lib` 等类型语义选项。

### 3. 优先修 package exports，而不是长期依赖 generated paths

generated paths 是兼容桥梁。长期方案应让 workspace source dependency 的 package exports 直接指向源码入口，发布构建时再把源码 exports 改写为 dist exports。

### 4. source check 与 package check 都要跑

`graph:check` 与 `proof:check` 保护源码架构；`package:check` 保护消费者安装到的产物。二者不能相互替代。

### 5. allowlist 必须少而明确

每个 allowlist 都应该能回答：

- 为什么这个文件不适合纳入 graph？
- 它由哪个 checker route、构建步骤或运行时机制覆盖？
- 如果它失效，CI 会在哪里失败？

## 常见问题

### `lattice tsc` 如何选择目标？

默认情况下，`lattice tsc` 会加载 `lattice.config.mjs`，并运行所有声明了 `routes.typecheck` 的 active checker。传入 `-p` 时，它会选择显式 TypeScript config 或目录，并从那里运行普通 `tsc --noEmit` targets。

### 为什么 package checks 需要先 build？

package checks 检查的是 `outDir` 下的发布产物，不是源码目录。如果没有先构建，`outDir/package.json`、JS 文件或 d.ts 文件可能不存在，检查结果没有意义。

### 为什么 workspace exports 指向 dist 会导致 graph 问题？

`tsc -b` 的 project reference 只告诉 TypeScript 构建顺序和声明重定向，不会自动改写 package exports。源码 import package name 时，TypeScript 仍按 package manifest 解析。如果 exports 指向 dist，source graph 就会混入 artifact 解析。

### Vue SFC 应该放进 graph 吗？

通常不建议直接放进普通 `tsc -b` graph。推荐把 Vue/VitePress/SFC 项目放到 `config.checkers.<name>.routes`，使用 `vue-tsc` preset，再由 `tsc:run` 和 `tsc:build` 调度对应 routes。

### 什么时候使用 `--mode`？

当 `lattice.config.mjs` 导出函数并根据环境返回不同配置时使用：

```js
export default defineConfig(({ mode }) => ({
  pipelines: {
    typecheck: mode === 'ci' ? ['graph:check', 'proof:check', 'tsc:run', 'tsc:build'] : ['tsc:run'],
  },
}));
```

运行：

```sh
pnpm exec lattice --mode ci check typecheck
```

## 发布维护者检查清单

在发布 `@docs-islands/lattice` 自身前，建议确认：

- `package.json#private` 已移除或为 `false`；
- `package.json#files` 包含需要发布的 README、bin 和 dist 文件；
- `pnpm build` 已生成 dist；
- dist package.json 的 `exports`、`types`、`bin` 指向构建后文件；
- `pnpm test` 通过；
- `pnpm typecheck` 或等价 source graph 检查通过；
- `pnpm exec lattice package check --package @docs-islands/lattice` 或等价检查通过；
- `npm pack --dry-run` 输出中没有遗漏关键文件；
- 新版本 README 与 CLI 实现同步。

## 术语表

- **build leaf**：被 `tsc -b` 实际构建或检查的 `tsconfig*.build.json`。
- **graph aggregator**：只包含 `files: []` 和 `references` 的 graph 聚合配置。
- **local companion config**：与 build leaf 同名的普通 typecheck config，例如 `tsconfig.lib.json`。
- **checker route**：由 `tsc`、`vue-tsc` 或 `svelte-check` 等工具覆盖的 `typecheck` 或 `build` route。
- **artifact dependency**：通过 `link:`、`file:`、`catalog:` 或 semver 消费的构建/发布产物依赖。
- **source dependency**：通过 `workspace:*` 消费并应纳入 TypeScript project references 的源码依赖。

## License

MIT
