import type { CheckerPackageResolver } from '#checkers';
import type { ResolvedLiminaConfig } from '#config/runner';
import { existsSync } from 'node:fs';
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import { availableParallelism, tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { LiminaCheckIssue } from '../check-reporting/snapshot';
import {
  runBuild as runBuildCommand,
  type RunBuildOptions,
  runCheckerBuild as runCheckerBuildCommand,
  type RunCheckerBuildOptions,
  runCheckerTypecheck as runCheckerTypecheckCommand,
  type RunCheckerTypecheckOptions,
} from '../commands/typecheck';
import { TypecheckLogger } from '../logger';
import { LiminaPreflightManager } from '../preflight';
import type {
  TypecheckRunner,
  TypecheckRunnerResult,
  TypecheckTarget,
} from '../typecheck/targets';
import { createFixturePathResolver, toPortablePath } from './helpers/path';

const requireFromTest = createRequire(import.meta.url);

async function writeText(filePath: string, text: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, text);
}

async function linkAstroCompiler(rootDir: string): Promise<void> {
  const compilerPackagePath = requireFromTest.resolve(
    '@astrojs/compiler/package.json',
  );
  const nodeModulesDir = path.join(rootDir, 'node_modules', '@astrojs');

  await mkdir(nodeModulesDir, { recursive: true });
  await symlink(
    path.dirname(compilerPackagePath),
    path.join(nodeModulesDir, 'compiler'),
    'junction',
  );
}

