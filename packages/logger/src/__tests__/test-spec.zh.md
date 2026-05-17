# Logger 测试规范（packages/logger 最新实现范式，中文）

> 目标：本文档作为 `docs-islands` monorepo 中 `packages/logger` 子项目的测试规范样本。后续新增或迁移测试必须遵守本文档定义的 public config / resolved config 分层、rule allowlist 语义、debug 诊断语义、scoped API、preset plugin merge、输出格式以及构建期 tree-shaking 约束。
>
> 范围：本文只覆盖 logger 的核心能力。`@docs-islands/logger/helper` 中的通用工具函数（例如 `formatElapsedTime`、`createElapsedLogOptions`、`formatDebugMessage`、`formatErrorMessage`）不单独设计工具函数测试；只在 runtime 输出测试中验证 elapsed time 的可观察效果。

## 0. 源码基线

本规范以 `XiSenao/docs-islands` 仓库 commit `a8389948688e538df82ee510fb30ed2dec983e86` 的实现为基线。核心实现文件：

| 文件                                                                | 覆盖能力                                                                                |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `packages/logger/src/types/index.ts`                                | public / resolved 配置类型、日志级别、core API 类型                                     |
| `packages/logger/src/core/helper/normalize.ts`                      | public config 标准化、resolved config 标准化、输入校验、preset plugin merge、`off` 删除 |
| `packages/logger/src/core/config.ts`                                | 配置注册表、scope 解析、rule-mode allowlist、debug 判定、`shouldSuppressLog`            |
| `packages/logger/src/core/factory.ts`                               | `createLogger` / `createScopedLogger`、main/group 规范化、logger cache                  |
| `packages/logger/src/core/console.ts` 与 `src/constants/console.ts` | Node / Browser 输出格式、console method 映射                                            |
| `packages/logger/src/plugin/index.ts`                               | unplugin 适配器、runtime define 注入、build/dev tree-shaking 开关                       |
| `packages/logger/src/plugin/transform.ts`                           | 静态日志裁剪 AST 识别与保守保留策略                                                     |
| `packages/logger/package.json`                                      | package exports 与测试导入路径                                                          |

## 1. API 与导入边界

测试必须按实际 package export 选择入口：

```ts
// Root public API
import { createLogger, resetLoggerConfig, setLoggerConfig } from '@docs-islands/logger';

// Core integration API
import {
  createScopedLogger,
  getScopedLoggerConfig,
  resetScopedLoggerConfig,
  resolveLoggerConfig,
  setScopedLoggerConfig,
  shouldSuppressLog,
} from '@docs-islands/logger/core';

// Build plugin API
import { loggerPlugin, transformLoggerTreeShaking } from '@docs-islands/logger/plugin';

// Types
import type {
  LoggerConfig,
  LoggerPresetPlugin,
  NormalizedLoggerConfig,
  NormalizedLoggerRule,
} from '@docs-islands/logger/types';
```

不应从内部文件路径导入私有 helper 来写核心测试。测试可以使用 `@docs-islands/logger/core/helper` 验证 exported normalization API，但不为非核心工具函数创建独立规范用例。

## 2. 配置模型规范

### 2.1 Public `LoggerConfig`

Public config 被 `setLoggerConfig`、`setScopedLoggerConfig`、`resolveLoggerConfig` 和 `loggerPlugin({ config })` 消费。

```ts
type LoggerVisibilityLevel = 'error' | 'warn' | 'info' | 'success';
type LoggerRuleLevelsUserConfig = 'inherit' | LoggerVisibilityLevel[];
type LoggerRuleSetting = 'off' | LoggerRuleUserConfig;

interface LoggerRuleUserConfig {
  group?: string;
  levels: LoggerRuleLevelsUserConfig;
  main?: string;
  message?: string;
}

interface LoggerConfig {
  debug?: boolean;
  extends?: string[];
  levels?: LoggerVisibilityLevel[];
  plugins?: LoggerPluginMap;
  rules?: Record<string, LoggerRuleSetting | undefined>;
}
```

约束：

1. public `rules` 必须是 object map，不能是 array。
2. public rule label 来自 `rules` 的 key，不来自 rule body。
3. public rule object 只允许 `main`、`group`、`message`、`levels`。
4. public rule object 必须显式声明 `levels`。
5. 要继承根 `levels`，必须写 `levels: 'inherit'`。
6. `'off'` 是 merge / 标准化阶段的删除操作，不是 runtime deny rule。
7. public `levels` 省略时，`resolveLoggerConfig({})` 会生成默认 visible levels：`['error', 'warn', 'info', 'success']`。默认 runtime scope 在未显式配置时使用 `DEFAULT_LOGGER_CONFIG`，其显式顺序为 `['info', 'success', 'warn', 'error']`；运行时以 `Set` 判定，顺序不影响可见性。

标准 public 范式：

```ts
const logging = {
  debug: true,
  levels: ['warn', 'error'],
  rules: {
    BuildWarn: {
      group: 'build.pipeline',
      levels: 'inherit',
    },
    TimeoutError: {
      message: '*timeout*',
      levels: ['error'],
    },
  },
} satisfies LoggerConfig;
```

禁止旧范式：

