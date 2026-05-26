import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'rolldown';
import { findMonorepoRoot } from './path';

export type DependencyMap = Record<string, string>;
export type CatalogMap = Record<string, DependencyMap>;
export type ExportValue = string | Record<string, unknown>;
export type PackageJsonObject = Record<string, unknown> & {
  dependencies?: DependencyMap;
  devDependencies?: DependencyMap;
  exports?: Record<string, ExportValue>;
  files?: string[];
  imports?: Record<string, string>;
  optionalDependencies?: DependencyMap;
  peerDependencies?: DependencyMap;
  types?: string;
};
export type DependencyFieldName =
  | 'dependencies'
  | 'devDependencies'
  | 'optionalDependencies'
  | 'peerDependencies';

export interface DependencyResolutionOptions {
  allowInternal?: boolean;
  dropUnsupportedProtocols?: boolean;
  internalScopes?: readonly string[];
}

export interface PackageJsonPluginContext {
  packageRootDir: string;
  workspaceConfigPath: string;
  resolvePublishedVersionRange: (
    packageName: string,
    versionRange: string,
  ) => string;
  sanitizeDependencyMap: (
    dependencies: DependencyMap | undefined,
    options?: DependencyResolutionOptions,
  ) => DependencyMap | undefined;
}

export interface ExportPathRewriteArgs {
  condition?: string;
  context: PackageJsonPluginContext;
  key: string;
  value: string;
}

export interface PackageExportsRewriteArgs {
  context: PackageJsonPluginContext;
  exportsField: Record<string, unknown> | undefined;
  rewriteExportPath: (args: ExportPathRewriteArgs) => string;
}

export type PackageExportsRewriter = (
  args: PackageExportsRewriteArgs,
) => Record<string, ExportValue> | undefined;

export interface EmittedPackageAsset {
  fileName: string;
  sourcePath: string;
  transform?: (source: string) => string;
}

export interface CreatePackageJsonPluginOptions {
  dependencyFields?: Partial<
    Record<DependencyFieldName, DependencyResolutionOptions | false>
  >;
  emitAssets?: readonly EmittedPackageAsset[];
  exports?: PackageExportsRewriter | false;
  packageJsonPath: string;
  pluginName?: string;
  rewriteTypes?: boolean;
  transformPackageJson?: (
    packageJson: PackageJsonObject,
    context: PackageJsonPluginContext,
  ) => void;
}

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
const INTERNAL_SCOPES = ['@docs-islands/'] as const;
const DEFAULT_REMOVE_FIELDS = ['scripts', 'files', 'imports'] as const;
const DEFAULT_DEPENDENCY_FIELDS = {
  dependencies: {},
  devDependencies: false,
  optionalDependencies: {},
  peerDependencies: {},
} as const satisfies Partial<
  Record<DependencyFieldName, DependencyResolutionOptions | false>
>;

const installedPackageVersionCache = new Map<string, string>();
const workspaceCatalogCache = new Map<string, CatalogMap>();

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

function loadWorkspaceCatalogs(workspaceConfigPath: string): CatalogMap {
  const cachedCatalogs = workspaceCatalogCache.get(workspaceConfigPath);
  if (cachedCatalogs) {
    return cachedCatalogs;
  }

  const catalogs = parseCatalogs(readFileSync(workspaceConfigPath, 'utf8'));
  workspaceCatalogCache.set(workspaceConfigPath, catalogs);
  return catalogs;
}

function resolveInstalledPackageVersion(
  packageRootDir: string,
  packageName: string,
): string {
  const cacheKey = `${packageRootDir}\0${packageName}`;
  const cachedVersion = installedPackageVersionCache.get(cacheKey);
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

  installedPackageVersionCache.set(cacheKey, manifest.version);
  return manifest.version;
}

