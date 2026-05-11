import { setLoggerConfig } from '@docs-islands/logger';
import isInCi from 'is-in-ci';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import inspector from 'node:inspector';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv as viteLoadEnv } from 'vite';
import { z } from 'zod';
import { createLogger } from './logger';
import { findMonorepoRoot, isSubpath } from './path';

let cachedEnv: EnvConfig | null = null;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const elapsedSince = (startTimeMs: number) => ({
  elapsedTimeMs: Date.now() - startTimeMs,
});

const environmentSchema: z.ZodDefault<
  z.ZodEnum<{
    development: 'development';
    production: 'production';
  }>
> = z.enum(['development', 'production']).default('development');

type Environment = z.infer<typeof environmentSchema>;

const envBooleanSchema = z
  .stringbool({
    truthy: ['true'],
    falsy: ['false'],
  })
  .default(false);

const envFlagSchema = z
  .stringbool({
    truthy: ['1'],
    falsy: ['0'],
  })
  .default(false);

const managedProcessEnvSchema = z.object({
  DOCS_ISLANDS_RELEASE: envFlagSchema,
  DOCS_ISLANDS_TEST: envFlagSchema,
  DOCS_ISLANDS_SOURCEMAP: envBooleanSchema,
  DOCS_ISLANDS_MINIFY: envBooleanSchema,
  DOCS_ISLANDS_SILENCE_LOG: envBooleanSchema,
  DOCS_ISLANDS_DEBUG: envBooleanSchema,

  // test
  WS_ENDPOINT: z.string().optional(),
  PORT: z.string().optional(),

  // build
  DOCS_ISLANDS_BUILD_SKIP_PACKAGES: z.string().default(''),

  // site devtools
  DOCS_ISLANDS_CLAUDE_BASE_URL: z.string().default(''),
  DOCS_ISLANDS_CLAUDE_API_KEY: z.string().default(''),
  DOCS_ISLANDS_DOUBAO_BASE_URL: z.string().default(''),
  DOCS_ISLANDS_ARK_API_KEY: z.string().default(''),
});

const runtimeProcessEnvSchema = z.object({
  PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: z.string().optional(),
  ProgramFiles: z.string().optional(),
  'ProgramFiles(x86)': z.string().optional(),
});

const processEnvSchema = managedProcessEnvSchema.merge(runtimeProcessEnvSchema);

export interface EnvConfig {
  config: {
    sourcemap: boolean;
    minify: boolean;
    silence: boolean;
  };
  siteDevtools: {
    CLAUDE_BASE_URL: string;
    CLAUDE_API_KEY: string;
    DOUBAO_BASE_URL: string;
    DOUBAO_API_KEY: string;
  };
  build: {
    skipPackages: string;
  };
  test: {
    ws_endpoint: string | undefined;
    port: string | undefined;
  };
  runtime: {
    chromiumExecutablePath: string | undefined;
    programFiles: string | undefined;
    programFilesX86: string | undefined;
  };
  debug: boolean;
  env: Environment;
  ci: boolean;
  release: boolean;
}

type EnvLoggerLevel = 'error' | 'warn' | 'info' | 'success';

interface EnvLoggerConfig {
  debug: boolean;
  silence: boolean;
}

const getEnvLoggerLevels = (silence: boolean): EnvLoggerLevel[] =>
  silence ? ['error', 'warn'] : ['error', 'warn', 'info', 'success'];

function syncEnvLoggerConfig(config: EnvLoggerConfig): void {
  setLoggerConfig({
    debug: config.debug,
    levels: getEnvLoggerLevels(config.silence),
  });
  hasEnvLoggerConfig = true;
}

const createEnvLogger = () =>
  createLogger({
    main: '@docs-islands/utils',
  }).getLoggerByGroup('env');

let EnvLogger: ReturnType<typeof createEnvLogger> | null = null;
let hasEnvLoggerConfig = false;

function getEnvLogger(): ReturnType<typeof createEnvLogger> {
  if (!hasEnvLoggerConfig) {
    syncEnvLoggerConfig({
      debug: false,
      silence: false,
    });
  }

  EnvLogger ??= createEnvLogger();
  return EnvLogger;
}

