# Logger 规则匹配测试规范

## 1. 规范前提

以下语义被视为本测试文档的前提；若实现与此前提不一致，则测试应视为失败或规范待修订。

### 1.1 Rule 结构

```ts
export interface LoggerRule {
  enabled?: boolean;
  group?: string;
  label: string;
  levels?: LoggerVisibilityLevel[];
  main?: string;
  message?: string;
}
```

### 1.2 `enabled` 语义

- `enabled` 默认值为 `true`
- 当用户未指定 `enabled` 时，等价于 `enabled: true`
- 当 `enabled: false` 时，该 rule **完全不起作用**
- “完全不起作用”的含义是：
  1. 不参与 scope 匹配
  2. 不参与 level 放行判定
  3. 不参与 debug label 输出
- 因此，在规则求值时应先做预过滤：

```ts
const activeRules = logging.rules.filter((rule) => rule.enabled !== false);
```

### 1.3 生效 levels

当 `logging.rules` 经过标准化后存在时，对 **activeRules** 计算：

```ts
effectiveLevels(rule) = rule.levels ?? logging.levels ?? defaultResolvedLevels;
```

`defaultResolvedLevels` 为 `error | warn | info | success`。

### 1.4 输出判定（存在 `logging.rules` 时）

对于一条日志消息 `(main, group, level, message)`：

1. 先标准化 `logging.rules`；空数组按“未配置 rules”处理
2. 从标准化后的 `logging.rules` 中滤掉 `enabled: false` 的 rule，得到 `activeRules`
3. 从 `activeRules` 中筛选出所有 **scope 命中**的 rule
4. scope 命中规则：
   - 若 rule 声明了 `main`，则 `main` 必须命中
   - 若 rule 声明了 `group`，则 `group` 必须命中
   - 若 rule 声明了 `message`，则 `message` 必须命中
   - 多个已声明字段之间为 **AND**
5. 若当前日志 `level` 命中任意一条已命中 rule 的 `effectiveLevels(rule)`，则输出
6. 当标准化后的 `logging.rules` 存在时，是否输出**只看 activeRules**；不会 fallback 到全局默认 level 判定

> 重要：
>
> - `logging.rules === undefined` 与 “标准化后存在 `rules` 但全部被 `enabled: false` 过滤掉” 不是同一语义
> - 前者走“无 `rules` 默认行为”
> - 后者走“有 `rules` 但无 active rule”，因此**不输出**

### 1.5 默认输出行为（不存在 `logging.rules` 时）

当用户**没有配置** `logging.rules` 时：

- 如果也没有配置 `logging.levels`：
  - `debug = false`：默认输出 `error | warn | info | success`
  - `debug = true`：默认输出 `error | warn | info | success | debug`
- 如果配置了 `logging.levels`：
  - 非 debug 日志输出遵循 `logging.levels`
  - `debug` 级别输出由 `debug = true` 控制

> 注：
>
> - 本文档按“未配置 `logging.rules`”理解为标准化后的 `logging.rules === undefined`
> - `rules: []` 会标准化为“未配置 rules”，因此与 `rules === undefined` 走相同默认行为

### 1.6 debug 语义

- `debug = false`：输出普通日志前缀
- `debug = true`：
  - 若存在 contributing rules，则在普通日志前缀前附加**当前这条消息 scope 与 level 都命中的 active rule labels**
  - 对 `error | warn | info | success` 四类日志，在**消息末尾额外附加相对耗时**
  - 相对耗时以 `ms` 展示，例如 `12.34ms`
  - `debug` 级别日志是否附加耗时，当前仅按补充信息约束为：**不强制要求**

### 1.7 测试中的耗时固定方式

为保证 debug 场景可重复断言，本文档统一要求：

- 所有预期包含 `<TIME>` 的 debug 用例都必须提供确定性的 logger 相对耗时
- 预期输出中的 `<TIME>` 为相对耗时字段的占位符
- 实现应以 `ms` 格式输出该字段，例如 `42.00ms`
- 测试可以通过 `LoggerLogOptions.elapsedTimeMs` 直接提供确定性数值，也可以在使用耗时 helper 时通过 fake timers / mock monotonic clock 间接提供
- 高风险与补充性合规测试应通过**标准化完整输出断言**校验该值
- Node.js 场景中，测试应先剥离 ANSI 颜色转义序列，再进行完整输出比较

> 也就是说：本文档关注的是“**需要携带确定性的相对耗时**”，并要求以 `ms` 展示。宽矩阵用例仍可使用调用次数、顺序、模式断言；新增的严格覆盖应优先使用标准化完整输出断言。

### 1.8 匹配语义

本文档统一采用如下匹配语义：

- `main`：**仅支持准确匹配**
- `group`：支持**准确匹配**与 **match 匹配**
- `message`：支持**准确匹配**与 **match 匹配**

#### 1.8.1 `main`

- `main` 不支持 picomatch
- 仅按字符串全等匹配

#### 1.8.2 `group` / `message`

- 当 pattern 中**不包含 glob magic** 时，按**准确匹配**
- 当 pattern 中包含 glob magic 时，按 **picomatch** 语义匹配
- 本文档显式覆盖的 glob magic 包括：
  - `*`
  - `?`
  - 字符类 `[]`

> 注：
>
> - 实际实现既然基于 picomatch，理论上还支持更丰富的 glob 语法
> - 但本测试文档只对已显式覆盖的语法承担规范承诺
> - 对 extglob、brace expansion 等高级能力，若实现要作为稳定行为暴露，建议再补独立 case

#### 1.8.3 示例

- `group = 'test.case.a'` 仅匹配 `test.case.a`
- `group = 'test.case.*'` 匹配 `test.case.a`、`test.case.b_1`
- `message = 'request timeout'` 仅匹配 `request timeout`
- `message = '*timeout*'` 匹配 `request timeout`
- `group = 'test.case.?1'` 可匹配 `test.case.a1`
- `message = 'task-[ab]'` 可匹配 `task-a`、`task-b`

### 1.9 本文档的覆盖承诺

本文档覆盖以下规则形态与运行时行为：

1. `enabled`

   - 缺失（默认 `true`）
   - 显式 `true`
   - 显式 `false`

2. `main`

   - 缺失
   - 准确匹配

3. `group`

   - 缺失
   - 准确匹配
   - picomatch match 匹配

4. `message`

   - 缺失
   - 准确匹配
   - picomatch match 匹配

5. `levels` 来源

   - 继承 `logging.levels`
   - 使用 `rule.levels`
   - `rule.levels` 与 `logging.levels` 均缺失时 fallback 到 `defaultResolvedLevels`
   - 无 `rules` 时走默认输出行为

6. level 类型

   - `error`
   - `warn`
   - `info`
   - `success`
   - `debug`（仅无 `rules` 且 `debug = true` 的默认行为）

7. debug 输出增强
   - rule labels
   - 相对耗时 `<TIME>`

### 1.10 未在本文档中定义的行为

以下行为当前**不纳入规范承诺**，只能视为待补充测试前的开放项：

- `main` 是否未来会支持 match
- `message` / `group` 的大小写敏感性
- `*` / `?` / `[]` 在多行字符串 message 上的行为
- 空字符串 `message` 的匹配行为
- 超出已显式覆盖的 `*`、`?`、`[]` 之外的 picomatch 语法稳定语义

---

## 2. 审查结论

### 2.1 完整性

当前测试集已经覆盖：

- 默认 `enabled = true`
- 显式 `enabled = true`
- 显式 `enabled = false`
- 默认 `levels` 继承
- 默认 resolved levels fallback
- `rule.levels` 显式覆盖
- 无 scope rule
- `main` 准确匹配
- `group` 准确匹配
- `group` picomatch 匹配
- `message` 准确匹配
- `message` picomatch 匹配
- `main + group`
- `main + message`
- `group + message`
- `main + group + message`
- 无 `rules` 时的默认输出
- `rules: []` 标准化为无 rules 行为
- debug label 输出与顺序
- debug 下相对耗时后缀，以及严格/补充断言中的固定值
- `success` / `debug` 级别的关键行为
- `enabled: false` 对匹配、放行、label 的全面屏蔽

### 2.2 可靠性

当前测试集不仅验证“应该输出”，也验证“不得输出”，覆盖了：

- scope 不命中
- level 不命中
- message 不命中
- group 不命中
- main 不命中
- 多条件组合中任一字段不命中的反例
- 无 `rules` 时 debug / non-debug 的默认差异
- 高风险与补充 debug 场景的标准化完整输出断言
- picomatch 基础 magic（`*`, `?`, `[]`）的冒烟验证
- `enabled: false` 下：
  - 单 rule 失效
  - 多 rule 重叠时不参与 union
  - 不参与 label
  - 全字段命中仍无效

### 2.3 组合覆盖要求

按本次修订要求：

- `message` 与 `group` 均支持 **准确匹配** 与 **match 匹配**
- `main` 仅支持 **准确匹配**
- `main / group / message / levels` 的组合项必须完全覆盖
- `enabled` 的默认、显式 true、显式 false 必须被覆盖
- debug 模式下 `error | warn | info | success` 必须携带相对耗时信息
- 无 `rules` 时必须按默认级别集合输出

本文档末尾的覆盖矩阵已对上述要求进行逐项映射。

---

## 3. 测试用例

## Case 1

验证点：

