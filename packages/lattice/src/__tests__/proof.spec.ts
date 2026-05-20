import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runProofCheck } from '../commands/proof';
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
    await mkdtemp(path.join(tmpdir(), 'lattice-proof-')),
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

function createPassingFiles(
  overrides: Record<string, string> = {},
): Record<string, string> {
  return {
    'packages/pkg/src/index.ts': 'export const value = 1;\n',
    'packages/pkg/tsconfig.lib.build.json': JSON.stringify({
      extends: './tsconfig.lib.json',
      compilerOptions: {
        composite: true,
        declaration: true,
        emitDeclarationOnly: true,
        noEmit: false,
        outDir: './.tsbuild',
        rootDir: 'src',
        tsBuildInfoFile: './.tsbuild/lib.tsbuildinfo',
      },
    }),
    'packages/pkg/tsconfig.lib.json': JSON.stringify({
      compilerOptions: {
        lib: ['ES2023'],
        module: 'ESNext',
        moduleResolution: 'bundler',
        strict: true,
        target: 'ES2023',
        types: [],
      },
      include: ['src/**/*.ts'],
    }),
    'packages/pkg/tsconfig.json': JSON.stringify({
      files: [],
      references: [
        {
          path: './tsconfig.lib.json',
        },
      ],
    }),
    'tsconfig.json': JSON.stringify({
      files: [],
      references: [
        {
          path: './packages/pkg/tsconfig.json',
        },
      ],
    }),
    'tsconfig.graph.json': JSON.stringify({
      files: [],
      references: [
        {
          path: './packages/pkg/tsconfig.lib.build.json',
        },
      ],
    }),
    ...overrides,
  };
}

