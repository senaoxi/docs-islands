# `logging`

<script lang="react">
  import LoggingPresetCatalog from '../../components/react/LoggingPresetCatalog';
  import LoggerScopePlayground from '../../components/react/LoggerScopePlayground';
</script>

`logging` 用来控制 `createDocsIslands()` 产生的包内日志，以及这个包公开暴露的 logger helper。它不会改变渲染逻辑，只决定 `@docs-islands/*` 在 Node 和浏览器里哪些消息可见。

每个 `createDocsIslands()` 实例都会持有隔离的 logger scope。VitePress 会把这个 scope 注入到构建图中，通用的 `logaria` runtime 会在没有显式 scope 时读取它，所以并行的多个 VitePress 实例或测试不会互相覆盖 logging 配置。框架无关的直接 logger 用法请使用 `logaria`。

## 什么时候用它

当集成本身正常、但终端或浏览器控制台太吵时，可以用 `logging` 收窄输出范围，尤其适合按 docs-islands 内部子系统聚焦日志。接入初期通常只保留 `warn` 和 `error`；排查问题时，可以打开 `debug`，查看是哪几条规则放行了当前日志，以及 logger 已运行的相对耗时。

## 最小示例

```ts [.vitepress/config.ts]
import { createDocsIslands } from '@docs-islands/vitepress';
import { react } from '@docs-islands/vitepress/adapters/react';
import { vitepress as vitepressLogger } from '@docs-islands/vitepress/logger/presets';

const islands = createDocsIslands({
  adapters: [react()],
  logging: {
    levels: ['warn', 'error'],
    plugins: { vitepress: vitepressLogger },
    extends: ['vitepress/hmr'],
    rules: {
      'vitepress/markdownUpdate': 'off',
    },
  },
});

islands.apply(vitepressConfig);
```

这个配置会导入 VitePress HMR 规则集，让这些规则继承根 `warn` / `error` 级别，然后从最终 resolved rules 中删除 `vitepress/markdownUpdate`。

## 判断模型

当没有配置 `logging.rules` 时，logger 使用默认可见级别：

- `debug: false`：输出 `error`、`warn`、`info`、`success`。
- `debug: true`：输出 `error`、`warn`、`info`、`success`、`debug`。

当 `logging.extends` 或 `logging.rules` 产生 resolved rules 时，logger 会进入规则模式：

1. `plugins` 只注册 rule template，不会自动启用任何规则。
2. `extends` 导入 `vitepress/hmr` 这样的 plugin config，并把本地 rule id 展开为完整 rule id。
3. `rules` 最后生效。对象表示启用或覆盖规则，`'off'` 表示删除该规则，不生成 resolved rule。
4. 每一条 resolved rule 都会按日志的 `main`、`group`、`message` 做匹配。只要 rule 声明了多个字段，这些字段就必须同时命中。
5. 命中的 rule 使用 `rule.levels ?? logging.levels ?? defaultResolvedLevels` 作为自己的 effective levels。
6. 只要有任意一条命中的 resolved rule 放行当前 level，日志就会输出。如果处于规则模式但没有 rule 命中，则不输出。

如果导入的规则全部被删除、最终没有任何 resolved rule，logger 会回到默认无规则行为。

多条 rule 可以同时放行同一条日志。它们的可见级别按并集生效，debug label 按 `logging.rules` 中的声明顺序展示。

## 根配置项

| 配置项      | 含义                                                                                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `debug`     | 启用诊断输出。可见的 `error`、`warn`、`info`、`success` 日志会带上命中的 label，以及 `12.34ms` 这样的相对耗时后缀。                                     |
| `levels`    | 根可见级别集合。在规则模式下，它是使用 `levels: 'inherit'` 的 rule 的默认 effective levels；它不是用来强制收窄所有 rule 的上限。                        |
| `plugins`   | 可选的预设 plugin 注册表。对象 key 会成为 `logging.rules["<plugin>/<rule>"]` 里的命名空间。                                                             |
| `extends`   | 可选的 plugin config 列表，例如 `"vitepress/runtime"`；它们会在用户 `rules` 覆盖之前导入。                                                              |
| `rules`     | 最终规则覆盖 map，key 可以是 custom label，也可以是 `"vitepress/viteAfterUpdate"` 这样的 preset 引用。对象必须声明 `levels`；`'off'` 表示删除一条规则。 |
| `treeshake` | 控制 VitePress managed logger 的构建期裁剪 transform。默认关闭；设置为 `true` 时启用 build-time pruning。                                               |

## Plugin 规则

