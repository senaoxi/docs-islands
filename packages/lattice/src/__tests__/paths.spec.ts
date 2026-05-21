import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runGraphCheck } from '../commands/graph';
import { runPaths } from '../commands/paths';
import type { ResolvedLatticeConfig } from '../config';

async function writeText(filePath: string, text: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, text);
}

async function createFixture(files: Record<string, string>): Promise<{
  cleanup: () => Promise<void>;
  config: ResolvedLatticeConfig;
  rootDir: string;
}> {
  const rootDir = await realpath(
    await mkdtemp(path.join(tmpdir(), 'lattice-paths-')),
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
    config: {
      configPath: path.join(rootDir, 'lattice.config.mjs'),
      rootDir,
    },
    rootDir,
  };
}

function stringifyConfig(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

const buildCompilerOptions = {
  composite: true,
  declaration: true,
  emitDeclarationOnly: true,
  incremental: true,
  module: 'ESNext',
  moduleResolution: 'bundler',
  noEmit: false,
  outDir: './.tsbuild',
  strict: true,
  target: 'ES2023',
  types: [],
};

function createWorkspaceExportFixture(): Record<string, string> {
  return {
    'packages/a/package.json': stringifyConfig({
      dependencies: {
        '@example/b': 'workspace:*',
      },
      name: '@example/a',
      type: 'module',
    }),
    'packages/a/src/index.ts':
      "import { value } from '@example/b';\nimport { feature } from '@example/b/features/foo';\nexport const result = value + feature;\n",
    'packages/a/tsconfig.lib.json': stringifyConfig({
      compilerOptions: {
        ...buildCompilerOptions,
        noEmit: true,
      },
      include: ['src/**/*.ts'],
    }),
    'packages/a/tsconfig.lib.build.json': stringifyConfig({
      compilerOptions: {
        ...buildCompilerOptions,
        rootDir: 'src',
        tsBuildInfoFile: './.tsbuild/lib.tsbuildinfo',
      },
      include: ['src/**/*.ts'],
      references: [
        {
          path: '../b/tsconfig.lib.build.json',
        },
      ],
    }),
    'packages/b/dist/features/foo.d.ts':
      'export declare const feature: number;\n',
    'packages/b/dist/features/foo.js': 'export const feature = 1;\n',
    'packages/b/dist/index.d.ts': 'export declare const value: number;\n',
    'packages/b/dist/index.js': 'export const value = 1;\n',
    'packages/b/package.json': stringifyConfig({
      exports: {
        '.': './dist/index.js',
        './features/*': './dist/features/*.js',
      },
      name: '@example/b',
      type: 'module',
    }),
    'packages/b/src/features/foo.ts': 'export const feature = 1;\n',
    'packages/b/src/index.ts': 'export const value = 1;\n',
    'packages/b/tsconfig.lib.json': stringifyConfig({
      compilerOptions: {
        ...buildCompilerOptions,
        noEmit: true,
      },
      include: ['src/**/*.ts'],
    }),
    'packages/b/tsconfig.lib.build.json': stringifyConfig({
      compilerOptions: {
        ...buildCompilerOptions,
        rootDir: 'src',
        tsBuildInfoFile: './.tsbuild/lib.tsbuildinfo',
      },
      include: ['src/**/*.ts'],
    }),
    'pnpm-workspace.yaml': `
packages:
  - packages/*
`,
    'tsconfig.graph.json': stringifyConfig({
      files: [],
      references: [
        {
          path: './packages/b/tsconfig.lib.build.json',
        },
        {
          path: './packages/a/tsconfig.lib.build.json',
        },
      ],
    }),
  };
}

describe('runPaths', () => {
  it('fails when the shared graph route has config problems', async () => {
    const fixture = await createFixture({
      'packages/a/package.json': stringifyConfig({
        name: '@example/a',
        type: 'module',
      }),
      'packages/a/src/index.ts': 'export const value = 1;\n',
      'packages/a/tsconfig.lib.json': stringifyConfig({
        compilerOptions: {
          ...buildCompilerOptions,
          noEmit: true,
        },
        include: ['src/**/*.ts'],
      }),
      'packages/a/tsconfig.lib.build.json': stringifyConfig({
        compilerOptions: {
          ...buildCompilerOptions,
          rootDir: 'src',
          tsBuildInfoFile: './.tsbuild/lib.tsbuildinfo',
        },
        include: ['src/**/*.ts'],
      }),
      'tsconfig.graph.json': stringifyConfig({
        files: [],
        references: [
          {
            path: './packages/a/tsconfig.lib.build.json',
          },
          {
            path: './packages/missing/tsconfig.graph.jsonx',
          },
        ],
      }),
    });

    try {
      await expect(runPaths(fixture.config)).rejects.toThrow(
        /Graph route references a missing tsconfig/u,
      );
    } finally {
      await fixture.cleanup();
    }
  });

  it('uses the shared graph root config', async () => {
    const fixture = await createFixture({
      ...createWorkspaceExportFixture(),
      'tsconfig.custom.graph.json': stringifyConfig({
        files: [],
        references: [
          {
            path: './packages/b/tsconfig.lib.build.json',
          },
          {
            path: './packages/a/tsconfig.lib.build.json',
          },
        ],
      }),
      'tsconfig.graph.json': stringifyConfig({
        files: [],
        references: [],
      }),
    });

    try {
      await expect(
        runGraphCheck({
          ...fixture.config,
          config: {
            roots: {
              graph: 'tsconfig.custom.graph.json',
            },
          },
        }),
      ).resolves.toBe(false);
    } finally {
      await fixture.cleanup();
    }
  });

  it('generates source paths for referenced workspace deps whose exports point to dist', async () => {
    const fixture = await createFixture(createWorkspaceExportFixture());
    const generatedPath = path.join(
      fixture.rootDir,
      'packages/a/tsconfig.graph.paths.generated.json',
    );
    const aBuildConfigPath = path.join(
      fixture.rootDir,
      'packages/a/tsconfig.lib.build.json',
    );

    try {
      await mkdir(
        path.join(fixture.rootDir, 'packages/a/node_modules/@example'),
        {
          recursive: true,
        },
      );
      await symlink(
        '../../../b',
        path.join(fixture.rootDir, 'packages/a/node_modules/@example/b'),
      );

      await expect(runGraphCheck(fixture.config)).resolves.toBe(false);

      await expect(runPaths(fixture.config)).resolves.toMatchObject({
        aliasCount: 2,
        outputCount: 1,
        suggestionCount: 1,
      });

      await expect(readFile(generatedPath, 'utf8')).resolves.toContain(
        '"@example/b": ["../b/src/index.ts"]',
      );
      await expect(readFile(generatedPath, 'utf8')).resolves.toContain(
        '"@example/b/features/*": ["../b/src/features/*.ts"]',
      );
      await expect(readFile(aBuildConfigPath, 'utf8')).resolves.not.toContain(
        'tsconfig.graph.paths.generated.json',
      );
      await expect(runGraphCheck(fixture.config)).resolves.toBe(false);

      await writeText(
        aBuildConfigPath,
        stringifyConfig({
          extends: ['./tsconfig.graph.paths.generated.json'],
          compilerOptions: {
            ...buildCompilerOptions,
            rootDir: 'src',
            tsBuildInfoFile: './.tsbuild/lib.tsbuildinfo',
          },
          include: ['src/**/*.ts'],
          references: [
            {
              path: '../b/tsconfig.lib.build.json',
            },
          ],
        }),
      );

      await expect(runGraphCheck(fixture.config)).resolves.toBe(true);
    } finally {
      await fixture.cleanup();
    }
  });
});

describe('runGraphCheck workspace references', () => {
  it('rejects cross-package build references without workspace protocol dependencies', async () => {
    const fixture = await createFixture({
      'packages/a/package.json': stringifyConfig({
        dependencies: {
          '@example/b': 'link:../b/dist',
        },
        name: '@example/a',
        type: 'module',
      }),
      'packages/a/src/index.ts':
        "import { value } from '@example/b';\nexport const result = value;\n",
      'packages/a/tsconfig.lib.json': stringifyConfig({
        compilerOptions: {
          ...buildCompilerOptions,
          noEmit: true,
        },
        include: ['src/**/*.ts'],
      }),
      'packages/a/tsconfig.lib.build.json': stringifyConfig({
        compilerOptions: {
          ...buildCompilerOptions,
          rootDir: 'src',
          tsBuildInfoFile: './.tsbuild/lib.tsbuildinfo',
        },
        include: ['src/**/*.ts'],
        references: [
          {
            path: '../b/tsconfig.lib.build.json',
          },
        ],
      }),
      'packages/b/package.json': stringifyConfig({
        exports: {
          '.': './src/index.ts',
        },
        name: '@example/b',
        type: 'module',
      }),
      'packages/b/src/index.ts': 'export const value = 1;\n',
      'packages/b/tsconfig.lib.json': stringifyConfig({
        compilerOptions: {
          ...buildCompilerOptions,
          noEmit: true,
        },
        include: ['src/**/*.ts'],
      }),
      'packages/b/tsconfig.lib.build.json': stringifyConfig({
        compilerOptions: {
          ...buildCompilerOptions,
          rootDir: 'src',
          tsBuildInfoFile: './.tsbuild/lib.tsbuildinfo',
        },
        include: ['src/**/*.ts'],
      }),
      'pnpm-workspace.yaml': `
packages:
  - packages/*
`,
      'tsconfig.graph.json': stringifyConfig({
        files: [],
        references: [
          {
            path: './packages/b/tsconfig.lib.build.json',
          },
          {
            path: './packages/a/tsconfig.lib.build.json',
          },
        ],
      }),
    });

    try {
      await mkdir(
        path.join(fixture.rootDir, 'packages/a/node_modules/@example'),
        {
          recursive: true,
        },
      );
      await symlink(
        '../../../b',
        path.join(fixture.rootDir, 'packages/a/node_modules/@example/b'),
      );

      await expect(runGraphCheck(fixture.config)).resolves.toBe(false);
    } finally {
      await fixture.cleanup();
    }
  });
});
