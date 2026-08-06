import type { VueImportParser } from '#config/runner';
import { getAstroParserIdentity } from './astro-compiler';
import { collectAstroImports } from './astro-imports';
import {
  collectSvelteImports,
  getSvelteParserIdentity,
} from './svelte-imports';
import type {
  FrameworkImportParserIdentity,
  FrameworkImportProvider,
} from './types';
import { collectVueImports, resolveVueCompilerSfc } from './vue-imports';

function getVueParserIdentity(options: {
  packageRootDir: string;
  parser: VueImportParser;
}): FrameworkImportParserIdentity {
  if (options.parser === 'compiler-sfc') {
    return {
      kind: '@vue/compiler-sfc',
      mode: options.parser,
      version:
        resolveVueCompilerSfc(options.packageRootDir).version ?? 'unknown',
    };
  }
  return { kind: 'vue-heuristic', mode: options.parser, version: '1' };
}

function createVueProvider(parser: VueImportParser): FrameworkImportProvider {
  return {
    collectionMode: 'sync',
    collectImports: (options) =>
      collectVueImports({
        ...options,
        parser,
        projectRootDir: options.packageRootDir,
      }),
    extension: '.vue',
    getParserIdentity: ({ packageRootDir }) =>
      getVueParserIdentity({ packageRootDir, parser }),
  };
}

const svelteProvider: FrameworkImportProvider = {
  collectionMode: 'sync',
  collectImports: collectSvelteImports,
  extension: '.svelte',
  getParserIdentity: getSvelteParserIdentity,
};

const astroProvider: FrameworkImportProvider = {
  collectionMode: 'async',
  collectImports: collectAstroImports,
  extension: '.astro',
  getParserIdentity: getAstroParserIdentity,
};

export function createFrameworkImportProviderRegistry(options: {
  vueParser: VueImportParser;
}): ReadonlyMap<string, FrameworkImportProvider> {
  const providers = [
    astroProvider,
    createVueProvider(options.vueParser),
    svelteProvider,
  ];
  return new Map(providers.map((provider) => [provider.extension, provider]));
}

export function getFrameworkImportProvider(options: {
  filePath: string;
  providers: ReadonlyMap<string, FrameworkImportProvider>;
}): FrameworkImportProvider | null {
  const extension = options.filePath.slice(options.filePath.lastIndexOf('.'));
  return options.providers.get(extension) ?? null;
}

export function getTypeScriptParserIdentity(): FrameworkImportParserIdentity {
  return {
    kind: 'typescript-source',
    mode: 'oxc-with-typescript-fallback',
    version: 'builtin',
  };
}
