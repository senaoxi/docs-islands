# Logger Rule Matching Test Specification

## 1. Specification Prerequisites

The following semantics are considered prerequisites for this test document; if the implementation is inconsistent with these prerequisites, the test should be considered failed or the specification should be revised.

### 1.1 Rule Structure

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

### 1.2 `enabled` Semantics

- The default value of `enabled` is `true`
- When the user does not specify `enabled`, it is equivalent to `enabled: true`
- When `enabled: false`, the rule **has no effect at all**
- "Has no effect at all" means:
  1. Does not participate in scope matching
  2. Does not participate in level pass-through determination
  3. Does not participate in debug label output
- Therefore, pre-filtering should be done during rule evaluation:

```ts
const activeRules = logging.rules.filter((rule) => rule.enabled !== false);
```

### 1.3 Effective Levels

When `logging.rules` exists after normalization, calculate for **activeRules**:

```ts
effectiveLevels(rule) = rule.levels ?? logging.levels ?? defaultResolvedLevels;
```

`defaultResolvedLevels` is `error | warn | info | success`.

### 1.4 Output Determination (When `logging.rules` Exists)

For a log message `(main, group, level, message)`:

1. First normalize `logging.rules`; an empty array is treated as "not configured rules"
2. Filter out rules with `enabled: false` from normalized `logging.rules` to get `activeRules`
3. Filter out all **scope-matched** rules from `activeRules`
4. Scope matching rules:
   - If the rule declares `main`, then `main` must match
   - If the rule declares `group`, then `group` must match
   - If the rule declares `message`, then `message` must match
   - Multiple declared fields are combined with **AND**
5. If the current log `level` matches the `effectiveLevels(rule)` of any matched rule, output
6. When normalized `logging.rules` exists, output determination **only looks at activeRules**; does not fallback to global default level determination

> Important:
>
> - `logging.rules === undefined` and "rules exist after normalization but all filtered out by `enabled: false`" are not the same semantics
> - The former follows "no `rules` default behavior"
> - The latter follows "has `rules` but no active rule", therefore **no output**

### 1.5 Default Output Behavior (When `logging.rules` Does Not Exist)

When the user **has not configured** `logging.rules`:

- If `logging.levels` is also not configured:
  - `debug = false`: default output `error | warn | info | success`
  - `debug = true`: default output `error | warn | info | success | debug`
- If `logging.levels` is configured:
  - Non-debug log output follows `logging.levels`
  - `debug` level output is controlled by `debug = true`

> Note:
>
> - This document interprets "not configured `logging.rules`" as normalized `logging.rules === undefined`
> - `rules: []` is normalized to "not configured rules", therefore it follows the same default behavior as `rules === undefined`

### 1.6 Debug Semantics

- `debug = false`: Output normal log prefix
- `debug = true`:
  - If contributing rules exist, prepend **the active rule labels whose scope and level both match the current message** before the normal log prefix
  - For `error | warn | info | success` four types of logs, **additionally append relative elapsed time** at the end of the message
  - Relative elapsed time is displayed in `ms`, for example `12.34ms`
  - Whether `debug` level logs append elapsed time is currently only constrained as supplementary information: **not mandatory**

### 1.7 Fixed Elapsed Time in Tests

To ensure repeatable assertions in debug scenarios, this document uniformly requires:

- All debug use cases that expect `<TIME>` must provide a deterministic logger relative elapsed time
- `<TIME>` in expected output is a placeholder for the relative elapsed time field
- The implementation should output this field in `ms` format, for example `42.00ms`
- Tests may provide the deterministic value directly through `LoggerLogOptions.elapsedTimeMs`, or indirectly through fake timers / a mock monotonic clock when using elapsed-time helpers
- High-risk and supplemental compliance tests should verify the value through **exact normalized output assertions**
- Tests should strip ANSI color escape sequences before exact output comparison in Node.js scenarios

> In other words: this document focuses on "**needs to carry deterministic relative elapsed time**" and requires display in `ms`. Broad matrix cases may still use count/order/pattern assertions, but newly added strict coverage should prefer exact normalized output.

### 1.8 Matching Semantics

This document uniformly adopts the following matching semantics:

- `main`: **Only supports exact matching**
- `group`: Supports **exact matching** and **match matching**
- `message`: Supports **exact matching** and **match matching**

#### 1.8.1 `main`

- `main` does not support picomatch
- Only matches by string equality

#### 1.8.2 `group` / `message`

- When the pattern **does not contain glob magic**, use **exact matching**
- When the pattern contains glob magic, match by **picomatch** semantics
- Glob magic explicitly covered by this document includes:
  - `*`
  - `?`
  - Character class `[]`

