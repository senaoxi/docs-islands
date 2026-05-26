# logaria

<p align="center">
  <a href="https://npmjs.com/package/logaria"><img src="https://img.shields.io/npm/v/logaria.svg" alt="npm package"></a>
  <a href="https://nodejs.org/en/about/previous-releases"><img src="https://img.shields.io/node/v/logaria.svg" alt="node compatibility"></a>
  <a href="https://github.com/XiSenao/docs-islands/actions/workflows/ci.yml"><img src="https://github.com/XiSenao/docs-islands/actions/workflows/ci.yml/badge.svg?branch=main" alt="build status"></a>
  <a href="https://github.com/XiSenao/docs-islands/blob/main/packages/logaria/LICENSE.md"><img src="https://img.shields.io/npm/l/logaria.svg" alt="license"></a>
</p>

[English](./README.md) | 简体中文

面向 docs-islands 包和用户工具的框架无关 logger：提供统一的 Node.js / 浏览器运行时日志 API、可预测的可见性策略，以及可选的构建期插件，用来从生产产物中移除静态可判定为隐藏的日志调用。

## 特性

- **精简公共 API**：从 `logaria` 导入 `createLogger`、`setLoggerConfig` 和 `resetLoggerConfig` 即可。
- **同时支持 Node.js 与浏览器**：终端环境尽量使用彩色输出，浏览器环境使用 styled console 输出。
- **分组日志流**：用 package `main` 和小写点分命名空间 group 组织日志，例如 `build.pipeline`。
- **可配置可见性**：全局或按规则控制 `error`、`warn`、`info`、`success`。
- **Debug 诊断**：简单配置下可开启 debug 输出；规则模式下会给可见日志附加命中规则 label 与 elapsed timing 信息。
- **生产环境裁剪**：`loggerPlugin` 会移除被配置隐藏、且能静态证明安全的日志调用。
- **Scoped 集成 API**：宿主包可以创建显式 logger scope，而不必修改 root runtime 策略。
- **基于 unplugin 的构建工具覆盖**：支持 Vite、Rollup、Rolldown、esbuild、webpack、Rspack 与 Farm。
- **TypeScript 优先**：通过 package exports 提供 ESM 与 TypeScript 类型。

## 安装

```sh
pnpm add logaria
```

```sh
npm install logaria
```

```sh
yarn add logaria
```

```sh
bun add logaria
```

环境要求：

- Node.js `^20.19.0 || >=22.12.0`
- 支持 ESM 的运行时或构建工具
- 根据使用的构建插件安装对应的可选 peer dependency，例如 Rollup 需要 `@rollup/plugin-replace`，Rolldown 需要 `rolldown`

## 快速开始

```ts
import { createLogger, setLoggerConfig } from 'logaria';
import { createElapsedTimer, formatErrorMessage } from 'logaria/helper';

setLoggerConfig({
  debug: true,
  levels: ['info', 'warn', 'error'],
});

const logger = createLogger({
  main: '@acme/docs',
}).getLoggerByGroup('build.pipeline');

logger.info('build started');
const elapsed = createElapsedTimer();
try {
  await build();
  logger.success('build finished', elapsed());
} catch (error) {
  logger.error(`build failed: ${formatErrorMessage(error)}`, elapsed());
  throw error;
}
logger.warn('cache is cold');
logger.debug('debug details');
```

`createLogger({ main })` 用来标识日志流所属的包或子系统。`getLoggerByGroup(group)` 用来标识更细的功能区域。group 必须使用小写点分命名空间，且不能带 package 标识，例如 `runtime.react` 或 `build.pipeline`。

如果没有使用 `loggerPlugin`，也没有在创建 logger 前调用 `setLoggerConfig(...)`，运行时会回退到默认可见性策略。

## 配置归属

`logaria` 的 root 入口背后有一个默认 scope，同时也为宿主集成提供显式 scope。创建 logger 前应先确认配置归属：

| 场景                         | 入口                          | 配置归属                                                                                             |
| ---------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------- |
| 直接应用、脚本或独立工具     | `logaria`                     | 应用侧通过 `setLoggerConfig(...)` 和 `resetLoggerConfig()` 管理默认 scope。                          |
| 构建工具接管的 runtime       | `logaria` 加 `logaria/plugin` | 构建插件注入默认 scope 配置。应用代码调用 `setLoggerConfig(...)` 或 `resetLoggerConfig()` 会抛错。   |
| 需要私有归属的宿主或框架集成 | `logaria/core`                | 宿主创建显式 scope，并在 `createScopedLogger(...)` 前调用 `setScopedLoggerConfig(scopeId, config)`。 |

