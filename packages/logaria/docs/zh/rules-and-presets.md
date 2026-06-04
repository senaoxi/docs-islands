# 规则与预设

`levels` 是一个有用的总开关——但真实项目往往需要更细的控制。你可能希望生产环境保留 API 超时，但屏蔽日常 info 噪音；想看到构建子系统的 HMR 日志，但不想看到其他 `dev.*`。规则与预设就是 Logaria 表达这些需求的方式。

规则会把 Logaria 从宽泛的级别过滤切换为**聚焦的允许列表**：只要解析出至少一条规则，日志就必须命中某条规则，并且该规则允许当前级别，才会输出。未命中的日志**不会**回退到根 `levels`。

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

映射的 key（`custom:metrics`）是规则标签。在 debug 模式下，命中规则的可见日志会带上对应标签，方便你知道是哪条规则放行的。

::: info 两种模式
加入任意规则会把 Logaria 从**级别模式**切换到**规则模式**，这会改变 `levels`、未命中日志与 `logger.debug()` 的行为。详见 [核心概念 — 级别模式与规则模式](./concepts.md#级别模式与规则模式)。
:::

## 规则字段

| 字段      | 含义                                                             |
| --------- | ---------------------------------------------------------------- |
| 映射 key  | 必填，唯一标签。                                                 |
| `main`    | 精确匹配包或子系统标识。                                         |
| `group`   | 默认精确匹配；包含 glob 字符时按 glob 匹配。                     |
| `message` | 默认精确匹配；包含 glob 字符时按 glob 匹配。                     |
| `levels`  | 必填。要么显式 `levels` 数组，要么 `'inherit'` 继承根 `levels`。 |

`group` 与 `message` 在字符串包含 glob 语法（`*`、`?`、`[a-z]`、`{a,b}`）时会自动切换为 glob 匹配。

每个规则对象都必须带 `levels`。省略它会抛出：

```
logger.rules["<label>"] rule objects must declare "levels".
```

::: tip 优先使用精确匹配
精确匹配既快又好理解。只有在确实需要跨多个 `group`（`api.*`）或多种 message（`*timeout*`）时再用 glob。
:::

## 预设插件

预设插件是包与框架分享**可复用规则模板**的方式，还可以附带具名配置（configs）。注册一个预设本身不会启用任何规则——必须通过 `extends` 或 `rules` 引用来启用预设行为。

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

1. 注册 `vite` 预设的 `build` 与 `hmr` 规则模板。
2. 通过 `extends: ['vite/recommended']` 启用它们。
3. 覆盖 `vite/hmr`，让它只显示包含 `slow` 字样的 `warn`/`error`。
4. 新增一条项目自定义规则 `custom:api-timeout` 来盯 API 超时。

## 优先级

配置按以下顺序解析：

1. **`plugins`** 注册预设规则模板。
2. **`extends`** 导入预设提供的具名配置。
3. **`rules`** 作为最后一层覆盖。

预设规则配置支持：

| 取值    | 含义                                             |
| ------- | ------------------------------------------------ |
| `'off'` | 在解析阶段删除该预设规则——不会产生解析后的规则。 |
| 对象    | 启用并微调该规则（可覆盖范围见下）。             |

把规则设为 `'off'` 会在解析阶段**删除**它——这是移除，而非“拒绝”规则。如果所有规则最终都是 `'off'`，配置就没有规则了，会回退到 [级别模式](./concepts.md#级别模式与规则模式)。

一个对象能覆盖多少字段，取决于该预设规则是怎么被启用的：

- **先经 `extends` 导入，再在 `rules` 里覆盖**——只能微调 `message` 与 `levels`。模板里的 `main` 与 `group` 被锁定。预设作者决定一条规则*盯住什么*，使用方只决定它*有多吵*。
- **不经 `extends`，直接在 `rules` 里引用**——对象可以覆盖模板的任意字段：`main`、`group`、`message`、`levels`。

::: warning 覆盖被冻结的字段会抛错
对经 `extends` 启用的规则修改 `main` 或 `group` 会抛出：

```
The user rule cannot override "<plugin>/<rule>" plugin rule's main and group fields.
```

:::

无论哪种方式，对象取值都必须带上 `levels`——用显式数组或 `'inherit'`。

不属于任何预设的项目自定义规则，使用诸如 `custom:api-timeout` 这类标签。`namespace/name` 形式（例如 `vite/hmr`）保留给已注册的预设引用。

## 命名约定

实际项目中行之有效的几条约定：

- **预设命名空间**：小写、简短、一个单词（`vite`、`nuxt`、`acme`）。
- **预设规则名**：小写、简短、不含点（`build`、`hmr`、`metrics`）。
- **自定义标签**：以 `custom:` 或团队命名空间开头，避免与未来预设冲突。

## 下一步阅读

- [核心概念](./concepts.md#一条日志如何被决定)：规则如何解析、一条日志如何被决定。
- [运行时配置](./runtime-config.md)：`levels` 与 `debug` 在规则下的行为。
- [构建插件](./bundler-plugin.md)：规则如何被静态裁剪尊重。
- [API 参考](./api-reference.md#logaria-types)：用于编写预设的 `LoggerPresetPlugin` 类型。
