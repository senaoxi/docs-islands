import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const checkOnly = process.argv.includes('--check');
const brands = [
  {
    sourcePath: 'assets/logo/docs-islands.svg',
    fragmentIds: ['docs-islands-frame', 'docs-islands-island'],
    variants: [
      ['assets/logo/favicon.svg', '#7051E8'],
      ['assets/logo/docs-islands-ink.svg', '#211E2E'],
      ['assets/logo/docs-islands-white.svg', '#FFFFFF'],
      ['docs/public/logo.svg', '#7051E8'],
      ['docs/public/favicon.svg', '#7051E8'],
      ['docs/public/safari-pinned-tab.svg', '#000000'],
    ],
  },
  {
    sourcePath: 'assets/logo/docs-islands-vitepress.svg',
    fragmentIds: [
      'docs-islands-vitepress-frame',
      'docs-islands-vitepress-island',
    ],
    variants: [
      ['assets/logo/islands-vitepress.svg', '#7051E8'],
      ['packages/vitepress/docs/public/logo.svg', '#7051E8'],
      ['packages/vitepress/docs/public/favicon.svg', '#7051E8'],
      ['packages/vitepress/docs/public/safari-pinned-tab.svg', '#000000'],
    ],
  },
] as const;

const stale: string[] = [];
let variantCount = 0;
for (const { sourcePath, fragmentIds, variants } of brands) {
  const source = await readFile(path.resolve(root, sourcePath), 'utf8');
  if (
    !source.includes('color="#7051E8"') ||
    fragmentIds.some((id) => !source.includes(`id="${id}"`))
  ) {
    throw new Error(
      `${sourcePath} must preserve its color and shared fragment IDs.`,
    );
  }

  const generatedNotice = `<!-- Generated from ${sourcePath}. Run pnpm exec tsx scripts/sync-brand-assets.ts. -->\n`;
  for (const [relativePath, color] of variants) {
    variantCount += 1;
    const destination = path.resolve(root, relativePath);
    const expected =
      generatedNotice + source.replace('color="#7051E8"', `color="${color}"`);
    let actual: string | undefined;
    try {
      actual = await readFile(destination, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    if (actual !== expected) {
      if (checkOnly) {
        stale.push(relativePath);
      } else {
        await writeFile(destination, expected);
      }
    }
  }
}

if (stale.length > 0) {
  process.stderr.write(`Brand assets are out of sync:\n${stale.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `${checkOnly ? 'Verified' : 'Synced'} ${variantCount} logo assets from ${brands.length} canonical sources.\n`,
  );
}
