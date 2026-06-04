# 常见问题

下面整理了使用 Logaria 时最容易踩坑的几种情况，以及对应的解法。

## “受插件控制下不能调用 `setLoggerConfig()`”

**现象**

```
Error: logaria is controlled by loggerPlugin.vite({ config }). setLoggerConfig(...) and
resetLoggerConfig() cannot be used in this runtime; update the loggerPlugin.vite({ config })
option in your bundler config instead.
```

**原因** — 你已经在打包工具里安装了 [`loggerPlugin`](./bundler-plugin.md)。默认作用域现在由插件注入的构建期常量控制，运行时 API 拒绝修改它。

**解决** — 改插件 `config` 选项：

```ts
loggerPlugin.vite({
  config: {
    levels: ['warn', 'error'],
  },
});
```

这适用于所有适配器——错误信息会指明你用的是哪个适配器。详见 [运行时配置 — 构建工具控制的运行时](./runtime-config.md#构建工具控制的运行时)。

## 缺失作用域 ID

**现象**

```
Error: Logger config for scope "..." is not registered in this runtime. Call
setScopedLoggerConfig(scopeId, config) before creating a scoped logger.
```

**原因** — 你在没注册对应作用域之前就调用了 `createScopedLogger(options, scopeId)`。

**解决** — 先注册：

```ts
import { createScopedLogger, setScopedLoggerConfig } from 'logaria/core';

setScopedLoggerConfig(scopeId, {
  levels: ['warn', 'error'],
});

const logger = createScopedLogger({ main: '@acme/host' }, scopeId).getLoggerByGroup('build');
```

::: tip 空作用域 ID
空字符串或只含空白的字符串会被归一化为**默认**作用域 ID，这通常不是你想要的。请使用 `createLoggerScopeId()` 或非空的稳定字符串。
:::

## 规则静默吃掉所有日志

**现象** — 加了 `rules` 之后什么都不打了，连本该匹配的错误日志都不见。

**原因** — 只要解析出至少一条规则，Logaria 就进入规则模式：未命中的日志直接被丢弃，**不会**回退到根 `levels`。

**解决方案**

- 检查匹配：`main` 是**精确**匹配；`group` 与 `message` 在没有 glob 字符时也是精确匹配。
- 用 `levels: 'inherit'` 加一条兜底规则，让其他日志走根 `levels`：

```ts
setLoggerConfig({
  levels: ['warn', 'error'],
  rules: {
    'custom:catch-all': {
      levels: 'inherit',
    },
    'custom:metrics': {
      group: 'userland.metrics',
      message: '*timeout*',
      levels: ['info', 'warn'],
    },
  },
});
```

完整语义见 [规则与预设](./rules-and-presets.md)。

## Glob 表现得像精确（或反过来）

**现象** — `group: 'api.users'` 不匹配 `api.users.detail`，或者 `group: 'api.*'` 匹配 `api.users` 但不匹配 `api`。

**原因** — Logaria **仅在字符串包含 glob 字符**（`*`、`?`、`[a-z]`、`{a,b}`）时才会切换为 glob 匹配，否则按精确相等处理。

**解决**

- 前缀匹配请用 `api.*` 或 `api.**`。
- 多选请用 `{login,logout,refresh}`。
- 精确请去掉 glob 字符。

## `logger.debug()` 永远不输出

**现象** — `info` 能正常显示，但 `debug` 完全沉默。

**原因** — 有两个相互独立的原因，任意一个都会隐藏 `debug()`：

- `debug` 由 `debug` 标志控制，不在 `levels` 列表里。默认 `debug: false`，debug 输出会被隐藏。
- 你处于**规则模式**。只要解析出任意一条规则，`logger.debug()` 就*始终*被屏蔽——即便 `debug: true` 也一样。debug 调用只有在级别模式（没有配置任何规则）下才会输出。

**解决** — 在级别模式下设置 `debug: true`：

```ts
setLoggerConfig({
  debug: true,
  levels: ['info', 'success', 'warn', 'error'],
});
```

如果你需要 `debug()` 输出，请确保没有配置任何规则——规则模式下 debug 调用永远不打印。插件控制下，请通过对应适配器设置同一标志，例如 `loggerPlugin.vite({ config: { debug: true } })`。

## 构建期未裁掉某条日志

**现象** — 已经设置 `treeshake: true`，但某条日志仍出现在生产打包产物中。

**原因** — 裁剪刻意保守，必须**全部**静态事实都成立才会移除。常见原因：

- `createLogger` 使用了别名导入（`import { createLogger as cl } from 'logaria'`）。
- `main`、`group`、message 不是字符串字面量（模板字面量、变量、表达式都不行）。
- 日志器绑定被重新赋值。
- 方法被解构（`const { info } = logger`）或通过计算键访问（`logger['info']`）。
- 日志不是独立表达式（例如把调用结果赋值给了变量）。
- 当前不是构建上下文——裁剪只在构建模式运行。

**解决** — 调整调用点以匹配[支持的静态形态](./bundler-plugin.md#支持的静态形态)；或者接受由运行时过滤处理这条调用。

## 未安装 `@rollup/plugin-replace`

**现象**

```
Error: Failed to import module "@rollup/plugin-replace". Please ensure it is installed.
```

**原因** — `loggerPlugin.rollup(...)` 需要 `@rollup/plugin-replace` 作为对等依赖；其他适配器走打包工具自带的 `define` 钩子，不需要。

**解决**

```sh
pnpm add -D @rollup/plugin-replace
```

## 测试之间日志泄漏

**现象** — 某条用例里 `setLoggerConfig` 改了默认作用域，影响到下一条用例。

**原因** — 默认作用域是进程级全局的。一条用例改了它，同一个 worker 的其他用例都会受影响。

**解决** — 每次 `setLoggerConfig` 都配合 `resetLoggerConfig`：

```ts
afterEach(() => {
  resetLoggerConfig();
});
```

若某些测试需要私有可见性而不想触碰默认作用域，使用[作用域集成](./scoped-integrations.md)与生成的 `scopeId`。

## `rules` 必须是对象映射

**现象**

```
Error: logger.rules must be an object map, not an array.
```

**原因** — `rules` 以标签为 key，而不是数组。容易顺手写成数组——测试规格把规则描述成带编号的解析后形态列表——但公共配置是对象映射。

**解决** — 用标签作为每条规则的 key：

```ts
setLoggerConfig({
  levels: ['warn', 'error'],
  rules: {
    'custom:metrics': {
      group: 'userland.metrics',
      levels: ['info', 'warn'],
    },
  },
});
```

每个值要么是 `'off'`，要么是一个规则对象，且每个规则对象都必须声明 `levels`。详见 [规则与预设](./rules-and-presets.md)。

## 仍未解决？

如果你遇到的行为不在本页范围内，欢迎提交问题并附上：

- Logaria 版本（`npm ls logaria`）。
- 最小复现——通常一份配置与一处调用点就足够。
- 问题是仅在安装了 `loggerPlugin` 时出现，还是在根运行时下也出现。
