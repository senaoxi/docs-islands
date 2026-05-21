import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  runTscBuild,
  runTypecheck,
  type TypecheckTarget,
  type TypecheckTargetResult,
} from '../commands/typecheck';
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

describe('runTypecheck', () => {
  it('reports discovered targets and per-target status to the flow reporter', async () => {
    const fixture = await createFixture({
      'package.json': packageJson(),
      'tsconfig.json': tsconfig({
        files: [],
        references: [
          {
            path: './tsconfig.lib.json',
          },
          {
            path: './tsconfig.tools.json',
          },
        ],
      }),
      'tsconfig.lib.json': tsconfig({
        include: ['src/**/*.ts'],
      }),
      'tsconfig.tools.json': tsconfig({
        include: ['scripts/**/*.ts'],
      }),
    });
    const { chunks, flow } = createFlow();

    try {
      const result = await runTypecheck({
        clearScreen: false,
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

  it('runs a root tsconfig.json leaf directly', async () => {
    const calls: TypecheckTarget[] = [];
    const fixture = await createFixture({
      'tsconfig.json': tsconfig({
        include: ['src/**/*.ts'],
      }),
    });

    try {
      const result = await runTypecheck({
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

  it('runs configured checker typecheck routes and ignores inactive checkers', async () => {
    const calls: TypecheckTarget[] = [];
    const fixture = await createFixture({
      'tsconfig.json': tsconfig({
        include: ['src/**/*.ts'],
      }),
      'tsconfig.vue.json': tsconfig({
        include: ['docs/**/*.vue'],
      }),
    });

    try {
      const result = await runTypecheck({
        config: {
          config: {
            checkers: {
              inactive: {
                preset: 'svelte-check',
              },
              typescript: {
                preset: 'tsc',
                routes: {
                  typecheck: 'tsconfig.json',
                },
              },
              vue: {
                preset: 'vue-tsc',
                routes: {
                  typecheck: 'tsconfig.vue.json',
                },
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
        ['-p', 'tsconfig.json', '--noEmit'],
        ['-p', 'tsconfig.vue.json', '--noEmit'],
      ]);
    } finally {
      await fixture.cleanup();
    }
  });

  it('runs configured checker build routes', async () => {
    const calls: TypecheckTarget[] = [];
    const fixture = await createFixture({
      'tsconfig.graph.json': tsconfig({
        files: [],
      }),
      'tsconfig.vue.graph.json': tsconfig({
        files: [],
      }),
    });

    try {
      const result = await runTscBuild({
        config: {
          config: {
            checkers: {
              typescript: {
                preset: 'tsc',
                routes: {
                  build: 'tsconfig.graph.json',
                },
              },
              vue: {
                preset: 'vue-tsc',
                routes: {
                  build: 'tsconfig.vue.graph.json',
                },
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
        ['-b', 'tsconfig.graph.json', '--pretty', 'false'],
        ['-b', 'tsconfig.vue.graph.json', '--pretty', 'false'],
      ]);
    } finally {
      await fixture.cleanup();
    }
  });

  it('resolves relative -p values from the command cwd', async () => {
    const calls: TypecheckTarget[] = [];
    const fixture = await createFixture({
      'configs/tsconfig.json': tsconfig({
        include: ['../src/**/*.ts'],
      }),
    });

    try {
      const result = await runTypecheck({
        cwd: fixture.rootDir,
        project: 'configs',
        runner: passingRunner(calls),
      });

      expect(result.passed).toBe(true);
      expect(result.rootConfigPath).toBe(
        path.join(fixture.rootDir, 'configs/tsconfig.json'),
      );
      expect(calls[0].args).toEqual([
        '-p',
        'configs/tsconfig.json',
        '--noEmit',
      ]);
    } finally {
      await fixture.cleanup();
    }
  });

  it('accepts absolute -p values', async () => {
    const fixture = await createFixture({
      'nested/tsconfig.custom.json': tsconfig({
        include: ['src/**/*.ts'],
      }),
    });
    const projectPath = path.join(
      fixture.rootDir,
      'nested/tsconfig.custom.json',
    );

    try {
      const result = await runTypecheck({
        cwd: fixture.rootDir,
        project: projectPath,
        runner: passingRunner(),
      });

      expect(result.passed).toBe(true);
      expect(result.rootConfigPath).toBe(projectPath);
    } finally {
      await fixture.cleanup();
    }
  });

  it('recurses through package aggregators to lib and tools leaves', async () => {
    const calls: TypecheckTarget[] = [];
    const fixture = await createFixture({
      'package.json': packageJson(),
      'tsconfig.json': tsconfig({
        files: [],
        references: [
          {
            path: './tsconfig.lib.json',
          },
          {
            path: './tsconfig.tools.json',
          },
        ],
      }),
      'tsconfig.lib.json': tsconfig({
        include: ['src/**/*.ts'],
      }),
      'tsconfig.tools.json': tsconfig({
        include: ['scripts/**/*.ts'],
      }),
    });

    try {
      const result = await runTypecheck({
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

  it('runs configs that have references and their own include entries', async () => {
    const calls: TypecheckTarget[] = [];
    const fixture = await createFixture({
      'tsconfig.json': tsconfig({
        include: ['src/**/*.ts'],
        references: [
          {
            path: './tsconfig.lib.json',
          },
        ],
      }),
      'tsconfig.lib.json': tsconfig({
        include: ['lib/**/*.ts'],
      }),
    });

    try {
      const result = await runTypecheck({
        cwd: fixture.rootDir,
        runner: passingRunner(calls),
      });

      expect(result.passed).toBe(true);
      expect(calls.map((target) => path.basename(target.configPath))).toEqual([
        'tsconfig.json',
        'tsconfig.lib.json',
      ]);
    } finally {
      await fixture.cleanup();
    }
  });

  it('runs configs that have references and their own files entries', async () => {
    const calls: TypecheckTarget[] = [];
    const fixture = await createFixture({
      'tsconfig.json': tsconfig({
        files: ['src/index.ts'],
        references: [
          {
            path: './tsconfig.lib.json',
          },
        ],
      }),
      'tsconfig.lib.json': tsconfig({
        include: ['lib/**/*.ts'],
      }),
    });

    try {
      const result = await runTypecheck({
        cwd: fixture.rootDir,
        runner: passingRunner(calls),
      });

      expect(result.passed).toBe(true);
      expect(calls.map((target) => path.basename(target.configPath))).toEqual([
        'tsconfig.json',
        'tsconfig.lib.json',
      ]);
    } finally {
      await fixture.cleanup();
    }
  });

  it('runs configs that have references and implicit TypeScript includes', async () => {
    const calls: TypecheckTarget[] = [];
    const fixture = await createFixture({
      'tsconfig.json': tsconfig({
        references: [
          {
            path: './tsconfig.lib.json',
          },
        ],
      }),
      'tsconfig.lib.json': tsconfig({
        include: ['lib/**/*.ts'],
      }),
    });

    try {
      const result = await runTypecheck({
        cwd: fixture.rootDir,
        runner: passingRunner(calls),
      });

      expect(result.passed).toBe(true);
      expect(calls.map((target) => path.basename(target.configPath))).toEqual([
        'tsconfig.json',
        'tsconfig.lib.json',
      ]);
    } finally {
      await fixture.cleanup();
    }
  });

  it('recurses through nested ordinary tsconfig aggregators', async () => {
    const fixture = await createFixture({
      'package.json': packageJson(),
      'tsconfig.json': tsconfig({
        files: [],
        references: [
          {
            path: './tsconfig.runtime.json',
          },
        ],
      }),
      'tsconfig.runtime.json': tsconfig({
        files: [],
        references: [
          {
            path: './src/tsconfig.json',
          },
        ],
      }),
      'src/tsconfig.json': tsconfig({
        include: ['**/*.ts'],
      }),
    });

    try {
      const result = await runTypecheck({
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
      'tsconfig.json': tsconfig({
        files: [],
        references: [
          {
            path: './tsconfig.lib.json',
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
            path: './tsconfig.lib.json',
          },
        ],
      }),
      'tsconfig.lib.json': tsconfig({
        include: ['src/**/*.ts'],
      }),
    });

    try {
      const result = await runTypecheck({
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

  it('fails when the sibling tsconfig.json is missing', async () => {
    const fixture = await createFixture({});

    try {
      const result = await runTypecheck({
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
      'tsconfig.json': tsconfig({
        files: [],
        references: [
          {
            path: './tsconfig.missing.json',
          },
        ],
      }),
    });

    try {
      const result = await runTypecheck({
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
      'tsconfig.json': tsconfig({
        files: [],
        references: [
          {
            path: './tsconfig.lib.json',
          },
          {
            pat: './tsconfig.tools.json',
          },
          {
            path: '',
          },
        ],
      }),
      'tsconfig.lib.json': tsconfig({
        include: ['src/**/*.ts'],
      }),
    });

    try {
      const result = await runTypecheck({
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

  it('rejects build and graph configs in the typecheck route', async () => {
    const fixture = await createFixture({
      'package.json': packageJson(),
      'tsconfig.json': tsconfig({
        files: [],
        references: [
          {
            path: './tsconfig.lib.build.json',
          },
          {
            path: './tsconfig.graph.json',
          },
        ],
      }),
      'tsconfig.graph.json': tsconfig({
        files: [],
      }),
      'tsconfig.lib.build.json': tsconfig({
        include: ['src/**/*.ts'],
      }),
    });

    try {
      const result = await runTypecheck({
        cwd: fixture.rootDir,
        runner: passingRunner(),
      });

      expect(result.passed).toBe(false);
      expect(result.results).toEqual([]);
    } finally {
      await fixture.cleanup();
    }
  });

  it('collects all concurrent runner results before failing', async () => {
    const calls: string[] = [];
    const fixture = await createFixture({
      'package.json': packageJson(),
      'tsconfig.json': tsconfig({
        files: [],
        references: [
          {
            path: './tsconfig.a.json',
          },
          {
            path: './tsconfig.b.json',
          },
        ],
      }),
      'tsconfig.a.json': tsconfig({
        include: ['a/**/*.ts'],
      }),
      'tsconfig.b.json': tsconfig({
        include: ['b/**/*.ts'],
      }),
    });

    try {
      const result = await runTypecheck({
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
        'Circular reference in typecheck route',
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
