import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

export interface PackedDistTarball {
  cleanup: () => Promise<void>;
  tarballPath: string;
}

export async function packDistTarball(
  distDir: string,
): Promise<PackedDistTarball> {
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
    await rm(destination, { force: true, recursive: true });
    throw new Error(`npm pack did not report a tarball for ${distDir}`);
  }

  return {
    cleanup: async () => {
      await rm(destination, {
        force: true,
        recursive: true,
      }).catch(() => null);
    },
    tarballPath: path.join(destination, fileName),
  };
}