- 无 scope 限制的 rule 命中全部日志
- `rule.levels` 缺失时继承 `logging.levels`
- 多个 rule 同时命中时，debug label 全部展示

```ts [config.ts]
const logging = {
  debug: false,
  levels: ['warn', 'error'],
  rules: [
    {
      label: 'Test1',
    },
    {
      label: 'Test2',
    },
  ],
};
```

```ts [user.ts]
const Logger_A = createLogger({
  main: '@docs-islands/test',
}).getLoggerByGroup('test.case.a');

Logger_A.info('message A_a');
Logger_A.warn('message A_b_1');
Logger_A.warn('message A_b_2');
Logger_A.error('message A_c');
```

输出结果：

```bash
@docs-islands/test[test.case.a]: message A_b_1
@docs-islands/test[test.case.a]: message A_b_2
@docs-islands/test[test.case.a]: message A_c
```

当 `debug = true` 时，输出结果：

```bash
[Test1][Test2] @docs-islands/test[test.case.a]: message A_b_1 <TIME>
[Test1][Test2] @docs-islands/test[test.case.a]: message A_b_2 <TIME>
[Test1][Test2] @docs-islands/test[test.case.a]: message A_c <TIME>
```

---

## Case 2

验证点：

- `rule.levels` 可覆盖默认 `logging.levels`
- 最终允许 level 来自所有命中 rule 的并集

```ts [config.ts]
const logging = {
  debug: false,
  levels: ['warn', 'error'],
  rules: [
    {
      label: 'Test1',
    },
    {
      label: 'Test2',
      levels: ['warn', 'info'],
    },
  ],
};
```

等价于：

```ts [config.ts]
const logging = {
  debug: false,
  rules: [
    {
      label: 'Test1',
      levels: ['warn', 'error'],
    },
    {
      label: 'Test2',
      levels: ['warn', 'info'],
    },
  ],
};
```

```ts [user.ts]
const Logger_A = createLogger({
  main: '@docs-islands/test',
}).getLoggerByGroup('test.case.a');

Logger_A.info('message A_a');
Logger_A.warn('message A_b_1');
Logger_A.warn('message A_b_2');
Logger_A.error('message A_c');
```

输出结果：

```bash
@docs-islands/test[test.case.a]: message A_a
@docs-islands/test[test.case.a]: message A_b_1
@docs-islands/test[test.case.a]: message A_b_2
@docs-islands/test[test.case.a]: message A_c
```

当 `debug = true` 时，输出结果：

```bash
[Test2] @docs-islands/test[test.case.a]: message A_a <TIME>
[Test1][Test2] @docs-islands/test[test.case.a]: message A_b_1 <TIME>
[Test1][Test2] @docs-islands/test[test.case.a]: message A_b_2 <TIME>
[Test1] @docs-islands/test[test.case.a]: message A_c <TIME>
```

---

## Case 3

验证点：

- `main` 支持 scope 匹配
- 未声明 `main` 的 rule 为全局 rule
- 多 rule 命中时按 union 放行

```ts [config.ts]
const logging = {
  debug: false,
  levels: ['warn', 'error'],
  rules: [
    {
      label: 'Test1',
      levels: ['warn'],
    },
    {
      label: 'Test2',
      main: '@docs-islands/test',
    },
    {
      label: 'Test3',
      levels: ['warn', 'info'],
      main: '@docs-islands/test_b',
    },
    {
      label: 'Test4',
      levels: ['error'],
      main: '@docs-islands/test_b',
    },
  ],
};
```

等价于：

```ts [config.ts]
const logging = {
  debug: false,
  rules: [
    {
      label: 'Test1',
      levels: ['warn'],
    },
    {
      label: 'Test2',
      main: '@docs-islands/test',
      levels: ['warn', 'error'],
    },
    {
      label: 'Test3',
      levels: ['warn', 'info'],
      main: '@docs-islands/test_b',
    },
    {
      label: 'Test4',
      levels: ['error'],
      main: '@docs-islands/test_b',
    },
  ],
};
```

```ts [user.ts]
const Logger_A = createLogger({
  main: '@docs-islands/test',
}).getLoggerByGroup('test.case.a');

const Logger_B = createLogger({
  main: '@docs-islands/test_b',
}).getLoggerByGroup('test.case.b');

Logger_A.info('message A_a');
Logger_A.warn('message A_b_1');
Logger_A.warn('message A_b_2');
Logger_A.error('message A_c');

Logger_B.info('message B_a');
Logger_B.warn('message B_b_1');
Logger_B.warn('message B_b_2');
Logger_B.error('message B_c');
```

输出结果：

```bash
@docs-islands/test[test.case.a]: message A_b_1
@docs-islands/test[test.case.a]: message A_b_2
@docs-islands/test[test.case.a]: message A_c
@docs-islands/test_b[test.case.b]: message B_a
@docs-islands/test_b[test.case.b]: message B_b_1
@docs-islands/test_b[test.case.b]: message B_b_2
@docs-islands/test_b[test.case.b]: message B_c
```

当 `debug = true` 时，输出结果：

```bash
[Test1][Test2] @docs-islands/test[test.case.a]: message A_b_1 <TIME>
[Test1][Test2] @docs-islands/test[test.case.a]: message A_b_2 <TIME>
[Test2] @docs-islands/test[test.case.a]: message A_c <TIME>
[Test3] @docs-islands/test_b[test.case.b]: message B_a <TIME>
[Test1][Test3] @docs-islands/test_b[test.case.b]: message B_b_1 <TIME>
[Test1][Test3] @docs-islands/test_b[test.case.b]: message B_b_2 <TIME>
[Test4] @docs-islands/test_b[test.case.b]: message B_c <TIME>
```

---

## Case 4

验证点：

- `group` 支持 scope 匹配
- `group` 匹配与 `main` 无关，除非 rule 同时声明 `main`
- `group` 不命中时无输出

```ts [config.ts]
const logging = {
  debug: false,
  levels: ['warn', 'error'],
  rules: [
    {
      label: 'Test1',
      group: 'test.case.a',
    },
  ],
};
```

等价于：

```ts [config.ts]
const logging = {
  debug: false,
  rules: [
    {
      label: 'Test1',
      group: 'test.case.a',
      levels: ['warn', 'error'],
    },
  ],
};
```

```ts [user.ts]
const Logger_A = createLogger({
  main: '@docs-islands/test',
}).getLoggerByGroup('test.case.a');

const Logger_B = createLogger({
  main: '@docs-islands/test_b',
}).getLoggerByGroup('test.case.a');

const Logger_A_B = createLogger({
  main: '@docs-islands/test',
}).getLoggerByGroup('test.case.b');

Logger_A.info('message A_a');
Logger_A.warn('message A_b_1');
Logger_A.warn('message A_b_2');
Logger_A.error('message A_c');

Logger_B.info('message B_a');
Logger_B.warn('message B_b_1');
Logger_B.warn('message B_b_2');
Logger_B.error('message B_c');

Logger_A_B.info('message A_B_a');
Logger_A_B.warn('message A_B_b_1');
Logger_A_B.warn('message A_B_b_2');
Logger_A_B.error('message A_B_c');
```

输出结果：

```bash
@docs-islands/test[test.case.a]: message A_b_1
@docs-islands/test[test.case.a]: message A_b_2
@docs-islands/test[test.case.a]: message A_c
@docs-islands/test_b[test.case.a]: message B_b_1
@docs-islands/test_b[test.case.a]: message B_b_2
@docs-islands/test_b[test.case.a]: message B_c
```

当 `debug = true` 时，输出结果：

```bash
[Test1] @docs-islands/test[test.case.a]: message A_b_1 <TIME>
[Test1] @docs-islands/test[test.case.a]: message A_b_2 <TIME>
[Test1] @docs-islands/test[test.case.a]: message A_c <TIME>
[Test1] @docs-islands/test_b[test.case.a]: message B_b_1 <TIME>
[Test1] @docs-islands/test_b[test.case.a]: message B_b_2 <TIME>
[Test1] @docs-islands/test_b[test.case.a]: message B_c <TIME>
```

---

## Case 5

验证点：

- `group` 支持 `*` 通配
- 多个 group rule 可同时命中
- `message` 未参与限制时，不影响放行

```ts [config.ts]
const logging = {
  debug: false,
  levels: ['warn', 'error'],
  rules: [
    {
      label: 'Test1',
      group: 'test.case.b*',
    },
    {
      label: 'Test2',
      group: 'test.case.*',
      levels: ['warn'],
    },
    {
      label: 'Test3',
      group: 'test.*',
      levels: ['info'],
    },
    {
      label: 'Test4',
      group: 'test.*',
      levels: ['error'],
    },
  ],
};
```

等价于：

```ts [config.ts]
const logging = {
  debug: false,
  rules: [
    {
      label: 'Test1',
      group: 'test.case.b*',
      levels: ['warn', 'error'],
    },
    {
      label: 'Test2',
      group: 'test.case.*',
      levels: ['warn'],
    },
    {
      label: 'Test3',
      group: 'test.*',
      levels: ['info'],
    },
    {
      label: 'Test4',
      group: 'test.*',
      levels: ['error'],
    },
  ],
};
```

