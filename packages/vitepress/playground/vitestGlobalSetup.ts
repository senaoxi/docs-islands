import { injectEnvs, loadEnv } from '@docs-islands/utils/env';
import getPort from 'get-port';
import fs from 'node:fs';
import type { Server } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type BrowserServer, chromium } from 'playwright-chromium';
import type { ViteDevServer } from 'vite';
import { createServer } from 'vitepress';

let browserServer: BrowserServer;
let server: ViteDevServer | Server;

const root = fileURLToPath(new URL('.', import.meta.url));
const generatedMarkdownFixturePaths = [
  'error-handling/invalid-syntax.md',
  'error-handling/multiple-react-scripts.md',
  'script-content-changes/import-path-error.md',
];

const { ci, debug, runtime } = loadEnv();

const isUsableChromiumExecutable = (executablePath: string): boolean => {
  if (!fs.existsSync(executablePath)) {
    return false;
  }

  if (process.platform !== 'darwin') {
    return true;
  }

  const macAppRoot = /^(.+\.app)\//.exec(executablePath)?.[1];

  if (!macAppRoot) {
    return true;
  }

  return fs.existsSync(path.join(macAppRoot, 'Contents/Frameworks'));
};

const resolveChromiumExecutablePath = () => {
  const override = runtime.chromiumExecutablePath?.trim();

  if (override) {
    return override;
  }

  let executablePath: string | undefined;

  if (!ci || debug) {
    const bundledExecutablePath = chromium.executablePath();

    if (
      bundledExecutablePath &&
      isUsableChromiumExecutable(bundledExecutablePath)
    ) {
      executablePath = bundledExecutablePath;
    } else {
      const candidatePaths = [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        path.join(
          runtime.programFiles || 'C:/Program Files',
          'Google/Chrome/Application/chrome.exe',
        ),
        path.join(
          runtime.programFilesX86 || 'C:/Program Files (x86)',
          'Google/Chrome/Application/chrome.exe',
        ),
      ];

      executablePath = candidatePaths.find((candidatePath) =>
        isUsableChromiumExecutable(candidatePath),
      );
    }
  }

  return executablePath;
};

function materializeMarkdownFixtures(): void {
  for (const relativePath of generatedMarkdownFixturePaths) {
    const targetPath = path.join(root, relativePath);
    fs.copyFileSync(`${targetPath}.fixture`, targetPath);
  }
}

function removeMarkdownFixtures(): void {
  for (const relativePath of generatedMarkdownFixturePaths) {
    fs.rmSync(path.join(root, relativePath), { force: true });
  }
}

export async function setup(): Promise<void> {
  materializeMarkdownFixtures();
  browserServer = await chromium.launchServer({
    headless: !debug,
    args: ci ? ['--no-sandbox', '--disable-setuid-sandbox'] : undefined,
    executablePath: resolveChromiumExecutablePath(),
  });
  const port = await getPort();
  injectEnvs({
    WS_ENDPOINT: browserServer.wsEndpoint(),
    PORT: port.toString(),
  });
  server = await createServer(root, { port });
  await server.listen();

  const address = (server as ViteDevServer).httpServer?.address();
  const actualPort =
    typeof address === 'object' && address !== null ? address.port : port;

  injectEnvs({
    WS_ENDPOINT: browserServer.wsEndpoint(),
    PORT: actualPort.toString(),
  });
}

export async function teardown(): Promise<void> {
  try {
    if (browserServer) {
      await browserServer.close();
    }
    if (server) {
      await ('ws' in server
        ? server.close()
        : new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
          }));
    }
  } finally {
    removeMarkdownFixtures();
  }
}