可复用 library 不应该在模块初始化时调用 `setLoggerConfig(...)` 或 `resetLoggerConfig()`。默认 scope 属于拥有 runtime 的应用或 bundler host。

## Runtime 配置

默认可见级别是 `error`、`warn`、`info` 和 `success`。`debug` 日志默认隐藏；只有在没有配置规则的简单模式下设置 `debug: true`，`debug` 日志才会显示。

```ts
setLoggerConfig({
  levels: ['warn', 'error'],
});
```

直接、非插件接管的场景下，使用 `resetLoggerConfig()` 清空默认 runtime 配置：

```ts
resetLoggerConfig();
```

当 runtime 由 `loggerPlugin` 接管时，`setLoggerConfig(...)` 和 `resetLoggerConfig()` 都会抛错。请改为更新插件的 `config`。

### 规则模式

规则会把日志策略切换成 allowlist。`plugins` 只注册 rule template，`extends` 导入 plugin 提供的 config，`rules` 是最终覆盖层。`rules` 是对象 map：key 是规则 label 或 preset 引用，value 只能是 `'off'` 或带 `levels` 的规则对象。只要存在至少一个 resolved rule，日志就必须命中某条规则，并且该规则允许当前级别，才会输出。未命中的日志不会回退到 root `levels`。

```ts
setLoggerConfig({
  debug: true,
  levels: ['warn', 'error'],
  rules: {
    'custom:metrics': {
      main: '@acme/docs',
      group: 'userland.metrics',
      levels: ['info', 'warn'],
    },
  },
});
```

规则字段：

| 字段      | 说明                                                           |
| --------- | -------------------------------------------------------------- |
| map key   | 必填且必须唯一。debug 模式下，可见的规则日志会显示该 key。     |
| `main`    | 精确匹配 package 或子系统。                                    |
| `group`   | 默认精确匹配；包含 glob 字符时按 glob pattern 匹配。           |
| `message` | 默认精确匹配；包含 glob 字符时按 glob pattern 匹配。           |
| `levels`  | 必填。可以写显式级别数组，也可以写 `'inherit'` 继承根 levels。 |

`levels` 只接受 `error`、`warn`、`info` 和 `success`。`debug` 由 `debug: true` 控制，不放进 `levels`。

### Preset 插件

Preset plugin 只负责注册命名 rule template，注册本身不会启用任何规则。可以通过 `extends` 导入 plugin config，也可以在同一个 `rules` map 里使用 `"<plugin>/<rule>"` 启用或覆盖 preset rule。

```ts
import type { LoggerPresetPlugin } from 'logaria/types';

const viteLoggingPlugin = {
  rules: {
    build: {
      main: '@acme/vite',
      group: 'build.pipeline',
    },
    hmr: {
      main: '@acme/vite',
      group: 'dev.hmr',
    },
  },
  configs: {
    recommended: {
      rules: {
        build: { levels: 'inherit' },
        hmr: { levels: 'inherit' },
      },
    },
  },
} satisfies LoggerPresetPlugin;

setLoggerConfig({
  plugins: {
    vite: viteLoggingPlugin,
  },
  extends: ['vite/recommended'],
  rules: {
    'vite/hmr': {
      levels: ['warn', 'error'],
      message: '*slow*',
    },
    'custom:api-timeout': {
      group: 'api.*',
      message: '*timeout*',
      levels: ['warn'],
    },
  },
});
```

Preset rule setting 支持：

| setting | 说明                                                                          |
| ------- | ----------------------------------------------------------------------------- |
| `'off'` | 展开后删除该 preset rule。                                                    |
| object  | 启用或覆盖规则；显式 `main`、`group`、`message` 和 `levels` 会覆盖 template。 |

## 构建插件

当你需要由构建工具注入 runtime config，并在生产构建中做日志裁剪时，使用 `logaria/plugin`。

```ts
import { defineConfig } from 'vite';
import { loggerPlugin } from 'logaria/plugin';

export default defineConfig({
  plugins: [
    loggerPlugin.vite({
      config: {
        levels: ['warn', 'error'],
      },
    }),
  ],
});
```

插件提供 unplugin adapter：

```ts
loggerPlugin.vite(options);
loggerPlugin.rollup(options);
loggerPlugin.rolldown(options);
loggerPlugin.esbuild(options);
loggerPlugin.webpack(options);
loggerPlugin.rspack(options);
loggerPlugin.farm(options);
```

插件选项：

| 选项        | 说明                                                              |
| ----------- | ----------------------------------------------------------------- |
| `config`    | 注入 bundle 的 runtime `LoggerConfig`。省略时使用默认可见性策略。 |
| `treeshake` | 默认为 `false`。设置为 `true` 后启用构建期裁剪。                  |