```ts
const logging = {
  rules: [
    {
      label: 'BuildWarn',
      group: 'build.pipeline',
    },
  ],
};
```

### 2.2 Normalized `NormalizedLoggerConfig`

`resolveLoggerConfig(config)` 直接产出 runtime 使用的 compiled config。registry entry 的 `config` 字段保留用户原始 `LoggerConfig`，`compiledConfig` 字段保存 `resolveLoggerConfig(config)` 的结果。

```ts
interface NormalizedLoggerRule {
  groupMatcher?: (value: string) => boolean;
  label: string;
  levels?: LoggerVisibilityLevel[];
  main?: string;
  messageMatcher?: (value: string) => boolean;
}

interface NormalizedLoggerConfig {
  debug?: boolean;
  levels: LoggerVisibilityLevel[];
  rules?: NormalizedLoggerRule[];
}
```

约束：

1. public `rules` 必须是 object map；array 非法。
2. 每条 normalized rule 必须有非空 `label`。
3. `label: '<root>'` 是保留值，非法。
4. normalized rule label 必须唯一。
5. normalized rule 的 `levels` 可以省略；省略时 runtime 按 `rule.levels ?? config.levels ?? defaultResolvedLevels` 计算。
6. root `levels` 与 rule `levels` 一律以 `LoggerVisibilityLevel[]` 存储，不使用 `Set`。
7. 无 active rules 时不生成 `rules` 字段，runtime 按 no-rules 行为处理。

### 2.3 生效 level 与 debug 判定

对日志 `(main, group, kind, message)`：

```ts
effectiveLevels(rule) = rule.levels ?? config.levels ?? defaultResolvedLevels;
defaultResolvedLevels = ['error', 'warn', 'info', 'success'];
```

运行时输出决策：

1. `kind === 'debug'`：只有“无 active rules 且 `debug === true`”时输出；只要存在 active rules，`debug` 日志始终 suppressed。
2. `kind` 为 `error | warn | info | success` 且无 active rules：只按根 `levels` 判定；`debug: true` 只决定是否追加 elapsed time。
3. `kind` 为 `error | warn | info | success` 且存在 active rules：进入 allowlist rule-mode。
   - 先筛 scope 命中的 rules。
   - `main`、`group`、`message` 条件为 AND。
   - 当前 level 命中任一 scope 命中 rule 的 `effectiveLevels(rule)` 才输出。
   - 无 contributing rule 时不输出，且不会 fallback 到根 `levels`。
   - `debug: true` 时，输出只包含 contributing rules 的 labels。

### 2.4 匹配语义

| 字段      | 规则                                                                                                            |
| --------- | --------------------------------------------------------------------------------------------------------------- |
| `main`    | trim 后的字符串精确匹配；不支持 glob。即使含 `*` 也按字面量匹配。                                               |
| `group`   | rule pattern 先 trim；空字符串视为未声明。无 glob magic 时精确匹配；有 glob magic 时使用 `picomatch(pattern)`。 |
| `message` | 与 `group` 相同；未传 message 的 helper 判定按空字符串处理。                                                    |

当前 glob magic 检测字符集：`! ( ) * + ? [ ] { }`。稳定测试必须覆盖 `*`、`?`、`[]`；补充测试应覆盖当前 picomatch 支持的 `{}` 与 extglob `@(...)`。

### 2.5 Logger 命名约束

`createLogger({ main })` 会 trim `main`，trim 后不能为空；不强制必须是 npm package 名，因此 `@docs-islands/*` 这类字符串可作为字面量 main 参与精确匹配。

`getLoggerByGroup(group)` 会 trim `group`，trim 后不能为空，并要求 group 是小写点分命名空间：

```txt
segment(.segment)*
segment = lowercase letters / digits，并允许内部 `_` 或 `-`
```

合法：`build.pipeline`、`runtime.react_dom`、`test.case.b_1`。非法：`@scope/pkg`、`test:case`、`Test.Case`、`test.`、`test._bad`。

### 2.6 输出格式

Node 环境输出应先剥离 ANSI escape codes 再断言：

```txt
[label-prefix] main[group]: message [elapsed]
```

Browser 环境输出 styled console：

```ts
console[level](
  '[Label] %cmain%c[%cgroup%c]: %cmessage 42.00ms',
  mainStyle,
  dimStyle,
  groupStyle,
  dimStyle,
  messageStyle,
);
```

Console method 映射：

| kind      | console method  |
| --------- | --------------- |
| `info`    | `console.log`   |
| `success` | `console.log`   |
| `warn`    | `console.warn`  |
| `error`   | `console.error` |
| `debug`   | `console.debug` |

### 2.7 测试公共约定

```ts
const ELAPSED = { elapsedTimeMs: 42 };
const TIME = '42.00ms';
```

`<TIME>` 在预期输出中等价于 `42.00ms`。只有当当前日志可见、`debug: true` 触发 `appendElapsedTime`，并且调用传入 `options.elapsedTimeMs` 时，才追加 `<TIME>`。`logger.debug(message)` 不接收 options，也不追加 elapsed time。

每个测试应隔离全局状态：