```ts [user.ts]
const Logger_A = createLogger({
  main: '@docs-islands/test',
}).getLoggerByGroup('test.case.a');

const Logger_B = createLogger({
  main: '@docs-islands/test_b',
}).getLoggerByGroup('test.case.b_1');

const Logger_A_B = createLogger({
  main: '@docs-islands/test',
}).getLoggerByGroup('test.case.b_2');

const Logger_A_B_C = createLogger({
  main: '@docs-islands/test_c',
}).getLoggerByGroup('test.c');

Logger_A.info('message A_a');
Logger_A.warn('message A_b_1');
Logger_A.warn('message A_b_2');
Logger_A.error('message A_c');

Logger_B.info('message B_a');
Logger_B.warn('message B_b_1');
Logger_B.warn('message B_b_2');
Logger_B.error('message B_c');

Logger_A_B.info('message A_B_a');
Logger_A_B.warn('message A_B_b_1');
Logger_A_B.warn('message A_B_b_2');
Logger_A_B.error('message A_B_c');

Logger_A_B_C.info('message A_B_C_a');
Logger_A_B_C.warn('message A_B_C_b_1');
Logger_A_B_C.warn('message A_B_C_b_2');
Logger_A_B_C.error('message A_B_C_c');
```

输出结果：

```bash
@docs-islands/test[test.case.a]: message A_a
@docs-islands/test[test.case.a]: message A_b_1
@docs-islands/test[test.case.a]: message A_b_2
@docs-islands/test[test.case.a]: message A_c
@docs-islands/test_b[test.case.b_1]: message B_a
@docs-islands/test_b[test.case.b_1]: message B_b_1
@docs-islands/test_b[test.case.b_1]: message B_b_2
@docs-islands/test_b[test.case.b_1]: message B_c
@docs-islands/test[test.case.b_2]: message A_B_a
@docs-islands/test[test.case.b_2]: message A_B_b_1
@docs-islands/test[test.case.b_2]: message A_B_b_2
@docs-islands/test[test.case.b_2]: message A_B_c
@docs-islands/test_c[test.c]: message A_B_C_a
@docs-islands/test_c[test.c]: message A_B_C_c
```

当 `debug = true` 时，输出结果：

```bash
[Test3] @docs-islands/test[test.case.a]: message A_a <TIME>
[Test2] @docs-islands/test[test.case.a]: message A_b_1 <TIME>
[Test2] @docs-islands/test[test.case.a]: message A_b_2 <TIME>
[Test4] @docs-islands/test[test.case.a]: message A_c <TIME>
[Test3] @docs-islands/test_b[test.case.b_1]: message B_a <TIME>
[Test1][Test2] @docs-islands/test_b[test.case.b_1]: message B_b_1 <TIME>
[Test1][Test2] @docs-islands/test_b[test.case.b_1]: message B_b_2 <TIME>
[Test1][Test4] @docs-islands/test_b[test.case.b_1]: message B_c <TIME>
[Test3] @docs-islands/test[test.case.b_2]: message A_B_a <TIME>
[Test1][Test2] @docs-islands/test[test.case.b_2]: message A_B_b_1 <TIME>
[Test1][Test2] @docs-islands/test[test.case.b_2]: message A_B_b_2 <TIME>
[Test1][Test4] @docs-islands/test[test.case.b_2]: message A_B_c <TIME>
[Test3] @docs-islands/test_c[test.c]: message A_B_C_a <TIME>
[Test4] @docs-islands/test_c[test.c]: message A_B_C_c <TIME>
```

---

## Case 6

验证点：

- 当 `rules` 存在但没有任何 rule 命中时，不输出
- 不会 fallback 到 `logging.levels`

```ts [config.ts]
const logging = {
  debug: false,
  levels: ['warn', 'error'],
  rules: [
    {
      label: 'Test1',
      group: 'test.case.a',
    },
  ],
};
```

等价于：

```ts [config.ts]
const logging = {
  debug: false,
  rules: [
    {
      label: 'Test1',
      group: 'test.case.a',
      levels: ['warn', 'error'],
    },
  ],
};
```

```ts [user.ts]
const Logger_A = createLogger({
  main: '@docs-islands/test',
}).getLoggerByGroup('test.case.b');

Logger_A.info('message A_a');
Logger_A.warn('message A_b');
Logger_A.error('message A_c');
```

输出结果：

```bash
# 无输出
```

当 `debug = true` 时，输出结果：

```bash
# 无输出
```

---

## Case 7

验证点：

- `main` 和 `group` 同时存在时按 AND 匹配
- 部分字段命中不足以放行

```ts [config.ts]
const logging = {
  debug: false,
  levels: ['warn', 'error'],
  rules: [
    {
      label: 'Test1',
      main: '@docs-islands/test',
      group: 'test.case.a',
    },
    {
      label: 'Test2',
      main: '@docs-islands/test_b',
      group: 'test.case.a',
      levels: ['warn'],
    },
  ],
};
```

等价于：

```ts [config.ts]
const logging = {
  debug: false,
  rules: [
    {
      label: 'Test1',
      main: '@docs-islands/test',
      group: 'test.case.a',
      levels: ['warn', 'error'],
    },
    {
      label: 'Test2',
      main: '@docs-islands/test_b',
      group: 'test.case.a',
      levels: ['warn'],
    },
  ],
};
```

```ts [user.ts]
const Logger_A = createLogger({
  main: '@docs-islands/test',
}).getLoggerByGroup('test.case.a');

const Logger_B = createLogger({
  main: '@docs-islands/test_b',
}).getLoggerByGroup('test.case.a');

const Logger_C = createLogger({
  main: '@docs-islands/test',
}).getLoggerByGroup('test.case.b');

Logger_A.warn('message A_b');
Logger_A.error('message A_c');

Logger_B.warn('message B_b');
Logger_B.error('message B_c');

Logger_C.warn('message C_b');
Logger_C.error('message C_c');
```

输出结果：

```bash
@docs-islands/test[test.case.a]: message A_b
@docs-islands/test[test.case.a]: message A_c
@docs-islands/test_b[test.case.a]: message B_b
```

当 `debug = true` 时，输出结果：

```bash
[Test1] @docs-islands/test[test.case.a]: message A_b <TIME>
[Test1] @docs-islands/test[test.case.a]: message A_c <TIME>
[Test2] @docs-islands/test_b[test.case.a]: message B_b <TIME>
```

---

## Case 8

验证点：

- `message` 支持精确匹配
- `message` 命中后仍需同时满足 level

```ts [config.ts]
const logging = {
  debug: false,
  levels: ['warn', 'error'],
  rules: [
    {
      label: 'Test1',
      message: 'request timeout',
      levels: ['error'],
    },
    {
      label: 'Test2',
      message: 'slow query',
      levels: ['warn'],
    },
  ],
};
```

```ts [user.ts]
const Logger_A = createLogger({
  main: '@docs-islands/test',
}).getLoggerByGroup('test.case.message');

Logger_A.info('slow query');
Logger_A.warn('slow query');
Logger_A.warn('slow query 123');
Logger_A.error('request timeout');
Logger_A.error('request timeout on user api');
```

输出结果：

```bash
@docs-islands/test[test.case.message]: slow query
@docs-islands/test[test.case.message]: request timeout
```

当 `debug = true` 时，输出结果：

```bash
[Test2] @docs-islands/test[test.case.message]: slow query <TIME>
[Test1] @docs-islands/test[test.case.message]: request timeout <TIME>
```

---

## Case 9

验证点：

- `message` 支持 `*` 通配
- 支持 prefix / contains / 中间通配
- 一条消息可以同时命中多个 message rule

```ts [config.ts]
const logging = {
  debug: false,
  rules: [
    {
      label: 'Test1',
      message: 'timeout:*',
      levels: ['warn'],
    },
    {
      label: 'Test2',
      message: '*database*',
      levels: ['error'],
    },
    {
      label: 'Test3',
      message: 'worker * finished',
      levels: ['info'],
    },
    {
      label: 'Test4',
      message: 'timeout:*',
      levels: ['error'],
    },
  ],
};
```

```ts [user.ts]
const Logger_A = createLogger({
  main: '@docs-islands/test',
}).getLoggerByGroup('test.case.message.match');

Logger_A.info('worker sync finished');
Logger_A.warn('timeout: fetch user');
Logger_A.error('primary database unavailable');
Logger_A.error('timeout: database unavailable');
```

输出结果：

```bash
@docs-islands/test[test.case.message.match]: worker sync finished
@docs-islands/test[test.case.message.match]: timeout: fetch user
@docs-islands/test[test.case.message.match]: primary database unavailable
@docs-islands/test[test.case.message.match]: timeout: database unavailable
```

当 `debug = true` 时，输出结果：

```bash
[Test3] @docs-islands/test[test.case.message.match]: worker sync finished <TIME>
[Test1] @docs-islands/test[test.case.message.match]: timeout: fetch user <TIME>
[Test2] @docs-islands/test[test.case.message.match]: primary database unavailable <TIME>
[Test2][Test4] @docs-islands/test[test.case.message.match]: timeout: database unavailable <TIME>
```

---

## Case 10

验证点：

- `main + group + message` 可以组合使用
- 所有已声明条件按 AND 生效
- 不同 rule 可只声明部分条件

```ts [config.ts]
const logging = {
  debug: false,
  rules: [
    {
      label: 'Test1',
      main: '@docs-islands/test',
      group: 'test.api.*',
      message: 'retry *',
      levels: ['warn'],
    },
    {
      label: 'Test2',
      main: '@docs-islands/test',
      group: 'test.api.fetch',
      message: '*timeout*',
      levels: ['error'],
    },
    {
      label: 'Test3',
      group: 'test.api.fetch',
      message: '*timeout*',
      levels: ['warn'],
    },
  ],
};
```