> Note:
>
> - Since the actual implementation is based on picomatch, it theoretically supports richer glob syntax
> - But this test document only makes specification commitments for explicitly covered syntax
> - For advanced capabilities like extglob, brace expansion, etc., if the implementation wants to expose them as stable behavior, it is recommended to add independent cases

#### 1.8.3 Examples

- `group = 'test.case.a'` only matches `test.case.a`
- `group = 'test.case.*'` matches `test.case.a`, `test.case.b_1`
- `message = 'request timeout'` only matches `request timeout`
- `message = '*timeout*'` matches `request timeout`
- `group = 'test.case.?1'` can match `test.case.a1`
- `message = 'task-[ab]'` can match `task-a`, `task-b`

### 1.9 Coverage Commitment of This Document

This document covers the following rule forms and runtime behaviors:

1. `enabled`

   - Missing (default `true`)
   - Explicit `true`
   - Explicit `false`

2. `main`

   - Missing
   - Exact matching

3. `group`

   - Missing
   - Exact matching
   - picomatch match matching

4. `message`

   - Missing
   - Exact matching
   - picomatch match matching

5. `levels` source

   - Inherit `logging.levels`
   - Use `rule.levels`
   - Fall back to `defaultResolvedLevels` when both `rule.levels` and `logging.levels` are missing
   - Follow default output behavior when no `rules`

6. Level types

   - `error`
   - `warn`
   - `info`
   - `success`
   - `debug` (only default behavior when no `rules` and `debug = true`)

7. Debug output enhancement
   - Rule labels
   - Relative elapsed time `<TIME>`

### 1.10 Behaviors Not Defined in This Document

The following behaviors are currently **not included in specification commitments** and can only be considered open items before supplementary tests:

- Whether `main` will support match in the future
- Case sensitivity of `message` / `group`
- Behavior of `*` / `?` / `[]` on multi-line string messages
- Matching behavior of empty string `message`
- Stable semantics for picomatch syntax beyond the explicitly covered `*`, `?`, and `[]`

---

## 2. Review Conclusion

### 2.1 Completeness

The current test set already covers:

- Default `enabled = true`
- Explicit `enabled = true`
- Explicit `enabled = false`
- Default `levels` inheritance
- Default resolved levels fallback
- `rule.levels` explicit override
- No scope rule
- `main` exact matching
- `group` exact matching
- `group` picomatch matching
- `message` exact matching
- `message` picomatch matching
- `main + group`
- `main + message`
- `group + message`
- `main + group + message`
- Default output when no `rules`
- `rules: []` normalization to no-rules behavior
- Debug label output and order
- Relative elapsed time suffix under debug, with exact fixed values in strict/supplemental assertions
- Key behaviors of `success` / `debug` levels
- Complete blocking of matching, pass-through, and labels by `enabled: false`

### 2.2 Reliability

The current test set not only verifies "should output" but also verifies "must not output", covering:

- Scope not matched
- Level not matched
- Message not matched
- Group not matched
- Main not matched
- Counter-examples where any field does not match in multi-condition combinations
- Default differences between debug / non-debug when no `rules`
- Exact normalized output assertions for high-risk and supplemental debug scenarios
- Smoke verification of picomatch basic magic (`*`, `?`, `[]`)
- Under `enabled: false`:
  - Single rule disabled
  - Does not participate in union when multiple rules overlap
  - Does not participate in labels
  - Still invalid even when all fields match

### 2.3 Combination Coverage Requirements

According to this revision requirements:

- Both `message` and `group` support **exact matching** and **match matching**
- `main` only supports **exact matching**
- Combinations of `main / group / message / levels` must be fully covered
- Default, explicit true, and explicit false of `enabled` must be covered
- Under debug mode, `error | warn | info | success` must carry relative elapsed time information
- When no `rules`, must output according to default level set

The coverage matrix at the end of this document maps the above requirements item by item.

---

## 3. Test Cases

## Case 1

Verification points:

- Rule without scope restriction matches all logs
- When `rule.levels` is missing, inherit `logging.levels`
- When multiple rules match simultaneously, all debug labels are displayed

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

Output result:

```bash
@docs-islands/test[test.case.a]: message A_b_1
@docs-islands/test[test.case.a]: message A_b_2
@docs-islands/test[test.case.a]: message A_c
```

When `debug = true`, output result:

```bash
[Test1][Test2] @docs-islands/test[test.case.a]: message A_b_1 <TIME>
[Test1][Test2] @docs-islands/test[test.case.a]: message A_b_2 <TIME>
[Test1][Test2] @docs-islands/test[test.case.a]: message A_c <TIME>
```

---

## Case 2

Verification points:

- `rule.levels` can override default `logging.levels`
- Final allowed levels come from the union of all matched rules

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

Equivalent to:

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

Output result:

```bash
@docs-islands/test[test.case.a]: message A_a
@docs-islands/test[test.case.a]: message A_b_1
@docs-islands/test[test.case.a]: message A_b_2
@docs-islands/test[test.case.a]: message A_c
```

