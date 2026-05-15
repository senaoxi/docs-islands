#!/usr/bin/env node
/**
 * Git guard wrapper for link:dev / link:prod scripts.
 *
 * Dynamically discovers ALL package.json and pnpm-lock.yaml files with
 * uncommitted changes, stashes them before running, and restores them
 * afterwards — so existing work is never lost and the link operation's
 * side-effects are always reverted.
 *
 * Usage (from a package.json script):
 *   "link:dev": "link-guard link:dev:exec"
 *
 * Distributed as a bin via @docs-islands/utils.
 * Relies on pnpm setting npm_package_json to the calling package's package.json path.
 */
import { createElapsedTimer } from '@docs-islands/logger/helper';
import { execSync, spawn } from 'node:child_process';
import path from 'node:path';
import { createLogger } from '../logger';

const Log = createLogger({
  main: '@docs-islands/utils',
}).getLoggerByGroup('task.link.guard');
const runnerElapsed = createElapsedTimer();

// ---------------------------------------------------------------------------
// 1. Parse arguments
// ---------------------------------------------------------------------------

const innerScript = process.argv[2];
if (!innerScript) {
  Log.error('Usage: link-guard <script-name>', runnerElapsed());
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 2. Resolve paths
// ---------------------------------------------------------------------------

const packageJsonPath = process.env.npm_package_json;
if (!packageJsonPath) {
  Log.error(
    'npm_package_json is not set. This script must be invoked via a pnpm script.',
    runnerElapsed(),
  );
  process.exit(1);
}
const packageDir = path.dirname(packageJsonPath);

const gitRoot = execSync('git rev-parse --show-toplevel', {
  encoding: 'utf8',
  stdio: 'pipe',
}).trim();

// ---------------------------------------------------------------------------
// 3. Guarded-file discovery
// ---------------------------------------------------------------------------

/**
 * Scans the repo for ALL dirty package.json and pnpm-lock.yaml files.
 * This ensures that `pnpm install` side-effects across the entire monorepo
 * are properly guarded, not just the local package's files.
 */
function findDirtyGuardedFiles(): string[] {
  const status = execSync('git status --porcelain', {
    encoding: 'utf8',
    cwd: gitRoot,
    stdio: 'pipe',
  });

  if (!status.trim()) return [];

  return status
    .trimEnd()
    .split('\n')
    .filter((line) => !line.startsWith('??')) // skip untracked
    .map((line) =>
      line
        .slice(3)
        .trim()
        .replace(/^"(.*)"$/, '$1'),
    )
    .filter(
      (file) =>
        file === 'pnpm-lock.yaml' || path.basename(file) === 'package.json',
    );
}

// ---------------------------------------------------------------------------
// 4. Stash / restore helpers
// ---------------------------------------------------------------------------

function stashFiles(files: string[]): void {
  const args = files.map((f) => `"${f}"`).join(' ');
  execSync(`git stash push -m "link-guard: auto-stash" -- ${args}`, {
    cwd: gitRoot,
    stdio: 'pipe',
  });
}

function popStash(): void {
  try {
    execSync('git stash pop --index', { cwd: gitRoot, stdio: 'pipe' });
  } catch {
    // --index can fail if staged/unstaged states conflict; fall back to plain pop
    execSync('git stash pop', { cwd: gitRoot, stdio: 'pipe' });
  }
}

// ---------------------------------------------------------------------------
// 5. Revert logic
// ---------------------------------------------------------------------------

function revertFiles(files: string[]): void {
  for (const file of files) {
    const revertElapsed = createElapsedTimer();
    try {
      execSync(`git checkout HEAD -- "${file}"`, {
        cwd: gitRoot,
        stdio: 'pipe',
      });
      Log.success(`Reverted: ${file}`, revertElapsed());
    } catch {
      Log.warn(`Failed to revert: ${file}`, revertElapsed());
    }
  }
}

// ---------------------------------------------------------------------------
// 6. Run inner script
// ---------------------------------------------------------------------------

function runScript(name: string, cwd: string): Promise<number> {
  return new Promise((resolve) => {
    const runnerElapsed = createElapsedTimer();
    const child = spawn('pnpm', ['run', name], {
      cwd,
      stdio: 'inherit',
      shell: true,
    });

    child.on('close', (code) => resolve(code ?? 1));
    child.on('error', (err) => {
      Log.error(`Failed to run "${name}": ${err.message}`, runnerElapsed());
      resolve(1);
    });
  });
}

// ---------------------------------------------------------------------------
// 7. Signal handling
// ---------------------------------------------------------------------------

let stashed = false;

function installSignalHandlers(): void {
  const cleanup = (signal: NodeJS.Signals): void => {
    Log.warn(`Received ${signal}, reverting guarded files...`);
    const cleanupElapsed = createElapsedTimer();
    const dirty = findDirtyGuardedFiles();
    if (dirty.length > 0) revertFiles(dirty);
    if (stashed) {
      Log.info('Restoring stashed changes...', cleanupElapsed());
      popStash();
    }
    process.exit(128 + (signal === 'SIGINT' ? 2 : 15));
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

// ---------------------------------------------------------------------------
// 8. Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  Log.info(`Guard activated for: ${innerScript}`);
  Log.info(`Package directory: ${packageDir}`);

  const dirtyBefore = findDirtyGuardedFiles();
  if (dirtyBefore.length > 0) {
    Log.info(`Stashing uncommitted changes: ${dirtyBefore.join(', ')}`);
    const stashElapsed = createElapsedTimer();
    stashFiles(dirtyBefore);
    stashed = true;
    Log.success('Changes stashed', stashElapsed());
  }

  installSignalHandlers();

  let exitCode: number;
  try {
    exitCode = await runScript(innerScript, packageDir);
  } finally {
    const dirtyAfter = findDirtyGuardedFiles();
    if (dirtyAfter.length > 0) {
      Log.info(`Reverting guarded files: ${dirtyAfter.join(', ')}`);
      revertFiles(dirtyAfter);
    }
    if (stashed) {
      Log.info('Restoring stashed changes...');
      const restoreElapsed = createElapsedTimer();
      popStash();
      Log.success('Stashed changes restored', restoreElapsed());
    }
  }

  if (exitCode !== 0) {
    Log.error(`"${innerScript}" exited with code ${exitCode}`);
    process.exit(exitCode);
  }

  Log.success(`"${innerScript}" completed successfully`);
}

main().catch((error: unknown) => {
  Log.error(
    `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
    runnerElapsed(),
  );
  process.exit(1);
});
