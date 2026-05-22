import { createRequire } from 'node:module';
import path from 'node:path';
import type {
  BuiltinCheckerPreset,
  CheckerConfig,
  CheckerExecutionKind,
  CheckerPreset,
  ResolvedCheckerConfig,
} from './config';
import { toRelativePath } from './utils/path';

export interface CheckerCommandTarget {
  args: string[];
  command: string;
  label: string;
}

export interface CheckerCommandTargetOptions {
  checker: ResolvedCheckerConfig;
  commandOverride?: string;
  configPath: string;
  executionKind: CheckerExecutionKind;
  projectRootDir: string;
}

export interface CheckerAdapter {
  createCommandTarget: (
    options: CheckerCommandTargetOptions,
  ) => CheckerCommandTarget;
  defaultExtensions?: string[];
  graph: boolean;
  packageName: string;
  preset: BuiltinCheckerPreset;
  supportedExecutions: CheckerExecutionKind[];
}

export interface MissingCheckerPeerDependency {
  checkerNames: string[];
  packageName: string;
}

export type CheckerPackageResolver = (options: {
  packageName: string;
  projectRootDir: string;
}) => string | undefined;

function createTscCommandTarget(
  options: CheckerCommandTargetOptions,
): CheckerCommandTarget {
  const relativeConfigPath = toRelativePath(
    options.projectRootDir,
    options.configPath,
  );

  return {
    args:
      options.executionKind === 'build'
        ? ['-b', relativeConfigPath, '--pretty', 'false']
        : ['-p', relativeConfigPath, '--noEmit'],
    command: options.commandOverride ?? 'tsc',
    label:
      options.executionKind === 'build'
        ? `tsc -b ${relativeConfigPath}`
        : `tsc: ${relativeConfigPath}`,
  };
}

function createVueTscCommandTarget(
  options: CheckerCommandTargetOptions,
): CheckerCommandTarget {
  const relativeConfigPath = toRelativePath(
    options.projectRootDir,
    options.configPath,
  );

  return {
    args:
      options.executionKind === 'build'
        ? ['-b', relativeConfigPath, '--pretty', 'false']
        : ['-p', relativeConfigPath, '--noEmit'],
    command: 'vue-tsc',
    label:
      options.executionKind === 'build'
        ? `${options.checker.name}: vue-tsc -b ${relativeConfigPath}`
        : `${options.checker.name}: vue-tsc -p ${relativeConfigPath}`,
  };
}

function createSvelteCheckCommandTarget(
  options: CheckerCommandTargetOptions,
): CheckerCommandTarget {
  if (options.executionKind === 'build') {
    throw new Error(
      `Checker "${options.checker.name}" uses svelte-check, which does not support checker:build.`,
    );
  }

  const relativeConfigPath = toRelativePath(
    options.projectRootDir,
    options.configPath,
  );

  return {
    args: ['--tsconfig', relativeConfigPath],
    command: 'svelte-check',
    label: `${options.checker.name}: svelte-check --tsconfig ${relativeConfigPath}`,
  };
}

const builtinCheckerAdapters = {
  'svelte-check': {
    createCommandTarget: createSvelteCheckCommandTarget,
    defaultExtensions: ['.svelte'],
    graph: false,
    packageName: 'svelte-check',
    preset: 'svelte-check',
    supportedExecutions: ['typecheck'],
  },
  tsc: {
    createCommandTarget: createTscCommandTarget,
    defaultExtensions: [
      '.ts',
      '.tsx',
      '.cts',
      '.mts',
      '.d.ts',
      '.d.cts',
      '.d.mts',
      '.json',
    ],
    graph: true,
    packageName: 'typescript',
    preset: 'tsc',
    supportedExecutions: ['typecheck', 'build'],
  },
  'vue-tsc': {
    createCommandTarget: createVueTscCommandTarget,
    defaultExtensions: ['.vue'],
    graph: false,
    packageName: 'vue-tsc',
    preset: 'vue-tsc',
    supportedExecutions: ['typecheck', 'build'],
  },
} satisfies Record<BuiltinCheckerPreset, CheckerAdapter>;

