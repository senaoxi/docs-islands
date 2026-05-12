import { findNearestPackageRoot } from '@docs-islands/utils/path';
import { join } from 'pathe';

interface VitepressGlobalConfigLike {
  root?: string;
}

function getVitepressRoot(): string | undefined {
  const globalConfig = (
    globalThis as { VITEPRESS_CONFIG?: VitepressGlobalConfigLike }
  ).VITEPRESS_CONFIG;

  return typeof globalConfig?.root === 'string' ? globalConfig.root : undefined;
}

export function resolveDependencyResolutionBase(searchStart: string): string {
  return join(
    findNearestPackageRoot(searchStart) ?? searchStart,
    'package.json',
  );
}

export function resolveDependencySearchStart(configRoot?: string): string {
  return getVitepressRoot() ?? configRoot ?? process.cwd();
}

export function resolveCurrentDependencyResolutionBase(
  configRoot?: string,
): string {
  return resolveDependencyResolutionBase(
    resolveDependencySearchStart(configRoot),
  );
}
