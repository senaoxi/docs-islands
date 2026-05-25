import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResolvedLiminaConfig } from '../config';
import { LiminaFlowReporter } from '../flow';

const packageCheckMocks = vi.hoisted(() => ({
  attwProblems: [] as unknown[],
  attwRuns: 0,
  changedPackageDirs: new Set<string>(),
  packedManifestOverrides: new Map<string, Record<string, unknown>>(),
  packedTarballManifests: new Map<string, Record<string, unknown>>(),
  packCalls: [] as string[],
  publintCalls: [] as unknown[],
  registryPackages: new Map<string, Record<string, unknown>>(),
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
        const packageJson = JSON.parse(
          await fs.readFile(pathModule.join(outDir, 'package.json'), 'utf8'),
        ) as Record<string, unknown>;
        const packedManifest =
          packageCheckMocks.packedManifestOverrides.get(outDir) ?? packageJson;
        const tarballData = `mock tarball ${packageCheckMocks.packCalls.length}`;

        packageCheckMocks.packedTarballManifests.set(
          tarballData,
          packedManifest,
        );
        await fs.writeFile(tarballPath, tarballData);

        return tarballPath;
      },
    ),
    unpack: vi.fn(async (tarball: Uint8Array) => {
      const tarballData = Buffer.from(tarball).toString('utf8');
      const manifest =
        packageCheckMocks.packedTarballManifests.get(tarballData) ?? {};

      return {
        files: [
          {
            data: Buffer.from(JSON.stringify(manifest)),
            name: 'package/package.json',
          },
        ],
        rootDir: 'package',
      };
    }),
  };
});

vi.mock('node:child_process', () => ({
  execFile: vi.fn(
    (
      command: string,
      args: string[],
      _options: unknown,
      callback: (error: Error | null, stdout: string) => void,
    ) => {
      if (command === 'git') {
        const gitArgs = args.slice(args.indexOf('-C') + 2);
        const relativePackageDir = gitArgs.at(-1) ?? '';

        if (gitArgs[0] === 'diff') {
          if (packageCheckMocks.changedPackageDirs.has(relativePackageDir)) {
            callback(Object.assign(new Error('changed'), { code: 1 }), '');
            return;
          }

          callback(null, '');
          return;
        }

        if (gitArgs[0] === 'ls-files') {
          callback(null, '');
          return;
        }
      }

      callback(
        Object.assign(new Error('mock command unavailable'), { code: 1 }),
        '',
      );
    },
  ),
}));

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
  options: {
    includePublicMetadata?: boolean;
  } = {},
): Promise<{
  cleanup: () => Promise<void>;
  outDir: string;
}> {
  const outDir = await mkdtemp(path.join(tmpdir(), 'limina-package-'));
  const outputFiles = {
    ...((options.includePublicMetadata ?? true)
      ? {
          'LICENSE.md': 'MIT\n',
          'README.md': '# Example package\n',
        }
      : {}),
    ...files,
  };

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

  for (const [relativePath, source] of Object.entries(outputFiles)) {
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

async function createWorkspacePackage(
  rootDir: string,
  packageName: string,
  manifest: Record<string, unknown>,
  outputManifest: Record<string, unknown> = manifest,
): Promise<string> {
  const packageDirName = packageName.split('/').at(-1) ?? packageName;
  const packageDir = path.join(rootDir, 'packages', packageDirName);
  const outDir = path.join(packageDir, 'dist');

  await writeText(
    path.join(packageDir, 'package.json'),
    JSON.stringify({
      name: packageName,
      version: '1.0.0',
      ...manifest,
    }),
  );
  await writeText(path.join(packageDir, 'src/index.ts'), 'export {};\n');
  await writeText(
    path.join(outDir, 'package.json'),
    JSON.stringify({
      dependencies: {},
      exports: {
        '.': './index.js',
      },
      name: packageName,
      version: '1.0.0',
      ...outputManifest,
    }),
  );
  await writeText(path.join(outDir, 'index.js'), 'export const value = 1;\n');
  await writeText(path.join(outDir, 'README.md'), '# Example package\n');
  await writeText(path.join(outDir, 'LICENSE.md'), 'MIT\n');

  return outDir;
}

async function createWorkspaceRoot(): Promise<string> {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'limina-package-root-'));

  await writeText(
    path.join(rootDir, 'pnpm-workspace.yaml'),
    'packages:\n  - packages/*\n',
  );

  return rootDir;
}

