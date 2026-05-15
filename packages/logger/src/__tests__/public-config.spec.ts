/**
 * @vitest-environment node
 */
import { resolveLoggerConfig } from '@docs-islands/logger';
import { normalizeLoggerConfig } from '@docs-islands/logger/core/helper';
import type { LoggerPresetPlugin } from '@docs-islands/logger/types';
import { describe, expect, it } from 'vitest';

const testPreset = {
  configs: {
    all: {
      rules: {
        build: {
          levels: 'inherit',
        },
        hmr: {
          levels: 'inherit',
        },
        transform: {
          levels: 'inherit',
        },
      },
    },
    inheritLevels: {
      rules: {
        build: {
          levels: 'inherit',
        },
        transform: {
          levels: 'inherit',
        },
      },
    },
    recommended: {
      rules: {
        build: {
          levels: ['warn', 'error'],
        },
        transform: {
          levels: ['warn'],
        },
      },
    },
    strict: {
      rules: {
        transform: {
          levels: ['error'],
        },
      },
    },
  },
  rules: {
    build: {
      group: 'build.pipeline',
      main: '@docs-islands/test',
    },
    hmr: {
      group: 'hmr.update',
      main: '@docs-islands/test',
    },
    transform: {
      group: 'transform.*',
      main: '@docs-islands/test',
    },
  },
} satisfies LoggerPresetPlugin;

