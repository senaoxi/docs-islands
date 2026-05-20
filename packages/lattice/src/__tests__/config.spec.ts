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
      workspace: {
        packagePatterns: ['packages/*'],
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

    expect(config.workspace?.packagePatterns).toEqual(['packages/*']);
    expect(config.pipelines?.package).toEqual(['package:check']);
    expect(config.packageChecks?.targets?.[0]?.checks).toEqual([
      'publint',
      'attw',
      'boundary',
    ]);
  });

  it('returns config factories unchanged', async () => {
    const config = defineConfig(async ({ command, mode }) => ({
      workspace: {
        rootDir: `${command}-${mode}`,
      },
    }));

    await expect(config({ command: 'graph', mode: 'ci' })).resolves.toEqual({
      workspace: {
        rootDir: 'graph-ci',
      },
    });
  });
});

describe('loadConfig', () => {
  it('loads promised config objects', async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), 'lattice-config-'));

    try {
      await writeText(
        path.join(rootDir, 'lattice.config.mjs'),
        `
export default Promise.resolve({
  workspace: {
    rootDir: 'workspace',
  },
});
`,
      );

      const config = await loadConfig({
        cwd: rootDir,
      });

      expect(config.rootDir).toBe(path.join(rootDir, 'workspace'));
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
        path.join(rootDir, 'lattice.config.mjs'),
        `
import { defineConfig } from '${new URL('../config.ts', import.meta.url).href}';

export default defineConfig(async ({ command, mode }) => ({
  workspace: {
    rootDir: \`workspace-\${command}-\${mode}\`,
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
      expect(config.rootDir).toBe(path.join(rootDir, 'workspace-paths-ci'));
    } finally {
      await rm(rootDir, {
        force: true,
        recursive: true,
      });
    }
  });
});
