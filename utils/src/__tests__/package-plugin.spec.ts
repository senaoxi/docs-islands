import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

interface EmittedAsset {
  fileName: string;
  source: string | Uint8Array;
  type: 'asset';
}

interface EmitFileContext {
  emitFile(asset: EmittedAsset): string;
}

interface GenerateBundleHook {
  handler(
    this: EmitFileContext,
    outputOptions?: { dir?: string; file?: string },
  ): Promise<void> | void;
}

async function writeJson(
  filePath: string,
  value: Record<string, unknown>,
): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function assetSourceToString(source: string | Uint8Array): string {
  return typeof source === 'string'
    ? source
    : Buffer.from(source).toString('utf8');
}

describe('createPackageJsonPlugin', () => {
  it('delegates catalog and workspace protocol resolution to pnpm', async () => {
    const workspaceRootDir = await mkdtemp(
      path.join(tmpdir(), 'docs-islands-package-plugin-'),
    );

    try {
      const packageRootDir = path.join(workspaceRootDir, 'packages/main');
      const workspacePackageRootDir = path.join(
        workspaceRootDir,
        'packages/workspace-lib',
      );
      const installedWorkspacePackageRootDir = path.join(
        packageRootDir,
        'node_modules/@fixture/workspace-lib',
      );

      await mkdir(packageRootDir, { recursive: true });
      await mkdir(workspacePackageRootDir, { recursive: true });
      await mkdir(installedWorkspacePackageRootDir, { recursive: true });

      await writeFile(
        path.join(workspaceRootDir, 'pnpm-workspace.yaml'),
        [
          'packages:',
          '  - packages/*',
          'catalog:',
          '  default-catalog-dep: ^2.0.0',
          'catalogs:',
          '  prod:',
          '    named-catalog-dep: ^3.0.0',
          '',
        ].join('\n'),
      );
      await writeJson(path.join(workspacePackageRootDir, 'package.json'), {
        name: '@fixture/workspace-lib',
        version: '2.5.0',
      });
      await writeJson(
        path.join(installedWorkspacePackageRootDir, 'package.json'),
        {
          name: '@fixture/workspace-lib',
          version: '2.5.0',
        },
      );

      const packageJsonPath = path.join(packageRootDir, 'package.json');
      await writeJson(packageJsonPath, {
        name: '@fixture/main',
        version: '1.0.0',
        type: 'module',
        scripts: {
          build: 'noop',
        },
        files: ['dist'],
        imports: {
          '#internal': './src/internal.ts',
        },
        types: './src/index.ts',
        exports: {
          '.': './src/index.ts',
        },
        dependencies: {
          '@fixture/workspace-lib': 'workspace:*',
          'default-catalog-dep': 'catalog:',
          'named-catalog-dep': 'catalog:prod',
          'plain-dep': '^4.0.0',
        },
        devDependencies: {
          'removed-dev': '^1.0.0',
        },
      });

      const { createPackageJsonPlugin } = await import('../package-plugin');
      const plugin = createPackageJsonPlugin({
        packageJsonPath,
        rewriteTypes: true,
      });
      const emittedAssets: EmittedAsset[] = [];
      const generateBundle = plugin.generateBundle as GenerateBundleHook;

      await generateBundle.handler.call({
        emitFile(asset) {
          emittedAssets.push(asset);
          return asset.fileName;
        },
      });

      const packageAsset = emittedAssets.find(
        (asset) => asset.fileName === 'package.json',
      );
      expect(packageAsset).toBeDefined();
      const packageAssetSource = assetSourceToString(packageAsset!.source);
      expect(packageAssetSource).not.toContain('catalog:');
      expect(packageAssetSource).not.toContain('workspace:');

      const emittedPackageJson = JSON.parse(packageAssetSource) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        exports?: Record<string, string>;
        files?: string[];
        imports?: Record<string, string>;
        scripts?: Record<string, string>;
        types?: string;
      };

      expect(emittedPackageJson.dependencies).toEqual({
        '@fixture/workspace-lib': '2.5.0',
        'default-catalog-dep': '^2.0.0',
        'named-catalog-dep': '^3.0.0',
        'plain-dep': '^4.0.0',
      });
      expect(emittedPackageJson.devDependencies).toBeUndefined();
      expect(emittedPackageJson.scripts).toBeUndefined();
      expect(emittedPackageJson.files).toBeUndefined();
      expect(emittedPackageJson.imports).toBeUndefined();
      expect(emittedPackageJson.exports).toEqual({
        '.': './index.js',
      });
      expect(emittedPackageJson.types).toBe('./index.d.ts');
    } finally {
      await rm(workspaceRootDir, { force: true, recursive: true });
      vi.resetModules();
    }
  });

  it('emits assets declared by the package files field', async () => {
    const workspaceRootDir = await mkdtemp(
      path.join(tmpdir(), 'docs-islands-package-plugin-'),
    );

    try {
      const packageRootDir = path.join(workspaceRootDir, 'packages/main');
      await mkdir(path.join(packageRootDir, 'assets/nested'), {
        recursive: true,
      });

      await writeFile(
        path.join(workspaceRootDir, 'pnpm-workspace.yaml'),
        ['packages:', '  - packages/*', ''].join('\n'),
      );

      await writeFile(path.join(packageRootDir, 'README.md'), 'English readme');
      await writeFile(
        path.join(packageRootDir, 'README.zh-CN.md'),
        'Chinese readme',
      );
      await writeFile(path.join(packageRootDir, 'LICENSE.md'), 'MIT');
      await writeFile(
        path.join(packageRootDir, 'assets/nested/info.txt'),
        'asset info',
      );
      await writeFile(path.join(packageRootDir, 'ignored.md'), 'ignored');

      const packageJsonPath = path.join(packageRootDir, 'package.json');
      await writeJson(packageJsonPath, {
        name: '@fixture/main',
        version: '1.0.0',
        type: 'module',
        files: [
          'README.md',
          'README.zh-CN.md',
          'LICENSE.md',
          'assets',
          'ignored.md',
          '!ignored.md',
        ],
        exports: {
          '.': './src/index.ts',
        },
      });

      const { createPackageJsonPlugin } = await import('../package-plugin');
      const plugin = createPackageJsonPlugin({
        packageJsonPath,
      });
      const emittedAssets: EmittedAsset[] = [];
      const generateBundle = plugin.generateBundle as GenerateBundleHook;

      await generateBundle.handler.call(
        {
          emitFile(asset) {
            emittedAssets.push(asset);
            return asset.fileName;
          },
        },
        { dir: 'dist' },
      );

      expect(emittedAssets.map((asset) => asset.fileName).sort()).toEqual([
        'LICENSE.md',
        'README.md',
        'README.zh-CN.md',
        'assets/nested/info.txt',
        'package.json',
      ]);
      expect(
        assetSourceToString(
          emittedAssets.find((asset) => asset.fileName === 'README.md')!.source,
        ),
      ).toBe('English readme');

      const packageAsset = emittedAssets.find(
        (asset) => asset.fileName === 'package.json',
      );
      expect(packageAsset).toBeDefined();
      const emittedPackageJson = JSON.parse(
        assetSourceToString(packageAsset!.source),
      ) as {
        files?: string[];
      };
      expect(emittedPackageJson.files).toBeUndefined();
    } finally {
      await rm(workspaceRootDir, { force: true, recursive: true });
      vi.resetModules();
    }
  });
});
