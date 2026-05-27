import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

interface EmittedAsset {
  fileName: string;
  source: string;
  type: 'asset';
}

interface EmitFileContext {
  emitFile(asset: EmittedAsset): string;
}

interface GenerateBundleHook {
  handler(this: EmitFileContext): Promise<void> | void;
}

async function writeJson(
  filePath: string,
  value: Record<string, unknown>,
): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
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
      expect(packageAsset!.source).not.toContain('catalog:');
      expect(packageAsset!.source).not.toContain('workspace:');

      const emittedPackageJson = JSON.parse(packageAsset!.source) as {
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
});