```ts [user.ts]
const Logger_A = createLogger({
  main: '@docs-islands/test',
}).getLoggerByGroup('test.api.fetch');

const Logger_B = createLogger({
  main: '@docs-islands/test_b',
}).getLoggerByGroup('test.api.fetch');

const Logger_C = createLogger({
  main: '@docs-islands/test',
}).getLoggerByGroup('test.api.update');

Logger_A.warn('retry request');
Logger_A.warn('request timeout');
Logger_A.error('request timeout');

Logger_B.warn('request timeout');
Logger_B.error('request timeout');

Logger_C.warn('retry request');
Logger_C.error('request timeout');
```

输出结果：

```bash
@docs-islands/test[test.api.fetch]: retry request
@docs-islands/test[test.api.fetch]: request timeout
@docs-islands/test[test.api.fetch]: request timeout
@docs-islands/test_b[test.api.fetch]: request timeout
@docs-islands/test[test.api.update]: retry request
```

当 `debug = true` 时，输出结果：

```bash
[Test1] @docs-islands/test[test.api.fetch]: retry request <TIME>
[Test3] @docs-islands/test[test.api.fetch]: request timeout <TIME>
[Test2] @docs-islands/test[test.api.fetch]: request timeout <TIME>
[Test3] @docs-islands/test_b[test.api.fetch]: request timeout <TIME>
[Test1] @docs-islands/test[test.api.update]: retry request <TIME>
```

---

## Case 11

验证点：

- 多个 message rule 同时命中时，label 顺序按 rules 声明顺序输出
- 该顺序不受匹配字段类型影响

```ts [config.ts]
const logging = {
  debug: false,
  rules: [
    {
      label: 'Test1',
      message: '*timeout*',
      levels: ['error'],
    },
    {
      label: 'Test2',
      message: 'request *',
      levels: ['error'],
    },
    {
      label: 'Test3',
      message: '*user*',
      levels: ['error'],
    },
  ],
};
```

```ts [user.ts]
const Logger_A = createLogger({
  main: '@docs-islands/test',
}).getLoggerByGroup('test.case.message.order');

Logger_A.error('request timeout user api');
```

输出结果：

```bash
@docs-islands/test[test.case.message.order]: request timeout user api
```

当 `debug = true` 时，输出结果：

```bash
[Test1][Test2][Test3] @docs-islands/test[test.case.message.order]: request timeout user api <TIME>
```

---

## Case 12

验证点：

- `message: '*'` 视为匹配所有消息
- message match-all 仍需受其它 scope 与 level 约束

```ts [config.ts]
const logging = {
  debug: false,
  rules: [
    {
      label: 'Test1',
      group: 'test.audit.*',
      message: '*',
      levels: ['error'],
    },
    {
      label: 'Test2',
      group: 'test.audit.login',
      message: '*failed*',
      levels: ['warn'],
    },
  ],
};
```

```ts [user.ts]
const Logger_A = createLogger({
  main: '@docs-islands/test',
}).getLoggerByGroup('test.audit.login');

const Logger_B = createLogger({
  main: '@docs-islands/test',
}).getLoggerByGroup('test.audit.logout');

Logger_A.warn('login failed');
Logger_A.error('login failed');
Logger_B.warn('logout failed');
Logger_B.error('logout failed');
```

输出结果：

```bash
@docs-islands/test[test.audit.login]: login failed
@docs-islands/test[test.audit.login]: login failed
@docs-islands/test[test.audit.logout]: logout failed
```

当 `debug = true` 时，输出结果：

```bash
[Test2] @docs-islands/test[test.audit.login]: login failed <TIME>
[Test1] @docs-islands/test[test.audit.login]: login failed <TIME>
[Test1] @docs-islands/test[test.audit.logout]: logout failed <TIME>
```

---

## Case 13

验证点：

- `main + group + message` 全部同时存在时按严格 AND 匹配
- 任一条件不命中都不得输出
- 有 `rules` 时，不会 fallback 到全局 levels

```ts [config.ts]
const logging = {
  debug: false,
  levels: ['warn', 'error'],
  rules: [
    {
      label: 'Test1',
      main: '@docs-islands/test',
      group: 'test.payment.*',
      message: '*timeout*',
      levels: ['error'],
    },
  ],
};
```

```ts [user.ts]
const Logger_A = createLogger({
  main: '@docs-islands/test',
}).getLoggerByGroup('test.payment.charge');

const Logger_B = createLogger({
  main: '@docs-islands/test_b',
}).getLoggerByGroup('test.payment.charge');

const Logger_C = createLogger({
  main: '@docs-islands/test',
}).getLoggerByGroup('test.payment.refund');

Logger_A.warn('request timeout');
Logger_A.error('request timeout');
Logger_A.error('request failed');

Logger_B.error('request timeout');
Logger_C.error('request success');
```

输出结果：

```bash
@docs-islands/test[test.payment.charge]: request timeout
```

当 `debug = true` 时，输出结果：

```bash
[Test1] @docs-islands/test[test.payment.charge]: request timeout <TIME>
```

---

## Case 14

验证点：

- 多条 rule 可同时命中同一条 message
- 同一 message 上 exact match 与 wildcard match 可并存
- debug label 顺序仍按 rules 声明顺序

```ts [config.ts]
const logging = {
  debug: false,
  rules: [
    {
      label: 'Test1',
      message: 'request timeout',
      levels: ['error'],
    },
    {
      label: 'Test2',
      message: '*timeout*',
      levels: ['error'],
    },
    {
      label: 'Test3',
      message: 'request *',
      levels: ['error'],
    },
  ],
};
```

```ts [user.ts]
const Logger_A = createLogger({
  main: '@docs-islands/test',
}).getLoggerByGroup('test.case.message.mix');

Logger_A.error('request timeout');
Logger_A.error('request timeout downstream');
```

输出结果：

```bash
@docs-islands/test[test.case.message.mix]: request timeout
@docs-islands/test[test.case.message.mix]: request timeout downstream
```

当 `debug = true` 时，输出结果：

```bash
[Test1][Test2][Test3] @docs-islands/test[test.case.message.mix]: request timeout <TIME>
[Test2][Test3] @docs-islands/test[test.case.message.mix]: request timeout downstream <TIME>
```

---

## Case 15

验证点：

- scope 命中但 message 不命中时，不输出
- message 命中但 level 不命中时，不输出
- 该 case 用于补强 message 维度的反例覆盖

```ts [config.ts]
const logging = {
  debug: false,
  rules: [
    {
      label: 'Test1',
      group: 'test.notify.*',
      message: '*failed*',
      levels: ['warn'],
    },
    {
      label: 'Test2',
      group: 'test.notify.*',
      message: '*timeout*',
      levels: ['error'],
    },
  ],
};
```

```ts [user.ts]
const Logger_A = createLogger({
  main: '@docs-islands/test',
}).getLoggerByGroup('test.notify.email');

Logger_A.info('delivery failed');
Logger_A.warn('delivery success');
Logger_A.warn('delivery failed');
Logger_A.error('delivery failed');
Logger_A.error('request timeout');
```

输出结果：

```bash
@docs-islands/test[test.notify.email]: delivery failed
@docs-islands/test[test.notify.email]: request timeout
```

当 `debug = true` 时，输出结果：

```bash
[Test1] @docs-islands/test[test.notify.email]: delivery failed <TIME>
[Test2] @docs-islands/test[test.notify.email]: request timeout <TIME>
```

---

---

## Case 16

验证点：

- `message` 单独作为过滤条件时，支持准确匹配与 match 匹配
- `message` 单独过滤时，同时覆盖默认 `levels` 与显式 `levels`

```ts [config.ts]
const logging = {
  debug: false,
  levels: ['warn'],
  rules: [
    {
      label: 'Test1',
      message: 'msg.exact.default',
    },
    {
      label: 'Test2',
      message: 'msg.exact.explicit',
      levels: ['info'],
    },
    {
      label: 'Test3',
      message: 'msg.match.default.*',
    },
    {
      label: 'Test4',
      message: 'msg.match.explicit.*',
      levels: ['error'],
    },
  ],
};
```

```ts [user.ts]
const Logger_A = createLogger({
  main: '@docs-islands/test',
}).getLoggerByGroup('test.case.message.cover');

Logger_A.warn('msg.exact.default');
Logger_A.info('msg.exact.explicit');
Logger_A.warn('msg.match.default.1');
Logger_A.error('msg.match.explicit.1');

Logger_A.info('msg.exact.default');
Logger_A.warn('msg.exact.explicit');
Logger_A.info('msg.match.default.1');
Logger_A.warn('msg.match.explicit.1');
```

输出结果：

```bash
@docs-islands/test[test.case.message.cover]: msg.exact.default
@docs-islands/test[test.case.message.cover]: msg.exact.explicit
@docs-islands/test[test.case.message.cover]: msg.match.default.1
@docs-islands/test[test.case.message.cover]: msg.match.explicit.1
```

当 `debug = true` 时，输出结果：

```bash
[Test1] @docs-islands/test[test.case.message.cover]: msg.exact.default <TIME>
[Test2] @docs-islands/test[test.case.message.cover]: msg.exact.explicit <TIME>
[Test3] @docs-islands/test[test.case.message.cover]: msg.match.default.1 <TIME>
[Test4] @docs-islands/test[test.case.message.cover]: msg.match.explicit.1 <TIME>
```

