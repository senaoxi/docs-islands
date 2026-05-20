import type { createElapsedTimer } from '@docs-islands/logger/helper';
import { formatErrorMessage } from '@docs-islands/logger/helper';
import { createLogger } from '@docs-islands/utils/logger';
import type { ConsoleMessage, Page, Request, Response } from '@playwright/test';
import { load } from 'cheerio';
import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { mkdir, mkdtemp, rm as nodeRm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export interface DistPackageJson {
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

interface PackedDistTarball {
  cleanup: () => Promise<void>;
  tarballPath: string;
}

export interface ConsumerFixture {
  cleanup: () => Promise<void>;
  fixtureDir: string;
}

export interface DevServer {
  logs: string[];
  process: ChildProcess;
}

export interface PageRuntimeWatch {
  assertClean: () => void;
  consoleMessages: string[];
  detach: () => void;
  formatFailures: () => string;
  pageErrors: string[];
  requestFailures: string[];
  responseFailures: string[];
}

type SmokeLogOptions = ReturnType<ReturnType<typeof createElapsedTimer>>;

export interface SmokeLogger {
  error: (message: string, options?: SmokeLogOptions) => void;
  info: (message: string, options?: SmokeLogOptions) => void;
  success: (message: string, options?: SmokeLogOptions) => void;
}

interface CreateConsumerFixtureOptions {
  fixtureRootPrefix: string;
  installLogMessage: string;
  logger: SmokeLogger;
  localDependencyTarballPaths?: Record<string, string>;
  manifest: DistPackageJson;
  tarballPath: string;
  writeFiles: (fixtureDir: string) => Promise<void>;
}

export const CONSUMER_SMOKE_ROUTE = '/script-content-changes/basic';
export const CLIENT_ENTRY_SPECIFIER =
  '@docs-islands/vitepress/adapters/react/client';
export const DIST_CLIENT_ENTRY_PATH = 'client/adapters/react.mjs';
const MANAGED_LOGGER_SPECIFIERS = ['@docs-islands/utils/logger'] as const;

export const PACKAGE_ROOT_DIR = fileURLToPath(new URL('..', import.meta.url));
export const DIST_DIR = path.join(PACKAGE_ROOT_DIR, 'dist');
export const LOGGER_DIST_DIR = path.join(
  PACKAGE_ROOT_DIR,
  '..',
  'logger',
  'dist',
);

const REQUIRED_CONSUMER_DEPENDENCIES = [
  '@vitejs/plugin-react-swc',
  'react',
  'react-dom',
  'vitepress',
  'vue',
] as const;
const loggerInstance = createLogger({
  main: '@docs-islands/vitepress',
});
const require = createRequire(import.meta.url);

export function getSmokeLogger(group: string): SmokeLogger {
  return loggerInstance.getLoggerByGroup(group);
}

export function formatUnknownError(error: unknown): string {
  return formatErrorMessage(error);
}

export function getPnpmCommand(): string {
  return process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
}

async function packDistTarball(distDir: string): Promise<PackedDistTarball> {
  const destination = await mkdtemp(
    path.join(tmpdir(), 'docs-islands-package-'),
  );
  const output = execFileSync(
    'npm',
    ['pack', distDir, '--pack-destination', destination, '--ignore-scripts'],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
    },
  );
  const fileName = output.trim().split(/\r?\n/u).at(-1);

  if (!fileName) {
    await nodeRm(destination, { force: true, recursive: true });
    throw new Error(`npm pack did not report a tarball for ${distDir}`);
  }

  return {
    cleanup: async () => {
      await nodeRm(destination, {
        force: true,
        recursive: true,
      }).catch(() => null);
    },
    tarballPath: path.join(destination, fileName),
  };
}

export function readCurrentPnpmConfig<T>(key: string): T | undefined {
  try {
    const rawValue = execFileSync(
      getPnpmCommand(),
      ['config', 'get', key, '--json'],
      {
        encoding: 'utf8',
      },
    ).trim();

    if (
      rawValue.length === 0 ||
      rawValue === 'undefined' ||
      rawValue === 'null'
    ) {
      return undefined;
    }

    return JSON.parse(rawValue) as T;
  } catch {
    return undefined;
  }
}

export function readDistManifest(): DistPackageJson {
  const manifestPath = path.join(DIST_DIR, 'package.json');

  if (!existsSync(manifestPath)) {
    throw new Error(
      `Expected dist package manifest at ${manifestPath}. Run pnpm --dir packages/vitepress build first.`,
    );
  }

  return JSON.parse(readFileSync(manifestPath, 'utf8')) as DistPackageJson;
}

export function assertDistArtifacts(): DistPackageJson {
  const manifest = readDistManifest();
  const clientEntryPath = path.join(DIST_DIR, DIST_CLIENT_ENTRY_PATH);

  if (!existsSync(clientEntryPath)) {
    throw new Error(
      `Expected dist React client entry at ${clientEntryPath}. Run pnpm --dir packages/vitepress build first.`,
    );
  }

  const clientEntrySource = readFileSync(clientEntryPath, 'utf8');

  if (!clientEntrySource.includes('@docs-islands/vitepress/logger')) {
    throw new Error(
      `${clientEntryPath} does not import @docs-islands/vitepress/logger.`,
    );
  }
  for (const managedLoggerSpecifier of MANAGED_LOGGER_SPECIFIERS) {
    if (!clientEntrySource.includes(managedLoggerSpecifier)) {
      continue;
    }

    throw new Error(
      `${clientEntryPath} still references ${managedLoggerSpecifier}.`,
    );
  }

  return manifest;
}

export async function writeConsumerPackageManagerConfig(
  fixtureDir: string,
): Promise<void> {
  const trustPolicy = readCurrentPnpmConfig<string>('trust-policy');
  const trustPolicyExcludes =
    readCurrentPnpmConfig<string[]>('trust-policy-exclude') ?? [];
  const lines: string[] = [];

  if (trustPolicy) {
    lines.push(`trust-policy=${trustPolicy}`);
  }

  for (const exclude of trustPolicyExcludes) {
    lines.push(`trust-policy-exclude[]=${exclude}`);
  }

  if (lines.length === 0) {
    return;
  }

  await writeFile(
    path.join(fixtureDir, '.npmrc'),
    `${lines.join('\n')}\n`,
    'utf8',
  );
}

export function resolveInstalledPackageVersion(
  packageName: string,
  fallbackVersion?: string,
): string {
  try {
    let currentDir = path.dirname(require.resolve(packageName));
    let packageJsonPath: string | undefined;

    while (true) {
      const candidatePath = path.join(currentDir, 'package.json');
      if (existsSync(candidatePath)) {
        packageJsonPath = candidatePath;
        break;
      }

      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) {
        break;
      }
      currentDir = parentDir;
    }

    if (!packageJsonPath) {
      throw new Error(`Unable to locate package.json for "${packageName}".`);
    }

    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      version?: string;
    };

    if (packageJson.version) {
      return packageJson.version;
    }
  } catch {
    // Fall back to the published peer dependency range when local resolution fails.
  }

  if (!fallbackVersion) {
    throw new Error(
      `Unable to resolve an installed version for "${packageName}".`,
    );
  }

  return fallbackVersion;
}

