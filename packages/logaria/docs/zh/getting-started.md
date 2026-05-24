# 快速开始

## 概览

Logaria 是一款面向 TypeScript 包、脚本、CLI 与浏览器代码的轻量、框架无关 Logger。它为应用代码提供精简的日志 API，同时把配置归属权讲得清清楚楚——并可选地搭配构建插件，在生产构建里裁掉静态可证明被关闭的日志调用。

可按需选用三个组成部分：

- **精简的 runtime API**（[`logaria`](./api-reference.md#logaria)）：创建 logger 与配置可见性。
- **构建插件**（[`logaria/plugin`](./bundler-plugin.md)）：注入 runtime 配置，并可选地从生产 bundle 中移除被关闭的日志调用。
- **Scoped Core**（[`logaria/core`](./scoped-integrations.md)）：让宿主集成拥有独立 scope，不影响默认 scope。

如果你是第一次接触它，建议先读 [为什么是 Logaria](./why.md) 了解动机，否则可以直接进入下面的快速开始。

## 运行环境要求

Logaria 面向 ESM 友好的运行时：

- **Node.js**：`^20.19.0 || >=22.12.0`
- **浏览器**：任何由现代打包工具产物驱动的现代浏览器
- **模块格式**：ESM（`"type": "module"`）

构建插件基于 [unplugin](https://github.com/unjs/unplugin)，提供针对 Vite、Rollup、Rolldown、esbuild、webpack、Rspack、Farm 的适配器。

## 安装

::: code-group

```sh [pnpm]
pnpm add logaria
```

```sh [npm]
npm install logaria
```

```sh [yarn]
yarn add logaria
```

```sh [bun]
bun add logaria
```

:::

::: tip Rollup 宿主的对等依赖
如果计划使用 [`loggerPlugin.rollup(...)`](./bundler-plugin.md#适配器)，还需要额外安装 `@rollup/plugin-replace`。其他适配器走对应打包工具自带的 `define` 钩子，不需要额外依赖。
:::

## 你的第一个 Logger

先配置默认 scope，然后创建 main logger，再派生 group logger 后再打日志：

```ts
import { createLogger, resetLoggerConfig, setLoggerConfig } from 'logaria';
import { createElapsedTimer, formatErrorMessage } from 'logaria/helper';

setLoggerConfig({
  debug: true,
  levels: ['info', 'success', 'warn', 'error'],
});

const logger = createLogger({
  main: '@acme/docs',
}).getLoggerByGroup('build.pipeline');

logger.info('build started');

const elapsed = createElapsedTimer();

try {
  await build();
  logger.success('build finished', elapsed());
} catch (error) {
  logger.error(`build failed: ${formatErrorMessage(error)}`, elapsed());
  throw error;
}

logger.warn('cache is cold');
logger.debug('debug details');

resetLoggerConfig();
```

各部分含义：

- `createLogger({ main })` 标识拥有这条日志流的包或子系统。
- `.getLoggerByGroup(group)` 在这条流内进一步标识更窄的区域。
- `setLoggerConfig()` / `resetLoggerConfig()` 在 runtime 调整**默认 scope**，仅当应用拥有默认 scope 时使用。

## 命名约定

清晰的 `main` 与 `group` 是让[规则](./rules-and-presets.md)精准匹配的基础。

- **`main`**：包或子系统身份，通常就是包名（`@acme/docs`、`@scope/cli`、`app`）。
- **`group`**：流内部的小写点号命名空间，**不要**重复包名。

推荐的 `group`：`runtime.react`、`build.pipeline`、`dev.hmr`、`userland.metrics`。

## 配置归属

Logaria 在根入口背后有一个默认 scope，以及可选的、宿主集成专用的显式 scope。在创建 logger 之前先选定归属：

| 场景                         | 入口                         | 配置归属方                                               |
| ---------------------------- | ---------------------------- | -------------------------------------------------------- |
| 直接的应用、脚本或包 runtime | `logaria`                    | 由应用调用 `setLoggerConfig()` / `resetLoggerConfig()`。 |
| 构建工具控制的 runtime       | `logaria` + `logaria/plugin` | 由构建插件注入默认 scope 配置。                          |
| 宿主集成需要私有归属         | `logaria/core`               | 宿主在调用 `createScopedLogger()` 之前注册显式 scope。   |
| 格式化与 elapsed 时间辅助    | `logaria/helper`             | 不涉及 runtime 配置。                                    |
| Scope 工具                   | `logaria/core/helper`        | 不涉及 runtime 配置。                                    |

::: warning 库作者注意
被复用的库**不应**在模块初始化时调用 `setLoggerConfig()` / `resetLoggerConfig()`。默认 scope 属于真正拥有 runtime 的应用或构建宿主。若库需要私有可见性，请使用 [Scoped 集成](./scoped-integrations.md)。
:::

## 下一步

- 调整哪些日志会输出：[Runtime 配置](./runtime-config.md)
- 按 `main`、`group`、message 匹配日志：[规则与 Preset](./rules-and-presets.md)
- 在生产构建中裁掉被关闭的调用：[构建插件](./bundler-plugin.md)
- 在宿主包里独立持有一个 scope：[Scoped 集成](./scoped-integrations.md)
- 查阅所有导出：[API 参考](./api-reference.md)

## 交互式演示

下方演示直接从文档站点导入真实的 `logaria` 包。选择 profile 与场景，即可看到被捕获的控制台输出。

<script setup>
import LoggerRuntimeDemo from '../.vitepress/theme/components/LoggerRuntimeDemo.vue'
</script>

<LoggerRuntimeDemo locale="zh" />
