import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

function resolveModuleSpecifier(moduleName: string, parentUrl: string): string {
  if (moduleName.startsWith('node:')) {
    return moduleName;
  }

  const require = createRequire(parentUrl);
  return pathToFileURL(require.resolve(moduleName)).href;
}

export async function importWithError<T>(
  moduleName: string,
  parentUrl: string = import.meta.url,
): Promise<T> {
  try {
    return (await import(resolveModuleSpecifier(moduleName, parentUrl))) as T;
  } catch (error) {
    const final = new Error(
      `Failed to import module "${moduleName}". Please ensure it is installed.`,
      { cause: error },
    );
    throw final;
  }
}

export function pkgExists(
  moduleName: string,
  parentUrl: string = import.meta.url,
): boolean {
  try {
    resolveModuleSpecifier(moduleName, parentUrl);
    return true;
  } catch {}
  return false;
}
