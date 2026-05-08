import { resetScopedLoggerConfig } from '@docs-islands/logger/core';
import { transformLoggerTreeShaking } from '@docs-islands/logger/plugin';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_LOGGER_SCOPE_ID } from '../../core/helper/scope';
import { DEFAULT_LOGGER_MODULE_ID } from '../transform';
import { LOGGER_TREE_SHAKING_FIXTURE_BUILDS } from './fixtures/tree-shaking/builders';

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
