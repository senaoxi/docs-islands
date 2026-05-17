import { resolveLoggerConfig } from '@docs-islands/logger/core';
import type {
  LoggerPresetPlugin,
  NormalizedLoggerRule,
} from '@docs-islands/logger/types';
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

const expectRuntimeRule = (
  rule: NormalizedLoggerRule | undefined,
  expected: Pick<NormalizedLoggerRule, 'label' | 'levels' | 'main'>,
  options: {
    group?: [match: string, miss: string];
    message?: [match: string, miss: string];
  } = {},
): void => {
  expect(rule).toMatchObject(expected);

  if (options.group) {
    expect(rule?.groupMatcher).toBeTypeOf('function');
    expect(rule?.groupMatcher?.(options.group[0])).toBe(true);
    expect(rule?.groupMatcher?.(options.group[1])).toBe(false);
  } else {
    expect(rule).not.toHaveProperty('groupMatcher');
  }

  if (options.message) {
    expect(rule?.messageMatcher).toBeTypeOf('function');
    expect(rule?.messageMatcher?.(options.message[0])).toBe(true);
    expect(rule?.messageMatcher?.(options.message[1])).toBe(false);
  } else {
    expect(rule).not.toHaveProperty('messageMatcher');
  }
};

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

  it('normalizes rules maps into runtime rule arrays', () => {
    const resolved = resolveLoggerConfig({
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
    });

    expect(resolved).toMatchObject({
      debug: true,
      levels: ['warn', 'error'],
    });
    expect(resolved.rules).toHaveLength(3);
    expectRuntimeRule(
      resolved.rules?.[0],
      {
        label: 'custom:api-timeout',
        levels: ['warn'],
      },
      {
        group: ['api.users', 'build.pipeline'],
        message: ['request timeout', 'request completed'],
      },
    );
    expectRuntimeRule(
      resolved.rules?.[1],
      {
        label: 'test/build',
        main: '@docs-islands/test',
      },
      {
        group: ['build.pipeline', 'build.pipeline.child'],
      },
    );
    expectRuntimeRule(
      resolved.rules?.[2],
      {
        label: 'test/hmr',
        levels: ['error'],
        main: '@docs-islands/test',
      },
      {
        group: ['hmr.update', 'hmr.update.extra'],
        message: ['hot update', 'cold update'],
      },
    );
  });

  it('treats off as deletion instead of a resolved disabled rule', () => {
    expect(
      resolveLoggerConfig({
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
      resolveLoggerConfig({
        plugins: {
          test: testPreset,
        },
      }),
    ).toEqual({
      levels: ['error', 'warn', 'info', 'success'],
    });
  });

  it('extends plugin configs and applies top-level rules last', () => {
    const resolved = resolveLoggerConfig({
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
    });

    expect(resolved).toMatchObject({
      debug: true,
      levels: ['warn', 'error'],
    });
    expect(resolved.rules).toHaveLength(3);
    expectRuntimeRule(
      resolved.rules?.[0],
      {
        label: 'test/build',
        main: '@docs-islands/test',
      },
      {
        group: ['build.pipeline', 'build.pipeline.child'],
      },
    );
    expectRuntimeRule(
      resolved.rules?.[1],
      {
        label: 'test/transform',
        levels: ['error'],
        main: '@docs-islands/test',
      },
      {
        group: ['transform.react', 'hmr.update'],
      },
    );
    expectRuntimeRule(
      resolved.rules?.[2],
      {
        label: 'custom:api-timeout',
        levels: ['warn'],
      },
      {
        group: ['api.users', 'transform.react'],
        message: ['api timeout', 'api success'],
      },
    );
  });

  it('supports ordered extends overrides', () => {
    const resolved = resolveLoggerConfig({
      extends: ['test/inheritLevels', 'test/strict'],
      plugins: {
        test: testPreset,
      },
    });

    expect(resolved.levels).toEqual(['error', 'warn', 'info', 'success']);
    expect(resolved.rules).toHaveLength(2);
    expectRuntimeRule(
      resolved.rules?.[0],
      {
        label: 'test/build',
        main: '@docs-islands/test',
      },
      {
        group: ['build.pipeline', 'build.pipeline.child'],
      },
    );
    expectRuntimeRule(
      resolved.rules?.[1],
      {
        label: 'test/transform',
        levels: ['error'],
        main: '@docs-islands/test',
      },
      {
        group: ['transform.react', 'hmr.update'],
      },
    );
  });

  it('lets rule bodies override plugin template scope fields', () => {
    const resolved = resolveLoggerConfig({
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
    });

    expect(resolved.levels).toEqual(['error', 'warn', 'info', 'success']);
    expect(resolved.rules).toHaveLength(1);
    expectRuntimeRule(
      resolved.rules?.[0],
      {
        label: 'test/build',
        levels: ['warn'],
        main: '@custom/build',
      },
      {
        group: ['custom.group', 'build.pipeline'],
        message: ['custom build', 'default build'],
      },
    );
  });

  it('rejects removed and invalid public rule forms', () => {
    expect(() =>
      resolveLoggerConfig({
        rules: [{ label: 'legacy-array' }],
      } as never),
    ).toThrow('logger.rules must be an object map, not an array.');

    expect(() =>
      resolveLoggerConfig({
        rules: {
          'custom:false': false,
        },
      } as never),
    ).toThrow('logger.rules["custom:false"] must be "off" or a rule object.');

    expect(() =>
      resolveLoggerConfig({
        rules: {
          'custom:true': true,
        },
      } as never),
    ).toThrow('logger.rules["custom:true"] must be "off" or a rule object.');

    expect(() =>
      resolveLoggerConfig({
        rules: {
          'custom:empty': {},
        },
      } as never),
    ).toThrow(
      'logger.rules["custom:empty"] rule objects must declare "levels".',
    );

    expect(() =>
      resolveLoggerConfig({
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
      resolveLoggerConfig({
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
      resolveLoggerConfig({
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
      resolveLoggerConfig({
        extends: 'test/recommended',
      } as never),
    ).toThrow(
      'logger.extends must be an array of "<plugin>/<config>" strings.',
    );

    expect(() =>
      resolveLoggerConfig({
        extends: ['test'],
      } as never),
    ).toThrow(
      'logger.extends entry "test" must use "<plugin>/<config>" format.',
    );

    expect(() =>
      resolveLoggerConfig({
        extends: ['missing/recommended'],
        plugins: {
          test: testPreset,
        },
      } as never),
    ).toThrow(
      'logger.extends entry "missing/recommended" references unknown logger plugin "missing".',
    );

    expect(() =>
      resolveLoggerConfig({
        extends: ['test/missing'],
        plugins: {
          test: testPreset,
        },
      } as never),
    ).toThrow(
      'logger.extends entry "test/missing" references unknown logger plugin config "missing".',
    );

    expect(() =>
      resolveLoggerConfig({
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
      resolveLoggerConfig({
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
      resolveLoggerConfig({
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
      resolveLoggerConfig({
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
      resolveLoggerConfig({
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
      resolveLoggerConfig({
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
      resolveLoggerConfig({
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