export function isBuiltinCheckerPreset(
  value: string,
): value is BuiltinCheckerPreset {
  return Object.hasOwn(builtinCheckerAdapters, value);
}

export function getCheckerAdapter(
  preset: CheckerPreset,
): CheckerAdapter | null {
  return isBuiltinCheckerPreset(preset) ? builtinCheckerAdapters[preset] : null;
}

export function resolveCheckerPackageFromRoot(options: {
  packageName: string;
  projectRootDir: string;
}): string | undefined {
  const requireFromRoot = createRequire(
    path.join(options.projectRootDir, 'package.json'),
  );

  try {
    return requireFromRoot.resolve(`${options.packageName}/package.json`);
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED'
    ) {
      return options.packageName;
    }

    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'MODULE_NOT_FOUND'
    ) {
      return undefined;
    }

    throw error;
  }
}

export function collectMissingCheckerPeerDependencies(options: {
  checkers: ResolvedCheckerConfig[];
  projectRootDir: string;
  resolvePackage?: CheckerPackageResolver;
}): MissingCheckerPeerDependency[] {
  const resolvePackage =
    options.resolvePackage ?? resolveCheckerPackageFromRoot;
  const missingCheckersByPackage = new Map<string, Set<string>>();

  for (const checker of options.checkers) {
    const packageName = getCheckerAdapter(checker.preset)?.packageName;

    if (!packageName) {
      continue;
    }

    if (
      resolvePackage({
        packageName,
        projectRootDir: options.projectRootDir,
      })
    ) {
      continue;
    }

    const checkerNames =
      missingCheckersByPackage.get(packageName) ?? new Set<string>();

    checkerNames.add(checker.name);
    missingCheckersByPackage.set(packageName, checkerNames);
  }

  return [...missingCheckersByPackage.entries()]
    .map(([packageName, checkerNames]) => ({
      checkerNames: [...checkerNames].sort((left, right) =>
        left.localeCompare(right),
      ),
      packageName,
    }))
    .sort((left, right) => left.packageName.localeCompare(right.packageName));
}

export function formatMissingCheckerPeerDependencies(
  missingDependencies: MissingCheckerPeerDependency[],
): string {
  const packageNames = missingDependencies.map(
    (dependency) => dependency.packageName,
  );

  return [
    'Missing checker peer dependencies:',
    ...missingDependencies.map((dependency) => {
      const checkerList = dependency.checkerNames
        .map((checkerName) => `"${checkerName}"`)
        .join(', ');

      return `  - ${dependency.packageName} (used by checker ${checkerList})`;
    }),
    `Fix: pnpm add -D ${packageNames.join(' ')}`,
  ].join('\n');
}

export function getCheckerExtensions(checker: CheckerConfig): string[] {
  if (checker.extensions) {
    return normalizeExtensions(checker.extensions);
  }

  const adapter = getCheckerAdapter(checker.preset);

  if (adapter?.defaultExtensions) {
    return normalizeExtensions(adapter.defaultExtensions);
  }

  throw new Error(
    `Checker preset "${checker.preset}" must declare non-empty extensions because it is not a built-in preset.`,
  );
}

export function getResolvedCheckers(config: {
  config?: { checkers?: Record<string, CheckerConfig> };
}): ResolvedCheckerConfig[] {
  const checkers = config.config?.checkers;

  if (!checkers) {
    return [];
  }

  return Object.entries(checkers)
    .map(([name, checker]) => ({
      entry: checker.entry.trim(),
      extensions: getCheckerExtensions(checker),
      name,
      preset: checker.preset,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function normalizeExtensions(extensions: string[]): string[] {
  return [...new Set(extensions)].sort((left, right) => {
    const lengthDelta = right.length - left.length;

    return lengthDelta === 0 ? left.localeCompare(right) : lengthDelta;
  });
}
