# 源码检查

::: warning
本页描述顶层 `source` 选项，也就是 `source:check` 运行的 **Knip 驱动依赖和模块可达性检查**。它不同于 `config.source`，后者定义 proof coverage 使用的治理文件边界。`config.source` 见 [源码边界](./source-boundary.md)。
:::

`source check` 负责包权限和普通 typecheck 归属检查。Knip 驱动分支使用包入口而不是 `include` / `exclude`，报告未使用工作区依赖，以及基于 Limina 包归属模块集合识别出的未使用源码模块。

```js
import { defineConfig } from 'limina';

export default defineConfig({
  source: {
    knip: {
      workspaces: {},
    },
    tsconfigOwnership: { ignore: [] },
  },
});
```

## knip

- **类型：** `boolean | SourceKnipCheckConfig`
- **默认值：** `true`

`source.knip` 控制 `source:check` 中由 Knip 驱动的部分：未使用工作区依赖和未使用源码模块。

省略该选项或写 `knip: true` 时，Limina 使用自动生成的默认 Knip 配置。写 `knip: false` 时，会跳过这些 Knip 驱动的检查。对象形式表示按工作区包名配置 Limina 语义 Knip 规则：

```ts
interface SourceKnipEntryConfig {
  files: string[];
  reason: string;
}

interface SourceKnipIgnoredDependencyConfig {
  dep: string;
  reason: string;
}

interface SourceKnipIgnoredFileConfig {
  file: string;
  reason: string;
}

interface SourceKnipWorkspaceConfig {
  entry?: SourceKnipEntryConfig[];
  ignoreDependencies?: SourceKnipIgnoredDependencyConfig[];
  ignoreFiles?: SourceKnipIgnoredFileConfig[];
}

interface SourceKnipCheckConfig {
  workspaces?: Record<string, SourceKnipWorkspaceConfig>;
}
```

`source.knip.workspaces` 的 key 是 pnpm workspace 中发现的包名，例如 `@acme/app`。如果 key 对应不到工作区包名，`source check` 会直接失败。

`source.knip.workspaces[pkg]` 只配置额外可达入口和忽略规则，不再接受 `tsConfig`。Limina 会从包自己的静态 scripts 中推导 Knip 要用的 tsconfig，也就是形如 `limina build <config>` 的脚本：

```json
{
  "scripts": {
    "build:types": "limina build tsconfig.json"
  }
}
```

`<config>` 会从这个包目录解析。Limina 支持 `limina build tsconfig.json`、`limina build --checker vue-tsc tsconfig.json`、`pnpm limina build tsconfig.json`、`pnpm exec limina build tsconfig.json` 这类静态写法。像 `limina build $CONFIG` 这样的动态 shell 脚本不会作为 Knip tsconfig 来源。

如果某个包参与 Knip 驱动的源码或依赖分析，但 Limina 无法从 package scripts 静态推导出构建配置，`source check` 会报 `Missing generated Knip tsconfig source`。

::: warning
`knip` 是 Limina 的 optional peer dependency。如果启用了 `source.knip`，但运行 Limina 的工作区没有安装 `knip`，`source check` 会直接报缺失 peer dependency。
:::

Limina 会为受治理的 owner workspace 写入 `entry: []`，从而关闭 Knip 隐式的 `index` / `main` / `cli` 入口猜测。默认可达性仍然包含 package manifest 入口（`exports`、`main`、`module`、`browser`、`bin`、`types`、`typings`）、Knip 插件推断入口、package scripts，以及 Limina 为 application-style owner 生成的 virtual entries。

当 package 入口指向构建产物时，Knip 需要一个能说明 `rootDir` / `outDir` 的 tsconfig，才能把这些产物映射回源码文件。这时让包里的静态 `limina build <config>` 脚本指向描述产物布局的配置。

这是一种通用的包设计方式：`package.json` 面向消费者，只暴露构建后的 `dist` 文件；被选中的源码 tsconfig 描述会产出这些文件的源码树。例如 `@docs-islands/utils` 可以只写：

```json
{
  "exports": {
    "./env": "./dist/src/env.js"
  }
}
```

同时让 `utils/tsconfig.dts.json` 描述源码侧：

```json
{
  "compilerOptions": {
    "rootDir": ".",
    "outDir": "./dist"
  },
  "include": ["src/**/*.ts"]
}
```

