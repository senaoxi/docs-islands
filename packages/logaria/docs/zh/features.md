# 特性一览

本页带你速览 Logaria 提供的能力，每一项都配上能说明它的最小示例。想了解背后的模型，见 [核心概念](./concepts.md)；想查完整参考，见“深入”分组的各页。

## 精简的运行时 API

为一个包创建日志器（`main`），收窄到某个区域（`group`），然后打日志。每个日志器都提供五个方法：`info`、`success`、`warn`、`error` 与 `debug`。

```ts
import { createLogger } from 'logaria';

const logger = createLogger({ main: '@acme/docs' }).getLoggerByGroup('build.pipeline');

logger.info('build started');
logger.success('build finished');
```

::: info
`debug`是特殊的：未开启时它隐藏，且一旦规则生效就永远不会打印。见 [两种模式下的 Debug](./concepts.md#两种模式下的-debug)。
:::

详见 [快速开始](./getting-started.md#你的第一个日志器) 与 [API 参考](./api-reference.md#logaria)。

## 级别过滤

在**级别模式**（未配置规则）下，`levels` 是四个非 debug 方法的允许列表。级别不在列表里的方法会被丢弃。

- **默认值：** `['info', 'success', 'warn', 'error']`

```ts
import { setLoggerConfig } from 'logaria';

// 只有 warning 与 error 会输出。
setLoggerConfig({ levels: ['warn', 'error'] });
```

::: tip
`debug` 不在 `levels` 里——它由下面单独的 `debug` 开关控制。
:::

详见 [运行时配置 — Levels](./runtime-config.md#levels)。

## Debug 模式

`debug: true` 在**级别模式**下做两件事：显示 `logger.debug()` 输出，并给传入耗时选项的可见非 debug 日志附加耗时。

```ts
import { createLogger, setLoggerConfig } from 'logaria';
import { createElapsedTimer } from 'logaria/helper';

setLoggerConfig({ debug: true, levels: ['info', 'success', 'warn', 'error'] });

const logger = createLogger({ main: '@acme/docs' }).getLoggerByGroup('build');
const elapsed = createElapsedTimer();
logger.success('done', elapsed()); // 给该行附加耗时
```

::: warning 规则一旦存在，Debug 行为就不同
在**规则模式**（已解析出任意规则）下，`logger.debug()` **始终被屏蔽**，即便 `debug: true` 也一样。此时 `debug: true` 只给可见的非 debug 日志加上 `[label]` 前缀与耗时——永远不会显示 `debug()`。
:::

见 [核心概念 — 两种模式下的 Debug](./concepts.md#两种模式下的-debug)。

## 耗时与格式化辅助

`logaria/helper` 入口提供一组小巧、无需配置的工具：`createElapsedTimer()` 用于计时，`formatErrorMessage()` 把任意抛出的值转成字符串，`formatDebugMessage()` 用于结构化的 debug 行。

```ts
import { createElapsedTimer, formatErrorMessage } from 'logaria/helper';

const elapsed = createElapsedTimer();
try {
  await build();
  logger.success('build finished', elapsed());
} catch (error) {
  logger.error(`build failed: ${formatErrorMessage(error)}`, elapsed());
}
```

::: info
耗时只有在 `debug` 开启（级别模式）或有命中规则（规则模式）时才会显示。
:::

详见 [API 参考](./api-reference.md#logaria-helper)。

## 规则模式：聚焦的允许列表

加入 `rules`，Logaria 就从宽泛的级别过滤切换为**聚焦的允许列表**：日志必须命中某条规则，且该规则允许它的级别。未命中的日志会被丢弃——**不会**回退到 `levels`。`rules` 是按标签作 key 的对象映射。

```ts
setLoggerConfig({
  levels: ['error'],
  rules: {
    'build-flow': {
      main: '@acme/docs',
      group: 'build.pipeline',
      levels: ['info', 'warn'],
    },
  },
});
```

::: warning
只要解析出任意一条规则，你就进入了规则模式。规则集过窄会让其他一切都静音——没有回退到 `levels` 这回事。
:::

详见 [规则与预设](./rules-and-presets.md)。

## group 与 message 的 glob 匹配

`group` 与 `message` 默认精确匹配，当取值包含 glob 语法（`*`、`?`、`[a-z]`、`{a,b}`）时自动升级为 glob 匹配。`main` 始终是精确匹配，即便它含有 glob 字符也一样。

```ts
setLoggerConfig({
  levels: ['warn'],
  rules: {
    'api-timeouts': {
      group: 'api.*',
      message: '*timeout*',
      levels: ['warn'],
    },
  },
});
```

::: tip
优先用精确匹配——更快也更好推理。只有当你确实需要跨多个 `group` 或多种 message 时再用 glob。
:::

详见 [规则与预设 — 规则字段](./rules-and-presets.md#规则字段)。

## 可组合的预设

包与框架可以把可复用的规则模板封装成 `LoggerPresetPlugin`。在 `plugins` 下注册它，通过 `extends` 启用某个具名配置，再在 `rules` 中按项目覆盖。把规则设为 `'off'` 即删除它。

```ts
setLoggerConfig({
  plugins: { vite: viteLoggingPlugin },
  extends: ['vite/recommended'],
  rules: {
    'vite/hmr': { levels: ['warn', 'error'], message: '*slow*' },
  },
});
```

::: warning 预设模板部分字段被冻结
经 `extends` 启用的规则只能覆盖 `message` 与 `levels`。设置 `main` 或 `group` 会抛出：

```
The user rule cannot override "<plugin>/<rule>" plugin rule's main and group fields.
```

:::

详见 [规则与预设 — 预设插件](./rules-and-presets.md#预设插件)。

## 构建期裁剪，覆盖主流打包工具

`logaria/plugin` 入口会把你的运行时配置作为构建期常量注入，并在 `treeshake: true` 时删除它能证明被关闭的日志调用。一个 unplugin 对象暴露七个适配器：`.vite`、`.rollup`、`.rolldown`、`.esbuild`、`.webpack`、`.rspack`、`.farm`。

- **默认值：** `treeshake: false`（仅构建模式生效；dev/watch 下无效）

```ts
// vite.config.ts
import { loggerPlugin } from 'logaria/plugin';

export default {
  plugins: [
    loggerPlugin.vite({
      config: { levels: ['warn', 'error'] },
      treeshake: true,
    }),
  ],
};
```

::: warning 安装插件即接管归属
插件控制下，默认作用域处于**受控**状态：`setLoggerConfig` / `resetLoggerConfig` 在运行时会抛错。请改用插件的 `config` 选项修改可见性。
:::

::: info 裁剪刻意保守
只有当一切都是静态的——命名且无别名的 `createLogger` 导入、字面量 `main`/`group`/message、从未被重新赋值的绑定、独立语句——某条调用才会被移除。任何动态写法都会保留，并回退到运行时过滤。
:::

详见 [构建插件](./bundler-plugin.md) 与 [核心概念 — 运行时始终是唯一真理](./concepts.md#运行时始终是唯一真理)。

## 作用域集成

框架与工具链作者可以通过 [`logaria/core`](./scoped-integrations.md) 注册独立的日志器作用域，配置完全独立，永不改动应用所拥有的默认作用域——这正是 Logaria 能被库安心依赖的原因。

详见 [作用域集成](./scoped-integrations.md)。

## 在线试用

下方演示直接导入真实的 `logaria` 包。选择一个配置档——默认、安静、debug 或规则模式——运行它即可看到被捕获的控制台输出。

<script setup>
import LoggerRuntimeDemo from '../.vitepress/theme/components/LoggerRuntimeDemo.vue'
</script>

<LoggerRuntimeDemo locale="zh" />
