# 快速开始

本页负责安装 Logaria 并带你写出第一个日志器。想了解 Logaria 是什么、可按需选用哪三个部分，见 [介绍](./introduction.md)；想了解它解决的问题，见 [为什么是 Logaria](./why.md)。

## 运行环境要求

Logaria 面向 ESM 友好的运行时：

- **Node.js**：`^22.18.0 || >=24.11.0`
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

## 你的第一个日志器

先配置默认作用域，然后创建主日志器，再派生分组日志器后再打日志：

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
- `setLoggerConfig()` / `resetLoggerConfig()` 在运行时调整**默认作用域**，仅当应用拥有默认作用域时使用。

## 命名约定

清晰的 `main` 与 `group` 是让[规则](./rules-and-presets.md)精准匹配的基础。

- **`main`**：包或子系统身份，通常就是包名（`@acme/docs`、`@scope/cli`、`app`）。
- **`group`**：流内部的小写点号命名空间，**不要**重复包名。

推荐的 `group`：`runtime.react`、`build.pipeline`、`dev.hmr`、`userland.metrics`。

## 配置归属

Logaria 在根入口背后有一个默认作用域，以及可选的、宿主集成专用的显式作用域。在创建日志器之前先选定归属——完整模型见 [核心概念 — 归属与作用域](./concepts.md#归属与作用域)：

| 场景                       | 入口                         | 配置归属方                                               |
| -------------------------- | ---------------------------- | -------------------------------------------------------- |
| 直接的应用、脚本或包运行时 | `logaria`                    | 由应用调用 `setLoggerConfig()` / `resetLoggerConfig()`。 |
| 构建工具控制的运行时       | `logaria` + `logaria/plugin` | 由构建插件注入默认作用域配置。                           |
| 宿主集成需要私有归属       | `logaria/core`               | 宿主在调用 `createScopedLogger()` 之前注册显式作用域。   |
| 格式化与耗时辅助           | `logaria/helper`             | 不涉及运行时配置。                                       |
| 作用域工具                 | `logaria/core/helper`        | 不涉及运行时配置。                                       |

::: warning 库作者注意
被复用的库**不应**在模块初始化时调用 `setLoggerConfig()` / `resetLoggerConfig()`。默认作用域属于真正拥有运行时的应用或构建宿主。若库需要私有可见性，请使用 [作用域集成](./scoped-integrations.md)。
:::

## 下一步

- 通过示例速览能力——[特性一览](./features.md)
- 理解它背后的模型——[核心概念](./concepts.md)
- 调整哪些日志会输出——[运行时配置](./runtime-config.md)
- 按 `main`、`group`、message 匹配日志——[规则与预设](./rules-and-presets.md)
- 在生产构建中裁掉被关闭的调用——[构建插件](./bundler-plugin.md)
- 在宿主包里独立持有一个作用域——[作用域集成](./scoped-integrations.md)
- 查阅所有导出——[API 参考](./api-reference.md)

## 交互式演示

下方演示直接从文档站点导入真实的 `logaria` 包。选择配置档与场景，即可看到被捕获的控制台输出。

<script setup>
import LoggerRuntimeDemo from '../.vitepress/theme/components/LoggerRuntimeDemo.vue'
</script>

<LoggerRuntimeDemo locale="zh" />
