# limina

`limina` 是一个面向 TypeScript monorepo 的架构治理 CLI。它的核心目标不是替代 TypeScript，而是把大型仓库中分散的 TypeScript project references、源码类型检查、构建图边界、兼容路径生成、发布产物校验和自定义流水线收敛到一个显式配置文件中。

对于小型项目，你可能只需要 `tsc --noEmit`。但当仓库开始包含多个 workspace package、Node/runtime/client 多环境代码、docs/playground/smoke 项目、Vue SFC、构建工具脚本、发布产物检查时，单一 tsconfig 往往无法同时满足 IDE、源码检查、`tsc -b`、包发布和消费者验证。Limina 就是为这类场景准备的。

## 适用场景

Limina 适合以下项目：

- 使用 pnpm workspace 管理多个包。
- 使用 TypeScript project references 或准备迁移到 `tsc -b` 构建图。
- 希望约束生产代码、工具代码、测试代码之间的依赖方向。
- 同时维护 browser/client runtime 和 Node/server runtime。
- 希望在 CI 中证明所有源码文件都被 checker entry 或 allowlist 覆盖。
- 希望发布前检查 dist package 的 package exports、类型解析和运行时 import 边界。
- 有 docs、playground、smoke、Vue SFC 等无法完全放进普通 `tsc -b` 的项目。

Limina 不适合以下目标：

- 直接替代 bundler，例如 Rolldown、Rollup、Vite、tsup。
- 直接替代 `tsc` 或 `vue-tsc`。
- 自动发布 npm 包。
- 作为隐藏 preset 管理项目。Limina 倾向于显式配置，所有规则都应写在 `limina.config.mjs` 中。

## 核心概念

### 1. Checker entry

checker entry 是配置在 `config.checkers.<name>.entry` 上的唯一入口。它通常指向一个 `tsconfig*.build.json` graph 聚合配置，并最终到达多个 `tsconfig*.dts.json` 声明叶子项目。

这一层用于：

- 在 checker 支持 build 执行时，用 `tsc -b` 构建/检查声明图；
- 从同一个可达声明叶子图推导 `checker:typecheck` 目标；
- 校验 project references 是否与真实 import 一致；
- 约束 production、tools、tests、runtime-client、runtime-node 等边界；
- 发现错误的 workspace source dependency 和 package exports 组合。

推荐命名：

```text
tsconfig.build.json               # 根或包级 graph 聚合器
tsconfig.lib.dts.json           # 生产声明叶子
tsconfig.tools.dts.json         # 工具/构建脚本声明叶子
tsconfig.test.dts.json          # 测试声明叶子
```

### 2. 声明叶子与 local companion

每个可达的 `tsconfig*.dts.json` leaf 都应该拥有严格的普通 typecheck companion。`checker:typecheck` 会对这些 companion 执行 no-emit 检查。

推荐配对：

```text
tsconfig.lib.dts.json    <->    tsconfig.lib.json
tsconfig.tools.dts.json  <->    tsconfig.tools.json
tsconfig.test.dts.json   <->    tsconfig.test.json
```

根 `tsconfig.json` 仍然可以服务 IDE 和本地开发。某个目录只有一个普通类型环境时，应直接用 `tsconfig.json` 作为 local leaf；某个目录有多个普通类型环境时，`tsconfig.json` 应该是只包含 `files: []` 和 `references` 的纯聚合器。

一旦 `tsconfig.json` 包含 `references`，它就必须是纯聚合器：不能有 `include`、`compilerOptions`、`extends`，也不能包含 emit 或 `noEmit` 设置。一旦 `tsconfig.json` 包含 `include` 或 `files` 这类源码入口，它就是 leaf，并且不能再包含 `references`。

### 3. Source dependency 与 artifact dependency

Limina 会根据 package manifest 的依赖协议区分依赖语义。

`workspace:*` 表示源码依赖：

- 应该通过 TypeScript project reference 表达；
- package exports 应尽量指向源码入口；
- importing project 应 reference 被导入源码所属的声明叶子。