```ts
afterEach(() => {
  resetLoggerConfig();
  resetScopedLoggerConfig('scope-a');
  resetScopedLoggerConfig('scope-b');
  vi.restoreAllMocks();
  delete (globalThis as any).window;
  delete (globalThis as any).document;
});
```

建议使用唯一 scope id，避免全局 registry 与 logger cache 对跨用例断言产生干扰。

## 3. 完整测试用例目录

### A. Config 标准化与校验

#### Case A1：public empty config 标准化

验证：`resolveLoggerConfig({})` 返回默认 levels；`rules` 省略；`debug` 省略。

```ts
expect(resolveLoggerConfig({})).toEqual({
  levels: ['error', 'warn', 'info', 'success'],
});
```

同时验证默认 runtime fallback：未调用 `setLoggerConfig` 时创建 default logger，`info/success/warn/error` 可见，`debug` 不可见。

#### Case A2：public root levels 校验

验证：

```ts
expect(() => resolveLoggerConfig({ levels: 'warn' as any })).toThrow(
  'The root-level "levels" field should either be undefined or filled with an array format.',
);
expect(() => resolveLoggerConfig({ levels: ['warn', 'warn'] as any })).toThrow(
  'Duplicate level warn are present.',
);
expect(() => resolveLoggerConfig({ levels: ['debug'] as any })).toThrow(
  'Not supported to parse debug.',
);
expect(resolveLoggerConfig({ levels: [] })).toEqual({ levels: [] });
```

#### Case A3：public rules 必须是 object map

```ts
expect(() => resolveLoggerConfig({ rules: [] as any })).toThrow(TypeError);
expect(() => resolveLoggerConfig({ rules: [] as any })).toThrow(
  'logger.rules must be an object map, not an array.',
);
expect(() => resolveLoggerConfig({ rules: null as any })).toThrow(
  'logger.rules must be an object map.',
);
```

#### Case A4：public rule body 校验

```ts
expect(() =>
  resolveLoggerConfig({
    rules: {
      MissingLevels: { group: 'build.pipeline' } as any,
    },
  }),
).toThrow('logger.rules["MissingLevels"] rule objects must declare "levels".');

expect(() =>
  resolveLoggerConfig({
    rules: {
      ExtraKey: { group: 'build.pipeline', levels: 'inherit', label: 'x' } as any,
    },
  }),
).toThrow('rule objects only support "main", "group", "message", and "levels".');

expect(() =>
  resolveLoggerConfig({
    rules: {
      BadLevels: { levels: 'warn' as any },
    },
  }),
).toThrow('levels must be "inherit" or an array of logger visibility levels.');
```

#### Case A5：`levels: 'inherit'` 与显式 rule levels

```ts
expect(
  resolveLoggerConfig({
    levels: ['warn', 'error'],
    rules: {
      Inherit: { group: 'build.pipeline', levels: 'inherit' },
      Explicit: { message: '*timeout*', levels: ['error'] },
    },
  }),
).toEqual({
  levels: ['warn', 'error'],
  rules: [
    { label: 'Inherit', group: 'build.pipeline' },
    { label: 'Explicit', message: '*timeout*', levels: ['error'] },
  ],
});
```

#### Case A6：`off` 删除语义

```ts
expect(
  resolveLoggerConfig({
    levels: ['warn', 'error'],
    rules: {
      Deleted: 'off',
    },
  }),
).toEqual({ levels: ['warn', 'error'] });
```

Runtime 预期：无 active rules，fallback 到根 `levels`；debug true 时不会出现 `[Deleted]` label。

#### Case A7：normalized config 标准化

```ts
expect(() => resolveLoggerConfig({ rules: [] as any })).toThrow(
  'logger.rules must be an object map, not an array.',
);

expect(() =>
  resolveLoggerConfig({ rules: { Invalid: { typo: true, levels: ['warn'] } as any } }),
).toThrow('Logger rule "Invalid" only supports "main", "group", "message", and "levels".');

expect(() => resolveLoggerConfig({ rules: { '<root>': { levels: ['warn'] } } })).toThrow(
  'Logger rule label "<root>" is reserved for the root logging baseline.',
);
```

#### Case A8：normalized rule default levels fallback

```ts
setLoggerConfig({
  debug: true,
  rules: {
    DefaultLevels: { levels: 'inherit' },
  },
});
```

```ts
const logger = createLogger({ main: '@docs-islands/test' }).getLoggerByGroup('test.default.levels');
logger.debug('hidden');
logger.info('info visible', ELAPSED);
logger.success('success visible', ELAPSED);
logger.warn('warn visible', ELAPSED);
logger.error('error visible', ELAPSED);
```

输出：

```bash
[DefaultLevels] @docs-islands/test[test.default.levels]: info visible <TIME>
[DefaultLevels] @docs-islands/test[test.default.levels]: success visible <TIME>
[DefaultLevels] @docs-islands/test[test.default.levels]: warn visible <TIME>
[DefaultLevels] @docs-islands/test[test.default.levels]: error visible <TIME>
```

#### Case A9：rule 字符串字段 trim 与空值省略

