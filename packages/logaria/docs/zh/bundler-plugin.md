# 构建插件

当构建工具需要注入 runtime logger config，并可选地在生产构建中移除静态可证明被隐藏的日志调用时，使用 `logaria/plugin`。

## Vite 示例

```ts
import { defineConfig } from 'vite';
import { loggerPlugin } from 'logaria/plugin';

export default defineConfig({
  plugins: [
    loggerPlugin.vite({
      config: {
        levels: ['warn', 'error'],
      },
      treeshake: true,
    }),
  ],
});
```

安装插件后，默认 runtime scope 会被插件接管。应用代码应更新插件 `config`，不要再调用 `setLoggerConfig()` 或 `resetLoggerConfig()`。

## Adapters

`loggerPlugin` 基于 unplugin，提供这些 adapter：

```ts
loggerPlugin.vite(options);
loggerPlugin.rollup(options);
loggerPlugin.rolldown(options);
loggerPlugin.esbuild(options);
loggerPlugin.webpack(options);
loggerPlugin.rspack(options);
loggerPlugin.farm(options);
```

## Options

| Option      | 含义                                                              |
| ----------- | ----------------------------------------------------------------- |
| `config`    | 注入 bundle 的 runtime `LoggerConfig`。省略时使用默认可见性策略。 |
| `treeshake` | 默认为 `false`。设置为 `true` 后启用构建期裁剪。                  |

Tree-shaking 只在 build context 中运行。Dev 和 watch 模式会保留调用，并依赖 runtime 过滤。

## Rollup Peer Dependency

Rollup 宿主在使用 `loggerPlugin.rollup(...)` 前必须安装 `@rollup/plugin-replace`。

Rollup adapter 会把 replace plugin 插到插件链前面，让 Logaria 可以内联与其他 bundler define hook 相同的控制常量。

## Tree-Shaking 范围

裁剪会保持保守。只有插件能静态证明以下事实时，日志调用才可能被移除：

- `createLogger` 是从 `logaria` 命名导入，且没有起别名。
- `main`、`group` 和 message 都是字符串字面量。
- logger binding 没有被重新赋值。
- 日志调用是独立表达式。
- 插件运行在 build context 中，并且设置了 `treeshake: true`。

支持裁剪的静态写法：

```ts
import { createLogger } from 'logaria';

const logger = createLogger({
  main: '@acme/docs',
}).getLoggerByGroup('userland.metrics');

logger.info('static metric ready');
logger.warn('static metric delayed');
logger.error('static metric failed');
logger.success('static metric uploaded');
logger.debug('static metric details');
```

以下写法会保留，并交给 runtime 过滤：

- 动态的 `main`、`group` 或 message
- 给 `createLogger` 起别名的 import
- 被重新赋值的 logger binding
- 解构出的日志方法
- computed method access
- 非独立表达式，例如把日志调用结果赋值给变量

所有留在 bundle 中的调用，都仍以 runtime 过滤为最终依据。