describe('public logger config', () => {
  it('exposes the public resolver for runtime logger config', () => {
    expect(
      resolveLoggerConfig({
        debug: true,
        levels: ['info', 'warn'],
      }),
    ).toEqual({
      debug: true,
      levels: ['info', 'warn'],
    });
  });

  it('normalizes rules maps into resolved rule arrays', () => {
    expect(
      normalizeLoggerConfig({
        debug: true,
        levels: ['warn', 'error'],
        plugins: {
          test: testPreset,
        },
        rules: {
          'custom:api-timeout': {
            group: 'api.*',
            levels: ['warn'],
            message: '*timeout*',
          },
          'test/build': {
            levels: 'inherit',
          },
          'test/hmr': {
            levels: ['error'],
            message: '*hot*',
          },
        },
      }),
    ).toEqual({
      debug: true,
      levels: ['warn', 'error'],
      rules: [
        {
          group: 'api.*',
          label: 'custom:api-timeout',
          levels: ['warn'],
          message: '*timeout*',
        },
        {
          group: 'build.pipeline',
          label: 'test/build',
          main: '@docs-islands/test',
        },
        {
          group: 'hmr.update',
          label: 'test/hmr',
          levels: ['error'],
          main: '@docs-islands/test',
          message: '*hot*',
        },
      ],
    });
  });

  it('treats off as deletion instead of a resolved disabled rule', () => {
    expect(
      normalizeLoggerConfig({
        plugins: {
          test: testPreset,
        },
        rules: {
          'custom:disabled': 'off',
          'test/build': 'off',
        },
      }),
    ).toEqual({
      levels: ['error', 'warn', 'info', 'success'],
    });
  });

  it('does not enable plugin rules by registration alone', () => {
    expect(
      normalizeLoggerConfig({
        plugins: {
          test: testPreset,
        },
      }),
    ).toEqual({
      levels: ['error', 'warn', 'info', 'success'],
    });
  });

  it('extends plugin configs and applies top-level rules last', () => {
    expect(
      normalizeLoggerConfig({
        debug: true,
        extends: ['test/all'],
        levels: ['warn', 'error'],
        plugins: {
          test: testPreset,
        },
        rules: {
          'test/transform': {
            levels: ['error'],
          },
          'test/hmr': 'off',
          'custom:api-timeout': {
            group: 'api.*',
            levels: ['warn'],
            message: '*timeout*',
          },
        },
      }),
    ).toEqual({
      debug: true,
      levels: ['warn', 'error'],
      rules: [
        {
          group: 'build.pipeline',
          label: 'test/build',
          main: '@docs-islands/test',
        },
        {
          group: 'transform.*',
          label: 'test/transform',
          levels: ['error'],
          main: '@docs-islands/test',
        },
        {
          group: 'api.*',
          label: 'custom:api-timeout',
          levels: ['warn'],
          message: '*timeout*',
        },
      ],
    });
  });

  it('supports ordered extends overrides', () => {
    expect(
      normalizeLoggerConfig({
        extends: ['test/inheritLevels', 'test/strict'],
        plugins: {
          test: testPreset,
        },
      }),
    ).toEqual({
      levels: ['error', 'warn', 'info', 'success'],
      rules: [
        {
          group: 'build.pipeline',
          label: 'test/build',
          main: '@docs-islands/test',
        },
        {
          group: 'transform.*',
          label: 'test/transform',
          levels: ['error'],
          main: '@docs-islands/test',
        },
      ],
    });
  });

  it('lets rule bodies override plugin template scope fields', () => {
    expect(
      normalizeLoggerConfig({
        plugins: {
          test: testPreset,
        },
        rules: {
          'test/build': {
            group: 'custom.group',
            levels: ['warn'],
            main: '@custom/build',
            message: '*custom*',
          },
        },
      }),
    ).toEqual({
      levels: ['error', 'warn', 'info', 'success'],
      rules: [
        {
          group: 'custom.group',
          label: 'test/build',
          levels: ['warn'],
          main: '@custom/build',
          message: '*custom*',
        },
      ],
    });
  });

  it('rejects removed and invalid public rule forms', () => {
    expect(() =>
      normalizeLoggerConfig({
        rules: [{ label: 'legacy-array' }],
      } as never),
    ).toThrow('logger.rules must be an object map, not an array.');

    expect(() =>
      normalizeLoggerConfig({
        rules: {
          'custom:false': false,
        },
      } as never),
    ).toThrow('logger.rules["custom:false"] must be "off" or a rule object.');

    expect(() =>
      normalizeLoggerConfig({
        rules: {
          'custom:true': true,
        },
      } as never),
    ).toThrow('logger.rules["custom:true"] must be "off" or a rule object.');

    expect(() =>
      normalizeLoggerConfig({
        rules: {
          'custom:empty': {},
        },
      } as never),
    ).toThrow(
      'logger.rules["custom:empty"] rule objects must declare "levels".',
    );

    expect(() =>
      normalizeLoggerConfig({
        rules: {
          'custom:enabled': {
            enabled: false,
            levels: ['warn'],
          },
        },
      } as never),
    ).toThrow(
      'logger.rules["custom:enabled"] rule objects only support "main", "group", "message", and "levels".',
    );
  });

  it('rejects unknown preset references', () => {
    expect(() =>
      normalizeLoggerConfig({
        rules: {
          'test/build': {
            levels: 'inherit',
          },
        },
      }),
    ).toThrow(
      'logger.rules key "test/build" references unknown logger plugin "test".',
    );

    expect(() =>
      normalizeLoggerConfig({
        plugins: {
          test: testPreset,
        },
        rules: {
          'test/missing': {
            levels: 'inherit',
          },
        },
      }),
    ).toThrow(
      'logger.rules key "test/missing" references unknown logger plugin rule "missing".',
    );
  });

  it('rejects invalid extends references and preset config shapes', () => {
    expect(() =>
      normalizeLoggerConfig({
        extends: 'test/recommended',
      } as never),
    ).toThrow(
      'logger.extends must be an array of "<plugin>/<config>" strings.',
    );

    expect(() =>
      normalizeLoggerConfig({
        extends: ['test'],
      }),
    ).toThrow(
      'logger.extends entry "test" must use "<plugin>/<config>" format.',
    );

    expect(() =>
      normalizeLoggerConfig({
        extends: ['missing/recommended'],
        plugins: {
          test: testPreset,
        },
      }),
    ).toThrow(
      'logger.extends entry "missing/recommended" references unknown logger plugin "missing".',
    );

    expect(() =>
      normalizeLoggerConfig({
        extends: ['test/missing'],
        plugins: {
          test: testPreset,
        },
      }),
    ).toThrow(
      'logger.extends entry "test/missing" references unknown logger plugin config "missing".',
    );

    expect(() =>
      normalizeLoggerConfig({
        extends: ['test/recommended'],
        plugins: {
          test: {
            configs: {
              recommended: [],
            },
            rules: {},
          },
        },
      } as never),
    ).toThrow(
      'logger.plugins["test"].configs["recommended"] must be a logger preset config object.',
    );

    expect(() =>
      normalizeLoggerConfig({
        extends: ['test/recommended'],
        plugins: {
          test: {
            configs: {
              recommended: {
                levels: ['warn'],
                rules: {},
              },
            },
            rules: {},
          },
        },
      } as never),
    ).toThrow(
      'logger.plugins["test"].configs["recommended"] only supports "rules".',
    );

    expect(() =>
      normalizeLoggerConfig({
        extends: ['test/recommended'],
        plugins: {
          test: {
            configs: {
              broken: [],
              recommended: {
                rules: {},
              },
            },
            rules: {},
          },
        },
      } as never),
    ).not.toThrow();
  });

  it('rejects invalid plugin rule templates and config rule keys', () => {
    expect(() =>
      normalizeLoggerConfig({
        plugins: {
          test: {
            rules: {
              build: {
                enabled: false,
                group: 'build.pipeline',
              },
            },
          },
        },
      } as never),
    ).toThrow(
      'logger.plugins["test"].rules["build"] only supports "main", "group", "message", and "levels".',
    );

    expect(() =>
      normalizeLoggerConfig({
        extends: ['test/recommended'],
        plugins: {
          test: {
            configs: {
              recommended: {
                rules: {
                  missing: {
                    levels: 'inherit',
                  },
                },
              },
            },
            rules: {
              build: {
                group: 'build.pipeline',
              },
            },
          },
        },
      }),
    ).toThrow(
      'logger.plugins["test"].configs["recommended"].rules key "missing" references unknown local plugin rule "missing".',
    );

    expect(() =>
      normalizeLoggerConfig({
        extends: ['test/recommended'],
        plugins: {
          test: {
            configs: {
              recommended: {
                rules: {
                  'test/build': {
                    levels: 'inherit',
                  },
                },
              },
            },
            rules: {
              build: {
                group: 'build.pipeline',
              },
            },
          },
        },
      }),
    ).toThrow(
      'logger.plugins["test"].configs["recommended"].rules key "test/build" must be a local plugin rule name without "/".',
    );

    expect(() =>
      normalizeLoggerConfig({
        extends: ['test/recommended'],
        plugins: {
          test: {
            configs: {
              recommended: {
                rules: {
                  build: {},
                },
              },
            },
            rules: {
              build: {
                group: 'build.pipeline',
              },
            },
          },
        },
      } as never),
    ).toThrow(
      'logger.plugins["test"].configs["recommended"].rules["test/build"] rule objects must declare "levels".',
    );
  });
});
