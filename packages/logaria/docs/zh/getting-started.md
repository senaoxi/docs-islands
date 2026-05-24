# 快速开始

`logaria` 是面向 TypeScript 包、脚本、文档工具和浏览器 runtime 的框架无关 logger。它给应用代码一组很小的日志 API，同时让配置归属保持清晰。

普通应用或脚本日志使用 root 入口：

```ts
import { createLogger, resetLoggerConfig, setLoggerConfig } from 'logaria';
import { createElapsedTimer, formatErrorMessage } from 'logaria/helper';
```

只有当构建工具需要注入 runtime config 时才使用 `logaria/plugin`。当宿主集成需要隔离 logger scope 时使用 `logaria/core`。

## 安装

使用任意包管理器安装：

```sh
pnpm add logaria
```

```sh
npm install logaria
```

```sh
yarn add logaria
```

```sh
bun add logaria
```

环境要求：

- Node.js `^20.19.0 || >=22.12.0`
- 支持 ESM 的 runtime 或构建工具
- 根据使用的构建插件安装对应的可选 peer dependency，例如 Rollup 需要 `@rollup/plugin-replace`，Rolldown 需要 `rolldown`

## Quick Start

当应用拥有 runtime 可见性策略时，在创建 logger 前配置默认 scope：

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

`createLogger({ main })` 标识日志流所属的 package 或子系统。`getLoggerByGroup(group)` 标识更细的功能区域。

group 建议使用小写点分命名空间，不要重复 package 名。例如 `runtime.react`、`build.pipeline` 和 `dev.hmr`。

## 配置归属

Logaria 的 root 入口背后有一个默认 scope，也可以为宿主集成创建显式 scope。创建 logger 前先确定谁拥有配置：

| 场景                       | 入口                          | 配置归属                                                |
| -------------------------- | ----------------------------- | ------------------------------------------------------- |
| 直接应用、脚本或包 runtime | `logaria`                     | 应用调用 `setLoggerConfig()` 和 `resetLoggerConfig()`。 |
| 构建工具接管的 runtime     | `logaria` 加 `logaria/plugin` | 构建插件注入默认 scope config。                         |
| 需要私有归属的宿主集成     | `logaria/core`                | 宿主在调用 `createScopedLogger()` 前注册显式 scope。    |
| 格式化与耗时 helper        | `logaria/helper`              | 无 runtime 配置。                                       |
| Scope helper 工具          | `logaria/core/helper`         | 无 runtime 配置。                                       |

可复用 library 不应在模块初始化时调用 `setLoggerConfig()` 或 `resetLoggerConfig()`。默认 scope 属于拥有 runtime 的应用或 bundler host。

## Runtime 演示

下面的演示会直接从当前 docs 站点导入真实 `logaria` 包。选择一个配置并运行场景，组件会捕获 console 输出。

<script setup>
import LoggerRuntimeDemo from '../.vitepress/theme/components/LoggerRuntimeDemo.vue'
</script>

<LoggerRuntimeDemo locale="zh" />
