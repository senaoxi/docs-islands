import type rollupReplace from '@rollup/plugin-replace';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import type {
  InputOptions as RolldownInputOptions,
  RolldownPluginOption,
} from 'rolldown';
import type { replacePlugin as rolldownReplace } from 'rolldown/plugins';
import type {
  InputOptions as RollupInputOptions,
  InputPluginOption as RollupInputPluginOption,
} from 'rollup';
import {
  createUnplugin,
  type UnpluginContextMeta,
  type UnpluginFactory,
} from 'unplugin';
import { DEFAULT_LOGGER_CONFIG, setScopedLoggerConfig } from '../core/config';
import { DEFAULT_LOGGER_SCOPE_ID } from '../core/helper/scope';
import type { LoggerConfig } from '../types';
import {
  DEFAULT_LOGGER_MODULE_ID,
  transformLoggerTreeShaking,
} from './transform';

const resolveModuleSpecifier = (
  moduleName: string,
  parentUrl: string,
): string => {
  if (moduleName.startsWith('node:')) {
    return moduleName;
  }

  return pathToFileURL(createRequire(parentUrl).resolve(moduleName)).href;
};

const importWithError = async <T>(
  moduleName: string,
  parentUrl: string = import.meta.url,
): Promise<T> => {
  try {
    return (await import(resolveModuleSpecifier(moduleName, parentUrl))) as T;
  } catch (error) {
    throw new Error(
      `Failed to import module "${moduleName}". Please ensure it is installed.`,
      { cause: error },
    );
  }
};

const LOGGER_PLUGIN_NAME = 'docs-islands:logger';
const ROLLDOWN_REPLACE_PLUGIN_OPTIONS = {
  preventAssignment: true,
};
const ROLLUP_REPLACE_PLUGIN_OPTIONS = {
  preventAssignment: true,
};

export interface LoggerPluginOptions {
  config?: LoggerConfig | null;
  /**
   * Enable build-time tree-shaking of logger calls.
   *
   * When enabled, the plugin removes statically provable logger calls that are hidden by the resolved logger config.
   *
   * Only applies during build mode; has no effect in dev/watch mode.
   *
   * @default false
   */
  treeshake?: boolean;
}

interface ViteUserConfigWithDefine {
  define?: Record<string, unknown>;
}

interface ViteResolvedConfigWithCommand {
  command?: string;
}

interface EsbuildBuildOptionsWithDefine {
  define?: Record<string, string>;
  watch?: unknown;
}

interface FarmUserConfigWithDefine {
  compilation?: {
    define?: Record<string, unknown>;
  };
}

interface DefinePluginLikeCompiler {
  options?: {
    mode?: string;
  };
  watchMode?: boolean;
  webpack?: {
    DefinePlugin?: new (definitions: Record<string, string>) => {
      apply: (compiler: DefinePluginLikeCompiler) => void;
    };
  };
}

interface EsbuildPluginBuildLike {
  initialOptions?: EsbuildBuildOptionsWithDefine;
}

interface FarmCompilationContextLike {
  command?: string;
  config?: {
    command?: string;
    compilation?: {
      mode?: string;
      watch?: unknown;
    };
    mode?: string;
    watch?: unknown;
  };
  isWatch?: boolean;
  mode?: string;
  watch?: unknown;
}

interface LoggerPluginNativeBuildContext {
  build?: EsbuildPluginBuildLike;
  context?: FarmCompilationContextLike;
  compiler?: DefinePluginLikeCompiler;
  framework?: string;
}

interface LoggerPluginTransformContext {
  meta?: {
    watchMode?: boolean;
  };
  getNativeBuildContext?: () => LoggerPluginNativeBuildContext | undefined;
}

const createLoggerPluginDefines = (
  config: LoggerConfig | null | undefined,
): Record<
  | '__DOCS_ISLANDS_DEFAULT_LOGGER_CONTROLLED__'
  | '__DOCS_ISLANDS_DEFAULT_LOGGER_CONFIG__',
  string
> => ({
  __DOCS_ISLANDS_DEFAULT_LOGGER_CONTROLLED__: JSON.stringify(true),
  __DOCS_ISLANDS_DEFAULT_LOGGER_CONFIG__: JSON.stringify(config ?? null),
});

const prependRolldownPlugin = (
  plugins: RolldownInputOptions['plugins'],
  plugin: RolldownPluginOption,
): RolldownInputOptions['plugins'] => [
  plugin,
  ...(plugins === undefined ? [] : [plugins]),
];