`link:`、`file:`、`catalog:` 或普通 semver 表示产物依赖：

- 通常不应该建 project reference；
- 应视为已经构建或已发布的 artifact；
- 发布产物应通过 package checks 和 consumer checks 验证。

这个区分很重要。TypeScript project reference 不会自动改写 package exports。即使 A reference 了 B，如果 A 使用 `import '@scope/b'`，TypeScript 仍然会根据 B 的 package exports 解析入口。因此，当 B 的 workspace exports 指向 `dist`，但 A 又想把 B 当源码依赖时，就需要改 exports 或使用 Limina 的 generated paths 兼容机制。

### 4. Package artifact checks

source graph 通过，只能证明源码图层相对一致；它不能证明消费者安装到的 package 没问题。

`limina package check` 针对 `packageChecks.targets[].outDir` 下的构建产物运行检查：

- `publint`：检查 package manifest、exports、files 等发布规范问题；
- `attw`：用 Are The Types Wrong 检查类型解析问题；
- `boundary`：扫描构建后的 `.js` import，确认依赖声明、self exports、Node/browser runtime 边界匹配。

发布前必须先构建 dist，再运行 package checks。

## 安装

在 workspace 根目录执行：

```sh
pnpm add -D limina typescript
```

如果某个 workspace package 自己的 `package.json#scripts` 也需要调用 `limina`，建议在该 package 的 `devDependencies` 中声明：

```json
{
  "devDependencies": {
    "limina": "workspace:*"
  }
}
```

## 快速初始化

对于尚未采用 Limina 声明图语义的 pnpm monorepo，可以从 workspace 内任意目录运行：

```sh
pnpm exec limina init
```

`limina init` 会从当前目录向上找到最近的 `pnpm-workspace.yaml`，展示 workspace 根路径和根 package 名称并要求确认。自动化或非交互环境中使用：

```sh
pnpm exec limina init --yes
```

`--yes` 等同于确认根目录、创建缺失根 `package.json`，以及覆盖已有的 `limina.config.mjs` 或冲突的 `limina:check` 脚本。非 TTY 环境没有 `--yes` 时，命令会在需要确认处失败。

初始化过程会：

- 发现 pnpm workspace packages，并扫描普通 `tsconfig*.json` 类型检查配置；
- 为每个合法 leaf 生成配对的 `tsconfig[.<scope>].dts.json`，将声明输出放入同目录的 `.limina/`；
- 用每个 leaf 的 TypeScript `compilerOptions` 解析真实源码 import，包括 workspace package import、跨 leaf 相对 import 和 `#imports`；
- 当解析目标由另一个 leaf 管辖时，为导入 leaf 添加 project reference；同一目标会去重，并且不会生成 self-reference；
- 为存在声明 leaf 的 workspace 生成 `tsconfig.build.json`，并在根目录生成引用这些聚合器和根自有 leaves 的 `tsconfig.build.json`；
- 生成 `limina.config.mjs`，并向根 `package.json` 添加 `limina:check` 脚本和缺少的 `limina` 开发依赖。

空的聚合器不会写入磁盘：如果某个 workspace 或根目录最终没有任何实际 `references`，对应的 `tsconfig.build.json` 不会生成。

初始化会保守地拒绝以下输入，而不是覆盖或迁移它们：

- 仓库中已经存在 `tsconfig*.build.json` 或 `tsconfig*.dts.json`，因为这些是 init 管理的保留输出名；
- `tsconfig.json` 同时拥有 `references` 和实际源码文件；
- `tsconfig.<scope>.json` 带有 `references`；
- `workspace:*` import 经 TypeScript 解析后无法落入任何普通 `tsconfig*.json` leaf，例如入口解析到了未被源码图管辖的 `dist` 声明文件。

完成后执行：

```sh
pnpm i
pnpm limina:check
```

只有 init 新增了依赖或创建了根 `package.json` 时才需要先运行 `pnpm i`。