Rollup 宿主 bundler 在使用 `loggerPlugin.rollup(...)` 前，需要主动安装 `@rollup/plugin-replace`。logger plugin 会把 Rollup 的 replace plugin 插到插件链前面，用它内联 logger 控制常量，包括 `__DOCS_ISLANDS_DEFAULT_LOGGER_CONTROLLED__` 和 `__DOCS_ISLANDS_DEFAULT_LOGGER_CONFIG__`，让 Rollup bundle 拿到与其他 bundler 通过 `define` hook 注入时相同的序列化 runtime config。

当 runtime 由 `loggerPlugin` 接管时，应用代码里调用 `setLoggerConfig(...)` 或 `resetLoggerConfig()` 会抛错。请改为更新插件的 `config`，这样构建期裁剪与 runtime 过滤会共享同一套策略。

### Tree-Shaking 范围

Tree-shaking 会保持保守。runtime 策略永远是最终依据；插件只会移除能够证明安全的调用。

只有插件能静态看到以下信息时，日志调用才可能被移除：

- `createLogger` 必须是从 `logaria` 命名导入，且没有起别名
- `main`、`group` 和 message 都是字符串字面量
- logger binding 没有被重新赋值
- 日志调用是独立表达式
- 插件运行在 build 上下文中，且 `treeshake` 没有设置为 `false`

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

## API

Root 入口：

```ts
import { createLogger, resetLoggerConfig, setLoggerConfig } from 'logaria';
```

| API                   | 说明                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------- |
| `createLogger()`      | 在默认 scope 中创建或复用 main logger。继续调用 `.getLoggerByGroup(group)` 后写日志。 |
| `setLoggerConfig()`   | 为直接、非插件用法设置默认 runtime config。插件接管 runtime 中会抛错。                |
| `resetLoggerConfig()` | 为直接、非插件用法清空默认 runtime config。插件接管 runtime 中会抛错。                |

插件入口：

```ts
import { loggerPlugin } from 'logaria/plugin';
```

Scoped 集成入口：

```ts
import {
  createScopedLogger,
  getScopedLoggerConfig,
  resetScopedLoggerConfig,
  resolveLoggerConfig,
  setScopedLoggerConfig,
  shouldSuppressLog,
} from 'logaria/core';
import { createLoggerScopeId } from 'logaria/core/helper';

const scopeId = createLoggerScopeId();

setScopedLoggerConfig(scopeId, {
  levels: ['warn', 'error'],
});

const scopedLogger = createScopedLogger({ main: '@acme/docs-host' }, scopeId);
const logger = scopedLogger.getLoggerByGroup('build.pipeline');

logger.warn('host warning');

resetScopedLoggerConfig(scopeId);
```

| API                         | 说明                                                                |
| --------------------------- | ------------------------------------------------------------------- |
| `setScopedLoggerConfig()`   | 注册或更新显式 logger scope。必须在 `createScopedLogger()` 前调用。 |
| `createScopedLogger()`      | 在显式 scope 内创建或复用 main logger。                             |
| `getScopedLoggerConfig()`   | 读取某个 scope 的当前配置；未注册时返回 `undefined`。               |
| `resetScopedLoggerConfig()` | 移除显式 scope 配置。                                               |
| `resolveLoggerConfig()`     | 将公开 `LoggerConfig` 输入解析成宿主包使用的 runtime 配置形态。     |
| `shouldSuppressLog()`       | 为自定义集成逻辑解析 runtime 可见性。                               |

高级类型与 helper 入口：

```ts
import type { LoggerConfig } from 'logaria/types';
import { createElapsedTimer, formatDebugMessage } from 'logaria/helper';
import { createLoggerScopeId } from 'logaria/core/helper';
```

应用代码优先使用 root 入口。只有集成侧需要显式 scope 时才使用 `logaria/core`。共享的格式化、elapsed-time、error/debug-message 工具从 `logaria/helper` 导入；scope helper 从 `logaria/core/helper` 导入。

## 文档

- [Logaria 文档](https://docs.senao.me/docs-islands/logaria/zh/)
- [Logaria 快速开始](https://docs.senao.me/docs-islands/logaria/zh/getting-started)
- [VitePress logging 集成](https://docs.senao.me/docs-islands/vitepress/zh/options/logging)
- [变更日志](./CHANGELOG.md)

## 贡献

欢迎贡献。从仓库根目录运行：

```sh
pnpm --filter logaria test
pnpm --filter logaria typecheck
pnpm --filter logaria lint:package
```

提交 PR 前，请阅读 [贡献指南](https://github.com/XiSenao/docs-islands/blob/main/.github/CONTRIBUTING.zh-CN.md)。

## 许可证

MIT © [XiSenao](https://github.com/XiSenao)