function createPluginContext(
  packageRootDir: string,
  workspaceConfigPath: string,
): PackageJsonPluginContext {
  const resolveWorkspaceProtocolVersion = (
    packageName: string,
    versionRange: string,
  ): string => {
    const publishedVersion = resolveInstalledPackageVersion(
      packageRootDir,
      packageName,
    );
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
  };

  const resolveCatalogProtocolVersion = (
    packageName: string,
    versionRange: string,
  ): string => {
    const catalogName = versionRange.slice('catalog:'.length);
    const catalog = loadWorkspaceCatalogs(workspaceConfigPath)[catalogName];
    const resolvedVersion = catalog?.[packageName];

    if (!resolvedVersion) {
      throw new Error(
        `Unable to resolve catalog version for "${packageName}" from catalog "${catalogName}"`,
      );
    }

    return resolvedVersion;
  };

  const resolvePublishedVersionRange = (
    packageName: string,
    versionRange: string,
  ): string => {
    if (versionRange.startsWith('workspace:')) {
      return resolveWorkspaceProtocolVersion(packageName, versionRange);
    }

    if (versionRange.startsWith('catalog:')) {
      return resolveCatalogProtocolVersion(packageName, versionRange);
    }

    return versionRange;
  };

  const sanitizeDependencyMap = (
    dependencies: DependencyMap | undefined,
    options: DependencyResolutionOptions = {},
  ): DependencyMap | undefined => {
    if (!dependencies || typeof dependencies !== 'object') {
      return undefined;
    }

    const {
      allowInternal = true,
      dropUnsupportedProtocols = false,
      internalScopes = INTERNAL_SCOPES,
    } = options;
    const resolvedEntries = Object.entries(dependencies).flatMap(
      ([packageName, versionRange]) => {
        const isInternal = internalScopes.some((scope) =>
          packageName.startsWith(scope),
        );

        if (!allowInternal && isInternal) {
          return [];
        }

        const hasNonPublishableProtocol =
          NON_PUBLISHABLE_VERSION_PROTOCOL_PREFIXES.some((prefix) =>
            versionRange.startsWith(prefix),
          );

        if (hasNonPublishableProtocol) {
          if (dropUnsupportedProtocols) {
            return [];
          }

          throw new Error(
            `Unsupported dependency protocol in published manifest: ${packageName}@${versionRange}`,
          );
        }

        const hasResolvableProtocol = RESOLVABLE_VERSION_PROTOCOL_PREFIXES.some(
          (prefix) => versionRange.startsWith(prefix),
        );

        if (!hasResolvableProtocol) {
          return [[packageName, versionRange]];
        }

        return [
          [
            packageName,
            resolvePublishedVersionRange(packageName, versionRange),
          ],
        ];
      },
    );

    if (resolvedEntries.length === 0) {
      return undefined;
    }

    return Object.fromEntries(resolvedEntries);
  };

  return {
    packageRootDir,
    resolvePublishedVersionRange,
    sanitizeDependencyMap,
    workspaceConfigPath,
  };
}

export function defaultRewriteExportPath({
  condition,
  value,
}: ExportPathRewriteArgs): string {
  if (value.includes('dist/')) {
    return value.replace('dist/', '');
  }

  if (!value.includes('src/') || !value.endsWith('.ts')) {
    return value;
  }

  const rewrittenValue = value.replace('src/', '');
  if (condition === 'types' || rewrittenValue.includes('types')) {
    return rewrittenValue.replace('.ts', '.d.ts');
  }

  return rewrittenValue.replace('.ts', '.js');
}

function rewriteTypesPath(
  value: string | undefined,
  context: PackageJsonPluginContext,
): string | undefined {
  if (!value) {
    return value;
  }

  return defaultRewriteExportPath({
    condition: 'types',
    context,
    key: '.',
    value,
  });
}

