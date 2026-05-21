import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { defineConfig, getActiveCheckers, loadConfig } from '../config';

async function writeText(filePath: string, text: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, text);
}

describe('defineConfig', () => {
  it('returns the explicit user config unchanged', () => {
    const config = defineConfig({
      config: {
        checkers: {
          typescript: {
            preset: 'tsc',
            routes: {
              build: 'tsconfig.graph.custom.json',
              typecheck: 'tsconfig.check.json',
            },
          },
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
            name: '@example/core',
            outDir: 'packages/core/dist',
            publint: {
              strict: true,
            },
          },
        ],
      },
    });

    expect(config.config?.checkers?.typescript?.routes?.build).toBe(
      'tsconfig.graph.custom.json',
    );
    expect(config.config?.checkers?.typescript?.routes?.typecheck).toBe(
      'tsconfig.check.json',
    );
    expect(config.config?.source?.include).toEqual(['src/**/*.ts']);
    expect(config.config?.source?.exclude).toEqual(['dist']);
    expect(config.pipelines?.package).toEqual(['package:check']);
    expect(config.packageChecks?.targets?.[0]?.checks).toEqual([
      'publint',
      'attw',
      'boundary',
    ]);
  });

  it('resolves built-in checker defaults and ignores checkers without routes', () => {
    const activeCheckers = getActiveCheckers({
      config: {
        checkers: {
          inactive: {
            preset: 'vue-tsc',
          },
          typescript: {
            preset: 'tsc',
            routes: {
              typecheck: 'tsconfig.json',
            },
          },
        },
      },
    });

    expect(activeCheckers).toHaveLength(1);
    expect(activeCheckers[0]).toMatchObject({
      extensions: [
        '.d.cts',
        '.d.mts',
        '.d.ts',
        '.json',
        '.cts',
        '.mts',
        '.tsx',
        '.ts',
      ],
      name: 'typescript',
      preset: 'tsc',
      routes: {
        typecheck: 'tsconfig.json',
      },
    });
  });

  it('returns config factories unchanged', async () => {
    const config = defineConfig(async ({ command, mode }) => ({
      config: {
        checkers: {
          typescript: {
            preset: 'tsc',
            routes: {
              build: `tsconfig.${command}.${mode}.json`,
            },
          },
        },
      },
    }));

    await expect(config({ command: 'graph', mode: 'ci' })).resolves.toEqual({
      config: {
        checkers: {
          typescript: {
            preset: 'tsc',
            routes: {
              build: 'tsconfig.graph.ci.json',
            },
          },
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
    checkers: {
      typescript: {
        preset: 'tsc',
        routes: {
          build: \`tsconfig.\${command}.\${mode}.json\`,
        },
      },
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
      expect(config.config?.checkers?.typescript?.routes?.build).toBe(
        'tsconfig.paths.ci.json',
      );
    } finally {
      await rm(rootDir, {
        force: true,
        recursive: true,
      });
    }
  });

  it('finds the nearest lattice config from cwd parents by default', async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), 'lattice-config-'));

    try {
      await writeText(
        path.join(rootDir, 'pnpm-workspace.yaml'),
        'packages: []\n',
      );
      await writeText(
        path.join(rootDir, 'lattice.config.mjs'),
        `
export default {};
`,
      );
      await writeText(path.join(rootDir, 'packages/core/package.json'), '{}\n');

      const config = await loadConfig({
        cwd: path.join(rootDir, 'packages/core'),
      });

      expect(config.configPath).toBe(path.join(rootDir, 'lattice.config.mjs'));
      expect(config.rootDir).toBe(rootDir);
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

  it('accepts an absolute config path', async () => {
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

      const configPath = path.join(rootDir, 'tools/lattice.config.mjs');
      const config = await loadConfig({
        configPath,
        cwd: path.join(rootDir, 'packages/core'),
      });

      expect(config.configPath).toBe(configPath);
      expect(config.rootDir).toBe(rootDir);
    } finally {
      await rm(rootDir, {
        force: true,
        recursive: true,
      });
    }
  });

  it('rejects explicit config paths outside the governed workspace', async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), 'lattice-config-'));
    const externalDir = await mkdtemp(
      path.join(tmpdir(), 'lattice-external-config-'),
    );

    try {
      await writeText(
        path.join(rootDir, 'pnpm-workspace.yaml'),
        'packages: []\n',
      );
      const externalConfigPath = path.join(externalDir, 'lattice.config.mjs');

      await writeText(
        externalConfigPath,
        `
throw new Error('external config should not be imported');
`,
      );

      await expect(
        loadConfig({
          configPath: externalConfigPath,
          cwd: rootDir,
        }),
      ).rejects.toThrow(/must be inside the governed pnpm workspace/u);
    } finally {
      await Promise.all([
        rm(rootDir, {
          force: true,
          recursive: true,
        }),
        rm(externalDir, {
          force: true,
          recursive: true,
        }),
      ]);
    }
  });

  it('rejects removed roots and proof sidecar fields', async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), 'lattice-config-'));

    try {
      await writeText(
        path.join(rootDir, 'pnpm-workspace.yaml'),
        'packages: []\n',
      );
      await writeText(
        path.join(rootDir, 'lattice.config.mjs'),
        `
export default {
  config: {
    roots: {
      graph: 'tsconfig.graph.json',
    },
  },
  proof: {
    sidecarTargets: [],
  },
};
`,
      );

      await expect(loadConfig({ cwd: rootDir })).rejects.toThrow(
        /config\.roots[\s\S]*proof\.sidecarTargets/u,
      );
    } finally {
      await rm(rootDir, {
        force: true,
        recursive: true,
      });
    }
  });

  it('rejects empty checker routes', async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), 'lattice-config-'));

    try {
      await writeText(
        path.join(rootDir, 'pnpm-workspace.yaml'),
        'packages: []\n',
      );
      await writeText(
        path.join(rootDir, 'lattice.config.mjs'),
        `
export default {
  config: {
    checkers: {
      vue: {
        preset: 'vue-tsc',
        routes: {},
      },
    },
  },
};
`,
      );

      await expect(loadConfig({ cwd: rootDir })).rejects.toThrow(
        /routes must include typecheck or build/u,
      );
    } finally {
      await rm(rootDir, {
        force: true,
        recursive: true,
      });
    }
  });

  it('rejects custom checker presets without explicit extensions', async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), 'lattice-config-'));

    try {
      await writeText(
        path.join(rootDir, 'pnpm-workspace.yaml'),
        'packages: []\n',
      );
      await writeText(
        path.join(rootDir, 'lattice.config.mjs'),
        `
export default {
  config: {
    checkers: {
      custom: {
        preset: 'custom-checker',
        routes: {
          typecheck: 'tsconfig.custom.json',
        },
      },
    },
  },
};
`,
      );

      await expect(loadConfig({ cwd: rootDir })).rejects.toThrow(
        /extensions may only be omitted for built-in presets/u,
      );
    } finally {
      await rm(rootDir, {
        force: true,
        recursive: true,
      });
    }
  });

  it('does not search for default config beyond the workspace root', async () => {
    const parentDir = await mkdtemp(path.join(tmpdir(), 'lattice-config-'));
    const rootDir = path.join(parentDir, 'workspace');

    try {
      await writeText(
        path.join(parentDir, 'lattice.config.mjs'),
        `
throw new Error('parent config should not be imported');
`,
      );
      await writeText(
        path.join(rootDir, 'pnpm-workspace.yaml'),
        'packages: []\n',
      );

      await expect(
        loadConfig({
          cwd: path.join(rootDir, 'packages/core'),
        }),
      ).rejects.toThrow(/up to the pnpm workspace root/u);
    } finally {
      await rm(parentDir, {
        force: true,
        recursive: true,
      });
    }
  });

  it('fails clearly when no lattice config can be found upward', async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), 'lattice-config-'));

    try {
      await writeText(
        path.join(rootDir, 'pnpm-workspace.yaml'),
        'packages: []\n',
      );

      await expect(loadConfig({ cwd: rootDir })).rejects.toThrow(
        /Searched for lattice\.config\.mjs from/u,
      );
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
