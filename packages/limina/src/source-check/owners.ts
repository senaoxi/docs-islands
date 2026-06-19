import { existsSync } from 'node:fs';
import path from 'pathe';
import { isPathInsideDirectory, normalizeAbsolutePath } from '../utils/path';
import {
  type PackageManifest,
  type PackageOwner,
  readJsonFile,
  type WorkspacePackage,
} from '../workspace';

export interface NearestPackageInfo {
  directory: string;
  manifest: PackageManifest;
  name?: string;
  packageJsonPath: string;
}

export type ResolvedPackageTarget =
  | {
      kind: 'current-owner';
      packageInfo: NearestPackageInfo;
    }
  | {
      kind: 'other-owner';
      packageInfo: NearestPackageInfo;
      targetOwner: PackageOwner;
      workspacePackage: WorkspacePackage | null;
    }
  | {
      kind: 'artifact-package';
      packageInfo: NearestPackageInfo;
    }
  | {
      kind: 'unowned';
    };

export function findOwnerForFile(
  filePath: string,
  owners: PackageOwner[],
): PackageOwner | null {
  return (
    owners
      .filter((owner) => isPathInsideDirectory(filePath, owner.directory))
      .sort(
        (left, right) => right.directory.length - left.directory.length,
      )[0] ?? null
  );
}

function getManifestPackageName(manifest: PackageManifest): string | undefined {
  return typeof manifest.name === 'string' && manifest.name.trim().length > 0
    ? manifest.name.trim()
    : undefined;
}

function isNodeModulesPackageRoot(directory: string): boolean {
  const parentDirectory = path.dirname(directory);
  const parentName = path.basename(parentDirectory);

  if (parentName === 'node_modules') {
    return true;
  }

  if (parentName.startsWith('@')) {
    return path.basename(path.dirname(parentDirectory)) === 'node_modules';
  }

  return false;
}

function findNearestPackageInfo(filePath: string): NearestPackageInfo | null {
  const normalizedFilePath = normalizeAbsolutePath(filePath);
  let currentDir = normalizeAbsolutePath(path.dirname(normalizedFilePath));

  while (true) {
    const packageJsonPath = normalizeAbsolutePath(
      path.join(currentDir, 'package.json'),
    );

    if (existsSync(packageJsonPath)) {
      const manifest = readJsonFile<PackageManifest>(packageJsonPath);
      const name = getManifestPackageName(manifest);
      const packageInfo = {
        directory: currentDir,
        manifest,
        name,
        packageJsonPath,
      };

      if (name) {
        return packageInfo;
      }

      // An unnamed manifest at a node_modules package root is the authoritative
      // root for the resolved import; stop here so the caller can reject it
      // rather than escaping into an ancestor package such as the importer.
      if (isNodeModulesPackageRoot(currentDir)) {
        return packageInfo;
      }
    }

    const parentDir = path.dirname(currentDir);

    if (parentDir === currentDir) {
      return null;
    }

    currentDir = parentDir;
  }
}

function findOwnerForPackageInfo(
  packageInfo: NearestPackageInfo,
  owners: PackageOwner[],
): PackageOwner | null {
  return (
    owners.find(
      (owner) => owner.packageJsonPath === packageInfo.packageJsonPath,
    ) ?? null
  );
}

function findWorkspacePackageForPackageInfo(
  packageInfo: NearestPackageInfo,
  packages: WorkspacePackage[],
): WorkspacePackage | null {
  return (
    packages.find((workspacePackage) => {
      const packageJsonPath = normalizeAbsolutePath(
        path.join(workspacePackage.directory, 'package.json'),
      );

      return (
        packageJsonPath === packageInfo.packageJsonPath ||
        (packageInfo.name !== undefined &&
          workspacePackage.name === packageInfo.name)
      );
    }) ?? null
  );
}

export function classifyResolvedPackageTarget(options: {
  owner: PackageOwner;
  owners: PackageOwner[];
  packages: WorkspacePackage[];
  resolvedFilePath: string;
}): ResolvedPackageTarget {
  const packageInfo = findNearestPackageInfo(options.resolvedFilePath);

  if (!packageInfo) {
    return {
      kind: 'unowned',
    };
  }

  if (packageInfo.packageJsonPath === options.owner.packageJsonPath) {
    return {
      kind: 'current-owner',
      packageInfo,
    };
  }

  const targetOwner = findOwnerForPackageInfo(packageInfo, options.owners);

  if (targetOwner) {
    return {
      kind: 'other-owner',
      packageInfo,
      targetOwner,
      workspacePackage: findWorkspacePackageForPackageInfo(
        packageInfo,
        options.packages,
      ),
    };
  }

  return {
    kind: 'artifact-package',
    packageInfo,
  };
}
