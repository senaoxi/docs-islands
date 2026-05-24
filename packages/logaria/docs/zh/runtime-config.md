# Runtime 配置

Runtime 配置决定日志调用到达 logger 后是否输出。构建期裁剪是可选能力；对于所有仍留在 bundle 中的调用，runtime 过滤始终是最终依据。

## 默认可见性

如果没有调用 `setLoggerConfig()`，也没有安装 `loggerPlugin`，Logaria 使用默认可见性策略：

```ts
{
  levels: ['info', 'success', 'warn', 'error'];
}
```

`debug` 调用默认隐藏。

## Levels

使用 `levels` 允许非 debug 日志方法：

```ts
import { setLoggerConfig } from 'logaria';

setLoggerConfig({
  levels: ['warn', 'error'],
});
```

支持的可见级别：

| Level     | Logger method      |
| --------- | ------------------ |
| `error`   | `logger.error()`   |
| `warn`    | `logger.warn()`    |
| `info`    | `logger.info()`    |
| `success` | `logger.success()` |

`debug` 不属于 `levels`，它由 `debug: true` 控制。

## Debug 模式

在没有 resolved rules 的简单配置中，`debug: true` 会显示 `logger.debug()` 调用，并在可见的非 debug 日志携带 elapsed 信息时追加耗时元数据：

```ts
setLoggerConfig({
  debug: true,
  levels: ['info', 'success', 'warn', 'error'],
});
```

在规则模式下，debug 输出还会为可见的 rule-based 日志附加命中的 rule label。

## 重置配置

直接、非插件接管的场景中，使用 `resetLoggerConfig()` 清空默认 scope：

```ts
import { resetLoggerConfig } from 'logaria';

resetLoggerConfig();
```

重置后，下一次访问默认 scope logger 时会回到内置默认配置。

## 受控 Runtime

当构建工具安装 `loggerPlugin` 后，默认 scope 会被注入的常量接管。在这个 runtime 中，应用代码不能调用 `setLoggerConfig()` 或 `resetLoggerConfig()`；两者都会抛错，避免注入的 runtime 策略和构建期裁剪策略发生分叉。

请改为更新插件的 `config` 选项：

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

## 交互演示

<script setup>
import LoggerRuntimeDemo from '../.vitepress/theme/components/LoggerRuntimeDemo.vue'
</script>

<LoggerRuntimeDemo locale="zh" />