---

## Case 17

验证点：

- `main + message` 组合支持准确匹配与 match 匹配
- 同时覆盖默认 `levels` 与显式 `levels`

```ts [config.ts]
const logging = {
  debug: false,
  levels: ['warn'],
  rules: [
    {
      label: 'Test1',
      main: '@docs-islands/test',
      message: 'main-message.exact.default',
    },
    {
      label: 'Test2',
      main: '@docs-islands/test',
      message: 'main-message.exact.explicit',
      levels: ['error'],
    },
    {
      label: 'Test3',
      main: '@docs-islands/test',
      message: 'main-message.match.default.*',
    },
    {
      label: 'Test4',
      main: '@docs-islands/test',
      message: 'main-message.match.explicit.*',
      levels: ['info'],
    },
  ],
};
```

```ts [user.ts]
const Logger_A = createLogger({
  main: '@docs-islands/test',
}).getLoggerByGroup('test.case.main.message');

const Logger_B = createLogger({
  main: '@docs-islands/test_b',
}).getLoggerByGroup('test.case.main.message');

Logger_A.warn('main-message.exact.default');
Logger_A.error('main-message.exact.explicit');
Logger_A.warn('main-message.match.default.1');
Logger_A.info('main-message.match.explicit.1');

Logger_B.warn('main-message.exact.default');
Logger_B.error('main-message.exact.explicit');
Logger_B.warn('main-message.match.default.1');
Logger_B.info('main-message.match.explicit.1');
```

输出结果：

```bash
@docs-islands/test[test.case.main.message]: main-message.exact.default
@docs-islands/test[test.case.main.message]: main-message.exact.explicit
@docs-islands/test[test.case.main.message]: main-message.match.default.1
@docs-islands/test[test.case.main.message]: main-message.match.explicit.1
```

当 `debug = true` 时，输出结果：

```bash
[Test1] @docs-islands/test[test.case.main.message]: main-message.exact.default <TIME>
[Test2] @docs-islands/test[test.case.main.message]: main-message.exact.explicit <TIME>
[Test3] @docs-islands/test[test.case.main.message]: main-message.match.default.1 <TIME>
[Test4] @docs-islands/test[test.case.main.message]: main-message.match.explicit.1 <TIME>
```

---

## Case 18

验证点：

- `group(准确匹配) + message` 组合支持准确匹配与 match 匹配
- 同时覆盖默认 `levels` 与显式 `levels`

```ts [config.ts]
const logging = {
  debug: false,
  levels: ['warn'],
  rules: [
    {
      label: 'Test1',
      group: 'test.case.gx',
      message: 'group-exact-message-exact.default',
    },
    {
      label: 'Test2',
      group: 'test.case.gx',
      message: 'group-exact-message-exact.explicit',
      levels: ['error'],
    },
    {
      label: 'Test3',
      group: 'test.case.gx',
      message: 'group-exact-message-match.default.*',
    },
    {
      label: 'Test4',
      group: 'test.case.gx',
      message: 'group-exact-message-match.explicit.*',
      levels: ['info'],
    },
  ],
};
```

```ts [user.ts]
const Logger_A = createLogger({
  main: '@docs-islands/test',
}).getLoggerByGroup('test.case.gx');

const Logger_B = createLogger({
  main: '@docs-islands/test',
}).getLoggerByGroup('test.case.gy');

Logger_A.warn('group-exact-message-exact.default');
Logger_A.error('group-exact-message-exact.explicit');
Logger_A.warn('group-exact-message-match.default.1');
Logger_A.info('group-exact-message-match.explicit.1');

Logger_B.warn('group-exact-message-exact.default');
Logger_B.error('group-exact-message-exact.explicit');
Logger_B.warn('group-exact-message-match.default.1');
Logger_B.info('group-exact-message-match.explicit.1');
```

输出结果：

```bash
@docs-islands/test[test.case.gx]: group-exact-message-exact.default
@docs-islands/test[test.case.gx]: group-exact-message-exact.explicit
@docs-islands/test[test.case.gx]: group-exact-message-match.default.1
@docs-islands/test[test.case.gx]: group-exact-message-match.explicit.1
```

当 `debug = true` 时，输出结果：

```bash
[Test1] @docs-islands/test[test.case.gx]: group-exact-message-exact.default <TIME>
[Test2] @docs-islands/test[test.case.gx]: group-exact-message-exact.explicit <TIME>
[Test3] @docs-islands/test[test.case.gx]: group-exact-message-match.default.1 <TIME>
[Test4] @docs-islands/test[test.case.gx]: group-exact-message-match.explicit.1 <TIME>
```

---

## Case 19

验证点：

- `group(match) + message` 组合支持准确匹配与 match 匹配
- 同时覆盖默认 `levels` 与显式 `levels`

```ts [config.ts]
const logging = {
  debug: false,
  levels: ['warn'],
  rules: [
    {
      label: 'Test1',
      group: 'test.case.gm*',
      message: 'group-match-message-exact.default',
    },
    {
      label: 'Test2',
      group: 'test.case.gm*',
      message: 'group-match-message-exact.explicit',
      levels: ['error'],
    },
    {
      label: 'Test3',
      group: 'test.case.gm*',
      message: 'group-match-message-match.default.*',
    },
    {
      label: 'Test4',
      group: 'test.case.gm*',
      message: 'group-match-message-match.explicit.*',
      levels: ['info'],
    },
  ],
};
```

```ts [user.ts]
const Logger_A = createLogger({
  main: '@docs-islands/test',
}).getLoggerByGroup('test.case.gm1');

const Logger_B = createLogger({
  main: '@docs-islands/test',
}).getLoggerByGroup('test.case.other');

Logger_A.warn('group-match-message-exact.default');
Logger_A.error('group-match-message-exact.explicit');
Logger_A.warn('group-match-message-match.default.1');
Logger_A.info('group-match-message-match.explicit.1');

Logger_B.warn('group-match-message-exact.default');
Logger_B.error('group-match-message-exact.explicit');
Logger_B.warn('group-match-message-match.default.1');
Logger_B.info('group-match-message-match.explicit.1');
```

输出结果：

```bash
@docs-islands/test[test.case.gm1]: group-match-message-exact.default
@docs-islands/test[test.case.gm1]: group-match-message-exact.explicit
@docs-islands/test[test.case.gm1]: group-match-message-match.default.1
@docs-islands/test[test.case.gm1]: group-match-message-match.explicit.1
```

当 `debug = true` 时，输出结果：

```bash
[Test1] @docs-islands/test[test.case.gm1]: group-match-message-exact.default <TIME>
[Test2] @docs-islands/test[test.case.gm1]: group-match-message-exact.explicit <TIME>
[Test3] @docs-islands/test[test.case.gm1]: group-match-message-match.default.1 <TIME>
[Test4] @docs-islands/test[test.case.gm1]: group-match-message-match.explicit.1 <TIME>
```

---

## Case 20

验证点：

- `main + group(准确匹配) + message` 组合支持准确匹配与 match 匹配
- 同时覆盖默认 `levels` 与显式 `levels`

```ts [config.ts]
const logging = {
  debug: false,
  levels: ['warn'],
  rules: [
    {
      label: 'Test1',
      main: '@docs-islands/test',
      group: 'test.case.mgx',
      message: 'mgx-message-exact.default',
    },
    {
      label: 'Test2',
      main: '@docs-islands/test',
      group: 'test.case.mgx',
      message: 'mgx-message-exact.explicit',
      levels: ['error'],
    },
    {
      label: 'Test3',
      main: '@docs-islands/test',
      group: 'test.case.mgx',
      message: 'mgx-message-match.default.*',
    },
    {
      label: 'Test4',
      main: '@docs-islands/test',
      group: 'test.case.mgx',
      message: 'mgx-message-match.explicit.*',
      levels: ['info'],
    },
  ],
};
```

```ts [user.ts]
const Logger_A = createLogger({
  main: '@docs-islands/test',
}).getLoggerByGroup('test.case.mgx');

const Logger_B = createLogger({
  main: '@docs-islands/test_b',
}).getLoggerByGroup('test.case.mgx');

const Logger_C = createLogger({
  main: '@docs-islands/test',
}).getLoggerByGroup('test.case.other');

Logger_A.warn('mgx-message-exact.default');
Logger_A.error('mgx-message-exact.explicit');
Logger_A.warn('mgx-message-match.default.1');
Logger_A.info('mgx-message-match.explicit.1');

Logger_B.warn('mgx-message-exact.default');
Logger_B.error('mgx-message-exact.explicit');
Logger_B.warn('mgx-message-match.default.1');
Logger_B.info('mgx-message-match.explicit.1');

Logger_C.warn('mgx-message-exact.default');
Logger_C.error('mgx-message-exact.explicit');
Logger_C.warn('mgx-message-match.default.1');
Logger_C.info('mgx-message-match.explicit.1');
```

输出结果：

```bash
@docs-islands/test[test.case.mgx]: mgx-message-exact.default
@docs-islands/test[test.case.mgx]: mgx-message-exact.explicit
@docs-islands/test[test.case.mgx]: mgx-message-match.default.1
@docs-islands/test[test.case.mgx]: mgx-message-match.explicit.1
```

当 `debug = true` 时，输出结果：

