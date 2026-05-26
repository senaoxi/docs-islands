import {
  createPackageJsonPlugin,
  type ExportPathRewriteArgs,
  type ExportValue,
  type PackageExportsRewriteArgs,
} from '@docs-islands/utils/package-plugin';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'rolldown';

const supportedUIFrameworks = ['react'];

const supportedUIFrameworksNodeEntries = new Map(
  supportedUIFrameworks.map((framework) => [
    `./adapters/${framework}`,
    `./node/adapters/${framework}.js`,
  ]),
);

const supportedUIFrameworksClientEntries = new Map(
  supportedUIFrameworks.map((framework) => [
    `./adapters/${framework}/client`,
    `./client/adapters/${framework}.mjs`,
  ]),
);

const packageJsonPath = fileURLToPath(new URL('package.json', import.meta.url));

const isClientExportKey = (key: string): boolean => {
  return /^\.\/(?:client(?:\/.+)?|adapters\/.+\/client)$/.test(key);
};

const filterExports = (key: string): boolean => {
  if (key.startsWith('./internal-helper')) {
    return true;
  }
  return false;
};

const rewritePublicLoggerExportPath = (
  key: string,
  value: string,
  exportCondition?: string,
): string | undefined => {
  if (key !== './logger' || !value.includes('src/shared/logger.')) {
    return undefined;
  }

  const rewrittenLoggerValue = value.replace(
    'src/shared/logger.',
    'shared/logger.',
  );

  if (
    exportCondition === 'types' &&
    rewrittenLoggerValue.endsWith('.ts') &&
    !rewrittenLoggerValue.endsWith('.d.ts')
  ) {
    return rewrittenLoggerValue.replace('.ts', '.d.ts');
  }

  if (
    rewrittenLoggerValue.endsWith('.d.ts') ||
    !rewrittenLoggerValue.endsWith('.ts')
  ) {
    return rewrittenLoggerValue;
  }

  return rewrittenLoggerValue.replace('.ts', '.js');
};

const rewriteExportPath = ({
  condition,
  key,
  value,
}: ExportPathRewriteArgs): string => {
  const rewrittenPublicLoggerPath = rewritePublicLoggerExportPath(
    key,
    value,
    condition,
  );
  if (rewrittenPublicLoggerPath) {
    return rewrittenPublicLoggerPath;
  }

  if (
    condition === 'types' &&
    value.endsWith('.ts') &&
    !value.endsWith('.d.ts') &&
    !value.endsWith('.d.mts')
  ) {
    const targetExt = isClientExportKey(key) ? '.d.mts' : '.d.ts';
    return value.replace('src/', '').replace('.ts', targetExt);
  }
  if (
    value.includes('src/') &&
    (value.endsWith('.d.mts') || value.endsWith('.d.ts'))
  ) {
    return value.replace('src/', '');
  }
  if (value.endsWith('.d.mts') || value.endsWith('.d.ts')) {
    return value;
  }
  if (value.includes('src/')) {
    const targetExt = isClientExportKey(key) ? '.mjs' : '.js';
    return value.replace('src/', '').replace('.ts', targetExt);
  }
  if (value.includes('theme/')) {
    const targetExt = isClientExportKey(key) ? '.mjs' : '.js';
    return value.replace('.ts', targetExt);
  }
  if (value.endsWith('.ts')) {
    return value.replace('.ts', '.js');
  }
  return value;
};

const rewritePackageExports = ({
  context,
  exportsField,
}: PackageExportsRewriteArgs): Record<string, ExportValue> | undefined => {
  if (
    !exportsField ||
    typeof exportsField !== 'object' ||
    Array.isArray(exportsField)
  ) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(exportsField).flatMap(([key, value]) => {
      if (filterExports(key)) {
        return [];
      }

      if (supportedUIFrameworksNodeEntries.has(key)) {
        return [[key, supportedUIFrameworksNodeEntries.get(key)!]];
      }
      if (supportedUIFrameworksClientEntries.has(key)) {
        return [[key, supportedUIFrameworksClientEntries.get(key)!]];
      }

      if (typeof value === 'string') {
        return [
          [
            key,
            rewriteExportPath({
              context,
              key,
              value,
            }),
          ],
        ];
      }

      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return [
          [
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
          ],
        ];
      }

      return [[key, value as ExportValue]];
    }),
  );
};

export default function generatePackageJson(): Plugin {
  return createPackageJsonPlugin({
    dependencyFields: {
      dependencies: {},
      devDependencies: {
        allowInternal: false,
        dropUnsupportedProtocols: true,
      },
      optionalDependencies: {},
      peerDependencies: {},
    },
    exports: rewritePackageExports,
    packageJsonPath,
  });
}
