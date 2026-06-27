import { builtinModules } from 'node:module';

const NODE_BUILTIN_NAMESPACE = 'node:';
const NPM_BUILTIN_NAMESPACE = 'npm:';
const BUN_BUILTIN_NAMESPACE = 'bun:';
const nodeBuiltins = builtinModules.filter((id) => !id.includes(':'));

function createIsBuiltin(
  builtins: (string | RegExp)[],
): (id: string) => boolean {
  const plainBuiltinsSet = new Set(
    builtins.filter((builtin) => typeof builtin === 'string'),
  );
  const regexBuiltins = builtins.filter(
    (builtin) => typeof builtin !== 'string',
  );

  return (id) =>
    plainBuiltinsSet.has(id) || regexBuiltins.some((regexp) => regexp.test(id));
}

const isBuiltinCache = new WeakMap<
  (string | RegExp)[],
  (id: string, importer?: string) => boolean
>();

function isBuiltin(builtins: (string | RegExp)[], id: string): boolean {
  let isBuiltin = isBuiltinCache.get(builtins);
  if (!isBuiltin) {
    isBuiltin = createIsBuiltin(builtins);
    isBuiltinCache.set(builtins, isBuiltin);
  }
  return isBuiltin(id);
}

const nodeLikeBuiltins: (string | RegExp)[] = [
  ...nodeBuiltins,
  new RegExp(`^${NODE_BUILTIN_NAMESPACE}`),
  new RegExp(`^${NPM_BUILTIN_NAMESPACE}`),
  new RegExp(`^${BUN_BUILTIN_NAMESPACE}`),
];

export function isNodeLikeBuiltin(id: string): boolean {
  return isBuiltin(nodeLikeBuiltins, id);
}
