import { createLogger } from '@docs-islands/utils/logger';
import { createElapsedTimer, formatErrorMessage } from 'logaria/helper';
import { spawnSync } from 'node:child_process';

const WorkspaceLogger = createLogger({
  main: 'docs-islands-monorepo',
}).getLoggerByGroup('task.workspace.run');

interface RunTarget {
  forwardedArgs: string[];
  packageSelector?: string;
  script: string;
}

function isOptionLike(argument: string): boolean {
  return argument.startsWith('-');
}

function parseArguments(argv = process.argv.slice(2)): RunTarget {
  const [script, ...rest] = argv;

  if (!script) {
    throw new Error(
      'Missing script name. Usage: pnpm run _run <script> [package] [args...]',
    );
  }

  let packageSelector: string | undefined;
  let forwardedArgs = rest;

  // The first non-option argument is treated as a workspace selector.
  if (rest[0] && rest[0] !== '--' && !isOptionLike(rest[0])) {
    packageSelector = rest[0];
    forwardedArgs = rest.slice(1);
  }

  if (forwardedArgs[0] === '--') {
    forwardedArgs = forwardedArgs.slice(1);
  }

  return {
    script,
    packageSelector,
    forwardedArgs,
  };
}

function buildPnpmArguments(target: RunTarget): string[] {
  const args = target.packageSelector
    ? ['--filter', target.packageSelector, 'run', target.script]
    : ['-r', '--parallel', '--if-present', 'run', target.script];

  if (target.forwardedArgs.length > 0) {
    args.push('--', ...target.forwardedArgs);
  }

  return args;
}

function getPnpmCommand(): string {
  return 'pnpm';
}

function runWorkspaceScript(target: RunTarget): number {
  const result = spawnSync(getPnpmCommand(), buildPnpmArguments(target), {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.error) {
    throw result.error;
  }

  return result.status ?? 1;
}

function main(): void {
  WorkspaceLogger.info('workspace script started');
  const elapsed = createElapsedTimer();
  try {
    const exitCode = runWorkspaceScript(parseArguments());
    if (exitCode === 0) {
      WorkspaceLogger.success('workspace script finished', elapsed());
    } else {
      WorkspaceLogger.error(
        `workspace script failed with code ${exitCode}`,
        elapsed(),
      );
    }
    process.exit(exitCode);
  } catch (error) {
    WorkspaceLogger.error(
      `workspace script failed: ${formatErrorMessage(error)}`,
      elapsed(),
    );
    process.exit(1);
  }
}

main();