function registerPublishedPackage(
  packageName: string,
  version: string,
  gitHead = `${packageName}@${version}`,
): void {
  packageCheckMocks.registryPackages.set(packageName, {
    versions: {
      [version]: {
        gitHead,
      },
    },
  });
}

function createConfig(
  rootDir: string,
  targets: NonNullable<
    NonNullable<ResolvedLiminaConfig['packageChecks']>['targets']
  >,
): ResolvedLiminaConfig {
  return {
    configPath: path.join(rootDir, 'limina.config.mjs'),
    packageChecks: {
      targets,
    },
    rootDir,
  };
}

function createFlow(): {
  chunks: string[];
  flow: LiminaFlowReporter;
} {
  const chunks: string[] = [];

  return {
    chunks,
    flow: new LiminaFlowReporter({
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

beforeEach(() => {
  packageCheckMocks.attwProblems = [];
  packageCheckMocks.attwRuns = 0;
  packageCheckMocks.changedPackageDirs.clear();
  packageCheckMocks.packedManifestOverrides.clear();
  packageCheckMocks.packedTarballManifests.clear();
  packageCheckMocks.packCalls = [];
  packageCheckMocks.publintCalls = [];
  packageCheckMocks.registryPackages.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL) => {
      const packageName = decodeURIComponent(
        new URL(String(url)).pathname.slice(1),
      );
      const metadata = packageCheckMocks.registryPackages.get(packageName) ?? {
        versions: {},
      };

      return {
        json: async () => metadata,
        ok: true,
        status: 200,
        statusText: 'OK',
      };
    }),
  );
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
  it('reports package target and sub-check states to the flow reporter', async () => {
    const pkg = await createOutputPackage({
      'index.js': "import '@example/dep';\n",
    });
    const rootDir = await mkdtemp(path.join(tmpdir(), 'limina-package-root-'));
    const { chunks, flow } = createFlow();

    try {
      await expect(
        runPackageCheck({
          clearScreen: false,
          config: createConfig(rootDir, [
            {
              checks: ['boundary'],
              outDir: pkg.outDir,
              name: '@example/valid',
            },
          ]),
          flow,
        }),
      ).resolves.toBe(true);

      expect(
        chunks.some((chunk) => chunk.includes('[start] package check')),
      ).toBe(true);
      expect(
        chunks.some((chunk) =>
          chunk.includes('[start] package target: @example/valid'),
        ),
      ).toBe(true);
      expect(
        chunks.some((chunk) =>
          chunk.includes('[pass] package boundary: @example/valid'),
        ),
      ).toBe(true);
    } finally {
      await pkg.cleanup();
      await rm(rootDir, {
        force: true,
        recursive: true,
      });
    }
  });

  it('fails before metadata checks when the output package.json is missing', async () => {
    const outDir = await mkdtemp(path.join(tmpdir(), 'limina-package-'));

    try {
      await expect(
        runPackageCheck({
          config: createConfig(outDir, [
            {
              outDir,
              name: '@example/pkg',
            },
          ]),
        }),
      ).rejects.toThrow(
        /outDir package\.json not found for @example\/pkg at package\.json/u,
      );

      expect(packageCheckMocks.packCalls).toEqual([]);
      expect(packageCheckMocks.publintCalls).toHaveLength(0);
      expect(packageCheckMocks.attwRuns).toBe(0);
    } finally {
      await rm(outDir, {
        force: true,
        recursive: true,
      });
    }
  });

  it('fails public package outputs that do not include README.md and LICENSE.md before packing', async () => {
    const pkg = await createOutputPackage(
      {
        'index.js': "import '@example/dep';\n",
      },
      {},
      {
        includePublicMetadata: false,
      },
    );

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
      ).rejects.toThrow(/missing required file\(s\): README\.md, LICENSE\.md/u);

      expect(packageCheckMocks.packCalls).toEqual([]);
      expect(packageCheckMocks.publintCalls).toHaveLength(0);
      expect(packageCheckMocks.attwRuns).toBe(0);
    } finally {
      await pkg.cleanup();
    }
  });

  it('skips README.md and LICENSE.md validation for private package outputs', async () => {
    const pkg = await createOutputPackage(
      {
        'index.js': "import '@example/dep';\n",
      },
      {
        private: true,
      },
      {
        includePublicMetadata: false,
      },
    );

    try {
      await expect(
        runPackageCheck({
          config: createConfig(pkg.outDir, [
            {
              checks: ['boundary'],
              outDir: pkg.outDir,
              name: '@example/pkg',
            },
          ]),
        }),
      ).resolves.toBe(true);
    } finally {
      await pkg.cleanup();
    }
  });

  it('validates public package output metadata when a single tool is selected', async () => {
    const pkg = await createOutputPackage(
      {
        'index.js': "import '@example/dep';\n",
      },
      {},
      {
        includePublicMetadata: false,
      },
    );

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
      ).rejects.toThrow(/missing required file\(s\): README\.md, LICENSE\.md/u);

      expect(packageCheckMocks.packCalls).toEqual([]);
      expect(packageCheckMocks.publintCalls).toHaveLength(0);
      expect(packageCheckMocks.attwRuns).toBe(0);
    } finally {
      await pkg.cleanup();
    }
  });

  it('fails when a publishable package depends on a private workspace package', async () => {
    const rootDir = await createWorkspaceRoot();

    try {
      const outDir = await createWorkspacePackage(
        rootDir,
        '@example/a',
        {
          dependencies: {
            '@example/b': 'workspace:*',
          },
        },
        {
          dependencies: {
            '@example/b': '^1.0.0',
          },
        },
      );

      await createWorkspacePackage(rootDir, '@example/b', {
        private: true,
      });

      await expect(
        runPackageCheck({
          config: createConfig(rootDir, [
            {
              checks: ['boundary'],
              name: '@example/a',
              outDir,
            },
          ]),
        }),
      ).resolves.toBe(false);
    } finally {
      await rm(rootDir, {
        force: true,
        recursive: true,
      });
    }
  });

  it('fails when a publishable source manifest uses link in publish dependencies', async () => {
    const rootDir = await createWorkspaceRoot();

    try {
      const outDir = await createWorkspacePackage(
        rootDir,
        '@example/a',
        {
          dependencies: {
            '@example/b': 'link:../b/dist',
          },
        },
        {
          dependencies: {
            '@example/b': '^1.0.0',
          },
        },
      );

      await expect(
        runPackageCheck({
          config: createConfig(rootDir, [
            {
              checks: ['boundary'],
              name: '@example/a',
              outDir,
            },
          ]),
        }),
      ).resolves.toBe(false);
    } finally {
      await rm(rootDir, {
        force: true,
        recursive: true,
      });
    }
  });

  it('skips release dependency consistency for private package outputs', async () => {
    const rootDir = await createWorkspaceRoot();

    try {
      const outDir = await createWorkspacePackage(
        rootDir,
        '@example/a',
        {
          dependencies: {
            '@example/b': 'link:../b/dist',
          },
        },
        {
          private: true,
        },
      );

      await rm(path.join(outDir, 'README.md'), {
        force: true,
      });
      await rm(path.join(outDir, 'LICENSE.md'), {
        force: true,
      });

      await expect(
        runPackageCheck({
          config: createConfig(rootDir, [
            {
              checks: ['boundary'],
              name: '@example/a',
              outDir,
            },
          ]),
        }),
      ).resolves.toBe(true);
    } finally {
      await rm(rootDir, {
        force: true,
        recursive: true,
      });
    }
  });

  it('ignores workspace and link specifiers in source devDependencies', async () => {
    const rootDir = await createWorkspaceRoot();

    try {
      const outDir = await createWorkspacePackage(rootDir, '@example/a', {
        devDependencies: {
          '@example/b': 'workspace:*',
          '@example/c': 'link:../c/dist',
        },
      });

      await createWorkspacePackage(rootDir, '@example/b', {
        private: true,
      });

      await expect(
        runPackageCheck({
          config: createConfig(rootDir, [
            {
              checks: ['boundary'],
              name: '@example/a',
              outDir,
            },
          ]),
        }),
      ).resolves.toBe(true);
    } finally {
      await rm(rootDir, {
        force: true,
        recursive: true,
      });
    }
  });

  it('fails when the packed manifest leaks workspace or link specifiers', async () => {
    const rootDir = await createWorkspaceRoot();

    try {
      const outDir = await createWorkspacePackage(
        rootDir,
        '@example/a',
        {
          dependencies: {
            '@example/b': 'workspace:*',
          },
        },
        {
          dependencies: {
            '@example/b': 'workspace:*',
            '@example/c': 'link:../c/dist',
          },
        },
      );

      await createWorkspacePackage(rootDir, '@example/b', {
        version: '1.0.0',
      });
      registerPublishedPackage('@example/b', '1.0.0');

      await expect(
        runPackageCheck({
          config: createConfig(rootDir, [
            {
              checks: ['boundary'],
              name: '@example/a',
              outDir,
            },
          ]),
        }),
      ).resolves.toBe(false);
    } finally {
      await rm(rootDir, {
        force: true,
        recursive: true,
      });
    }
  });

  it('fails when a workspace dependency version is not published', async () => {
    const rootDir = await createWorkspaceRoot();

    try {
      const outDir = await createWorkspacePackage(
        rootDir,
        '@example/a',
        {
          dependencies: {
            '@example/b': 'workspace:*',
          },
        },
        {
          dependencies: {
            '@example/b': '^1.0.0',
          },
        },
      );

      await createWorkspacePackage(rootDir, '@example/b', {
        version: '1.0.0',
      });

      await expect(
        runPackageCheck({
          config: createConfig(rootDir, [
            {
              checks: ['boundary'],
              name: '@example/a',
              outDir,
            },
          ]),
        }),
      ).resolves.toBe(false);
    } finally {
      await rm(rootDir, {
        force: true,
        recursive: true,
      });
    }
  });

  it('fails when a workspace dependency has changes after its registry gitHead', async () => {
    const rootDir = await createWorkspaceRoot();

    try {
      const outDir = await createWorkspacePackage(
        rootDir,
        '@example/a',
        {
          dependencies: {
            '@example/b': 'workspace:*',
          },
        },
        {
          dependencies: {
            '@example/b': '^1.0.0',
          },
        },
      );

      await createWorkspacePackage(rootDir, '@example/b', {
        version: '1.0.0',
      });
      registerPublishedPackage('@example/b', '1.0.0', 'published-b');
      packageCheckMocks.changedPackageDirs.add('packages/b');

      await expect(
        runPackageCheck({
          config: createConfig(rootDir, [
            {
              checks: ['boundary'],
              name: '@example/a',
              outDir,
            },
          ]),
        }),
      ).resolves.toBe(false);
    } finally {
      await rm(rootDir, {
        force: true,
        recursive: true,
      });
    }
  });

  it('fails when the packed dependency range does not cover the workspace package version', async () => {
    const rootDir = await createWorkspaceRoot();

    try {
      const outDir = await createWorkspacePackage(
        rootDir,
        '@example/a',
        {
          dependencies: {
            '@example/b': 'workspace:*',
          },
        },
        {
          dependencies: {
            '@example/b': '^1.0.0',
          },
        },
      );

      await createWorkspacePackage(rootDir, '@example/b', {
        version: '2.0.0',
      });
      registerPublishedPackage('@example/b', '2.0.0');

      await expect(
        runPackageCheck({
          config: createConfig(rootDir, [
            {
              checks: ['boundary'],
              name: '@example/a',
              outDir,
            },
          ]),
        }),
      ).resolves.toBe(false);
    } finally {
      await rm(rootDir, {
        force: true,
        recursive: true,
      });
    }
  });

  it('passes when workspace dependencies are published and packed ranges cover them', async () => {
    const rootDir = await createWorkspaceRoot();

    try {
      const outDir = await createWorkspacePackage(
        rootDir,
        '@example/a',
        {
          dependencies: {
            '@example/b': 'workspace:*',
          },
        },
        {
          dependencies: {
            '@example/b': '^1.2.0',
          },
        },
      );

      await createWorkspacePackage(rootDir, '@example/b', {
        version: '1.2.0',
      });
      registerPublishedPackage('@example/b', '1.2.0');

      await expect(
        runPackageCheck({
          config: createConfig(rootDir, [
            {
              checks: ['boundary'],
              name: '@example/a',
              outDir,
            },
          ]),
        }),
      ).resolves.toBe(true);
    } finally {
      await rm(rootDir, {
        force: true,
        recursive: true,
      });
    }
  });

  it('reports recursive workspace dependency publish order', async () => {
    const rootDir = await createWorkspaceRoot();

    try {
      const outDir = await createWorkspacePackage(
        rootDir,
        '@example/a',
        {
          dependencies: {
            '@example/b': 'workspace:*',
          },
        },
        {
          dependencies: {
            '@example/b': '^1.0.0',
          },
        },
      );

      await createWorkspacePackage(rootDir, '@example/b', {
        dependencies: {
          '@example/c': 'workspace:*',
        },
        version: '1.0.0',
      });
      await createWorkspacePackage(rootDir, '@example/c', {
        version: '1.0.0',
      });
      registerPublishedPackage('@example/b', '1.0.0', 'published-b');
      registerPublishedPackage('@example/c', '1.0.0', 'published-c');
      packageCheckMocks.changedPackageDirs.add('packages/b');
      packageCheckMocks.changedPackageDirs.add('packages/c');

      await expect(
        runPackageCheck({
          config: createConfig(rootDir, [
            {
              checks: ['boundary'],
              name: '@example/a',
              outDir,
            },
          ]),
        }),
      ).resolves.toBe(false);
    } finally {
      await rm(rootDir, {
        force: true,
        recursive: true,
      });
    }
  });

  it('filters configured targets by package name', async () => {
    const validPackage = await createOutputPackage({
      'index.js': "import '@example/dep';\n",
    });
    const invalidPackage = await createOutputPackage({
      'index.js': "import 'node:fs';\n",
    });
    const rootDir = await mkdtemp(path.join(tmpdir(), 'limina-package-root-'));

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
    const rootDir = await mkdtemp(path.join(tmpdir(), 'limina-package-root-'));

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
    const rootDir = await mkdtemp(path.join(tmpdir(), 'limina-package-root-'));
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

  it('uses nearest parent package.json name up to the workspace root', async () => {
    const validPackage = await createOutputPackage({
      'index.js': "import '@example/dep';\n",
    });
    const invalidPackage = await createOutputPackage({
      'index.js': "import 'node:fs';\n",
    });
    const rootDir = await mkdtemp(path.join(tmpdir(), 'limina-package-root-'));
    const packageDir = path.join(rootDir, 'packages/valid');
    const cwd = path.join(packageDir, 'src/nested');

    try {
      await writeText(
        path.join(packageDir, 'package.json'),
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
    const rootDir = await mkdtemp(path.join(tmpdir(), 'limina-package-root-'));
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
    const rootDir = await mkdtemp(path.join(tmpdir(), 'limina-package-root-'));
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

  it('does not search beyond the workspace root for cwd package.json', async () => {
    const validPackage = await createOutputPackage({
      'index.js': "import '@example/dep';\n",
    });
    const invalidPackage = await createOutputPackage({
      'index.js': "import 'node:fs';\n",
    });
    const parentDir = await mkdtemp(
      path.join(tmpdir(), 'limina-package-parent-'),
    );
    const rootDir = path.join(parentDir, 'repo');
    const cwd = path.join(rootDir, 'packages/missing-manifest');

    try {
      await writeText(
        path.join(parentDir, 'package.json'),
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
      ).resolves.toBe(false);
    } finally {
      await validPackage.cleanup();
      await invalidPackage.cleanup();
      await rm(parentDir, {
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
