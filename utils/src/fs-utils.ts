import { readdir } from 'node:fs/promises';
import path from 'node:path';

type FileCallback = (
  relativePath: string,
  absolutePath: string,
) => void | Promise<void>;

interface ScanFilesOptions {
  /**
   * Filter function to exclude certain files/directories
   * Return false to exclude the entry
   */
  filter?: (entryPath: string, isDirectory: boolean) => boolean;
}

/**
 * Recursively traverse a directory and call a callback for each file
 *
 * This is a generic utility that provides only the directory traversal capability.
 * The callback receives the relative path (from the root sourceDir) and absolute path,
 * allowing the caller to decide how to process each file (copy, transform, emit, etc.).
 *
 * Recursively traverse a directory using stable Node.js APIs
 * Compatible with Node.js 20.x without experimental features
 *
 * @param sourceDir - Source directory path to traverse
 * @param callback - Function to call for each file found. Receives (relativePath, absolutePath)
 * @param options - Traversal options
 */
export async function scanFiles(
  sourceDir: string,
  callback: FileCallback,
  options: ScanFilesOptions = {},
): Promise<void> {
  await scanFilesInternal(sourceDir, sourceDir, callback, options);
}

async function scanFilesInternal(
  rootDir: string,
  currentDir: string,
  callback: FileCallback,
  options: ScanFilesOptions,
): Promise<void> {
  const { filter } = options;

  if (filter && !filter(currentDir, true)) {
    return;
  }

  const entries = await readdir(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(currentDir, entry.name);

    if (filter && !filter(entryPath, entry.isDirectory())) {
      continue;
    }

    if (entry.isDirectory()) {
      await scanFilesInternal(rootDir, entryPath, callback, options);
    } else if (entry.isFile()) {
      const relativePath = path.relative(rootDir, entryPath);
      await callback(relativePath, entryPath);
    }
  }
}
