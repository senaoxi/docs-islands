# Scoped 集成

`logaria` 根入口使用一个**默认 scope**，所有者是应用或构建插件。宿主集成——框架、构建工具、库中间件——不应去改默认 scope。

`logaria/core` 就是答案。它让宿主包注册一个**显式 scope**，拥有独立配置，与应用层默认 scope 互不干扰。应用配置与宿主配置可以并存，不会冲突。

::: tip 何时使用
当你发布的库本身在意自己的 logger 可见性——例如框架调试面板、构建工具内部日志管线、运行时调试浮层——就用 scoped 集成。仅在 CLI 或应用里打日志，留在 `logaria` 根入口即可。
:::

## Scope 生命周期

固定流程是**注册 → 使用 → 重置**：

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

`createScopedLogger()` 要求 scope 配置必须先注册。如果 scope 缺失，它会直接抛错——Logaria 拒绝悄悄回退到默认 scope，因为 scoped 集成存在的全部理由就是把归属说清楚。

## 读取 Scope 配置

当集成代码需要查看某个 scope 当前注册的原始配置时，使用 `getScopedLoggerConfig()`：

```ts
import { getScopedLoggerConfig } from 'logaria/core';

const config = getScopedLoggerConfig(scopeId);
```

Scope 未注册时返回 `undefined`。可用于“别人是不是已经配置过我”这类检查，或用于诊断界面。

## 自定义可见性判定

当集成代码需要 Logaria 的可见性结论但不希望真的打一条日志时——例如在构造消息之前先决定要不要走重格式化路径——可以使用 `shouldSuppressLog()`：

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

返回 `true` 表示该日志应该被隐藏，`false` 表示应当显示。

## Scope ID

`createLoggerScopeId()` 返回形如 `logaria-scope-...` 的唯一字符串。如果宿主需要一个具名 scope，也可以使用自定义的稳定字符串——但要小心处理空字符串与空白。**空 scope id 会归一化为默认 scope**，这通常不是你想要的。

经验法则：

- **生成 ID**（`createLoggerScopeId()`）——用于每个实例独立的 scope（例如 Vite 插件每个实例一个）。
- **稳定 ID**（自定义字符串）——用于单例性质的宿主集成（例如框架调试面板用一个固定的众所周知的 ID）。

## 归一化用户配置

`resolveLoggerConfig()` 把公共 `LoggerConfig` 校验并归一化成 Logaria 内部用于决策的形态。如果宿主包想接受用户传入的配置——例如在自己插件上提供一个 `logger` 选项——应在保存前先过这个 helper。

```ts
import { resolveLoggerConfig } from 'logaria/core';

const compiled = resolveLoggerConfig(userConfig);
```

它会在边界处捕获形态不正确的规则、未知级别、冲突的 `extends` 引用，避免它们日后以令人困惑的 runtime 行为暴露出来。

## 下一步阅读

- [API 参考 — `logaria/core`](./api-reference.md#logaria-core)：完整签名列表。
- [项目理念 — 显式归属](./philosophy.md#显式归属)：scope 存在的原因。
- [常见问题 — 缺失 scope id](./troubleshooting.md#缺失-scope-id)：注册 scope 时的常见踩坑。
