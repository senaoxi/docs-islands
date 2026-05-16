/**
 * @vitest-environment node
 */
import type { PageMetafile } from '#dep-types/page';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolvePageClientChunkPublicPath } from '../ai-page-build-context';

const tempDirectories: string[] = [];

const createTempDirectory = (
  prefix = 'site-devtools-ai-page-build-context-',
) => {
  const directoryPath = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirectories.push(directoryPath);
  return directoryPath;
};

afterEach(() => {
  while (tempDirectories.length > 0) {
    const directoryPath = tempDirectories.pop();

    if (!directoryPath) {
      continue;
    }

    fs.rmSync(directoryPath, { force: true, recursive: true });
  }
});

describe('resolvePageClientChunkPublicPath', () => {
  it('prefers the newest matching page chunk when stale assets still exist', () => {
    const outDir = createTempDirectory();
    const assetsDir = path.join(outDir, 'assets');
    const oldChunkFileName = 'guide_how-it-works.md.D8mo1P2_.js';
    const newChunkFileName = 'guide_how-it-works.md.BKeac6Vz.js';

    fs.mkdirSync(assetsDir, { recursive: true });
    fs.writeFileSync(
      path.join(assetsDir, oldChunkFileName),
      'export const oldChunk = true;',
    );
    fs.writeFileSync(
      path.join(assetsDir, newChunkFileName),
      'export const newChunk = true;',
    );
    fs.utimesSync(
      path.join(assetsDir, oldChunkFileName),
      new Date('2026-04-05T08:00:00.000Z'),
      new Date('2026-04-05T08:00:00.000Z'),
    );
    fs.utimesSync(
      path.join(assetsDir, newChunkFileName),
      new Date('2026-04-05T09:00:00.000Z'),
      new Date('2026-04-05T09:00:00.000Z'),
    );

    expect(
      resolvePageClientChunkPublicPath({
        assetsDir: 'assets',
        outDir,
        pageId: '/guide/how-it-works',
        pageMetafile: {
          cssBundlePaths: [],
          loaderScript: '',
          modulePreloads: [],
          pathname: '/guide/how-it-works',
          ssrInjectScript: '',
        } satisfies PageMetafile,
      }),
    ).toBe(`/assets/${newChunkFileName}`);
  });
});