export function installConsumerDependencies(options: {
  fixtureDir: string;
  localDependencyTarballPaths?: Record<string, string>;
  manifest: DistPackageJson;
  tarballPath: string;
}): void {
  const {
    fixtureDir,
    localDependencyTarballPaths = {},
    manifest,
    tarballPath,
  } = options;
  const localDependencyNames = new Set(
    Object.keys(localDependencyTarballPaths),
  );
  const peerDependencyArguments = REQUIRED_CONSUMER_DEPENDENCIES.map(
    (packageName) =>
      `${packageName}@${resolveInstalledPackageVersion(
        packageName,
        manifest.peerDependencies?.[packageName],
      )}`,
  );
  const dependencyArguments = [
    ...Object.keys(manifest.dependencies ?? {})
      .filter((packageName) => !localDependencyNames.has(packageName))
      .map(
        (packageName) =>
          `${packageName}@${resolveInstalledPackageVersion(
            packageName,
            manifest.dependencies?.[packageName],
          )}`,
      ),
    ...Object.values(localDependencyTarballPaths),
  ];

  execFileSync(
    getPnpmCommand(),
    [
      'add',
      '--save',
      '--prefer-offline',
      '--ignore-scripts',
      ...dependencyArguments,
    ],
    {
      cwd: fixtureDir,
      stdio: 'inherit',
    },
  );
  execFileSync(
    getPnpmCommand(),
    [
      'add',
      '--save-dev',
      '--prefer-offline',
      '--ignore-scripts',
      tarballPath,
      ...peerDependencyArguments,
    ],
    {
      cwd: fixtureDir,
      stdio: 'inherit',
    },
  );
}

