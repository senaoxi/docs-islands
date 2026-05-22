import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  runCheckerBuild,
  runCheckerTypecheck,
  type TypecheckTarget,
  type TypecheckTargetResult,
} from '../commands/typecheck';
import type { ResolvedLatticeConfig } from '../config';
import { LatticeFlowReporter } from '../flow';
import { collectTypecheckTargetProjectPaths } from '../tsconfig';

async function writeText(filePath: string, text: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, text);
}

async function createFixture(files: Record<string, string>): Promise<{
  cleanup: () => Promise<void>;
  rootDir: string;
}> {
  const rootDir = await realpath(
    await mkdtemp(path.join(tmpdir(), 'lattice-typecheck-')),
  );

  for (const [relativePath, text] of Object.entries(files)) {
    await writeText(path.join(rootDir, relativePath), text);
  }

  return {
    cleanup: async () => {
      await rm(rootDir, {
        force: true,
        recursive: true,
      });
    },
    rootDir,
  };
}

function packageJson(): string {
  return JSON.stringify({
    name: '@example/pkg',
    type: 'module',
  });
}

function tsconfig(value: unknown): string {
  return JSON.stringify(value);
}

function passingRunner(calls: TypecheckTarget[] = []) {
  return async (target: TypecheckTarget): Promise<TypecheckTargetResult> => {
    calls.push(target);

    return {
      configPath: target.configPath,
      status: 0,
    };
  };
}

function createLatticeConfig(
  rootDir: string,
  entry = 'tsconfig.build.json',
): ResolvedLatticeConfig {
  return {
    config: {
      checkers: {
        typescript: {
          entry,
          preset: 'tsc',
        },
      },
    },
    configPath: path.join(rootDir, 'lattice.config.mjs'),
    rootDir,
  };
}

function createFlow(): {
  chunks: string[];
  flow: LatticeFlowReporter;
} {
  const chunks: string[] = [];

  return {
    chunks,
    flow: new LatticeFlowReporter({
      env: {
        CI: 'true',
      },
      forceTty: false,
      output: {
        write: (message) => {
          chunks.push(message);
        },
      },
      stdout: {
        isTTY: false,
      },
    }),
  };
}

