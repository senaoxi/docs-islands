import {
  loggerPlugin,
  type LoggerPluginOptions,
} from '@docs-islands/logger/plugin';
import { build as farmBuild } from '@farmfe/core';
import rspack from '@rspack/core';
import esbuild from 'esbuild';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rolldown } from 'rolldown';
import { rollup, type RollupOutput } from 'rollup';
import { build as viteBuild } from 'vite';
import { webpack } from 'webpack';
import {
  LOGGER_TREE_SHAKING_BOUNDARIES_EXPECTED,
  LOGGER_TREE_SHAKING_DEBUG_ENABLED_EXPECTED,
  LOGGER_TREE_SHAKING_DEFAULT_EXPECTED,
  LOGGER_TREE_SHAKING_DISABLED_EXPECTED,
  LOGGER_TREE_SHAKING_LEVELS_EXPECTED,
  LOGGER_TREE_SHAKING_RULES_EXPECTED,
  type LoggerTreeShakingExpectation,
} from './expected';

const LOGGER_MODULE_ID = '@docs-islands/logger';
const TREE_SHAKING_FIXTURES_ROOT = fileURLToPath(
  new URL('..', import.meta.url),
);

type LoggerTreeShakingBundler =
  | 'esbuild'
  | 'farm'
  | 'rolldown'
  | 'rollup'
  | 'rspack'
  | 'vite'
  | 'webpack';

interface LoggerTreeShakingFixture {
  entry: string;
  expectation: LoggerTreeShakingExpectation;
  name: string;
  options?: LoggerPluginOptions;
}

interface BuildStatsLike {
  hasErrors: () => boolean;
  toJson: (options: { all: false; errors: true }) => {
    errors?: unknown[];
  };
}

interface CompilerLike<TStats extends BuildStatsLike> {
  close: (callback: (error?: Error | null) => void) => void;
  run: (callback: (error?: Error | null, stats?: TStats) => void) => void;
}

export interface LoggerTreeShakingFixtureBuild {
  build: () => Promise<string>;
  bundler: LoggerTreeShakingBundler;
  expectation: LoggerTreeShakingExpectation;
  fixture: string;
}

const createFixtureEntryPath = (fixtureDirectory: string): string =>
  path.join(TREE_SHAKING_FIXTURES_ROOT, fixtureDirectory, 'entry.ts');

const LOGGER_TREE_SHAKING_FIXTURES: LoggerTreeShakingFixture[] = [
  {
    entry: createFixtureEntryPath('tree-shaking-levels'),
    expectation: LOGGER_TREE_SHAKING_LEVELS_EXPECTED,
    name: 'levels',
    options: {
      config: {
        levels: ['warn', 'error'],
      },
    },
  },
  {
    entry: createFixtureEntryPath('tree-shaking-rules'),
    expectation: LOGGER_TREE_SHAKING_RULES_EXPECTED,
    name: 'rules',
    options: {
      config: {
        levels: ['error'],
        rules: {
          'disabled-success': 'off',
          'metrics-warn': {
            group: 'tree_shaking.metrics',
            levels: ['warn'],
            main: '@docs-islands/logger-fixture',
            message: 'fixture rules visible *',
          },
          'api-error': {
            group: 'tree_shaking.api',
            levels: ['error'],
          },
        },
      },
    },
  },
  {
    entry: createFixtureEntryPath('tree-shaking-boundaries'),
    expectation: LOGGER_TREE_SHAKING_BOUNDARIES_EXPECTED,
    name: 'boundaries',
    options: {
      config: {
        levels: ['error'],
      },
    },
  },
  {
    entry: createFixtureEntryPath('tree-shaking-default'),
    expectation: LOGGER_TREE_SHAKING_DEFAULT_EXPECTED,
    name: 'default',
  },
  {
    entry: createFixtureEntryPath('tree-shaking-debug-enabled'),
    expectation: LOGGER_TREE_SHAKING_DEBUG_ENABLED_EXPECTED,
    name: 'debug-enabled',
    options: {
      config: {
        debug: true,
      },
    },
  },
  {
    entry: createFixtureEntryPath('tree-shaking-disabled'),
    expectation: LOGGER_TREE_SHAKING_DISABLED_EXPECTED,
    name: 'treeshake-disabled',
    options: {
      config: {
        levels: ['error'],
      },
      treeshake: false,
    },
  },
];