function createEnvDebugSummary(
  env: EnvConfig,
  metadata: {
    appliedEnvFileKeys: string[];
    ciAdjustedKeys: string[];
    envDir: string;
    inspectorDebugEnabled: boolean;
    modeLocalOverrideKeys: string[];
    parsedEnvFileKeys: string[];
    releaseDebugSuppressed: boolean;
    runtimeOverrideKeys: string[];
  },
): Record<string, unknown> {
  return {
    appliedEnvFileKeys: metadata.appliedEnvFileKeys,
    build: {
      skipPackages: env.build.skipPackages || null,
    },
    ci: env.ci,
    ciAdjustedKeys: metadata.ciAdjustedKeys,
    config: env.config,
    envDir: metadata.envDir,
    inspectorDebugEnabled: metadata.inspectorDebugEnabled,
    mode: env.env,
    modeLocalOverrideKeys: metadata.modeLocalOverrideKeys,
    parsedEnvFileKeys: metadata.parsedEnvFileKeys,
    release: env.release,
    releaseDebugSuppressed: metadata.releaseDebugSuppressed,
    runtime: {
      chromiumExecutablePath: Boolean(env.runtime.chromiumExecutablePath),
      programFiles: Boolean(env.runtime.programFiles),
      programFilesX86: Boolean(env.runtime.programFilesX86),
    },
    runtimeOverrideKeys: metadata.runtimeOverrideKeys,
    siteDevtools: {
      claudeApiKey: Boolean(env.siteDevtools.CLAUDE_API_KEY),
      doubaoApiKey: Boolean(env.siteDevtools.DOUBAO_API_KEY),
    },
    test: {
      port: Boolean(env.test.port),
      wsEndpoint: Boolean(env.test.ws_endpoint),
    },
  };
}

function stringifyDebugSummary(summary: unknown): string {
  if (summary === undefined) {
    return 'n/a';
  }

  try {
    return JSON.stringify(summary);
  } catch {
    return '[unserializable summary]';
  }
}

function formatEnvDebugMessage({
  context,
  decision,
  summary,
  timingMs,
}: {
  context: string;
  decision: string;
  summary?: unknown;
  timingMs?: number;
}): string {
  const timing =
    timingMs === undefined || !Number.isFinite(timingMs)
      ? 'n/a'
      : `${timingMs.toFixed(2)}ms`;

  return [
    `context=${context}`,
    `decision=${decision}`,
    `summary=${stringifyDebugSummary(summary)}`,
    `timing=${timing}`,
  ].join(' | ');
}

type UserOverrideChecker = (key: string) => boolean;

function loadParsedEnvIntoProcessEnv(
  parsed: Record<string, string>,
  runtimeKeys: ReadonlySet<string>,
): {
  appliedEnvFileKeys: string[];
  runtimeOverrideKeys: string[];
} {
  const appliedEnvFileKeys: string[] = [];
  const runtimeOverrideKeys: string[] = [];

  for (const [key, value] of Object.entries(parsed)) {
    if (runtimeKeys.has(key)) {
      runtimeOverrideKeys.push(key);
    } else {
      process.env[key] = value;
      appliedEnvFileKeys.push(key);
    }
  }

  return {
    appliedEnvFileKeys,
    runtimeOverrideKeys,
  };
}

function applyCiTestEnvDefaults(options: {
  isCI: boolean;
  isLocalTest: boolean;
  isRelease: boolean;
  isUserOverride: UserOverrideChecker;
}): string[] {
  const { isCI, isLocalTest, isRelease, isUserOverride } = options;

  if ((!isCI && !isLocalTest) || isRelease) {
    return [];
  }

  const ciAdjustedKeys: string[] = [];

  if (!isUserOverride('DOCS_ISLANDS_SILENCE_LOG')) {
    process.env.DOCS_ISLANDS_SILENCE_LOG = 'false';
    ciAdjustedKeys.push('DOCS_ISLANDS_SILENCE_LOG');
  }
  if (!isUserOverride('DOCS_ISLANDS_SOURCEMAP')) {
    process.env.DOCS_ISLANDS_SOURCEMAP = 'false';
    ciAdjustedKeys.push('DOCS_ISLANDS_SOURCEMAP');
  }
  if (!isUserOverride('DOCS_ISLANDS_MINIFY')) {
    process.env.DOCS_ISLANDS_MINIFY = 'true';
    ciAdjustedKeys.push('DOCS_ISLANDS_MINIFY');
  }

  return ciAdjustedKeys;
}

function applyReleaseEnvDefaults(
  isRelease: boolean,
  isUserOverride: UserOverrideChecker,
): boolean {
  if (!isRelease || isUserOverride('DOCS_ISLANDS_DEBUG')) {
    return false;
  }

  process.env.DOCS_ISLANDS_DEBUG = 'false';
  return true;
}

function applyInspectorDebugFallback(
  isRelease: boolean,
  isUserOverride: UserOverrideChecker,
): boolean {
  if (
    isRelease ||
    isUserOverride('DOCS_ISLANDS_DEBUG') ||
    process.env.DOCS_ISLANDS_DEBUG === 'true' ||
    inspector.url() === undefined
  ) {
    return false;
  }

  process.env.DOCS_ISLANDS_DEBUG = 'true';
  return true;
}

/**
 * Parses keys from an `.env` file (ignoring comments and blank lines).
 * Used to detect which variables the user explicitly overrode in `.local` files.
 */