## 最小配置

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

执行：

```sh
pnpm typecheck
```

## Workspace 模型

Limina 会从当前工作目录向上查找 `pnpm-workspace.yaml`，由此确定要治理的
workspace root。默认情况下，它只会从当前目录向上查找到该 workspace root 为止，
加载最近的 `limina.config.mjs`。如果传入 `--config`，该参数可以指向任意相对或
绝对路径，但解析后的配置模块绝对路径仍必须位于这个被治理的 pnpm workspace 内部。
所有配置中的相对路径都会从这个 workspace root 解析。

## 推荐 TypeScript 配置结构

一个典型 workspace 可以这样组织：

```text
.
├─ tsconfig.json
├─ tsconfig.build.json
├─ tsconfig.lib.build.json
├─ tsconfig.dts.base.json
├─ limina.config.mjs
└─ packages/
   └─ core/
      ├─ tsconfig.json
      ├─ tsconfig.build.json
      ├─ tsconfig.lib.json
      ├─ tsconfig.lib.dts.json
      ├─ tsconfig.tools.json
      ├─ tsconfig.tools.dts.json
      ├─ tsconfig.test.json
      └─ tsconfig.test.dts.json
```

根 `tsconfig.dts.base.json` 可以只放声明叶子需要的 build-mode 选项：

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

声明叶子继承本地配置和 dts base，只补充声明输出路径与 references：

```jsonc
{
  "extends": ["./tsconfig.json", "../../tsconfig.dts.base.json"],
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "./.tsbuild",
    "tsBuildInfoFile": "./.tsbuild/lib.tsbuildinfo",
  },
  "references": [
    {
      "path": "../utils/tsconfig.lib.dts.json",
    },
  ],
}
```

## 配置详解

### `config.checkers`

```js
const liminaConfig = {
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
};
```

`config.checkers` 是 TypeScript 和 UI 框架检查能力的唯一入口。每个已配置的 checker 都必须声明 `entry`。`entry` 必须是从 workspace root 解析的非空字符串。`routes`、`routes.typecheck` 和 `routes.build` 都是非法配置。

`checker:build` 会从每个支持 build 执行的已配置 checker entry 出发。`checker:typecheck` 会从同一个 entry 出发，发现可达的 `tsconfig*.dts.json` leaf，并对配对的本地 companion 执行该 checker 的 no-emit 检查。

内置 preset 可以省略 `extensions`。默认值分别是：`tsc` 使用 `.ts`、`.tsx`、`.cts`、`.mts`、`.d.ts`、`.d.cts`、`.d.mts`、`.json`；`vue-tsc` 使用 `.vue`；`svelte-check` 使用 `.svelte`。显式填写 `extensions` 时会覆盖 preset 默认值。

### `config.source`

```js
const liminaConfig = {
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
  },
};
```

如果没有填写 `source.include`，`proof:check` 会从所有已配置 checker 的 extensions 推导有效 source boundary。如果填写了 `source.include`，则完全以用户配置为准，不再自动合并 checker extensions。`source.exclude` 永远只从有效 source boundary 中过滤，它本身不决定哪些模块有效。

### `graph.rules`

```js
const liminaConfig = {
  graph: {
    rules: {
      'runtime-client': {
        deny: {
          refs: [
            {
              path: 'packages/app/src/node/tsconfig.lib.dts.json',
              reason: 'client runtime must not depend on node runtime',
            },
          ],
          deps: [
            {
              name: '@acme/node-only',
              reason: 'client runtime must not consume node-only packages',
            },
            {
              name: 'node:*',
              reason: 'client runtime must not import Node builtins',
            },
            {
              name: '#server/*',
              reason: 'client runtime must not use server-only package imports',
            },
          ],
        },
      },
    },
  },
};
```

在声明叶子中声明 label：

```jsonc
{
  "limina": "runtime-client",
  "extends": ["./tsconfig.json", "../../tsconfig.dts.base.json"],
  "references": [],
}
```

