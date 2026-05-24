# API 参考

本页列出当前 `logaria` package 实际导出的公开入口。它以源码 export 为准，不沿用旧 README 中已经过期的示例。

## `logaria`

```ts
import { createLogger, resetLoggerConfig, setLoggerConfig } from 'logaria';
```

| API                 | Signature                               | 说明                                                                                  |
| ------------------- | --------------------------------------- | ------------------------------------------------------------------------------------- |
| `createLogger`      | `(options: { main: string }) => Logger` | 在默认 scope 中创建或复用 main logger。继续调用 `.getLoggerByGroup(group)` 后写日志。 |
| `setLoggerConfig`   | `(config: LoggerConfig) => void`        | 为直接、非插件用法设置默认 runtime config。插件接管 runtime 中会抛错。                |
| `resetLoggerConfig` | `() => void`                            | 为直接、非插件用法清空默认 runtime config。插件接管 runtime 中会抛错。                |

Root 入口不导出 `resolveLoggerConfig`；需要从 `logaria/core` 导入。

## Logger 对象

```ts
const logger = createLogger({ main: '@acme/docs' }).getLoggerByGroup('build');

logger.info('message');
logger.success('message');
logger.warn('message');
logger.error('message');
logger.debug('message');
```

`info`、`success`、`warn` 和 `error` 接受可选 elapsed log options：

```ts
logger.info('finished', { elapsedTimeMs: 12.34 });
```

`debug` 只接受 message。

## `logaria/helper`

```ts
import { createElapsedTimer, formatDebugMessage, formatErrorMessage } from 'logaria/helper';
```

| API                  | Signature                                  | 说明                                                           |
| -------------------- | ------------------------------------------ | -------------------------------------------------------------- |
| `createElapsedTimer` | `() => () => { elapsedTimeMs: number }`    | 创建适合作为 logger elapsed options 的 timer 函数。            |
| `formatDebugMessage` | `(options: DebugMessageOptions) => string` | 格式化结构化 debug context、decision、summary 和 timing 字段。 |
| `formatErrorMessage` | `(error: unknown) => string`               | 将未知 thrown value 转成可读字符串。                           |

`createElapsedLogOptions` 和 `formatElapsedTime` 是内部模块导出，不属于 `logaria/helper` package entry。

## `logaria/plugin`

```ts
import { loggerPlugin, transformLoggerTreeShaking } from 'logaria/plugin';
```

| API                               | 说明                                                                                                             |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `loggerPlugin`                    | Universal unplugin adapter，提供 `.vite`、`.rollup`、`.rolldown`、`.esbuild`、`.webpack`、`.rspack` 和 `.farm`。 |
| `transformLoggerTreeShaking`      | 测试和高级工具使用的直接 transform helper。                                                                      |
| `DEFAULT_LOGGER_MODULE_ID`        | transform 使用的公开 logger module id。                                                                          |
| `LOGGER_TREE_SHAKING_PLUGIN_NAME` | transform plugin 名称。                                                                                          |

大多数应用只需要使用 `loggerPlugin`。

## `logaria/core`

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

| API                       | Signature                                                | 说明                                       |
| ------------------------- | -------------------------------------------------------- | ------------------------------------------ |
| `createScopedLogger`      | `(options: { main: string }, scopeId: string) => Logger` | 在已注册的显式 scope 中创建或复用 logger。 |
| `getScopedLoggerConfig`   | `(scopeId: string) => LoggerConfig \| undefined`         | 读取某个 scope 的 raw config。             |
| `setScopedLoggerConfig`   | `(scopeId: string, config: LoggerConfig) => void`        | 注册或更新显式 scope。                     |
| `resetScopedLoggerConfig` | `(scopeId: string) => void`                              | 移除 scope config。                        |
| `shouldSuppressLog`       | `(kind, context, scopeId?) => boolean`                   | 返回某条日志是否应被隐藏。                 |
| `resolveLoggerConfig`     | `(config: LoggerConfig) => NormalizedLoggerConfig`       | 为宿主包 normalize 并校验 public config。  |

## `logaria/core/helper`

```ts
import { DEFAULT_LOGGER_SCOPE_ID, createLoggerScopeId } from 'logaria/core/helper';
```

| API                       | 说明                                        |
| ------------------------- | ------------------------------------------- |
| `DEFAULT_LOGGER_SCOPE_ID` | 暴露给宿主集成使用的内部默认 scope id。     |
| `createLoggerScopeId`     | 为显式 scope 归属创建唯一 scope id 字符串。 |

## `logaria/types`

```ts
import type {
  LoggerConfig,
  LoggerPresetPlugin,
  LoggerVisibilityLevel,
  LogKind,
} from 'logaria/types';
```

`types` 入口为 TypeScript 消费者暴露 public runtime config、rule、logger、plugin 和 transform result 相关类型。
