/**
 * @vitest-environment node
 */
import {
  resetScopedLoggerConfig,
  setScopedLoggerConfig as setLoggerConfigForScope,
} from 'logaria/core';
import type { LoggerConfig } from 'logaria/types';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createLoggerTreeShakingPlugin,
  LOGGER_TREE_SHAKING_PLUGIN_NAME,
  setVitePressLoggerTreeShakingEnabled,
  transformLoggerTreeShaking,
  VITEPRESS_LOGGER_TREE_SHAKING_MODULE_ID,
} from '../vite-plugin-logger-tree-shaking';

const TEST_LOGGER_SCOPE_ID = 'logger-tree-shaking-test-scope';
const TEST_MODULE_ID = '/workspace/docs/components/LoggerProbe.tsx';

const transformCode = async (
  code: string,
  config?: LoggerConfig,
): Promise<string> => {
  resetScopedLoggerConfig(TEST_LOGGER_SCOPE_ID);
  setLoggerConfigForScope(TEST_LOGGER_SCOPE_ID, config ?? {});

  const result = await transformLoggerTreeShaking(
    code,
    TEST_MODULE_ID,
    TEST_LOGGER_SCOPE_ID,
  );

  return result?.code ?? code;
};

afterEach(() => {
  resetScopedLoggerConfig(TEST_LOGGER_SCOPE_ID);
  setVitePressLoggerTreeShakingEnabled(TEST_LOGGER_SCOPE_ID, false);
});

describe('createLoggerTreeShakingPlugin', () => {
  it('only targets the VitePress scoped logger facade', () => {
    expect(VITEPRESS_LOGGER_TREE_SHAKING_MODULE_ID).toBe(
      '@docs-islands/vitepress/logger',
    );
  });

  it('does not create the production transform by default', () => {
    expect(createLoggerTreeShakingPlugin(TEST_LOGGER_SCOPE_ID)).toBe(false);
  });

  it('is a production build post plugin when enabled', () => {
    setVitePressLoggerTreeShakingEnabled(TEST_LOGGER_SCOPE_ID, true);

    const plugin = createLoggerTreeShakingPlugin(TEST_LOGGER_SCOPE_ID);

    expect(plugin).toMatchObject({
      apply: 'build',
      enforce: 'post',
      name: LOGGER_TREE_SHAKING_PLUGIN_NAME,
    });
  });

  it('skips modules without the public createLogger import', async () => {
    const source = `const message = 'hidden static info';`;

    await expect(
      transformLoggerTreeShaking(source, TEST_MODULE_ID, TEST_LOGGER_SCOPE_ID),
    ).resolves.toBeNull();
  });

  it('removes suppressed static literal logs and keeps visible logs', async () => {
    const code = await transformCode(
      `
import { createLogger } from '@docs-islands/vitepress/logger';

const logger = createLogger({ main: '@acme/docs' }).getLoggerByGroup('userland.metrics');

logger.info('hidden static info');
logger.warn('visible static warning');
      `,
      {
        levels: ['warn', 'error'],
      },
    );

    expect(code).not.toContain('hidden static info');
    expect(code).toContain("logger.warn('visible static warning')");
  });

  it.each(['logaria'])(
    'leaves generic logger imports for the generic logger plugin: %s',
    async (loggerModuleId) => {
      resetScopedLoggerConfig(TEST_LOGGER_SCOPE_ID);
      setLoggerConfigForScope(TEST_LOGGER_SCOPE_ID, {
        levels: ['warn', 'error'],
      });

      const code = `
import { createLogger } from '${loggerModuleId}';

const logger = createLogger({ main: '@docs-islands/core' }).getLoggerByGroup('runtime.render.strategy');

logger.info('generic hidden info stays for generic plugin ownership');
logger.warn('generic visible warning stays for generic plugin ownership');
      `;

      await expect(
        transformLoggerTreeShaking(code, TEST_MODULE_ID, TEST_LOGGER_SCOPE_ID),
      ).resolves.toBeNull();
    },
  );

  it('does not prune generic logger imports through the VitePress wrapper', async () => {
    const code = await transformCode(
      `
import { createLogger } from 'logaria';

const logger = createLogger({ main: '@docs-islands/core' }).getLoggerByGroup('runtime.render.strategy');

logger.info('generic hidden info');
logger.warn('generic visible warning');
      `,
      {
        levels: ['warn', 'error'],
      },
    );

    expect(code).toContain("logger.info('generic hidden info')");
    expect(code).toContain("logger.warn('generic visible warning')");
  });

  it('removes debug logs with the default production visibility', async () => {
    const code = await transformCode(
      `
import { createLogger } from '@docs-islands/vitepress/logger';

const logger = createLogger({ main: '@acme/docs' }).getLoggerByGroup('userland.metrics');

logger.debug('hidden debug details');
logger.info('visible default info');
    `,
      {
        levels: ['error', 'warn', 'info', 'success'],
      },
    );

    expect(code).not.toContain('hidden debug details');
    expect(code).toContain("logger.info('visible default info')");
  });

  it('honors rule mode with main group message and level matching', async () => {
    const code = await transformCode(
      `
import { createLogger } from '@docs-islands/vitepress/logger';

const logger = createLogger({ main: '@acme/docs' }).getLoggerByGroup('userland.metrics');

logger.info('visible exact metric');
logger.info('hidden different metric');
logger.warn('hidden warning metric');
      `,
      {
        rules: {
          'metrics-info': {
            group: 'userland.metrics',
            levels: ['info'],
            main: '@acme/docs',
            message: 'visible exact metric',
          },
        },
      },
    );

    expect(code).toContain("logger.info('visible exact metric')");
    expect(code).not.toContain('hidden different metric');
    expect(code).not.toContain('hidden warning metric');
  });

  it('keeps aliased createLogger imports unchanged', async () => {
    const code = await transformCode(
      `
import { createLogger as makeLogger } from '@docs-islands/vitepress/logger';

const logger = makeLogger({ main: '@acme/docs' }).getLoggerByGroup('userland.metrics');

logger.info('aliased static info');
      `,
      {
        levels: ['error'],
      },
    );

    expect(code).toContain('aliased static info');
  });

  it('keeps dynamic messages and non-statement calls unchanged', async () => {
    const code = await transformCode(
      `
import { createLogger } from '@docs-islands/vitepress/logger';

const logger = createLogger({ main: '@acme/docs' }).getLoggerByGroup('userland.metrics');
const message = 'runtime message';

logger.info(message);
logger.info(\`runtime \${message}\`);
logger.info('runtime ' + message);
const result = logger.info('literal non statement');
      `,
      {
        levels: ['error'],
      },
    );

    expect(code).toContain('logger.info(message)');
    expect(code).toContain('logger.info(`runtime ${message}`)');
    expect(code).toContain("logger.info('runtime ' + message)");
    expect(code).toContain(
      "const result = logger.info('literal non statement')",
    );
  });

  it('keeps logs when main or group cannot be resolved as literals', async () => {
    const code = await transformCode(
      `
import { createLogger } from '@docs-islands/vitepress/logger';

const main = '@acme/docs';
const group = 'userland.metrics';
const logger = createLogger({ main }).getLoggerByGroup(group);

logger.info('literal with dynamic logger binding');
      `,
      {
        levels: ['error'],
      },
    );

    expect(code).toContain('literal with dynamic logger binding');
  });
});
