import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { defineConfig, loadConfig } from '../config';

async function writeText(filePath: string, text: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, text);
}

describe('defineConfig', () => {
  it('returns the explicit user config unchanged', () => {
    const config = defineConfig({
      config: {
        roots: {
          graph: 'tsconfig.graph.custom.json',
          typecheck: 'tsconfig.check.json',
        },
        source: {
          include: ['src/**/*.ts'],
          exclude: ['dist'],
        },
      },
      pipelines: {
        package: ['package:check'],
        typecheck: ['graph:check'],
      },
      packageChecks: {
        targets: [
          {
            attw: {
              profile: 'esm-only',
            },
            boundary: {
              ignoredExternalPackages: ['@example/allowed'],
            },
            checks: ['publint', 'attw', 'boundary'],
            distDir: 'packages/core/dist',
            name: '@example/core',
            publint: {
              strict: true,
            },
          },
        ],
      },
    });

    expect(config.config?.roots?.graph).toBe('tsconfig.graph.custom.json');
    expect(config.config?.roots?.typecheck).toBe('tsconfig.check.json');
    expect(config.config?.source?.include).toEqual(['src/**/*.ts']);
    expect(config.config?.source?.exclude).toEqual(['dist']);
    expect(config.pipelines?.package).toEqual(['package:check']);
    expect(config.packageChecks?.targets?.[0]?.checks).toEqual([
      'publint',
      'attw',
      'boundary',
    ]);
  });

  it('returns config factories unchanged', async () => {
    const config = defineConfig(async ({ command, mode }) => ({
      config: {
        roots: {
          graph: `tsconfig.${command}.${mode}.json`,
        },
      },
    }));

    await expect(config({ command: 'graph', mode: 'ci' })).resolves.toEqual({
      config: {
        roots: {
          graph: 'tsconfig.graph.ci.json',
        },
      },
    });
  });
});

describe('loadConfig', () => {
  it('loads promised config objects', async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), 'lattice-config-'));

    try {
      await writeText(
        path.join(rootDir, 'pnpm-workspace.yaml'),
        'packages: []\n',
      );
      await writeText(
        path.join(rootDir, 'lattice.config.mjs'),
        `
export default Promise.resolve({});
`,
      );

      const config = await loadConfig({
        cwd: rootDir,
      });

      expect(config.rootDir).toBe(rootDir);
    } finally {
      await rm(rootDir, {
        force: true,
        recursive: true,
      });
    }
  });

  it('loads config factories with the current env', async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), 'lattice-config-'));

    try {
      await writeText(
        path.join(rootDir, 'pnpm-workspace.yaml'),
        'packages: []\n',
      );
      await writeText(
        path.join(rootDir, 'lattice.config.mjs'),
        `
import { defineConfig } from '${new URL('../config.ts', import.meta.url).href}';

export default defineConfig(async ({ command, mode }) => ({
  config: {
    roots: {
      graph: \`tsconfig.\${command}.\${mode}.json\`,
    },
  },
}));
`,
      );

      const config = await loadConfig({
        command: 'paths',
        cwd: rootDir,
        mode: 'ci',
      });

      expect(config.configPath).toBe(path.join(rootDir, 'lattice.config.mjs'));
      expect(config.rootDir).toBe(rootDir);
      expect(config.config?.roots?.graph).toBe('tsconfig.paths.ci.json');
    } finally {
      await rm(rootDir, {
        force: true,
        recursive: true,
      });
    }
  });

  it('infers the pnpm workspace root from a parent directory', async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), 'lattice-config-'));

    try {
      await writeText(
        path.join(rootDir, 'pnpm-workspace.yaml'),
        'packages: []\n',
      );
      await writeText(
        path.join(rootDir, 'tools/lattice.config.mjs'),
        `
export default {};
`,
      );

      const config = await loadConfig({
        configPath: 'tools/lattice.config.mjs',
        cwd: rootDir,
      });

      expect(config.configPath).toBe(
        path.join(rootDir, 'tools/lattice.config.mjs'),
      );
      expect(config.rootDir).toBe(rootDir);
    } finally {
      await rm(rootDir, {
        force: true,
        recursive: true,
      });
    }
  });

  it('fails clearly when no pnpm workspace root can be inferred', async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), 'lattice-config-'));

    try {
      await writeText(
        path.join(rootDir, 'lattice.config.mjs'),
        `
export default {};
`,
      );

      await expect(loadConfig({ cwd: rootDir })).rejects.toThrow(
        /no pnpm-workspace\.yaml was found/u,
      );
    } finally {
      await rm(rootDir, {
        force: true,
        recursive: true,
      });
    }
  });
});