When `debug = true`, output result:

```bash
[Test2] @docs-islands/test[test.case.a]: message A_a <TIME>
[Test1][Test2] @docs-islands/test[test.case.a]: message A_b_1 <TIME>
[Test1][Test2] @docs-islands/test[test.case.a]: message A_b_2 <TIME>
[Test1] @docs-islands/test[test.case.a]: message A_c <TIME>
```

---

## Case 3

Verification points:

- `main` supports scope matching
- Rules without declared `main` are global rules
- When multiple rules match, pass through by union

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

Equivalent to:

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

Output result:

```bash
@docs-islands/test[test.case.a]: message A_b_1
@docs-islands/test[test.case.a]: message A_b_2
@docs-islands/test[test.case.a]: message A_c
@docs-islands/test_b[test.case.b]: message B_a
@docs-islands/test_b[test.case.b]: message B_b_1
@docs-islands/test_b[test.case.b]: message B_b_2
@docs-islands/test_b[test.case.b]: message B_c
```

When `debug = true`, output result:

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

Verification points:

- `group` supports scope matching
- `group` matching is independent of `main`, unless the rule declares both `main`
- No output when `group` does not match

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

Equivalent to:

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

Output result:

```bash
@docs-islands/test[test.case.a]: message A_b_1
@docs-islands/test[test.case.a]: message A_b_2
@docs-islands/test[test.case.a]: message A_c
@docs-islands/test_b[test.case.a]: message B_b_1
@docs-islands/test_b[test.case.a]: message B_b_2
@docs-islands/test_b[test.case.a]: message B_c
```

When `debug = true`, output result:

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

Validation points:

- `group` supports `*` wildcard
- Multiple group rules can match simultaneously
- When `message` is not involved in restrictions, it does not affect output

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

Equivalent to:

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

Output result:

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

When `debug = true`, output result:

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

Validation points:

- When `rules` exists but no rule matches, no output is produced
- Does not fallback to `logging.levels`

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

Equivalent to:

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

Output result:

```bash
# No output
```

When `debug = true`, output result:

```bash
# No output
```

---

## Case 7

Validation points:

- When both `main` and `group` exist, they match with AND logic
- Partial field matches are insufficient for output

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

Equivalent to:

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

Output result:

```bash
@docs-islands/test[test.case.a]: message A_b
@docs-islands/test[test.case.a]: message A_c
@docs-islands/test_b[test.case.a]: message B_b
```

When `debug = true`, output result:

```bash
[Test1] @docs-islands/test[test.case.a]: message A_b <TIME>
[Test1] @docs-islands/test[test.case.a]: message A_c <TIME>
[Test2] @docs-islands/test_b[test.case.a]: message B_b <TIME>
```

---

## Case 8

Validation points:

- `message` supports exact matching
- After `message` matches, level must still be satisfied simultaneously

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

Output result:

```bash
@docs-islands/test[test.case.message]: slow query
@docs-islands/test[test.case.message]: request timeout
```

When `debug = true`, output result:

```bash
[Test2] @docs-islands/test[test.case.message]: slow query <TIME>
[Test1] @docs-islands/test[test.case.message]: request timeout <TIME>
```

---

## Case 9

Validation points:

- `message` supports `*` wildcard
- Supports prefix / contains / middle wildcard
- A single message can match multiple message rules simultaneously

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

Output result:

```bash
@docs-islands/test[test.case.message.match]: worker sync finished
@docs-islands/test[test.case.message.match]: timeout: fetch user
@docs-islands/test[test.case.message.match]: primary database unavailable
@docs-islands/test[test.case.message.match]: timeout: database unavailable
```

When `debug = true`, output result:

```bash
[Test3] @docs-islands/test[test.case.message.match]: worker sync finished <TIME>
[Test1] @docs-islands/test[test.case.message.match]: timeout: fetch user <TIME>
[Test2] @docs-islands/test[test.case.message.match]: primary database unavailable <TIME>
[Test2][Test4] @docs-islands/test[test.case.message.match]: timeout: database unavailable <TIME>
```

---

## Case 10

Validation points:

- `main + group + message` can be used in combination
- All declared conditions take effect with AND logic
- Different rules can declare only partial conditions

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

Output result:

```bash
@docs-islands/test[test.api.fetch]: retry request
@docs-islands/test[test.api.fetch]: request timeout
@docs-islands/test[test.api.fetch]: request timeout
@docs-islands/test_b[test.api.fetch]: request timeout
@docs-islands/test[test.api.update]: retry request
```

When `debug = true`, output result:

