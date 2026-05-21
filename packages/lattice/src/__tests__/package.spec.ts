import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResolvedLatticeConfig } from '../config';

const packageCheckMocks = vi.hoisted(() => ({
  attwProblems: [] as unknown[],
  attwRuns: 0,
  packCalls: [] as string[],
  publintCalls: [] as unknown[],
}));

vi.mock('@publint/pack', async () => {
  const fs = await import('node:fs/promises');
  const pathModule = await import('node:path');

  return {
    pack: vi.fn(
      async (
        outDir: string,
        options: {
          destination: string;
        },
      ) => {
        packageCheckMocks.packCalls.push(outDir);
        const tarballPath = pathModule.join(options.destination, 'package.tgz');

        await fs.writeFile(tarballPath, 'mock tarball');

        return tarballPath;
      },
    ),
  };
});

vi.mock('publint', () => ({
  publint: vi.fn(async (options: unknown) => {
    packageCheckMocks.publintCalls.push(options);

    return {
      messages: [],
      pkg: {},
    };
  }),
}));

vi.mock('publint/utils', () => ({
  formatMessage: vi.fn(() => 'mock publint message'),
}));

vi.mock('@arethetypeswrong/core', () => ({
  checkPackage: vi.fn(async () => {
    packageCheckMocks.attwRuns += 1;

    return {
      problems: packageCheckMocks.attwProblems,
      types: true,
    };
  }),
  createPackageFromTarballData: vi.fn(() => ({
    package: 'mock',
  })),
}));

const { auditPublishedPackageBoundaries, runPackageCheck } = await import(
  '../commands/package'
);

async function writeText(filePath: string, text: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, text);
}

async function createOutputPackage(
  files: Record<string, string>,
  manifest: Record<string, unknown> = {},
): Promise<{
  cleanup: () => Promise<void>;
  outDir: string;
}> {
  const outDir = await mkdtemp(path.join(tmpdir(), 'lattice-package-'));

  await writeText(
    path.join(outDir, 'package.json'),
    JSON.stringify({
      dependencies: {
        '@example/dep': '1.0.0',
      },
      exports: {
        '.': './index.js',
      },
      name: '@example/pkg',
      ...manifest,
    }),
  );

  for (const [relativePath, source] of Object.entries(files)) {
    await writeText(path.join(outDir, relativePath), source);
  }

  return {
    cleanup: async () => {
      await rm(outDir, {
        force: true,
        recursive: true,
      });
    },
    outDir,
  };
}

function createConfig(
  rootDir: string,
  targets: NonNullable<
    NonNullable<ResolvedLatticeConfig['packageChecks']>['targets']
  >,
): ResolvedLatticeConfig {
  return {
    configPath: path.join(rootDir, 'lattice.config.mjs'),
    packageChecks: {
      targets,
    },
    rootDir,
  };
}

beforeEach(() => {
  packageCheckMocks.attwProblems = [];
  packageCheckMocks.attwRuns = 0;
  packageCheckMocks.packCalls = [];
  packageCheckMocks.publintCalls = [];
});

describe('auditPublishedPackageBoundaries', () => {
  it('allows self exports, declared dependencies, relative imports, and node builtins in node output', async () => {
    const pkg = await createOutputPackage(
      {
        'index.js': "import '@example/dep';\nimport './local.js';\n",
        'local.js': 'export const value = 1;\n',
        'node/index.js': "import 'node:fs';\nexport const value = 1;\n",
        'self.js': "import '@example/pkg/feature';\n",
      },
      {
        exports: {
          '.': './index.js',
          './feature': './self.js',
        },
      },
    );

    try {
      await expect(
        auditPublishedPackageBoundaries({
          outDir: pkg.outDir,
        }),
      ).resolves.toEqual([]);
    } finally {
      await pkg.cleanup();
    }
  });

  it('reports browser node builtins, undeclared dependencies, and unexported self imports', async () => {
    const pkg = await createOutputPackage({
      'index.js':
        "import 'node:fs';\nimport '@example/missing';\nimport '@example/pkg/private';\n",
    });

    try {
      const violations = await auditPublishedPackageBoundaries({
        outDir: pkg.outDir,
      });

      expect(violations.map((violation) => violation.specifier)).toEqual([
        '@example/missing',
        '@example/pkg/private',
        'node:fs',
      ]);
    } finally {
      await pkg.cleanup();
    }
  });
});