const formatStatsError = (error: unknown): string => {
  if (typeof error === 'string') {
    return error;
  }

  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }

  return JSON.stringify(error);
};

const runCompiler = async <TStats extends BuildStatsLike>(
  bundler: string,
  compiler: CompilerLike<TStats>,
): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    compiler.run((runError, stats) => {
      compiler.close((closeError) => {
        const error = runError ?? closeError;

        if (error) {
          reject(error);

          return;
        }

        if (stats?.hasErrors()) {
          const info = stats.toJson({
            all: false,
            errors: true,
          });
          const errors = info.errors
            ?.map((error) => formatStatsError(error))
            .join('\n');

          reject(
            new Error(
              `${bundler} fixture build failed${errors ? `:\n${errors}` : ''}`,
            ),
          );

          return;
        }

        resolve();
      });
    });
  });
};

const withTemporaryOutputDirectory = async (
  bundler: string,
  fixture: string,
  build: (outputDirectory: string) => Promise<string>,
): Promise<string> => {
  const outputDirectory = await mkdtemp(
    path.join(tmpdir(), `docs-islands-logger-${bundler}-${fixture}-`),
  );

  try {
    return await build(outputDirectory);
  } finally {
    await rm(outputDirectory, {
      force: true,
      recursive: true,
    });
  }
};

const readJavaScriptOutputFiles = async (
  outputDirectory: string,
): Promise<string> => {
  const entries = await readdir(outputDirectory, {
    withFileTypes: true,
  });
  const contents = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(outputDirectory, entry.name);

      if (entry.isDirectory()) {
        return readJavaScriptOutputFiles(entryPath);
      }

      if (!entry.isFile() || !/\.[cm]?js$/u.test(entry.name)) {
        return '';
      }

      return readFile(entryPath, 'utf8');
    }),
  );

  return contents.filter(Boolean).join('\n');
};

const buildViteFixture = async (
  fixture: LoggerTreeShakingFixture,
): Promise<string> => {
  const output = (await viteBuild({
    build: {
      lib: {
        entry: fixture.entry,
        fileName: fixture.name,
        formats: ['es'],
      },
      minify: false,
      rollupOptions: {
        external: [LOGGER_MODULE_ID],
      },
      write: false,
    },
    configFile: false,
    logLevel: 'silent',
    plugins: [loggerPlugin.vite(fixture.options)],
  })) as RollupOutput[];

  const outputs = Array.isArray(output) ? output : [output];
  return outputs
    .flatMap((item) => item.output)
    .filter((item) => item.type === 'chunk')
    .map((item) => item.code)
    .join('\n');
};

const buildRollupFixture = async (
  fixture: LoggerTreeShakingFixture,
): Promise<string> => {
  const bundle = await rollup({
    external: [LOGGER_MODULE_ID],
    input: fixture.entry,
    plugins: [loggerPlugin.rollup(fixture.options)],
  });

  try {
    const { output } = await bundle.generate({
      format: 'esm',
    });

    return output
      .filter((item) => item.type === 'chunk')
      .map((item) => item.code)
      .join('\n');
  } finally {
    await bundle.close();
  }
};

const buildRolldownFixture = async (
  fixture: LoggerTreeShakingFixture,
): Promise<string> => {
  const bundle = await rolldown({
    external: [LOGGER_MODULE_ID],
    input: fixture.entry,
    plugins: [loggerPlugin.rolldown(fixture.options)],
  });

  try {
    const { output } = await bundle.generate({
      format: 'esm',
    });

    return output
      .filter((item) => item.type === 'chunk')
      .map((item) => item.code)
      .join('\n');
  } finally {
    await bundle.close();
  }
};

