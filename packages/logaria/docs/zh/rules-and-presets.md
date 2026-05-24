# 规则与 Preset

Rules 会把 Logaria 从宽泛的 level 过滤切换成 allowlist。只要解析出至少一条规则，日志就必须命中某条规则，并且该规则允许当前 level，才会输出。未命中的日志不会回退到 root `levels`。

## Rule Mode

需要精确控制可见性时，使用 `rules` map：

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

map key 就是 rule label。Debug 模式下，可见的 rule-based 日志会显示命中的 label。

## Rule 字段

| 字段      | 含义                                                             |
| --------- | ---------------------------------------------------------------- |
| map key   | 必填且必须唯一的 label。                                         |
| `main`    | 精确匹配 package 或子系统。                                      |
| `group`   | 默认精确匹配；包含 glob 字符时按 glob 匹配。                     |
| `message` | 默认精确匹配；包含 glob 字符时按 glob 匹配。                     |
| `levels`  | 必填。可以写显式 levels，也可以写 `'inherit'` 继承 root levels。 |

`group` 和 `message` 默认使用精确匹配；当字符串包含 `*`、`?`、`[a-z]` 或 braces 等 glob 语法时，才按 glob 匹配。

## Preset Plugins

Preset plugin 负责注册命名 rule template 和可选 config。注册本身不会启用规则，需要通过 `extends` 或 `rules` 引用启用。

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

## 优先级

Config 按这个顺序解析：

1. `plugins` 注册 preset rule template。
2. `extends` 导入 plugin 提供的 configs。
3. `rules` 应用最终覆盖层。

Preset rule setting 支持：

| Setting | 含义                                                                          |
| ------- | ----------------------------------------------------------------------------- |
| `'off'` | 展开后删除该 preset rule。                                                    |
| object  | 启用或覆盖规则；显式 `main`、`group`、`message` 和 `levels` 会覆盖 template。 |

项目自有、并不属于 preset plugin 的规则建议使用 `custom:api-timeout` 这类自定义 label。
