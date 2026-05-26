# API 参考

本页列出 Logaria 全部公开入口。它以源码 export 为准——不包含设想中的 API，不包含别名——因此会随包演进保持准确。

教学与用法示例请见 [快速开始](./getting-started.md) 与各专题指南。本页是规格说明。

## `logaria`

根入口。在持有默认 scope 的应用、脚本、包中使用它。

```ts
import { createLogger, resetLoggerConfig, setLoggerConfig } from 'logaria';
```

| API                 | 签名                                    | 说明                                                                                 |
| ------------------- | --------------------------------------- | ------------------------------------------------------------------------------------ |
| `createLogger`      | `(options: { main: string }) => Logger` | 在默认 scope 中创建或复用 main logger。打日志前请先调用 `.getLoggerByGroup(group)`。 |
| `setLoggerConfig`   | `(config: LoggerConfig) => void`        | 在直接（非插件）模式下设置默认 runtime config。受插件控制时抛错。                    |
| `resetLoggerConfig` | `() => void`                            | 在直接（非插件）模式下清空默认 runtime config。受插件控制时抛错。                    |

根入口**不导出**`resolveLoggerConfig`，需要时请从 [`logaria/core`](#logaria-core) 引入。

## Logger 对象

`createLogger` 与 `createScopedLogger` 返回的 logger 拥有相同接口：

```ts
const logger = createLogger({ main: '@acme/docs' }).getLoggerByGroup('build');

logger.info('message');
logger.success('message');
logger.warn('message');
logger.error('message');
logger.debug('message');
```

`info`、`success`、`warn`、`error` 接受可选的 elapsed 选项：

```ts
logger.info('finished', { elapsedTimeMs: 12.34 });
```

`debug` 只接受消息——让诊断输出保持轻量。

## `logaria/helper`

无 runtime 配置依赖的纯函数 helper：计时与错误格式化。

```ts
import { createElapsedTimer, formatDebugMessage, formatErrorMessage } from 'logaria/helper';
```

| API                  | 签名                                       | 说明                                                |
| -------------------- | ------------------------------------------ | --------------------------------------------------- |
| `createElapsedTimer` | `() => () => { elapsedTimeMs: number }`    | 创建一个适合传给 logger elapsed 选项的计时函数。    |
| `formatDebugMessage` | `(options: DebugMessageOptions) => string` | 格式化结构化的 debug 上下文、决策、摘要与耗时字段。 |
| `formatErrorMessage` | `(error: unknown) => string`               | 把任意抛出值转为可读字符串。                        |

`createElapsedLogOptions` 与 `formatElapsedTime` 是内部模块导出，**不**属于 `logaria/helper` 包入口。

## `logaria/plugin`

通用打包工具适配器与配套常量。

```ts
import { loggerPlugin, transformLoggerTreeShaking } from 'logaria/plugin';
```

| API                               | 说明                                                                                                |
| --------------------------------- | --------------------------------------------------------------------------------------------------- |
| `loggerPlugin`                    | 通用 unplugin 适配器：`.vite`、`.rollup`、`.rolldown`、`.esbuild`、`.webpack`、`.rspack`、`.farm`。 |
| `transformLoggerTreeShaking`      | 测试与高级工具链使用的直接 transform 辅助函数。                                                     |
| `DEFAULT_LOGGER_MODULE_ID`        | transform 使用的公开 logger module id。                                                             |
| `LOGGER_TREE_SHAKING_PLUGIN_NAME` | transform 插件名称。                                                                                |

绝大多数应用只需要 `loggerPlugin`。用法见 [构建插件](./bundler-plugin.md)。

### `LoggerPluginOptions`

```ts
interface LoggerPluginOptions {
  config?: LoggerConfig | null;
  treeshake?: boolean;
}
```

| 字段        | 默认值  | 含义                                                          |
| ----------- | ------- | ------------------------------------------------------------- |
| `config`    | `null`  | 注入到 bundle 的 runtime `LoggerConfig`。省略时使用默认策略。 |
| `treeshake` | `false` | 设为 `true` 启用构建期裁剪。dev 与 watch 模式无效。           |

## `logaria/core`

宿主集成与工具链使用的 scoped API。

```ts
import {
  createScopedLogger,
  getScopedLoggerConfig,
  resetScopedLoggerConfig,
  resolveLoggerConfig,
  setScopedLoggerConfig,
  shouldSuppressLog,
} from 'logaria/core';
```

| API                       | 签名                                                     | 说明                                       |
| ------------------------- | -------------------------------------------------------- | ------------------------------------------ |
| `createScopedLogger`      | `(options: { main: string }, scopeId: string) => Logger` | 在已注册的显式 scope 中创建或复用 logger。 |
| `getScopedLoggerConfig`   | `(scopeId: string) => LoggerConfig \| undefined`         | 读取某个 scope 的原始配置。                |
| `setScopedLoggerConfig`   | `(scopeId: string, config: LoggerConfig) => void`        | 注册或更新一个显式 scope。                 |
| `resetScopedLoggerConfig` | `(scopeId: string) => void`                              | 删除某个 scope 的配置。                    |
| `shouldSuppressLog`       | `(kind, context, scopeId?) => boolean`                   | 返回某条日志是否应被隐藏。                 |
| `resolveLoggerConfig`     | `(config: LoggerConfig) => NormalizedLoggerConfig`       | 校验并归一化宿主包接受的公共 config。      |

用法详见 [Scoped 集成](./scoped-integrations.md)。

## `logaria/core/helper`

```ts
import { DEFAULT_LOGGER_SCOPE_ID, createLoggerScopeId } from 'logaria/core/helper';
```

| API                       | 说明                                    |
| ------------------------- | --------------------------------------- |
| `DEFAULT_LOGGER_SCOPE_ID` | 暴露给宿主集成使用的内部默认 scope id。 |
| `createLoggerScopeId`     | 为显式 scope 归属生成唯一字符串。       |

## `logaria/types`

公开 TypeScript 类型——编写 preset、接受用户 config 或扩展 Logaria 时使用它们。

```ts
import type {
  LoggerConfig,
  LoggerPresetPlugin,
  LoggerVisibilityLevel,
  LogKind,
} from 'logaria/types';
```

`types` 入口暴露 runtime config、rule、logger、plugin 与 transform 结果类型。常用类型：

| 类型                      | 用法                                                               |
| ------------------------- | ------------------------------------------------------------------ |
| `LoggerConfig`            | `setLoggerConfig`、`loggerPlugin`、scoped API 接受的形态。         |
| `LoggerPresetPlugin`      | preset 作者入口——见 [规则与 Preset](./rules-and-presets.md)。      |
| `LoggerVisibilityLevel`   | 允许的级别字符串联合：`'error' \| 'warn' \| 'info' \| 'success'`。 |
| `LogKind`                 | 所有日志类型的联合：可见性级别加 `'debug'`。                       |
| `DebugMessageOptions`     | `formatDebugMessage` 的入参形态。                                  |
| `Logger` / `ScopedLogger` | `createLogger` / `.getLoggerByGroup` 返回的 logger 形态。          |
