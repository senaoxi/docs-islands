# 构建插件

`logaria/plugin` 适用于以下两个目的：

1. **以构建期常量的形式注入 runtime logger 配置**，并接管默认 scope。
2. **可选地在生产构建中裁掉静态可证明被关闭的日志调用**。

插件基于 [unplugin](https://github.com/unjs/unplugin)，一个 import 就能拿到主流打包工具的全部适配器。

::: warning 归属权变化
安装插件后，默认 scope 会变成**受控**状态。应用代码必须通过更新插件 `config` 选项来修改可见性，而不是再去调用 `setLoggerConfig()` / `resetLoggerConfig()`——这两者在插件控制下会抛错。详见 [Runtime 配置 — 构建工具控制的 Runtime](./runtime-config.md#构建工具控制的-runtime)。
:::

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

## 适配器

`loggerPlugin` 为每个打包工具暴露一个适配器：

::: code-group

```ts [Vite]
import { loggerPlugin } from 'logaria/plugin';

loggerPlugin.vite({ config, treeshake });
```

```ts [Rollup]
import { loggerPlugin } from 'logaria/plugin';

loggerPlugin.rollup({ config, treeshake });
```

```ts [Rolldown]
import { loggerPlugin } from 'logaria/plugin';

loggerPlugin.rolldown({ config, treeshake });
```

```ts [esbuild]
import { loggerPlugin } from 'logaria/plugin';

loggerPlugin.esbuild({ config, treeshake });
```

```ts [webpack]
import { loggerPlugin } from 'logaria/plugin';

loggerPlugin.webpack({ config, treeshake });
```

```ts [Rspack]
import { loggerPlugin } from 'logaria/plugin';

loggerPlugin.rspack({ config, treeshake });
```

```ts [Farm]
import { loggerPlugin } from 'logaria/plugin';

loggerPlugin.farm({ config, treeshake });
```

:::

所有适配器共享同一份选项与行为——runtime 语义不会因为打包工具不同而变化。

## 选项

| 选项        | 含义                                                              |
| ----------- | ----------------------------------------------------------------- |
| `config`    | 注入到 bundle 的运行时 `LoggerConfig`。省略时使用默认可见性策略。 |
| `treeshake` | 默认 `false`。设为 `true` 以启用构建期裁剪。                      |

::: tip Dev 与 Build 的差异
裁剪只在 **build** 上下文运行。在 dev 与 watch 模式下，所有调用保持原样，仅由 runtime 过滤决定输出。这样可以让 source map 保持干净，HMR 保持迅速。
:::

## Rollup 对等依赖

Rollup 宿主需要在使用 `loggerPlugin.rollup(...)` 之前安装 `@rollup/plugin-replace`：

```sh
pnpm add -D @rollup/plugin-replace
```

Rollup 适配器会在前面挂上 `@rollup/plugin-replace`，让 Logaria 能够以与其他打包工具一致的方式注入控制常量。其他适配器**无需**此对等依赖。

## 裁剪覆盖范围

裁剪是**刻意保守**的。一条日志调用只有在插件能证明以下**全部**静态事实时才会被移除：

- `createLogger` 从 `logaria` 以原名（无别名）命名导入。
- `main`、`group`、message 都是字符串字面量。
- Logger 绑定从未被重新赋值。
- 这条日志是独立表达式。
- 插件运行于 build 上下文且 `treeshake: true`。

### 支持的静态形态

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

### 保留的调用形态（回退到 runtime）

任何插件无法静态验证的调用形态都会保留，由 runtime 过滤作为最终依据：

- 动态的 `main`、`group` 或 message。
- 别名导入（`import { createLogger as cl } from 'logaria'`）。
- 重新赋值过的 logger 绑定。
- 解构出来的方法（`const { info } = logger`）。
- 计算属性访问（`logger['info']`）。
- 非独立表达式，如把日志调用结果赋给变量。

::: info 为什么如此保守
错过一次移除只损失几个字节；错误移除则在真实事故现场少一条本该出现的日志。Logaria 主动避免后者。详见 [项目理念 — 默认保守](./philosophy.md#默认保守)。
:::

## 下一步阅读

- [Runtime 配置](./runtime-config.md)：所有未被移除的调用仍然要过的那道门。
- [规则与 Preset](./rules-and-presets.md)：按 `main`、`group`、message 匹配。
- [常见问题](./troubleshooting.md)：调用未被裁剪时的常见原因。