```ts
expect(
  resolveLoggerConfig({
    rules: {
      Trimmed: {
        main: '  @docs-islands/test  ',
        group: '   ',
        message: '   ',
        levels: 'inherit',
      },
    },
  }),
).toEqual({
  levels: ['error', 'warn', 'info', 'success'],
  rules: [{ label: 'Trimmed', main: '@docs-islands/test' }],
});

expect(() =>
  resolveLoggerConfig({
    rules: {
      BadMain: { main: '   ', levels: 'inherit' },
    },
  }),
).toThrow('Logger main must be a non-empty package name.');
```

### B. Runtime rule-mode 与输出判定

#### Case B1：无 rules + debug false 默认行为

```ts
setLoggerConfig({ debug: false });
const logger = createLogger({ main: '@docs-islands/test' }).getLoggerByGroup('test.default');
logger.debug('debug hidden');
logger.info('info visible', ELAPSED);
logger.success('success visible', ELAPSED);
logger.warn('warn visible', ELAPSED);
logger.error('error visible', ELAPSED);
```

输出：

```bash
@docs-islands/test[test.default]: info visible
@docs-islands/test[test.default]: success visible
@docs-islands/test[test.default]: warn visible
@docs-islands/test[test.default]: error visible
```

#### Case B2：无 rules + debug true

```ts
setLoggerConfig({ debug: true });
```

输出：

```bash
@docs-islands/test[test.default]: debug visible
@docs-islands/test[test.default]: info visible <TIME>
@docs-islands/test[test.default]: success visible <TIME>
@docs-islands/test[test.default]: warn visible <TIME>
@docs-islands/test[test.default]: error visible <TIME>
```

#### Case B3：root `levels: []`

```ts
setLoggerConfig({ debug: true, levels: [] });
```

`info/success/warn/error` 全部 suppressed；`debug` 在无 rules 且 `debug: true` 时仍输出：

```bash
@docs-islands/test[test.empty.levels]: debug visible
```

#### Case B4：rule-mode 中 debug 始终 suppressed

```ts
setLoggerConfig({
  debug: true,
  rules: {
    AllWarn: { levels: ['warn'] },
  },
});
```

`logger.debug('hidden')` 不输出；`logger.warn('visible', ELAPSED)` 输出：

```bash
[AllWarn] @docs-islands/test[test.rule.debug]: visible <TIME>
```

#### Case B5：无 scope 限制 rule + contributing labels

```ts
setLoggerConfig({
  debug: true,
  levels: ['warn', 'error'],
  rules: {
    Inherit: { levels: 'inherit' },
    WarnInfo: { levels: ['warn', 'info'] },
  },
});
```

输出：

```bash
[WarnInfo] @docs-islands/test[test.global]: info <TIME>
[Inherit][WarnInfo] @docs-islands/test[test.global]: warn <TIME>
[Inherit] @docs-islands/test[test.global]: error <TIME>
```

#### Case B6：contributing label 只包含 scope 与 level 同时命中的 rule

```ts
setLoggerConfig({
  debug: true,
  levels: ['error'],
  rules: {
    InheritedError: { levels: 'inherit' },
    WarnOnly: { levels: ['warn'] },
    WarnAndError: { levels: ['warn', 'error'] },
  },
});
```

输出：

```bash
[WarnOnly][WarnAndError] @docs-islands/test[test.labels]: warn path <TIME>
[InheritedError][WarnAndError] @docs-islands/test[test.labels]: error path <TIME>
```

#### Case B7：`main` 精确匹配且不支持 glob

```ts
setLoggerConfig({
  debug: true,
  rules: {
    WildcardLiteral: { main: '@docs-islands/*', levels: ['warn'] },
    ExactMain: { main: '@docs-islands/test', levels: ['error'] },
  },
});
```

输出：

```bash
[ExactMain] @docs-islands/test[test.main]: exact main <TIME>
[WildcardLiteral] @docs-islands/*[test.main]: literal wildcard main <TIME>
```

`@docs-islands/test` 的 warn 不应被 `main: '@docs-islands/*'` 放行。

#### Case B8：`group` exact 与 glob 匹配

```ts
setLoggerConfig({
  debug: true,
  levels: ['warn', 'error'],
  rules: {
    ExactGroup: { group: 'test.group.exact', levels: 'inherit' },
    GlobGroup: { group: 'test.group.*', levels: ['info'] },
  },
});
```

输出：

```bash
[GlobGroup] @docs-islands/test[test.group.exact]: info exact group <TIME>
[ExactGroup] @docs-islands/test[test.group.exact]: warn exact group <TIME>
[GlobGroup] @docs-islands/test[test.group.other]: info glob group <TIME>
```

#### Case B9：`message` exact 与 glob 匹配

```ts
setLoggerConfig({
  debug: true,
  rules: {
    ExactMessage: { message: 'request timeout', levels: ['error'] },
    GlobMessage: { message: '*database*', levels: ['warn', 'error'] },
    MatchAll: { message: '*', levels: ['success'] },
  },
});
```

输出：

```bash
[ExactMessage] @docs-islands/test[test.message]: request timeout <TIME>
[GlobMessage] @docs-islands/test[test.message]: primary database slow <TIME>
[MatchAll] @docs-islands/test[test.message]: any success message <TIME>
```

#### Case B10：`main + group + message` 三元 AND

