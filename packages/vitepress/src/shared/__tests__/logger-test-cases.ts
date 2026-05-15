import type { LogKind, ResolvedLoggerConfig } from '@docs-islands/logger/types';

export const LOGGER_SPEC_CASE_COUNT = 31;
export const LOGGER_SPEC_ELAPSED = '42.00ms';

interface LoggerFixture {
  group: string;
  main: string;
}

interface LoggerOperation {
  kind: LogKind;
  logger: string;
  message: string;
}

export interface LoggerSpecCase {
  config: ResolvedLoggerConfig;
  expected: string[];
  expectedDebug?: string[];
  loggers: Record<string, LoggerFixture>;
  name: string;
  operations: LoggerOperation[];
}

const TEST_MAIN = '@docs-islands/test';
const TEST_MAIN_B = '@docs-islands/test_b';
const TEST_MAIN_C = '@docs-islands/test_c';

const op = (
  logger: string,
  kind: LogKind,
  message: string,
): LoggerOperation => ({
  kind,
  logger,
  message,
});

const line = (main: string, group: string, message: string): string =>
  `${main}[${group}]: ${message}`;

const labels = (values: string[]): string =>
  values.length === 0 ? '' : `${values.map((value) => `[${value}]`).join('')} `;

const debugLine = (
  labelValues: string[],
  main: string,
  group: string,
  message: string,
): string =>
  `${labels(labelValues)}${line(main, group, `${message} ${LOGGER_SPEC_ELAPSED}`)}`;

const commonA = {
  A: { group: 'test.case.a', main: TEST_MAIN },
} satisfies Record<string, LoggerFixture>;

const commonAOps = [
  op('A', 'info', 'message A_a'),
  op('A', 'warn', 'message A_b_1'),
  op('A', 'warn', 'message A_b_2'),
  op('A', 'error', 'message A_c'),
];