如果你只是想过滤 docs-islands 内部日志，推荐优先使用 `logging.plugins`。

```ts
import { vitepress as vitepressLogger } from '@docs-islands/vitepress/logger/presets';

const logging = {
  debug: true,
  levels: ['warn'],
  plugins: { vitepress: vitepressLogger },
  extends: ['vitepress/hmr', 'vitepress/runtime'],
  rules: {
    'vitepress/viteAfterUpdate': {
      levels: ['warn', 'error'],
    },
    'vitepress/reactDevRender': {
      levels: ['warn', 'error'],
    },
    'vitepress/renderValidation': 'off',
  },
};
```

- `plugins` 用来把内置 VitePress 预设 plugin 注册到 `vitepress` 命名空间。
- `extends: ["vitepress/<config>"]` 导入内置预设 config。
- `rules["<plugin>/<rule>"] = { levels: 'inherit' }` 表示启用该预设规则，使用 template matcher 并继承根 levels。
- `rules["<plugin>/<rule>"] = 'off'` 表示从最终 resolved config 中删除该预设规则。
- override 对象可以设置 `main`、`group`、`message` 和 `levels`；显式字段会覆盖 preset template 字段。

### 内建日志预设与覆盖范围

`@docs-islands/vitepress/logger/presets` 导出的 `vitepress` preset，本质上是一组内建日志的默认 `main/group` 匹配器。它提供 `vitepress/hmr` 这类分组 config，也提供包含全部规则的 `vitepress/recommended`。下面这张目录会列出所有 config、所有 rule，以及它们的默认 matcher。

<LoggingPresetCatalog
  client:load
  spa:sync-render
  locale="zh"
/>

## 公开 Logger 用法

`@docs-islands/vitepress/logger` 是 VitePress logger facade。它只暴露 `createLogger`；`formatDebugMessage` 等共享 helper 位于 `logaria/helper`，通用的直接 runtime 配置能力位于 `logaria`。

`logging` 定义的是 logger 的运行时可见性策略。它决定日志在运行时是否输出；在 `debug` 模式下，也会决定可见日志附带哪些规则标签和相对耗时信息。

`logaria` 保持 framework-agnostic。在受 `createDocsIslands()` 管理的 VitePress 构建中，`@docs-islands/vitepress/logger` 会被解析为绑定当前 scope 的 virtual module，因此每个集成实例都会使用自己的 logger registry 条目。

需要统一 runtime logger 入口的 monorepo 子包应使用 `@docs-islands/utils/logger`。没有宿主接管时它会退回到 `logaria`；VitePress 打包需要受控的内部模块时，会把它改写成 `@docs-islands/vitepress/logger`。

### 入口归属

| 场景                                           | 导入来源                         | 配置归属                              |
| ---------------------------------------------- | -------------------------------- | ------------------------------------- |
| 受 VitePress 管理的 Vite 管道处理的代码        | `@docs-islands/vitepress/logger` | `createDocsIslands({ logging })`      |
| 已经携带 `loggerScopeId` 的 VitePress 内部流程 | `logaria/core`                   | 当前 `createDocsIslands()` 实例       |
| 可能需要宿主接管的可复用 docs-islands 子包     | `@docs-islands/utils/logger`     | 打包时宿主 alias，否则 root fallback  |
| 受控构建图之外的框架无关用户代码               | `logaria`                        | root logger runtime 或 `loggerPlugin` |
| 共享格式化、耗时和消息 helper                  | `logaria/helper`                 | 无 runtime 配置                       |

`@docs-islands/vitepress/logger` 不是通用 logger 入口。不要在 `.vitepress/config.ts` 或独立 Node 脚本里调用它；这些文件执行时，Vite module graph 还没有机会把 facade 替换成当前激活的、绑定 scope 的 virtual module。

在这个包里，项目级约束是：

- Vite 管道内、由 `createDocsIslands()` 接管的模块，使用 `@docs-islands/vitepress/logger`。只有这个入口会自动获得 VitePress scope 注入和 VitePress 自动 tree-shaking。
- 跑在 Vite graph 之外、但已经拿到当前 `loggerScopeId` 的 VitePress 内部流程，才使用 `logaria/core`。这类调用方必须通过 core API 注册或消费显式 scope。
- 可复用 monorepo 子包应把 `@docs-islands/utils/logger` 作为 runtime logger 入口。脱离受控打包时它会退回到通用 logger；需要加入当前 `createDocsIslands()` scope 时，VitePress 会把它 alias 到 `@docs-islands/vitepress/logger`。
- 不需要 VitePress 接管的可复用包，应使用通用的 `logaria` 入口。如果宿主安装了 `loggerPlugin`，这个通用默认 scope 会被 plugin 接管；否则它仍然可以通过 `setLoggerConfig(...)` / `resetLoggerConfig()` 直接配置。
- 共享的格式化、耗时和诊断 helper 应来自 `logaria/helper` 或 `logaria/core/helper`；不要为了使用 helper 去导入 runtime logger 入口。

