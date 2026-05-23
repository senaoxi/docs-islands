import { spawn } from 'node:child_process';

interface RunCommandOptions {
  env?: NodeJS.ProcessEnv;
}

function runCommand(
  command: string,
  args: string[],
  options: RunCommandOptions = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: options.env ?? process.env,
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          signal
            ? `${command} ${args.join(' ')} exited with signal ${signal}.`
            : `${command} ${args.join(' ')} exited with code ${code}.`,
        ),
      );
    });
  });
}

function resolvePnpmCommand(): { command: string; argsPrefix: string[] } {
  const npmExecPath = process.env.npm_execpath;

  // In pnpm lifecycle scripts, npm_execpath points to pnpm's JS entry.
  // Running it through the current Node executable avoids Windows .cmd spawning issues
  // and keeps the same package-manager version that started this install.
  if (npmExecPath) {
    return {
      command: process.execPath,
      argsPrefix: [npmExecPath],
    };
  }

  // Fallback for manual execution, e.g. `tsx scripts/postinstall.ts`.
  return {
    command: process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    argsPrefix: [],
  };
}

function runPnpm(
  args: string[],
  options: RunCommandOptions = {},
): Promise<void> {
  const { command, argsPrefix } = resolvePnpmCommand();
  return runCommand(command, [...argsPrefix, ...args], options);
}

async function main(): Promise<void> {
  for (const packageDir of ['utils', 'packages/limina']) {
    // These packages are consumed through link:*/dist during local installs.
    // Build them before refreshing pnpm's generated bin shims below.
    await runPnpm([
      '--dir',
      packageDir,
      'exec',
      'rolldown',
      '--config',
      'rolldown.config.ts',
    ]);
  }

  // The first install can run before link:*/dist package manifests exist, so
  // pnpm cannot create their .bin shims. Re-run install without lifecycle
  // scripts after the dist builds so commands like `limina` are linked.
  await runPnpm([
    'install',
    '--offline',
    '--ignore-scripts',
    '--frozen-lockfile',
  ]);

  // The agents package injects local AI tool skills during install; keeping it
  // here makes postinstall ordering explicit and easy to audit.
  await runPnpm(['--dir', 'packages/agents', 'run', 'link'], {
    env: {
      ...process.env,
      FORCE_COLOR: '1',
    },
  });
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});
