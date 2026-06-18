import { execFile } from 'node:child_process';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

async function writeText(filePath: string, text: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, text);
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
  rootDir: '.',
  strict: true,
  target: 'ES2023',
  tsBuildInfoFile: './.tsbuild/lib.tsbuildinfo',
  types: [],
};

describe('limina CLI', () => {
  it('shows graph export options without the removed task orchestrator command', async () => {
    const cliPath = fileURLToPath(
      new URL('../../bin/limina.js', import.meta.url),
    );
    const rootHelp = await execFileAsync(process.execPath, [cliPath, '--help']);
    const graphHelp = await execFileAsync(process.execPath, [
      cliPath,
      'graph',
      '--help',
    ]);

    expect(rootHelp.stdout).toContain('build');
    expect(rootHelp.stdout).toContain('graph <action>');
    expect(rootHelp.stdout).not.toContain('nx <action>');
    expect(graphHelp.stdout).toContain('--view <view>');
    expect(graphHelp.stdout).toContain('--output <path>');
  });

  it('runs build with a selected source project from the public command', async () => {
    const rootDir = await realpath(
      await mkdtemp(path.join(tmpdir(), 'limina-cli-build-')),
    );
    const cliPath = fileURLToPath(
      new URL('../../bin/limina.js', import.meta.url),
    );

    try {
      await writeText(
        path.join(rootDir, 'pnpm-workspace.yaml'),
        'packages:\n  - packages/*\n',
      );
      await writeText(
        path.join(rootDir, 'limina.config.mjs'),
        `export default ${JSON.stringify(
          {
            config: {
              checkers: {
                typescript: {
                  include: ['packages/pkg/tsconfig.json'],
                  preset: 'tsc',
                },
              },
            },
          },
          null,
          2,
        )};\n`,
      );
      await writeText(
        path.join(rootDir, 'node_modules/.bin/tsc'),
        [
          '#!/usr/bin/env sh',
          'printf "%s\\n" "$@" > "$PWD/tsc-args.txt"',
          'exit 0',
          '',
        ].join('\n'),
      );
      await chmod(path.join(rootDir, 'node_modules/.bin/tsc'), 0o755);
      await writeText(
        path.join(rootDir, 'node_modules/typescript/package.json'),
        stringifyConfig({
          name: 'typescript',
          version: '0.0.0-test',
        }),
      );
      await writeText(
        path.join(rootDir, 'packages/pkg/src/index.ts'),
        'export const value = 1;\n',
      );
      await writeText(
        path.join(rootDir, 'packages/pkg/tsconfig.lib.json'),
        stringifyConfig({
          compilerOptions: {
            ...buildCompilerOptions,
            noEmit: true,
          },
          include: ['src/**/*.ts'],
        }),
      );
      await writeText(
        path.join(rootDir, 'packages/pkg/tsconfig.json'),
        stringifyConfig({
          files: [],
          references: [
            {
              path: './tsconfig.lib.json',
            },
          ],
        }),
      );

      const result = await execFileAsync(
        process.execPath,
        [
          cliPath,
          '--config',
          path.join(rootDir, 'limina.config.mjs'),
          'build',
          'packages/pkg/tsconfig.lib.json',
        ],
        {
          cwd: rootDir,
          env: {
            ...process.env,
            CI: 'true',
          },
        },
      );
      const tscArgs = await readFile(
        path.join(rootDir, 'tsc-args.txt'),
        'utf8',
      );

      expect(result.stdout).toContain('limina build');
      expect(result.stdout).toContain('limina build passed');
      expect(tscArgs).toContain(
        '.limina/tsconfig/checkers/typescript/projects/packages/pkg/tsconfig.lib.dts.json',
      );

      await execFileAsync(
        process.execPath,
        [
          cliPath,
          '--config',
          path.join(rootDir, 'limina.config.mjs'),
          'build',
          'packages/pkg/tsconfig.lib.json',
          '-w',
        ],
        {
          cwd: rootDir,
          env: {
            ...process.env,
            CI: 'true',
          },
        },
      );

      const watchTscArgs = await readFile(
        path.join(rootDir, 'tsc-args.txt'),
        'utf8',
      );

      expect(watchTscArgs).toContain('--watch');
      expect(watchTscArgs).toContain('--preserveWatchOutput');
    } finally {
      await rm(rootDir, {
        force: true,
        recursive: true,
      });
    }
  }, 15_000);

  it('rejects conflicting positional and project build targets from the public command', async () => {
    const cliPath = fileURLToPath(
      new URL('../../bin/limina.js', import.meta.url),
    );

    await expect(
      execFileAsync(process.execPath, [
        cliPath,
        'build',
        'packages/pkg/tsconfig.lib.json',
        '-p',
        'packages/other/tsconfig.lib.json',
      ]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(
        'Conflicting limina build config arguments',
      ),
    });
  });

  it('runs source check from the public command', async () => {
    const rootDir = await realpath(
      await mkdtemp(path.join(tmpdir(), 'limina-cli-')),
    );
    const cliPath = fileURLToPath(
      new URL('../../bin/limina.js', import.meta.url),
    );

    try {
      await writeText(
        path.join(rootDir, 'pnpm-workspace.yaml'),
        'packages:\n  - app\n',
      );
      await writeText(
        path.join(rootDir, 'limina.config.mjs'),
        `export default ${JSON.stringify(
          {
            config: {
              checkers: {
                typescript: {
                  include: ['tsconfig.json'],
                  preset: 'tsc',
                },
              },
            },
          },
          null,
          2,
        )};\n`,
      );
      await writeText(
        path.join(rootDir, 'tsconfig.build.json'),
        stringifyConfig({
          files: [],
          references: [
            {
              path: './app/tsconfig.lib.dts.json',
            },
          ],
        }),
      );
      await writeText(
        path.join(rootDir, 'app/package.json'),
        stringifyConfig({
          name: '@example/app',
          scripts: {
            build: 'limina build tsconfig.json',
          },
          type: 'module',
        }),
      );
      await writeText(
        path.join(rootDir, 'app/src/index.ts'),
        'export const value = 1;\n',
      );
      await writeText(
        path.join(rootDir, 'app/tsconfig.lib.dts.json'),
        stringifyConfig({
          compilerOptions: buildCompilerOptions,
          include: ['src/**/*.ts'],
        }),
      );
      await writeText(
        path.join(rootDir, 'app/tsconfig.json'),
        stringifyConfig({
          files: [],
          references: [
            {
              path: './tsconfig.lib.json',
            },
          ],
        }),
      );
      await writeText(
        path.join(rootDir, 'app/tsconfig.lib.json'),
        stringifyConfig({
          compilerOptions: {
            ...buildCompilerOptions,
            noEmit: true,
          },
          include: ['src/**/*.ts'],
        }),
      );

      const result = await execFileAsync(
        process.execPath,
        [
          cliPath,
          '--config',
          path.join(rootDir, 'limina.config.mjs'),
          'source',
          'check',
        ],
        {
          cwd: rootDir,
          env: {
            ...process.env,
            CI: 'true',
          },
        },
      );

      expect(result.stdout).toContain('limina source check');
      expect(result.stdout).toContain('limina source passed');
    } finally {
      await rm(rootDir, {
        force: true,
        recursive: true,
      });
    }
  }, 15_000);

  it('runs release check with repeated package filters from the public command', async () => {
    const rootDir = await realpath(
      await mkdtemp(path.join(tmpdir(), 'limina-cli-release-')),
    );
    const cliPath = fileURLToPath(
      new URL('../../bin/limina.js', import.meta.url),
    );

    async function writePackage(packageName: string): Promise<void> {
      const packageDirName = packageName.split('/').at(-1) ?? packageName;
      const packageDir = path.join(rootDir, 'packages', packageDirName);
      const outDir = path.join(packageDir, 'dist');

      await writeText(
        path.join(packageDir, 'package.json'),
        stringifyConfig({
          name: packageName,
          version: '1.0.0',
        }),
      );
      await writeText(path.join(packageDir, 'src/index.ts'), 'export {};\n');
      await writeText(
        path.join(outDir, 'package.json'),
        stringifyConfig({
          exports: {
            '.': './index.js',
          },
          license: 'MIT',
          name: packageName,
          types: './index.d.ts',
          version: '1.0.0',
        }),
      );
      await writeText(
        path.join(outDir, 'index.js'),
        'export const value = 1;\n',
      );
      await writeText(path.join(outDir, 'README.md'), '# Example package\n');
      await writeText(path.join(outDir, 'LICENSE.md'), 'MIT\n');
    }

    try {
      await writeText(
        path.join(rootDir, 'pnpm-workspace.yaml'),
        'packages:\n  - packages/*\n',
      );
      await writePackage('@example/a');
      await writePackage('@example/b');
      await writeText(
        path.join(rootDir, 'limina.config.mjs'),
        `export default ${JSON.stringify(
          {
            package: {
              entries: [
                {
                  name: '@example/a',
                  outDir: 'packages/a/dist',
                },
                {
                  name: '@example/b',
                  outDir: 'packages/b/dist',
                },
              ],
            },
          },
          null,
          2,
        )};\n`,
      );

      const result = await execFileAsync(
        process.execPath,
        [
          cliPath,
          '--config',
          path.join(rootDir, 'limina.config.mjs'),
          'release',
          'check',
          '--package',
          '@example/a',
          '--package',
          '@example/b',
        ],
        {
          cwd: rootDir,
          env: {
            ...process.env,
            CI: 'true',
          },
        },
      );

      expect(result.stdout).toContain('limina release check');
      expect(result.stdout).toContain('limina release passed');
    } finally {
      await rm(rootDir, {
        force: true,
        recursive: true,
      });
    }
  }, 30_000);

  it('exports the dependency graph to stdout from the public command', async () => {
    const rootDir = await realpath(
      await mkdtemp(path.join(tmpdir(), 'limina-cli-graph-export-')),
    );
    const cliPath = fileURLToPath(
      new URL('../../bin/limina.js', import.meta.url),
    );

    try {
      await writeText(
        path.join(rootDir, 'pnpm-workspace.yaml'),
        'packages:\n  - packages/*\n',
      );
      await writeText(
        path.join(rootDir, 'package.json'),
        stringifyConfig({
          name: 'root',
          private: true,
        }),
      );
      await writeText(
        path.join(rootDir, 'limina.config.mjs'),
        `export default ${JSON.stringify(
          {
            config: {
              checkers: {
                typescript: {
                  include: ['packages/**/tsconfig.json'],
                  preset: 'tsc',
                },
              },
            },
          },
          null,
          2,
        )};\n`,
      );
      await writeText(
        path.join(rootDir, 'packages/a/package.json'),
        stringifyConfig({
          dependencies: {
            '@example/b': 'workspace:*',
          },
          name: '@example/a',
        }),
      );
      await writeText(
        path.join(rootDir, 'packages/a/src/index.ts'),
        "import { value } from '@example/b';\nexport const appValue = value;\n",
      );
      await writeText(
        path.join(rootDir, 'packages/a/tsconfig.lib.json'),
        stringifyConfig({
          compilerOptions: {
            ...buildCompilerOptions,
            noEmit: true,
          },
          include: ['src/**/*.ts'],
        }),
      );
      await writeText(
        path.join(rootDir, 'packages/a/tsconfig.json'),
        stringifyConfig({
          files: [],
          references: [{ path: './tsconfig.lib.json' }],
        }),
      );
      await writeText(
        path.join(rootDir, 'packages/b/package.json'),
        stringifyConfig({
          exports: {
            '.': './src/index.ts',
          },
          name: '@example/b',
        }),
      );
      await writeText(
        path.join(rootDir, 'packages/b/src/index.ts'),
        'export const value = 1;\n',
      );
      await writeText(
        path.join(rootDir, 'packages/b/tsconfig.lib.json'),
        stringifyConfig({
          compilerOptions: {
            ...buildCompilerOptions,
            noEmit: true,
          },
          include: ['src/**/*.ts'],
        }),
      );
      await writeText(
        path.join(rootDir, 'packages/b/tsconfig.json'),
        stringifyConfig({
          files: [],
          references: [{ path: './tsconfig.lib.json' }],
        }),
      );

      const result = await execFileAsync(
        process.execPath,
        [
          cliPath,
          '--config',
          path.join(rootDir, 'limina.config.mjs'),
          'graph',
          'export',
        ],
        {
          cwd: rootDir,
          env: {
            ...process.env,
            CI: 'true',
          },
        },
      );

      const graph = JSON.parse(result.stdout) as {
        edges: { from: string; kind: string; to: string }[];
      };

      expect(graph.edges).toEqual([
        {
          evidence: [
            {
              importer: 'packages/a/src/index.ts',
              resolvedPath: 'packages/b/src/index.ts',
              specifier: '@example/b',
            },
          ],
          from: 'pkg:@example/a',
          kind: 'source',
          to: 'pkg:@example/b',
        },
      ]);
    } finally {
      await rm(rootDir, {
        force: true,
        recursive: true,
      });
    }
  }, 15_000);

  it('runs graph prepare from the public command', async () => {
    const rootDir = await realpath(
      await mkdtemp(path.join(tmpdir(), 'limina-cli-graph-prepare-')),
    );
    const cliPath = fileURLToPath(
      new URL('../../bin/limina.js', import.meta.url),
    );

    try {
      await writeText(
        path.join(rootDir, 'pnpm-workspace.yaml'),
        'packages:\n  - app\n',
      );
      await writeText(
        path.join(rootDir, 'limina.config.mjs'),
        `export default ${JSON.stringify(
          {
            config: {
              checkers: {
                typescript: {
                  include: ['app/tsconfig.json'],
                  preset: 'tsc',
                },
              },
            },
          },
          null,
          2,
        )};\n`,
      );
      await writeText(
        path.join(rootDir, 'app/node.ts'),
        'export const nodeValue = 1;\n',
      );
      await writeText(
        path.join(rootDir, 'app/runtime.ts'),
        "import { nodeValue } from './node';\nexport const runtimeValue = nodeValue;\n",
      );
      await writeText(
        path.join(rootDir, 'app/tsconfig.node.json'),
        stringifyConfig({
          compilerOptions: buildCompilerOptions,
          include: ['node.ts'],
        }),
      );
      await writeText(
        path.join(rootDir, 'app/tsconfig.runtime.json'),
        stringifyConfig({
          compilerOptions: buildCompilerOptions,
          include: ['runtime.ts'],
        }),
      );
      await writeText(
        path.join(rootDir, 'app/tsconfig.json'),
        stringifyConfig({
          files: [],
          references: [
            {
              path: './tsconfig.node.json',
            },
            {
              path: './tsconfig.runtime.json',
            },
          ],
        }),
      );

      const result = await execFileAsync(
        process.execPath,
        [
          cliPath,
          '--config',
          path.join(rootDir, 'limina.config.mjs'),
          'graph',
          'prepare',
        ],
        {
          cwd: rootDir,
          env: {
            ...process.env,
            CI: 'true',
          },
        },
      );

      expect(result.stdout).toContain('limina graph prepare');
      expect(result.stdout).toContain('limina graph passed');
      expect(
        await readFile(
          path.join(
            rootDir,
            '.limina/tsconfig/checkers/typescript/projects/app/tsconfig.runtime.dts.json',
          ),
          'utf8',
        ),
      ).toContain('"path": "./tsconfig.node.dts.json"');
    } finally {
      await rm(rootDir, {
        force: true,
        recursive: true,
      });
    }
  }, 15_000);

  it('exports an artifact dependency graph to an output file', async () => {
    const rootDir = await realpath(
      await mkdtemp(path.join(tmpdir(), 'limina-cli-graph-export-output-')),
    );
    const cliPath = fileURLToPath(
      new URL('../../bin/limina.js', import.meta.url),
    );

    try {
      await writeText(
        path.join(rootDir, 'pnpm-workspace.yaml'),
        'packages:\n  - packages/*\n',
      );
      await writeText(
        path.join(rootDir, 'package.json'),
        stringifyConfig({
          name: 'root',
          private: true,
        }),
      );
      await writeText(
        path.join(rootDir, 'limina.config.mjs'),
        `export default ${JSON.stringify(
          {
            config: {
              checkers: {
                typescript: {
                  include: ['packages/**/tsconfig.json'],
                  preset: 'tsc',
                },
              },
            },
          },
          null,
          2,
        )};\n`,
      );
      await writeText(
        path.join(rootDir, 'packages/a/package.json'),
        stringifyConfig({
          dependencies: {
            '@example/b': 'workspace:*',
          },
          name: '@example/a',
        }),
      );
      await writeText(
        path.join(rootDir, 'packages/a/src/index.ts'),
        "import { runtimeValue } from '@example/b/runtime';\nexport const value = runtimeValue;\n",
      );
      await writeText(
        path.join(rootDir, 'packages/a/tsconfig.lib.json'),
        stringifyConfig({
          compilerOptions: {
            ...buildCompilerOptions,
            noEmit: true,
          },
          include: ['src/**/*.ts'],
        }),
      );
      await writeText(
        path.join(rootDir, 'packages/a/tsconfig.json'),
        stringifyConfig({
          files: [],
          references: [{ path: './tsconfig.lib.json' }],
        }),
      );
      await writeText(
        path.join(rootDir, 'packages/b/package.json'),
        stringifyConfig({
          exports: {
            './runtime': {
              default: './dist/runtime.js',
              types: './dist/runtime.d.ts',
            },
          },
          name: '@example/b',
        }),
      );
      await writeText(
        path.join(rootDir, 'packages/b/dist/runtime.d.ts'),
        'export declare const runtimeValue = 1;\n',
      );
      await writeText(
        path.join(rootDir, 'packages/b/dist/runtime.js'),
        'export const runtimeValue = 1;\n',
      );
      await writeText(
        path.join(rootDir, 'packages/b/src/index.ts'),
        'export const sourceValue = 1;\n',
      );
      await writeText(
        path.join(rootDir, 'packages/b/tsconfig.lib.json'),
        stringifyConfig({
          compilerOptions: {
            ...buildCompilerOptions,
            noEmit: true,
          },
          include: ['src/**/*.ts'],
        }),
      );
      await writeText(
        path.join(rootDir, 'packages/b/tsconfig.json'),
        stringifyConfig({
          files: [],
          references: [{ path: './tsconfig.lib.json' }],
        }),
      );

      const result = await execFileAsync(
        process.execPath,
        [
          cliPath,
          '--config',
          path.join(rootDir, 'limina.config.mjs'),
          'graph',
          'export',
          '--view',
          'artifact',
          '--output',
          'dependency-graph.json',
        ],
        {
          cwd: rootDir,
          env: {
            ...process.env,
            CI: 'true',
          },
        },
      );
      const graph = JSON.parse(
        await readFile(path.join(rootDir, 'dependency-graph.json'), 'utf8'),
      ) as { edges: { kind: string }[]; view: string };

      expect(result.stdout).toBe('');
      expect(graph.view).toBe('artifact');
      expect(graph.edges.map((edge) => edge.kind)).toEqual(['artifact']);
    } finally {
      await rm(rootDir, {
        force: true,
        recursive: true,
      });
    }
  }, 15_000);

  it('rejects the removed task orchestrator command from the public command', async () => {
    const rootDir = await realpath(
      await mkdtemp(path.join(tmpdir(), 'limina-cli-nx-generate-')),
    );
    const cliPath = fileURLToPath(
      new URL('../../bin/limina.js', import.meta.url),
    );

    try {
      await writeText(
        path.join(rootDir, 'limina.config.mjs'),
        'export default {};\n',
      );

      await expect(
        execFileAsync(
          process.execPath,
          [cliPath, '--config', path.join(rootDir, 'limina.config.mjs'), 'nx'],
          {
            cwd: rootDir,
            env: {
              ...process.env,
              CI: 'true',
            },
          },
        ),
      ).rejects.toMatchObject({
        stderr: expect.stringContaining('Unknown command "nx".'),
      });
    } finally {
      await rm(rootDir, {
        force: true,
        recursive: true,
      });
    }
  }, 15_000);

  it('rejects removed paths commands from the public command', async () => {
    const rootDir = await realpath(
      await mkdtemp(path.join(tmpdir(), 'limina-cli-paths-')),
    );
    const cliPath = fileURLToPath(
      new URL('../../bin/limina.js', import.meta.url),
    );

    try {
      await writeText(
        path.join(rootDir, 'limina.config.mjs'),
        'export default {};\n',
      );

      await expect(
        execFileAsync(
          process.execPath,
          [
            cliPath,
            '--config',
            path.join(rootDir, 'limina.config.mjs'),
            'paths',
            'check',
          ],
          {
            cwd: rootDir,
            env: {
              ...process.env,
              CI: 'true',
            },
          },
        ),
      ).rejects.toMatchObject({
        stderr: expect.stringContaining('Unknown command'),
      });
    } finally {
      await rm(rootDir, {
        force: true,
        recursive: true,
      });
    }
  }, 15_000);

  it('runs init from the public command', async () => {
    const rootDir = await realpath(
      await mkdtemp(path.join(tmpdir(), 'limina-cli-init-')),
    );
    const cliPath = fileURLToPath(
      new URL('../../bin/limina.js', import.meta.url),
    );

    try {
      await writeText(
        path.join(rootDir, 'pnpm-workspace.yaml'),
        'packages:\n  - packages/*\n',
      );
      await writeText(
        path.join(rootDir, 'package.json'),
        stringifyConfig({
          name: 'root',
          private: true,
          type: 'module',
        }),
      );
      await writeText(
        path.join(rootDir, 'packages/app/package.json'),
        stringifyConfig({
          name: 'app',
          type: 'module',
        }),
      );
      await writeText(
        path.join(rootDir, 'packages/app/src/index.ts'),
        'export const value = 1;\n',
      );
      await writeText(
        path.join(rootDir, 'packages/app/tsconfig.json'),
        stringifyConfig({
          compilerOptions: {
            module: 'ESNext',
            moduleResolution: 'bundler',
            target: 'ES2023',
            types: [],
          },
          include: ['src/**/*.ts'],
        }),
      );

      const result = await execFileAsync(
        process.execPath,
        [cliPath, 'init', '--yes'],
        {
          cwd: rootDir,
          env: {
            ...process.env,
            CI: 'true',
          },
        },
      );

      expect(result.stdout).toContain('limina init');
      expect(result.stdout).toContain('limina init finished');
      expect(
        await readFile(path.join(rootDir, 'limina.config.mjs'), 'utf8'),
      ).toContain('include:');
      expect(
        await readFile(path.join(rootDir, '.gitignore'), 'utf8'),
      ).toContain('.limina/');
    } finally {
      await rm(rootDir, {
        force: true,
        recursive: true,
      });
    }
  }, 30_000);
});