describe('runCheckerTypecheck', () => {
  it('reports discovered targets and per-target status to the flow reporter', async () => {
    const fixture = await createFixture({
      'package.json': packageJson(),
      'tsconfig.build.json': tsconfig({
        files: [],
        references: [
          {
            path: './tsconfig.lib.dts.json',
          },
          {
            path: './tsconfig.tools.dts.json',
          },
        ],
      }),
      'tsconfig.lib.dts.json': tsconfig({}),
      'tsconfig.lib.json': tsconfig({
        include: ['src/**/*.ts'],
      }),
      'tsconfig.tools.dts.json': tsconfig({}),
      'tsconfig.tools.json': tsconfig({
        include: ['scripts/**/*.ts'],
      }),
    });
    const { chunks, flow } = createFlow();

    try {
      const result = await runCheckerTypecheck({
        clearScreen: false,
        config: createLatticeConfig(fixture.rootDir),
        cwd: fixture.rootDir,
        flow,
        runner: passingRunner(),
      });

      expect(result.passed).toBe(true);
      expect(
        chunks.some((chunk) =>
          chunk.includes('[info] found 2 typecheck target config(s)'),
        ),
      ).toBe(true);
      expect(
        chunks.some((chunk) => chunk.includes('[pass] tsc: tsconfig.lib.json')),
      ).toBe(true);
      expect(
        chunks.some((chunk) =>
          chunk.includes('[pass] tsc: tsconfig.tools.json'),
        ),
      ).toBe(true);
    } finally {
      await fixture.cleanup();
    }
  });

  it('runs a root tsconfig.dts.json leaf companion directly', async () => {
    const calls: TypecheckTarget[] = [];
    const fixture = await createFixture({
      'tsconfig.dts.json': tsconfig({}),
      'tsconfig.json': tsconfig({
        include: ['src/**/*.ts'],
      }),
    });

    try {
      const result = await runCheckerTypecheck({
        config: createLatticeConfig(fixture.rootDir, 'tsconfig.dts.json'),
        cwd: fixture.rootDir,
        runner: passingRunner(calls),
      });

      expect(result.passed).toBe(true);
      expect(result.targetProjectPaths).toEqual([
        path.join(fixture.rootDir, 'tsconfig.json'),
      ]);
      expect(calls).toHaveLength(1);
      expect(calls[0].args).toEqual(['-p', 'tsconfig.json', '--noEmit']);
    } finally {
      await fixture.cleanup();
    }
  });

  it('runs configured checker entries', async () => {
    const calls: TypecheckTarget[] = [];
    const fixture = await createFixture({
      'tsconfig.build.json': tsconfig({
        files: [],
        references: [
          {
            path: './tsconfig.lib.dts.json',
          },
        ],
      }),
      'tsconfig.lib.dts.json': tsconfig({}),
      'tsconfig.lib.json': tsconfig({
        include: ['src/**/*.ts'],
      }),
      'tsconfig.vue.build.json': tsconfig({
        files: [],
        references: [
          {
            path: './tsconfig.sfc.dts.json',
          },
        ],
      }),
      'tsconfig.sfc.dts.json': tsconfig({}),
      'tsconfig.sfc.json': tsconfig({
        include: ['docs/**/*.vue'],
      }),
    });

    try {
      const result = await runCheckerTypecheck({
        config: {
          config: {
            checkers: {
              typescript: {
                entry: 'tsconfig.build.json',
                preset: 'tsc',
              },
              vue: {
                entry: 'tsconfig.vue.build.json',
                preset: 'vue-tsc',
              },
            },
          },
          configPath: path.join(fixture.rootDir, 'lattice.config.mjs'),
          rootDir: fixture.rootDir,
        },
        cwd: fixture.rootDir,
        runner: passingRunner(calls),
      });

      expect(result.passed).toBe(true);
      expect(calls.map((target) => target.command)).toEqual(['tsc', 'vue-tsc']);
      expect(calls.map((target) => target.args)).toEqual([
        ['-p', 'tsconfig.lib.json', '--noEmit'],
        ['-p', 'tsconfig.sfc.json', '--noEmit'],
      ]);
    } finally {
      await fixture.cleanup();
    }
  });

  it('runs configured checker build entries', async () => {
    const calls: TypecheckTarget[] = [];
    const fixture = await createFixture({
      'tsconfig.build.json': tsconfig({
        files: [],
      }),
      'tsconfig.vue.build.json': tsconfig({
        files: [],
      }),
    });

    try {
      const result = await runCheckerBuild({
        config: {
          config: {
            checkers: {
              typescript: {
                entry: 'tsconfig.build.json',
                preset: 'tsc',
              },
              vue: {
                entry: 'tsconfig.vue.build.json',
                preset: 'vue-tsc',
              },
            },
          },
          configPath: path.join(fixture.rootDir, 'lattice.config.mjs'),
          rootDir: fixture.rootDir,
        },
        cwd: fixture.rootDir,
        runner: passingRunner(calls),
      });

      expect(result.passed).toBe(true);
      expect(calls.map((target) => target.command)).toEqual(['tsc', 'vue-tsc']);
      expect(calls.map((target) => target.args)).toEqual([
        ['-b', 'tsconfig.build.json', '--pretty', 'false'],
        ['-b', 'tsconfig.vue.build.json', '--pretty', 'false'],
      ]);
    } finally {
      await fixture.cleanup();
    }
  });

  it('resolves configured relative checker entry values from the command cwd', async () => {
    const calls: TypecheckTarget[] = [];
    const fixture = await createFixture({
      'configs/tsconfig.dts.json': tsconfig({}),
      'configs/tsconfig.json': tsconfig({
        include: ['../src/**/*.ts'],
      }),
    });

    try {
      const result = await runCheckerTypecheck({
        config: createLatticeConfig(
          fixture.rootDir,
          'configs/tsconfig.dts.json',
        ),
        cwd: fixture.rootDir,
        runner: passingRunner(calls),
      });

      expect(result.passed).toBe(true);
      expect(result.rootConfigPaths).toEqual([
        path.join(fixture.rootDir, 'configs/tsconfig.dts.json'),
      ]);
      expect(calls[0].args).toEqual([
        '-p',
        'configs/tsconfig.json',
        '--noEmit',
      ]);
    } finally {
      await fixture.cleanup();
    }
  });

  it('accepts absolute configured checker entry values', async () => {
    const fixture = await createFixture({
      'nested/tsconfig.custom.dts.json': tsconfig({}),
      'nested/tsconfig.custom.json': tsconfig({
        include: ['src/**/*.ts'],
      }),
    });
    const projectPath = path.join(
      fixture.rootDir,
      'nested/tsconfig.custom.dts.json',
    );

    try {
      const result = await runCheckerTypecheck({
        config: createLatticeConfig(fixture.rootDir, projectPath),
        cwd: fixture.rootDir,
        runner: passingRunner(),
      });

      expect(result.passed).toBe(true);
      expect(result.rootConfigPaths).toEqual([projectPath]);
    } finally {
      await fixture.cleanup();
    }
  });

  it('recurses through package aggregators to lib and tools leaves', async () => {
    const calls: TypecheckTarget[] = [];
    const fixture = await createFixture({
      'package.json': packageJson(),
      'tsconfig.build.json': tsconfig({
        files: [],
        references: [
          {
            path: './tsconfig.lib.dts.json',
          },
          {
            path: './tsconfig.tools.dts.json',
          },
        ],
      }),
      'tsconfig.lib.dts.json': tsconfig({}),
      'tsconfig.lib.json': tsconfig({
        include: ['src/**/*.ts'],
      }),
      'tsconfig.tools.dts.json': tsconfig({}),
      'tsconfig.tools.json': tsconfig({
        include: ['scripts/**/*.ts'],
      }),
    });

    try {
      const result = await runCheckerTypecheck({
        config: createLatticeConfig(fixture.rootDir),
        cwd: fixture.rootDir,
        runner: passingRunner(calls),
      });

      expect(result.passed).toBe(true);
      expect(calls.map((target) => path.basename(target.configPath))).toEqual([
        'tsconfig.lib.json',
        'tsconfig.tools.json',
      ]);
    } finally {
      await fixture.cleanup();
    }
  });

  it('recurses through nested graph aggregators', async () => {
    const fixture = await createFixture({
      'package.json': packageJson(),
      'tsconfig.build.json': tsconfig({
        files: [],
        references: [
          {
            path: './tsconfig.runtime.build.json',
          },
        ],
      }),
      'tsconfig.runtime.build.json': tsconfig({
        files: [],
        references: [
          {
            path: './src/tsconfig.dts.json',
          },
        ],
      }),
      'src/tsconfig.dts.json': tsconfig({}),
      'src/tsconfig.json': tsconfig({
        include: ['**/*.ts'],
      }),
    });

    try {
      const result = await runCheckerTypecheck({
        config: createLatticeConfig(fixture.rootDir),
        cwd: fixture.rootDir,
        runner: passingRunner(),
      });

      expect(result.targetProjectPaths).toEqual([
        path.join(fixture.rootDir, 'src/tsconfig.json'),
      ]);
    } finally {
      await fixture.cleanup();
    }
  });

  it('deduplicates repeated references across branches', async () => {
    const calls: TypecheckTarget[] = [];
    const fixture = await createFixture({
      'package.json': packageJson(),
      'tsconfig.build.json': tsconfig({
        files: [],
        references: [
          {
            path: './tsconfig.lib.dts.json',
          },
          {
            path: './tsconfig.group.build.json',
          },
        ],
      }),
      'tsconfig.group.build.json': tsconfig({
        files: [],
        references: [
          {
            path: './tsconfig.lib.dts.json',
          },
        ],
      }),
      'tsconfig.lib.dts.json': tsconfig({}),
      'tsconfig.lib.json': tsconfig({
        include: ['src/**/*.ts'],
      }),
    });

    try {
      const result = await runCheckerTypecheck({
        config: createLatticeConfig(fixture.rootDir),
        cwd: fixture.rootDir,
        runner: passingRunner(calls),
      });

      expect(result.passed).toBe(true);
      expect(calls.map((target) => target.configPath)).toEqual([
        path.join(fixture.rootDir, 'tsconfig.lib.json'),
      ]);
    } finally {
      await fixture.cleanup();
    }
  });

  it('fails when a declaration leaf companion is missing', async () => {
    const fixture = await createFixture({
      'tsconfig.build.json': tsconfig({
        files: [],
        references: [
          {
            path: './tsconfig.lib.dts.json',
          },
        ],
      }),
      'tsconfig.lib.dts.json': tsconfig({}),
    });

    try {
      const result = await runCheckerTypecheck({
        config: createLatticeConfig(fixture.rootDir),
        cwd: fixture.rootDir,
        runner: passingRunner(),
      });

      expect(result.passed).toBe(false);
      expect(result.results).toEqual([]);
    } finally {
      await fixture.cleanup();
    }
  });

  it('fails when a referenced tsconfig is missing', async () => {
    const fixture = await createFixture({
      'package.json': packageJson(),
      'tsconfig.build.json': tsconfig({
        files: [],
        references: [
          {
            path: './tsconfig.missing.dts.json',
          },
        ],
      }),
    });

    try {
      const result = await runCheckerTypecheck({
        config: createLatticeConfig(fixture.rootDir),
        cwd: fixture.rootDir,
        runner: passingRunner(),
      });

      expect(result.passed).toBe(false);
      expect(result.results).toEqual([]);
    } finally {
      await fixture.cleanup();
    }
  });

  it('fails when reference entries are malformed', async () => {
    const calls: TypecheckTarget[] = [];
    const fixture = await createFixture({
      'package.json': packageJson(),
      'tsconfig.build.json': tsconfig({
        files: [],
        references: [
          {
            path: './tsconfig.lib.dts.json',
          },
          {
            pat: './tsconfig.tools.dts.json',
          },
          {
            path: '',
          },
        ],
      }),
      'tsconfig.lib.dts.json': tsconfig({}),
      'tsconfig.lib.json': tsconfig({
        include: ['src/**/*.ts'],
      }),
    });

    try {
      const result = await runCheckerTypecheck({
        config: createLatticeConfig(fixture.rootDir),
        cwd: fixture.rootDir,
        runner: passingRunner(calls),
      });

      expect(result.passed).toBe(false);
      expect(result.results).toEqual([]);
      expect(calls).toHaveLength(0);
    } finally {
      await fixture.cleanup();
    }
  });

  it('collects all concurrent runner results before failing', async () => {
    const calls: string[] = [];
    const fixture = await createFixture({
      'package.json': packageJson(),
      'tsconfig.build.json': tsconfig({
        files: [],
        references: [
          {
            path: './tsconfig.a.dts.json',
          },
          {
            path: './tsconfig.b.dts.json',
          },
        ],
      }),
      'tsconfig.a.dts.json': tsconfig({}),
      'tsconfig.a.json': tsconfig({
        include: ['a/**/*.ts'],
      }),
      'tsconfig.b.dts.json': tsconfig({}),
      'tsconfig.b.json': tsconfig({
        include: ['b/**/*.ts'],
      }),
    });

    try {
      const result = await runCheckerTypecheck({
        config: createLatticeConfig(fixture.rootDir),
        concurrency: 2,
        cwd: fixture.rootDir,
        runner: async (target) => {
          calls.push(path.basename(target.configPath));

          return {
            configPath: target.configPath,
            status: target.configPath.endsWith('tsconfig.a.json') ? 1 : 0,
          };
        },
      });

      expect(result.passed).toBe(false);
      expect(result.results).toHaveLength(2);
      expect(calls.sort()).toEqual(['tsconfig.a.json', 'tsconfig.b.json']);
    } finally {
      await fixture.cleanup();
    }
  });
});