```ts
setLoggerConfig({
  debug: true,
  rules: {
    ApiTimeout: {
      main: '@docs-islands/api',
      group: 'api.fetch',
      message: '*timeout*',
      levels: ['error'],
    },
  },
});
```

只有 `main='@docs-islands/api'`、`group='api.fetch'`、`message` 包含 `timeout` 且 kind 为 `error` 时输出：

```bash
[ApiTimeout] @docs-islands/api[api.fetch]: request timeout <TIME>
```

#### Case B11：active rules 存在但无命中时不 fallback

```ts
setLoggerConfig({
  debug: true,
  levels: ['warn', 'error'],
  rules: {
    OnlyBuild: { group: 'build.pipeline', levels: 'inherit' },
  },
});
```

`test.other` group 下的 warn/error 均不输出，即使根 `levels` 允许。

#### Case B12：`success` 在 rule-mode 中参与判定

```ts
setLoggerConfig({
  debug: true,
  levels: ['success'],
  rules: {
    InheritedSuccess: { group: 'build.done', levels: 'inherit' },
    ExplicitSuccess: { message: '*completed*', levels: ['success'] },
  },
});
```

输出：

```bash
[InheritedSuccess] @docs-islands/test[build.done]: task done <TIME>
[ExplicitSuccess] @docs-islands/test[build.other]: job completed <TIME>
```

#### Case B13：glob magic `?` 与 `[]`

```ts
setLoggerConfig({
  debug: true,
  rules: {
    QuestionGroup: { group: 'test.case.?1', levels: ['warn'] },
    CharMessage: { message: 'task-[ab]', levels: ['error'] },
  },
});
```

输出：

```bash
[QuestionGroup] @docs-islands/test[test.case.a1]: noop <TIME>
[CharMessage] @docs-islands/test[test.case.a1]: task-a <TIME>
[CharMessage] @docs-islands/test[test.case.ab1]: task-b <TIME>
```

#### Case B14：brace expansion 与 extglob 冒烟

```ts
setLoggerConfig({
  debug: true,
  rules: {
    BraceGroup: { group: 'test.glob.{a,b}', levels: ['warn'] },
    ExtglobMessage: { message: '@(build|render) failed', levels: ['error'] },
  },
});
```

输出：

```bash
[BraceGroup] @docs-islands/test[test.glob.a]: noop <TIME>
[ExtglobMessage] @docs-islands/test[test.glob.a]: build failed <TIME>
```

#### Case B15：rule explicit `levels: []` 与 root empty inheritance

```ts
setLoggerConfig({
  debug: true,
  levels: [],
  rules: {
    InheritEmpty: { levels: 'inherit' },
    ExplicitEmpty: { group: 'test.empty.rule', levels: [] },
    ErrorOnly: { group: 'test.empty.rule', levels: ['error'] },
  },
});
```

只有 `ErrorOnly` 对 `error` 贡献 label：

```bash
[ErrorOnly] @docs-islands/test[test.empty.rule]: visible error <TIME>
```

#### Case B16：debug label 顺序按 resolved rules 顺序

```ts
setLoggerConfig({
  debug: true,
  rules: {
    First: { message: '*timeout*', levels: ['error'] },
    Second: { message: 'request *', levels: ['error'] },
    Third: { message: '*user*', levels: ['error'] },
  },
});
```

输出：

```bash
[First][Second][Third] @docs-islands/test[test.order]: request timeout user api <TIME>
```

### C. Logger factory、scope 与 runtime registry

#### Case C1：`main` / `group` 输入校验

```ts
expect(() => createLogger({ main: '   ' })).toThrow(
  'Logger main must be a non-empty package name.',
);

const logger = createLogger({ main: '  @docs-islands/test  ' });

expect(() => logger.getLoggerByGroup('   ')).toThrow('Logger group must be a non-empty string.');
expect(() => logger.getLoggerByGroup('Test.Case')).toThrow(
  'must use lowercase dot namespaces without package identifiers',
);
expect(() => logger.getLoggerByGroup('@docs-islands/test')).toThrow(
  'must use lowercase dot namespaces without package identifiers',
);
expect(() => logger.getLoggerByGroup('test:case')).toThrow(
  'must use lowercase dot namespaces without package identifiers',
);
expect(() => logger.getLoggerByGroup('runtime.react_dom')).not.toThrow();
```

#### Case C2：logger cache

```ts
setScopedLoggerConfig(' cache-scope ', { levels: ['warn'] });

const loggerA = createScopedLogger({ main: ' @docs-islands/test ' }, 'cache-scope');
const loggerB = createScopedLogger({ main: '@docs-islands/test' }, ' cache-scope ');
expect(loggerA).toBe(loggerB);

const groupA = loggerA.getLoggerByGroup(' test.cache.a ');
const groupB = loggerB.getLoggerByGroup('test.cache.a');
const groupC = loggerB.getLoggerByGroup('test.cache.b');
expect(groupA).toBe(groupB);
expect(groupA).not.toBe(groupC);
```

#### Case C3：scoped config 注册、查询、重置