const prependRollupPlugin = (
  plugins: RollupInputOptions['plugins'],
  plugin: RollupInputPluginOption,
): RollupInputOptions['plugins'] => [
  plugin,
  ...(plugins === undefined ? [] : [plugins]),
];

const createRollupOptionsHook =
  (defines: Record<string, string>) =>
  async (options: RollupInputOptions): Promise<RollupInputOptions> => {
    const { default: replace } = await importWithError<{
      default: typeof rollupReplace;
    }>('@rollup/plugin-replace', import.meta.url);

    return {
      ...options,
      plugins: prependRollupPlugin(
        options.plugins,
        replace({
          ...ROLLUP_REPLACE_PLUGIN_OPTIONS,
          values: defines,
        }),
      ),
    };
  };

const createRolldownOptionsHook =
  (defines: Record<string, string>) =>
  async (options: RolldownInputOptions): Promise<RolldownInputOptions> => {
    const { replacePlugin } = await importWithError<{
      replacePlugin: typeof rolldownReplace;
    }>('rolldown/plugins', import.meta.url);

    return {
      ...options,
      plugins: prependRolldownPlugin(
        options.plugins,
        replacePlugin(defines, ROLLDOWN_REPLACE_PLUGIN_OPTIONS),
      ),
    };
  };

const readCompilerIsBuild = (
  compiler: DefinePluginLikeCompiler,
  fallback: boolean,
): boolean => {
  if (compiler.watchMode === true) {
    return false;
  }

  return readModeIsBuild(compiler.options?.mode, fallback);
};

const readModeIsBuild = (
  mode: string | null | undefined,
  fallback: boolean,
): boolean => {
  const normalizedMode = mode?.trim().toLowerCase();

  if (
    normalizedMode === 'development' ||
    normalizedMode === 'dev' ||
    normalizedMode === 'serve' ||
    normalizedMode === 'server' ||
    normalizedMode === 'watch'
  ) {
    return false;
  }

  if (
    normalizedMode === 'production' ||
    normalizedMode === 'prod' ||
    normalizedMode === 'build' ||
    normalizedMode === 'none'
  ) {
    return true;
  }

  return fallback;
};

const readWatchIsBuild = (watch: unknown, fallback: boolean): boolean =>
  watch === undefined || watch === null || watch === false ? fallback : false;

const readEsbuildIsBuild = (
  build: EsbuildPluginBuildLike | undefined,
  fallback: boolean,
): boolean => readWatchIsBuild(build?.initialOptions?.watch, fallback);

const readFarmIsBuild = (
  context: FarmCompilationContextLike | undefined,
  fallback: boolean,
): boolean => {
  let isBuild = fallback;

  if (context?.isWatch === true) {
    return false;
  }

  isBuild = readWatchIsBuild(context?.watch, isBuild);
  isBuild = readWatchIsBuild(context?.config?.watch, isBuild);
  isBuild = readWatchIsBuild(context?.config?.compilation?.watch, isBuild);
  isBuild = readModeIsBuild(context?.command, isBuild);
  isBuild = readModeIsBuild(context?.mode, isBuild);
  isBuild = readModeIsBuild(context?.config?.command, isBuild);
  isBuild = readModeIsBuild(context?.config?.mode, isBuild);
  isBuild = readModeIsBuild(context?.config?.compilation?.mode, isBuild);

  return isBuild;
};

const readNativeBuildContextIsBuild = (
  context: LoggerPluginNativeBuildContext | undefined,
  fallback: boolean,
): boolean => {
  if (!context) {
    return fallback;
  }

  if (context.framework === 'webpack' || context.framework === 'rspack') {
    return context.compiler
      ? readCompilerIsBuild(context.compiler, fallback)
      : fallback;
  }

  if (context.framework === 'esbuild') {
    return readEsbuildIsBuild(context.build, fallback);
  }

  if (context.framework === 'farm') {
    return readFarmIsBuild(context.context, fallback);
  }

  return fallback;
};

const readInitialIsBuild = (meta: UnpluginContextMeta): boolean => {
  if (meta.framework === 'vite') {
    return false;
  }

  if (meta.framework === 'webpack') {
    return meta.webpack?.compiler
      ? readCompilerIsBuild(meta.webpack.compiler, true)
      : true;
  }

  if (meta.framework === 'rspack') {
    return meta.rspack?.compiler
      ? readCompilerIsBuild(meta.rspack.compiler, true)
      : true;
  }

  return true;
};