```bash
[Test1] @docs-islands/test[test.api.fetch]: retry request <TIME>
[Test3] @docs-islands/test[test.api.fetch]: request timeout <TIME>
[Test2] @docs-islands/test[test.api.fetch]: request timeout <TIME>
[Test3] @docs-islands/test_b[test.api.fetch]: request timeout <TIME>
[Test1] @docs-islands/test[test.api.update]: retry request <TIME>
```

---

## Case 11

Verification points:

- When multiple message rules match simultaneously, label order follows the rules declaration order
- This order is not affected by the matched field type

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

Output result:

```bash
@docs-islands/test[test.case.message.order]: request timeout user api
```

When `debug = true`, output result:

```bash
[Test1][Test2][Test3] @docs-islands/test[test.case.message.order]: request timeout user api <TIME>
```

---

## Case 12

Verification points:

- `message: '*'` is treated as matching all messages
- message match-all still needs to be constrained by other scope and level conditions

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

Output result:

```bash
@docs-islands/test[test.audit.login]: login failed
@docs-islands/test[test.audit.login]: login failed
@docs-islands/test[test.audit.logout]: logout failed
```

When `debug = true`, output result:

```bash
[Test2] @docs-islands/test[test.audit.login]: login failed <TIME>
[Test1] @docs-islands/test[test.audit.login]: login failed <TIME>
[Test1] @docs-islands/test[test.audit.logout]: logout failed <TIME>
```

---

## Case 13

Verification points:

- When `main + group + message` all exist simultaneously, strict AND matching is applied
- If any condition does not match, no output should occur
- When `rules` exist, it will not fallback to global levels

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

Output result:

```bash
@docs-islands/test[test.payment.charge]: request timeout
```

When `debug = true`, output result:

```bash
[Test1] @docs-islands/test[test.payment.charge]: request timeout <TIME>
```

---

## Case 14

Verification points:

- Multiple rules can match the same message simultaneously
- Exact match and wildcard match can coexist on the same message
- Debug label order still follows the rules declaration order

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

Output result:

```bash
@docs-islands/test[test.case.message.mix]: request timeout
@docs-islands/test[test.case.message.mix]: request timeout downstream
```

When `debug = true`, output result:

```bash
[Test1][Test2][Test3] @docs-islands/test[test.case.message.mix]: request timeout <TIME>
[Test2][Test3] @docs-islands/test[test.case.message.mix]: request timeout downstream <TIME>
```

---

## Case 15

Verification points:

- When scope matches but message does not match, no output
- When message matches but level does not match, no output
- This case is used to strengthen negative case coverage for the message dimension

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

Output result:

```bash
@docs-islands/test[test.notify.email]: delivery failed
@docs-islands/test[test.notify.email]: request timeout
```

When `debug = true`, output result:

```bash
[Test1] @docs-islands/test[test.notify.email]: delivery failed <TIME>
[Test2] @docs-islands/test[test.notify.email]: request timeout <TIME>
```

---

---

## Case 16

Verification points:

- When `message` is used alone as a filter condition, it supports exact matching and match matching
- When `message` filters alone, it overrides both default `levels` and explicit `levels`

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

Output result:

```bash
@docs-islands/test[test.case.message.cover]: msg.exact.default
@docs-islands/test[test.case.message.cover]: msg.exact.explicit
@docs-islands/test[test.case.message.cover]: msg.match.default.1
@docs-islands/test[test.case.message.cover]: msg.match.explicit.1
```

When `debug = true`, output result:

```bash
[Test1] @docs-islands/test[test.case.message.cover]: msg.exact.default <TIME>
[Test2] @docs-islands/test[test.case.message.cover]: msg.exact.explicit <TIME>
[Test3] @docs-islands/test[test.case.message.cover]: msg.match.default.1 <TIME>
[Test4] @docs-islands/test[test.case.message.cover]: msg.match.explicit.1 <TIME>
```

---

## Case 17

Verification points:

- `main + message` combination supports exact matching and match matching
- Overrides both default `levels` and explicit `levels`

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

Output result:

```bash
@docs-islands/test[test.case.main.message]: main-message.exact.default
@docs-islands/test[test.case.main.message]: main-message.exact.explicit
@docs-islands/test[test.case.main.message]: main-message.match.default.1
@docs-islands/test[test.case.main.message]: main-message.match.explicit.1
```

When `debug = true`, output result:

```bash
[Test1] @docs-islands/test[test.case.main.message]: main-message.exact.default <TIME>
[Test2] @docs-islands/test[test.case.main.message]: main-message.exact.explicit <TIME>
[Test3] @docs-islands/test[test.case.main.message]: main-message.match.default.1 <TIME>
[Test4] @docs-islands/test[test.case.main.message]: main-message.match.explicit.1 <TIME>
```

---

## Case 18

Verification points:

- `group (exact match) + message` combination supports exact matching and match matching
- Overrides both default `levels` and explicit `levels`

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

Output result:

```bash
@docs-islands/test[test.case.gx]: group-exact-message-exact.default
@docs-islands/test[test.case.gx]: group-exact-message-exact.explicit
@docs-islands/test[test.case.gx]: group-exact-message-match.default.1
@docs-islands/test[test.case.gx]: group-exact-message-match.explicit.1
```

When `debug = true`, output result:

```bash
[Test1] @docs-islands/test[test.case.gx]: group-exact-message-exact.default <TIME>
[Test2] @docs-islands/test[test.case.gx]: group-exact-message-exact.explicit <TIME>
[Test3] @docs-islands/test[test.case.gx]: group-exact-message-match.default.1 <TIME>
[Test4] @docs-islands/test[test.case.gx]: group-exact-message-match.explicit.1 <TIME>
```

---

## Case 19

Verification points:

- `group(match) + message` combination supports exact matching and match matching
- Covers both default `levels` and explicit `levels`

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

Output result:

```bash
@docs-islands/test[test.case.gm1]: group-match-message-exact.default
@docs-islands/test[test.case.gm1]: group-match-message-exact.explicit
@docs-islands/test[test.case.gm1]: group-match-message-match.default.1
@docs-islands/test[test.case.gm1]: group-match-message-match.explicit.1
```

When `debug = true`, output result:

```bash
[Test1] @docs-islands/test[test.case.gm1]: group-match-message-exact.default <TIME>
[Test2] @docs-islands/test[test.case.gm1]: group-match-message-exact.explicit <TIME>
[Test3] @docs-islands/test[test.case.gm1]: group-match-message-match.default.1 <TIME>
[Test4] @docs-islands/test[test.case.gm1]: group-match-message-match.explicit.1 <TIME>
```

---

## Case 20

Verification points:

- `main + group(exact match) + message` combination supports exact matching and match matching
- Covers both default `levels` and explicit `levels`

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

Output result:

```bash
@docs-islands/test[test.case.mgx]: mgx-message-exact.default
@docs-islands/test[test.case.mgx]: mgx-message-exact.explicit
@docs-islands/test[test.case.mgx]: mgx-message-match.default.1
@docs-islands/test[test.case.mgx]: mgx-message-match.explicit.1
```

When `debug = true`, output result:

```bash
[Test1] @docs-islands/test[test.case.mgx]: mgx-message-exact.default <TIME>
[Test2] @docs-islands/test[test.case.mgx]: mgx-message-exact.explicit <TIME>
[Test3] @docs-islands/test[test.case.mgx]: mgx-message-match.default.1 <TIME>
[Test4] @docs-islands/test[test.case.mgx]: mgx-message-match.explicit.1 <TIME>
```

---

## Case 21

Verification points:

- `main + group(match) + message` combination supports exact matching and match matching
- Covers both default `levels` and explicit `levels`

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

Output result:

```bash
@docs-islands/test[test.case.mgm1]: mgm-message-exact.default
@docs-islands/test[test.case.mgm1]: mgm-message-exact.explicit
@docs-islands/test[test.case.mgm1]: mgm-message-match.default.1
@docs-islands/test[test.case.mgm1]: mgm-message-match.explicit.1
```

When `debug = true`, output result:

```bash
[Test1] @docs-islands/test[test.case.mgm1]: mgm-message-exact.default <TIME>
[Test2] @docs-islands/test[test.case.mgm1]: mgm-message-exact.explicit <TIME>
[Test3] @docs-islands/test[test.case.mgm1]: mgm-message-match.default.1 <TIME>
[Test4] @docs-islands/test[test.case.mgm1]: mgm-message-match.explicit.1 <TIME>
```

---

## Case 22

Verification points:

- When `group` is used alone as a filter condition, exact matching covers both default `levels` and explicit `levels`
- This case supplements the independent coverage of `group(exact match)` under explicit `rule.levels`

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

Output result:

```bash
@docs-islands/test[test.only.exact.default]: group exact default
@docs-islands/test[test.only.exact.explicit]: group exact explicit
```

When `debug = true`, output result:

```bash
[Test1] @docs-islands/test[test.only.exact.default]: group exact default <TIME>
[Test2] @docs-islands/test[test.only.exact.explicit]: group exact explicit <TIME>
```

---

## Case 23

Verification points:

- `main + group(match)` **without message condition** covers default `levels` and explicit `levels`
- This case supplements the independent coverage of `main + group(match)`

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

Output result:

```bash
@docs-islands/test[test.combo.match.default.1]: main group match default
@docs-islands/test[test.combo.match.explicit.1]: main group match explicit
```

When `debug = true`, output result:

```bash
[Test1] @docs-islands/test[test.combo.match.default.1]: main group match default <TIME>
[Test2] @docs-islands/test[test.combo.match.explicit.1]: main group match explicit <TIME>
```

---

## Case 24

Verification points:

- When `logging.rules` is not configured, non-debug mode outputs `error | warn | info | success` by default
- In the same scenario, `debug` is not output by default

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

Output result:

```bash
@docs-islands/test[test.case.default]: message A_i
@docs-islands/test[test.case.default]: message A_s
@docs-islands/test[test.case.default]: message A_w
@docs-islands/test[test.case.default]: message A_e
```

---

## Case 25

Verification points:

- When `logging.rules` is not configured, debug mode outputs `error | warn | info | success | debug` by default
- Among them, `error | warn | info | success` need to include `<TIME>`
- Whether the `debug` level includes elapsed time is currently not mandatory; this specification asserts "not required"

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

Output result:

```bash
@docs-islands/test[test.case.default]: message A_d
@docs-islands/test[test.case.default]: message A_i <TIME>
@docs-islands/test[test.case.default]: message A_s <TIME>
@docs-islands/test[test.case.default]: message A_w <TIME>
@docs-islands/test[test.case.default]: message A_e <TIME>
```

---

## Case 26

Verification points:

- When `rules` exist, `success` participates in rule-level determination like other levels
- Covers both:
  - Inheriting `success` from `logging.levels`
  - Explicit `rule.levels = ['success']`

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

Output:

```bash
@docs-islands/test[test.success.default]: task done
@docs-islands/test[test.success.other]: job completed
```

When `debug = true`, output:

```bash
[Test1] @docs-islands/test[test.success.default]: task done <TIME>
[Test2] @docs-islands/test[test.success.other]: job completed <TIME>
```

---

## Case 27

Verification points:

- `group` / `message` match semantics are implemented by picomatch, not just supporting `*`
- This case performs basic smoke verification for `?` and `[]`

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

Output:

```bash
@docs-islands/test[test.case.a1]: noop
@docs-islands/test[test.case.a1]: task-a
@docs-islands/test[test.case.ab1]: task-b
```

When `debug = true`, output:

```bash
[Test1] @docs-islands/test[test.case.a1]: noop <TIME>
[Test2] @docs-islands/test[test.case.a1]: task-a <TIME>
[Test2] @docs-islands/test[test.case.ab1]: task-b <TIME>
```

---

## Case 28

Verification points:

- Rules with `enabled: false` have no effect at all
- Even if all other fields match, no output should occur
- When `rules` exist but activeRules is empty, must not fallback to default output behavior

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

Equivalent to:

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

Output:

```bash
# No output
```

When `debug = true`, output:

```bash
# No output
```

---

## Case 29

Verification points:

- Explicit `enabled: true` is equivalent to default enabled
- Overlapping rules with `enabled: false` do not participate in level union
- Overlapping rules with `enabled: false` do not participate in debug label

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

Output:

```bash
@docs-islands/test[test.case.enabled.mix]: message A_w
@docs-islands/test[test.case.enabled.mix]: message A_e
```

When `debug = true`, output:

```bash
[Test2] @docs-islands/test[test.case.enabled.mix]: message A_w <TIME>
[Test2] @docs-islands/test[test.case.enabled.mix]: message A_e <TIME>
```

---

## Case 30

Verification points:

- More specific rules with `enabled: false` should not override, block, or pollute other active rules
- Even when disabled rule and active rule both match scope, only the active rule takes effect

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

Output:

```bash
@docs-islands/test[test.case.enabled.exact]: message A_e
```

When `debug = true`, output:

```bash
[Test2] @docs-islands/test[test.case.enabled.exact]: message A_e <TIME>
```

---

## Case 31

Verification points:

- When `enabled: false` coexists with all fields `main + group + message`, it still completely fails
- Disabled rules do not participate in scope AND determination for allowing output
- Used to reinforce the counterexample of "all fields match but still no output due to enabled=false"

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

Equivalent to:

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

Output:

```bash
# No output
```

When `debug = true`, output:

```bash
# No output
```

---

## Case 32

Verification points:

- `main` remains exact matching even when the rule value contains glob magic
- A rule with `main: '@docs-islands/*'` does not match `main: '@docs-islands/test'`
- The same rule can still match a logger whose literal `main` is `@docs-islands/*`

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

Output:

```bash
[ExactMain] @docs-islands/test[test.case.main.literal]: exact main match <TIME>
[WildcardMain] @docs-islands/*[test.case.main.literal]: literal wildcard main <TIME>
```

---

## Case 33

Verification points:

- `rules: []` is normalized to "not configured rules"
- Therefore `rules: []` follows the default level set, not "rules exist but no active rule"

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

Output:

```bash
@docs-islands/test[test.case.empty.rules]: info visible
@docs-islands/test[test.case.empty.rules]: success visible
@docs-islands/test[test.case.empty.rules]: warn visible
@docs-islands/test[test.case.empty.rules]: error visible
```

When `debug = true`, output:

