import { loadEnv } from '@docs-islands/utils/env';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Browser, chromium } from 'playwright-chromium';
import { glob } from 'tinyglobby';

let browser: Browser;
let allowRuntimeFailures = false;
let pageErrors: string[] = [];
let requestFailures: string[] = [];
let responseFailures: string[] = [];

const isCriticalRequestFailure = (
  url: string,
  resourceType: string,
): boolean => {
  return (
    resourceType === 'document' ||
    resourceType === 'script' ||
    resourceType === 'fetch' ||
    resourceType === 'xhr' ||
    /\.m?js(?:$|\?)/.test(url) ||
    /\.css(?:$|\?)/.test(url)
  );
};

const isIgnorableRequestFailure = (errorText?: string): boolean => {
  return errorText === 'net::ERR_ABORTED' || errorText === 'NS_BINDING_ABORTED';
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

beforeAll(async () => {
  const env = loadEnv({
    force: true,
  });
  browser = await chromium.connect(env.test.ws_endpoint!);
  globalThis.page = await browser.newPage();
  globalThis.goto = async (path: string) => {
    await globalThis.page.goto(`http://localhost:${env.test.port}${path}`);
    await globalThis.page.waitForSelector('#app .Layout', { timeout: 10_000 });
  };
  globalThis.allowBrowserRuntimeFailures = () => {
    allowRuntimeFailures = true;
  };
});

beforeEach(() => {
  allowRuntimeFailures = false;
  pageErrors = [];
  requestFailures = [];
  responseFailures = [];

  globalThis.page.on('pageerror', handlePageError);
  globalThis.page.on('requestfailed', handleRequestFailed);
  globalThis.page.on('response', handleBadResponse);
});

afterEach(async () => {
  globalThis.page.off('pageerror', handlePageError);
  globalThis.page.off('requestfailed', handleRequestFailed);
  globalThis.page.off('response', handleBadResponse);

  if (allowRuntimeFailures) {
    return;
  }

  if (
    pageErrors.length === 0 &&
    requestFailures.length === 0 &&
    responseFailures.length === 0
  ) {
    return;
  }

  throw new Error(
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
      .join('\n\n'),
  );
});

afterAll(async () => {
  globalThis.page.removeAllListeners();
  await globalThis.page.close();
  await browser.close();

  delete (globalThis as Partial<typeof globalThis>).page;
  delete (globalThis as Partial<typeof globalThis>).goto;
  delete (globalThis as Partial<typeof globalThis>).allowBrowserRuntimeFailures;

  const originalMarkdownContent =
    '<!-- This file is used to test the HMR of markdown content changes. -->\n';
  const projectRoot = path.resolve(__dirname, '.');
  const markdownFilePaths = await glob(['**/*.md'], {
    cwd: projectRoot,
    absolute: true,
    onlyFiles: true,
  });
  for (const markdownFilePath of markdownFilePaths) {
    const filePath = path.resolve(projectRoot, markdownFilePath);
    if (filePath.endsWith('hmr-test.md')) {
      fs.writeFileSync(filePath, originalMarkdownContent);
    }
  }
});

const handlePageError = (error: Error): void => {
  pageErrors.push(error.message);
};

const handleRequestFailed = (request: {
  failure: () => { errorText?: string } | null;
  resourceType: () => string;
  url: () => string;
}): void => {
  const resourceType = request.resourceType();
  const url = request.url();
  const errorText = request.failure()?.errorText;

  if (
    !isCriticalRequestFailure(url, resourceType) ||
    isIgnorableRequestFailure(errorText)
  ) {
    return;
  }

  requestFailures.push(
    `${resourceType} ${url} :: ${errorText ?? 'unknown request failure'}`,
  );
};

const handleBadResponse = (response: {
  request: () => { resourceType: () => string; url: () => string };
  status: () => number;
  url: () => string;
}): void => {
  const request = response.request();
  const resourceType = request.resourceType();
  const url = request.url();

  if (response.status() < 400 || !isCriticalRequestFailure(url, resourceType)) {
    return;
  }

  responseFailures.push(
    `${response.status()} ${resourceType} ${response.url()}`,
  );
};