`@docs-islands/vitepress` 内部允许同时出现 `@docs-islands/vitepress/logger`、`@docs-islands/utils/logger` 和底层的 `logaria/*` 导入。它们代表不同控制模型：VitePress facade 绑定当前 `createDocsIslands()` scope；utils facade 是 monorepo 内 fallback-or-controlled 的统一入口；底层 logger 导入则提供 helper、类型、plugin 或显式 scope API。

### Runtime Policy 与 Build-Time Optimization

logger tree-shaking plugin 是一个编译期优化层。它会在构建阶段复用已经解析好的 `logging` 规则，对静态可判定的 logger 调用做裁剪。

这两层相关，但不是同一个概念：

- `logging` 始终定义运行时行为。
- tree-shaking plugin 只处理它能安全静态证明的子集。
- 无法静态分析的日志会继续保留在产物中，并交给 runtime logger 决定是否输出。

所以，“运行时会被 suppress” 不等于 “一定会被编译期删除”。

| 维度                            | `logging`      | logger tree-shaking plugin |
| ------------------------------- | -------------- | -------------------------- |
| 生效阶段                        | 运行时         | 编译期                     |
| 是否决定最终控制台输出          | 是             | 否，runtime 语义仍然是基准 |
| 是否移除 bundle 中的静态文案    | 否             | 是，但仅限受支持的静态子集 |
| 是否复用已解析的 `logging` 规则 | 是             | 是                         |
| 覆盖范围                        | 完整运行时模型 | 静态可判定子集             |
| 无法分析时的退化行为            | 正常运行时匹配 | 保留调用并交给 runtime     |

先在 `.vitepress/config.ts` 中配置可见性：

```ts [.vitepress/config.ts]
import { createDocsIslands } from '@docs-islands/vitepress';
import { react } from '@docs-islands/vitepress/adapters/react';

const islands = createDocsIslands({
  adapters: [react()],
  logging: {
    debug: true,
    rules: {
      'custom:userland-metrics': {
        main: '@acme/custom-docs',
        group: 'userland.metrics',
        levels: ['info'],
      },
    },
  },
});

islands.apply(vitepressConfig);
```

然后在真正由受控 Vite graph 处理的模块里导入 facade：

```ts [src/userland-metrics.ts]
import { createLogger } from '@docs-islands/vitepress/logger';

const logger = createLogger({
  main: '@acme/custom-docs',
}).getLoggerByGroup('userland.metrics');
const hiddenLogger = createLogger({
  main: '@acme/custom-docs',
}).getLoggerByGroup('userland.hidden');

logger.info('visible userland info');
hiddenLogger.info('suppressed userland info');
```

在这个配置下，`userland.metrics` 会保留输出，而 `userland.hidden` 会被抑制。

### Logger Tree-Shaking Plugin

在 `createDocsIslands()` 管理的构建链里，设置 `logging.treeshake: true` 后，docs-islands 会安装 logger tree-shaking transform。这个 VitePress transform 只处理受控 VitePress module graph 里的 `@docs-islands/vitepress/logger` 导入，包括用户组件的 browser/SSR bundle，以及 unified loader 这类经 Vite 二次打包的 runtime module。它不会裁剪框架无关的 `logaria` 导入。

如果你希望在 VitePress managed logger facade 和 runtime 过滤之外启用构建期裁剪，可以设置 `logging.treeshake: true`。

共享的 utils facade 也会参与这条接管链路。例如 `@docs-islands/core` 会导入 `@docs-islands/utils/logger`；VitePress 包在构建自身产物时，会把这个 facade 改写为 `@docs-islands/vitepress/logger`。改写后的 import 在 VitePress 包产物里保持 external 是有意的：最终消费方站点的 Vite 管道仍然需要看到并解析 `@docs-islands/vitepress/logger`，这样绑定 scope 的 virtual module 和 VitePress tree-shaking transform 才能生效。不要在消费方站点的 Vite 构建中把 `@docs-islands/vitepress/logger` external 掉。

如果你在 VitePress 站点里使用框架无关的 `logaria` 入口，同时又希望这个通用 logger 拿到生产环境裁剪能力，可以显式安装公开 plugin：

