/**
 * @vitest-environment node
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveSiteDevToolsOptionalDependencyFallbackPath } from '../optional-dependencies';

const tempDirectories: string[] = [];

const createTempDirectory = (prefix: string) => {
  const directoryPath = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirectories.push(directoryPath);
  return directoryPath;
};

const writeTextFile = (filePath: string, content = '') => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
};

afterEach(() => {
  for (const directoryPath of tempDirectories.splice(0)) {
    fs.rmSync(directoryPath, {
      force: true,
      recursive: true,
    });
  }
});

describe('resolveSiteDevToolsOptionalDependencyFallbackPath', () => {
  it('prefers built fallback artifacts from the published package root when they exist', () => {
    const packageRoot = createTempDirectory(
      'site-devtools-optional-deps-published-',
    );
    const builtFallbackPath = path.join(
      packageRoot,
      'theme/optional-deps/shiki.mjs',
    );
    const sourceFallbackPath = path.join(
      packageRoot,
      'theme/optional-deps/shiki.ts',
    );

    writeTextFile(path.join(packageRoot, 'package.json'), '{}');
    writeTextFile(
      builtFallbackPath,
      'export const codeToHtml = async () => "";',
    );
    writeTextFile(
      sourceFallbackPath,
      'export const codeToHtml = async () => "";',
    );

    expect(
      resolveSiteDevToolsOptionalDependencyFallbackPath({
        builtRelativePath: 'theme/optional-deps/shiki.mjs',
        searchStartDir: path.join(packageRoot, 'node/chunks'),
        sourceRelativePath: 'theme/optional-deps/shiki.ts',
      }),
    ).toBe(builtFallbackPath);
  });

  it('falls back to source assets when built artifacts are unavailable in source execution', () => {
    const packageRoot = createTempDirectory(
      'site-devtools-optional-deps-source-',
    );
    const sourceFallbackPath = path.join(
      packageRoot,
      'theme/optional-deps/shiki.ts',
    );

    writeTextFile(path.join(packageRoot, 'package.json'), '{}');
    writeTextFile(
      sourceFallbackPath,
      'export const codeToHtml = async () => "";',
    );

    expect(
      resolveSiteDevToolsOptionalDependencyFallbackPath({
        builtRelativePath: 'theme/optional-deps/shiki.mjs',
        searchStartDir: path.join(packageRoot, 'src/node/site-devtools'),
        sourceRelativePath: 'theme/optional-deps/shiki.ts',
      }),
    ).toBe(sourceFallbackPath);
  });
});