当该项目 reference 或 import 了被 deny 的目标时，`limina graph check` 会失败并输出 reason。

### `paths`

```js
const liminaConfig = {
  paths: {
    generatedFileName: 'tsconfig.dts.paths.generated.json',
    conditionPriority: ['source', 'development', 'types'],
    artifactDirectories: ['dist', 'build', 'lib', 'esm', 'cjs', 'out'],
  },
};
```

使用场景：某个 `workspace:*` 依赖在 package exports 中仍指向 `dist`，但在 build graph 中又被当作源码依赖。此时可以运行：

```sh
pnpm exec limina paths generate
```

Limina 会生成 `tsconfig.dts.paths.generated.json`，并提示你把它加入相关声明叶子的 `extends` 第一项：

```jsonc
{
  "extends": [
    "./tsconfig.dts.paths.generated.json",
    "./tsconfig.json",
    "../../tsconfig.dts.base.json",
  ],
}
```

建议把 generated paths 作为迁移桥梁，而不是长期默认设计。长期方案仍然是让 workspace source dependency 的 package exports 指向源码入口。

### Checker coverage

```js
const liminaConfig = {
  config: {
    checkers: {
      vue: {
        preset: 'vue-tsc',
        entry: 'tsconfig.vue.build.json',
      },
    },
  },
};
```

Checker entry 用来覆盖由 TypeScript 或框架感知工具验证的文件。典型例子是 Vue SFC、Svelte 组件、VitePress docs、主题项目、特殊 fixture 项目等。check-only 项目仍然需要补 `tsconfig*.dts.json` leaf，让 Limina 能证明覆盖并推导本地 companion；这些 leaf 不要求承担发布产物构建职责。

### `proof.allowlist`

```js
const liminaConfig = {
  proof: {
    allowlist: [
      {
        file: 'src/generated/runtime.d.ts',
        reason: 'Generated declaration-only runtime shim copied into dist.',
      },
    ],
  },
};
```

allowlist 是所有已配置 checker entry 都无法覆盖某个源码文件后的最后手段。每个条目都必须解释为什么安全。建议在 code review 中严格审查新增 allowlist。

### `packageChecks.targets`

```js
const liminaConfig = {
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
          environment: (file) => (file.startsWith('node/') ? 'node' : 'browser'),
          ignoredExternalPackages: ['@acme/runtime-shim'],
        },
      },
    ],
  },
};
```

`outDir` 必须指向已经构建好的、可发布的 package 输出目录，里面应包含构建后的 `package.json`、JS 文件和类型声明。

运行全部 package checks：

```sh
pnpm exec limina package check
```

运行单个 package：

```sh
pnpm exec limina package check --package @acme/core
```

只运行某个工具：

```sh
pnpm exec limina package check --package @acme/core --tool publint
pnpm exec limina package check --package @acme/core --tool attw
pnpm exec limina package check --package @acme/core --tool boundary
```

临时覆盖 ATTW profile：

```sh
pnpm exec limina package check --package @acme/core --attw-profile strict
```

### `pipelines`

```js
const liminaConfig = {
  pipelines: {
    package: [
      {
        type: 'command',
        command: 'pnpm',
        args: ['build'],
      },
      'package:check',
    ],
  },
};
```

pipeline 可以包含两类步骤：

- 内置任务：`graph:check`、`source:check`、`proof:check`、`checker:typecheck`、`checker:build`、`package:check`；
- 命令步骤：用 `{ type: 'command', command, args, cwd, env }` 表达。

`limina check` 会运行内置默认 pipeline：`graph:check`、`source:check`、`proof:check` 和 `checker:typecheck`。`limina check <pipeline>` 只运行 `limina.config.mjs#pipelines` 中的用户自定义 pipeline。请求的名称不存在时，Limina 会失败并提示你到 `limina.config.mjs#pipelines` 中配置，而不是回退到默认 pipeline。

命令步骤默认在 workspace root 执行，并继承 `process.env`。