```ts [.vitepress/config.ts]
import { defineConfig } from 'vitepress';
import { loggerPlugin } from 'logaria/plugin';

export default defineConfig({
  vite: {
    plugins: [
      loggerPlugin.vite({
        config: {
          levels: ['warn', 'error'],
        },
      }),
    ],
  },
});
```

`loggerPlugin` 会接管通用 logger 的 runtime config，并默认开启 tree-shaking。如果省略 `config`，plugin 会使用默认 logger 可见性策略，这仍然会裁剪静态可判定的 `debug` 日志。如果只想接管 runtime 配置、不做编译期裁剪，可以设置 `treeshake: false`。在这个受控的通用 runtime 中，应用代码不能调用 `setLoggerConfig(...)` 或 `resetLoggerConfig()`；请改为更新插件的 `config`。

### 生产环境 Tree-Shaking

当 tree-shaking transform 生效时，只要某条用户静态日志能够被证明会被已解析的 `logging` 规则抑制，这条日志语句就会从生成的 JavaScript 中移除，因此它的静态 message 文案也不会进入最终 bundle。

如果你希望获得 pruning coverage，推荐使用下面这种直接写法：

```ts
import { createLogger } from '@docs-islands/vitepress/logger';

const logger = createLogger({
  main: '@acme/custom-docs',
}).getLoggerByGroup('userland.metrics');

logger.info('static metric ready');
logger.success('static metric uploaded');
logger.warn('static metric delayed');
logger.error('static metric failed');
logger.debug('static metric details');
```

VitePress 优化器只分析这个受约束的静态形态：

- `createLogger` 必须是从 `@docs-islands/vitepress/logger` 命名导入的函数。
- `main`、`getLoggerByGroup(...)` 和日志 message 都必须是字符串字面量。
- 日志调用必须是独立语句，例如 `logger.info('message')`。

| 形态                                                               | 是否参与 pruning |
| ------------------------------------------------------------------ | ---------------- |
| `const logger = createLogger({ main: 'x' }).getLoggerByGroup('y')` | 是               |
| `logger.info('msg')` / `warn` / `error` / `success` / `debug`      | 是               |
| 模板字符串、字符串拼接、变量 message、动态 `main`、动态 `group`    | 否               |
| alias、destructuring、reassignment、动态 method 访问               | 否               |
| `const result = logger.info('msg')` 这类非独立表达式               | 否               |

动态日志仍然可用，但会刻意保留给运行时过滤：

```ts
logger.info(`metric ${name}`);
logger.info(`metric ${name}`);
logger.info(message);
createLogger({ main }).getLoggerByGroup(group).info('dynamic binding');
```

这些写法依然兼容可运行，但 docs-islands 不保证它们的 message 文案会从生产产物中消失。pruning coverage 只是 runtime logging coverage 的静态可判定子集，不是它的替代品。

### 通用 Logger 用法

如果需要在 VitePress 管理的构建链之外直接使用 logger，请从框架无关的包导入：

```ts
import { createLogger, resetLoggerConfig, setLoggerConfig } from 'logaria';

setLoggerConfig({
  levels: ['warn', 'error'],
});

const logger = createLogger({
  main: '@acme/custom-docs',
}).getLoggerByGroup('userland.metrics');

logger.warn('visible generic warning');

resetLoggerConfig();
```

没有安装 `loggerPlugin` 时，这类通用 runtime 使用默认 scope，可以直接通过 `setLoggerConfig(...)` / `resetLoggerConfig()` 配置，但不会被 VitePress 自动 tree-shaking transform 覆盖。不要再把 `@docs-islands/vitepress/logger` 当作通用 logger 入口使用。它只服务于 `createDocsIslands()` 建立的 VitePress 构建模块图。

### 交互式 Scope Probe

下面这个 playground 会直接在当前 docs 站里运行 VitePress logger facade：

- 正常的 `@docs-islands/vitepress/logger` 导入会通过 runtime 注入使用当前 `createDocsIslands()` 实例的 logger scope。
- 框架无关的 `logaria` runtime 演示已经放在独立 logger 包页面中。

<LoggerScopePlayground
  client:load
  spa:sync-render
  locale="zh"
/>

::: warning 复用内建 `main/group` 的影响

如果你的自定义日志故意或无意复用了 docs-islands 内建日志使用的 `main` / `group`，那么它们也可能命中同一批 preset rule 或原始 `logging.rules`：