export function defaultRewritePackageExports({
  context,
  exportsField,
  rewriteExportPath,
}: PackageExportsRewriteArgs): Record<string, ExportValue> | undefined {
  if (
    !exportsField ||
    typeof exportsField !== 'object' ||
    Array.isArray(exportsField)
  ) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(exportsField).map(([key, value]): [string, ExportValue] => {
      if (typeof value === 'string') {
        return [
          key,
          rewriteExportPath({
            context,
            key,
            value,
          }),
        ];
      }

      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return [
          key,
          Object.fromEntries(
            Object.entries(value).map(([condition, conditionValue]) => [
              condition,
              typeof conditionValue === 'string'
                ? rewriteExportPath({
                    condition,
                    context,
                    key,
                    value: conditionValue,
                  })
                : conditionValue,
            ]),
          ),
        ];
      }

      return [key, value as ExportValue];
    }),
  );
}

function sanitizeDependencyFields(
  packageJson: PackageJsonObject,
  context: PackageJsonPluginContext,
  dependencyFields: Partial<
    Record<DependencyFieldName, DependencyResolutionOptions | false>
  >,
): void {
  for (const [fieldName, options] of Object.entries(dependencyFields) as [
    DependencyFieldName,
    DependencyResolutionOptions | false,
  ][]) {
    if (options === false) {
      delete packageJson[fieldName];
      continue;
    }

    const sanitizedDependencies = context.sanitizeDependencyMap(
      packageJson[fieldName],
      options,
    );
    if (sanitizedDependencies) {
      packageJson[fieldName] = sanitizedDependencies;
    } else {
      delete packageJson[fieldName];
    }
  }
}

export function createPackageJsonPlugin(
  options: CreatePackageJsonPluginOptions,
): Plugin {
  const {
    dependencyFields = DEFAULT_DEPENDENCY_FIELDS,
    emitAssets = [],
    exports: packageExportsRewriter = defaultRewritePackageExports,
    packageJsonPath,
    pluginName = 'rolldown-plugin-generate-package-json',
    rewriteTypes: shouldRewriteTypes = false,
    transformPackageJson,
  } = options;

  const packageRootDir = path.dirname(packageJsonPath);
  const packageJson = JSON.parse(
    readFileSync(packageJsonPath, 'utf8'),
  ) as PackageJsonObject;
  const workspaceRootDir = findMonorepoRoot(packageRootDir);
  if (!workspaceRootDir) {
    throw new Error(
      `Unable to resolve workspace root from package manifest: ${packageJsonPath}`,
    );
  }

  const workspaceConfigPath = path.join(
    workspaceRootDir,
    'pnpm-workspace.yaml',
  );
  if (!existsSync(workspaceConfigPath)) {
    throw new Error(
      `Unable to resolve pnpm workspace config from workspace root: ${workspaceRootDir}`,
    );
  }

  const context = createPluginContext(packageRootDir, workspaceConfigPath);

  return {
    name: pluginName,
    generateBundle: {
      order: 'post',
      handler() {
        const packageJsonObject: PackageJsonObject = {
          ...packageJson,
        };

        for (const fieldName of DEFAULT_REMOVE_FIELDS) {
          delete packageJsonObject[fieldName];
        }

        if (shouldRewriteTypes) {
          packageJsonObject.types = rewriteTypesPath(
            packageJsonObject.types,
            context,
          );
        }

        if (packageExportsRewriter !== false) {
          packageJsonObject.exports = packageExportsRewriter({
            context,
            exportsField: packageJson.exports,
            rewriteExportPath: defaultRewriteExportPath,
          });
        }

        sanitizeDependencyFields(packageJsonObject, context, dependencyFields);
        transformPackageJson?.(packageJsonObject, context);

        this.emitFile({
          type: 'asset',
          source: JSON.stringify(packageJsonObject, null, 2),
          fileName: 'package.json',
        });

        for (const asset of emitAssets) {
          const source = readFileSync(asset.sourcePath, 'utf8');
          this.emitFile({
            type: 'asset',
            source: asset.transform ? asset.transform(source) : source,
            fileName: asset.fileName,
          });
        }
      },
    },
  };
}
