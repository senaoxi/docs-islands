# Runtime 配置

Runtime 配置决定**当代码运行到 logger 时，哪些调用真正会输出**。它是最终的真理来源——即使[构建插件](./bundler-plugin.md)裁掉了被关闭的调用，所有留在 bundle 里的调用仍然要再过一次 runtime 这道门。

本页涵盖：

- 未配置时的默认可见性策略。
- 如何用 `levels` 与 `debug` 收紧或放宽输出。
- 如何重置默认 scope。
- 构建插件控制下，归属权如何变化。

如果想按 `main`、`group` 或消息匹配，而不只是按级别，请参考 [规则与 Preset](./rules-and-presets.md)。

## 默认可见性

如果你既没调用 `setLoggerConfig()`，也没装 `loggerPlugin`，Logaria 会使用：

```ts
{
  levels: ['info', 'success', 'warn', 'error'];
}
```

默认隐藏 `debug` 调用，其他级别都会输出。

## Levels

用 `levels` 设置非 debug 日志方法的**允许列表**：

```ts
import { setLoggerConfig } from 'logaria';

setLoggerConfig({
  levels: ['warn', 'error'],
});
```

支持的可见性级别：

| 级别      | Logger 方法        |
| --------- | ------------------ |
| `error`   | `logger.error()`   |
| `warn`    | `logger.warn()`    |
| `info`    | `logger.info()`    |
| `success` | `logger.success()` |

::: tip 为什么 `debug` 不在 `levels` 里
`debug` 故意独立出来。它由 `debug` 标志而非 `levels` 列表控制，因为它是为“诊断专用”的输出准备的——即便 info 级别已经开启，也要显式 opt-in 才会显示。
:::

## Debug 模式

在没有解析出任何规则的简单配置下，`debug: true` 会做两件事：

1. **显示 `logger.debug()` 调用**——默认情况下它们是隐藏的。
2. **在提供 elapsed 选项时，给可见的非 debug 日志附加耗时信息**。

```ts
setLoggerConfig({
  debug: true,
  levels: ['info', 'success', 'warn', 'error'],
});
```

进入规则模式后（参见 [规则与 Preset](./rules-and-presets.md)），`debug: true` 改为给每条可见的规则匹配日志附上命中的规则标签，方便追踪日志为什么会出现。有一点容易踩坑：**只要解析出任意一条规则，`logger.debug()` 的输出就始终被屏蔽——即便 `debug: true` 也一样。** 该标志只有在 Level 模式（没有任何规则）下才会显示 `debug()` 调用；在规则模式下，它只是给规则放行的非 debug 日志加上标签和耗时信息。

## 重置配置

在直接（非插件）使用模式下，用 `resetLoggerConfig()` 清空默认 scope：

```ts
import { resetLoggerConfig } from 'logaria';

resetLoggerConfig();
```

重置之后，下一次访问默认 scope logger 会回退到上述内置默认配置。

::: warning 测试中使用
如果在测试里调用 `setLoggerConfig`，请在 `afterEach` 里搭配调用 `resetLoggerConfig`，让下一条用例从同一个基线开始。
:::

## 构建工具控制的 Runtime

一旦打包工具安装了 [`loggerPlugin`](./bundler-plugin.md)，默认 scope 会变为**受控**——由注入的构建期常量决定。这种 runtime 中：

- `setLoggerConfig()` 抛错。
- `resetLoggerConfig()` 抛错。

这是有意为之，避免 runtime 配置与构建期裁剪策略产生漂移——否则会出现“runtime 允许这条日志，但 bundle 里这条日志已经不在了”这类反直觉情况。

在插件控制模式下，请通过更新插件 `config` 选项来修改可见性：

```ts
import { loggerPlugin } from 'logaria/plugin';

export default {
  plugins: [
    loggerPlugin.vite({
      config: {
        levels: ['warn', 'error'],
      },
    }),
  ],
};
```

抛出的错误会指明你需要修改的插件入口，方便你在 CI 日志里快速定位。

## 交互行为

下方演示使用真实的 `logaria` 包，可以切换 profile，直观看到 runtime 配置如何影响输出。

<script setup>
import LoggerRuntimeDemo from '../.vitepress/theme/components/LoggerRuntimeDemo.vue'
</script>

<LoggerRuntimeDemo locale="zh" />