describe('runProofCheck build config semantics', () => {
  it('accepts build configs without graph-base inheritance when final build semantics are valid', async () => {
    const fixture = await createFixture(createPassingFiles());

    try {
      await expect(runProofCheck(fixture.config)).resolves.toBe(true);
    } finally {
      await fixture.cleanup();
    }
  });

  it('reports missing strict same-name local tsconfig files', async () => {
    const files = createPassingFiles();
    delete files['packages/pkg/tsconfig.lib.json'];
    const fixture = await createFixture(files);

    try {
      await expect(runProofCheck(fixture.config)).resolves.toBe(false);
    } finally {
      await fixture.cleanup();
    }
  });

  it('reports typecheck compiler option drift from the strict same-name local tsconfig', async () => {
    const fixture = await createFixture(
      createPassingFiles({
        'packages/pkg/tsconfig.lib.build.json': JSON.stringify({
          extends: './tsconfig.lib.json',
          compilerOptions: {
            composite: true,
            lib: ['ES2020'],
            moduleResolution: 'node10',
            noEmit: false,
            outDir: './.tsbuild',
            strict: false,
            tsBuildInfoFile: './.tsbuild/lib.tsbuildinfo',
            types: ['node'],
          },
        }),
      }),
    );

    try {
      await expect(runProofCheck(fixture.config)).resolves.toBe(false);
    } finally {
      await fixture.cleanup();
    }
  });

  it('accepts build-only compiler option extensions', async () => {
    const fixture = await createFixture(
      createPassingFiles({
        'packages/pkg/tsconfig.lib.build.json': JSON.stringify({
          extends: './tsconfig.lib.json',
          compilerOptions: {
            composite: true,
            declaration: true,
            declarationMap: false,
            emitDeclarationOnly: true,
            incremental: true,
            noEmit: false,
            outDir: './.tsbuild',
            rootDir: 'src',
            sourceMap: false,
            tsBuildInfoFile: './.tsbuild/lib.tsbuildinfo',
          },
        }),
      }),
    );

    try {
      await expect(runProofCheck(fixture.config)).resolves.toBe(true);
    } finally {
      await fixture.cleanup();
    }
  });

  it('reports build and local file set drift', async () => {
    const fixture = await createFixture(
      createPassingFiles({
        'packages/pkg/src/extra.ts': 'export const extra = 2;\n',
        'packages/pkg/tsconfig.lib.build.json': JSON.stringify({
          extends: './tsconfig.lib.json',
          compilerOptions: {
            composite: true,
            noEmit: false,
            outDir: './.tsbuild',
            tsBuildInfoFile: './.tsbuild/lib.tsbuildinfo',
          },
          include: ['src/index.ts'],
        }),
      }),
    );

    try {
      await expect(runProofCheck(fixture.config)).resolves.toBe(false);
    } finally {
      await fixture.cleanup();
    }
  });

  it('ignores paths and baseUrl drift because module resolution is checked by graph validation', async () => {
    const fixture = await createFixture(
      createPassingFiles({
        'packages/pkg/tsconfig.lib.build.json': JSON.stringify({
          extends: './tsconfig.lib.json',
          compilerOptions: {
            baseUrl: '.',
            composite: true,
            noEmit: false,
            outDir: './.tsbuild',
            paths: {
              '#internal/*': ['./src/*'],
            },
            tsBuildInfoFile: './.tsbuild/lib.tsbuildinfo',
          },
        }),
      }),
    );

    try {
      await expect(runProofCheck(fixture.config)).resolves.toBe(true);
    } finally {
      await fixture.cleanup();
    }
  });

  it('reports build configs referenced from the IDE/typecheck route', async () => {
    const fixture = await createFixture(
      createPassingFiles({
        'packages/pkg/tsconfig.json': JSON.stringify({
          files: [],
          references: [
            {
              path: './tsconfig.lib.build.json',
            },
          ],
        }),
      }),
    );

    try {
      await expect(runProofCheck(fixture.config)).resolves.toBe(false);
    } finally {
      await fixture.cleanup();
    }
  });

  it('reports companion local configs missing from the IDE/typecheck route', async () => {
    const fixture = await createFixture(
      createPassingFiles({
        'packages/pkg/tsconfig.json': JSON.stringify({
          files: [],
          references: [],
        }),
      }),
    );

    try {
      await expect(runProofCheck(fixture.config)).resolves.toBe(false);
    } finally {
      await fixture.cleanup();
    }
  });

  it('accepts configured sidecars outside the root graph route', async () => {
    const fixture = await createFixture({
      'packages/pkg/src/index.ts': 'export const value = 1;\n',
      'packages/pkg/tsconfig.test.build.json': JSON.stringify({
        extends: './tsconfig.test.json',
        compilerOptions: {
          composite: true,
          noEmit: false,
          outDir: './.tsbuild',
          tsBuildInfoFile: './.tsbuild/test.tsbuildinfo',
        },
      }),
      'packages/pkg/tsconfig.test.json': JSON.stringify({
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          target: 'ES2023',
          types: [],
        },
        include: ['src/**/*.ts'],
      }),
      'packages/pkg/tsconfig.vue.json': JSON.stringify({
        extends: './tsconfig.test.json',
      }),
      'packages/pkg/tsconfig.json': JSON.stringify({
        files: [],
        references: [
          {
            path: './tsconfig.test.json',
          },
        ],
      }),
      'tsconfig.json': JSON.stringify({
        files: [],
        references: [
          {
            path: './packages/pkg/tsconfig.json',
          },
        ],
      }),
      'tsconfig.graph.json': JSON.stringify({
        files: [],
        references: [
          {
            path: './packages/pkg/tsconfig.test.build.json',
          },
        ],
      }),
    });

    try {
      await expect(
        runProofCheck({
          ...fixture.config,
          proof: {
            sidecarTargets: [
              {
                config: 'packages/pkg/tsconfig.vue.json',
                tool: 'vue-tsc',
              },
            ],
          },
        }),
      ).resolves.toBe(true);
    } finally {
      await fixture.cleanup();
    }
  });

  it('reports source files outside graph, sidecars, and allowlist coverage', async () => {
    const fixture = await createFixture(
      createPassingFiles({
        'packages/pkg/fixtures/uncovered.ts': 'export const uncovered = 1;\n',
      }),
    );

    try {
      await expect(runProofCheck(fixture.config)).resolves.toBe(false);
    } finally {
      await fixture.cleanup();
    }
  });

  it('accepts source files covered by the proof allowlist', async () => {
    const fixture = await createFixture(
      createPassingFiles({
        'packages/pkg/fixtures/allowed.ts': 'export const allowed = 1;\n',
      }),
    );

    try {
      await expect(
        runProofCheck({
          ...fixture.config,
          proof: {
            allowlist: [
              {
                file: 'packages/pkg/fixtures/allowed.ts',
                reason: 'fixture intentionally lives outside TypeScript routes',
              },
            ],
          },
        }),
      ).resolves.toBe(true);
    } finally {
      await fixture.cleanup();
    }
  });

  it('accepts source files covered by a sidecar target', async () => {
    const fixture = await createFixture(
      createPassingFiles({
        'tools/covered.ts': 'export const covered = 1;\n',
        'tools/tsconfig.json': JSON.stringify({
          compilerOptions: {
            module: 'ESNext',
            moduleResolution: 'bundler',
            strict: true,
            target: 'ES2023',
            types: [],
          },
          include: ['covered.ts'],
        }),
      }),
    );

    try {
      await expect(
        runProofCheck({
          ...fixture.config,
          proof: {
            sidecarTargets: [
              {
                config: 'tools/tsconfig.json',
                tool: 'tsc',
              },
            ],
          },
        }),
      ).resolves.toBe(true);
    } finally {
      await fixture.cleanup();
    }
  });

  it('does not require coverage for excluded config json files', async () => {
    const fixture = await createFixture(
      createPassingFiles({
        'package.json': JSON.stringify({
          name: 'fixture',
        }),
      }),
    );

    try {
      await expect(
        runProofCheck({
          ...fixture.config,
          config: {
            source: {
              include: ['package.json'],
              exclude: ['package.json'],
            },
          },
        }),
      ).resolves.toBe(true);
    } finally {
      await fixture.cleanup();
    }
  });

  it('uses the shared typecheck root config', async () => {
    const fixture = await createFixture(
      createPassingFiles({
        'tsconfig.check.json': JSON.stringify({
          files: [],
          references: [
            {
              path: './packages/pkg/tsconfig.json',
            },
          ],
        }),
        'tsconfig.json': JSON.stringify({
          files: [],
          references: [],
        }),
      }),
    );

    try {
      await expect(
        runProofCheck({
          ...fixture.config,
          config: {
            roots: {
              typecheck: 'tsconfig.check.json',
            },
          },
        }),
      ).resolves.toBe(true);
    } finally {
      await fixture.cleanup();
    }
  });

  it('uses the shared graph root config', async () => {
    const fixture = await createFixture(
      createPassingFiles({
        'tsconfig.custom.graph.json': JSON.stringify({
          files: [],
          references: [
            {
              path: './packages/pkg/tsconfig.lib.build.json',
            },
          ],
        }),
        'tsconfig.graph.json': JSON.stringify({
          files: [],
          references: [],
        }),
      }),
    );

    try {
      await expect(
        runProofCheck({
          ...fixture.config,
          config: {
            roots: {
              graph: 'tsconfig.custom.graph.json',
            },
          },
        }),
      ).resolves.toBe(true);
    } finally {
      await fixture.cleanup();
    }
  });
});