async function writeLocalDependencyOverrides(
  fixtureDir: string,
  localDependencyTarballPaths: Record<string, string>,
): Promise<void> {
  if (Object.keys(localDependencyTarballPaths).length === 0) {
    return;
  }

  const packageJsonPath = path.join(fixtureDir, 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
    pnpm?: {
      overrides?: Record<string, string>;
    };
  };
  const overrideEntries = Object.fromEntries(
    Object.entries(localDependencyTarballPaths).map(
      ([packageName, tarballPath]) => [packageName, `file:${tarballPath}`],
    ),
  );

  packageJson.pnpm = {
    ...packageJson.pnpm,
    overrides: {
      ...packageJson.pnpm?.overrides,
      ...overrideEntries,
    },
  };

  await writeFile(
    packageJsonPath,
    `${JSON.stringify(packageJson, null, 2)}\n`,
    'utf8',
  );
}

async function removeDirectory(directory: string): Promise<void> {
  const isWindows = process.platform === 'win32';

  try {
    const child = spawn(
      isWindows ? 'cmd' : 'rm',
      isWindows ? ['/c', 'rmdir', '/s', '/q', directory] : ['-rf', directory],
      {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      },
    );

    child.once('error', () => {
      nodeRm(directory, {
        force: true,
        recursive: true,
      }).catch(() => null);
    });
    child.unref();
  } catch {
    await nodeRm(directory, {
      force: true,
      recursive: true,
    }).catch(() => null);
  }
}

export async function createConsumerFixture(
  options: CreateConsumerFixtureOptions,
): Promise<ConsumerFixture> {
  const fixtureRoot = await mkdtemp(
    path.join(tmpdir(), options.fixtureRootPrefix),
  );
  const fixtureDir = path.join(fixtureRoot, 'fixture');

  try {
    await mkdir(fixtureDir, {
      recursive: true,
    });
    await options.writeFiles(fixtureDir);
    await writeLocalDependencyOverrides(
      fixtureDir,
      options.localDependencyTarballPaths ?? {},
    );
    options.logger.info(options.installLogMessage);
    installConsumerDependencies({
      fixtureDir,
      localDependencyTarballPaths: options.localDependencyTarballPaths,
      manifest: options.manifest,
      tarballPath: options.tarballPath,
    });

    return {
      cleanup: async () => {
        await removeDirectory(fixtureRoot);
      },
      fixtureDir,
    };
  } catch (error) {
    await removeDirectory(fixtureRoot);
    throw error;
  }
}

export function startVitePressDevServer(options: {
  fixtureDir: string;
  port: number;
}): DevServer {
  const { fixtureDir, port } = options;
  const logs: string[] = [];
  const child = spawn(
    getPnpmCommand(),
    [
      'exec',
      'vitepress',
      'dev',
      '.',
      '--host',
      '127.0.0.1',
      '--port',
      `${port}`,
    ],
    {
      cwd: fixtureDir,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    },
  );

  child.stdout?.on('data', (chunk: Buffer | string) => {
    logs.push(String(chunk));
  });
  child.stderr?.on('data', (chunk: Buffer | string) => {
    logs.push(String(chunk));
  });

  return {
    logs,
    process: child,
  };
}

export function stopChildProcess(child: ChildProcess): void {
  if (child.exitCode !== null || !child.pid) {
    return;
  }

  const childPid = child.pid;

  if (process.platform === 'win32') {
    const taskkill = spawn('taskkill', ['/pid', `${childPid}`, '/t', '/f'], {
      stdio: 'ignore',
      windowsHide: true,
    });

    taskkill.once('error', () => {
      child.kill();
    });
    taskkill.unref();
    return;
  }

  try {
    process.kill(-childPid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }

  const timer = setTimeout(() => {
    if (child.exitCode === null) {
      try {
        process.kill(-childPid, 'SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
    }
  }, 5000);

  timer.unref();
}

export async function reserveTcpPort(): Promise<number> {
  const { createServer } = await import('node:net');

  return await new Promise<number>((resolve, reject) => {
    const server = createServer();

    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();

      if (!address || typeof address === 'string') {
        server.close(() => {
          reject(new Error('Failed to reserve an ephemeral TCP port.'));
        });
        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(port);
      });
    });
  });
}

export async function waitForServerReady(options: {
  logs: string[];
  port: number;
  process: ChildProcess;
  timeoutMs?: number;
}): Promise<void> {
  const { logs, port, process, timeoutMs = 30_000 } = options;
  const startedAt = Date.now();
  const serverUrl = `http://127.0.0.1:${port}/`;

  while (Date.now() - startedAt < timeoutMs) {
    if (process.exitCode !== null) {
      throw new Error(
        `Consumer fixture dev server exited early.\n${logs.join('')}`,
      );
    }

    try {
      const response = await fetch(serverUrl, {
        redirect: 'manual',
      });

      if (response.status < 500) {
        return;
      }
    } catch {
      // Keep polling until the dev server is ready or times out.
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 250);
    });
  }

  throw new Error(
    `Timed out waiting for the consumer fixture dev server.\n${logs.join('')}`,
  );
}

