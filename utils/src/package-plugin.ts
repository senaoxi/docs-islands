import type { Catalogs } from '@pnpm/catalogs.types';
import { createExportableManifest } from '@pnpm/exportable-manifest';
import {
  readWorkspaceManifest,
  type WorkspaceManifest,
} from '@pnpm/workspace.read-manifest';
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
const DEPENDENCY_FIELD_NAMES = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
] as const satisfies readonly DependencyFieldName[];

type PnpmProjectManifest = Parameters<typeof createExportableManifest>[1];

function createDependencyResolutionKey(
  packageName: string,
  versionRange: string,
): string {
  return `${packageName}\0${versionRange}`;
}

function createWorkspaceCatalogs(
  workspaceManifest: WorkspaceManifest | undefined,
): Catalogs {
  const catalogs: CatalogMap = {};

  if (workspaceManifest?.catalog) {
    catalogs.default = { ...workspaceManifest.catalog };
  }

  for (const [catalogName, catalog] of Object.entries(
    workspaceManifest?.catalogs ?? {},
  )) {
    catalogs[catalogName] = { ...catalog };
  }

  return catalogs as Catalogs;
}

function filterDependencyMapForPnpmExport(
  dependencies: DependencyMap | undefined,
  options: DependencyResolutionOptions,
): DependencyMap | undefined {
  if (!dependencies || typeof dependencies !== 'object') {
    return undefined;
  }

  const { allowInternal = true, internalScopes = INTERNAL_SCOPES } = options;
  if (allowInternal) {
    return dependencies;
  }

  const resolvedEntries = Object.entries(dependencies).filter(
    ([packageName]) =>
      !internalScopes.some((scope) => packageName.startsWith(scope)),
  );

  if (resolvedEntries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(resolvedEntries);
}

function createPnpmExportInputPackageJson(
  packageJson: PackageJsonObject,
  dependencyFields: Partial<
    Record<DependencyFieldName, DependencyResolutionOptions | false>
  >,
): PackageJsonObject {
  const pnpmExportInputPackageJson: PackageJsonObject = {
    ...packageJson,
  };

  for (const [fieldName, options] of Object.entries(dependencyFields) as [
    DependencyFieldName,
    DependencyResolutionOptions | false,
  ][]) {
    if (options === false) {
      delete pnpmExportInputPackageJson[fieldName];
      continue;
    }

    const filteredDependencies = filterDependencyMapForPnpmExport(
      packageJson[fieldName],
      options,
    );
    if (filteredDependencies) {
      pnpmExportInputPackageJson[fieldName] = filteredDependencies;
    } else {
      delete pnpmExportInputPackageJson[fieldName];
    }
  }

  return pnpmExportInputPackageJson;
}

async function createPnpmExportablePackageJson(
  packageRootDir: string,
  packageJson: PackageJsonObject,
  workspaceRootDir: string,
  dependencyFields: Partial<
    Record<DependencyFieldName, DependencyResolutionOptions | false>
  >,
): Promise<PackageJsonObject> {
  const workspaceManifest = await readWorkspaceManifest(workspaceRootDir);

  return (await createExportableManifest(
    packageRootDir,
    createPnpmExportInputPackageJson(
      packageJson,
      dependencyFields,
    ) as PnpmProjectManifest,
    {
      catalogs: createWorkspaceCatalogs(workspaceManifest),
    },
  )) as PackageJsonObject;
}

function createResolvedVersionRangeMap(
  originalPackageJson: PackageJsonObject,
  resolvedPackageJson: PackageJsonObject,
): Map<string, string> {
  const resolvedVersionRanges = new Map<string, string>();

  for (const fieldName of DEPENDENCY_FIELD_NAMES) {
    const originalDependencies = originalPackageJson[fieldName];
    const resolvedDependencies = resolvedPackageJson[fieldName];
    if (!originalDependencies || !resolvedDependencies) {
      continue;
    }

    for (const [packageName, versionRange] of Object.entries(
      originalDependencies,
    )) {
      const resolvedVersionRange = resolvedDependencies[packageName];
      if (!resolvedVersionRange) {
        continue;
      }

      resolvedVersionRanges.set(
        createDependencyResolutionKey(packageName, versionRange),
        resolvedVersionRange,
      );
    }
  }

  return resolvedVersionRanges;
}

function sanitizeDependencyMap(
  dependencies: DependencyMap | undefined,
  options: DependencyResolutionOptions = {},
): DependencyMap | undefined {
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

      return [[packageName, versionRange]];
    },
  );

  if (resolvedEntries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(resolvedEntries);
}

function createPluginContext(
  packageRootDir: string,
  workspaceConfigPath: string,
  resolvedVersionRanges: ReadonlyMap<string, string>,
): PackageJsonPluginContext {
  const resolvePublishedVersionRange = (
    packageName: string,
    versionRange: string,
  ): string => {
    return (
      resolvedVersionRanges.get(
        createDependencyResolutionKey(packageName, versionRange),
      ) ?? versionRange
    );
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

  return {
    name: pluginName,
    generateBundle: {
      order: 'post',
      async handler() {
        const resolvedPackageJson = await createPnpmExportablePackageJson(
          packageRootDir,
          packageJson,
          workspaceRootDir,
          dependencyFields,
        );
        debugger;
        const context = createPluginContext(
          packageRootDir,
          workspaceConfigPath,
          createResolvedVersionRangeMap(packageJson, resolvedPackageJson),
        );
        const packageJsonObject: PackageJsonObject = {
          ...resolvedPackageJson,
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
            exportsField: packageJsonObject.exports,
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