```bash
[Test1] @docs-islands/test[test.case.mgx]: mgx-message-exact.default <TIME>
[Test2] @docs-islands/test[test.case.mgx]: mgx-message-exact.explicit <TIME>
[Test3] @docs-islands/test[test.case.mgx]: mgx-message-match.default.1 <TIME>
[Test4] @docs-islands/test[test.case.mgx]: mgx-message-match.explicit.1 <TIME>
```

---

## Case 21

验证点：

- `main + group(match) + message` 组合支持准确匹配与 match 匹配
- 同时覆盖默认 `levels` 与显式 `levels`

```ts [config.ts]
const logging = {
  debug: false,
  levels: ['warn'],
  rules: [
    {
      label: 'Test1',
      main: '@docs-islands/test',
      group: 'test.case.mgm*',
      message: 'mgm-message-exact.default',
    },
    {
      label: 'Test2',
      main: '@docs-islands/test',
      group: 'test.case.mgm*',
      message: 'mgm-message-exact.explicit',
      levels: ['error'],
    },
    {
      label: 'Test3',
      main: '@docs-islands/test',
      group: 'test.case.mgm*',
      message: 'mgm-message-match.default.*',
    },
    {
      label: 'Test4',
      main: '@docs-islands/test',
      group: 'test.case.mgm*',
      message: 'mgm-message-match.explicit.*',
      levels: ['info'],
    },
  ],
};
```

```ts [user.ts]
const Logger_A = createLogger({
  main: '@docs-islands/test',
}).getLoggerByGroup('test.case.mgm1');

const Logger_B = createLogger({
  main: '@docs-islands/test_b',
}).getLoggerByGroup('test.case.mgm1');

const Logger_C = createLogger({
  main: '@docs-islands/test',
}).getLoggerByGroup('test.case.other');

Logger_A.warn('mgm-message-exact.default');
Logger_A.error('mgm-message-exact.explicit');
Logger_A.warn('mgm-message-match.default.1');
Logger_A.info('mgm-message-match.explicit.1');

Logger_B.warn('mgm-message-exact.default');
Logger_B.error('mgm-message-exact.explicit');
Logger_B.warn('mgm-message-match.default.1');
Logger_B.info('mgm-message-match.explicit.1');

Logger_C.warn('mgm-message-exact.default');
Logger_C.error('mgm-message-exact.explicit');
Logger_C.warn('mgm-message-match.default.1');
Logger_C.info('mgm-message-match.explicit.1');
```

输出结果：

```bash
@docs-islands/test[test.case.mgm1]: mgm-message-exact.default
@docs-islands/test[test.case.mgm1]: mgm-message-exact.explicit
@docs-islands/test[test.case.mgm1]: mgm-message-match.default.1
@docs-islands/test[test.case.mgm1]: mgm-message-match.explicit.1
```

当 `debug = true` 时，输出结果：

```bash
[Test1] @docs-islands/test[test.case.mgm1]: mgm-message-exact.default <TIME>
[Test2] @docs-islands/test[test.case.mgm1]: mgm-message-exact.explicit <TIME>
[Test3] @docs-islands/test[test.case.mgm1]: mgm-message-match.default.1 <TIME>
[Test4] @docs-islands/test[test.case.mgm1]: mgm-message-match.explicit.1 <TIME>
```

---

## Case 22

验证点：

- `group` 单独作为过滤条件时，准确匹配同时覆盖默认 `levels` 与显式 `levels`
- 该 case 用于补齐 `group(准确匹配)` 在显式 `rule.levels` 下的独立覆盖

```ts [config.ts]
const logging = {
  debug: false,
  levels: ['warn'],
  rules: [
    {
      label: 'Test1',
      group: 'test.only.exact.default',
    },
    {
      label: 'Test2',
      group: 'test.only.exact.explicit',
      levels: ['error'],
    },
  ],
};
```

```ts [user.ts]
const Logger_A = createLogger({
  main: '@docs-islands/test',
}).getLoggerByGroup('test.only.exact.default');

const Logger_B = createLogger({
  main: '@docs-islands/test',
}).getLoggerByGroup('test.only.exact.explicit');

Logger_A.warn('group exact default');
Logger_A.error('group exact default');

Logger_B.warn('group exact explicit');
Logger_B.error('group exact explicit');
```

输出结果：

```bash
@docs-islands/test[test.only.exact.default]: group exact default
@docs-islands/test[test.only.exact.explicit]: group exact explicit
```

当 `debug = true` 时，输出结果：

```bash
[Test1] @docs-islands/test[test.only.exact.default]: group exact default <TIME>
[Test2] @docs-islands/test[test.only.exact.explicit]: group exact explicit <TIME>
```

---

## Case 23

验证点：

- `main + group(match)` 在**不带 message 条件**时，覆盖默认 `levels` 与显式 `levels`
- 该 case 用于补齐 `main + group(match)` 的独立覆盖

```ts [config.ts]
const logging = {
  debug: false,
  levels: ['warn'],
  rules: [
    {
      label: 'Test1',
      main: '@docs-islands/test',
      group: 'test.combo.match.default.*',
    },
    {
      label: 'Test2',
      main: '@docs-islands/test',
      group: 'test.combo.match.explicit.*',
      levels: ['error'],
    },
  ],
};
```

```ts [user.ts]
const Logger_A = createLogger({
  main: '@docs-islands/test',
}).getLoggerByGroup('test.combo.match.default.1');

const Logger_B = createLogger({
  main: '@docs-islands/test',
}).getLoggerByGroup('test.combo.match.explicit.1');

const Logger_C = createLogger({
  main: '@docs-islands/test_b',
}).getLoggerByGroup('test.combo.match.explicit.1');

Logger_A.warn('main group match default');
Logger_A.error('main group match default');

Logger_B.warn('main group match explicit');
Logger_B.error('main group match explicit');

Logger_C.error('main group match explicit');
```

输出结果：

```bash
@docs-islands/test[test.combo.match.default.1]: main group match default
@docs-islands/test[test.combo.match.explicit.1]: main group match explicit
```

当 `debug = true` 时，输出结果：

```bash
[Test1] @docs-islands/test[test.combo.match.default.1]: main group match default <TIME>
[Test2] @docs-islands/test[test.combo.match.explicit.1]: main group match explicit <TIME>
```

---

## Case 24

验证点：

- 当 `logging.rules` 未配置时，非 debug 模式默认输出 `error | warn | info | success`
- 同场景下默认不输出 `debug`

```ts [config.ts]
const logging = {
  debug: false,
};
```

```ts [user.ts]
const Logger_A = createLogger({
  main: '@docs-islands/test',
}).getLoggerByGroup('test.case.default');

Logger_A.debug('message A_d');
Logger_A.info('message A_i');
Logger_A.success('message A_s');
Logger_A.warn('message A_w');
Logger_A.error('message A_e');
```

输出结果：

```bash
@docs-islands/test[test.case.default]: message A_i
@docs-islands/test[test.case.default]: message A_s
@docs-islands/test[test.case.default]: message A_w
@docs-islands/test[test.case.default]: message A_e
```

---

## Case 25

验证点：

- 当 `logging.rules` 未配置时，debug 模式默认输出 `error | warn | info | success | debug`
- 其中 `error | warn | info | success` 需附带 `<TIME>`
- `debug` 级别是否附带耗时当前不作强制要求；本规范按“不要求”断言

```ts [config.ts]
const logging = {
  debug: true,
};
```

```ts [user.ts]
const Logger_A = createLogger({
  main: '@docs-islands/test',
}).getLoggerByGroup('test.case.default');

Logger_A.debug('message A_d');
Logger_A.info('message A_i');
Logger_A.success('message A_s');
Logger_A.warn('message A_w');
Logger_A.error('message A_e');
```

输出结果：

```bash
@docs-islands/test[test.case.default]: message A_d
@docs-islands/test[test.case.default]: message A_i <TIME>
@docs-islands/test[test.case.default]: message A_s <TIME>
@docs-islands/test[test.case.default]: message A_w <TIME>
@docs-islands/test[test.case.default]: message A_e <TIME>
```

---

## Case 26

验证点：

- 在存在 `rules` 时，`success` 与其它 level 一样参与 rule-level 判定
- 同时覆盖：
  - 继承 `logging.levels` 的 `success`
  - 显式 `rule.levels = ['success']`

```ts [config.ts]
const logging = {
  debug: false,
  levels: ['success'],
  rules: [
    {
      label: 'Test1',
      group: 'test.success.default',
    },
    {
      label: 'Test2',
      message: '*completed*',
      levels: ['success'],
    },
  ],
};
```

```ts [user.ts]
const Logger_A = createLogger({
  main: '@docs-islands/test',
}).getLoggerByGroup('test.success.default');

const Logger_B = createLogger({
  main: '@docs-islands/test',
}).getLoggerByGroup('test.success.other');

Logger_A.success('task done');
Logger_A.warn('task done');

Logger_B.success('job completed');
Logger_B.info('job completed');
```

输出结果：

```bash
@docs-islands/test[test.success.default]: task done
@docs-islands/test[test.success.other]: job completed
```

当 `debug = true` 时，输出结果：

```bash
[Test1] @docs-islands/test[test.success.default]: task done <TIME>
[Test2] @docs-islands/test[test.success.other]: job completed <TIME>
```

---

## Case 27

验证点：