```ts
const scopeId = 'test-scope-a';
expect(getScopedLoggerConfig(scopeId)).toBeUndefined();
expect(() => createScopedLogger({ main: '@docs-islands/test' }, scopeId)).toThrow(
  'Logger config for scope "test-scope-a" is not registered in this runtime.',
);

setScopedLoggerConfig(scopeId, { levels: ['error'] });
expect(getScopedLoggerConfig(scopeId)).toEqual({ levels: ['error'] });

const logger = createScopedLogger({ main: '@docs-islands/test' }, scopeId).getLoggerByGroup(
  'test.scope.a',
);
logger.warn('hidden', ELAPSED);
logger.error('visible', ELAPSED);

resetScopedLoggerConfig(scopeId);
expect(getScopedLoggerConfig(scopeId)).toBeUndefined();
```

输出：

```bash
@docs-islands/test[test.scope.a]: visible
```

#### Case C4：scope 隔离

```ts
setScopedLoggerConfig('scope-warn', { levels: ['warn'] });
setScopedLoggerConfig('scope-error', { levels: ['error'] });
```

同一 main/group 在不同 scope 下按各自配置输出：

```bash
@docs-islands/test[test.scope.same]: warn scope visible
@docs-islands/test[test.scope.same]: error scope visible
```

#### Case C5：scoped registry 保留原始 config

```ts
const rawConfig = { levels: ['warn'] } satisfies LoggerConfig;

setScopedLoggerConfig('raw-scope', rawConfig);
expect(getScopedLoggerConfig('raw-scope')).toBe(rawConfig);
```

该 scope 的 registry entry 同时保存原始 `config` 与内部 `compiledConfig`；公开读取只返回原始 config。

#### Case C6：`shouldSuppressLog` 与 runtime 判定一致

```ts
setScopedLoggerConfig('suppress-scope', {
  debug: true,
  levels: ['warn', 'error'],
  rules: {
    WarnOnly: {
      group: 'test.suppress',
      message: '*visible*',
      levels: ['warn'],
    },
  },
});

expect(
  shouldSuppressLog(
    'warn',
    {
      main: '@docs-islands/test',
      group: 'test.suppress',
      message: 'visible path',
    },
    'suppress-scope',
  ),
).toBe(false);

expect(
  shouldSuppressLog(
    'error',
    {
      main: '@docs-islands/test',
      group: 'test.suppress',
      message: 'visible path',
    },
    'suppress-scope',
  ),
).toBe(true);

expect(
  shouldSuppressLog(
    'warn',
    {
      main: '@docs-islands/test',
      group: 'test.suppress',
    },
    'suppress-scope',
  ),
).toBe(true);

expect(
  shouldSuppressLog(
    'debug',
    {
      main: '@docs-islands/test',
      group: 'test.suppress',
      message: 'visible path',
    },
    'suppress-scope',
  ),
).toBe(true);
```

### D. Console 输出

#### Case D1：console method 映射

```ts
setLoggerConfig({ debug: true });
const logger = createLogger({ main: '@docs-islands/test' }).getLoggerByGroup('test.console');

logger.debug('debug message');
logger.info('info message', ELAPSED);
logger.success('success message', ELAPSED);
logger.warn('warn message', ELAPSED);
logger.error('error message', ELAPSED);

expect(console.debug).toHaveBeenCalledTimes(1);
expect(console.log).toHaveBeenCalledTimes(2);
expect(console.warn).toHaveBeenCalledTimes(1);
expect(console.error).toHaveBeenCalledTimes(1);
```

#### Case D2：Node 输出格式与 elapsed append 条件

```ts
setLoggerConfig({
  debug: true,
  rules: {
    Label: { levels: ['warn'] },
  },
});
```

输出：

```bash
[Label] @docs-islands/test[test.node.format]: without elapsed
[Label] @docs-islands/test[test.node.format]: with elapsed <TIME>
```

断言前必须 strip ANSI。未传 `elapsedTimeMs` 时不追加耗时。

#### Case D3：Browser styled console 输出格式

```ts
(globalThis as any).window = {};
(globalThis as any).document = {};

setLoggerConfig({
  debug: true,
  rules: {
    BrowserLabel: { levels: ['error'] },
  },
});
```

断言：

```ts
expect(console.error).toHaveBeenCalledWith(
  '[BrowserLabel] %c@docs-islands/test%c[%ctest.browser.format%c]: %cbrowser error 42.00ms',
  expect.any(String),
  expect.any(String),
  expect.any(String),
  expect.any(String),
  expect.any(String),
);
```

### E. Preset plugin merge

#### Case E1：`extends` 导入 plugin config

```ts
const plugin = {
  rules: {
    api: { main: '@docs-islands/api', group: 'api.fetch' },
  },
  configs: {
    recommended: {
      rules: {
        api: { levels: 'inherit' },
      },
    },
  },
} satisfies LoggerPresetPlugin;

setLoggerConfig({
  debug: true,
  levels: ['warn', 'error'],
  plugins: { test: plugin },
  extends: ['test/recommended'],
});
```

输出 label 使用 `<plugin>/<rule>`：

```bash
[test/api] @docs-islands/api[api.fetch]: warn visible <TIME>
[test/api] @docs-islands/api[api.fetch]: error visible <TIME>
```

#### Case E2：导入后用户可覆盖 `levels` / `message`，但不能覆盖 `main` / `group`

