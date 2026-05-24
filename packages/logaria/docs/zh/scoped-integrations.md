# Scoped 集成

Root `logaria` 入口使用默认 scope。宿主集成可以使用 `logaria/core` 创建显式 scope，并拥有独立的配置归属。

当框架、构建工具或宿主包需要管理自己的 logger 可见性，又不想修改应用拥有的 runtime config 时，使用显式 scope。

## Scope 生命周期

创建 scope id、注册配置、创建 scoped logger，最后在宿主结束时 reset：

```ts
import { createScopedLogger, resetScopedLoggerConfig, setScopedLoggerConfig } from 'logaria/core';
import { createLoggerScopeId } from 'logaria/core/helper';

const scopeId = createLoggerScopeId();

setScopedLoggerConfig(scopeId, {
  levels: ['warn', 'error'],
});

const logger = createScopedLogger({ main: '@acme/docs-host' }, scopeId).getLoggerByGroup(
  'build.pipeline',
);

logger.warn('host warning');

resetScopedLoggerConfig(scopeId);
```

`createScopedLogger()` 要求 scope config 已经注册。如果 scope 缺失，它会抛错，而不是静默回退到默认 scope。

## 读取 Scope Config

当集成代码需要检查某个 scope 当前注册的 raw config 时，使用 `getScopedLoggerConfig()`：

```ts
import { getScopedLoggerConfig } from 'logaria/core';

const config = getScopedLoggerConfig(scopeId);
```

scope 未注册时返回 `undefined`。

## 自定义可见性判断

当自定义集成逻辑需要使用 Logaria 的可见性判断、但不想通过 logger 方法输出时，使用 `shouldSuppressLog()`：

```ts
import { shouldSuppressLog } from 'logaria/core';

const suppress = shouldSuppressLog(
  'info',
  {
    main: '@acme/docs-host',
    group: 'build.pipeline',
    message: 'build started',
  },
  scopeId,
);
```

返回 `true` 表示这条日志应隐藏，返回 `false` 表示应显示。

## Scope Ids

`createLoggerScopeId()` 会返回类似 `logaria-scope-...` 的唯一字符串。如果宿主需要命名 scope，也可以使用自己的稳定字符串，但要小心空字符串和空白字符；空 scope id 会 normalize 到默认 scope。

按实例隔离时优先使用生成 id；单例宿主集成可以使用稳定 id。