## CLI 参考

### `limina init [--yes]`

为尚未初始化的 pnpm monorepo 生成 declaration leaves、graph 聚合器、根配置与 `limina:check` 脚本。

```sh
pnpm exec limina init
pnpm exec limina init --yes
```

该命令根据 TypeScript 对真实 import 的解析结果推导 leaf 间 `references`，并去重、排除自身引用。已有 `tsconfig*.build.json` 或 `tsconfig*.dts.json` 时会失败，避免覆盖已有 graph 语义。

### `limina check`

运行 Limina 内置默认检查 pipeline。

```sh
pnpm exec limina check
```

默认 pipeline 会按顺序运行 `graph:check`、`source:check`、`proof:check` 和 `checker:typecheck`。

### `limina check <pipeline>`

运行 `limina.config.mjs#pipelines` 中的用户命名 pipeline。

```sh
pnpm exec limina check package
pnpm exec limina check publish
```

如果 `<pipeline>` 未配置，Limina 会提示找不到该 pipeline 指令，并要求在 `limina.config.mjs#pipelines` 中完成配置。

### `limina graph check`

检查 build graph 的 architecture policy。

```sh
pnpm exec limina graph check
```

常见失败原因：

- 某个源码 import 没有对应 project reference；
- production 声明叶子引用了 test/tools leaf；
- 带有 `limina` label 的项目违反了 `graph.rules`；
- `workspace:*` dependency 通过 exports 解析到了构建产物；
- client/shared runtime 导入了不允许的 runtime 边界。

### `limina proof check`

证明 checker entry、可达声明叶子、本地 companion、默认 `tsconfig.json` 治理和 source boundary 是一致的。

```sh
pnpm exec limina proof check
```

常见失败原因：

- 声明叶子没有配对的 local config；
- 声明叶子不在任何 checker entry 的可达图中；
- 声明叶子和 local config 的文件集合不一致；
- 声明叶子与 local companion 的类型语义 compilerOptions 漂移；
- `tsconfig.json` 既不是单一 local leaf，也不是多环境目录的纯聚合器；
- 某个源码文件既不在 checker entry 中，也不在 allowlist 中。

### `limina paths generate`

生成 source paths 兼容配置。

```sh
pnpm exec limina paths generate
```

如果 CI 需要保证 generated 文件是最新的：

```sh
pnpm exec limina paths check
```

### `limina checker typecheck`

运行所有已配置 checker entry 推导出的 typecheck targets。

```sh
pnpm exec limina checker typecheck
pnpm exec limina checker typecheck --concurrency 4
```

`limina checker build` 会对支持 build 模式的已配置 checker entry 执行 build。

```sh
pnpm exec limina checker build
```

### `limina package check`

检查构建后的 package output。

```sh
pnpm exec limina package check
pnpm exec limina package check --package @acme/core
pnpm exec limina package check --tool boundary
```

运行前请先构建对应 package，否则 `outDir` 中没有发布产物会导致检查失败。

## 推荐工作流

### 本地开发

```sh
pnpm exec limina checker typecheck
pnpm exec limina graph check
```

### PR 检查

```sh
pnpm exec limina check
```

内置默认检查会运行：

1. `graph:check`；
2. `source:check`；
3. `proof:check`；
4. `checker:typecheck`。

只有当仓库需要额外 command、build、package 或 publish 步骤时，才使用自定义的 `limina check <pipeline>`。

### 发布前检查

