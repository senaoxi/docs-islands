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
});
