import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

it('publishes with production build controls despite inherited development settings', async (t) => {
  const fixture = mkdtempSync(path.join(tmpdir(), 'release-build-env-'));
  const originalEnv = { ...process.env };
  const builds: { project: string; env: NodeJS.ProcessEnv }[] = [];
  const published: string[] = [];

  try {
    writeFileSync(
      path.join(fixture, 'package.json'),
      JSON.stringify({ private: true, type: 'module' }),
    );
    cpSync(
      path.join(repoRoot, 'scripts/release'),
      path.join(fixture, 'scripts/release'),
      {
        recursive: true,
        filter: (source) => !source.endsWith('.spec.ts'),
      },
    );
    symlinkSync(
      path.join(repoRoot, 'node_modules'),
      path.join(fixture, 'node_modules'),
      'junction',
    );
    for (const [key, name] of [
      ['logaria', 'logaria'],
      ['limina', 'limina'],
      ['vitepress', '@docs-islands/vitepress'],
    ]) {
      const packageDir = path.join(fixture, 'packages', key!);
      mkdirSync(path.join(packageDir, 'dist'), { recursive: true });
      const manifest = JSON.stringify({
        name,
        version: '1.0.0',
        publishConfig: { access: 'public' },
        devDependencies:
          key === 'vitepress' ? { '@docs-islands/utils': 'workspace:*' } : {},
      });
      writeFileSync(path.join(packageDir, 'package.json'), manifest);
      writeFileSync(path.join(packageDir, 'dist/package.json'), manifest);
    }

    // Exercise the public orchestration; intercept only external processes so
    // the test cannot publish, tag, push, or build the developer's checkout.
    t.mock.method(
      childProcess,
      'execFileSync',
      (_command: string, args: unknown, options: unknown) => {
        const argv = args as string[];
        const commandOptions = options as {
          env: NodeJS.ProcessEnv;
          cwd: string;
        };
        switch (argv[0]) {
          case 'nx':
            builds.push({ project: argv[2]!, env: { ...commandOptions.env } });
            break;
          case 'publish':
            published.push(commandOptions.cwd);
            break;
          case 'rev-parse':
            return 'a'.repeat(40);
          default:
            assert.ok(
              ['status', 'whoami', 'view', 'run', 'exec', 'pack'].includes(
                argv[0]!,
              ),
              `Unexpected command: ${argv.join(' ')}`,
            );
        }
        return '';
      },
    );
    syncBuiltinESMExports();
    process.env.DOCS_ISLANDS_MODE = 'development';
    process.env.DOCS_ISLANDS_SOURCEMAP = 'true';
    process.env.DOCS_ISLANDS_MINIFY = 'false';

    const { runPublishCommand } = (await import(
      pathToFileURL(path.join(fixture, 'scripts/release/release.ts')).href
    )) as typeof import('./release');
    await runPublishCommand({
      packageSelectors: ['logaria', 'limina', 'vitepress'],
      dryRun: false,
      skipTests: false,
      skipBuild: false,
      provenance: false,
      help: false,
    });

    assert.equal(published.length, 3);
    assert.deepEqual(
      builds.map(({ project }) => project),
      [
        'logaria:build',
        'limina:build',
        '@docs-islands/utils:build',
        '@docs-islands/vitepress:build',
        '@docs-islands/utils:build',
        '@docs-islands/vitepress:build',
      ],
    );
    for (const { project, env } of builds) {
      assert.equal(env.DOCS_ISLANDS_MODE, 'production', project);
      assert.equal(env.DOCS_ISLANDS_SOURCEMAP, 'false', project);
      assert.equal(env.DOCS_ISLANDS_MINIFY, 'true', project);
    }
    assert.deepEqual(
      builds.slice(2).map(({ env }) => env.DOCS_ISLANDS_TEST),
      ['1', '1', '0', '0'],
    );
    assert.equal(process.env.DOCS_ISLANDS_SOURCEMAP, 'true');
  } finally {
    t.mock.restoreAll();
    syncBuiltinESMExports();
    process.env = originalEnv;
    rmSync(fixture, { recursive: true, force: true });
  }
});
