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
  preset: BuiltinCheckerPreset;
  supportedExecutions: CheckerExecutionKind[];
}

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
    preset: 'tsc',
    supportedExecutions: ['typecheck', 'build'],
  },
  'vue-tsc': {
    createCommandTarget: createVueTscCommandTarget,
    defaultExtensions: ['.vue'],
    graph: false,
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