export const loggerSpecCases: LoggerSpecCase[] = [
  {
    name: 'Case 1 - label-only rules inherit root levels',
    config: {
      debug: false,
      levels: ['warn', 'error'],
      rules: [{ label: 'Test1' }, { label: 'Test2' }],
    },
    loggers: commonA,
    operations: commonAOps,
    expected: [
      line(TEST_MAIN, 'test.case.a', 'message A_b_1'),
      line(TEST_MAIN, 'test.case.a', 'message A_b_2'),
      line(TEST_MAIN, 'test.case.a', 'message A_c'),
    ],
    expectedDebug: [
      debugLine(['Test1', 'Test2'], TEST_MAIN, 'test.case.a', 'message A_b_1'),
      debugLine(['Test1', 'Test2'], TEST_MAIN, 'test.case.a', 'message A_b_2'),
      debugLine(['Test1', 'Test2'], TEST_MAIN, 'test.case.a', 'message A_c'),
    ],
  },
  {
    name: 'Case 2 - rule levels override and matching rules union',
    config: {
      debug: false,
      levels: ['warn', 'error'],
      rules: [{ label: 'Test1' }, { label: 'Test2', levels: ['warn', 'info'] }],
    },
    loggers: commonA,
    operations: commonAOps,
    expected: [
      line(TEST_MAIN, 'test.case.a', 'message A_a'),
      line(TEST_MAIN, 'test.case.a', 'message A_b_1'),
      line(TEST_MAIN, 'test.case.a', 'message A_b_2'),
      line(TEST_MAIN, 'test.case.a', 'message A_c'),
    ],
    expectedDebug: [
      debugLine(['Test2'], TEST_MAIN, 'test.case.a', 'message A_a'),
      debugLine(['Test1', 'Test2'], TEST_MAIN, 'test.case.a', 'message A_b_1'),
      debugLine(['Test1', 'Test2'], TEST_MAIN, 'test.case.a', 'message A_b_2'),
      debugLine(['Test1'], TEST_MAIN, 'test.case.a', 'message A_c'),
    ],
  },
  {
    name: 'Case 3 - main exact matching and global rules union',
    config: {
      debug: false,
      levels: ['warn', 'error'],
      rules: [
        { label: 'Test1', levels: ['warn'] },
        { label: 'Test2', main: TEST_MAIN },
        { label: 'Test3', levels: ['warn', 'info'], main: TEST_MAIN_B },
        { label: 'Test4', levels: ['error'], main: TEST_MAIN_B },
      ],
    },
    loggers: {
      A: { group: 'test.case.a', main: TEST_MAIN },
      B: { group: 'test.case.b', main: TEST_MAIN_B },
    },
    operations: [
      ...commonAOps,
      op('B', 'info', 'message B_a'),
      op('B', 'warn', 'message B_b_1'),
      op('B', 'warn', 'message B_b_2'),
      op('B', 'error', 'message B_c'),
    ],
    expected: [
      line(TEST_MAIN, 'test.case.a', 'message A_b_1'),
      line(TEST_MAIN, 'test.case.a', 'message A_b_2'),
      line(TEST_MAIN, 'test.case.a', 'message A_c'),
      line(TEST_MAIN_B, 'test.case.b', 'message B_a'),
      line(TEST_MAIN_B, 'test.case.b', 'message B_b_1'),
      line(TEST_MAIN_B, 'test.case.b', 'message B_b_2'),
      line(TEST_MAIN_B, 'test.case.b', 'message B_c'),
    ],
    expectedDebug: [
      debugLine(['Test1', 'Test2'], TEST_MAIN, 'test.case.a', 'message A_b_1'),
      debugLine(['Test1', 'Test2'], TEST_MAIN, 'test.case.a', 'message A_b_2'),
      debugLine(['Test2'], TEST_MAIN, 'test.case.a', 'message A_c'),
      debugLine(['Test3'], TEST_MAIN_B, 'test.case.b', 'message B_a'),
      debugLine(
        ['Test1', 'Test3'],
        TEST_MAIN_B,
        'test.case.b',
        'message B_b_1',
      ),
      debugLine(
        ['Test1', 'Test3'],
        TEST_MAIN_B,
        'test.case.b',
        'message B_b_2',
      ),
      debugLine(['Test4'], TEST_MAIN_B, 'test.case.b', 'message B_c'),
    ],
  },
  {
    name: 'Case 4 - group exact matching is main-independent',
    config: {
      debug: false,
      levels: ['warn', 'error'],
      rules: [{ label: 'Test1', group: 'test.case.a' }],
    },
    loggers: {
      A: { group: 'test.case.a', main: TEST_MAIN },
      B: { group: 'test.case.a', main: TEST_MAIN_B },
      AB: { group: 'test.case.b', main: TEST_MAIN },
    },
    operations: [
      ...commonAOps,
      op('B', 'info', 'message B_a'),
      op('B', 'warn', 'message B_b_1'),
      op('B', 'warn', 'message B_b_2'),
      op('B', 'error', 'message B_c'),
      op('AB', 'info', 'message A_B_a'),
      op('AB', 'warn', 'message A_B_b_1'),
      op('AB', 'warn', 'message A_B_b_2'),
      op('AB', 'error', 'message A_B_c'),
    ],
    expected: [
      line(TEST_MAIN, 'test.case.a', 'message A_b_1'),
      line(TEST_MAIN, 'test.case.a', 'message A_b_2'),
      line(TEST_MAIN, 'test.case.a', 'message A_c'),
      line(TEST_MAIN_B, 'test.case.a', 'message B_b_1'),
      line(TEST_MAIN_B, 'test.case.a', 'message B_b_2'),
      line(TEST_MAIN_B, 'test.case.a', 'message B_c'),
    ],
    expectedDebug: [
      debugLine(['Test1'], TEST_MAIN, 'test.case.a', 'message A_b_1'),
      debugLine(['Test1'], TEST_MAIN, 'test.case.a', 'message A_b_2'),
      debugLine(['Test1'], TEST_MAIN, 'test.case.a', 'message A_c'),
      debugLine(['Test1'], TEST_MAIN_B, 'test.case.a', 'message B_b_1'),
      debugLine(['Test1'], TEST_MAIN_B, 'test.case.a', 'message B_b_2'),
      debugLine(['Test1'], TEST_MAIN_B, 'test.case.a', 'message B_c'),
    ],
  },
  {
    name: 'Case 5 - group glob matching and union labels',
    config: {
      debug: false,
      levels: ['warn', 'error'],
      rules: [
        { label: 'Test1', group: 'test.case.b*' },
        { label: 'Test2', group: 'test.case.*', levels: ['warn'] },
        { label: 'Test3', group: 'test.*', levels: ['info'] },
        { label: 'Test4', group: 'test.*', levels: ['error'] },
      ],
    },
    loggers: {
      A: { group: 'test.case.a', main: TEST_MAIN },
      B: { group: 'test.case.b_1', main: TEST_MAIN_B },
      AB: { group: 'test.case.b_2', main: TEST_MAIN },
      ABC: { group: 'test.c', main: TEST_MAIN_C },
    },
    operations: [
      ...commonAOps,
      op('B', 'info', 'message B_a'),
      op('B', 'warn', 'message B_b_1'),
      op('B', 'warn', 'message B_b_2'),
      op('B', 'error', 'message B_c'),
      op('AB', 'info', 'message A_B_a'),
      op('AB', 'warn', 'message A_B_b_1'),
      op('AB', 'warn', 'message A_B_b_2'),
      op('AB', 'error', 'message A_B_c'),
      op('ABC', 'info', 'message A_B_C_a'),
      op('ABC', 'warn', 'message A_B_C_b_1'),
      op('ABC', 'warn', 'message A_B_C_b_2'),
      op('ABC', 'error', 'message A_B_C_c'),
    ],
    expected: [
      line(TEST_MAIN, 'test.case.a', 'message A_a'),
      line(TEST_MAIN, 'test.case.a', 'message A_b_1'),
      line(TEST_MAIN, 'test.case.a', 'message A_b_2'),
      line(TEST_MAIN, 'test.case.a', 'message A_c'),
      line(TEST_MAIN_B, 'test.case.b_1', 'message B_a'),
      line(TEST_MAIN_B, 'test.case.b_1', 'message B_b_1'),
      line(TEST_MAIN_B, 'test.case.b_1', 'message B_b_2'),
      line(TEST_MAIN_B, 'test.case.b_1', 'message B_c'),
      line(TEST_MAIN, 'test.case.b_2', 'message A_B_a'),
      line(TEST_MAIN, 'test.case.b_2', 'message A_B_b_1'),
      line(TEST_MAIN, 'test.case.b_2', 'message A_B_b_2'),
      line(TEST_MAIN, 'test.case.b_2', 'message A_B_c'),
      line(TEST_MAIN_C, 'test.c', 'message A_B_C_a'),
      line(TEST_MAIN_C, 'test.c', 'message A_B_C_c'),
    ],
    expectedDebug: [
      debugLine(['Test3'], TEST_MAIN, 'test.case.a', 'message A_a'),
      debugLine(['Test2'], TEST_MAIN, 'test.case.a', 'message A_b_1'),
      debugLine(['Test2'], TEST_MAIN, 'test.case.a', 'message A_b_2'),
      debugLine(['Test4'], TEST_MAIN, 'test.case.a', 'message A_c'),
      debugLine(['Test3'], TEST_MAIN_B, 'test.case.b_1', 'message B_a'),
      debugLine(
        ['Test1', 'Test2'],
        TEST_MAIN_B,
        'test.case.b_1',
        'message B_b_1',
      ),
      debugLine(
        ['Test1', 'Test2'],
        TEST_MAIN_B,
        'test.case.b_1',
        'message B_b_2',
      ),
      debugLine(
        ['Test1', 'Test4'],
        TEST_MAIN_B,
        'test.case.b_1',
        'message B_c',
      ),
      debugLine(['Test3'], TEST_MAIN, 'test.case.b_2', 'message A_B_a'),
      debugLine(
        ['Test1', 'Test2'],
        TEST_MAIN,
        'test.case.b_2',
        'message A_B_b_1',
      ),
      debugLine(
        ['Test1', 'Test2'],
        TEST_MAIN,
        'test.case.b_2',
        'message A_B_b_2',
      ),
      debugLine(
        ['Test1', 'Test4'],
        TEST_MAIN,
        'test.case.b_2',
        'message A_B_c',
      ),
      debugLine(['Test3'], TEST_MAIN_C, 'test.c', 'message A_B_C_a'),
      debugLine(['Test4'], TEST_MAIN_C, 'test.c', 'message A_B_C_c'),
    ],
  },
  {
    name: 'Case 6 - rules mode does not fallback when no rule matches',
    config: {
      debug: false,
      levels: ['warn', 'error'],
      rules: [{ label: 'Test1', group: 'test.case.a' }],
    },
    loggers: {
      A: { group: 'test.case.b', main: TEST_MAIN },
    },
    operations: [
      op('A', 'info', 'message A_a'),
      op('A', 'warn', 'message A_b'),
      op('A', 'error', 'message A_c'),
    ],
    expected: [],
    expectedDebug: [],
  },
  {
    name: 'Case 7 - main and group use AND semantics',
    config: {
      debug: false,
      levels: ['warn', 'error'],
      rules: [
        { label: 'Test1', main: TEST_MAIN, group: 'test.case.a' },
        {
          label: 'Test2',
          main: TEST_MAIN_B,
          group: 'test.case.a',
          levels: ['warn'],
        },
      ],
    },
    loggers: {
      A: { group: 'test.case.a', main: TEST_MAIN },
      B: { group: 'test.case.a', main: TEST_MAIN_B },
      C: { group: 'test.case.b', main: TEST_MAIN },
    },
    operations: [
      op('A', 'warn', 'message A_b'),
      op('A', 'error', 'message A_c'),
      op('B', 'warn', 'message B_b'),
      op('B', 'error', 'message B_c'),
      op('C', 'warn', 'message C_b'),
      op('C', 'error', 'message C_c'),
    ],
    expected: [
      line(TEST_MAIN, 'test.case.a', 'message A_b'),
      line(TEST_MAIN, 'test.case.a', 'message A_c'),
      line(TEST_MAIN_B, 'test.case.a', 'message B_b'),
    ],
    expectedDebug: [
      debugLine(['Test1'], TEST_MAIN, 'test.case.a', 'message A_b'),
      debugLine(['Test1'], TEST_MAIN, 'test.case.a', 'message A_c'),
      debugLine(['Test2'], TEST_MAIN_B, 'test.case.a', 'message B_b'),
    ],
  },
  {
    name: 'Case 8 - message exact matching',
    config: {
      debug: false,
      levels: ['warn', 'error'],
      rules: [
        { label: 'Test1', message: 'request timeout', levels: ['error'] },
        { label: 'Test2', message: 'slow query', levels: ['warn'] },
      ],
    },
    loggers: {
      A: { group: 'test.case.message', main: TEST_MAIN },
    },
    operations: [
      op('A', 'info', 'slow query'),
      op('A', 'warn', 'slow query'),
      op('A', 'warn', 'slow query 123'),
      op('A', 'error', 'request timeout'),
      op('A', 'error', 'request timeout on user api'),
    ],
    expected: [
      line(TEST_MAIN, 'test.case.message', 'slow query'),
      line(TEST_MAIN, 'test.case.message', 'request timeout'),
    ],
    expectedDebug: [
      debugLine(['Test2'], TEST_MAIN, 'test.case.message', 'slow query'),
      debugLine(['Test1'], TEST_MAIN, 'test.case.message', 'request timeout'),
    ],
  },
  {
    name: 'Case 9 - message glob matching',
    config: {
      debug: false,
      rules: [
        { label: 'Test1', message: 'timeout:*', levels: ['warn'] },
        { label: 'Test2', message: '*database*', levels: ['error'] },
        { label: 'Test3', message: 'worker * finished', levels: ['info'] },
        { label: 'Test4', message: 'timeout:*', levels: ['error'] },
      ],
    },
    loggers: {
      A: { group: 'test.case.message.match', main: TEST_MAIN },
    },
    operations: [
      op('A', 'info', 'worker sync finished'),
      op('A', 'warn', 'timeout: fetch user'),
      op('A', 'error', 'primary database unavailable'),
      op('A', 'error', 'timeout: database unavailable'),
    ],
    expected: [
      line(TEST_MAIN, 'test.case.message.match', 'worker sync finished'),
      line(TEST_MAIN, 'test.case.message.match', 'timeout: fetch user'),
      line(
        TEST_MAIN,
        'test.case.message.match',
        'primary database unavailable',
      ),
      line(
        TEST_MAIN,
        'test.case.message.match',
        'timeout: database unavailable',
      ),
    ],
    expectedDebug: [
      debugLine(
        ['Test3'],
        TEST_MAIN,
        'test.case.message.match',
        'worker sync finished',
      ),
      debugLine(
        ['Test1'],
        TEST_MAIN,
        'test.case.message.match',
        'timeout: fetch user',
      ),
      debugLine(
        ['Test2'],
        TEST_MAIN,
        'test.case.message.match',
        'primary database unavailable',
      ),
      debugLine(
        ['Test2', 'Test4'],
        TEST_MAIN,
        'test.case.message.match',
        'timeout: database unavailable',
      ),
    ],
  },
  {
    name: 'Case 10 - partial and full scope rules compose',
    config: {
      debug: false,
      rules: [
        {
          label: 'Test1',
          main: TEST_MAIN,
          group: 'test.api.*',
          message: 'retry *',
          levels: ['warn'],
        },
        {
          label: 'Test2',
          main: TEST_MAIN,
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
    },
    loggers: {
      A: { group: 'test.api.fetch', main: TEST_MAIN },
      B: { group: 'test.api.fetch', main: TEST_MAIN_B },
      C: { group: 'test.api.update', main: TEST_MAIN },
    },
    operations: [
      op('A', 'warn', 'retry request'),
      op('A', 'warn', 'request timeout'),
      op('A', 'error', 'request timeout'),
      op('B', 'warn', 'request timeout'),
      op('B', 'error', 'request timeout'),
      op('C', 'warn', 'retry request'),
      op('C', 'error', 'request timeout'),
    ],
    expected: [
      line(TEST_MAIN, 'test.api.fetch', 'retry request'),
      line(TEST_MAIN, 'test.api.fetch', 'request timeout'),
      line(TEST_MAIN, 'test.api.fetch', 'request timeout'),
      line(TEST_MAIN_B, 'test.api.fetch', 'request timeout'),
      line(TEST_MAIN, 'test.api.update', 'retry request'),
    ],
    expectedDebug: [
      debugLine(['Test1'], TEST_MAIN, 'test.api.fetch', 'retry request'),
      debugLine(['Test3'], TEST_MAIN, 'test.api.fetch', 'request timeout'),
      debugLine(['Test2'], TEST_MAIN, 'test.api.fetch', 'request timeout'),
      debugLine(['Test3'], TEST_MAIN_B, 'test.api.fetch', 'request timeout'),
      debugLine(['Test1'], TEST_MAIN, 'test.api.update', 'retry request'),
    ],
  },
  {
    name: 'Case 11 - multiple message labels keep declaration order',
    config: {
      debug: false,
      rules: [
        { label: 'Test1', message: '*timeout*', levels: ['error'] },
        { label: 'Test2', message: 'request *', levels: ['error'] },
        { label: 'Test3', message: '*user*', levels: ['error'] },
      ],
    },
    loggers: {
      A: { group: 'test.case.message.order', main: TEST_MAIN },
    },
    operations: [op('A', 'error', 'request timeout user api')],
    expected: [
      line(TEST_MAIN, 'test.case.message.order', 'request timeout user api'),
    ],
    expectedDebug: [
      debugLine(
        ['Test1', 'Test2', 'Test3'],
        TEST_MAIN,
        'test.case.message.order',
        'request timeout user api',
      ),
    ],
  },
  {
    name: 'Case 12 - message match-all still respects other fields',
    config: {
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
    },
    loggers: {
      A: { group: 'test.audit.login', main: TEST_MAIN },
      B: { group: 'test.audit.logout', main: TEST_MAIN },
    },
    operations: [
      op('A', 'warn', 'login failed'),
      op('A', 'error', 'login failed'),
      op('B', 'warn', 'logout failed'),
      op('B', 'error', 'logout failed'),
    ],
    expected: [
      line(TEST_MAIN, 'test.audit.login', 'login failed'),
      line(TEST_MAIN, 'test.audit.login', 'login failed'),
      line(TEST_MAIN, 'test.audit.logout', 'logout failed'),
    ],
    expectedDebug: [
      debugLine(['Test2'], TEST_MAIN, 'test.audit.login', 'login failed'),
      debugLine(['Test1'], TEST_MAIN, 'test.audit.login', 'login failed'),
      debugLine(['Test1'], TEST_MAIN, 'test.audit.logout', 'logout failed'),
    ],
  },
  {
    name: 'Case 13 - full main group message AND matching',
    config: {
      debug: false,
      levels: ['warn', 'error'],
      rules: [
        {
          label: 'Test1',
          main: TEST_MAIN,
          group: 'test.payment.*',
          message: '*timeout*',
          levels: ['error'],
        },
      ],
    },
    loggers: {
      A: { group: 'test.payment.charge', main: TEST_MAIN },
      B: { group: 'test.payment.charge', main: TEST_MAIN_B },
      C: { group: 'test.payment.refund', main: TEST_MAIN },
    },
    operations: [
      op('A', 'warn', 'request timeout'),
      op('A', 'error', 'request timeout'),
      op('A', 'error', 'request failed'),
      op('B', 'error', 'request timeout'),
      op('C', 'error', 'request success'),
    ],
    expected: [line(TEST_MAIN, 'test.payment.charge', 'request timeout')],
    expectedDebug: [
      debugLine(['Test1'], TEST_MAIN, 'test.payment.charge', 'request timeout'),
    ],
  },
  {
    name: 'Case 14 - exact and wildcard message rules can overlap',
    config: {
      debug: false,
      rules: [
        { label: 'Test1', message: 'request timeout', levels: ['error'] },
        { label: 'Test2', message: '*timeout*', levels: ['error'] },
        { label: 'Test3', message: 'request *', levels: ['error'] },
      ],
    },
    loggers: {
      A: { group: 'test.case.message.mix', main: TEST_MAIN },
    },
    operations: [
      op('A', 'error', 'request timeout'),
      op('A', 'error', 'request timeout downstream'),
    ],
    expected: [
      line(TEST_MAIN, 'test.case.message.mix', 'request timeout'),
      line(TEST_MAIN, 'test.case.message.mix', 'request timeout downstream'),
    ],
    expectedDebug: [
      debugLine(
        ['Test1', 'Test2', 'Test3'],
        TEST_MAIN,
        'test.case.message.mix',
        'request timeout',
      ),
      debugLine(
        ['Test2', 'Test3'],
        TEST_MAIN,
        'test.case.message.mix',
        'request timeout downstream',
      ),
    ],
  },
  {
    name: 'Case 15 - message negative cases',
    config: {
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
    },
    loggers: {
      A: { group: 'test.notify.email', main: TEST_MAIN },
    },
    operations: [
      op('A', 'info', 'delivery failed'),
      op('A', 'warn', 'delivery success'),
      op('A', 'warn', 'delivery failed'),
      op('A', 'error', 'delivery failed'),
      op('A', 'error', 'request timeout'),
    ],
    expected: [
      line(TEST_MAIN, 'test.notify.email', 'delivery failed'),
      line(TEST_MAIN, 'test.notify.email', 'request timeout'),
    ],
    expectedDebug: [
      debugLine(['Test1'], TEST_MAIN, 'test.notify.email', 'delivery failed'),
      debugLine(['Test2'], TEST_MAIN, 'test.notify.email', 'request timeout'),
    ],
  },
  {
    name: 'Case 16 - message-only exact and glob coverage',
    config: {
      debug: false,
      levels: ['warn'],
      rules: [
        { label: 'Test1', message: 'msg.exact.default' },
        { label: 'Test2', message: 'msg.exact.explicit', levels: ['info'] },
        { label: 'Test3', message: 'msg.match.default.*' },
        { label: 'Test4', message: 'msg.match.explicit.*', levels: ['error'] },
      ],
    },
    loggers: {
      A: { group: 'test.case.message.cover', main: TEST_MAIN },
    },
    operations: [
      op('A', 'warn', 'msg.exact.default'),
      op('A', 'info', 'msg.exact.explicit'),
      op('A', 'warn', 'msg.match.default.1'),
      op('A', 'error', 'msg.match.explicit.1'),
      op('A', 'info', 'msg.exact.default'),
      op('A', 'warn', 'msg.exact.explicit'),
      op('A', 'info', 'msg.match.default.1'),
      op('A', 'warn', 'msg.match.explicit.1'),
    ],
    expected: [
      line(TEST_MAIN, 'test.case.message.cover', 'msg.exact.default'),
      line(TEST_MAIN, 'test.case.message.cover', 'msg.exact.explicit'),
      line(TEST_MAIN, 'test.case.message.cover', 'msg.match.default.1'),
      line(TEST_MAIN, 'test.case.message.cover', 'msg.match.explicit.1'),
    ],
    expectedDebug: [
      debugLine(
        ['Test1'],
        TEST_MAIN,
        'test.case.message.cover',
        'msg.exact.default',
      ),
      debugLine(
        ['Test2'],
        TEST_MAIN,
        'test.case.message.cover',
        'msg.exact.explicit',
      ),
      debugLine(
        ['Test3'],
        TEST_MAIN,
        'test.case.message.cover',
        'msg.match.default.1',
      ),
      debugLine(
        ['Test4'],
        TEST_MAIN,
        'test.case.message.cover',
        'msg.match.explicit.1',
      ),
    ],
  },
  {
    name: 'Case 17 - main and message coverage',
    config: {
      debug: false,
      levels: ['warn'],
      rules: [
        {
          label: 'Test1',
          main: TEST_MAIN,
          message: 'main-message.exact.default',
        },
        {
          label: 'Test2',
          main: TEST_MAIN,
          message: 'main-message.exact.explicit',
          levels: ['error'],
        },
        {
          label: 'Test3',
          main: TEST_MAIN,
          message: 'main-message.match.default.*',
        },
        {
          label: 'Test4',
          main: TEST_MAIN,
          message: 'main-message.match.explicit.*',
          levels: ['info'],
        },
      ],
    },
    loggers: {
      A: { group: 'test.case.main.message', main: TEST_MAIN },
      B: { group: 'test.case.main.message', main: TEST_MAIN_B },
    },
    operations: [
      op('A', 'warn', 'main-message.exact.default'),
      op('A', 'error', 'main-message.exact.explicit'),
      op('A', 'warn', 'main-message.match.default.1'),
      op('A', 'info', 'main-message.match.explicit.1'),
      op('B', 'warn', 'main-message.exact.default'),
      op('B', 'error', 'main-message.exact.explicit'),
      op('B', 'warn', 'main-message.match.default.1'),
      op('B', 'info', 'main-message.match.explicit.1'),
    ],
    expected: [
      line(TEST_MAIN, 'test.case.main.message', 'main-message.exact.default'),
      line(TEST_MAIN, 'test.case.main.message', 'main-message.exact.explicit'),
      line(TEST_MAIN, 'test.case.main.message', 'main-message.match.default.1'),
      line(
        TEST_MAIN,
        'test.case.main.message',
        'main-message.match.explicit.1',
      ),
    ],
    expectedDebug: [
      debugLine(
        ['Test1'],
        TEST_MAIN,
        'test.case.main.message',
        'main-message.exact.default',
      ),
      debugLine(
        ['Test2'],
        TEST_MAIN,
        'test.case.main.message',
        'main-message.exact.explicit',
      ),
      debugLine(
        ['Test3'],
        TEST_MAIN,
        'test.case.main.message',
        'main-message.match.default.1',
      ),
      debugLine(
        ['Test4'],
        TEST_MAIN,
        'test.case.main.message',
        'main-message.match.explicit.1',
      ),
    ],
  },
  {
    name: 'Case 18 - exact group and message coverage',
    config: {
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
    },
    loggers: {
      A: { group: 'test.case.gx', main: TEST_MAIN },
      B: { group: 'test.case.gy', main: TEST_MAIN },
    },
    operations: [
      op('A', 'warn', 'group-exact-message-exact.default'),
      op('A', 'error', 'group-exact-message-exact.explicit'),
      op('A', 'warn', 'group-exact-message-match.default.1'),
      op('A', 'info', 'group-exact-message-match.explicit.1'),
      op('B', 'warn', 'group-exact-message-exact.default'),
      op('B', 'error', 'group-exact-message-exact.explicit'),
      op('B', 'warn', 'group-exact-message-match.default.1'),
      op('B', 'info', 'group-exact-message-match.explicit.1'),
    ],
    expected: [
      line(TEST_MAIN, 'test.case.gx', 'group-exact-message-exact.default'),
      line(TEST_MAIN, 'test.case.gx', 'group-exact-message-exact.explicit'),
      line(TEST_MAIN, 'test.case.gx', 'group-exact-message-match.default.1'),
      line(TEST_MAIN, 'test.case.gx', 'group-exact-message-match.explicit.1'),
    ],
    expectedDebug: [
      debugLine(
        ['Test1'],
        TEST_MAIN,
        'test.case.gx',
        'group-exact-message-exact.default',
      ),
      debugLine(
        ['Test2'],
        TEST_MAIN,
        'test.case.gx',
        'group-exact-message-exact.explicit',
      ),
      debugLine(
        ['Test3'],
        TEST_MAIN,
        'test.case.gx',
        'group-exact-message-match.default.1',
      ),
      debugLine(
        ['Test4'],
        TEST_MAIN,
        'test.case.gx',
        'group-exact-message-match.explicit.1',
      ),
    ],
  },
  {
    name: 'Case 19 - glob group and message coverage',
    config: {
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
    },
    loggers: {
      A: { group: 'test.case.gm1', main: TEST_MAIN },
      B: { group: 'test.case.other', main: TEST_MAIN },
    },
    operations: [
      op('A', 'warn', 'group-match-message-exact.default'),
      op('A', 'error', 'group-match-message-exact.explicit'),
      op('A', 'warn', 'group-match-message-match.default.1'),
      op('A', 'info', 'group-match-message-match.explicit.1'),
      op('B', 'warn', 'group-match-message-exact.default'),
      op('B', 'error', 'group-match-message-exact.explicit'),
      op('B', 'warn', 'group-match-message-match.default.1'),
      op('B', 'info', 'group-match-message-match.explicit.1'),
    ],
    expected: [
      line(TEST_MAIN, 'test.case.gm1', 'group-match-message-exact.default'),
      line(TEST_MAIN, 'test.case.gm1', 'group-match-message-exact.explicit'),
      line(TEST_MAIN, 'test.case.gm1', 'group-match-message-match.default.1'),
      line(TEST_MAIN, 'test.case.gm1', 'group-match-message-match.explicit.1'),
    ],
    expectedDebug: [
      debugLine(
        ['Test1'],
        TEST_MAIN,
        'test.case.gm1',
        'group-match-message-exact.default',
      ),
      debugLine(
        ['Test2'],
        TEST_MAIN,
        'test.case.gm1',
        'group-match-message-exact.explicit',
      ),
      debugLine(
        ['Test3'],
        TEST_MAIN,
        'test.case.gm1',
        'group-match-message-match.default.1',
      ),
      debugLine(
        ['Test4'],
        TEST_MAIN,
        'test.case.gm1',
        'group-match-message-match.explicit.1',
      ),
    ],
  },
  {
    name: 'Case 20 - main exact group and message coverage',
    config: {
      debug: false,
      levels: ['warn'],
      rules: [
        {
          label: 'Test1',
          main: TEST_MAIN,
          group: 'test.case.mgx',
          message: 'mgx-message-exact.default',
        },
        {
          label: 'Test2',
          main: TEST_MAIN,
          group: 'test.case.mgx',
          message: 'mgx-message-exact.explicit',
          levels: ['error'],
        },
        {
          label: 'Test3',
          main: TEST_MAIN,
          group: 'test.case.mgx',
          message: 'mgx-message-match.default.*',
        },
        {
          label: 'Test4',
          main: TEST_MAIN,
          group: 'test.case.mgx',
          message: 'mgx-message-match.explicit.*',
          levels: ['info'],
        },
      ],
    },
    loggers: {
      A: { group: 'test.case.mgx', main: TEST_MAIN },
      B: { group: 'test.case.mgx', main: TEST_MAIN_B },
      C: { group: 'test.case.other', main: TEST_MAIN },
    },
    operations: [
      op('A', 'warn', 'mgx-message-exact.default'),
      op('A', 'error', 'mgx-message-exact.explicit'),
      op('A', 'warn', 'mgx-message-match.default.1'),
      op('A', 'info', 'mgx-message-match.explicit.1'),
      op('B', 'warn', 'mgx-message-exact.default'),
      op('B', 'error', 'mgx-message-exact.explicit'),
      op('B', 'warn', 'mgx-message-match.default.1'),
      op('B', 'info', 'mgx-message-match.explicit.1'),
      op('C', 'warn', 'mgx-message-exact.default'),
      op('C', 'error', 'mgx-message-exact.explicit'),
      op('C', 'warn', 'mgx-message-match.default.1'),
      op('C', 'info', 'mgx-message-match.explicit.1'),
    ],
    expected: [
      line(TEST_MAIN, 'test.case.mgx', 'mgx-message-exact.default'),
      line(TEST_MAIN, 'test.case.mgx', 'mgx-message-exact.explicit'),
      line(TEST_MAIN, 'test.case.mgx', 'mgx-message-match.default.1'),
      line(TEST_MAIN, 'test.case.mgx', 'mgx-message-match.explicit.1'),
    ],
    expectedDebug: [
      debugLine(
        ['Test1'],
        TEST_MAIN,
        'test.case.mgx',
        'mgx-message-exact.default',
      ),
      debugLine(
        ['Test2'],
        TEST_MAIN,
        'test.case.mgx',
        'mgx-message-exact.explicit',
      ),
      debugLine(
        ['Test3'],
        TEST_MAIN,
        'test.case.mgx',
        'mgx-message-match.default.1',
      ),
      debugLine(
        ['Test4'],
        TEST_MAIN,
        'test.case.mgx',
        'mgx-message-match.explicit.1',
      ),
    ],
  },
  {
    name: 'Case 21 - main glob group and message coverage',
    config: {
      debug: false,
      levels: ['warn'],
      rules: [
        {
          label: 'Test1',
          main: TEST_MAIN,
          group: 'test.case.mgm*',
          message: 'mgm-message-exact.default',
        },
        {
          label: 'Test2',
          main: TEST_MAIN,
          group: 'test.case.mgm*',
          message: 'mgm-message-exact.explicit',
          levels: ['error'],
        },
        {
          label: 'Test3',
          main: TEST_MAIN,
          group: 'test.case.mgm*',
          message: 'mgm-message-match.default.*',
        },
        {
          label: 'Test4',
          main: TEST_MAIN,
          group: 'test.case.mgm*',
          message: 'mgm-message-match.explicit.*',
          levels: ['info'],
        },
      ],
    },
    loggers: {
      A: { group: 'test.case.mgm1', main: TEST_MAIN },
      B: { group: 'test.case.mgm1', main: TEST_MAIN_B },
      C: { group: 'test.case.other', main: TEST_MAIN },
    },
    operations: [
      op('A', 'warn', 'mgm-message-exact.default'),
      op('A', 'error', 'mgm-message-exact.explicit'),
      op('A', 'warn', 'mgm-message-match.default.1'),
      op('A', 'info', 'mgm-message-match.explicit.1'),
      op('B', 'warn', 'mgm-message-exact.default'),
      op('B', 'error', 'mgm-message-exact.explicit'),
      op('B', 'warn', 'mgm-message-match.default.1'),
      op('B', 'info', 'mgm-message-match.explicit.1'),
      op('C', 'warn', 'mgm-message-exact.default'),
      op('C', 'error', 'mgm-message-exact.explicit'),
      op('C', 'warn', 'mgm-message-match.default.1'),
      op('C', 'info', 'mgm-message-match.explicit.1'),
    ],
    expected: [
      line(TEST_MAIN, 'test.case.mgm1', 'mgm-message-exact.default'),
      line(TEST_MAIN, 'test.case.mgm1', 'mgm-message-exact.explicit'),
      line(TEST_MAIN, 'test.case.mgm1', 'mgm-message-match.default.1'),
      line(TEST_MAIN, 'test.case.mgm1', 'mgm-message-match.explicit.1'),
    ],
    expectedDebug: [
      debugLine(
        ['Test1'],
        TEST_MAIN,
        'test.case.mgm1',
        'mgm-message-exact.default',
      ),
      debugLine(
        ['Test2'],
        TEST_MAIN,
        'test.case.mgm1',
        'mgm-message-exact.explicit',
      ),
      debugLine(
        ['Test3'],
        TEST_MAIN,
        'test.case.mgm1',
        'mgm-message-match.default.1',
      ),
      debugLine(
        ['Test4'],
        TEST_MAIN,
        'test.case.mgm1',
        'mgm-message-match.explicit.1',
      ),
    ],
  },
  {
    name: 'Case 22 - group exact default and explicit levels',
    config: {
      debug: false,
      levels: ['warn'],
      rules: [
        { label: 'Test1', group: 'test.only.exact.default' },
        {
          label: 'Test2',
          group: 'test.only.exact.explicit',
          levels: ['error'],
        },
      ],
    },
    loggers: {
      A: { group: 'test.only.exact.default', main: TEST_MAIN },
      B: { group: 'test.only.exact.explicit', main: TEST_MAIN },
    },
    operations: [
      op('A', 'warn', 'group exact default'),
      op('A', 'error', 'group exact default'),
      op('B', 'warn', 'group exact explicit'),
      op('B', 'error', 'group exact explicit'),
    ],
    expected: [
      line(TEST_MAIN, 'test.only.exact.default', 'group exact default'),
      line(TEST_MAIN, 'test.only.exact.explicit', 'group exact explicit'),
    ],
    expectedDebug: [
      debugLine(
        ['Test1'],
        TEST_MAIN,
        'test.only.exact.default',
        'group exact default',
      ),
      debugLine(
        ['Test2'],
        TEST_MAIN,
        'test.only.exact.explicit',
        'group exact explicit',
      ),
    ],
  },
  {
    name: 'Case 23 - main and group glob without message',
    config: {
      debug: false,
      levels: ['warn'],
      rules: [
        {
          label: 'Test1',
          main: TEST_MAIN,
          group: 'test.combo.match.default.*',
        },
        {
          label: 'Test2',
          main: TEST_MAIN,
          group: 'test.combo.match.explicit.*',
          levels: ['error'],
        },
      ],
    },
    loggers: {
      A: { group: 'test.combo.match.default.1', main: TEST_MAIN },
      B: { group: 'test.combo.match.explicit.1', main: TEST_MAIN },
      C: { group: 'test.combo.match.explicit.1', main: TEST_MAIN_B },
    },
    operations: [
      op('A', 'warn', 'main group match default'),
      op('A', 'error', 'main group match default'),
      op('B', 'warn', 'main group match explicit'),
      op('B', 'error', 'main group match explicit'),
      op('C', 'error', 'main group match explicit'),
    ],
    expected: [
      line(TEST_MAIN, 'test.combo.match.default.1', 'main group match default'),
      line(
        TEST_MAIN,
        'test.combo.match.explicit.1',
        'main group match explicit',
      ),
    ],
    expectedDebug: [
      debugLine(
        ['Test1'],
        TEST_MAIN,
        'test.combo.match.default.1',
        'main group match default',
      ),
      debugLine(
        ['Test2'],
        TEST_MAIN,
        'test.combo.match.explicit.1',
        'main group match explicit',
      ),
    ],
  },
  {
    name: 'Case 24 - default output when rules are not configured',
    config: {
      debug: false,
    },
    loggers: {
      A: { group: 'test.case.default', main: TEST_MAIN },
    },
    operations: [
      op('A', 'debug', 'message A_d'),
      op('A', 'info', 'message A_i'),
      op('A', 'success', 'message A_s'),
      op('A', 'warn', 'message A_w'),
      op('A', 'error', 'message A_e'),
    ],
    expected: [
      line(TEST_MAIN, 'test.case.default', 'message A_i'),
      line(TEST_MAIN, 'test.case.default', 'message A_s'),
      line(TEST_MAIN, 'test.case.default', 'message A_w'),
      line(TEST_MAIN, 'test.case.default', 'message A_e'),
    ],
  },
  {
    name: 'Case 25 - default debug output when rules are not configured',
    config: {
      debug: true,
    },
    loggers: {
      A: { group: 'test.case.default', main: TEST_MAIN },
    },
    operations: [
      op('A', 'debug', 'message A_d'),
      op('A', 'info', 'message A_i'),
      op('A', 'success', 'message A_s'),
      op('A', 'warn', 'message A_w'),
      op('A', 'error', 'message A_e'),
    ],
    expected: [
      line(TEST_MAIN, 'test.case.default', 'message A_d'),
      line(
        TEST_MAIN,
        'test.case.default',
        `message A_i ${LOGGER_SPEC_ELAPSED}`,
      ),
      line(
        TEST_MAIN,
        'test.case.default',
        `message A_s ${LOGGER_SPEC_ELAPSED}`,
      ),
      line(
        TEST_MAIN,
        'test.case.default',
        `message A_w ${LOGGER_SPEC_ELAPSED}`,
      ),
      line(
        TEST_MAIN,
        'test.case.default',
        `message A_e ${LOGGER_SPEC_ELAPSED}`,
      ),
    ],
  },
  {
    name: 'Case 26 - success participates in rule levels',
    config: {
      debug: false,
      levels: ['success'],
      rules: [
        { label: 'Test1', group: 'test.success.default' },
        { label: 'Test2', message: '*completed*', levels: ['success'] },
      ],
    },
    loggers: {
      A: { group: 'test.success.default', main: TEST_MAIN },
      B: { group: 'test.success.other', main: TEST_MAIN },
    },
    operations: [
      op('A', 'success', 'task done'),
      op('A', 'warn', 'task done'),
      op('B', 'success', 'job completed'),
      op('B', 'info', 'job completed'),
    ],
    expected: [
      line(TEST_MAIN, 'test.success.default', 'task done'),
      line(TEST_MAIN, 'test.success.other', 'job completed'),
    ],
    expectedDebug: [
      debugLine(['Test1'], TEST_MAIN, 'test.success.default', 'task done'),
      debugLine(['Test2'], TEST_MAIN, 'test.success.other', 'job completed'),
    ],
  },
  {
    name: 'Case 27 - picomatch question mark and character class',
    config: {
      debug: false,
      rules: [
        { label: 'Test1', group: 'test.case.?1', levels: ['warn'] },
        { label: 'Test2', message: 'task-[ab]', levels: ['error'] },
      ],
    },
    loggers: {
      A: { group: 'test.case.a1', main: TEST_MAIN },
      B: { group: 'test.case.ab1', main: TEST_MAIN },
    },
    operations: [
      op('A', 'warn', 'noop'),
      op('A', 'error', 'task-a'),
      op('A', 'error', 'task-c'),
      op('B', 'warn', 'noop'),
      op('B', 'error', 'task-b'),
    ],
    expected: [
      line(TEST_MAIN, 'test.case.a1', 'noop'),
      line(TEST_MAIN, 'test.case.a1', 'task-a'),
      line(TEST_MAIN, 'test.case.ab1', 'task-b'),
    ],
    expectedDebug: [
      debugLine(['Test1'], TEST_MAIN, 'test.case.a1', 'noop'),
      debugLine(['Test2'], TEST_MAIN, 'test.case.a1', 'task-a'),
      debugLine(['Test2'], TEST_MAIN, 'test.case.ab1', 'task-b'),
    ],
  },
  {
    name: 'Case 28 - empty resolved rules fall back to root levels',
    config: {
      debug: false,
      levels: ['warn', 'error'],
      rules: [],
    },
    loggers: {
      A: { group: 'test.case.off.empty', main: TEST_MAIN },
    },
    operations: [
      op('A', 'info', 'message A_i'),
      op('A', 'warn', 'message A_w'),
      op('A', 'error', 'message A_e'),
    ],
    expected: [
      line(TEST_MAIN, 'test.case.off.empty', 'message A_w'),
      line(TEST_MAIN, 'test.case.off.empty', 'message A_e'),
    ],
    expectedDebug: [
      debugLine([], TEST_MAIN, 'test.case.off.empty', 'message A_w'),
      debugLine([], TEST_MAIN, 'test.case.off.empty', 'message A_e'),
    ],
  },
  {
    name: 'Case 29 - active overlap remains after off deletion',
    config: {
      debug: false,
      levels: ['warn', 'error'],
      rules: [{ label: 'Test2', group: 'test.case.off.mix' }],
    },
    loggers: {
      A: { group: 'test.case.off.mix', main: TEST_MAIN },
    },
    operations: [
      op('A', 'info', 'message A_i'),
      op('A', 'warn', 'message A_w'),
      op('A', 'error', 'message A_e'),
    ],
    expected: [
      line(TEST_MAIN, 'test.case.off.mix', 'message A_w'),
      line(TEST_MAIN, 'test.case.off.mix', 'message A_e'),
    ],
    expectedDebug: [
      debugLine(['Test2'], TEST_MAIN, 'test.case.off.mix', 'message A_w'),
      debugLine(['Test2'], TEST_MAIN, 'test.case.off.mix', 'message A_e'),
    ],
  },
  {
    name: 'Case 30 - deleted exact rule does not block active glob rule',
    config: {
      debug: false,
      rules: [
        {
          label: 'Test2',
          group: 'test.case.off.*',
          levels: ['error'],
        },
      ],
    },
    loggers: {
      A: { group: 'test.case.off.exact', main: TEST_MAIN },
    },
    operations: [op('A', 'error', 'message A_e')],
    expected: [line(TEST_MAIN, 'test.case.off.exact', 'message A_e')],
    expectedDebug: [
      debugLine(['Test2'], TEST_MAIN, 'test.case.off.exact', 'message A_e'),
    ],
  },
  {
    name: 'Case 31 - empty resolved rules do not synthesize labels',
    config: {
      debug: false,
      levels: ['error'],
      rules: [],
    },
    loggers: {
      A: { group: 'test.off.full.1', main: TEST_MAIN },
    },
    operations: [op('A', 'error', 'request timeout')],
    expected: [line(TEST_MAIN, 'test.off.full.1', 'request timeout')],
    expectedDebug: [
      debugLine([], TEST_MAIN, 'test.off.full.1', 'request timeout'),
    ],
  },
];
