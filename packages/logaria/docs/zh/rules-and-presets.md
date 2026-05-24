# 规则与 Preset

`levels` 是一个有用的总开关——但真实项目往往需要更细的控制。你可能希望生产环境保留 API 超时，但屏蔽日常 info 噪音；想看到构建子系统的 HMR 日志，但不想看到其他 `dev.*`。规则与 Preset 就是 Logaria 表达这些需求的方式。

规则会把 Logaria 从宽泛的 level 过滤切换为**聚焦的 allowlist**：只要解析出至少一条规则，日志就必须命中某条规则，并且该规则允许当前 level，才会输出。未命中的日志**不会**回退到 root `levels`。

## 简短示例

```ts
import { setLoggerConfig } from 'logaria';

setLoggerConfig({
  debug: true,
  levels: ['warn', 'error'],
  rules: {
    'custom:metrics': {
      main: '@acme/docs',
      group: 'userland.metrics',
      message: '*timeout*',
      levels: ['info', 'warn'],
    },
  },
});
```

Map 的 key（`custom:metrics`）是规则标签。在 debug 模式下，命中规则的可见日志会带上对应标签，方便你知道是哪条规则放行的。

::: info 规则模式 vs Level 模式
没有解析出规则的配置处于**Level 模式**——`levels` 是唯一过滤器。
至少解析出一条规则的配置处于**规则模式**——`levels` 变成规则中 `'inherit'` 的默认值，未命中的日志直接被丢弃。
:::

## 规则字段

| 字段      | 含义                                                              |
| --------- | ----------------------------------------------------------------- |
| map key   | 必填，唯一标签。                                                  |
| `main`    | 精确匹配包或子系统标识。                                          |
| `group`   | 默认精确匹配；包含 glob 字符时按 glob 匹配。                      |
| `message` | 默认精确匹配；包含 glob 字符时按 glob 匹配。                      |
| `levels`  | 必填。要么显式 levels 数组，要么 `'inherit'` 继承 root `levels`。 |

`group` 与 `message` 在字符串包含 glob 语法（`*`、`?`、`[a-z]`、`{a,b}`）时会自动切换为 glob 匹配。

::: tip 优先使用精确匹配
精确匹配既快又好理解。只有在确实需要跨多个 group（`api.*`）或多种 message（`*timeout*`）时再用 glob。
:::

## Preset 插件

Preset 插件是包与框架分享**可复用规则模板**的方式，还可以附带具名的配置（configs）。注册一个 preset 本身不会启用任何规则——必须通过 `extends` 或 `rules` 引用来启用 preset 行为。

```ts
import type { LoggerPresetPlugin } from 'logaria/types';
import { setLoggerConfig } from 'logaria';

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

这份配置自始至终在做什么：

1. 注册 `vite` preset 的 `build` 与 `hmr` 规则模板。
2. 通过 `extends: ['vite/recommended']` 启用它们。
3. 覆盖 `vite/hmr`，让它只显示包含 `slow` 字样的 `warn`/`error`。
4. 新增一条项目自定义规则 `custom:api-timeout` 来盯 API 超时。

## 优先级

配置按以下顺序解析：

1. **`plugins`** 注册 preset 规则模板。
2. **`extends`** 导入 preset 提供的具名配置。
3. **`rules`** 作为最后一层覆盖。

Preset 规则配置支持：

| 取值    | 含义                                                                                   |
| ------- | -------------------------------------------------------------------------------------- |
| `'off'` | 展开后删除该 preset 规则。                                                             |
| 对象    | 启用或覆盖该规则；提供的 `main`、`group`、`message`、`levels` 会覆盖模板中的同名字段。 |

不属于任何 preset 的项目自定义规则，使用诸如 `custom:api-timeout` 这类标签。`namespace/name` 形式（例如 `vite/hmr`）保留给已注册的 preset 引用。

## 命名约定

实际项目中行之有效的几条约定：

- **Preset 命名空间**：小写、简短、一个单词（`vite`、`nuxt`、`acme`）。
- **Preset 规则名**：小写、简短、不含点（`build`、`hmr`、`metrics`）。
- **自定义标签**：以 `custom:` 或团队命名空间开头，避免与未来 preset 冲突。

## 下一步阅读

- [Runtime 配置](./runtime-config.md)：`levels` 与 `debug` 在规则下的行为。
- [构建插件](./bundler-plugin.md)：规则如何被静态裁剪尊重。
- [API 参考](./api-reference.md#logaria-types)：用于编写 preset 的 `LoggerPresetPlugin` 类型。