describe('runPackageCheck', () => {
  it('filters configured targets by package name', async () => {
    const validPackage = await createOutputPackage({
      'index.js': "import '@example/dep';\n",
    });
    const invalidPackage = await createOutputPackage({
      'index.js': "import 'node:fs';\n",
    });
    const rootDir = await mkdtemp(path.join(tmpdir(), 'lattice-package-root-'));

    try {
      await expect(
        runPackageCheck({
          config: createConfig(rootDir, [
            {
              checks: ['boundary'],
              outDir: validPackage.outDir,
              name: '@example/valid',
            },
            {
              checks: ['boundary'],
              outDir: invalidPackage.outDir,
              name: '@example/invalid',
            },
          ]),
          targetName: '@example/valid',
        }),
      ).resolves.toBe(true);
    } finally {
      await validPackage.cleanup();
      await invalidPackage.cleanup();
      await rm(rootDir, {
        force: true,
        recursive: true,
      });
    }
  });

  it('fails when an explicit package target is not configured', async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), 'lattice-package-root-'));

    try {
      await expect(
        runPackageCheck({
          config: createConfig(rootDir, [
            {
              checks: ['boundary'],
              name: '@example/valid',
              outDir: 'packages/valid/dist',
            },
          ]),
          targetName: '@example/missing',
        }),
      ).rejects.toThrow(/No package check target named "@example\/missing"/u);
    } finally {
      await rm(rootDir, {
        force: true,
        recursive: true,
      });
    }
  });

  it('uses cwd package.json name when it matches a configured target', async () => {
    const validPackage = await createOutputPackage({
      'index.js': "import '@example/dep';\n",
    });
    const invalidPackage = await createOutputPackage({
      'index.js': "import 'node:fs';\n",
    });
    const rootDir = await mkdtemp(path.join(tmpdir(), 'lattice-package-root-'));
    const cwd = path.join(rootDir, 'packages/valid');

    try {
      await writeText(
        path.join(cwd, 'package.json'),
        JSON.stringify({
          name: '@example/valid',
        }),
      );

      await expect(
        runPackageCheck({
          config: createConfig(rootDir, [
            {
              checks: ['boundary'],
              name: '@example/valid',
              outDir: validPackage.outDir,
            },
            {
              checks: ['boundary'],
              name: '@example/invalid',
              outDir: invalidPackage.outDir,
            },
          ]),
          cwd,
        }),
      ).resolves.toBe(true);
    } finally {
      await validPackage.cleanup();
      await invalidPackage.cleanup();
      await rm(rootDir, {
        force: true,
        recursive: true,
      });
    }
  });

  it('runs all targets when cwd package.json name is not configured', async () => {
    const validPackage = await createOutputPackage({
      'index.js': "import '@example/dep';\n",
    });
    const invalidPackage = await createOutputPackage({
      'index.js': "import 'node:fs';\n",
    });
    const rootDir = await mkdtemp(path.join(tmpdir(), 'lattice-package-root-'));
    const cwd = path.join(rootDir, 'packages/other');

    try {
      await writeText(
        path.join(cwd, 'package.json'),
        JSON.stringify({
          name: '@example/other',
        }),
      );

      await expect(
        runPackageCheck({
          config: createConfig(rootDir, [
            {
              checks: ['boundary'],
              name: '@example/valid',
              outDir: validPackage.outDir,
            },
            {
              checks: ['boundary'],
              name: '@example/invalid',
              outDir: invalidPackage.outDir,
            },
          ]),
          cwd,
        }),
      ).resolves.toBe(false);
    } finally {
      await validPackage.cleanup();
      await invalidPackage.cleanup();
      await rm(rootDir, {
        force: true,
        recursive: true,
      });
    }
  });

  it('runs all targets when cwd package.json is absent', async () => {
    const validPackage = await createOutputPackage({
      'index.js': "import '@example/dep';\n",
    });
    const invalidPackage = await createOutputPackage({
      'index.js': "import 'node:fs';\n",
    });
    const rootDir = await mkdtemp(path.join(tmpdir(), 'lattice-package-root-'));
    const cwd = path.join(rootDir, 'packages/missing-manifest');

    try {
      await expect(
        runPackageCheck({
          config: createConfig(rootDir, [
            {
              checks: ['boundary'],
              name: '@example/valid',
              outDir: validPackage.outDir,
            },
            {
              checks: ['boundary'],
              name: '@example/invalid',
              outDir: invalidPackage.outDir,
            },
          ]),
          cwd,
        }),
      ).resolves.toBe(false);
    } finally {
      await validPackage.cleanup();
      await invalidPackage.cleanup();
      await rm(rootDir, {
        force: true,
        recursive: true,
      });
    }
  });

  it('runs all package checks by default', async () => {
    const pkg = await createOutputPackage({
      'index.js': "import '@example/dep';\n",
    });

    try {
      await expect(
        runPackageCheck({
          config: createConfig(pkg.outDir, [
            {
              outDir: pkg.outDir,
              name: '@example/pkg',
            },
          ]),
        }),
      ).resolves.toBe(true);

      expect(packageCheckMocks.packCalls).toEqual([pkg.outDir]);
      expect(packageCheckMocks.publintCalls).toHaveLength(1);
      expect(packageCheckMocks.attwRuns).toBe(1);
    } finally {
      await pkg.cleanup();
    }
  });

  it('runs only the selected tool', async () => {
    const pkg = await createOutputPackage({
      'index.js': "import 'node:fs';\n",
    });

    try {
      await expect(
        runPackageCheck({
          config: createConfig(pkg.outDir, [
            {
              outDir: pkg.outDir,
              name: '@example/pkg',
            },
          ]),
          tool: 'publint',
        }),
      ).resolves.toBe(true);

      expect(packageCheckMocks.packCalls).toEqual([pkg.outDir]);
      expect(packageCheckMocks.publintCalls).toHaveLength(1);
      expect(packageCheckMocks.attwRuns).toBe(0);
    } finally {
      await pkg.cleanup();
    }
  });

  it('prints the filtered checks in the package check plan', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const pkg = await createOutputPackage({
      'index.js': "import 'node:fs';\n",
    });

    try {
      await expect(
        runPackageCheck({
          config: createConfig(pkg.outDir, [
            {
              name: '@example/pkg',
              outDir: pkg.outDir,
            },
          ]),
          tool: 'publint',
        }),
      ).resolves.toBe(true);

      const output = logSpy.mock.calls
        .map((call) => call.map(String).join(' '))
        .join('\n');

      expect(output).toContain('Package check plan:');
      expect(output).toContain('outDir: .');
      expect(output).toContain('checks: publint');
    } finally {
      logSpy.mockRestore();
      await pkg.cleanup();
    }
  });

  it('applies the default and overridden ATTW profile', async () => {
    const pkg = await createOutputPackage({
      'index.js': 'export const value = 1;\n',
    });
    const node16CjsProblem = {
      entrypoint: '.',
      kind: 'NoResolution',
      resolutionKind: 'node16-cjs',
    };

    try {
      packageCheckMocks.attwProblems = [node16CjsProblem];

      await expect(
        runPackageCheck({
          config: createConfig(pkg.outDir, [
            {
              outDir: pkg.outDir,
              name: '@example/pkg',
            },
          ]),
          tool: 'attw',
        }),
      ).resolves.toBe(true);

      await expect(
        runPackageCheck({
          attwProfile: 'strict',
          config: createConfig(pkg.outDir, [
            {
              outDir: pkg.outDir,
              name: '@example/pkg',
            },
          ]),
          tool: 'attw',
        }),
      ).resolves.toBe(false);
    } finally {
      await pkg.cleanup();
    }
  });
});