const buildEsbuildFixture = async (
  fixture: LoggerTreeShakingFixture,
): Promise<string> => {
  const result = await esbuild.build({
    bundle: true,
    entryPoints: [fixture.entry],
    external: [LOGGER_MODULE_ID],
    format: 'esm',
    plugins: [loggerPlugin.esbuild(fixture.options)],
    write: false,
  });

  return result.outputFiles.map((file) => file.text).join('\n');
};

const buildWebpackFixture = async (
  fixture: LoggerTreeShakingFixture,
): Promise<string> =>
  withTemporaryOutputDirectory(
    'webpack',
    fixture.name,
    async (outputDirectory) => {
      const compiler = webpack({
        entry: fixture.entry,
        externals: {
          [LOGGER_MODULE_ID]: LOGGER_MODULE_ID,
        },
        externalsType: 'commonjs',
        mode: 'production',
        optimization: {
          minimize: false,
        },
        output: {
          filename: `${fixture.name}.js`,
          path: outputDirectory,
        },
        plugins: [loggerPlugin.webpack(fixture.options)],
        resolve: {
          extensions: ['.ts', '.js'],
        },
        target: 'node',
      });

      await runCompiler('webpack', compiler);

      return readJavaScriptOutputFiles(outputDirectory);
    },
  );

const buildRspackFixture = async (
  fixture: LoggerTreeShakingFixture,
): Promise<string> =>
  withTemporaryOutputDirectory(
    'rspack',
    fixture.name,
    async (outputDirectory) => {
      const compiler = rspack({
        entry: fixture.entry,
        externals: {
          [LOGGER_MODULE_ID]: LOGGER_MODULE_ID,
        },
        externalsType: 'commonjs',
        mode: 'production',
        optimization: {
          minimize: false,
        },
        output: {
          filename: `${fixture.name}.js`,
          path: outputDirectory,
        },
        plugins: [loggerPlugin.rspack(fixture.options)],
        resolve: {
          extensions: ['.ts', '.js'],
        },
        target: 'node',
      });

      await runCompiler('rspack', compiler);

      return readJavaScriptOutputFiles(outputDirectory);
    },
  );

const buildFarmFixture = async (
  fixture: LoggerTreeShakingFixture,
): Promise<string> =>
  withTemporaryOutputDirectory(
    'farm',
    fixture.name,
    async (outputDirectory) => {
      await farmBuild({
        clearScreen: false,
        configFile: false,
        mode: 'production',
        plugins: [loggerPlugin.farm(fixture.options)],
        root: path.dirname(fixture.entry),
        compilation: {
          external: [LOGGER_MODULE_ID],
          input: {
            index: fixture.entry,
          },
          mode: 'production',
          output: {
            clean: true,
            entryFilename: `${fixture.name}.js`,
            filename: '[resourceName].js',
            format: 'esm',
            path: outputDirectory,
            showFileSize: false,
            targetEnv: 'library',
          },
          persistentCache: false,
        },
      });

      return readJavaScriptOutputFiles(outputDirectory);
    },
  );

const LOGGER_TREE_SHAKING_BUNDLERS: {
  build: (fixture: LoggerTreeShakingFixture) => Promise<string>;
  bundler: LoggerTreeShakingBundler;
}[] = [
  {
    build: buildViteFixture,
    bundler: 'vite',
  },
  {
    build: buildRollupFixture,
    bundler: 'rollup',
  },
  {
    build: buildRolldownFixture,
    bundler: 'rolldown',
  },
  {
    build: buildEsbuildFixture,
    bundler: 'esbuild',
  },
  {
    build: buildWebpackFixture,
    bundler: 'webpack',
  },
  {
    build: buildRspackFixture,
    bundler: 'rspack',
  },
  {
    build: buildFarmFixture,
    bundler: 'farm',
  },
];

export const LOGGER_TREE_SHAKING_FIXTURE_BUILDS: LoggerTreeShakingFixtureBuild[] =
  LOGGER_TREE_SHAKING_FIXTURES.flatMap((fixture) =>
    LOGGER_TREE_SHAKING_BUNDLERS.map((bundler) => ({
      build: () => bundler.build(fixture),
      bundler: bundler.bundler,
      expectation: fixture.expectation,
      fixture: fixture.name,
    })),
  );