function parseEnvKeys(filePath: string): Set<string> {
  if (!existsSync(filePath)) return new Set();
  const content = readFileSync(filePath, 'utf8');
  const keys = new Set<string>();
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    keys.add(trimmed.slice(0, eqIndex).trim());
  }
  return keys;
}

function findNearestEnv(): string {
  let dir = realpathSync(__dirname);
  while (true) {
    if (existsSync(path.join(dir, '.env'))) break;
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(
        `No .env file found from ${__dirname} to filesystem root`,
      );
    }
    dir = parent;
  }

  const root = findMonorepoRoot(__dirname);

  if (!root) {
    throw new Error('Monorepo root directory not found');
  }

  if (!isSubpath(root, dir)) {
    getEnvLogger().warn(
      `[docs-islands] .env found at "${dir}" is outside the monorepo root "${root}". This may cause unexpected behavior.`,
    );
  }

  return dir;
}

interface LoadEnvOptions {
  force: boolean;
}

const defaultOptions: LoadEnvOptions = {
  force: false,
};

/**
 * Loads `.env` files into `process.env` and applies centralized
 * CI / RELEASE adjustments.
 *
 * Priority (highest → lowest):
 * 1. Runtime `process.env` (command-line / platform-injected)
 * 2. `.env.[mode].local`  (user's personal overrides, gitignored)
 * 3. CI / RELEASE adjustments (computed by this function)
 * 4. `.env.[mode]`        (mode defaults)
 * 5. `.env`               (base defaults)
 *
 * @returns Pre-computed build configuration values.
 */
export function loadEnv(options: LoadEnvOptions = defaultOptions): EnvConfig {
  const loadStartedAt = Date.now();
  const { force } = options;

  if (!force && cachedEnv) {
    syncEnvLoggerConfig({
      debug: cachedEnv.debug,
      silence: cachedEnv.config.silence,
    });
    getEnvLogger().debug(
      formatEnvDebugMessage({
        context: 'load docs-islands environment',
        decision: 'reuse cached environment configuration',
        summary: {
          ci: cachedEnv.ci,
          config: cachedEnv.config,
          mode: cachedEnv.env,
          release: cachedEnv.release,
        },
        timingMs: Date.now() - loadStartedAt,
      }),
    );
    return cachedEnv;
  }

  const envDir = findNearestEnv();
  const mode = environmentSchema.parse(process.env.DOCS_ISLANDS_MODE);

  // ── Step 1: snapshot runtime env (always highest priority) ──
  const runtimeKeys = new Set(Object.keys(process.env));

  // Keys the user explicitly set in .env.[mode].local
  const localKeys = parseEnvKeys(path.resolve(envDir, `.env.${mode}.local`));
  const modeLocalOverrideKeys = [...localKeys].toSorted();

  /** Returns true if the user explicitly overrode this key. */
  const isUserOverride = (key: string) =>
    runtimeKeys.has(key) || localKeys.has(key);

  // ── Step 2: load .env files via Vite ──
  const parsed = viteLoadEnv(mode, envDir, 'DOCS_ISLANDS');
  const parsedEnvFileKeys = Object.keys(parsed).toSorted();
  const { appliedEnvFileKeys, runtimeOverrideKeys } =
    loadParsedEnvIntoProcessEnv(parsed, runtimeKeys);

  // ── Step 3: CI / RELEASE adjustments ──
  const isCI = isInCi;
  const isRelease = envFlagSchema.parse(process.env.DOCS_ISLANDS_RELEASE);
  const isLocalTest = envFlagSchema.parse(process.env.DOCS_ISLANDS_TEST);

  // CI mode: re-enable info/success logs, suppress sourcemap, enable minify
  // for keys that were not explicitly overridden.
  const ciAdjustedKeys = applyCiTestEnvDefaults({
    isCI,
    isLocalTest,
    isRelease,
    isUserOverride,
  });

  // RELEASE mode: suppress debug unless explicitly overridden.
  const releaseDebugSuppressed = applyReleaseEnvDefaults(
    isRelease,
    isUserOverride,
  );

  // ── Step 4: inspector-based debug fallback ──
  const inspectorDebugEnabled = applyInspectorDebugFallback(
    isRelease,
    isUserOverride,
  );

  // ── Step 5: Validate and map final configuration ──
  let finalEnv: z.infer<typeof processEnvSchema>;
  try {
    finalEnv = processEnvSchema.parse(process.env);
  } catch (error) {
    getEnvLogger().error(
      'Failed to validate docs-islands environment',
      elapsedSince(loadStartedAt),
    );
    throw error;
  }

  cachedEnv = {
    config: {
      sourcemap: finalEnv.DOCS_ISLANDS_SOURCEMAP,
      minify: finalEnv.DOCS_ISLANDS_MINIFY,
      silence: finalEnv.DOCS_ISLANDS_SILENCE_LOG,
    },
    siteDevtools: {
      CLAUDE_BASE_URL: finalEnv.DOCS_ISLANDS_CLAUDE_BASE_URL,
      CLAUDE_API_KEY: finalEnv.DOCS_ISLANDS_CLAUDE_API_KEY,
      DOUBAO_BASE_URL: finalEnv.DOCS_ISLANDS_DOUBAO_BASE_URL,
      DOUBAO_API_KEY: finalEnv.DOCS_ISLANDS_ARK_API_KEY,
    },
    build: {
      skipPackages: finalEnv.DOCS_ISLANDS_BUILD_SKIP_PACKAGES,
    },
    test: {
      ws_endpoint: finalEnv.WS_ENDPOINT,
      port: finalEnv.PORT,
    },
    runtime: {
      chromiumExecutablePath: finalEnv.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      programFiles: finalEnv.ProgramFiles,
      programFilesX86: finalEnv['ProgramFiles(x86)'],
    },
    debug: finalEnv.DOCS_ISLANDS_DEBUG,
    release: finalEnv.DOCS_ISLANDS_RELEASE,
    env: mode,
    ci: isCI,
  };

  syncEnvLoggerConfig({
    debug: cachedEnv.debug,
    silence: cachedEnv.config.silence,
  });

  if (ciAdjustedKeys.length > 0) {
    getEnvLogger().info(
      `Applied CI/test env defaults: ${ciAdjustedKeys.join(', ')}`,
    );
  }

  if (releaseDebugSuppressed) {
    getEnvLogger().info('Suppressed debug logging for release mode');
  }

  if (inspectorDebugEnabled) {
    getEnvLogger().info(
      'Enabled debug logging because Node inspector is attached',
    );
  }

  getEnvLogger().debug(
    formatEnvDebugMessage({
      context: 'load docs-islands environment',
      decision: 'applied env files, runtime overrides, and computed defaults',
      summary: createEnvDebugSummary(cachedEnv, {
        appliedEnvFileKeys,
        ciAdjustedKeys,
        envDir,
        inspectorDebugEnabled,
        modeLocalOverrideKeys,
        parsedEnvFileKeys,
        releaseDebugSuppressed,
        runtimeOverrideKeys,
      }),
      timingMs: Date.now() - loadStartedAt,
    }),
  );
  getEnvLogger().success(
    `Loaded ${mode} environment`,
    elapsedSince(loadStartedAt),
  );

  return cachedEnv;
}

