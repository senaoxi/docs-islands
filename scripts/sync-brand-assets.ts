import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const sourcePath = 'assets/logo/docs-islands.svg';
const source = await readFile(path.resolve(root, sourcePath), 'utf8');
const checkOnly = process.argv.includes('--check');
const generatedNotice = `<!-- Generated from ${sourcePath}. Run pnpm exec tsx scripts/sync-brand-assets.ts. -->\n`;

const variants = [
  ['assets/logo/favicon.svg', '#7051E8'],
  ['assets/logo/islands-vitepress.svg', '#7051E8'],
  ['assets/logo/docs-islands-ink.svg', '#211E2E'],
  ['assets/logo/docs-islands-white.svg', '#FFFFFF'],
  ['docs/public/logo.svg', '#7051E8'],
  ['docs/public/favicon.svg', '#7051E8'],
  ['docs/public/safari-pinned-tab.svg', '#000000'],
  ['packages/vitepress/docs/public/logo.svg', '#7051E8'],
  ['packages/vitepress/docs/public/favicon.svg', '#7051E8'],
  ['packages/vitepress/docs/public/safari-pinned-tab.svg', '#000000'],
] as const;

if (
  !source.includes('color="#7051E8"') ||
  !source.includes('id="docs-islands-frame"') ||
  !source.includes('id="docs-islands-island"')
) {
  throw new Error(
    'The canonical logo must preserve its color and shared fragment IDs.',
  );
}

const stale: string[] = [];
for (const [relativePath, color] of variants) {
  const destination = path.resolve(root, relativePath);
  const expected =
    generatedNotice + source.replace('color="#7051E8"', `color="${color}"`);
  if (checkOnly) {
    let actual: string | undefined;
    try {
      actual = await readFile(destination, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
    if (actual !== expected) {
      stale.push(relativePath);
    }
  } else {
    await writeFile(destination, expected);
  }
}

if (stale.length > 0) {
  process.stderr.write(`Brand assets are out of sync:\n${stale.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `${checkOnly ? 'Verified' : 'Synced'} ${variants.length} logo assets from ${sourcePath}.\n`,
  );
}