- `group` / `message` 的 match 语义由 picomatch 实现，而不是仅支持 `*`
- 本 case 对 `?` 与 `[]` 做基础冒烟验证

```ts [config.ts]
const logging = {
  debug: false,
  rules: [
    {
      label: 'Test1',
      group: 'test.case.?1',
      levels: ['warn'],
    },
    {
      label: 'Test2',
      message: 'task-[ab]',
      levels: ['error'],
    },
  ],
};
```

```ts [user.ts]
const Logger_A = createLogger({
  main: '@docs-islands/test',
}).getLoggerByGroup('test.case.a1');

const Logger_B = createLogger({
  main: '@docs-islands/test',
}).getLoggerByGroup('test.case.ab1');

Logger_A.warn('noop');
Logger_A.error('task-a');
Logger_A.error('task-c');

Logger_B.warn('noop');
Logger_B.error('task-b');
```

输出结果：

```bash
@docs-islands/test[test.case.a1]: noop
@docs-islands/test[test.case.a1]: task-a
@docs-islands/test[test.case.ab1]: task-b
```

当 `debug = true` 时，输出结果：

```bash
[Test1] @docs-islands/test[test.case.a1]: noop <TIME>
[Test2] @docs-islands/test[test.case.a1]: task-a <TIME>
[Test2] @docs-islands/test[test.case.ab1]: task-b <TIME>
```

---

## Case 28

验证点：

- `enabled: false` 的 rule 完全不起作用
- 即使其它字段全部命中，也不得输出
- 存在 `rules` 但 activeRules 为空时，不得 fallback 到默认输出行为

```ts [config.ts]
const logging = {
  debug: false,
  levels: ['warn', 'error'],
  rules: [
    {
      label: 'Test1',
      enabled: false,
      group: 'test.case.enabled.off',
    },
  ],
};
```

等价于：

```ts [config.ts]
const logging = {
  debug: false,
  rules: [
    {
      label: 'Test1',
      enabled: false,
      group: 'test.case.enabled.off',
      levels: ['warn', 'error'],
    },
  ],
};
```

```ts [user.ts]
const Logger_A = createLogger({
  main: '@docs-islands/test',
}).getLoggerByGroup('test.case.enabled.off');

Logger_A.warn('message A_w');
Logger_A.error('message A_e');
```

输出结果：

```bash
# 无输出
```

当 `debug = true` 时，输出结果：

```bash
# 无输出
```

---

## Case 29

验证点：

- `enabled: true` 显式声明时等价于默认启用
- `enabled: false` 的重叠 rule 不参与 level 并集
- `enabled: false` 的重叠 rule 不参与 debug label

```ts [config.ts]
const logging = {
  debug: false,
  levels: ['warn', 'error'],
  rules: [
    {
      label: 'Test1',
      enabled: false,
      group: 'test.case.enabled.mix',
      levels: ['info', 'warn'],
    },
    {
      label: 'Test2',
      enabled: true,
      group: 'test.case.enabled.mix',
    },
  ],
};
```

```ts [user.ts]
const Logger_A = createLogger({
  main: '@docs-islands/test',
}).getLoggerByGroup('test.case.enabled.mix');

Logger_A.info('message A_i');
Logger_A.warn('message A_w');
Logger_A.error('message A_e');
```

输出结果：

```bash
@docs-islands/test[test.case.enabled.mix]: message A_w
@docs-islands/test[test.case.enabled.mix]: message A_e
```

当 `debug = true` 时，输出结果：

```bash
[Test2] @docs-islands/test[test.case.enabled.mix]: message A_w <TIME>
[Test2] @docs-islands/test[test.case.enabled.mix]: message A_e <TIME>
```

---

## Case 30

验证点：

- `enabled: false` 的更具体 rule 不应覆盖、阻断或污染其它 active rule
- 即使 disabled rule 与 active rule 同时 scope 命中，最终只按 active rule 生效

```ts [config.ts]
const logging = {
  debug: false,
  rules: [
    {
      label: 'Test1',
      enabled: false,
      group: 'test.case.enabled.exact',
      levels: ['error'],
    },
    {
      label: 'Test2',
      enabled: true,
      group: 'test.case.enabled.*',
      levels: ['error'],
    },
  ],
};
```

```ts [user.ts]
const Logger_A = createLogger({
  main: '@docs-islands/test',
}).getLoggerByGroup('test.case.enabled.exact');

Logger_A.error('message A_e');
```

输出结果：

```bash
@docs-islands/test[test.case.enabled.exact]: message A_e
```

当 `debug = true` 时，输出结果：

```bash
[Test2] @docs-islands/test[test.case.enabled.exact]: message A_e <TIME>
```

---

## Case 31

验证点：

- `enabled: false` 与 `main + group + message` 全字段组合同时存在时仍完全失效
- disabled rule 不参与 scope AND 判定后的放行
- 用于补强“全字段都命中但因 enabled=false 仍不输出”的反例

```ts [config.ts]
const logging = {
  debug: false,
  levels: ['error'],
  rules: [
    {
      label: 'Test1',
      enabled: false,
      main: '@docs-islands/test',
      group: 'test.enabled.full.*',
      message: '*timeout*',
    },
  ],
};
```

等价于：

```ts [config.ts]
const logging = {
  debug: false,
  rules: [
    {
      label: 'Test1',
      enabled: false,
      main: '@docs-islands/test',
      group: 'test.enabled.full.*',
      message: '*timeout*',
      levels: ['error'],
    },
  ],
};
```

```ts [user.ts]
const Logger_A = createLogger({
  main: '@docs-islands/test',
}).getLoggerByGroup('test.enabled.full.1');

Logger_A.error('request timeout');
```

输出结果：

```bash
# 无输出
```

当 `debug = true` 时，输出结果：

```bash
# 无输出
```

---

## Case 32

验证点：

- 即使 rule 的 `main` 值包含 glob magic，`main` 仍只做准确匹配
- `main: '@docs-islands/*'` 不会匹配 `main: '@docs-islands/test'`
- 但该 rule 仍可匹配字面量 `main` 为 `@docs-islands/*` 的 logger

```ts [config.ts]
const logging = {
  debug: true,
  rules: [
    {
      label: 'WildcardMain',
      main: '@docs-islands/*',
      levels: ['warn'],
    },
    {
      label: 'ExactMain',
      main: '@docs-islands/test',
      levels: ['error'],
    },
  ],
};
```

```ts [user.ts]
const Logger_A = createLogger({
  main: '@docs-islands/test',
}).getLoggerByGroup('test.case.main.literal');

const Logger_B = createLogger({
  main: '@docs-islands/*',
}).getLoggerByGroup('test.case.main.literal');

Logger_A.warn('wildcard should not match');
Logger_A.error('exact main match');
Logger_B.warn('literal wildcard main');
```

输出结果：

```bash
[ExactMain] @docs-islands/test[test.case.main.literal]: exact main match <TIME>
[WildcardMain] @docs-islands/*[test.case.main.literal]: literal wildcard main <TIME>
```

---

## Case 33

验证点：

- `rules: []` 会标准化为“未配置 rules”
- 因此 `rules: []` 走默认 level 集合，而不是“存在 rules 但无 active rule”

```ts [config.ts]
const logging = {
  debug: false,
  rules: [],
};
```

```ts [user.ts]
const Logger_A = createLogger({
  main: '@docs-islands/test',
}).getLoggerByGroup('test.case.empty.rules');

Logger_A.debug('debug hidden');
Logger_A.info('info visible');
Logger_A.success('success visible');
Logger_A.warn('warn visible');
Logger_A.error('error visible');
```

输出结果：

```bash
@docs-islands/test[test.case.empty.rules]: info visible
@docs-islands/test[test.case.empty.rules]: success visible
@docs-islands/test[test.case.empty.rules]: warn visible
@docs-islands/test[test.case.empty.rules]: error visible
```

当 `debug = true` 时，输出结果：

```bash
@docs-islands/test[test.case.empty.rules]: debug visible
@docs-islands/test[test.case.empty.rules]: info visible <TIME>
@docs-islands/test[test.case.empty.rules]: success visible <TIME>
@docs-islands/test[test.case.empty.rules]: warn visible <TIME>
@docs-islands/test[test.case.empty.rules]: error visible <TIME>
```

---

## Case 34

验证点：

- 当 `rule.levels` 与 `logging.levels` 均缺失时，rule 使用 `defaultResolvedLevels`
- rule 模式下，`debug` level 日志仍被抑制

```ts [config.ts]
const logging = {
  debug: true,
  rules: [
    {
      label: 'DefaultLevels',
    },
  ],
};
```

```ts [user.ts]
const Logger_A = createLogger({
  main: '@docs-islands/test',
}).getLoggerByGroup('test.case.default.levels');

Logger_A.debug('debug remains rule-suppressed');
Logger_A.info('info visible');
Logger_A.success('success visible');
Logger_A.warn('warn visible');
Logger_A.error('error visible');
```

输出结果：

```bash
[DefaultLevels] @docs-islands/test[test.case.default.levels]: info visible <TIME>
[DefaultLevels] @docs-islands/test[test.case.default.levels]: success visible <TIME>
[DefaultLevels] @docs-islands/test[test.case.default.levels]: warn visible <TIME>
[DefaultLevels] @docs-islands/test[test.case.default.levels]: error visible <TIME>
```

---

## Case 35

验证点：

