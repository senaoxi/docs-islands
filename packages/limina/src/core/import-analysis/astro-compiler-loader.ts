import { pathToFileURL } from 'node:url';
import type { AstroCompiler, AstroCompilerModule } from './astro-compiler';

const initializedCompilerCache = new Map<string, Promise<AstroCompiler>>();
let compilerInitializationQueue = Promise.resolve();

function getDefaultParseFunction(
  module: AstroCompilerModule,
): AstroCompiler['parse'] | null {
  if (module.default === undefined) return null;
  return module.default.parse ?? null;
}

function getParseFunction(
  module: AstroCompilerModule,
): AstroCompiler['parse'] | null {
  if (module.parse !== undefined) return module.parse;
  return getDefaultParseFunction(module);
}

function finishCompilerInitialization(): undefined {
  return undefined;
}

function enqueueCompilerInitialization(
  initialize: () => Promise<AstroCompiler>,
): Promise<AstroCompiler> {
  const result = compilerInitializationQueue.then(initialize, initialize);
  compilerInitializationQueue = result.then(
    finishCompilerInitialization,
    finishCompilerInitialization,
  );
  return result;
}

async function loadAndInitializeAstroCompiler(options: {
  createMissingParseError: () => Error;
  resolvedPath: string;
}): Promise<AstroCompiler> {
  const module = (await import(
    pathToFileURL(options.resolvedPath).href
  )) as AstroCompilerModule;
  const parse = getParseFunction(module);
  if (parse === null) throw options.createMissingParseError();
  await parse('', { position: true });
  return { parse };
}

function deleteFailedCompilerInitialization(options: {
  promise: Promise<AstroCompiler>;
  resolvedPath: string;
}): void {
  if (initializedCompilerCache.get(options.resolvedPath) === options.promise) {
    initializedCompilerCache.delete(options.resolvedPath);
  }
}

export async function loadInitializedAstroCompiler(options: {
  createMissingParseError: () => Error;
  resolvedPath: string;
}): Promise<AstroCompiler> {
  const cached = initializedCompilerCache.get(options.resolvedPath);
  if (cached !== undefined) return await cached;
  const promise = enqueueCompilerInitialization(() =>
    loadAndInitializeAstroCompiler(options),
  );
  initializedCompilerCache.set(options.resolvedPath, promise);
  try {
    return await promise;
  } catch (error) {
    deleteFailedCompilerInitialization({ ...options, promise });
    throw error;
  }
}
