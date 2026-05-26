import { test as base } from '@playwright/test';
import { createElapsedTimer } from 'logaria/helper';
import { type ChildProcess, execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  createConsumerFixture,
  formatUnknownError,
  getPnpmCommand,
  getSmokeLogger,
  packLogariaDist,
  packVitepressDist,
  readDistManifest,
  reserveTcpPort,
  startVitePressDevServer,
  stopChildProcess,
  waitForServerReady,
  writeConsumerPackageManagerConfig,
} from './helpers';

interface ConsumerServer {
  fixtureDir: string;
  port: number;
  serverLogs: string[];
}

interface ConsumerSmokeWorkerFixtures {
  consumerServer: ConsumerServer;
}

type ConsumerSmokeTestFixtures = object;

async function writeConsumerSmokeFixtureFiles(
  fixtureDir: string,
): Promise<void> {
  const pnpmVersion = execFileSync(getPnpmCommand(), ['--version'], {
    encoding: 'utf8',
  }).trim();

  await mkdir(path.join(fixtureDir, '.vitepress'), { recursive: true });
  await mkdir(path.join(fixtureDir, '.vitepress', 'theme'), {
    recursive: true,
  });
  await mkdir(path.join(fixtureDir, 'components', 'react'), {
    recursive: true,
  });
  await mkdir(path.join(fixtureDir, 'script-content-changes'), {
    recursive: true,
  });

  await writeFile(
    path.join(fixtureDir, 'package.json'),
    `${JSON.stringify(
      {
        name: 'docs-islands-consumer-smoke',
        packageManager: `pnpm@${pnpmVersion}`,
        private: true,
        type: 'module',
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  await writeConsumerPackageManagerConfig(fixtureDir);

  await writeFile(
    path.join(fixtureDir, '.vitepress', 'config.ts'),
    `import { createDocsIslands } from '@docs-islands/vitepress';
import { react } from '@docs-islands/vitepress/adapters/react';
import { createLogger } from 'logaria';
import { defineConfig } from 'vitepress';

const Logger = createLogger({
  main: '@docs-islands/vitepress',
}).getLoggerByGroup('consumer.smoke');
const config = defineConfig({
  title: 'Consumer Smoke',
});

void Logger;

createDocsIslands({
  adapters: [react()],
}).apply(config);

export default config;
`,
    'utf8',
  );

  await writeFile(
    path.join(fixtureDir, '.vitepress', 'theme', 'index.ts'),
    `import { reactClient } from '@docs-islands/vitepress/adapters/react/client';
import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import { h } from 'vue';

const theme: Theme = {
  extends: DefaultTheme,
  Layout: () => h(DefaultTheme.Layout, null),
  async enhanceApp() {
    await reactClient();
  },
};

export default theme;
`,
    'utf8',
  );

  await writeFile(
    path.join(fixtureDir, 'components', 'react', 'HelloWorld.tsx'),
    `import { useState } from 'react';

export default function HelloWorld(): JSX.Element {
  const [count, setCount] = useState(0);

  return (
    <div data-testid="hello-world">
      <button
        data-testid="counter-button"
        type="button"
        onClick={() => setCount((value) => value + 1)}
      >
        Count: {count}
      </button>
    </div>
  );
}
`,
    'utf8',
  );

  await writeFile(
    path.join(fixtureDir, 'script-content-changes', 'basic.md'),
    `# Consumer Smoke

<script lang="react">
  import HelloWorld from '../components/react/HelloWorld.tsx';
</script>

<HelloWorld client:only />
`,
    'utf8',
  );

  await writeFile(
    path.join(fixtureDir, 'index.md'),
    `# Consumer Smoke Index

[Open consumer smoke page](./script-content-changes/basic.md)
`,
    'utf8',
  );
}

export const test = base.extend<
  ConsumerSmokeTestFixtures,
  ConsumerSmokeWorkerFixtures
>({
  consumerServer: [
    async ({ browserName }, use) => {
      if (browserName !== 'chromium') {
        throw new Error(
          `Consumer smoke only supports chromium, got ${browserName}.`,
        );
      }
      const logger = getSmokeLogger('task.consumer-smoke');
      const smokeElapsed = createElapsedTimer();
      let cleanupPackedDist: (() => Promise<void>) | undefined;
      let cleanupPackedLogaria: (() => Promise<void>) | undefined;
      let cleanupFixture: (() => Promise<void>) | undefined;
      let childProcess: ChildProcess | undefined;
      let serverLogs: string[] = [];

      try {
        const manifest = readDistManifest();

        logger.info('packing vitepress dist tarball for consumer smoke');
        const packedDist = await packVitepressDist();
        cleanupPackedDist = packedDist.cleanup;
        logger.info('packing logaria dist tarball for consumer smoke');
        const packedLogaria = await packLogariaDist();
        cleanupPackedLogaria = packedLogaria.cleanup;

        const fixture = await createConsumerFixture({
          fixtureRootPrefix: 'docs-islands-consumer-smoke-',
          installLogMessage: 'installing consumer fixture dependencies',
          logger,
          localDependencyTarballPaths: {
            logaria: packedLogaria.tarballPath,
          },
          manifest,
          tarballPath: packedDist.tarballPath,
          writeFiles: writeConsumerSmokeFixtureFiles,
        });
        cleanupFixture = fixture.cleanup;

        const port = await reserveTcpPort();
        const server = startVitePressDevServer({
          fixtureDir: fixture.fixtureDir,
          port,
        });
        childProcess = server.process;
        serverLogs = server.logs;
        await waitForServerReady({
          logs: server.logs,
          port,
          process: server.process,
        });
        await use({
          fixtureDir: fixture.fixtureDir,
          port,
          serverLogs: server.logs,
        });
        logger.success('Consumer smoke passed', smokeElapsed());
      } catch (error) {
        const renderedLogs =
          serverLogs.length > 0
            ? `\n\nDev server logs:\n${serverLogs.join('')}`
            : '';
        logger.error(
          `Consumer smoke failed: ${formatUnknownError(error)}${renderedLogs}`,
          smokeElapsed(),
        );
        throw error;
      } finally {
        if (childProcess) {
          stopChildProcess(childProcess);
        }
        if (cleanupFixture) {
          await cleanupFixture();
        }
        if (cleanupPackedDist) {
          await cleanupPackedDist();
        }
        if (cleanupPackedLogaria) {
          await cleanupPackedLogaria();
        }
      }
    },
    {
      scope: 'worker',
      timeout: 300_000,
    },
  ],
});

export { expect } from '@playwright/test';