- debug label 来自 contributing rules，而不是仅 scope 命中的 rules
- rule 只有在 scope 与 `effectiveLevels(rule)` 同时命中当前日志时才参与贡献
- 耗时断言应比较标准化后的完整输出，包括固定的 `ms` 值

```ts [config.ts]
const logging = {
  debug: true,
  levels: ['error'],
  rules: [
    {
      label: 'InheritedError',
    },
    {
      label: 'WarnOnly',
      levels: ['warn'],
    },
    {
      label: 'WarnAndError',
      levels: ['warn', 'error'],
    },
  ],
};
```

```ts [user.ts]
const Logger_A = createLogger({
  main: '@docs-islands/test',
}).getLoggerByGroup('test.case.contributing.labels');

Logger_A.warn('warn path');
Logger_A.error('error path');
```

输出结果：

```bash
[WarnOnly][WarnAndError] @docs-islands/test[test.case.contributing.labels]: warn path <TIME>
[InheritedError][WarnAndError] @docs-islands/test[test.case.contributing.labels]: error path <TIME>
```

## 4. 规则形态组合覆盖矩阵

下表以“规则形态 × levels 来源”为维度，确认 `main / group / message / levels` 的组合项均已落到具体测试。

| 规则形态                                     | 默认 levels 继承覆盖 | 显式 rule.levels 覆盖 |
| -------------------------------------------- | -------------------- | --------------------- |
| 无 `main/group/message`                      | Case 1 / Test1       | Case 2 / Test2        |
| `main`                                       | Case 3 / Test2       | Case 3 / Test3        |
| `group(准确匹配)`                            | Case 4 / Test1       | Case 22 / Test2       |
| `group(match)`                               | Case 5 / Test1       | Case 5 / Test2        |
| `message(准确匹配)`                          | Case 16 / Test1      | Case 16 / Test2       |
| `message(match)`                             | Case 16 / Test3      | Case 16 / Test4       |
| `main + group(准确匹配)`                     | Case 7 / Test1       | Case 7 / Test2        |
| `main + group(match)`                        | Case 23 / Test1      | Case 23 / Test2       |
| `main + message(准确匹配)`                   | Case 17 / Test1      | Case 17 / Test2       |
| `main + message(match)`                      | Case 17 / Test3      | Case 17 / Test4       |
| `group(准确匹配) + message(准确匹配)`        | Case 18 / Test1      | Case 18 / Test2       |
| `group(准确匹配) + message(match)`           | Case 18 / Test3      | Case 18 / Test4       |
| `group(match) + message(准确匹配)`           | Case 19 / Test1      | Case 19 / Test2       |
| `group(match) + message(match)`              | Case 19 / Test3      | Case 19 / Test4       |
| `main + group(准确匹配) + message(准确匹配)` | Case 20 / Test1      | Case 20 / Test2       |
| `main + group(准确匹配) + message(match)`    | Case 20 / Test3      | Case 20 / Test4       |
| `main + group(match) + message(准确匹配)`    | Case 21 / Test1      | Case 21 / Test2       |
| `main + group(match) + message(match)`       | Case 21 / Test3      | Case 21 / Test4       |

---

## 5. `enabled` 门控行为覆盖矩阵

| `enabled` 形态                              | 语义                       | 已覆盖 Case                           |
| ------------------------------------------- | -------------------------- | ------------------------------------- |
| 缺失                                        | 默认等价于 `true`          | Case 1 ~ 28 之前的未显式 enabled 规则 |
| 显式 `true`                                 | 与默认启用一致             | Case 29 / Test2, Case 30 / Test2      |
| 显式 `false`（单 rule）                     | rule 完全失效；不输出      | Case 28                               |
| 显式 `false`（与 active rule 重叠）         | 不参与 union，不参与 label | Case 29                               |
| 显式 `false`（更具体 rule）                 | 不覆盖、不阻断 active rule | Case 30                               |
| 显式 `false`（`main+group+message` 全字段） | 全字段命中仍无效           | Case 31                               |

---

## 6. 运行时行为覆盖矩阵

| 运行时行为                                                                       | 已覆盖 Case                                              |
| -------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 标准化后有 `rules` 时仅按 activeRules 判定                                       | 1 ~ 23, 26, 27, 28, 29, 30, 31, 32, 34, 35               |
| 标准化后有 `rules` 但无命中不输出                                                | 6, 13, 15, 17, 18, 19, 20, 21, 23, 28, 31, 32            |
| 标准化后有 `rules` 且全部 disabled 不输出                                        | 28, 31                                                   |
| `rules: []` 标准化为无 rules 默认行为                                            | 33                                                       |
| 无 `rules` + `debug = false` 默认输出 `error`、`warn`、`info`、`success`         | 24, 33                                                   |
| 无 `rules` + `debug = true` 默认输出 `error`、`warn`、`info`、`success`、`debug` | 25, 33                                                   |
| 缺失 `rule.levels` 与 `logging.levels` 时 fallback 到 `defaultResolvedLevels`    | 34                                                       |
| debug 下 `error`、`warn`、`info`、`success` 追加 `<TIME>`                        | 1 ~ 23, 25, 26, 27, 29, 30, 32, 33, 34, 35               |
| debug 下 `debug` 日志不强制带 `<TIME>`                                           | 25, 33                                                   |
| debug label 只包含 contributing rules                                            | 2, 29, 30, 35                                            |
| `success` 在 rule 模式下可被默认 / 显式 levels 放行                              | 26, 34                                                   |
| picomatch `*`                                                                    | 5, 9, 10, 12, 13, 15, 16, 17, 18, 19, 20, 21, 23, 26, 31 |
| picomatch `?`                                                                    | 27                                                       |
| picomatch `[]`                                                                   | 27                                                       |
| 包含 glob magic 的 `main` 仍按字面量准确匹配                                     | 32                                                       |
| debug label 顺序                                                                 | 1, 2, 3, 11, 14, 35                                      |
| disabled rule 不参与 label                                                       | 29, 30                                                   |

---

## 7. 能力点覆盖矩阵（摘要）

| 能力点                         | 已覆盖 Case                                                                  |
| ------------------------------ | ---------------------------------------------------------------------------- |
| 默认 `enabled = true`          | 1 ~ 27, 32, 34, 35                                                           |
| 显式 `enabled = true`          | 29, 30                                                                       |
| 显式 `enabled = false`         | 28, 29, 30, 31                                                               |
| 默认 levels 继承               | 1, 3, 4, 5, 6, 7, 12, 13, 16, 17, 18, 19, 20, 21, 22, 23, 26, 28, 29, 31, 35 |
| defaultResolvedLevels fallback | 34                                                                           |
| rule.levels 覆盖默认 levels    | 2, 3, 5, 7, 8, 9, 10, 15, 16, 17, 18, 19, 20, 21, 22, 23, 26, 27, 29, 30     |
| 无 scope 全局 rule             | 1, 2, 8, 9, 11, 14, 16, 27(仅 message)                                       |
| main 准确匹配                  | 3, 7, 10, 13, 17, 20, 21, 23, 31, 32                                         |
| group 准确匹配                 | 4, 7, 18, 20, 22, 28, 29, 30                                                 |
| group picomatch 匹配           | 5, 10, 12, 13, 15, 19, 21, 23, 27, 31                                        |
| message 准确匹配               | 8, 14, 16, 17, 18, 19, 20, 21, 27                                            |
| message picomatch 匹配         | 9, 10, 11, 12, 13, 15, 16, 17, 18, 19, 20, 21, 26, 31                        |
| main + group AND               | 7, 10, 13, 20, 21, 23, 31                                                    |
| main + message AND             | 17, 31                                                                       |
| group + message AND            | 10, 15, 18, 19, 20, 21, 31                                                   |
| main + group + message AND     | 10, 13, 20, 21, 31                                                           |
| 无 `rules` 默认输出            | 24, 25, 33                                                                   |
| `rules: []` 标准化             | 33                                                                           |
| `success`                      | 24, 25, 26, 33, 34                                                           |
| `debug`                        | 25, 33, 34                                                                   |
| debug 相对耗时后缀             | 1 ~ 23, 25, 26, 27, 29, 30, 32, 33, 34, 35                                   |
| 标准化完整输出断言             | 4, 7, 11, 13, 14, 15, 23, 24, 25, 26, 29, 30, 32, 33, 34, 35                 |

---

## 8. 最终结论

这组测试文档现在可以作为**规范化测试基线**使用，理由如下：

1. `main`、`group`、`message`、`levels` 的规则组合已通过矩阵方式落地
2. `group` 与 `message` 的**准确匹配 / picomatch 匹配**均已有正例与反例
3. `main` 已被明确限定为**仅支持准确匹配**
4. 补充信息中的运行时要求已被显式纳入测试：
   - picomatch
   - `enabled`
   - debug 相对耗时后缀
   - 无 `rules` 时的默认输出
   - `rules: []` 标准化
   - rule 与全局 levels 均缺失时的默认 level fallback
5. 测试同时覆盖“应输出”和“不得输出”，避免只测 happy path
6. 高风险与补充性合规用例中的严格输出断言会标准化 ANSI 转义序列，并精确比较固定耗时值；宽矩阵用例仍可使用调用次数、顺序、模式断言
7. `enabled: false` 已被证明是一个真正的“门控开关”，而不是低优先级 rule

若后续继续增强规范，优先建议再补：

- `main` 若未来支持 match，需新增独立矩阵
- 大小写敏感性
- 空字符串 `message`