```ts
setLoggerConfig({
  debug: true,
  levels: ['warn', 'error'],
  plugins: { test: plugin },
  extends: ['test/recommended'],
  rules: {
    'test/api': {
      message: '*failed*',
      levels: ['error'],
    },
  },
});
```

只有 failed error 输出：

```bash
[test/api] @docs-islands/api[api.fetch]: request failed <TIME>
```

非法覆盖：

```ts
expect(() =>
  resolveLoggerConfig({
    plugins: { test: plugin },
    extends: ['test/recommended'],
    rules: {
      'test/api': { main: '@docs-islands/other', levels: ['warn'] },
    },
  }),
).toThrow('The user rule cannot override "test/api" plugin rule\'s main and group fields.');

expect(() =>
  resolveLoggerConfig({
    plugins: { test: plugin },
    extends: ['test/recommended'],
    rules: {
      'test/api': { group: 'api.other', levels: ['warn'] },
    },
  }),
).toThrow('The user rule cannot override "test/api" plugin rule\'s main and group fields.');
```

#### Case E3：多个 `extends` 按声明顺序 merge，后者覆盖或删除前者

```ts
const plugin = {
  rules: { api: { main: '@docs-islands/api', group: 'api.fetch' } },
  configs: {
    warn: { rules: { api: { levels: ['warn'], message: '*slow*' } } },
    error: { rules: { api: { levels: ['error'], message: '*failed*' } } },
    off: { rules: { api: 'off' } },
  },
} satisfies LoggerPresetPlugin;
```

`extends: ['test/warn', 'test/error']` 时只输出 failed error；`extends: ['test/warn', 'test/off']` 时无 active rules，回到 root fallback。

#### Case E4：直接启用 plugin rule 可覆盖 template 的 `main` / `group`

当 plugin rule 之前没有通过 `extends` 进入 merge map，直接在 public `rules` 中启用时，当前实现允许 body 覆盖 template scope：

```ts
setLoggerConfig({
  debug: true,
  plugins: {
    test: {
      rules: {
        api: { main: '@docs-islands/api', group: 'api.fetch' },
      },
    },
  },
  rules: {
    'test/api': {
      main: '@docs-islands/override',
      group: 'api.override',
      levels: ['warn'],
    },
  },
});
```

输出：

```bash
[test/api] @docs-islands/override[api.override]: override visible <TIME>
```

#### Case E5：plugin rule template 的 `levels` 被忽略

```ts
setLoggerConfig({
  debug: true,
  levels: ['error'],
  plugins: {
    test: {
      rules: {
        api: {
          main: '@docs-islands/api',
          group: 'api.fetch',
          levels: ['warn'],
        },
      },
    },
  },
  rules: {
    'test/api': { levels: 'inherit' },
  },
});
```

输出：

```bash
[test/api] @docs-islands/api[api.fetch]: root inherited error <TIME>
```

`template levels ignored` 的 warn 不输出。

#### Case E6：plugin / extends 输入错误

必须覆盖以下错误：

```ts
expect(() => resolveLoggerConfig({ plugins: [] as any })).toThrow(
  'logger.plugins must be an object map.',
);
expect(() => resolveLoggerConfig({ plugins: { 'bad/name': { rules: {} } } as any })).toThrow(
  'cannot contain "/".',
);
expect(() => resolveLoggerConfig({ plugins: { test: {} as any } })).toThrow(
  'must be a logger preset plugin with a rules object.',
);
expect(() =>
  resolveLoggerConfig({
    plugins: { test: { rules: {} } },
    extends: ['missing/recommended'] as any,
  }),
).toThrow('references unknown logger plugin');
expect(() =>
  resolveLoggerConfig({ plugins: { test: { rules: {} } }, extends: ['test/missing'] as any }),
).toThrow('references unknown logger plugin config');
expect(() =>
  resolveLoggerConfig({
    plugins: { test: { rules: {} } },
    rules: { 'test/missing': { levels: ['warn'] } },
  }),
).toThrow('references unknown logger plugin rule');
```

### F. Build plugin 与 tree-shaking

#### Case F1：`loggerPlugin` 注入 runtime defines 并注册默认 scope

对 `loggerPlugin.vite({ config })`：

1. `vite.config` hook 应向 `config.define` 写入：
   - `__DOCS_ISLANDS_DEFAULT_LOGGER_CONTROLLED__ = 'true'`
   - `__DOCS_ISLANDS_DEFAULT_LOGGER_CONFIG__ = JSON.stringify(config)`
2. plugin factory 会对 default scope 调用 `setScopedLoggerConfig('__default__', config)`，因此 transform 阶段的 `shouldSuppressLog` 可读取同一配置。
3. `config` 省略或显式传 `null` 时，当前实现都使用 `DEFAULT_LOGGER_CONFIG`，而不是注入 `null`。
4. runtime 被 define 标记为 controlled 后，`setLoggerConfig`、`resetLoggerConfig` 都应抛出 controlled runtime 错误。该断言需要在经过 define 替换的模块评估环境中执行，不要尝试通过 `globalThis` 模拟 declared compile-time constants。

#### Case F2：tree-shaking 移除静态可证明 suppressed 的独立调用

