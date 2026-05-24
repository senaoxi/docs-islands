import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'rolldown';
import packageJson from './package.json' with { type: 'json' };

type DependencyMap = Record<string, string>;
type CatalogMap = Record<string, DependencyMap>;
type ExportValue = string | Record<string, string>;
type PackageJson = Omit<
  Partial<typeof packageJson>,
  | 'dependencies'
  | 'devDependencies'
  | 'exports'
  | 'optionalDependencies'
  | 'peerDependencies'
> & {
  dependencies?: DependencyMap;
  devDependencies?: DependencyMap;
  exports?: Record<string, ExportValue>;
  optionalDependencies?: DependencyMap;
  peerDependencies?: DependencyMap;
};

const RESOLVABLE_VERSION_PROTOCOL_PREFIXES = [
  'workspace:',
  'catalog:',
] as const;
const NON_PUBLISHABLE_VERSION_PROTOCOL_PREFIXES = [
  'link:',
  'file:',
  'portal:',
  'patch:',
] as const;
const packageRootDir = fileURLToPath(new URL('.', import.meta.url));
const workspaceConfigPath = fileURLToPath(
  new URL('../../pnpm-workspace.yaml', import.meta.url),
);
const installedPackageVersionCache = new Map<string, string>();

function stripYamlQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseCatalogs(source: string): CatalogMap {
  const catalogs: CatalogMap = {};
  const lines = source.split(/\r?\n/u);
  let isInsideCatalogsSection = false;
  let currentCatalogName: string | undefined;

  for (const rawLine of lines) {
    const line = rawLine.replaceAll('\t', '    ');
    const trimmedLine = line.trim();

    if (!isInsideCatalogsSection) {
      if (trimmedLine === 'catalogs:') {
        isInsideCatalogsSection = true;
      }
      continue;
    }

    if (trimmedLine.length === 0 || trimmedLine.startsWith('#')) {
      continue;
    }

    const indent = line.length - line.trimStart().length;
    if (indent === 0) {
      break;
    }

    if (indent === 2 && trimmedLine.endsWith(':')) {
      currentCatalogName = trimmedLine.slice(0, -1);
      catalogs[currentCatalogName] = {};
      continue;
    }

    if (indent !== 4 || !currentCatalogName) {
      continue;
    }

    const separatorIndex = trimmedLine.indexOf(':');
    if (separatorIndex === -1) {
      continue;
    }

    const packageName = stripYamlQuotes(
      trimmedLine.slice(0, separatorIndex).trim(),
    );
    const versionRange = stripYamlQuotes(
      trimmedLine.slice(separatorIndex + 1).trim(),
    );

    if (packageName.length > 0 && versionRange.length > 0) {
      catalogs[currentCatalogName][packageName] = versionRange;
    }
  }

  return catalogs;
}

const workspaceCatalogs = parseCatalogs(
  readFileSync(workspaceConfigPath, 'utf8'),
);

function resolveInstalledPackageVersion(packageName: string): string {
  const cachedVersion = installedPackageVersionCache.get(packageName);
  if (cachedVersion) {
    return cachedVersion;
  }

  const manifestPath = path.resolve(
    packageRootDir,
    'node_modules',
    ...packageName.split('/'),
    'package.json',
  );

  if (!existsSync(manifestPath)) {
    throw new Error(
      `Unable to resolve installed version for "${packageName}" from ${manifestPath}`,
    );
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    version?: string;
  };
  if (!manifest.version) {
    throw new Error(
      `Installed manifest for "${packageName}" is missing a version field`,
    );
  }

  installedPackageVersionCache.set(packageName, manifest.version);
  return manifest.version;
}

function resolveWorkspaceProtocolVersion(
  packageName: string,
  versionRange: string,
): string {
  const publishedVersion = resolveInstalledPackageVersion(packageName);
  const workspaceRange = versionRange.slice('workspace:'.length);

  if (
    workspaceRange.length === 0 ||
    workspaceRange === '*' ||
    workspaceRange.startsWith('./') ||
    workspaceRange.startsWith('../') ||
    workspaceRange.startsWith('/')
  ) {
    return publishedVersion;
  }

  if (workspaceRange === '^' || workspaceRange === '~') {
    return `${workspaceRange}${publishedVersion}`;
  }

  return workspaceRange;
}

function resolveCatalogProtocolVersion(
  packageName: string,
  versionRange: string,
): string {
  const catalogName = versionRange.slice('catalog:'.length);
  const catalog = workspaceCatalogs[catalogName];
  const resolvedVersion = catalog?.[packageName];

  if (!resolvedVersion) {
    throw new Error(
      `Unable to resolve catalog version for "${packageName}" from catalog "${catalogName}"`,
    );
  }

  return resolvedVersion;
}

