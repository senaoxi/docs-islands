import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { CheckerPackageResolver } from '../checkers';
import {
  runCheckerBuild as runCheckerBuildCommand,
  type RunCheckerBuildOptions,
  runCheckerTypecheck as runCheckerTypecheckCommand,
  type RunCheckerTypecheckOptions,
  type TypecheckTarget,
  type TypecheckTargetResult,
} from '../commands/typecheck';
import type { ResolvedLiminaConfig } from '../config';
import { TypecheckLogger } from '../logger';

async function writeText(filePath: string, text: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, text);
}

async function createFixture(files: Record<string, string>): Promise<{
  cleanup: () => Promise<void>;
  rootDir: string;
}> {
  const rootDir = await realpath(
    await mkdtemp(path.join(tmpdir(), 'limina-typecheck-')),
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

function tsconfig(value: unknown): string {
  return JSON.stringify(value);
}

const installedCheckerPackageResolver: CheckerPackageResolver = ({
  packageName,
}) => packageName;

function runCheckerBuild(options: RunCheckerBuildOptions) {
  return runCheckerBuildCommand({
    checkerPackageResolver: installedCheckerPackageResolver,
    ...options,
  });
}

function runCheckerTypecheck(options: RunCheckerTypecheckOptions) {
  return runCheckerTypecheckCommand({
    checkerPackageResolver: installedCheckerPackageResolver,
    ...options,
  });
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

function failingRunner(calls: TypecheckTarget[] = []) {
  return async (target: TypecheckTarget): Promise<TypecheckTargetResult> => {
    calls.push(target);

    return {
      configPath: target.configPath,
      status: 1,
    };
  };
}

function createLiminaConfig(rootDir: string): ResolvedLiminaConfig {
  return {
    config: {
      checkers: {
        svelte: {
          include: ['tsconfig.svelte.json'],
          preset: 'svelte-check',
        },
        typescript: {
          include: ['tsconfig.json'],
          preset: 'tsc',
        },
        vue: {
          include: ['tsconfig.vue.json'],
          preset: 'vue-tsc',
        },
      },
    },
    configPath: path.join(rootDir, 'limina.config.mjs'),
    rootDir,
  };
}

describe('runCheckerBuild', () => {
  it('runs only first-class build checker entries', async () => {
    const calls: TypecheckTarget[] = [];
    const fixture = await createFixture({
      'tsconfig.build.json': tsconfig({ files: [] }),
      'tsconfig.svelte.build.json': tsconfig({ files: [] }),
      'tsconfig.vue.build.json': tsconfig({ files: [] }),
    });

    try {
      const result = await runCheckerBuild({
        config: createLiminaConfig(fixture.rootDir),
        cwd: fixture.rootDir,
        runner: passingRunner(calls),
      });

      expect(result.passed).toBe(true);
      expect(calls.map((target) => target.command)).toEqual(['tsc', 'vue-tsc']);
      expect(calls.map((target) => target.args)).toEqual([
        [
          '-b',
          '.limina/tsconfig/checkers/typescript/tsconfig.build.json',
          '--pretty',
          'false',
        ],
        [
          '-b',
          '.limina/tsconfig/checkers/vue/tsconfig.build.json',
          '--pretty',
          'false',
        ],
      ]);
    } finally {
      await fixture.cleanup();
    }
  });

  it('runs tsgo checker entries with build mode', async () => {
    const calls: TypecheckTarget[] = [];
    const fixture = await createFixture({
      'tsconfig.build.json': tsconfig({ files: [] }),
    });

    try {
      const result = await runCheckerBuild({
        config: {
          config: {
            checkers: {
              nativeTypescript: {
                include: ['tsconfig.json'],
                preset: 'tsgo',
              },
            },
          },
          configPath: path.join(fixture.rootDir, 'limina.config.mjs'),
          rootDir: fixture.rootDir,
        },
        cwd: fixture.rootDir,
        runner: passingRunner(calls),
      });

      expect(result.passed).toBe(true);
      expect(calls.map((target) => target.command)).toEqual(['tsgo']);
      expect(calls.map((target) => target.args)).toEqual([
        [
          '-b',
          '.limina/tsconfig/checkers/nativeTypescript/tsconfig.build.json',
          '--pretty',
          'false',
        ],
      ]);
      expect(calls.map((target) => target.label)).toEqual([
        'tsgo -b .limina/tsconfig/checkers/nativeTypescript/tsconfig.build.json',
      ]);
    } finally {
      await fixture.cleanup();
    }
  });

  it('does not run vue-tsgo checker entries in build mode', async () => {
    const calls: TypecheckTarget[] = [];
    const fixture = await createFixture({
      'tsconfig.vue.build.json': tsconfig({ files: [] }),
    });

    try {
      const result = await runCheckerBuild({
        config: {
          config: {
            checkers: {
              vue: {
                include: ['tsconfig.vue.json'],
                preset: 'vue-tsgo',
              },
            },
          },
          configPath: path.join(fixture.rootDir, 'limina.config.mjs'),
          rootDir: fixture.rootDir,
        },
        cwd: fixture.rootDir,
        runner: passingRunner(calls),
      });

      expect(result.passed).toBe(true);
      expect(calls).toHaveLength(0);
    } finally {
      await fixture.cleanup();
    }
  });

  it('fails before running checker entries when a configured peer is missing', async () => {
    const calls: TypecheckTarget[] = [];
    const errorSpy = vi
      .spyOn(TypecheckLogger, 'error')
      .mockImplementation(() => {});
    const fixture = await createFixture({
      'tsconfig.build.json': tsconfig({ files: [] }),
      'tsconfig.vue.build.json': tsconfig({ files: [] }),
    });

    try {
      const result = await runCheckerBuild({
        checkerPackageResolver: ({ packageName }) =>
          packageName === 'typescript' || packageName === 'vue-tsc'
            ? packageName
            : undefined,
        config: {
          config: {
            checkers: {
              typescript: {
                include: ['tsconfig.json'],
                preset: 'tsc',
              },
              vue: {
                include: ['tsconfig.vue.json'],
                preset: 'vue-tsc',
              },
            },
          },
          configPath: path.join(fixture.rootDir, 'limina.config.mjs'),
          rootDir: fixture.rootDir,
        },
        cwd: fixture.rootDir,
        runner: passingRunner(calls),
      });

      expect(result.passed).toBe(false);
      expect(calls).toHaveLength(0);
      expect(errorSpy.mock.calls.join('\n')).toContain('@vue/compiler-sfc');
      expect(errorSpy.mock.calls.join('\n')).toContain(
        'Fix: pnpm add -D @vue/compiler-sfc',
      );
    } finally {
      errorSpy.mockRestore();
      await fixture.cleanup();
    }
  });

  it('requires the native preview package for tsgo entries', async () => {
    const calls: TypecheckTarget[] = [];
    const errorSpy = vi
      .spyOn(TypecheckLogger, 'error')
      .mockImplementation(() => {});
    const fixture = await createFixture({
      'tsconfig.build.json': tsconfig({ files: [] }),
    });

    try {
      const result = await runCheckerBuild({
        checkerPackageResolver: (): string | undefined => undefined,
        config: {
          config: {
            checkers: {
              nativeTypescript: {
                include: ['tsconfig.json'],
                preset: 'tsgo',
              },
            },
          },
          configPath: path.join(fixture.rootDir, 'limina.config.mjs'),
          rootDir: fixture.rootDir,
        },
        cwd: fixture.rootDir,
        runner: passingRunner(calls),
      });

      expect(result.passed).toBe(false);
      expect(calls).toHaveLength(0);
      expect(errorSpy.mock.calls.join('\n')).toContain(
        '@typescript/native-preview',
      );
      expect(errorSpy.mock.calls.join('\n')).toContain(
        'Fix: pnpm add -D @typescript/native-preview',
      );
    } finally {
      errorSpy.mockRestore();
      await fixture.cleanup();
    }
  });

  it('reports failed build checker entries', async () => {
    const calls: TypecheckTarget[] = [];
    const fixture = await createFixture({
      'tsconfig.build.json': tsconfig({ files: [] }),
      'tsconfig.svelte.build.json': tsconfig({ files: [] }),
      'tsconfig.vue.build.json': tsconfig({ files: [] }),
    });

    try {
      const result = await runCheckerBuild({
        config: createLiminaConfig(fixture.rootDir),
        cwd: fixture.rootDir,
        runner: failingRunner(calls),
      });

      expect(result.passed).toBe(false);
      expect(calls).toHaveLength(2);
    } finally {
      await fixture.cleanup();
    }
  });
});

describe('runCheckerTypecheck', () => {
  it('runs only second-class checker entries', async () => {
    const calls: TypecheckTarget[] = [];
    const fixture = await createFixture({
      'tsconfig.build.json': tsconfig({ files: [] }),
      'tsconfig.svelte.build.json': tsconfig({ files: [] }),
      'tsconfig.vue.build.json': tsconfig({ files: [] }),
    });

    try {
      const result = await runCheckerTypecheck({
        config: createLiminaConfig(fixture.rootDir),
        cwd: fixture.rootDir,
        runner: passingRunner(calls),
      });

      expect(result.passed).toBe(true);
      expect(calls.map((target) => target.command)).toEqual(['svelte-check']);
      expect(calls.map((target) => target.args)).toEqual([
        ['--tsconfig', '.limina/tsconfig/checkers/svelte/tsconfig.build.json'],
      ]);
    } finally {
      await fixture.cleanup();
    }
  });

  it('runs vue-tsgo checker entries with second-class project mode', async () => {
    const calls: TypecheckTarget[] = [];
    const fixture = await createFixture({
      'tsconfig.vue.build.json': tsconfig({ files: [] }),
    });

    try {
      const result = await runCheckerTypecheck({
        config: {
          config: {
            checkers: {
              vue: {
                include: ['tsconfig.vue.json'],
                preset: 'vue-tsgo',
              },
            },
          },
          configPath: path.join(fixture.rootDir, 'limina.config.mjs'),
          rootDir: fixture.rootDir,
        },
        cwd: fixture.rootDir,
        runner: passingRunner(calls),
      });

      expect(result.passed).toBe(true);
      expect(calls.map((target) => target.command)).toEqual(['vue-tsgo']);
      expect(calls.map((target) => target.args)).toEqual([
        ['--project', '.limina/tsconfig/checkers/vue/tsconfig.build.json'],
      ]);
      expect(calls.map((target) => target.label)).toEqual([
        'vue: vue-tsgo --project .limina/tsconfig/checkers/vue/tsconfig.build.json',
      ]);
    } finally {
      await fixture.cleanup();
    }
  });

  it('requires vue-tsgo and the native preview package for vue-tsgo second-class entries', async () => {
    const calls: TypecheckTarget[] = [];
    const errorSpy = vi
      .spyOn(TypecheckLogger, 'error')
      .mockImplementation(() => {});
    const fixture = await createFixture({
      'tsconfig.vue.build.json': tsconfig({ files: [] }),
    });

    try {
      const result = await runCheckerTypecheck({
        checkerPackageResolver: ({ packageName }) =>
          packageName === 'vue-tsgo' ? packageName : undefined,
        config: {
          config: {
            checkers: {
              vue: {
                include: ['tsconfig.vue.json'],
                preset: 'vue-tsgo',
              },
            },
          },
          configPath: path.join(fixture.rootDir, 'limina.config.mjs'),
          rootDir: fixture.rootDir,
        },
        cwd: fixture.rootDir,
        runner: passingRunner(calls),
      });

      expect(result.passed).toBe(false);
      expect(calls).toHaveLength(0);
      expect(errorSpy.mock.calls.join('\n')).toContain(
        '@typescript/native-preview',
      );
      expect(errorSpy.mock.calls.join('\n')).toContain(
        'Fix: pnpm add -D @typescript/native-preview',
      );
    } finally {
      errorSpy.mockRestore();
      await fixture.cleanup();
    }
  });

  it('clears stale vue-tsgo cache before using the second-class default runner', async () => {
    const fixture = await createFixture({
      'package.json': tsconfig({
        name: 'fixture',
        type: 'module',
      }),
      'tsconfig.vue.build.json': tsconfig({ files: [] }),
      'node_modules/.bin/vue-tsgo': [
        '#!/usr/bin/env sh',
        'exec node "$(dirname "$0")/vue-tsgo.js" "$@"',
        '',
      ].join('\n'),
      'node_modules/.bin/vue-tsgo.js': [
        "import { createHash } from 'node:crypto';",
        "import { existsSync, writeFileSync } from 'node:fs';",
        "import path from 'node:path';",
        'const configPath = path.resolve(process.cwd(), process.argv.at(-1));',
        "const hash = createHash('sha256').update(configPath).digest('hex').slice(0, 8);",
        "const stalePath = path.join(process.cwd(), 'node_modules/.cache/vue-tsgo', hash, 'stale.txt');",
        "writeFileSync(path.join(process.cwd(), 'stale-state.txt'), String(existsSync(stalePath)));",
        '',
      ].join('\n'),
    });

    try {
      await chmod(
        path.join(fixture.rootDir, 'node_modules/.bin/vue-tsgo'),
        0o755,
      );
      await writeText(
        path.join(
          fixture.rootDir,
          'node_modules/.cache/vue-tsgo',
          createHash('sha256')
            .update(path.join(fixture.rootDir, 'tsconfig.vue.build.json'))
            .digest('hex')
            .slice(0, 8),
          'stale.txt',
        ),
        'stale\n',
      );

      const result = await runCheckerTypecheck({
        config: {
          config: {
            checkers: {
              vue: {
                include: ['tsconfig.vue.json'],
                preset: 'vue-tsgo',
              },
            },
          },
          configPath: path.join(fixture.rootDir, 'limina.config.mjs'),
          rootDir: fixture.rootDir,
        },
        cwd: fixture.rootDir,
      });
      const staleState = await readFile(
        path.join(fixture.rootDir, 'stale-state.txt'),
        'utf8',
      );

      expect(result.passed).toBe(true);
      expect(staleState).toBe('false');
    } finally {
      await fixture.cleanup();
    }
  });

  it('skips graph preparation and build-only peer checks when no second-class checkers are configured', async () => {
    const calls: TypecheckTarget[] = [];
    const fixture = await createFixture({
      'tsconfig.build.json': tsconfig({ files: [] }),
      'tsconfig.vue.build.json': tsconfig({ files: [] }),
    });

    try {
      const result = await runCheckerTypecheck({
        config: {
          config: {
            checkers: {
              typescript: {
                include: ['tsconfig.json'],
                preset: 'tsc',
              },
              vue: {
                include: ['tsconfig.vue.json'],
                preset: 'vue-tsc',
              },
            },
          },
          configPath: path.join(fixture.rootDir, 'limina.config.mjs'),
          rootDir: fixture.rootDir,
        },
        checkerPackageResolver: (): string | undefined => undefined,
        cwd: fixture.rootDir,
        runner: passingRunner(calls),
      });

      expect(result.passed).toBe(true);
      expect(calls).toHaveLength(0);
      expect(existsSync(path.join(fixture.rootDir, '.limina'))).toBe(false);
    } finally {
      await fixture.cleanup();
    }
  });
});