```ts
setScopedLoggerConfig('__default__', { levels: ['error'] });

const input = `
import { createLogger } from '@docs-islands/logger';
const logger = createLogger({ main: '@docs-islands/test' }).getLoggerByGroup('tree.static');
logger.info('hidden info');
logger.warn('hidden warn');
logger.error('visible error');
`;

const result = await transformLoggerTreeShaking(input, 'input.ts', {
  loggerModuleId: '@docs-islands/logger',
  loggerScopeId: '__default__',
});

expect(result?.code).not.toContain("logger.info('hidden info');");
expect(result?.code).not.toContain("logger.warn('hidden warn');");
expect(result?.code).toContain("logger.error('visible error');");
expect(result?.map).toBeDefined();
```

#### Case F3：tree-shaking 在 rule-mode 中也移除静态 suppressed 调用

```ts
setScopedLoggerConfig('__default__', {
  debug: true,
  rules: {
    ErrorOnly: { group: 'tree.rule', levels: ['error'] },
  },
});
```

`logger.debug('hidden debug')`、`logger.warn('hidden warn')`、`logger.error('visible error')` 中，前两个被移除，error 保留。

#### Case F4：tree-shaking 保守保留动态或不安全调用

以下形态均必须保留；没有移除时返回 `null`：

```ts
import { createLogger as makeLogger } from '@docs-islands/logger';
import { createLogger } from '@docs-islands/logger';

const main = '@docs-islands/test';
const group = 'tree.dynamic';
const message = 'hidden info';

const aliasLogger = makeLogger({ main: '@docs-islands/test' }).getLoggerByGroup('tree.alias');
const dynamicMainLogger = createLogger({ main }).getLoggerByGroup('tree.dynamic');
const dynamicGroupLogger = createLogger({ main: '@docs-islands/test' }).getLoggerByGroup(group);
const dynamicMessageLogger = createLogger({ main: '@docs-islands/test' }).getLoggerByGroup(
  'tree.dynamic',
);
let mutableLogger = createLogger({ main: '@docs-islands/test' }).getLoggerByGroup('tree.mutable');

aliasLogger.info('hidden info');
dynamicMainLogger.info('hidden info');
dynamicGroupLogger.info('hidden info');
dynamicMessageLogger.info(message);
mutableLogger.info('hidden info');
const result = dynamicMessageLogger.info('hidden info');
dynamicMessageLogger['info']('hidden info');
```

#### Case F5：tree-shaking 无关输入与参数错误

```ts
await expect(
  transformLoggerTreeShaking('const x = 1;', 'input.ts', {
    loggerModuleId: '@docs-islands/logger',
    loggerScopeId: '__default__',
  }),
).resolves.toBeNull();

await expect(
  transformLoggerTreeShaking('import { createLogger } from "other";', 'input.ts', {
    loggerModuleId: '@docs-islands/logger',
    loggerScopeId: '__default__',
  }),
).resolves.toBeNull();

await expect(
  transformLoggerTreeShaking(
    'import { createLogger as createLogger } from "@docs-islands/logger"; syntax ?',
    'input.ts',
    {
      loggerModuleId: '@docs-islands/logger',
      loggerScopeId: '__default__',
    },
  ),
).resolves.toBeNull();

await expect(
  transformLoggerTreeShaking('', 'input.ts', {
    loggerModuleId: '   ',
    loggerScopeId: '__default__',
  }),
).rejects.toThrow('logger tree-shaking requires a non-empty loggerModuleId.');
```

## 4. 覆盖矩阵

| 能力                                         | Cases                           |
| -------------------------------------------- | ------------------------------- |
| public config 标准化                         | A1-A6, A9                       |
| resolved config 标准化                       | A7-A8, C5                       |
| root levels / rule levels / default fallback | A1, A2, A5, A8, B1-B6, B12, B15 |
| `off` 删除                                   | A6, E3                          |
| rule-mode allowlist 与 no fallback           | B4-B11, B15-B16                 |
| main/group/message 匹配                      | B7-B14                          |
| debug labels 与 elapsed time                 | B2, B4-B6, B8-B16, D2-D3        |
| logger main/group 校验与 cache               | C1-C2                           |
| scoped API 与 registry                       | C3-C6                           |
| console method 与 Node/Browser 格式          | D1-D3                           |
| preset plugin merge                          | E1-E6                           |
| build plugin runtime defines                 | F1                              |
| static tree-shaking                          | F2-F5                           |

## 5. 维护规则

1. 新增测试必须先声明使用 public config 还是 resolved config，不能混用规则形态。
2. public rules 永远写 object map；resolved rules 才写 array。
3. public rule object 永远显式写 `levels`，继承根 levels 时写 `levels: 'inherit'`。
4. 对 runtime 输出断言，Node 环境必须先 strip ANSI；Browser 环境断言 `%c` 模板与 style 参数个数。
5. 对 `<TIME>` 的预期必须由 `logger.warn('msg', { elapsedTimeMs: 42 })` 这类调用触发。
6. 只测试工具函数的 runtime 可观察效果；不要为 helper formatter 增加独立规范用例。
7. 修改 rule matching 时至少运行 A、B、C6、F2-F4；修改 plugin merge 时至少运行 E；修改 console 输出时至少运行 D；修改 build plugin 或 transform 时至少运行 F。