export async function packVitepressDist() {
  return await packDistTarball(DIST_DIR);
}

export async function packLoggerDist() {
  return await packDistTarball(LOGGER_DIST_DIR);
}

export function isCriticalRequestFailure(
  url: string,
  resourceType: string,
): boolean {
  return (
    resourceType === 'document' ||
    resourceType === 'script' ||
    resourceType === 'fetch' ||
    resourceType === 'xhr' ||
    /\.m?js(?:$|\?)/.test(url) ||
    /\.css(?:$|\?)/.test(url)
  );
}

export function isIgnorableRequestFailure(errorText?: string): boolean {
  return errorText === 'net::ERR_ABORTED' || errorText === 'NS_BINDING_ABORTED';
}

export function watchPageRuntime(page: Page): PageRuntimeWatch {
  const consoleMessages: string[] = [];
  const pageErrors: string[] = [];
  const requestFailures: string[] = [];
  const responseFailures: string[] = [];
  const handleConsole = (message: ConsoleMessage) => {
    consoleMessages.push(`${message.type()}: ${message.text()}`);
  };
  const handlePageError = (error: Error) => {
    pageErrors.push(error.message);
  };
  const handleRequestFailed = (request: Request) => {
    const errorText = request.failure()?.errorText;
    if (!isCriticalRequestFailure(request.url(), request.resourceType())) {
      return;
    }
    if (isIgnorableRequestFailure(errorText)) {
      return;
    }

    requestFailures.push(
      `${request.resourceType()} ${request.url()} :: ${errorText ?? 'unknown request failure'}`,
    );
  };
  const handleBadResponse = (response: Response) => {
    const request = response.request();
    if (
      response.status() < 400 ||
      !isCriticalRequestFailure(request.url(), request.resourceType())
    ) {
      return;
    }

    responseFailures.push(
      `${response.status()} ${request.resourceType()} ${response.url()}`,
    );
  };
  const formatFailures = () =>
    [
      pageErrors.length > 0 ? `pageerror:\n${pageErrors.join('\n')}` : '',
      requestFailures.length > 0
        ? `requestfailed:\n${requestFailures.join('\n')}`
        : '',
      responseFailures.length > 0
        ? `badresponse:\n${responseFailures.join('\n')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n\n');

  page.on('console', handleConsole);
  page.on('pageerror', handlePageError);
  page.on('requestfailed', handleRequestFailed);
  page.on('response', handleBadResponse);

  return {
    assertClean: () => {
      const failures = formatFailures();

      if (failures) {
        throw new Error(failures);
      }
    },
    consoleMessages,
    detach: () => {
      page.off('console', handleConsole);
      page.off('pageerror', handlePageError);
      page.off('requestfailed', handleRequestFailed);
      page.off('response', handleBadResponse);
    },
    formatFailures,
    pageErrors,
    requestFailures,
    responseFailures,
  };
}

export async function renderConsumerFailureDetails(
  page: Page,
  runtime: PageRuntimeWatch,
): Promise<string> {
  const renderContainerCount = await page
    .locator('[__render_directive__]')
    .count()
    .catch(() => 0);
  const customElementCount = await page
    .locator('hello-world')
    .count()
    .catch(() => 0);
  const firstRenderContainerHtml = await page
    .locator('[__render_directive__]')
    .first()
    .innerHTML()
    .catch(() => null);
  const runtimeGlobals = await page
    .evaluate(() => {
      const runtimeWindow = globalThis as unknown as Record<string, unknown>;
      const injectComponent = runtimeWindow.__INJECT_COMPONENT__ as
        | Record<string, Record<string, unknown>>
        | undefined;

      return {
        componentManager: Boolean(runtimeWindow.__COMPONENT_MANAGER__),
        injectComponentPages: injectComponent
          ? Object.keys(injectComponent)
          : [],
        reactDevRuntime: typeof runtimeWindow.__RENDER_CLIENT_IN_DEV__,
      };
    })
    .catch((error: unknown) => ({
      evaluateError: formatUnknownError(error),
    }));
  const appTextContent = await page
    .locator('#app')
    .textContent()
    .catch(() => null);
  const htmlSnippet = await page
    .content()
    .then((html) => html.replaceAll(/\s+/g, ' ').slice(0, 1500))
    .catch(() => '');
  const runtimeFailures = runtime.formatFailures();

  return [
    `url: ${page.url()}`,
    `render containers: ${renderContainerCount}`,
    `hello-world tags: ${customElementCount}`,
    `runtime globals: ${JSON.stringify(runtimeGlobals)}`,
    firstRenderContainerHtml
      ? `first render container html:\n${firstRenderContainerHtml}`
      : '',
    appTextContent ? `#app text:\n${appTextContent}` : '',
    htmlSnippet ? `html snippet:\n${htmlSnippet}` : '',
    runtimeFailures,
    runtime.consoleMessages.length > 0
      ? `console:\n${runtime.consoleMessages.join('\n')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export async function resolveClientEntryFromFixture(
  fixtureDir: string,
): Promise<string> {
  const resolverPath = path.join(fixtureDir, 'resolve-client-entry.mjs');

  await writeFile(
    resolverPath,
    `console.log(import.meta.resolve(${JSON.stringify(CLIENT_ENTRY_SPECIFIER)}));\n`,
    'utf8',
  );

  const resolved = execFileSync(process.execPath, [resolverPath], {
    cwd: fixtureDir,
    encoding: 'utf8',
  }).trim();

  if (!resolved.endsWith(`/${DIST_CLIENT_ENTRY_PATH}`)) {
    throw new Error(
      `${CLIENT_ENTRY_SPECIFIER} resolved to ${resolved}, expected a dist entry ending in /${DIST_CLIENT_ENTRY_PATH}.`,
    );
  }

  return resolved;
}

export function runVitePressBuild(options: {
  fixtureDir: string;
  logger: SmokeLogger;
}): void {
  options.logger.info('building MPA consumer fixture');
  execFileSync(getPnpmCommand(), ['exec', 'vitepress', 'build', '.'], {
    cwd: options.fixtureDir,
    stdio: 'inherit',
  });
}

export function collectFiles(
  directory: string,
  predicate: (file: string) => boolean,
): string[] {
  const files: string[] = [];

  if (!existsSync(directory)) {
    return files;
  }

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...collectFiles(entryPath, predicate));
      continue;
    }

    if (entry.isFile() && predicate(entryPath)) {
      files.push(entryPath);
    }
  }

  return files;
}

export function collectMpaIntegrationScripts(outDir: string): string[] {
  const htmlFiles = collectFiles(outDir, (file) => file.endsWith('.html'));
  const scripts = new Set<string>();

  for (const htmlFile of htmlFiles) {
    const html = readFileSync(htmlFile, 'utf8');
    const $ = load(html);

    $('script[src*="react-integration"]').each((_, element) => {
      const src = $(element).attr('src');
      if (src && /\.js(?:\?|$)/.test(src)) {
        scripts.add(src);
      }
    });
  }

  if (scripts.size === 0) {
    throw new Error(
      `Expected an MPA react-integration script in built HTML files under ${outDir}.`,
    );
  }

  return [...scripts];
}

export function resolveBuiltAssetPath(
  outDir: string,
  scriptSrc: string,
): string {
  const withoutQuery = scriptSrc.split('?')[0] ?? scriptSrc;
  const relativePath = withoutQuery.replace(/^\/+/, '');
  const assetPath = path.resolve(outDir, decodeURIComponent(relativePath));

  if (!assetPath.startsWith(path.resolve(outDir) + path.sep)) {
    throw new Error(`Resolved script outside output directory: ${scriptSrc}`);
  }

  return assetPath;
}

export async function importMpaIntegrationScripts(
  outDir: string,
  scriptSources: string[],
): Promise<void> {
  for (const scriptSource of scriptSources) {
    const scriptPath = resolveBuiltAssetPath(outDir, scriptSource);

    if (!existsSync(scriptPath) || !statSync(scriptPath).isFile()) {
      throw new Error(
        `Expected MPA integration script ${scriptSource} at ${scriptPath}.`,
      );
    }

    await import(pathToFileURL(scriptPath).href);
  }
}

export function assertNoManagedLoggerSpecifier(outDir: string): void {
  const outputFiles = collectFiles(
    outDir,
    (file) =>
      file.endsWith('.js') || file.endsWith('.mjs') || file.endsWith('.html'),
  );

  for (const outputFile of outputFiles) {
    const source = readFileSync(outputFile, 'utf8');

    for (const managedLoggerSpecifier of MANAGED_LOGGER_SPECIFIERS) {
      if (!source.includes(managedLoggerSpecifier)) {
        continue;
      }

      throw new Error(
        `Built output still contains ${managedLoggerSpecifier} in ${outputFile}.`,
      );
    }
  }
}