type ProcessEnvKey =
  | 'DOCS_ISLANDS_RELEASE'
  | 'DOCS_ISLANDS_TEST'
  | 'DOCS_ISLANDS_SOURCEMAP'
  | 'DOCS_ISLANDS_MINIFY'
  | 'DOCS_ISLANDS_SILENCE_LOG'
  | 'DOCS_ISLANDS_DEBUG'
  | 'DOCS_ISLANDS_CLAUDE_BASE_URL'
  | 'DOCS_ISLANDS_CLAUDE_API_KEY'
  | 'DOCS_ISLANDS_DOUBAO_BASE_URL'
  | 'DOCS_ISLANDS_ARK_API_KEY'
  | 'WS_ENDPOINT'
  | 'PORT'
  | 'DOCS_ISLANDS_BUILD_SKIP_PACKAGES';

const injectKeySchema: z.ZodType<'DOCS_ISLANDS_MODE' | ProcessEnvKey> = z.union(
  [z.literal('DOCS_ISLANDS_MODE'), managedProcessEnvSchema.keyof()],
);

export type InjectableKey = z.infer<typeof injectKeySchema>;

const injectValueSchema: z.ZodType<
  string | number | boolean | null | undefined
> = z.union([z.string(), z.number(), z.boolean(), z.null(), z.undefined()]);

type InjectableValue = z.infer<typeof injectValueSchema>;

export function injectEnv(key: InjectableKey, value: InjectableValue): void {
  const validKey = injectKeySchema.parse(key);
  const validValue = injectValueSchema.parse(value);

  if (validValue === undefined || validValue === null) {
    getEnvLogger().debug(
      formatEnvDebugMessage({
        context: 'inject docs-islands environment variable',
        decision: 'skip nullish environment value',
        summary: {
          key: validKey,
        },
      }),
    );
    return;
  }

  process.env[validKey] = String(validValue);
  getEnvLogger().debug(
    formatEnvDebugMessage({
      context: 'inject docs-islands environment variable',
      decision: 'wrote value to process.env',
      summary: {
        key: validKey,
        valueType: typeof validValue,
      },
    }),
  );
}

export function injectEnvs(
  envs: Partial<Record<InjectableKey, InjectableValue>>,
): void {
  for (const [key, value] of Object.entries(envs)) {
    injectEnv(key as InjectableKey, value);
  }
}