async function createFixture(files: Record<string, string>): Promise<{
  cleanup: () => Promise<void>;
  rootDir: string;
}> {
  const rootDir = await realpath(
    await mkdtemp(path.join(tmpdir(), 'limina-typecheck-')),
  );
  const fixtureFiles = {
    'package.json': `${JSON.stringify(
      {
        name: 'root',
        private: true,
      },
      null,
      2,
    )}\n`,
    'pnpm-workspace.yaml': 'packages:\n  - app\n  - packages/*\n',
    ...(Object.keys(files).some((filePath) => filePath.endsWith('.svelte'))
      ? {
          'node_modules/svelte/compiler.cjs': [
            "'use strict';",
            'exports.VERSION = "5.1.0";',
            'exports.preprocess = async (source) => ({ code: source });',
            'exports.parse = () => ({ instance: null, module: null });',
          ].join('\n'),
          'node_modules/svelte/package.json': JSON.stringify({
            exports: { './compiler': './compiler.cjs' },
            name: 'svelte',
            type: 'commonjs',
            version: '5.1.0',
          }),
        }
      : {}),
    ...files,
  };

  for (const [relativePath, text] of Object.entries(fixtureFiles)) {
    await writeText(path.join(rootDir, relativePath), text);
  }
  if (Object.keys(files).some((filePath) => filePath.endsWith('.astro'))) {
    await linkAstroCompiler(rootDir);
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

function runBuild(options: RunBuildOptions) {
  return runBuildCommand({
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
  return async (target: TypecheckTarget): Promise<TypecheckRunnerResult> => {
    calls.push(target);

    return {
      configPath: target.configPath,
      status: 0,
    };
  };
}

function failingRunner(calls: TypecheckTarget[] = []) {
  return async (target: TypecheckTarget): Promise<TypecheckRunnerResult> => {
    calls.push(target);

    return {
      configPath: target.configPath,
      status: 1,
    };
  };
}

function getExpectedDefaultBuildConcurrency(targetCount: number): number {
  return Math.min(targetCount, availableParallelism() ?? 4);
}

function delayedRunner(options: {
  calls: TypecheckTarget[];
  delayMs?: (target: TypecheckTarget) => number;
  status?: number;
}): {
  getMaxActive: () => number;
  runner: TypecheckRunner;
} {
  let activeCount = 0;
  let maxActiveCount = 0;

  return {
    getMaxActive: () => maxActiveCount,
    runner: async (target): Promise<TypecheckRunnerResult> => {
      options.calls.push(target);
      activeCount += 1;
      maxActiveCount = Math.max(maxActiveCount, activeCount);

      await new Promise((resolve) => {
        setTimeout(resolve, options.delayMs?.(target) ?? 10);
      });

      activeCount -= 1;

      return {
        configPath: target.configPath,
        status: options.status ?? 0,
      };
    },
  };
}

function createLiminaConfig(rootDir: string): ResolvedLiminaConfig {
  return {
    config: {
      checkers: {
        'svelte-check': {
          include: ['svelte/tsconfig.json'],
        },
        tsc: {
          include: ['tsconfig.json', 'svelte/tsconfig.json'],
        },
        'vue-tsc': {
          include: ['vue/tsconfig.json'],
        },
      },
    },
    configPath: path.join(rootDir, 'limina.config.mjs'),
    rootDir,
  };
}

describe('runCheckerBuild', () => {
  it('runs only build checker entries', async () => {
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
          '.limina/tsconfig/checkers/tsc/tsconfig.build.json',
          '--pretty',
          'false',
        ],
        [
          '-b',
          '.limina/tsconfig/checkers/vue-tsc/tsconfig.build.json',
          '--pretty',
          'false',
        ],
      ]);
    } finally {
      await fixture.cleanup();
    }
  });

  it('runs a managed tsc checker into Limina declarations when the source inherits declarationDir', async () => {
    const fixture = await createFixture({
      'packages/app/src/index.ts': 'export const value = 1;\n',
      'packages/app/legacy-types/existing.d.ts':
        'export declare const old: 1;\n',
      'packages/app/tsconfig.base.json': tsconfig({
        compilerOptions: { declarationDir: './legacy-types' },
      }),
      'packages/app/tsconfig.json': tsconfig({
        extends: './tsconfig.base.json',
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          target: 'ES2023',
          types: [],
        },
        include: ['src/**/*.ts'],
      }),
    });
    const config: ResolvedLiminaConfig = {
      config: {
        checkers: {
          tsc: {
            include: ['packages/app/tsconfig.json'],
          },
        },
      },
      configPath: path.join(fixture.rootDir, 'limina.config.mjs'),
      rootDir: fixture.rootDir,
    };

    try {
      await expect(
        runCheckerBuild({
          config,
          cwd: fixture.rootDir,
          report: { defer: true },
        }),
      ).resolves.toMatchObject({ passed: true });
      expect(
        existsSync(
          path.join(
            fixture.rootDir,
            '.limina/dts/checkers/tsc/packages/app/tsconfig/index.d.ts',
          ),
        ),
      ).toBe(true);
      expect(
        existsSync(
          path.join(fixture.rootDir, 'packages/app/legacy-types/existing.d.ts'),
        ),
      ).toBe(true);
      expect(
        existsSync(
          path.join(
            fixture.rootDir,
            'packages/app/legacy-types/src/index.d.ts',
          ),
        ),
      ).toBe(false);
    } finally {
      await fixture.cleanup();
    }
  });

  it('disables supplemental typecheck before peer preflight when no capability exists', async () => {
    const buildCalls: TypecheckTarget[] = [];
    const typecheckCalls: TypecheckTarget[] = [];
    const typecheckIssues: LiminaCheckIssue[] = [];
    const fixture = await createFixture({
      'src/index.ts': 'export const value = 1;\n',
      'svelte/src/index.ts': 'export const svelteValue = 1;\n',
      'svelte/tsconfig.json': tsconfig({
        include: ['src/**/*.ts'],
      }),
      'tsconfig.json': tsconfig({
        include: ['src/**/*.ts'],
      }),
      'tsconfig.build.json': tsconfig({ files: [] }),
      'tsconfig.svelte.build.json': tsconfig({ files: [] }),
    });
    const config: ResolvedLiminaConfig = {
      config: {
        checkers: {
          'svelte-check': {
            include: ['svelte/tsconfig.json'],
          },
          tsc: {
            include: ['tsconfig.json'],
          },
        },
      },
      configPath: path.join(fixture.rootDir, 'limina.config.mjs'),
      rootDir: fixture.rootDir,
    };
    const resolveOnlyTypeScript: CheckerPackageResolver = ({ packageName }) =>
      packageName === 'typescript' ? packageName : undefined;

    try {
      await expect(
        runCheckerBuildCommand({
          checkerPackageResolver: resolveOnlyTypeScript,
          config,
          cwd: fixture.rootDir,
          runner: passingRunner(buildCalls),
        }),
      ).resolves.toMatchObject({ passed: true });
      await expect(
        runCheckerBuildCommand({
          checkerPackageResolver: resolveOnlyTypeScript,
          config,
          configPath: 'tsconfig.json',
          cwd: fixture.rootDir,
          runner: passingRunner(buildCalls),
        }),
      ).resolves.toMatchObject({ passed: true });
      await expect(
        runCheckerTypecheckCommand({
          checkerPackageResolver: resolveOnlyTypeScript,
          config,
          cwd: fixture.rootDir,
          deferSnapshot: true,
          issues: typecheckIssues,
          report: { defer: true },
          runner: passingRunner(typecheckCalls),
        }),
      ).resolves.toMatchObject({
        disabled: true,
        passed: true,
      });

      expect(buildCalls.map((target) => target.command)).toEqual([
        'tsc',
        'tsc',
      ]);
      expect(typecheckCalls).toEqual([]);
      expect(typecheckIssues).toEqual([]);
    } finally {
      await fixture.cleanup();
    }
  });

  it('runs build checker entries with default concurrency', async () => {
    const calls: TypecheckTarget[] = [];
    const delayed = delayedRunner({
      calls,
      delayMs: (target) => (target.command === 'tsc' ? 30 : 10),
    });
    const fixture = await createFixture({
      'tsconfig.build.json': tsconfig({ files: [] }),
      'tsconfig.vue.build.json': tsconfig({ files: [] }),
    });

    try {
      const result = await runCheckerBuild({
        config: {
          config: {
            checkers: {
              tsc: {
                include: ['tsconfig.json'],
              },
              'vue-tsc': {
                include: ['vue/tsconfig.json'],
              },
            },
          },
          configPath: path.join(fixture.rootDir, 'limina.config.mjs'),
          rootDir: fixture.rootDir,
        },
        cwd: fixture.rootDir,
        runner: delayed.runner,
      });

      expect(result.passed).toBe(true);
      expect(calls.map((target) => target.command)).toEqual(['tsc', 'vue-tsc']);
      expect(delayed.getMaxActive()).toBe(
        getExpectedDefaultBuildConcurrency(2),
      );
    } finally {
      await fixture.cleanup();
    }
  });

  it('runs cyclic cross-checker provider entries in the same build layer', async () => {
    const calls: TypecheckTarget[] = [];
    const delayed = delayedRunner({
      calls,
      delayMs: () => 30,
    });
    const fixture = await createFixture({
      'packages/app/src/index.ts':
        "import { themeValue } from '../../theme/src/index';\nexport const appValue = themeValue;\n",
      'packages/app/tsconfig.json': tsconfig({
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          target: 'ES2023',
          types: [],
        },
        include: ['src/**/*.ts'],
      }),
      'packages/theme/src/index.ts':
        "import { appValue } from '../../app/src/index';\nexport const themeValue = appValue;\n",
      'packages/theme/tsconfig.json': tsconfig({
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          target: 'ES2023',
          types: [],
        },
        include: ['src/**/*.ts'],
      }),
    });

    try {
      const result = await runCheckerBuild({
        config: {
          config: {
            checkers: {
              tsc: {
                include: ['packages/app/tsconfig.json'],
              },
              tsgo: {
                include: ['packages/theme/tsconfig.json'],
              },
            },
          },
          configPath: path.join(fixture.rootDir, 'limina.config.mjs'),
          rootDir: fixture.rootDir,
        },
        cwd: fixture.rootDir,
        runner: delayed.runner,
      });

      expect(result.passed).toBe(true);
      expect(calls.map((target) => target.command).sort()).toEqual([
        'tsc',
        'tsgo',
      ]);
      expect(delayed.getMaxActive()).toBe(
        getExpectedDefaultBuildConcurrency(2),
      );
    } finally {
      await fixture.cleanup();
    }
  });

  it('rejects incompatible primary owners of the same source config before checker execution', async () => {
    const calls: TypecheckTarget[] = [];
    const fixture = await createFixture({
      'packages/native/tsconfig.json': tsconfig({
        files: [],
        references: [
          {
            path: '../shared/tsconfig.lib.json',
          },
        ],
      }),
      'packages/shared/src/index.ts': 'export const value = 1;\n',
      'packages/shared/tsconfig.lib.json': tsconfig({
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          target: 'ES2023',
          types: [],
        },
        include: ['src/**/*.ts'],
      }),
      'packages/vue/tsconfig.json': tsconfig({
        files: [],
        references: [
          {
            path: '../shared/tsconfig.lib.json',
          },
        ],
      }),
    });

    try {
      await expect(
        runCheckerBuild({
          config: {
            config: {
              checkers: {
                tsgo: {
                  include: ['packages/native/tsconfig.json'],
                },
                'vue-tsc': {
                  include: ['packages/vue/tsconfig.json'],
                },
              },
            },
            configPath: path.join(fixture.rootDir, 'limina.config.mjs'),
            rootDir: fixture.rootDir,
          },
          cwd: fixture.rootDir,
          runner: passingRunner(calls),
        }),
      ).rejects.toThrow(
        /Ambiguous inherited checker ownership[\s\S]*first checker: tsgo[\s\S]*conflicting checker: vue-tsc/u,
      );

      expect(calls).toEqual([]);
    } finally {
      await fixture.cleanup();
    }
  });

  it('allows compatible cross-checker traversal and warns before checker build', async () => {
    const calls: TypecheckTarget[] = [];
    const warnSpy = vi
      .spyOn(TypecheckLogger, 'warn')
      .mockImplementation(() => {});
    const fixture = await createFixture({
      'packages/shared/src/index.ts': 'export const sharedValue = 1;\n',
      'packages/shared/tsconfig.json': tsconfig({
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          target: 'ES2023',
          types: [],
        },
        include: ['src/**/*.ts'],
      }),
      'packages/theme/src/index.ts':
        "import { sharedValue } from '../../shared/src/index';\nexport const themeValue = sharedValue;\n",
      'packages/theme/tsconfig.json': tsconfig({
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          target: 'ES2023',
          types: [],
        },
        include: ['src/**/*.ts'],
      }),
    });

    try {
      const result = await runCheckerBuild({
        config: {
          config: {
            checkers: {
              tsgo: {
                include: ['packages/shared/tsconfig.json'],
              },
              'vue-tsc': {
                include: ['packages/theme/tsconfig.json'],
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
      expect(calls.map((target) => target.command)).toEqual([
        'tsgo',
        'vue-tsc',
      ]);
      expect(warnSpy.mock.calls.join('\n')).toContain(
        'Build checker cache cannot be reused',
      );
    } finally {
      warnSpy.mockRestore();
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
              tsgo: {
                include: ['tsconfig.json'],
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
          '.limina/tsconfig/checkers/tsgo/tsconfig.build.json',
          '--pretty',
          'false',
        ],
      ]);
      expect(calls.map((target) => target.label)).toEqual([
        'tsgo -b .limina/tsconfig/checkers/tsgo/tsconfig.build.json',
      ]);
    } finally {
      await fixture.cleanup();
    }
  });

  it('does not require the Vue SFC compiler for vue-tsc by default', async () => {
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
              tsc: {
                include: ['tsconfig.json'],
              },
              'vue-tsc': {
                include: ['vue/tsconfig.json'],
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
      expect(calls.map((target) => target.command)).toEqual(['tsc', 'vue-tsc']);
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
      await fixture.cleanup();
    }
  });

  it('requires the Vue SFC compiler when compiler-sfc import analysis is enabled', async () => {
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
              tsc: {
                include: ['tsconfig.json'],
              },
              'vue-tsc': {
                include: ['vue/tsconfig.json'],
              },
            },
            imports: {
              vue: 'compiler-sfc',
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
      expect(errorSpy.mock.calls.join('\n')).toContain('config.imports.vue');
      expect(errorSpy.mock.calls.join('\n')).toContain('"compiler-sfc"');
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
    const warnSpy = vi
      .spyOn(TypecheckLogger, 'warn')
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
              tsgo: {
                include: ['tsconfig.json'],
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
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
      warnSpy.mockRestore();
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

  it('reports concurrent build checker failures in target order', async () => {
    const calls: TypecheckTarget[] = [];
    const errorSpy = vi
      .spyOn(TypecheckLogger, 'error')
      .mockImplementation(() => {});
    const delayed = delayedRunner({
      calls,
      delayMs: (target) => (target.command === 'tsc' ? 30 : 10),
      status: 1,
    });
    const fixture = await createFixture({
      'tsconfig.build.json': tsconfig({ files: [] }),
      'tsconfig.vue.build.json': tsconfig({ files: [] }),
    });

    try {
      const result = await runCheckerBuild({
        config: {
          config: {
            checkers: {
              tsc: {
                include: ['tsconfig.json'],
              },
              'vue-tsc': {
                include: ['vue/tsconfig.json'],
              },
            },
          },
          configPath: path.join(fixture.rootDir, 'limina.config.mjs'),
          rootDir: fixture.rootDir,
        },
        cwd: fixture.rootDir,
        runner: delayed.runner,
      });
      const errorText = errorSpy.mock.calls
        .map(([message]) => String(message))
        .join('\n');
      const typescriptPath =
        '.limina/tsconfig/checkers/tsc/tsconfig.build.json';
      const vuePath = '.limina/tsconfig/checkers/vue-tsc/tsconfig.build.json';

      expect(result.passed).toBe(false);
      expect(calls.map((target) => target.command)).toEqual(['tsc', 'vue-tsc']);
      expect(delayed.getMaxActive()).toBe(
        getExpectedDefaultBuildConcurrency(2),
      );
      expect(errorText.indexOf(typescriptPath)).toBeGreaterThanOrEqual(0);
      expect(errorText.indexOf(typescriptPath)).toBeLessThan(
        errorText.indexOf(vuePath),
      );
    } finally {
      errorSpy.mockRestore();
      await fixture.cleanup();
    }
  });

  it('does not copy declaration inputs for internal checker builds', async () => {
    const calls: TypecheckTarget[] = [];
    const fixture = await createFixture({
      'packages/pkg/src/index.ts': 'export const value = 1;\n',
      'packages/pkg/src/vite-env.d.ts':
        '/// <reference types="vite/client" />\n',
      'packages/pkg/tsconfig.json': tsconfig({
        files: [],
        references: [
          {
            path: './tsconfig.lib.json',
          },
        ],
      }),
      'packages/pkg/tsconfig.lib.json': tsconfig({
        liminaOptions: {
          outputs: {
            outDir: './dist',
            rootDir: './src',
          },
        },
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          target: 'ES2023',
          types: [],
        },
        include: ['src/**/*'],
      }),
    });

    try {
      const result = await runCheckerBuild({
        config: {
          config: {
            checkers: {
              tsc: {
                include: ['packages/pkg/tsconfig.json'],
              },
            },
          },
          configPath: path.join(fixture.rootDir, 'limina.config.mjs'),
          rootDir: fixture.rootDir,
        },
        configPath: 'packages/pkg/tsconfig.lib.json',
        cwd: fixture.rootDir,
        runner: passingRunner(calls),
      });

      expect(result.passed).toBe(true);
      expect(
        existsSync(
          path.join(fixture.rootDir, 'packages/pkg/dist/vite-env.d.ts'),
        ),
      ).toBe(false);
      expect(calls.map((target) => target.args)).toEqual([
        [
          '-b',
          '.limina/tsconfig/checkers/tsc/projects/packages/pkg/tsconfig.lib.dts.json',
          '--pretty',
          'false',
        ],
      ]);
    } finally {
      await fixture.cleanup();
    }
  });

  it('uses the replanned provider generation for standalone checker build mutation authority', async () => {
    const calls: TypecheckTarget[] = [];
    const fixture = await createFixture({
      'packages/pkg/src/index.ts': 'export const value = 1;\n',
      'packages/pkg/src/vite-env.d.ts':
        '/// <reference types="vite/client" />\n',
      'packages/pkg/tsconfig.json': tsconfig({
        files: [],
        references: [{ path: './tsconfig.lib.json' }],
      }),
      'packages/pkg/tsconfig.lib.json': tsconfig({
        liminaOptions: {
          outputs: { outDir: './dist', rootDir: './src' },
        },
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          target: 'ES2023',
          types: [],
        },
        include: ['src/**/*.ts', 'src/**/*.d.ts'],
      }),
    });
    const fixturePath = createFixturePathResolver(fixture.rootDir);
    const config: ResolvedLiminaConfig = {
      config: {
        checkers: {
          tsc: {
            include: ['packages/pkg/tsconfig.json'],
          },
        },
      },
      configPath: fixturePath('limina.config.mjs'),
      rootDir: fixture.rootDir,
    };
    const sourceConfigPath = fixturePath(
      'packages',
      'pkg',
      'tsconfig.lib.json',
    );
    const managerA = new LiminaPreflightManager({ config });
    let managerB: LiminaPreflightManager | undefined;
    let materializationCompleted = false;
    const workspaceReads: {
      context: Awaited<ReturnType<typeof managerA.ensureWorkspaceValidated>>;
      materializationCompleted: boolean;
    }[] = [];

    try {
      const staleWorkspaceContext = await managerA.ensureWorkspaceValidated();
      const staleGraph = await managerA.ensureGeneratedGraph();

      await writeFile(
        sourceConfigPath,
        tsconfig({
          liminaOptions: {
            outputs: { outDir: './lib', rootDir: './src' },
          },
          compilerOptions: {
            module: 'ESNext',
            moduleResolution: 'bundler',
            strict: true,
            target: 'ES2023',
            types: [],
          },
          include: ['src/**/*.ts', 'src/**/*.d.ts'],
        }),
      );

      managerB = new LiminaPreflightManager({ config });
      await managerB.ensureGeneratedArtifactsMaterialized();

      const ensureWorkspaceValidated =
        managerA.ensureWorkspaceValidated.bind(managerA);
      const workspaceSpy = vi
        .spyOn(managerA, 'ensureWorkspaceValidated')
        .mockImplementation(async () => {
          const context = await ensureWorkspaceValidated();
          workspaceReads.push({ context, materializationCompleted });
          return context;
        });
      const ensureGeneratedArtifactsMaterialized =
        managerA.ensureGeneratedArtifactsMaterialized.bind(managerA);
      const materializationSpy = vi
        .spyOn(managerA, 'ensureGeneratedArtifactsMaterialized')
        .mockImplementation(async () => {
          const receipt = await ensureGeneratedArtifactsMaterialized();
          materializationCompleted = true;
          return receipt;
        });

      const result = await runCheckerBuild({
        config,
        configPath: 'packages/pkg/tsconfig.lib.json',
        cwd: fixture.rootDir,
        preflight: managerA,
        runner: passingRunner(calls),
      });
      const currentGraph = await managerA.ensureGeneratedGraph();
      const currentWorkspaceContext = workspaceReads.find(
        (read) => read.materializationCompleted,
      )?.context;
      expect(currentWorkspaceContext).toBeDefined();
      if (currentWorkspaceContext === undefined) {
        throw new Error(
          'Expected workspace validation after artifact materialization.',
        );
      }
      const outputCopy = currentGraph.outputDeclarationCopies
        .get('tsc')
        ?.get(sourceConfigPath)?.[0];
      const outputAuthority =
        currentWorkspaceContext.outputMutationAuthorities?.get(
          sourceConfigPath,
        );

      expect(result.passed).toBe(true);
      expect(calls).toHaveLength(1);
      expect(currentGraph).not.toBe(staleGraph);
      expect(currentWorkspaceContext).not.toBe(staleWorkspaceContext);
      expect(outputCopy?.outDir).toBe(fixturePath('packages', 'pkg', 'lib'));
      expect(outputAuthority?.outputRoot).toBe(
        fixturePath('packages', 'pkg', 'lib'),
      );
      expect(currentGraph.artifactPlan.generationToken).toBe(
        managerA.artifactNamespace.generationToken,
      );
      materializationSpy.mockRestore();
      workspaceSpy.mockRestore();
    } finally {
      managerB?.dispose();
      managerA.dispose();
      await fixture.cleanup();
    }
  });
});

describe('runBuild', () => {
  it('uses the replanned provider generation for managed build mutation authority', async () => {
    const calls: TypecheckTarget[] = [];
    const fixture = await createFixture({
      'packages/pkg/src/index.ts': 'export const value = 1;\n',
      'packages/pkg/src/vite-env.d.ts':
        '/// <reference types="vite/client" />\n',
      'packages/pkg/tsconfig.json': tsconfig({
        files: [],
        references: [{ path: './tsconfig.lib.json' }],
      }),
      'packages/pkg/tsconfig.lib.json': tsconfig({
        liminaOptions: {
          outputs: { outDir: './dist', rootDir: './src' },
        },
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          target: 'ES2023',
          types: [],
        },
        include: ['src/**/*.ts', 'src/**/*.d.ts'],
      }),
    });
    const fixturePath = createFixturePathResolver(fixture.rootDir);
    const config: ResolvedLiminaConfig = {
      config: {
        checkers: {
          tsc: {
            include: ['packages/pkg/tsconfig.json'],
          },
        },
      },
      configPath: fixturePath('limina.config.mjs'),
      rootDir: fixture.rootDir,
    };
    const sourceConfigPath = fixturePath(
      'packages',
      'pkg',
      'tsconfig.lib.json',
    );
    const managerA = new LiminaPreflightManager({ config });
    let managerB: LiminaPreflightManager | undefined;
    let materializationCompleted = false;
    const workspaceReads: {
      context: Awaited<ReturnType<typeof managerA.ensureWorkspaceValidated>>;
      materializationCompleted: boolean;
    }[] = [];

    try {
      const staleWorkspaceContext = await managerA.ensureWorkspaceValidated();
      const staleGraph = await managerA.ensureGeneratedGraph();

      await writeFile(
        sourceConfigPath,
        tsconfig({
          liminaOptions: {
            outputs: { outDir: './lib', rootDir: './src' },
          },
          compilerOptions: {
            module: 'ESNext',
            moduleResolution: 'bundler',
            strict: true,
            target: 'ES2023',
            types: [],
          },
          include: ['src/**/*.ts', 'src/**/*.d.ts'],
        }),
      );

      managerB = new LiminaPreflightManager({ config });
      await managerB.ensureGeneratedArtifactsMaterialized();

      const ensureWorkspaceValidated =
        managerA.ensureWorkspaceValidated.bind(managerA);
      const workspaceSpy = vi
        .spyOn(managerA, 'ensureWorkspaceValidated')
        .mockImplementation(async () => {
          const context = await ensureWorkspaceValidated();
          workspaceReads.push({ context, materializationCompleted });
          return context;
        });
      const ensureGeneratedArtifactsMaterialized =
        managerA.ensureGeneratedArtifactsMaterialized.bind(managerA);
      const materializationSpy = vi
        .spyOn(managerA, 'ensureGeneratedArtifactsMaterialized')
        .mockImplementation(async () => {
          const receipt = await ensureGeneratedArtifactsMaterialized();
          materializationCompleted = true;
          return receipt;
        });

      const result = await runBuild({
        config,
        configPath: 'packages/pkg/tsconfig.lib.json',
        cwd: fixture.rootDir,
        preflight: managerA,
        runner: passingRunner(calls),
      });
      const currentGraph = await managerA.ensureGeneratedGraph();
      const currentWorkspaceContext = workspaceReads.find(
        (read) => read.materializationCompleted,
      )?.context;
      expect(currentWorkspaceContext).toBeDefined();
      if (currentWorkspaceContext === undefined) {
        throw new Error(
          'Expected workspace validation after managed target materialization.',
        );
      }
      const outputAuthority =
        currentWorkspaceContext.outputMutationAuthorities?.get(
          sourceConfigPath,
        );

      expect(result.passed).toBe(true);
      expect(calls).toHaveLength(1);
      expect(currentGraph).not.toBe(staleGraph);
      expect(currentWorkspaceContext).not.toBe(staleWorkspaceContext);
      expect(outputAuthority?.outputRoot).toBe(
        fixturePath('packages', 'pkg', 'lib'),
      );
      expect(currentGraph.artifactPlan.generationToken).toBe(
        managerA.artifactNamespace.generationToken,
      );
      await expect(
        readFile(
          fixturePath('packages', 'pkg', 'lib', 'vite-env.d.ts'),
          'utf8',
        ),
      ).resolves.toBe('/// <reference types="vite/client" />\n');
      materializationSpy.mockRestore();
      workspaceSpy.mockRestore();
    } finally {
      managerB?.dispose();
      managerA.dispose();
      await fixture.cleanup();
    }
  });

  it('builds the nearest solution tsconfig from cwd', async () => {
    const calls: TypecheckTarget[] = [];
    const fixture = await createFixture({
      'packages/pkg/src/index.ts': 'export const value = 1;\n',
      'packages/pkg/tsconfig.json': tsconfig({
        files: [],
        references: [
          {
            path: './tsconfig.lib.json',
          },
        ],
      }),
      'packages/pkg/tsconfig.lib.json': tsconfig({
        liminaOptions: {
          outputs: {},
        },
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          target: 'ES2023',
          types: [],
        },
        include: ['src/**/*.ts'],
      }),
    });

    try {
      const result = await runBuild({
        config: {
          config: {
            checkers: {
              tsc: {
                include: ['packages/pkg/tsconfig.json'],
              },
            },
          },
          configPath: path.join(fixture.rootDir, 'limina.config.mjs'),
          rootDir: fixture.rootDir,
        },
        cwd: path.join(fixture.rootDir, 'packages/pkg/src'),
        runner: async (target) => {
          expect(existsSync(target.configPath)).toBe(true);
          calls.push(target);

          return {
            configPath: target.configPath,
            status: 0,
          };
        },
      });

      expect(result.passed).toBe(true);
      expect(toPortablePath(result.sourceConfigPath ?? '')).toBe(
        toPortablePath(
          path.join(fixture.rootDir, 'packages/pkg/tsconfig.json'),
        ),
      );
      expect(calls.map((target) => target.args)).toEqual([
        [
          '-b',
          '.limina/tsconfig/checkers/tsc/outputs/solutions/packages/pkg/tsconfig.output.json',
          '--pretty',
          'false',
        ],
      ]);
    } finally {
      await fixture.cleanup();
    }
  });

  it('builds a selected source leaf from an explicit config path', async () => {
    const calls: TypecheckTarget[] = [];
    const fixture = await createFixture({
      'packages/pkg/src/index.ts': 'export const value = 1;\n',
      'packages/pkg/tsconfig.json': tsconfig({
        files: [],
        references: [
          {
            path: './tsconfig.lib.json',
          },
        ],
      }),
      'packages/pkg/tsconfig.lib.json': tsconfig({
        liminaOptions: {
          outputs: {},
        },
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          target: 'ES2023',
          types: [],
        },
        include: ['src/**/*.ts'],
      }),
    });

    try {
      const result = await runBuild({
        config: {
          config: {
            checkers: {
              tsc: {
                include: ['packages/pkg/tsconfig.json'],
              },
            },
          },
          configPath: path.join(fixture.rootDir, 'limina.config.mjs'),
          rootDir: fixture.rootDir,
        },
        cwd: fixture.rootDir,
        configPath: 'packages/pkg/tsconfig.lib.json',
        runner: passingRunner(calls),
      });

      expect(result.passed).toBe(true);
      expect(calls.map((target) => target.args)).toEqual([
        [
          '-b',
          '.limina/tsconfig/checkers/tsc/outputs/projects/packages/pkg/tsconfig.lib.output.json',
          '--pretty',
          'false',
        ],
      ]);
    } finally {
      await fixture.cleanup();
    }
  });

  it('builds a pure framework dependency solution over its TypeScript provider closure', async () => {
    const calls: TypecheckTarget[] = [];
    const infoSpy = vi
      .spyOn(TypecheckLogger, 'info')
      .mockImplementation(() => {});
    const fixture = await createFixture({
      'packages/a/src/App.astro':
        '---\nimport "../../b/src/index.ts";\nexport const app = true;\n---\n',
      'packages/a/tsconfig.json': tsconfig({
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          target: 'ES2023',
          types: [],
        },
        include: ['src/**/*'],
      }),
      'packages/b/src/index.ts': 'export const dependency = 1;\n',
      'packages/b/tsconfig.json': tsconfig({
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          target: 'ES2023',
          types: [],
        },
        include: ['src/**/*.ts'],
      }),
    });

    try {
      const result = await runBuild({
        config: {
          config: {
            checkers: {
              tsc: {
                include: ['packages/**/tsconfig.json'],
              },
            },
          },
          configPath: path.join(fixture.rootDir, 'limina.config.mjs'),
          rootDir: fixture.rootDir,
        },
        configPath: 'packages/a/tsconfig.json',
        cwd: fixture.rootDir,
        runner: passingRunner(calls),
      });

      expect(result.passed).toBe(true);
      expect(calls.map(({ command }) => command)).toEqual(['tsc']);
      expect(calls.map(({ configPath }) => toPortablePath(configPath))).toEqual(
        [expect.stringContaining('/solutions/packages/a/tsconfig.build.json')],
      );
      const solutionConfig = JSON.parse(
        await readFile(calls[0]!.configPath, 'utf8'),
      ) as { files: string[]; references: { path: string }[] };
      expect(solutionConfig.files).toEqual([]);
      expect(solutionConfig.references).toEqual([]);
      expect(
        infoSpy.mock.calls.some(([message]) =>
          String(message).includes(
            'TypeScript dependency solution (framework application build is not included).',
          ),
        ),
      ).toBe(true);
    } finally {
      infoSpy.mockRestore();
      await fixture.cleanup();
    }
  });

  it('proves safe TS, JS, JSON, source-map, and declaration-map outputs inside outDir', async () => {
    const calls: TypecheckTarget[] = [];
    const fixture = await createFixture({
      'packages/pkg/src/data.json': '{"value":1}\n',
      'packages/pkg/src/helper.js': 'export const helper = 1;\n',
      'packages/pkg/src/index.ts': 'export const value = 1;\n',
      'packages/pkg/tsconfig.json': tsconfig({
        compilerOptions: {
          allowJs: true,
          declaration: true,
          declarationMap: true,
          module: 'ESNext',
          moduleResolution: 'bundler',
          resolveJsonModule: true,
          sourceMap: true,
          strict: true,
          target: 'ES2023',
          types: [],
        },
        files: ['src/index.ts', 'src/helper.js', 'src/data.json'],
        liminaOptions: {
          outputs: { outDir: './dist', rootDir: './src' },
        },
      }),
    });

    try {
      const result = await runBuild({
        config: {
          config: {
            checkers: {
              tsc: {
                include: ['packages/pkg/tsconfig.json'],
              },
            },
          },
          configPath: path.join(fixture.rootDir, 'limina.config.mjs'),
          rootDir: fixture.rootDir,
        },
        configPath: 'packages/pkg/tsconfig.json',
        cwd: fixture.rootDir,
        runner: passingRunner(calls),
      });

      expect(result.passed).toBe(true);
      expect(calls).toHaveLength(1);
    } finally {
      await fixture.cleanup();
    }
  });

  it('accepts bounded Vue emit proof for inputs inside configured rootDir', async () => {
    const calls: TypecheckTarget[] = [];
    const fixture = await createFixture({
      'packages/app/src/index.ts': 'export const value = 1;\n',
      'packages/app/src/view.vue': '<script setup lang="ts"></script>\n',
      'packages/app/tsconfig.json': tsconfig({
        compilerOptions: {
          declaration: true,
          declarationMap: true,
          module: 'ESNext',
          moduleResolution: 'bundler',
          sourceMap: true,
          strict: true,
          target: 'ES2023',
          types: [],
        },
        include: ['src/**/*'],
        liminaOptions: {
          outputs: { outDir: './dist', rootDir: './src' },
        },
      }),
    });

    try {
      const result = await runBuild({
        config: {
          config: {
            checkers: {
              'vue-tsc': {
                include: ['packages/app/tsconfig.json'],
              },
            },
          },
          configPath: path.join(fixture.rootDir, 'limina.config.mjs'),
          rootDir: fixture.rootDir,
        },
        configPath: 'packages/app/tsconfig.json',
        cwd: fixture.rootDir,
        runner: passingRunner(calls),
      });

      expect(result.passed).toBe(true);
      expect(calls.map((target) => target.command)).toEqual(['vue-tsc']);
    } finally {
      await fixture.cleanup();
    }
  });

  it('rejects a rootDir-external Vue input before managed runner invocation', async () => {
    const calls: TypecheckTarget[] = [];
    const fixture = await createFixture({
      'packages/app/outside.vue': '<script setup lang="ts"></script>\n',
      'packages/app/src/index.ts': 'export const value = 1;\n',
      'packages/app/tsconfig.json': tsconfig({
        compilerOptions: {
          declaration: true,
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          target: 'ES2023',
          types: [],
        },
        files: ['src/index.ts', 'outside.vue'],
        liminaOptions: {
          outputs: { outDir: './dist', rootDir: './src' },
        },
      }),
    });

    try {
      await expect(
        runBuild({
          config: {
            config: {
              checkers: {
                'vue-tsc': {
                  include: ['packages/app/tsconfig.json'],
                },
              },
            },
            configPath: path.join(fixture.rootDir, 'limina.config.mjs'),
            rootDir: fixture.rootDir,
          },
          configPath: 'packages/app/tsconfig.json',
          cwd: fixture.rootDir,
          runner: passingRunner(calls),
        }),
      ).rejects.toThrow('cannot be proven inside the configured emit root');
      expect(calls).toHaveLength(0);
    } finally {
      await fixture.cleanup();
    }
  });

  it('copies local declaration inputs after managed output build', async () => {
    const calls: TypecheckTarget[] = [];
    const fixture = await createFixture({
      'packages/pkg/src/index.ts': 'export const value = 1;\n',
      'packages/pkg/src/vite-env.d.ts':
        '/// <reference types="vite/client" />\n',
      'packages/pkg/tsconfig.json': tsconfig({
        files: [],
        references: [
          {
            path: './tsconfig.lib.json',
          },
        ],
      }),
      'packages/pkg/tsconfig.lib.json': tsconfig({
        liminaOptions: {
          outputs: {
            outDir: './dist',
            rootDir: './src',
          },
        },
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          target: 'ES2023',
          types: [],
        },
        include: ['src/**/*.ts', 'src/**/*.d.ts'],
      }),
    });

    try {
      const result = await runBuild({
        config: {
          config: {
            checkers: {
              tsc: {
                include: ['packages/pkg/tsconfig.json'],
              },
            },
          },
          configPath: path.join(fixture.rootDir, 'limina.config.mjs'),
          rootDir: fixture.rootDir,
        },
        configPath: 'packages/pkg/tsconfig.lib.json',
        cwd: fixture.rootDir,
        runner: passingRunner(calls),
      });

      expect(result.passed).toBe(true);
      await expect(
        readFile(
          path.join(fixture.rootDir, 'packages/pkg/dist/vite-env.d.ts'),
          'utf8',
        ),
      ).resolves.toBe('/// <reference types="vite/client" />\n');
    } finally {
      await fixture.cleanup();
    }
  });

  it('copies .d.mts and .d.cts declaration inputs after managed output build', async () => {
    const calls: TypecheckTarget[] = [];
    const fixture = await createFixture({
      'packages/pkg/src/index.ts': 'export const value = 1;\n',
      'packages/pkg/src/runtime.d.mts': 'declare const esmValue: 1;\n',
      'packages/pkg/src/runtime.d.cts': 'declare const cjsValue: 1;\n',
      'packages/pkg/tsconfig.json': tsconfig({
        files: [],
        references: [
          {
            path: './tsconfig.lib.json',
          },
        ],
      }),
      'packages/pkg/tsconfig.lib.json': tsconfig({
        liminaOptions: {
          outputs: {
            outDir: './dist',
            rootDir: './src',
          },
        },
        compilerOptions: {
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          strict: true,
          target: 'ES2023',
          types: [],
        },
        include: ['src/**/*'],
      }),
    });

    try {
      const result = await runBuild({
        config: {
          config: {
            checkers: {
              tsc: {
                include: ['packages/pkg/tsconfig.json'],
              },
            },
          },
          configPath: path.join(fixture.rootDir, 'limina.config.mjs'),
          rootDir: fixture.rootDir,
        },
        configPath: 'packages/pkg/tsconfig.lib.json',
        cwd: fixture.rootDir,
        runner: passingRunner(calls),
      });

      expect(result.passed).toBe(true);
      await expect(
        readFile(
          path.join(fixture.rootDir, 'packages/pkg/dist/runtime.d.mts'),
          'utf8',
        ),
      ).resolves.toBe('declare const esmValue: 1;\n');
      await expect(
        readFile(
          path.join(fixture.rootDir, 'packages/pkg/dist/runtime.d.cts'),
          'utf8',
        ),
      ).resolves.toBe('declare const cjsValue: 1;\n');
    } finally {
      await fixture.cleanup();
    }
  });

  it('creates a validated missing external outDir for declaration copies', async () => {
    const calls: TypecheckTarget[] = [];
    const fixture = await createFixture({
      'repo/package.json': tsconfig({ name: 'repo', private: true }),
      'repo/packages/a/package.json': tsconfig({
        name: '@fixture/a',
        private: true,
      }),
      'repo/packages/a/src/env.d.ts': 'declare const externalEnv: 1;\n',
      'repo/packages/a/src/index.ts': 'export const value = 1;\n',
      'repo/packages/a/tsconfig.json': tsconfig({
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          target: 'ES2023',
          types: [],
        },
        include: ['src/**/*'],
        liminaOptions: {
          outputs: {
            outDir: '../../../artifacts/a',
            rootDir: './src',
          },
        },
      }),
      'repo/pnpm-workspace.yaml': 'packages:\n  - packages/*\n',
    });
    const repoRoot = path.join(fixture.rootDir, 'repo');

    try {
      const result = await runBuild({
        config: {
          config: {
            checkers: {
              tsc: {
                include: ['packages/a/tsconfig.json'],
              },
            },
          },
          configPath: path.join(repoRoot, 'limina.config.mjs'),
          rootDir: repoRoot,
        },
        configPath: 'packages/a/tsconfig.json',
        cwd: repoRoot,
        runner: passingRunner(calls),
      });

      expect(result.passed).toBe(true);
      expect(calls).toHaveLength(1);
      await expect(
        readFile(path.join(fixture.rootDir, 'artifacts/a/env.d.ts'), 'utf8'),
      ).resolves.toBe('declare const externalEnv: 1;\n');
    } finally {
      await fixture.cleanup();
    }
  });

  it('surfaces warnings for outside-root local declaration inputs', async () => {
    const calls: TypecheckTarget[] = [];
    const warnSpy = vi
      .spyOn(TypecheckLogger, 'warn')
      .mockImplementation(() => {});
    const fixture = await createFixture({
      'packages/pkg/src/index.ts': 'export const value = 1;\n',
      'packages/pkg/types/client.d.ts': 'declare const clientValue: 1;\n',
      'packages/pkg/tsconfig.json': tsconfig({
        files: [],
        references: [
          {
            path: './tsconfig.lib.json',
          },
        ],
      }),
      'packages/pkg/tsconfig.lib.json': tsconfig({
        files: ['src/index.ts', 'types/client.d.ts'],
        liminaOptions: {
          outputs: {
            outDir: './dist',
            rootDir: './src',
          },
        },
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          target: 'ES2023',
          types: [],
        },
      }),
    });

    try {
      const result = await runBuild({
        config: {
          config: {
            checkers: {
              tsc: {
                include: ['packages/pkg/tsconfig.json'],
              },
            },
          },
          configPath: path.join(fixture.rootDir, 'limina.config.mjs'),
          rootDir: fixture.rootDir,
        },
        configPath: 'packages/pkg/tsconfig.lib.json',
        cwd: fixture.rootDir,
        runner: passingRunner(calls),
      });

      expect(result.passed).toBe(true);
      expect(warnSpy.mock.calls.join('\n')).toContain(
        'Output declaration inputs outside rootDir were not copied',
      );
      expect(warnSpy.mock.calls.join('\n')).toContain(
        'packages/pkg/types/client.d.ts',
      );
    } finally {
      warnSpy.mockRestore();
      await fixture.cleanup();
    }
  });

  it('does not copy rootDir-external or node_modules declaration inputs', async () => {
    const calls: TypecheckTarget[] = [];
    const warnSpy = vi
      .spyOn(TypecheckLogger, 'warn')
      .mockImplementation(() => {});
    const fixture = await createFixture({
      'packages/pkg/src/index.ts': 'export const value = 1;\n',
      'packages/pkg/types/client.d.ts': 'declare const clientValue: 1;\n',
      'packages/pkg/node_modules/pkg/client.d.ts':
        'declare const dependencyValue: 1;\n',
      'packages/pkg/tsconfig.json': tsconfig({
        files: [],
        references: [
          {
            path: './tsconfig.lib.json',
          },
        ],
      }),
      'packages/pkg/tsconfig.lib.json': tsconfig({
        files: [
          'src/index.ts',
          'types/client.d.ts',
          'node_modules/pkg/client.d.ts',
        ],
        liminaOptions: {
          outputs: {
            outDir: './dist',
            rootDir: './src',
          },
        },
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          target: 'ES2023',
          types: [],
        },
      }),
    });

    try {
      const result = await runBuild({
        config: {
          config: {
            checkers: {
              tsc: {
                include: ['packages/pkg/tsconfig.json'],
              },
            },
          },
          configPath: path.join(fixture.rootDir, 'limina.config.mjs'),
          rootDir: fixture.rootDir,
        },
        configPath: 'packages/pkg/tsconfig.lib.json',
        cwd: fixture.rootDir,
        runner: passingRunner(calls),
      });

      expect(result.passed).toBe(true);
      expect(
        existsSync(path.join(fixture.rootDir, 'packages/pkg/dist/client.d.ts')),
      ).toBe(false);
      expect(warnSpy.mock.calls.join('\n')).toContain(
        'packages/pkg/types/client.d.ts',
      );
      expect(warnSpy.mock.calls.join('\n')).not.toContain(
        'node_modules/pkg/client.d.ts',
      );
    } finally {
      warnSpy.mockRestore();
      await fixture.cleanup();
    }
  });

  it('fails managed output build when declaration copy conflicts with existing output', async () => {
    const calls: TypecheckTarget[] = [];
    const errorSpy = vi
      .spyOn(TypecheckLogger, 'error')
      .mockImplementation(() => {});
    const fixture = await createFixture({
      'packages/pkg/src/foo.ts': 'export const value = 1;\n',
      'packages/pkg/src/foo.d.ts': 'declare const sourceValue: 1;\n',
      'packages/pkg/dist/foo.d.ts': 'declare const emittedValue: 1;\n',
      'packages/pkg/tsconfig.json': tsconfig({
        files: [],
        references: [
          {
            path: './tsconfig.lib.json',
          },
        ],
      }),
      'packages/pkg/tsconfig.lib.json': tsconfig({
        liminaOptions: {
          outputs: {
            outDir: './dist',
            rootDir: './src',
          },
        },
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          target: 'ES2023',
          types: [],
        },
        files: ['src/foo.ts', 'src/foo.d.ts'],
      }),
    });

    try {
      const result = await runBuild({
        config: {
          config: {
            checkers: {
              tsc: {
                include: ['packages/pkg/tsconfig.json'],
              },
            },
          },
          configPath: path.join(fixture.rootDir, 'limina.config.mjs'),
          rootDir: fixture.rootDir,
        },
        configPath: 'packages/pkg/tsconfig.lib.json',
        cwd: fixture.rootDir,
        runner: passingRunner(calls),
      });

      expect(result.passed).toBe(false);
      expect(result.failureKind).toBe('process');
      expect(result.problems?.join('\n')).toContain(
        'Output declaration copy conflict',
      );
      expect(errorSpy.mock.calls.join('\n')).toContain(
        'Output declaration copy conflict',
      );
    } finally {
      errorSpy.mockRestore();
      await fixture.cleanup();
    }
  });

  it('copies declaration inputs for all output leaves in a solution build', async () => {
    const calls: TypecheckTarget[] = [];
    const fixture = await createFixture({
      'packages/pkg/src/index.ts': 'export const value = 1;\n',
      'packages/pkg/src/lib-env.d.ts': 'declare const libEnv: 1;\n',
      'packages/pkg/test/index.ts': 'export const testValue = 1;\n',
      'packages/pkg/test/test-env.d.ts': 'declare const testEnv: 1;\n',
      'packages/pkg/tsconfig.json': tsconfig({
        files: [],
        references: [
          {
            path: './tsconfig.lib.json',
          },
          {
            path: './tsconfig.test.json',
          },
        ],
      }),
      'packages/pkg/tsconfig.lib.json': tsconfig({
        liminaOptions: {
          outputs: {
            outDir: './dist/lib',
            rootDir: './src',
          },
        },
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          target: 'ES2023',
          types: [],
        },
        include: ['src/**/*'],
      }),
      'packages/pkg/tsconfig.test.json': tsconfig({
        liminaOptions: {
          outputs: {
            outDir: './dist/test',
            rootDir: './test',
          },
        },
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          target: 'ES2023',
          types: [],
        },
        include: ['test/**/*'],
      }),
    });

    try {
      const result = await runBuild({
        config: {
          config: {
            checkers: {
              tsc: {
                include: ['packages/pkg/tsconfig.json'],
              },
            },
          },
          configPath: path.join(fixture.rootDir, 'limina.config.mjs'),
          rootDir: fixture.rootDir,
        },
        configPath: 'packages/pkg/tsconfig.json',
        cwd: fixture.rootDir,
        runner: passingRunner(calls),
      });

      expect(result.passed).toBe(true);
      await expect(
        readFile(
          path.join(fixture.rootDir, 'packages/pkg/dist/lib/lib-env.d.ts'),
          'utf8',
        ),
      ).resolves.toBe('declare const libEnv: 1;\n');
      await expect(
        readFile(
          path.join(fixture.rootDir, 'packages/pkg/dist/test/test-env.d.ts'),
          'utf8',
        ),
      ).resolves.toBe('declare const testEnv: 1;\n');
    } finally {
      await fixture.cleanup();
    }
  });

  it('preflights every output leaf in a solution before any provider runner starts', async () => {
    const calls: TypecheckTarget[] = [];
    const fixture = await createFixture({
      'external/marker.txt': 'external marker bytes\n',
      'packages/pkg/src/index.ts': 'export const value = 1;\n',
      'packages/pkg/test/index.ts': 'export const testValue = 1;\n',
      'packages/pkg/tsconfig.json': tsconfig({
        files: [],
        references: [
          { path: './tsconfig.lib.json' },
          { path: './tsconfig.test.json' },
        ],
      }),
      'packages/pkg/tsconfig.lib.json': tsconfig({
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          target: 'ES2023',
          types: [],
        },
        include: ['src/**/*'],
        liminaOptions: {
          outputs: { outDir: './dist/lib', rootDir: './src' },
        },
      }),
      'packages/pkg/tsconfig.test.json': tsconfig({
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          target: 'ES2023',
          types: [],
        },
        include: ['test/**/*'],
        liminaOptions: {
          outputs: { outDir: './dist/test', rootDir: './test' },
        },
      }),
    });
    await mkdir(path.join(fixture.rootDir, 'packages/pkg/dist/test'), {
      recursive: true,
    });
    await symlink(
      path.join(fixture.rootDir, 'external'),
      path.join(fixture.rootDir, 'packages/pkg/dist/test/nested-link'),
    );

    try {
      await expect(
        runBuild({
          config: {
            config: {
              checkers: {
                tsc: {
                  include: ['packages/pkg/tsconfig.json'],
                },
              },
            },
            configPath: path.join(fixture.rootDir, 'limina.config.mjs'),
            rootDir: fixture.rootDir,
          },
          configPath: 'packages/pkg/tsconfig.json',
          cwd: fixture.rootDir,
          runner: passingRunner(calls),
        }),
      ).rejects.toThrow('symbolic link or junction');
      expect(calls).toHaveLength(0);
      expect(
        existsSync(path.join(fixture.rootDir, 'packages/pkg/dist/lib')),
      ).toBe(false);
      await expect(
        readFile(path.join(fixture.rootDir, 'external/marker.txt'), 'utf8'),
      ).resolves.toBe('external marker bytes\n');
    } finally {
      await fixture.cleanup();
    }
  });

  it('skips declaration input copying in watch mode', async () => {
    const calls: TypecheckTarget[] = [];
    const fixture = await createFixture({
      'packages/pkg/src/index.ts': 'export const value = 1;\n',
      'packages/pkg/src/vite-env.d.ts':
        '/// <reference types="vite/client" />\n',
      'packages/pkg/tsconfig.json': tsconfig({
        files: [],
        references: [
          {
            path: './tsconfig.lib.json',
          },
        ],
      }),
      'packages/pkg/tsconfig.lib.json': tsconfig({
        liminaOptions: {
          outputs: {
            outDir: './dist',
            rootDir: './src',
          },
        },
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          target: 'ES2023',
          types: [],
        },
        include: ['src/**/*'],
      }),
    });

    try {
      const result = await runBuild({
        config: {
          config: {
            checkers: {
              tsc: {
                include: ['packages/pkg/tsconfig.json'],
              },
            },
          },
          configPath: path.join(fixture.rootDir, 'limina.config.mjs'),
          rootDir: fixture.rootDir,
        },
        configPath: 'packages/pkg/tsconfig.lib.json',
        cwd: fixture.rootDir,
        runner: passingRunner(calls),
        watch: true,
      });

      expect(result.passed).toBe(true);
      expect(
        existsSync(
          path.join(fixture.rootDir, 'packages/pkg/dist/vite-env.d.ts'),
        ),
      ).toBe(false);
    } finally {
      await fixture.cleanup();
    }
  });

  it('raw builds selected configs that are not governed by a checker', async () => {
    const calls: TypecheckTarget[] = [];
    const fixture = await createFixture({
      'packages/app/src/index.ts': 'export const value = 1;\n',
      'packages/app/tsconfig.json': tsconfig({
        liminaOptions: {
          outputs: {},
        },
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          target: 'ES2023',
          types: [],
        },
        include: ['src/**/*.ts'],
      }),
      'packages/lib/src/index.ts': 'export const value = 1;\n',
      'packages/lib/tsconfig.json': tsconfig({
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          target: 'ES2023',
          types: [],
        },
        include: ['src/**/*.ts'],
      }),
    });

    try {
      const result = await runBuild({
        checker: 'tsc',
        config: {
          config: {
            checkers: {
              tsc: {
                include: ['packages/app/tsconfig.json'],
              },
            },
          },
          configPath: path.join(fixture.rootDir, 'limina.config.mjs'),
          rootDir: fixture.rootDir,
        },
        cwd: fixture.rootDir,
        configPath: 'packages/lib/tsconfig.json',
        raw: true,
        runner: passingRunner(calls),
      });

      expect(result.passed).toBe(true);
      expect(calls.map((target) => target.command)).toEqual(['tsc']);
      expect(calls.map((target) => target.args)).toEqual([
        ['-b', 'packages/lib/tsconfig.json', '--pretty', 'false'],
      ]);
    } finally {
      await fixture.cleanup();
    }
  });

  it('passes watch mode to raw build targets', async () => {
    const calls: TypecheckTarget[] = [];
    const fixture = await createFixture({
      'packages/app/src/index.ts': 'export const value = 1;\n',
      'packages/app/tsconfig.raw.json': tsconfig({
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          target: 'ES2023',
          types: [],
        },
        include: ['src/**/*.ts'],
      }),
      'packages/managed/src/index.ts': 'export const value = 1;\n',
      'packages/managed/tsconfig.json': tsconfig({
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          target: 'ES2023',
          types: [],
        },
        include: ['src/**/*.ts'],
      }),
    });

    try {
      const result = await runBuild({
        checker: 'tsc',
        config: {
          config: {
            checkers: {
              tsc: {
                include: ['packages/managed/tsconfig.json'],
              },
            },
          },
          configPath: path.join(fixture.rootDir, 'limina.config.mjs'),
          rootDir: fixture.rootDir,
        },
        cwd: fixture.rootDir,
        configPath: 'packages/app/tsconfig.raw.json',
        raw: true,
        runner: passingRunner(calls),
        watch: true,
      });

      expect(result.passed).toBe(true);
      expect(calls.map((target) => target.args)).toEqual([
        [
          '-b',
          'packages/app/tsconfig.raw.json',
          '--pretty',
          'false',
          '--watch',
          '--preserveWatchOutput',
        ],
      ]);
      expect(calls.map((target) => target.label)).toEqual([
        'tsc -b packages/app/tsconfig.raw.json --watch',
      ]);
    } finally {
      await fixture.cleanup();
    }
  });

  it('raw builds selected configs with the requested checker', async () => {
    const calls: TypecheckTarget[] = [];
    const fixture = await createFixture({
      'packages/app/src/index.vue': '<script setup lang="ts"></script>\n',
      'packages/app/tsconfig.raw.json': tsconfig({
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          target: 'ES2023',
          types: [],
        },
        include: ['src/**/*.vue'],
      }),
      'packages/managed/src/index.ts': 'export const value = 1;\n',
      'packages/managed/tsconfig.json': tsconfig({
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          target: 'ES2023',
          types: [],
        },
        include: ['src/**/*.ts'],
      }),
    });

    try {
      const result = await runBuild({
        checker: 'vue-tsc',
        config: {
          config: {
            checkers: {
              tsc: {
                include: ['packages/managed/tsconfig.json'],
              },
            },
          },
          configPath: path.join(fixture.rootDir, 'limina.config.mjs'),
          rootDir: fixture.rootDir,
        },
        cwd: fixture.rootDir,
        configPath: 'packages/app/tsconfig.raw.json',
        raw: true,
        runner: passingRunner(calls),
      });

      expect(result.passed).toBe(true);
      expect(calls.map((target) => target.command)).toEqual(['vue-tsc']);
      expect(calls.map((target) => target.args)).toEqual([
        ['-b', 'packages/app/tsconfig.raw.json', '--pretty', 'false'],
      ]);
    } finally {
      await fixture.cleanup();
    }
  });

  it('rejects raw builds for generated .limina configs', async () => {
    const fixture = await createFixture({
      '.limina/tsconfig/generated.json': tsconfig({
        include: [],
      }),
      'packages/managed/src/index.ts': 'export const value = 1;\n',
      'packages/managed/tsconfig.json': tsconfig({
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          target: 'ES2023',
          types: [],
        },
        include: ['src/**/*.ts'],
      }),
    });

    try {
      await expect(
        runBuild({
          checker: 'tsc',
          config: {
            config: {
              checkers: {
                tsc: {
                  include: ['packages/managed/tsconfig.json'],
                },
              },
            },
            configPath: path.join(fixture.rootDir, 'limina.config.mjs'),
            rootDir: fixture.rootDir,
          },
          configPath: '.limina/tsconfig/generated.json',
          cwd: fixture.rootDir,
          raw: true,
          runner: passingRunner(),
        }),
      ).rejects.toThrow('.limina generated configs');
    } finally {
      await fixture.cleanup();
    }
  });

  it('raw build ignores liminaOptions.outputs validation', async () => {
    const calls: TypecheckTarget[] = [];
    const fixture = await createFixture({
      'packages/app/src/index.ts': 'export const value = 1;\n',
      'packages/app/tsconfig.raw.json': tsconfig({
        liminaOptions: {
          outputs: {
            unknownFutureField: true,
          },
        },
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          target: 'ES2023',
          types: [],
        },
        include: ['src/**/*.ts'],
      }),
      'packages/managed/src/index.ts': 'export const value = 1;\n',
      'packages/managed/tsconfig.json': tsconfig({
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          target: 'ES2023',
          types: [],
        },
        include: ['src/**/*.ts'],
      }),
    });

    try {
      const result = await runBuild({
        checker: 'tsc',
        config: {
          config: {
            checkers: {
              tsc: {
                include: ['packages/managed/tsconfig.json'],
              },
            },
          },
          configPath: path.join(fixture.rootDir, 'limina.config.mjs'),
          rootDir: fixture.rootDir,
        },
        configPath: 'packages/app/tsconfig.raw.json',
        cwd: fixture.rootDir,
        raw: true,
        runner: passingRunner(calls),
      });

      expect(result.passed).toBe(true);
      expect(calls.map((target) => target.args)).toEqual([
        ['-b', 'packages/app/tsconfig.raw.json', '--pretty', 'false'],
      ]);
    } finally {
      await fixture.cleanup();
    }
  });

  it('rejects explicit checker configs without a build checker', async () => {
    const calls: TypecheckTarget[] = [];
    const errorSpy = vi
      .spyOn(TypecheckLogger, 'error')
      .mockImplementation(() => {});
    const fixture = await createFixture({
      'svelte/tsconfig.json': tsconfig({
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          target: 'ES2023',
          types: [],
        },
        include: ['src/**/*.ts'],
      }),
      'svelte/src/index.ts': 'export const value = 1;\n',
    });

    try {
      await expect(
        runBuild({
          config: {
            config: {
              checkers: {
                'svelte-check': {
                  include: ['svelte/tsconfig.json'],
                },
              },
            },
            configPath: path.join(fixture.rootDir, 'limina.config.mjs'),
            rootDir: fixture.rootDir,
          },
          cwd: fixture.rootDir,
          configPath: 'svelte/tsconfig.json',
          runner: passingRunner(calls),
        }),
      ).rejects.toThrow(
        'explicit checker config requires at least one build checker',
      );
      expect(calls).toHaveLength(0);
    } finally {
      errorSpy.mockRestore();
      await fixture.cleanup();
    }
  });

  it('rejects ambiguous inherited ownership before output selection', async () => {
    const calls: TypecheckTarget[] = [];
    const errorSpy = vi
      .spyOn(TypecheckLogger, 'error')
      .mockImplementation(() => {});
    const fixture = await createFixture({
      'packages/native/tsconfig.json': tsconfig({
        files: [],
        references: [
          {
            path: '../shared/tsconfig.lib.json',
          },
        ],
      }),
      'packages/ts/tsconfig.json': tsconfig({
        files: [],
        references: [
          {
            path: '../shared/tsconfig.lib.json',
          },
        ],
      }),
      'packages/shared/src/index.ts': 'export const value = 1;\n',
      'packages/shared/tsconfig.lib.json': tsconfig({
        liminaOptions: {
          outputs: {},
        },
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          target: 'ES2023',
          types: [],
        },
        include: ['src/**/*.ts'],
      }),
    });

    try {
      await expect(
        runBuild({
          config: {
            config: {
              checkers: {
                tsgo: {
                  include: ['packages/native/tsconfig.json'],
                },
                tsc: {
                  include: ['packages/ts/tsconfig.json'],
                },
              },
            },
            configPath: path.join(fixture.rootDir, 'limina.config.mjs'),
            rootDir: fixture.rootDir,
          },
          cwd: fixture.rootDir,
          configPath: 'packages/shared/tsconfig.lib.json',
          runner: passingRunner(calls),
        }),
      ).rejects.toThrow('Ambiguous inherited checker ownership');
      expect(calls).toHaveLength(0);
      expect(errorSpy.mock.calls.join('\n')).toContain(
        'Ambiguous inherited checker ownership',
      );
      expect(errorSpy.mock.calls.join('\n')).toContain('tsgo');
      expect(errorSpy.mock.calls.join('\n')).toContain('tsc');
    } finally {
      errorSpy.mockRestore();
      await fixture.cleanup();
    }
  });

  it('builds only the requested managed checker preset when it covers the config', async () => {
    const calls: TypecheckTarget[] = [];
    const fixture = await createFixture({
      'packages/native/src/index.ts': 'export const nativeValue = 1;\n',
      'packages/native/tsconfig.json': tsconfig({
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          target: 'ES2023',
          types: [],
        },
        include: ['src/**/*.ts'],
      }),
      'packages/ts/tsconfig.json': tsconfig({
        files: [],
        references: [
          {
            path: '../shared/tsconfig.lib.json',
          },
        ],
      }),
      'packages/shared/src/index.ts': 'export const value = 1;\n',
      'packages/shared/tsconfig.lib.json': tsconfig({
        liminaOptions: {
          outputs: {},
        },
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          target: 'ES2023',
          types: [],
        },
        include: ['src/**/*.ts'],
      }),
    });

    try {
      const result = await runBuild({
        checker: 'tsc',
        config: {
          config: {
            checkers: {
              tsgo: {
                include: ['packages/native/tsconfig.json'],
              },
              tsc: {
                include: ['packages/ts/tsconfig.json'],
              },
            },
          },
          configPath: path.join(fixture.rootDir, 'limina.config.mjs'),
          rootDir: fixture.rootDir,
        },
        cwd: fixture.rootDir,
        project: 'packages/shared/tsconfig.lib.json',
        runner: passingRunner(calls),
      });

      expect(result.passed).toBe(true);
      expect(calls.map((target) => target.command)).toEqual(['tsc']);
      expect(calls.map((target) => target.args)).toEqual([
        [
          '-b',
          '.limina/tsconfig/checkers/tsc/outputs/projects/packages/shared/tsconfig.lib.output.json',
          '--pretty',
          'false',
        ],
      ]);
    } finally {
      await fixture.cleanup();
    }
  });

  it('reports requested managed checker presets that do not cover the config', async () => {
    const calls: TypecheckTarget[] = [];
    const errorSpy = vi
      .spyOn(TypecheckLogger, 'error')
      .mockImplementation(() => {});
    const fixture = await createFixture({
      'packages/app/src/index.ts': 'export const value = 1;\n',
      'packages/app/tsconfig.json': tsconfig({
        liminaOptions: {
          outputs: {},
        },
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          target: 'ES2023',
          types: [],
        },
        include: ['src/**/*.ts'],
      }),
    });

    try {
      const result = await runBuild({
        checker: 'vue-tsc',
        config: {
          config: {
            checkers: {
              tsc: {
                include: ['packages/app/tsconfig.json'],
              },
            },
          },
          configPath: path.join(fixture.rootDir, 'limina.config.mjs'),
          rootDir: fixture.rootDir,
        },
        cwd: fixture.rootDir,
        configPath: 'packages/app/tsconfig.json',
        runner: passingRunner(calls),
      });

      expect(result.passed).toBe(false);
      expect(calls).toHaveLength(0);
      expect(errorSpy.mock.calls.join('\n')).toContain(
        'Invalid Limina build preset',
      );
    } finally {
      errorSpy.mockRestore();
      await fixture.cleanup();
    }
  });

  it('rejects tsc and vue-tsc inherited owners for the same source config', async () => {
    const calls: TypecheckTarget[] = [];
    const errorSpy = vi
      .spyOn(TypecheckLogger, 'error')
      .mockImplementation(() => {});
    const fixture = await createFixture({
      'packages/shared/src/index.ts': 'export const value = 1;\n',
      'packages/shared/tsconfig.lib.json': tsconfig({
        liminaOptions: {
          outputs: {},
        },
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          target: 'ES2023',
          types: [],
        },
        include: ['src/**/*.ts'],
      }),
      'packages/ts/tsconfig.json': tsconfig({
        files: [],
        references: [
          {
            path: '../shared/tsconfig.lib.json',
          },
        ],
      }),
      'packages/vue/tsconfig.json': tsconfig({
        files: [],
        references: [
          {
            path: '../shared/tsconfig.lib.json',
          },
        ],
      }),
    });

    try {
      await expect(
        runBuild({
          config: {
            config: {
              checkers: {
                tsc: {
                  include: ['packages/ts/tsconfig.json'],
                },
                'vue-tsc': {
                  include: ['packages/vue/tsconfig.json'],
                },
              },
            },
            configPath: path.join(fixture.rootDir, 'limina.config.mjs'),
            rootDir: fixture.rootDir,
          },
          cwd: fixture.rootDir,
          project: 'packages/shared/tsconfig.lib.json',
          runner: passingRunner(calls),
        }),
      ).rejects.toThrow('Ambiguous inherited checker ownership');
      expect(calls).toHaveLength(0);
      expect(errorSpy.mock.calls.join('\n')).toContain(
        'Ambiguous inherited checker ownership',
      );
    } finally {
      errorSpy.mockRestore();
      await fixture.cleanup();
    }
  });

  it('warns for compatible cross-checker traversal before failed checker builds', async () => {
    const calls: TypecheckTarget[] = [];
    const errorSpy = vi
      .spyOn(TypecheckLogger, 'error')
      .mockImplementation(() => {});
    const warnSpy = vi
      .spyOn(TypecheckLogger, 'warn')
      .mockImplementation(() => {});
    const fixture = await createFixture({
      'packages/shared/src/index.ts': 'export const sharedValue = 1;\n',
      'packages/shared/tsconfig.json': tsconfig({
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          target: 'ES2023',
          types: [],
        },
        include: ['src/**/*.ts'],
      }),
      'packages/theme/src/index.ts':
        "import { sharedValue } from '../../shared/src/index';\nexport const themeValue = sharedValue;\n",
      'packages/theme/tsconfig.json': tsconfig({
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          target: 'ES2023',
          types: [],
        },
        include: ['src/**/*.ts'],
      }),
    });

    try {
      const result = await runCheckerBuild({
        config: {
          config: {
            checkers: {
              tsgo: {
                include: ['packages/shared/tsconfig.json'],
              },
              'vue-tsc': {
                include: ['packages/theme/tsconfig.json'],
              },
            },
          },
          configPath: path.join(fixture.rootDir, 'limina.config.mjs'),
          rootDir: fixture.rootDir,
        },
        cwd: fixture.rootDir,
        runner: failingRunner(calls),
      });
      expect(result.passed).toBe(false);
      expect(calls.map((target) => target.command)).toEqual([
        'tsgo',
        'vue-tsc',
      ]);
      expect(warnSpy.mock.calls.join('\n')).toContain(
        'Build checker cache cannot be reused',
      );
    } finally {
      errorSpy.mockRestore();
      warnSpy.mockRestore();
      await fixture.cleanup();
    }
  });

  it('rejects cross-engine providers before running builds', async () => {
    const calls: TypecheckTarget[] = [];
    const errorSpy = vi
      .spyOn(TypecheckLogger, 'error')
      .mockImplementation(() => {});
    const fixture = await createFixture({
      'packages/app/src/index.ts':
        "import { themeValue } from '../../theme/src/theme';\nexport const value = themeValue;\n",
      'packages/app/tsconfig.json': tsconfig({
        liminaOptions: {
          outputs: {},
        },
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          target: 'ES2023',
          types: [],
        },
        include: ['src/**/*.ts'],
      }),
      'packages/theme/src/Theme.vue':
        '<script setup lang="ts">const value = 1;</script>\n',
      'packages/theme/src/theme.ts': 'export const themeValue = 1;\n',
      'packages/theme/tsconfig.json': tsconfig({
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          target: 'ES2023',
          types: [],
        },
        include: ['src/**/*.ts', 'src/**/*.vue'],
      }),
    });

    try {
      let thrown: unknown;

      try {
        await runBuild({
          config: {
            config: {
              checkers: {
                tsc: {
                  include: ['packages/app/tsconfig.json'],
                },
                'vue-tsc': {
                  include: ['packages/theme/tsconfig.json'],
                },
              },
            },
            configPath: path.join(fixture.rootDir, 'limina.config.mjs'),
            rootDir: fixture.rootDir,
          },
          cwd: fixture.rootDir,
          project: 'packages/app',
          runner: passingRunner(calls),
        });
      } catch (error) {
        thrown = error;
      }

      expect(String(thrown)).toContain(
        'Unsupported cross-checker declaration provider',
      );
      expect(String(thrown)).toContain('consumer checker: tsc (tsc)');
      expect(String(thrown)).toContain('provider checker: vue-tsc (vue-tsc)');
      expect(String(thrown)).toContain('packages/theme/src/theme.ts');
      expect(calls).toEqual([]);
    } finally {
      errorSpy.mockRestore();
      await fixture.cleanup();
    }
  });

  it('rejects cross-engine cyclic provider candidates before closure checks', async () => {
    const calls: TypecheckTarget[] = [];
    const errorSpy = vi
      .spyOn(TypecheckLogger, 'error')
      .mockImplementation(() => {});
    const fixture = await createFixture({
      'packages/app/src/index.ts':
        "import { themeValue } from '../../theme/src/theme';\nexport const value = themeValue;\n",
      'packages/app/tsconfig.json': tsconfig({
        liminaOptions: {
          outputs: {},
        },
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          target: 'ES2023',
          types: [],
        },
        include: ['src/**/*.ts'],
      }),
      'packages/theme/src/theme.ts': 'export const themeValue = 1;\n',
      'packages/theme/tsconfig.json': tsconfig({
        liminaOptions: {
          implicitRefs: [
            {
              path: '../widgets/tsconfig.json',
              reason: 'Widgets are loaded by a generated theme manifest.',
            },
          ],
        },
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          target: 'ES2023',
          types: [],
        },
        include: ['src/**/*.ts'],
      }),
      'packages/widgets/src/Widget.vue':
        '<script setup lang="ts">const value = 1;</script>\n',
      'packages/widgets/src/widget.ts': 'export const widgetValue = 1;\n',
      'packages/widgets/tsconfig.json': tsconfig({
        liminaOptions: {
          implicitRefs: [
            {
              path: '../theme/tsconfig.json',
              reason: 'Theme metadata is loaded by generated widgets.',
            },
          ],
        },
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          target: 'ES2023',
          types: [],
        },
        include: ['src/**/*.ts', 'src/**/*.vue'],
      }),
    });

    try {
      let thrown: unknown;

      try {
        await runBuild({
          config: {
            config: {
              checkers: {
                tsc: {
                  include: ['packages/app/tsconfig.json'],
                },
                'vue-tsc': {
                  include: [
                    'packages/theme/tsconfig.json',
                    'packages/widgets/tsconfig.json',
                  ],
                },
              },
            },
            configPath: path.join(fixture.rootDir, 'limina.config.mjs'),
            rootDir: fixture.rootDir,
          },
          cwd: fixture.rootDir,
          project: 'packages/app',
          runner: passingRunner(calls),
        });
      } catch (error) {
        thrown = error;
      }

      expect(String(thrown)).toContain(
        'Unsupported cross-checker declaration provider',
      );
      expect(String(thrown)).toContain('provider checker: vue-tsc (vue-tsc)');
      expect(String(thrown)).toContain('packages/theme/src/theme.ts');
      expect(calls).toEqual([]);
    } finally {
      errorSpy.mockRestore();
      await fixture.cleanup();
    }
  });

  it('builds cross-checker providers before consumers', async () => {
    const calls: TypecheckTarget[] = [];
    const delayed = delayedRunner({
      calls,
      delayMs: (target) =>
        target.configPath.includes('packages/theme') ? 30 : 10,
    });
    const fixture = await createFixture({
      'packages/app/src/index.ts':
        "import { themeValue } from '../../theme/src/theme';\nexport const value = themeValue;\n",
      'packages/app/tsconfig.json': tsconfig({
        liminaOptions: {
          outputs: {},
        },
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          target: 'ES2023',
          types: [],
        },
        include: ['src/**/*.ts'],
      }),
      'packages/theme/src/theme.ts': 'export const themeValue = 1;\n',
      'packages/theme/tsconfig.json': tsconfig({
        liminaOptions: {
          outputs: {},
        },
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          target: 'ES2023',
          types: [],
        },
        include: ['src/**/*.ts'],
      }),
    });

    try {
      const result = await runBuild({
        config: {
          config: {
            checkers: {
              tsc: {
                include: ['packages/app/tsconfig.json'],
              },
              tsgo: {
                include: ['packages/theme/tsconfig.json'],
              },
            },
          },
          configPath: path.join(fixture.rootDir, 'limina.config.mjs'),
          rootDir: fixture.rootDir,
        },
        cwd: fixture.rootDir,
        project: 'packages/app',
        runner: delayed.runner,
      });

      expect(result.passed).toBe(true);
      expect(calls.map((target) => target.command)).toEqual(['tsgo', 'tsc']);
      expect(delayed.getMaxActive()).toBe(1);
      expect(calls.map((target) => target.args)).toEqual([
        [
          '-b',
          '.limina/tsconfig/checkers/tsgo/outputs/projects/packages/theme/tsconfig.output.json',
          '--pretty',
          'false',
        ],
        [
          '-b',
          '.limina/tsconfig/checkers/tsc/outputs/projects/packages/app/tsconfig.output.json',
          '--pretty',
          'false',
        ],
      ]);
    } finally {
      await fixture.cleanup();
    }
  });

  it('starts all managed targets concurrently in watch mode', async () => {
    const calls: TypecheckTarget[] = [];
    const delayed = delayedRunner({
      calls,
      // Use a long delay so the two watch-mode runners are guaranteed to
      // overlap even when beforeTargetRun (recheckMutationBoundary) takes
      // non-trivial time on slower CI environments or newer Node versions.
      delayMs: () => 500,
    });
    const fixture = await createFixture({
      'packages/app/src/index.ts':
        "import { themeValue } from '../../theme/src/theme';\nexport const value = themeValue;\n",
      'packages/app/tsconfig.json': tsconfig({
        liminaOptions: {
          outputs: {},
        },
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          target: 'ES2023',
          types: [],
        },
        include: ['src/**/*.ts'],
      }),
      'packages/theme/src/theme.ts': 'export const themeValue = 1;\n',
      'packages/theme/tsconfig.json': tsconfig({
        liminaOptions: {
          outputs: {},
        },
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          target: 'ES2023',
          types: [],
        },
        include: ['src/**/*.ts'],
      }),
    });

    try {
      const result = await runBuild({
        config: {
          config: {
            checkers: {
              tsc: {
                include: ['packages/app/tsconfig.json'],
              },
              tsgo: {
                include: ['packages/theme/tsconfig.json'],
              },
            },
          },
          configPath: path.join(fixture.rootDir, 'limina.config.mjs'),
          rootDir: fixture.rootDir,
        },
        cwd: fixture.rootDir,
        project: 'packages/app',
        runner: delayed.runner,
        watch: true,
      });

      expect(result.passed).toBe(true);
      expect(calls.map((target) => target.command).sort()).toEqual([
        'tsc',
        'tsgo',
      ]);
      expect(delayed.getMaxActive()).toBe(2);
      expect(calls.map((target) => target.args)).toEqual(
        expect.arrayContaining([
          [
            '-b',
            '.limina/tsconfig/checkers/tsc/outputs/projects/packages/app/tsconfig.output.json',
            '--pretty',
            'false',
            '--watch',
            '--preserveWatchOutput',
          ],
          [
            '-b',
            '.limina/tsconfig/checkers/tsgo/outputs/projects/packages/theme/tsconfig.output.json',
            '--pretty',
            'false',
            '--watch',
            '--preserveWatchOutput',
          ],
        ]),
      );
    } finally {
      await fixture.cleanup();
    }
  });
});

describe('runCheckerTypecheck', () => {
  it('runs only supplemental checker entries', async () => {
    const calls: TypecheckTarget[] = [];
    const fixture = await createFixture({
      'svelte/src/App.svelte': '<script lang="ts">const value = 1;</script>\n',
      'svelte/tsconfig.json': tsconfig({ include: ['src/**/*'] }),
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
        [
          '--workspace',
          toPortablePath(fixture.rootDir),
          '--tsconfig',
          toPortablePath(path.join(fixture.rootDir, 'svelte/tsconfig.json')),
        ],
      ]);
    } finally {
      await fixture.cleanup();
    }
  });

  it('discovers supplemental targets without checking build-only peers', async () => {
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
              tsc: {
                include: ['tsconfig.json'],
              },
              'vue-tsc': {
                include: ['vue/tsconfig.json'],
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
      expect(result.disabled).toBe(true);
      expect(calls).toHaveLength(0);
      expect(existsSync(path.join(fixture.rootDir, '.limina'))).toBe(false);
    } finally {
      await fixture.cleanup();
    }
  });
});
