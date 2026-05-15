import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import {
  resetScopedLoggerConfig,
  setScopedLoggerConfig,
} from '../../core/config';
import { DEFAULT_LOGGER_SCOPE_ID } from '../../core/helper/scope';
import {
  DEFAULT_LOGGER_MODULE_ID,
  transformLoggerTreeShaking,
} from '../transform';
import { LOGGER_TREE_SHAKING_FIXTURE_BUILDS } from './fixtures/tree-shaking/builders';
import { LOGGER_TREE_SHAKING_RULES_EXPECTED } from './fixtures/tree-shaking/expected';

const TEST_SCOPE_ID = 'logger-plugin-test-scope';
const TEST_MODULE_ID = '/workspace/docs/components/LoggerProbe.tsx';

const assertMessages = (
  code: string,
  {
    kept = [],
    removed = [],
  }: {
    kept?: string[];
    removed?: string[];
  },
) => {
  for (const message of removed) {
    expect(code).not.toContain(message);
  }

  for (const message of kept) {
    expect(code).toContain(message);
  }
};

afterEach(() => {
  resetScopedLoggerConfig(DEFAULT_LOGGER_SCOPE_ID);
  resetScopedLoggerConfig(TEST_SCOPE_ID);
});

describe('logger plugin tree-shaking', () => {
  it.each(LOGGER_TREE_SHAKING_FIXTURE_BUILDS)(
    'builds the $fixture fixture with $bundler and tree-shakes expected logs',
    async ({ build, expectation }) => {
      const code = await build();

      assertMessages(code, expectation);
    },
  );

  it('tree-shakes direct transforms with extended plugin configs', async () => {
    setScopedLoggerConfig(TEST_SCOPE_ID, {
      extends: ['fixture/recommended'],
      levels: [],
      plugins: {
        fixture: {
          configs: {
            recommended: {
              rules: {
                apiError: {
                  levels: ['error'],
                },
                disabledSuccess: 'off',
                metricsWarn: {
                  levels: ['warn'],
                },
              },
            },
          },
          rules: {
            apiError: {
              group: 'tree_shaking.api',
            },
            disabledSuccess: {
              group: 'tree_shaking.metrics',
            },
            metricsWarn: {
              group: 'tree_shaking.metrics',
              main: '@docs-islands/logger-fixture',
              message: 'fixture rules visible *',
            },
          },
        },
      },
    });

    const code = await readFile(
      new URL('fixtures/tree-shaking-rules/entry.ts', import.meta.url),
      'utf8',
    );
    const result = await transformLoggerTreeShaking(code, TEST_MODULE_ID, {
      loggerModuleId: DEFAULT_LOGGER_MODULE_ID,
      loggerScopeId: TEST_SCOPE_ID,
    });

    expect(result).not.toBeNull();
    assertMessages(result?.code ?? '', LOGGER_TREE_SHAKING_RULES_EXPECTED);
  });

  it('requires an explicit logger module id for direct transforms', async () => {
    await expect(
      transformLoggerTreeShaking('const message = "noop";', TEST_MODULE_ID, {
        loggerScopeId: TEST_SCOPE_ID,
      } as Parameters<typeof transformLoggerTreeShaking>[2]),
    ).rejects.toThrow('logger tree-shaking requires explicit loggerModuleId.');

    await expect(
      transformLoggerTreeShaking('const message = "noop";', TEST_MODULE_ID, {
        loggerModuleId: '',
        loggerScopeId: TEST_SCOPE_ID,
      }),
    ).rejects.toThrow(
      'logger tree-shaking requires a non-empty loggerModuleId.',
    );

    await expect(
      transformLoggerTreeShaking('const message = "noop";', TEST_MODULE_ID, {
        loggerModuleId: DEFAULT_LOGGER_MODULE_ID,
        loggerScopeId: TEST_SCOPE_ID,
      }),
    ).resolves.toBeNull();
  });
});