const readTransformIsBuild = (
  context: LoggerPluginTransformContext | undefined,
  fallback: boolean,
): boolean => {
  const nativeBuildContext = context?.getNativeBuildContext?.();
  let isBuild = readNativeBuildContextIsBuild(nativeBuildContext, fallback);

  if (typeof context?.meta?.watchMode === 'boolean') {
    isBuild = !context.meta.watchMode;
  }

  return isBuild;
};

const factory: UnpluginFactory<LoggerPluginOptions | undefined> = (
  options = {},
  meta,
) => {
  const loggerScopeId = DEFAULT_LOGGER_SCOPE_ID;
  const loggerConfig = options.config ?? DEFAULT_LOGGER_CONFIG;
  const defines = createLoggerPluginDefines(loggerConfig);
  const shouldTreeshake = options.treeshake === true;
  let isBuild = readInitialIsBuild(meta);

  setScopedLoggerConfig(loggerScopeId, loggerConfig);

  return {
    name: LOGGER_PLUGIN_NAME,
    enforce: 'post',
    vite: {
      config(config: ViteUserConfigWithDefine) {
        config.define ??= {};
        Object.assign(config.define, defines);
      },
      configResolved(config: ViteResolvedConfigWithCommand) {
        isBuild = config.command === 'build';
      },
    },
    esbuild: {
      config(config: EsbuildBuildOptionsWithDefine) {
        config.define ??= {};
        Object.assign(config.define, defines);
        isBuild = readWatchIsBuild(config.watch, isBuild);
      },
    },
    rollup: {
      options: createRollupOptionsHook(defines),
    },
    rolldown: {
      options: createRolldownOptionsHook(defines),
    },
    farm: {
      config(config: FarmUserConfigWithDefine) {
        config.compilation ??= {};
        config.compilation.define ??= {};
        Object.assign(config.compilation.define, defines);

        return config;
      },
    },
    webpack(compiler: DefinePluginLikeCompiler) {
      const DefinePlugin = compiler.webpack?.DefinePlugin;
      isBuild = readCompilerIsBuild(compiler, isBuild);

      if (!DefinePlugin) {
        return;
      }

      new DefinePlugin(defines).apply(compiler);
    },
    rspack(compiler: DefinePluginLikeCompiler) {
      const DefinePlugin = compiler.webpack?.DefinePlugin;
      isBuild = readCompilerIsBuild(compiler, isBuild);

      if (!DefinePlugin) {
        return;
      }

      new DefinePlugin(defines).apply(compiler);
    },
    async transform(this: LoggerPluginTransformContext, code, id) {
      if (!shouldTreeshake || !readTransformIsBuild(this, isBuild)) {
        return null;
      }

      return transformLoggerTreeShaking(code, id, {
        loggerModuleId: DEFAULT_LOGGER_MODULE_ID,
        loggerScopeId,
      });
    },
  };
};

/**
 * Universal bundler plugin for logger configuration and optimization.
 *
 * This plugin integrates with multiple build systems (Vite, Webpack, Rollup, esbuild, Rolldown, Farm, rspack)
 * to:
 *
 * 1. **Inject logger configuration** - Embeds the resolved logger config as compile-time constants,
 *    enabling build-time optimization and controlling which logs are shown at runtime
 * 2. **Perform tree-shaking** (when enabled) - Removes logger calls that would be suppressed by the
 *    current configuration, reducing bundle size and improving performance
 *
 * The plugin automatically detects the build environment (development vs production) and adjusts
 * tree-shaking behavior accordingly. Tree-shaking only runs during production builds.
 *
 * @param options - Configuration options
 * @param options.config - The logger configuration to use (defaults to DEFAULT_LOGGER_CONFIG)
 * @param options.treeshake - Enable build-time tree-shaking of suppressed logger calls (default: false)
 * @returns A universal plugin compatible with Vite, Webpack, Rollup, and other bundlers
 *
 * @example
 * ```ts
 * // Vite configuration
 * import { loggerPlugin } from '@docs-islands/logger';
 *
 * export default {
 *   plugins: [
 *     loggerPlugin({
 *       config: {
 *         levels: ['error', 'warn'],
 *       },
 *       treeshake: true,
 *     }),
 *   ],
 * };
 * ```
 */
export const loggerPlugin = createUnplugin(factory);

export {
  LOGGER_TREE_SHAKING_PLUGIN_NAME,
  transformLoggerTreeShaking,
} from './transform';
