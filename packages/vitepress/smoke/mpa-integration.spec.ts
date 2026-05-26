import { expect, test } from '@playwright/test';
import { createElapsedTimer } from 'logaria/helper';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  assertDistArtifacts,
  assertNoManagedLoggerSpecifier,
  CLIENT_ENTRY_SPECIFIER,
  collectMpaIntegrationScripts,
  createConsumerFixture,
  formatUnknownError,
  getPnpmCommand,
  getSmokeLogger,
  importMpaIntegrationScripts,
  packLogariaDist,
  packVitepressDist,
  resolveClientEntryFromFixture,
  runVitePressBuild,
  writeConsumerPackageManagerConfig,
} from './helpers';

async function writeMpaIntegrationFixtureFiles(
  fixtureDir: string,
): Promise<void> {
  const pnpmVersion = execFileSync(getPnpmCommand(), ['--version'], {
    encoding: 'utf8',
  }).trim();

  await mkdir(path.join(fixtureDir, '.vitepress', 'theme'), {
    recursive: true,
  });
  await mkdir(path.join(fixtureDir, 'components', 'react'), {
    recursive: true,
  });

  await writeFile(
    path.join(fixtureDir, 'package.json'),
    `${JSON.stringify(
      {
        name: 'docs-islands-mpa-integration-smoke',
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
import { defineConfig } from 'vitepress';

const config = defineConfig({
  mpa: true,
  title: 'MPA Dist Smoke',
});

createDocsIslands({
  adapters: [react()],
}).apply(config);

export default config;
`,
    'utf8',
  );

  await writeFile(
    path.join(fixtureDir, '.vitepress', 'theme', 'index.ts'),
    `import { reactClient } from '${CLIENT_ENTRY_SPECIFIER}';
import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';

const theme: Theme = {
  extends: DefaultTheme,
  enhanceApp() {
    void reactClient();
  },
};

export default theme;
`,
    'utf8',
  );

  await writeFile(
    path.join(fixtureDir, 'components', 'react', 'Counter.tsx'),
    `export default function Counter(): JSX.Element {
  return <button data-testid="mpa-integration-counter" type="button">MPA integration smoke</button>;
}
`,
    'utf8',
  );

  await writeFile(
    path.join(fixtureDir, 'index.md'),
    `# MPA Dist Smoke

<script lang="react">
  import Counter from './components/react/Counter.tsx';
</script>

<Counter client:load />
`,
    'utf8',
  );
}

test('MPA dist integration bundle resolves and imports cleanly', async () => {
  const logger = getSmokeLogger('task.mpa-integration-smoke');
  const smokeElapsed = createElapsedTimer();
  let cleanupPackedDist: (() => Promise<void>) | undefined;
  let cleanupPackedLogaria: (() => Promise<void>) | undefined;
  let cleanupFixture: (() => Promise<void>) | undefined;

  try {
    const manifest = assertDistArtifacts();

    logger.info('packing vitepress dist tarball for MPA integration smoke');
    const packedDist = await packVitepressDist();
    cleanupPackedDist = packedDist.cleanup;
    logger.info('packing logaria dist tarball for MPA integration smoke');
    const packedLogaria = await packLogariaDist();
    cleanupPackedLogaria = packedLogaria.cleanup;

    const fixture = await createConsumerFixture({
      fixtureRootPrefix: 'docs-islands-mpa-integration-smoke-',
      installLogMessage: 'installing MPA integration smoke dependencies',
      logger,
      localDependencyTarballPaths: {
        logaria: packedLogaria.tarballPath,
      },
      manifest,
      tarballPath: packedDist.tarballPath,
      writeFiles: writeMpaIntegrationFixtureFiles,
    });
    cleanupFixture = fixture.cleanup;

    const resolvedClientEntry = await resolveClientEntryFromFixture(
      fixture.fixtureDir,
    );
    logger.info(`${CLIENT_ENTRY_SPECIFIER} resolved to ${resolvedClientEntry}`);

    runVitePressBuild({
      fixtureDir: fixture.fixtureDir,
      logger,
    });

    const outDir = path.join(fixture.fixtureDir, '.vitepress', 'dist');
    const integrationScripts = collectMpaIntegrationScripts(outDir);

    await importMpaIntegrationScripts(outDir, integrationScripts);
    assertNoManagedLoggerSpecifier(outDir);

    expect(integrationScripts.length).toBeGreaterThan(0);
    logger.success('MPA integration smoke passed', smokeElapsed());
  } catch (error) {
    logger.error(
      `MPA integration smoke failed: ${formatUnknownError(error)}`,
      smokeElapsed(),
    );
    throw error;
  } finally {
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
});
