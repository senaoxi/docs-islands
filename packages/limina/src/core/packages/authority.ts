import path from 'pathe';

import { isRelativeSpecifier } from '../import-graph/context';
import type { PackageManifest, WorkspacePackage } from '../workspace/actions';

export interface PackageImportMatch {
  key: string;
}

type DependencySectionName =
  | 'dependencies'
  | 'devDependencies'
  | 'peerDependencies'
  | 'optionalDependencies';

interface DependencyDeclaration {
  sectionName: DependencySectionName;
  specifier: string;
}

export interface WorkspaceDependencyDeclaration {
  dependencyName: string;
  importer: WorkspacePackage;
  packageJsonPath: string;
  sectionName: DependencySectionName;
  specifier: string;
}

const dependencySectionNames: DependencySectionName[] = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
];

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function isUrlOrDataOrFileSpecifier(specifier: string): boolean {
  return (
    specifier.startsWith('data:') ||
    specifier.startsWith('file:') ||
    specifier.startsWith('http:') ||
    specifier.startsWith('https:')
  );
}

export function isVirtualModuleSpecifier(specifier: string): boolean {
  return specifier.startsWith('virtual:');
}

export function isPackageImportSpecifier(specifier: string): boolean {
  return specifier.startsWith('#');
}

export function isBarePackageSpecifier(specifier: string): boolean {
  return (
    !isRelativeSpecifier(specifier) &&
    !isPackageImportSpecifier(specifier) &&
    !isUrlOrDataOrFileSpecifier(specifier) &&
    !isVirtualModuleSpecifier(specifier) &&
    !path.isAbsolute(specifier)
  );
}

function collectDependencyDeclarations(
  manifest: PackageManifest,
  packageName: string,
): DependencyDeclaration[] {
  const declarations: DependencyDeclaration[] = [];

  for (const sectionName of dependencySectionNames) {
    const section = manifest[sectionName];

    if (!section || typeof section !== 'object') {
      continue;
    }

    const specifier = section[packageName];

    if (typeof specifier !== 'string') {
      continue;
    }

    declarations.push({
      sectionName,
      specifier,
    });
  }

  return declarations;
}

export function createWorkspaceDependencyKey(
  importerName: string,
  dependencyName: string,
): string {
  return `${importerName}\0${dependencyName}`;
}

function getWorkspacePackageJsonPath(
  workspacePackage: WorkspacePackage,
): string {
  return path.join(workspacePackage.directory, 'package.json');
}

function getDependencySection(
  manifest: PackageManifest,
  sectionName: DependencySectionName,
): Record<string, string> | null {
  const section = manifest[sectionName];

  if (!isPlainRecord(section)) {
    return null;
  }

  return Object.fromEntries(
    Object.entries(section).filter((entry): entry is [string, string] => {
      return typeof entry[1] === 'string';
    }),
  );
}

export function collectWorkspaceDependencyDeclarations(
  workspacePackages: WorkspacePackage[],
): WorkspaceDependencyDeclaration[] {
  const workspacePackageNames = new Set(
    workspacePackages.map((workspacePackage) => workspacePackage.name),
  );
  const declarations: WorkspaceDependencyDeclaration[] = [];

  for (const importer of workspacePackages) {
    for (const sectionName of dependencySectionNames) {
      const section = getDependencySection(importer.manifest, sectionName);

      if (!section) {
        continue;
      }

      for (const [dependencyName, specifier] of Object.entries(section)) {
        if (
          dependencyName === importer.name ||
          !workspacePackageNames.has(dependencyName)
        ) {
          continue;
        }

        declarations.push({
          dependencyName,
          importer,
          packageJsonPath: getWorkspacePackageJsonPath(importer),
          sectionName,
          specifier,
        });
      }
    }
  }

  return declarations.sort((left, right) => {
    if (left.packageJsonPath !== right.packageJsonPath) {
      return left.packageJsonPath.localeCompare(right.packageJsonPath);
    }

    if (left.dependencyName !== right.dependencyName) {
      return left.dependencyName.localeCompare(right.dependencyName);
    }

    return left.sectionName.localeCompare(right.sectionName);
  });
}

export function isDependencyAuthorized(
  manifest: PackageManifest,
  packageName: string,
): boolean {
  return collectDependencyDeclarations(manifest, packageName).length > 0;
}

export function findPackageImportMatch(
  importsField: PackageManifest['imports'],
  specifier: string,
): PackageImportMatch | null {
  if (!importsField || typeof importsField !== 'object') {
    return null;
  }

  for (const key of Object.keys(importsField)) {
    if (key === specifier) {
      return {
        key,
      };
    }

    const wildcardIndex = key.indexOf('*');

    if (wildcardIndex === -1) {
      continue;
    }

    const prefix = key.slice(0, wildcardIndex);
    const suffix = key.slice(wildcardIndex + 1);

    if (specifier.startsWith(prefix) && specifier.endsWith(suffix)) {
      return {
        key,
      };
    }
  }

  return null;
}
