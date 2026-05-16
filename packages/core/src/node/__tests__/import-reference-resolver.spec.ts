import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createImportReferenceResolver } from '../import-reference-resolver';

const fixtureRoot = fileURLToPath(
  new URL('fixtures/export-resolution', import.meta.url),
);
const pageImporter = path.join(fixtureRoot, 'page.md');

const resolveFixtureId = async (
  id: string,
  importer = pageImporter,
): Promise<{ id: string } | null> => {
  if (!id.startsWith('.')) {
    return null;
  }

  const importerDirectory = path.dirname(importer);
  const resolvedBasePath = path.resolve(importerDirectory, id);
  const candidatePaths = [
    resolvedBasePath,
    `${resolvedBasePath}.ts`,
    `${resolvedBasePath}.tsx`,
    `${resolvedBasePath}.js`,
    `${resolvedBasePath}.jsx`,
    path.join(resolvedBasePath, 'index.ts'),
    path.join(resolvedBasePath, 'index.tsx'),
    path.join(resolvedBasePath, 'index.js'),
    path.join(resolvedBasePath, 'index.jsx'),
  ];

  for (const candidatePath of candidatePaths) {
    if (fs.existsSync(candidatePath)) {
      return { id: candidatePath.replaceAll('\\', '/') };
    }
  }

  return null;
};

describe('createImportReferenceResolver', () => {
  const resolver = createImportReferenceResolver({
    resolveId: resolveFixtureId,
  });

  it('resolves export star chains to the final leaf module', async () => {
    const reference = await resolver.resolveImportReference(
      './barrel',
      'Hero',
      pageImporter,
    );

    expect(reference).toEqual({
      identifier: path
        .join(fixtureRoot, 'named-leaf.tsx')
        .replaceAll('\\', '/'),
      importedName: 'Hero',
      warnings: [],
    });
  });

  it('resolves named re-export aliases', async () => {
    const reference = await resolver.resolveImportReference(
      './barrel',
      'Button',
      pageImporter,
    );

    expect(reference).toEqual({
      identifier: path
        .join(fixtureRoot, 'button-leaf.tsx')
        .replaceAll('\\', '/'),
      importedName: 'ForwardedButton',
      warnings: [],
    });
  });

  it('warns for intermediary modules with side-effect imports', async () => {
    const reference = await resolver.resolveImportReference(
      './side-effect-barrel',
      'Hero',
      pageImporter,
    );

    expect(reference).toEqual({
      identifier: path
        .join(fixtureRoot, 'named-leaf.tsx')
        .replaceAll('\\', '/'),
      importedName: 'Hero',
      warnings: [
        expect.stringContaining('side-effect-barrel.ts'),
        expect.stringContaining('side-effect-proxy.ts'),
      ],
    });
  });
});