function resolvePublishedVersionRange(
  packageName: string,
  versionRange: string,
): string {
  if (versionRange.startsWith('workspace:')) {
    return resolveWorkspaceProtocolVersion(packageName, versionRange);
  }

  if (versionRange.startsWith('catalog:')) {
    return resolveCatalogProtocolVersion(packageName, versionRange);
  }

  return versionRange;
}

function sanitizeDependencyMap(
  dependencies: DependencyMap | undefined,
): DependencyMap | undefined {
  if (!dependencies || typeof dependencies !== 'object') {
    return undefined;
  }

  const resolvedEntries = Object.entries(dependencies).map(
    ([packageName, versionRange]) => {
      const hasNonPublishableProtocol =
        NON_PUBLISHABLE_VERSION_PROTOCOL_PREFIXES.some((prefix) =>
          versionRange.startsWith(prefix),
        );

      if (hasNonPublishableProtocol) {
        throw new Error(
          `Unsupported dependency protocol in published manifest: ${packageName}@${versionRange}`,
        );
      }

      const hasResolvableProtocol = RESOLVABLE_VERSION_PROTOCOL_PREFIXES.some(
        (prefix) => versionRange.startsWith(prefix),
      );

      if (!hasResolvableProtocol) {
        return [packageName, versionRange];
      }

      return [
        packageName,
        resolvePublishedVersionRange(packageName, versionRange),
      ];
    },
  );

  if (resolvedEntries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(resolvedEntries);
}

function rewriteExportPath(value: string, exportCondition?: string): string {
  if (value.includes('dist/')) {
    return value.replace('dist/', '');
  }

  if (!value.includes('src/') || !value.endsWith('.ts')) {
    return value;
  }

  const rewrittenValue = value.replace('src/', '');
  if (exportCondition === 'types' || rewrittenValue.includes('types')) {
    return rewrittenValue.replace('.ts', '.d.ts');
  }

  return rewrittenValue.replace('.ts', '.js');
}

function rewriteTypesPath(value: string | undefined): string | undefined {
  if (!value) {
    return value;
  }

  return rewriteExportPath(value, 'types');
}

function rewriteExports(
  exportsField: Record<string, unknown> | undefined,
): Record<string, ExportValue> | undefined {
  if (!exportsField || typeof exportsField !== 'object') {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(exportsField).map(([key, value]): [string, ExportValue] => {
      if (typeof value === 'string') {
        return [key, rewriteExportPath(value)];
      }

      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return [
          key,
          Object.fromEntries(
            Object.entries(value).map(([condition, conditionValue]) => [
              condition,
              typeof conditionValue === 'string'
                ? rewriteExportPath(conditionValue, condition)
                : conditionValue,
            ]),
          ) as Record<string, string>,
        ];
      }

      return [key, value as ExportValue];
    }),
  );
}

export default function generatePackageJson(): Plugin {
  return {
    name: 'rolldown-plugin-generate-package-json',
    generateBundle: {
      order: 'post',
      handler() {
        const packageJsonObject: PackageJson = { ...packageJson };
        delete packageJsonObject.scripts;
        delete packageJsonObject.devDependencies;
        delete packageJsonObject.files;

        packageJsonObject.types = rewriteTypesPath(packageJsonObject.types);
        packageJsonObject.exports = rewriteExports(packageJson.exports);

        const sanitizedDependencies = sanitizeDependencyMap(
          packageJsonObject.dependencies,
        );
        if (sanitizedDependencies) {
          packageJsonObject.dependencies = sanitizedDependencies;
        } else {
          delete packageJsonObject.dependencies;
        }

        const sanitizedPeerDependencies = sanitizeDependencyMap(
          packageJsonObject.peerDependencies,
        );
        if (sanitizedPeerDependencies) {
          packageJsonObject.peerDependencies = sanitizedPeerDependencies;
        } else {
          delete packageJsonObject.peerDependencies;
        }

        const sanitizedOptionalDependencies = sanitizeDependencyMap(
          packageJsonObject.optionalDependencies,
        );
        if (sanitizedOptionalDependencies) {
          packageJsonObject.optionalDependencies =
            sanitizedOptionalDependencies;
        } else {
          delete packageJsonObject.optionalDependencies;
        }

        this.emitFile({
          type: 'asset',
          source: JSON.stringify(packageJsonObject, null, 2),
          fileName: 'package.json',
        });
      },
    },
  };
}