```sh
pnpm build
pnpm exec limina package check
pnpm exec limina check publish
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
      - run: pnpm exec limina check

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
      - run: pnpm exec limina package check
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

### 2. 声明叶子只做 build-mode 差异

`tsconfig*.dts.json` 应继承配对 local config，尽量只增加：

- `composite`；
- `incremental`；
- `declaration` / `emitDeclarationOnly`；
- `rootDir`；
- `outDir`；
- `tsBuildInfoFile`；
- direct `references`。

不要在声明叶子中偷偷改 `strict`、`types`、`lib` 等类型语义选项。

### 3. 优先修 package exports，而不是长期依赖 generated paths

generated paths 是兼容桥梁。长期方案应让 workspace source dependency 的 package exports 直接指向源码入口，发布构建时再把源码 exports 改写为 dist exports。

### 4. source check 与 package check 都要跑

`graph:check` 与 `proof:check` 保护源码架构；`package:check` 保护消费者安装到的产物。二者不能相互替代。

### 5. allowlist 必须少而明确

每个 allowlist 都应该能回答：

- 为什么这个文件不适合纳入 graph？
- 它由哪个 checker entry、构建步骤或运行时机制覆盖？
- 如果它失效，CI 会在哪里失败？

## 常见问题

### `limina checker typecheck` 如何选择目标？

`limina checker typecheck` 会加载 `limina.config.mjs`，遍历每个已配置 checker 的 `entry`，发现可达的 `tsconfig*.dts.json` leaf，把每个 leaf 映射到配对的本地 companion，然后对这些 companion 执行该 checker 的 no-emit/typecheck 模式。

### 为什么 package checks 需要先 build？

package checks 检查的是 `outDir` 下的发布产物，不是源码目录。如果没有先构建，`outDir/package.json`、JS 文件或 d.ts 文件可能不存在，检查结果没有意义。

### 为什么 workspace exports 指向 dist 会导致 graph 问题？

`tsc -b` 的 project reference 只告诉 TypeScript 构建顺序和声明重定向，不会自动改写 package exports。源码 import package name 时，TypeScript 仍按 package manifest 解析。如果 exports 指向 dist，source graph 就会混入 artifact 解析。

### Vue SFC 应该放进 graph 吗？

通常不建议直接放进普通 `tsc -b` graph。推荐把 Vue/VitePress/SFC 项目放到使用 `vue-tsc` preset 的 checker `entry` 后面，通常是专门的 `tsconfig.vue.build.json` graph 聚合器。docs 等 check-only 项目也应该补 `tsconfig*.dts.json` 声明叶子指向本地 companion，即使这些 leaf 只服务于检查和 proof 覆盖。

### 什么时候使用 `--mode`？

当 `limina.config.mjs` 导出函数并根据环境返回不同配置时使用：

```js
export default defineConfig(({ mode }) => ({
  pipelines: {
    ci:
      mode === 'ci'
        ? ['graph:check', 'proof:check', 'checker:typecheck', 'checker:build']
        : ['checker:typecheck'],
  },
}));
```

运行：

```sh
pnpm exec limina --mode ci check ci
```

## 发布维护者检查清单

在发布 `limina` 自身前，建议确认：

- `package.json#private` 已移除或为 `false`；
- `package.json#files` 包含需要发布的 README、bin 和 dist 文件；
- `pnpm build` 已生成 dist；
- dist package.json 的 `exports`、`types`、`bin` 指向构建后文件；
- `pnpm test` 通过；
- `pnpm typecheck` 或等价 source graph 检查通过；
- `pnpm exec limina package check --package limina` 或等价检查通过；
- `npm pack --dry-run` 输出中没有遗漏关键文件；
- 新版本 README 与 CLI 实现同步。

## 术语表

- **declaration leaf**：拥有 declaration emit 语义和直接 references 的 `tsconfig*.dts.json` 项目。
- **graph aggregator**：只包含 `files: []` 和 `references` 的 `tsconfig*.build.json` graph 聚合配置。
- **local companion config**：与声明叶子配对的普通 typecheck config，例如 `tsconfig.lib.json` 或 `tsconfig.json`。
- **checker entry**：checker 的唯一配置入口，同时用于 build 执行和 typecheck target discovery。
- **artifact dependency**：通过 `link:`、`file:`、`catalog:` 或 semver 消费的构建/发布产物依赖。
- **source dependency**：通过 `workspace:*` 消费并应纳入 TypeScript project references 的源码依赖。

## License

MIT