- 你的用户日志会跟着内建日志一起被放行或一起被抑制。
- `debug` 模式下，它们可能带上和内建日志相同的 rule label，增加排查歧义。
- 后续为了过滤内建日志而调整 preset / rule 时，也可能连带影响用户日志。

除非你就是希望用户日志和内建日志共用同一套过滤空间，否则更推荐使用独立的 `main` 与 `group` 命名，例如 `@acme/custom-docs` + `userland.*`。

:::

## Custom Rule 字段

custom rule 和 preset rule 共用同一个 `logging.rules` 对象 map。custom rule 的 key 不能包含 `/`，这个 key 会成为 debug label。public custom rule 对象不接受 `label` 字段。

| 字段      | 含义                                                                                                                         |
| --------- | ---------------------------------------------------------------------------------------------------------------------------- |
| map key   | 必填、稳定的规则标识。开启 `debug` 后，可见日志会以 `[LabelA][LabelB]` 的形式展示真正贡献输出的规则。                        |
| `main`    | 可选包名精确匹配，例如 `@docs-islands/vitepress`。`main` 不使用 glob。                                                       |
| `group`   | 可选 logger group 匹配。普通字符串按精确匹配；包含 glob magic 时使用 `picomatch`，例如 `runtime.react.*` 或 `test.case.?1`。 |
| `message` | 可选消息文本匹配。普通字符串按精确匹配；包含 glob magic 时使用 `picomatch`，例如 `*timeout*`、`request *` 或 `task-[ab]`。   |
| `levels`  | 必填。可以写显式级别数组，也可以写 `levels: 'inherit'`，表示继承根 `logging.levels`，再 fallback 到默认 resolved levels。    |

## 匹配示例

custom rule 适合那种跨 preset 的宽匹配，比如直接按大范围 `group` 前缀或消息文本筛选。

```ts
const islands = createDocsIslands({
  adapters: [react()],
  logging: {
    debug: true,
    levels: ['warn'],
    rules: {
      'custom:react-runtime-warnings': {
        main: '@docs-islands/vitepress',
        group: 'runtime.react.*',
        levels: 'inherit',
      },
      'custom:runtime-timeouts': {
        group: 'runtime.*',
        message: '*timeout*',
        levels: ['error'],
      },
    },
  },
});
```

来自 `runtime.react.component-manager` 的 `warn` 会由 `react-runtime-warnings` 放行。包含 `timeout` 的 `error` 会由 `runtime-timeouts` 放行。如果同一条日志同时命中两条 rule，并且当前 level 被它们放行，debug 模式会按声明顺序打印两个 label。

debug 输出示例：

```bash
[react-runtime-warnings][runtime-timeouts] @docs-islands/vitepress[runtime.react.component-manager]: request timeout 12.34ms
```

## 常见模式

### 只保留 React 运行时的告警和错误

```ts
const islands = createDocsIslands({
  adapters: [react()],
  logging: {
    levels: ['warn', 'error'],
    rules: {
      'custom:react-runtime-warn-error': {
        main: '@docs-islands/vitepress',
        group: 'runtime.react.*',
        levels: 'inherit',
      },
    },
  },
});
```

### 宽泛规则与具体 message 规则组合

```ts
const islands = createDocsIslands({
  adapters: [react()],
  logging: {
    levels: ['warn'],
    rules: {
      'custom:runtime-warnings': {
        group: 'runtime.*',
        levels: 'inherit',
      },
      'custom:timeout-errors': {
        message: '*timeout*',
        levels: ['error'],
      },
    },
  },
});
```

这会保留 runtime 的 warning，同时额外保留任何包含 `timeout` 的 error。两条 rule 不会互相覆盖，而是一起贡献输出能力。

### 临时关闭一条 preset rule

```ts
const islands = createDocsIslands({
  adapters: [react()],
  logging: {
    plugins: { vitepress: vitepressLogger },
    extends: ['vitepress/runtime'],
    rules: {
      'vitepress/reactComponentManager': 'off',
    },
  },
});
```

被删除的 preset rule 不会生成 resolved rule，因此不能匹配 scope、不能放行 level，也不会出现在 debug label 中。其它从 `vitepress/runtime` 导入的规则仍然保持启用。

### 按消息文本筛选

```ts
const islands = createDocsIslands({
  adapters: [react()],
  logging: {
    rules: {
      'custom:hydration-timeouts': {
        message: '*hydration*timeout*',
        levels: ['warn', 'error'],
      },
    },
  },
});
```

message 规则适合短时间排查问题，尤其是某个高频 group 里只有少数消息值得关注时。
