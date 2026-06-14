import { existsSync } from 'node:fs';
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ResolvedLiminaConfig } from '../config';
import { prepareGeneratedTsconfigGraph } from '../generated-graph';

async function writeText(filePath: string, text: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, text);
}

async function createFixture(files: Record<string, string>): Promise<{
  cleanup: () => Promise<void>;
  config: ResolvedLiminaConfig;
  rootDir: string;
}> {
  const rootDir = await realpath(
    await mkdtemp(path.join(tmpdir(), 'limina-generated-graph-')),
  );

  for (const [relativePath, text] of Object.entries(files)) {
    await writeText(path.join(rootDir, relativePath), text);
  }

  return {
    cleanup: async () => {
      await rm(rootDir, { force: true, recursive: true });
    },
    config: {
      config: {
        checkers: {
          typescript: {
            preset: 'tsc',
            include: ['packages/**/tsconfig*.json'],
            exclude: ['**/tsconfig*.dts.json', '**/tsconfig*.build.json'],
          },
        },
      },
      configPath: path.join(rootDir, 'limina.config.mjs'),
      rootDir,
    },
    rootDir,
  };
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

describe('prepareGeneratedTsconfigGraph', () => {
  it('writes a manifest and generated declaration leaf for source configs', async () => {
    const fixture = await createFixture({
      'packages/pkg/src/index.ts': 'export const value = 1;\n',
      'packages/pkg/tsconfig.lib.json': json({
        liminaOptions: {
          graphRules: ['runtime'],
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
      const result = await prepareGeneratedTsconfigGraph(fixture.config);
      const sourcePath = 'packages/pkg/tsconfig.lib.json';
      const dtsPath =
        '.limina/tsconfig/checkers/typescript/packages/pkg/tsconfig.lib.dts.json';

      expect(result.manifestPath).toBe(
        path.join(fixture.rootDir, '.limina/manifest.json'),
      );
      expect(result.manifest.checkers.typescript?.sourceToDts).toMatchObject({
        [sourcePath]: dtsPath,
      });
      expect(result.manifest.checkers.typescript?.dtsToSource).toMatchObject({
        [dtsPath]: sourcePath,
      });

      const generatedConfig = JSON.parse(
        await readFile(path.join(fixture.rootDir, dtsPath), 'utf8'),
      ) as {
        compilerOptions: Record<string, unknown>;
        liminaOptions: Record<string, unknown>;
      };

      expect(generatedConfig.compilerOptions.composite).toBe(true);
      expect(generatedConfig.compilerOptions.emitDeclarationOnly).toBe(true);
      expect(generatedConfig.liminaOptions).toMatchObject({
        checker: 'typescript',
        generated: true,
        graphRules: ['runtime'],
      });
      expect(generatedConfig.liminaOptions.sourceConfig).toContain(
        'packages/pkg/tsconfig.lib.json',
      );
    } finally {
      await fixture.cleanup();
    }
  });

  it('removes stale generated tsconfig files', async () => {
    const fixture = await createFixture({
      '.limina/tsconfig/checkers/typescript/stale/tsconfig.dts.json': '{}\n',
      'packages/pkg/src/index.ts': 'export const value = 1;\n',
      'packages/pkg/tsconfig.json': json({
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
      await prepareGeneratedTsconfigGraph(fixture.config);

      expect(
        existsSync(
          path.join(
            fixture.rootDir,
            '.limina/tsconfig/checkers/typescript/stale/tsconfig.dts.json',
          ),
        ),
      ).toBe(false);
    } finally {
      await fixture.cleanup();
    }
  });

  it('writes implicit references as generated declaration references', async () => {
    const fixture = await createFixture({
      'packages/app/src/index.ts': 'export const value = 1;\n',
      'packages/app/tsconfig.lib.json': json({
        liminaOptions: {
          implicitRefs: [
            {
              path: '../core/tsconfig.lib.json',
              reason: 'Loaded by a generated route manifest.',
            },
            {
              path: '../core/tsconfig.lib.json',
              reason: 'Duplicate dynamic source edge.',
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
      'packages/core/src/index.ts': 'export const coreValue = 1;\n',
      'packages/core/tsconfig.lib.json': json({
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
      await prepareGeneratedTsconfigGraph(fixture.config);

      const generatedConfig = JSON.parse(
        await readFile(
          path.join(
            fixture.rootDir,
            '.limina/tsconfig/checkers/typescript/packages/app/tsconfig.lib.dts.json',
          ),
          'utf8',
        ),
      ) as {
        references: { path: string }[];
      };

      expect(generatedConfig.references).toEqual([
        {
          path: '../core/tsconfig.lib.dts.json',
        },
      ]);
    } finally {
      await fixture.cleanup();
    }
  });

  it('deduplicates implicit references that static imports also prove', async () => {
    const fixture = await createFixture({
      'packages/pkg/node.ts': 'export const nodeValue = 1;\n',
      'packages/pkg/runtime.ts':
        "import { nodeValue } from './node';\nexport const runtimeValue = nodeValue;\n",
      'packages/pkg/tsconfig.node.json': json({
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          target: 'ES2023',
          types: [],
        },
        include: ['node.ts'],
      }),
      'packages/pkg/tsconfig.runtime.json': json({
        liminaOptions: {
          implicitRefs: [
            {
              path: './tsconfig.node.json',
              reason: 'Also loaded dynamically by the runtime manifest.',
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
        include: ['runtime.ts'],
      }),
    });

    try {
      await prepareGeneratedTsconfigGraph(fixture.config);

      const generatedConfig = JSON.parse(
        await readFile(
          path.join(
            fixture.rootDir,
            '.limina/tsconfig/checkers/typescript/packages/pkg/tsconfig.runtime.dts.json',
          ),
          'utf8',
        ),
      ) as {
        references: { path: string }[];
      };

      expect(generatedConfig.references).toEqual([
        {
          path: './tsconfig.node.dts.json',
        },
      ]);
    } finally {
      await fixture.cleanup();
    }
  });

  const invalidImplicitRefCases: {
    expected: string;
    files: Record<string, string>;
    name: string;
  }[] = [
    {
      expected: 'implicitRefs must be an array',
      files: {
        'packages/app/tsconfig.json': json({
          liminaOptions: {
            implicitRefs: true,
          },
          include: ['src/**/*.ts'],
        }),
      },
      name: 'non-array implicitRefs',
    },
    {
      expected: 'implicitRefs reason is required',
      files: {
        'packages/app/tsconfig.json': json({
          liminaOptions: {
            implicitRefs: [
              {
                path: '../core/tsconfig.json',
                reason: '',
              },
            ],
          },
          include: ['src/**/*.ts'],
        }),
        'packages/core/tsconfig.json': json({
          include: ['src/**/*.ts'],
        }),
      },
      name: 'empty reason',
    },
    {
      expected:
        'implicitRefs path must point to an existing ordinary source tsconfig',
      files: {
        'packages/app/tsconfig.json': json({
          liminaOptions: {
            implicitRefs: [
              {
                path: '../missing/tsconfig.json',
                reason: 'Loaded dynamically.',
              },
            ],
          },
          include: ['src/**/*.ts'],
        }),
      },
      name: 'missing target',
    },
    {
      expected: 'implicitRefs must not reference the declaring tsconfig',
      files: {
        'packages/app/tsconfig.json': json({
          liminaOptions: {
            implicitRefs: [
              {
                path: './tsconfig.json',
                reason: 'Self references are not valid.',
              },
            ],
          },
          include: ['src/**/*.ts'],
        }),
      },
      name: 'self reference',
    },
    {
      expected:
        'implicitRefs path must point to an ordinary source tsconfig*.json file',
      files: {
        'packages/app/tsconfig.json': json({
          liminaOptions: {
            implicitRefs: [
              {
                path: '../core/tsconfig.lib.dts.json',
                reason: 'Loaded dynamically.',
              },
            ],
          },
          include: ['src/**/*.ts'],
        }),
        'packages/core/tsconfig.lib.dts.json': json({
          files: [],
        }),
      },
      name: 'reserved target',
    },
    {
      expected:
        'implicitRefs must point to an ordinary source tsconfig selected by the same checker.include set',
      files: {
        'external/src/index.ts': 'export const value = 1;\n',
        'external/tsconfig.json': json({
          include: ['src/**/*.ts'],
        }),
        'packages/app/tsconfig.json': json({
          liminaOptions: {
            implicitRefs: [
              {
                path: '../../external/tsconfig.json',
                reason: 'Loaded dynamically.',
              },
            ],
          },
          include: ['src/**/*.ts'],
        }),
      },
      name: 'unselected target',
    },
  ];

  it.each(invalidImplicitRefCases)(
    'rejects invalid implicit references: $name',
    async (caseValue) => {
      const fixture = await createFixture({
        'packages/app/src/index.ts': 'export const value = 1;\n',
        'packages/core/src/index.ts': 'export const coreValue = 1;\n',
        ...caseValue.files,
      });

      try {
        await expect(
          prepareGeneratedTsconfigGraph(fixture.config),
        ).rejects.toThrow(caseValue.expected);
      } finally {
        await fixture.cleanup();
      }
    },
  );

  it('rejects hand-maintained references in selected source configs', async () => {
    const fixture = await createFixture({
      'packages/app/src/index.ts': 'export const value = 1;\n',
      'packages/app/tsconfig.lib.json': json({
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          target: 'ES2023',
          types: [],
        },
        include: ['src/**/*.ts'],
        references: [
          {
            path: '../core/tsconfig.lib.json',
          },
        ],
      }),
      'packages/core/src/index.ts': 'export const coreValue = 1;\n',
      'packages/core/tsconfig.lib.json': json({
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
        prepareGeneratedTsconfigGraph(fixture.config),
      ).rejects.toThrow('Source typecheck config declares project references');
    } finally {
      await fixture.cleanup();
    }
  });
});