```bash
@docs-islands/test[test.case.empty.rules]: debug visible
@docs-islands/test[test.case.empty.rules]: info visible <TIME>
@docs-islands/test[test.case.empty.rules]: success visible <TIME>
@docs-islands/test[test.case.empty.rules]: warn visible <TIME>
@docs-islands/test[test.case.empty.rules]: error visible <TIME>
```

---

## Case 34

Verification points:

- When `rule.levels` and `logging.levels` are both missing, the rule uses `defaultResolvedLevels`
- In rule mode, `debug` level logs remain suppressed

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

Output:

```bash
[DefaultLevels] @docs-islands/test[test.case.default.levels]: info visible <TIME>
[DefaultLevels] @docs-islands/test[test.case.default.levels]: success visible <TIME>
[DefaultLevels] @docs-islands/test[test.case.default.levels]: warn visible <TIME>
[DefaultLevels] @docs-islands/test[test.case.default.levels]: error visible <TIME>
```

---

## Case 35

Verification points:

- Debug labels come from contributing rules, not merely scope-matched rules
- A rule contributes only when both scope and `effectiveLevels(rule)` match the current log
- Elapsed time assertions should compare the exact normalized output, including fixed `ms` values

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

Output:

```bash
[WarnOnly][WarnAndError] @docs-islands/test[test.case.contributing.labels]: warn path <TIME>
[InheritedError][WarnAndError] @docs-islands/test[test.case.contributing.labels]: error path <TIME>
```

## 4. Rule Form Combination Coverage Matrix

The following table uses "rule form × levels source" as dimensions to confirm that combinations of `main / group / message / levels` are all covered by specific tests.

| Rule Form                                            | Default levels Inheritance Coverage | Explicit rule.levels Coverage |
| ---------------------------------------------------- | ----------------------------------- | ----------------------------- |
| No `main/group/message`                              | Case 1 / Test1                      | Case 2 / Test2                |
| `main`                                               | Case 3 / Test2                      | Case 3 / Test3                |
| `group (exact match)`                                | Case 4 / Test1                      | Case 22 / Test2               |
| `group (match)`                                      | Case 5 / Test1                      | Case 5 / Test2                |
| `message (exact match)`                              | Case 16 / Test1                     | Case 16 / Test2               |
| `message (match)`                                    | Case 16 / Test3                     | Case 16 / Test4               |
| `main + group (exact match)`                         | Case 7 / Test1                      | Case 7 / Test2                |
| `main + group (match)`                               | Case 23 / Test1                     | Case 23 / Test2               |
| `main + message (exact match)`                       | Case 17 / Test1                     | Case 17 / Test2               |
| `main + message (match)`                             | Case 17 / Test3                     | Case 17 / Test4               |
| `group (exact match) + message (exact match)`        | Case 18 / Test1                     | Case 18 / Test2               |
| `group (exact match) + message (match)`              | Case 18 / Test3                     | Case 18 / Test4               |
| `group (match) + message (exact match)`              | Case 19 / Test1                     | Case 19 / Test2               |
| `group (match) + message (match)`                    | Case 19 / Test3                     | Case 19 / Test4               |
| `main + group (exact match) + message (exact match)` | Case 20 / Test1                     | Case 20 / Test2               |
| `main + group (exact match) + message (match)`       | Case 20 / Test3                     | Case 20 / Test4               |
| `main + group (match) + message (exact match)`       | Case 21 / Test1                     | Case 21 / Test2               |
| `main + group (match) + message (match)`             | Case 21 / Test3                     | Case 21 / Test4               |

---

## 5. `enabled` Gate Control Behavior Coverage Matrix

| `enabled` Form                                     | Semantics                                                    | Covered Cases                               |
| -------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------- |
| Missing                                            | Default equivalent to `true`                                 | Cases 1 ~ 28 rules without explicit enabled |
| Explicit `true`                                    | Same as default enabled                                      | Case 29 / Test2, Case 30 / Test2            |
| Explicit `false` (single rule)                     | Rule completely ineffective; no output                       | Case 28                                     |
| Explicit `false` (overlapping with active rule)    | Does not participate in union, does not participate in label | Case 29                                     |
| Explicit `false` (more specific rule)              | Does not override, does not block active rule                | Case 30                                     |
| Explicit `false` (`main+group+message` all fields) | All fields match but still invalid                           | Case 31                                     |

---

## 6. Runtime Behavior Coverage Matrix

