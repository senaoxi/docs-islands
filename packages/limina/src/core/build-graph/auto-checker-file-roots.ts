import { normalizeAbsolutePath } from '#utils/path';
import type { AutoScopeProject } from './types';

export function getAutoScopeFilePackageRoot(
  project: AutoScopeProject,
  fileName: string,
): string {
  return (
    project.packageRootByFileName.get(normalizeAbsolutePath(fileName)) ??
    project.packageRootDir
  );
}