只要给 Knip 使用的 tsconfig 能说明源码目录和输出目录（例如 `rootDir: "."`、`outDir: "./dist"`），Knip 就能把 `utils/dist/src/env.js` 反推成 `utils/src/env.ts`。这样源码模块虽然没有出现在 `exports.source` 里，也仍然会被视为从包入口可达。

然后用静态 package script 暴露这个意图：

```json
{
  "scripts": {
    "build:types": "limina build tsconfig.dts.json"
  }
}
```

反过来，如果推导出的 Knip tsconfig 没有清楚说明 `outDir` / `rootDir`，Knip 只能看到 `dist` 入口，却找不到对应的源码模块。这类源码文件可能会被报告为未使用模块。遇到这种情况，优先让 `limina build <config>` 指向正确的包内配置，而不是为了让 Knip 通过而给 `package.json` 补一份只给工具看的 `source` 条件。

Knip 的 `project` 文件集合也由 Limina 根据受治理源码模块自动确定；用户不配置 `project`。

```js
import { defineConfig } from 'limina';

export default defineConfig({
  source: {
    knip: {
      workspaces: {
        '@acme/app': {
          entry: [
            {
              files: ['packages/app/src/**/*.spec.ts'],
              reason: 'Vitest 会直接加载 spec 模块。',
            },
          ],
          ignoreDependencies: [
            {
              dep: '@acme/runtime',
              reason: '由入口图之外的生成代码加载。',
            },
          ],
          ignoreFiles: [
            {
              file: 'packages/app/src/generated/runtime.ts',
              reason: '框架会加载这个生成 runtime 模块。',
            },
          ],
        },
      },
    },
  },
});
```

### workspaces[pkg].entry

- **类型：** `Array<{ files: string[]; reason: string }>`

`entry` 用于声明包内合法的直接源码入口，但这些入口不应该成为 package exports。例如测试运行器可能会直接加载 `*.spec.ts` 文件。

entry 配置必须使用正向的、工作区根相对的 glob，且必须位于 key 指向的包目录内，并提供非空 reason。

### workspaces[pkg].ignoreDependencies

- **类型：** `Array<{ dep: string; reason: string }>`

`source check` 会验证 `package.json` 中声明的工作区依赖能从导入方包的公开入口图触达。这个规则适用于每个工作区包，包括 workspace root。

如果依赖确实由生成代码、运行时字符串或 Knip 看不见的路径使用，可以在导入方包名 key 下添加 ignore entry。

ignore entry 的 `dep` 必须是已存在的工作区包，并且这个依赖关系仍然声明在 key 指向的 importer package manifest 中。确实需要保留时，把 reason 写在配置旁；不再需要时，应该删除依赖。

### workspaces[pkg].ignoreFiles

- **类型：** `Array<{ file: string; reason: string }>`

`ignoreFiles` 只用于确实要保留、但 Knip 看不见的源码模块。

ignore entry 必须使用工作区根相对文件路径，路径必须留在仓库内，并提供非空 reason。该文件还必须属于 key 指向的包的 Limina 已知源码模块集合。

## tsconfigOwnership.ignore

- **类型：** `Array<{ owner: string; files: string[]; reason: string }>`

`source check` 会从每个受治理模块所在目录开始，向上查找裸 `tsconfig.json`，与 Rolldown 和 TypeScript 的 Go to Project Configuration 行为对齐。候选 `tsconfig.json` 可以直接 include 该模块，也可以通过传递 `references` 到达唯一普通 typecheck config。如果最近的候选没有命中该模块，Limina 会继续查父目录，直到工作区根目录。

Limina 在这个搜索里只跟随普通 typecheck config，不会把 `tsconfig*.dts.json`、`tsconfig*.build.json`、`tsconfig*.base.json`、`tsconfig*.check.json` 当作归属配置。

测试和 fixture 可能由工具以不符合本地 tsconfig 形状的方式加载。此时可以继续治理这些模块，但只对归属规则做局部豁免：

```js
import { defineConfig } from 'limina';

export default defineConfig({
  source: {
    tsconfigOwnership: {
      ignore: [
        {
          owner: '@acme/app',
          files: ['packages/app/src/**/*.spec.ts'],
          reason: 'Vitest 会直接加载测试模块。',
        },
      ],
    },
  },
});
```

ignore entry 必须使用具名包 owner、位于该 owner 目录内的正向工作区根相对 glob，并提供非空 reason。它只跳过向上 `tsconfig.json` 归属解析；包归属、导入权限、proof coverage 和未使用模块检查仍会运行。