| Runtime Behavior                                                                       | Covered Cases                                            |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| When normalized `rules` exist, only determine by activeRules                           | 1 ~ 23, 26, 27, 28, 29, 30, 31, 32, 34, 35               |
| When normalized `rules` exist but no match, no output                                  | 6, 13, 15, 17, 18, 19, 20, 21, 23, 28, 31, 32            |
| When normalized `rules` exist and all disabled, no output                              | 28, 31                                                   |
| `rules: []` normalizes to no-rules default behavior                                    | 33                                                       |
| No `rules` + `debug = false` default output `error`, `warn`, `info`, `success`         | 24, 33                                                   |
| No `rules` + `debug = true` default output `error`, `warn`, `info`, `success`, `debug` | 25, 33                                                   |
| Missing `rule.levels` and `logging.levels` falls back to `defaultResolvedLevels`       | 34                                                       |
| In debug mode `error`, `warn`, `info`, `success` append `<TIME>`                       | 1 ~ 23, 25, 26, 27, 29, 30, 32, 33, 34, 35               |
| In debug mode `debug` logs do not force `<TIME>`                                       | 25, 33                                                   |
| Debug labels include only contributing rules                                           | 2, 29, 30, 35                                            |
| `success` can be allowed by default / explicit levels in rule mode                     | 26, 34                                                   |
| picomatch `*`                                                                          | 5, 9, 10, 12, 13, 15, 16, 17, 18, 19, 20, 21, 23, 26, 31 |
| picomatch `?`                                                                          | 27                                                       |
| picomatch `[]`                                                                         | 27                                                       |
| `main` with glob magic remains exact string matching                                   | 32                                                       |
| debug label order                                                                      | 1, 2, 3, 11, 14, 35                                      |
| Disabled rules do not participate in label                                             | 29, 30                                                   |

---

## 7. Capability Point Coverage Matrix (Summary)

| Capability Point                    | Covered Cases                                                                |
| ----------------------------------- | ---------------------------------------------------------------------------- |
| Default `enabled = true`            | 1 ~ 27, 32, 34, 35                                                           |
| Explicit `enabled = true`           | 29, 30                                                                       |
| Explicit `enabled = false`          | 28, 29, 30, 31                                                               |
| Default levels inheritance          | 1, 3, 4, 5, 6, 7, 12, 13, 16, 17, 18, 19, 20, 21, 22, 23, 26, 28, 29, 31, 35 |
| defaultResolvedLevels fallback      | 34                                                                           |
| rule.levels override default levels | 2, 3, 5, 7, 8, 9, 10, 15, 16, 17, 18, 19, 20, 21, 22, 23, 26, 27, 29, 30     |
| No scope global rule                | 1, 2, 8, 9, 11, 14, 16, 27 (message only)                                    |
| main exact match                    | 3, 7, 10, 13, 17, 20, 21, 23, 31, 32                                         |
| group exact match                   | 4, 7, 18, 20, 22, 28, 29, 30                                                 |
| group picomatch match               | 5, 10, 12, 13, 15, 19, 21, 23, 27, 31                                        |
| message exact match                 | 8, 14, 16, 17, 18, 19, 20, 21, 27                                            |
| message picomatch match             | 9, 10, 11, 12, 13, 15, 16, 17, 18, 19, 20, 21, 26, 31                        |
| main + group AND                    | 7, 10, 13, 20, 21, 23, 31                                                    |
| main + message AND                  | 17, 31                                                                       |
| group + message AND                 | 10, 15, 18, 19, 20, 21, 31                                                   |
| main + group + message AND          | 10, 13, 20, 21, 31                                                           |
| No `rules` default output           | 24, 25, 33                                                                   |
| `rules: []` normalization           | 33                                                                           |
| `success`                           | 24, 25, 26, 33, 34                                                           |
| `debug`                             | 25, 33, 34                                                                   |
| debug relative time suffix          | 1 ~ 23, 25, 26, 27, 29, 30, 32, 33, 34, 35                                   |
| exact normalized output assertions  | 4, 7, 11, 13, 14, 15, 23, 24, 25, 26, 29, 30, 32, 33, 34, 35                 |

---

## 8. Final Conclusion

This test documentation set can now be used as a **standardized test baseline** for the following reasons:

1. Rule combinations of `main`, `group`, `message`, `levels` have been implemented through matrix approach
2. Both **exact match / picomatch match** for `group` and `message` have positive and negative examples
3. `main` has been explicitly limited to **exact match only**
4. Runtime requirements from supplementary information have been explicitly incorporated into tests:
   - picomatch
   - `enabled`
   - debug relative time suffix
   - Default output when no `rules`
   - `rules: []` normalization
   - default level fallback when rule and global levels are both missing
5. Tests cover both "should output" and "must not output", avoiding only testing happy path
6. Strict output assertions normalize ANSI escape sequences and compare fixed elapsed time values exactly in the high-risk and supplemental compliance cases; broad matrix cases may still use count/order/pattern assertions
7. `enabled: false` has been proven to be a true "gate control switch", not a low-priority rule

For future specification enhancements, priority recommendations:

- If `main` supports match in the future, need new independent matrix
- Case sensitivity
- Empty string `message`
