type BuildPhase = string | string[];

export const BUILD_AUTO_DISCOVER_PLACEHOLDER = '...';
export const BUILD_SKIP_ARG_KEYS = new Set(['--skip', '--exclude']);

export const BUILD_PIPELINE: BuildPhase[] = [
  '@docs-islands/plugin-license',
  '@docs-islands/core',
  'limina',
  '@docs-islands/vitepress',
  BUILD_AUTO_DISCOVER_PLACEHOLDER,
];

export const BUILD_FALLBACK_PACKAGES = [
  '@docs-islands/plugin-license',
  '@docs-islands/utils',
  '@docs-islands/core',
  'limina',
  '@docs-islands/vitepress',
  '@docs-islands/eslint-config',
];