describe('collectTypecheckTargetProjectPaths', () => {
  it('reports the configs that form a typecheck reference cycle', async () => {
    const fixture = await createFixture({
      'tsconfig.json': tsconfig({
        files: [],
        references: [
          {
            path: './tsconfig.loop.json',
          },
        ],
      }),
      'tsconfig.loop.json': tsconfig({
        files: [],
        references: [
          {
            path: './tsconfig.json',
          },
        ],
      }),
    });

    try {
      const result = collectTypecheckTargetProjectPaths({
        rootConfigPath: path.join(fixture.rootDir, 'tsconfig.json'),
        rootDir: fixture.rootDir,
      });

      expect(result.targetProjectPaths).toEqual([]);
      expect(result.problems.join('\n')).toContain(
        'Circular reference in ordinary tsconfig references',
      );
      expect(result.problems.join('\n')).toContain(
        'tsconfig.json -> tsconfig.loop.json -> tsconfig.json',
      );
    } finally {
      await fixture.cleanup();
    }
  });

  it('fails on a cycle even when another branch has a typecheck target', async () => {
    const fixture = await createFixture({
      'tsconfig.json': tsconfig({
        files: [],
        references: [
          {
            path: './tsconfig.leaf.json',
          },
          {
            path: './tsconfig.group.json',
          },
        ],
      }),
      'tsconfig.group.json': tsconfig({
        files: [],
        references: [
          {
            path: './tsconfig.json',
          },
        ],
      }),
      'tsconfig.leaf.json': tsconfig({
        include: ['src/**/*.ts'],
      }),
    });

    try {
      const result = collectTypecheckTargetProjectPaths({
        rootConfigPath: path.join(fixture.rootDir, 'tsconfig.json'),
        rootDir: fixture.rootDir,
      });

      expect(result.targetProjectPaths).toEqual([
        path.join(fixture.rootDir, 'tsconfig.leaf.json'),
      ]);
      expect(result.problems.join('\n')).toContain(
        'tsconfig.json -> tsconfig.group.json -> tsconfig.json',
      );
    } finally {
      await fixture.cleanup();
    }
  });
});
