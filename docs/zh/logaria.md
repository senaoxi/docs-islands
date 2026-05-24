# logaria

`logaria` 是 docs-islands 项目的框架无关 logger 包。它的 root 入口刻意保持很小：

```ts
import { createLogger, resetLoggerConfig, setLoggerConfig } from 'logaria';
import { createElapsedTimer, formatErrorMessage } from 'logaria/helper';
```

当你需要框架无关的 runtime logging 时，使用这个入口，例如独立脚本、共享包、示例代码或文档站点工具。

## 入口选择

| 场景                          | 入口                         | 配置归属                                                   |
| ----------------------------- | ---------------------------- | ---------------------------------------------------------- |
| 通用应用、脚本或包 runtime    | `logaria`                    | 你的代码，通过 `setLoggerConfig()` / `resetLoggerConfig()` |
| 需要构建期裁剪的通用 runtime  | `logaria` + `logaria/plugin` | `loggerPlugin`，通过插件的 `config` 选项                   |
| 需要显式隔离 scope 的宿主集成 | `logaria/core`               | 宿主集成，通过 `setScopedLoggerConfig()`                   |
| 格式化、耗时和消息 helper     | `logaria/helper`             | 无 runtime 配置                                            |
| scope helper 工具             | `logaria/core/helper`        | 无 runtime 配置                                            |

大多数应用代码都应该使用 root 入口。`core` 入口面向需要创建或消费显式 logger scope 的集成作者。

## Runtime 演示

下面的演示会直接从当前 docs 站点导入真实包。选择一个 runtime 配置并运行场景，组件会捕获 `createLogger()` 产生的 console 输出。

<script setup>
import LoggerRuntimeDemo from '../.vitepress/theme/components/LoggerRuntimeDemo.vue'
</script>

<LoggerRuntimeDemo locale="zh" />

## Runtime API

先创建 main logger，再派生 group logger：

```ts
import { createLogger, resetLoggerConfig, setLoggerConfig } from 'logaria';

setLoggerConfig({
  debug: true,
  levels: ['info', 'warn', 'error'],
});

const logger = createLogger({ main: 'my-package' }).getLoggerByGroup('build');

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
logger.debug('debug is visible only when debug is enabled');

resetLoggerConfig();
```

`setLoggerConfig()` 会更新默认 runtime scope。`resetLoggerConfig()` 会清空这个 scope，让 runtime 回到默认可见性策略。这两个 API 都面向直接、非 plugin 接管的用法。

### Rules Map

精确过滤使用统一的 public `plugins + extends + rules` 模型。preset plugin 只注册 rule template，不会自动启用任何规则；通过 `extends` 导入 preset config，再用 `rules` 作为最后覆盖层。custom rule 的 label 来自 map key。

```ts
const viteLoggingPlugin = {
  rules: {
    build: { main: '@acme/vite', group: 'build.pipeline' },
    hmr: { main: '@acme/vite', group: 'dev.hmr' },
  },
  configs: {
    recommended: {
      rules: {
        build: { levels: 'inherit' },
        hmr: { levels: 'inherit' },
      },
    },
  },
};

setLoggerConfig({
  plugins: {
    vite: viteLoggingPlugin,
  },
  extends: ['vite/recommended'],
  rules: {
    'vite/hmr': 'off',
    'custom:api-timeout': {
      group: 'api.*',
      message: '*timeout*',
      levels: ['warn'],
    },
  },
});
```

### 受控 runtime 行为

当宿主安装了 `loggerPlugin` 后，默认 logger scope 就由插件接管。在这个受控 runtime 中，应用代码不能调用 `setLoggerConfig()` 或 `resetLoggerConfig()`；两者都会抛错，避免注入的 runtime 策略和构建期裁剪策略分叉。

```ts
import { loggerPlugin } from 'logaria/plugin';

export default {
  vite: {
    plugins: [
      loggerPlugin.vite({
        config: {
          levels: ['warn', 'error'],
        },
      }),
    ],
  },
};
```

受控构建里请通过插件的 `config` 选项修改可见性。只有 runtime 没有被 logger plugin 接管时，才使用 `setLoggerConfig()` 和 `resetLoggerConfig()`。

## Tree-Shaking 插件

插件入口位于 `logaria/plugin`：

```ts
import { loggerPlugin } from 'logaria/plugin';

export default {
  vite: {
    plugins: [loggerPlugin.vite()],
  },
};
```

当前 docs 站点会在 `docs:build` 阶段使用这个插件。演示组件额外导入了一个静态 debug fixture，因此生产构建会实际经过 compile-time pruning，同时不会影响页面上的 runtime 交互演示。

`loggerPlugin` 会接管 root `logaria` runtime。Tree-shaking **默认关闭**。要启用构建期裁剪，需要在插件选项中设置 `treeshake: true`。启用后，插件会删除那些根据已解析 logger 配置可以静态证明为隐藏的 logger 调用：

```ts
import { loggerPlugin } from 'logaria/plugin';

export default {
  vite: {
    plugins: [
      loggerPlugin.vite({
        treeshake: true,
      }),
    ],
  },
};
```

插件只删除静态可证明的调用。动态消息、变量 group、alias、解构方法和间接封装都会保留。所有保留在 bundle 中的调用，最终仍以 runtime 过滤结果为准。

## Scoped 集成 API

`logaria/core` 入口暴露面向宿主集成的显式 scope 能力：

```ts
import { createScopedLogger, setScopedLoggerConfig } from 'logaria/core';

setScopedLoggerConfig('my-host-scope', {
  levels: ['warn', 'error'],
});

const logger = createScopedLogger({ main: '@acme/integration' }, 'my-host-scope').getLoggerByGroup(
  'build',
);
```

只有在对应 scope config 已注册后，才能创建 scoped logger。宿主集成可以借此在同一个 JavaScript runtime 中隔离多个 logger scope。普通应用包除非明确参与宿主管理的 scope，否则应优先使用 root 入口。
