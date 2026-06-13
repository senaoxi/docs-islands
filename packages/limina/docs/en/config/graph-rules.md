# Graph Rules

Graph rules are keyed by labels declared in source `tsconfig*.json` files. Limina copies those labels into the generated declaration leaves under `.limina/`.

```js
import { defineConfig } from 'limina';

export default defineConfig({
  graph: {
    rules: {
      'runtime-client': {
        deny: {
          refs: [
            {
              path: 'packages/app/src/node/tsconfig.lib.json',
              reason: 'client runtime must not depend on Node runtime',
            },
          ],
          deps: [
            {
              name: 'node:*',
              reason: 'browser output must stay free of Node builtins',
            },
            {
              name: '@acme/internal-node',
              reason: 'browser output must not consume Node-only packages',
            },
          ],
        },
        allow: {
          refs: [
            {
              path: 'packages/app/src/generated/tsconfig.lib.json',
              reason: 'generated declarations are wired by the build pipeline',
            },
          ],
        },
      },
    },
  },
});
```

## rules.\<label\>

- **Type:** `Record<string, GraphRule>`

The `rules` key must match an entry in `liminaOptions.graphRules` in a source tsconfig. A source config can list multiple labels, and Limina merges the matching rules for its generated declaration leaf.

Pair the rule with labels in the source config:

```jsonc
{
  "liminaOptions": {
    "graphRules": ["runtime-client"],
  },
  "include": ["src/**/*.ts"],
}
```

Source covered by that config now uses `graph.rules.runtime-client`.

## allow.refs

- **Type:** `Array<{ path: string; reason: string }>`

`allow.refs` uses the same entry shape as `deny.refs`, but it only allows extra declared references that static import analysis cannot prove. It does not make denied references valid, and `deny.refs` still wins if the same path is both allowed and denied.

Generated references are inferred from source imports. `allow.refs` remains available for compatibility diagnostics around extra references, but user config should prefer source tsconfig paths and `limina graph prepare` owns generated reference output.

## deny.refs

- **Type:** `Array<{ path: string; reason: string }>`

`deny.refs` forbids a labeled project from referencing a specific source tsconfig's generated declaration leaf. It is useful for boundaries such as "client runtime must not depend on server runtime" or "public API must not depend on internal tools".

For example, if the rule contains:

```jsonc
{
  "path": "packages/app/src/node/tsconfig.lib.json",
  "reason": "client runtime must not depend on Node runtime",
}
```

and a `runtime-client` generated leaf references the generated Node-only leaf, `limina graph check` fails and prints the configured reason.

In a fuller example, the repository can look like this:

```text
packages/app/
  src/client/tsconfig.lib.json
  src/node/tsconfig.lib.json
  src/client/main.ts
  src/node/read-file.ts
```

The client source config is labeled `runtime-client`; Limina generates the references:

```jsonc
// packages/app/src/client/tsconfig.lib.json
{
  "liminaOptions": {
    "graphRules": ["runtime-client"],
  },
  "include": ["main.ts"],
}
```

When `pnpm exec limina graph check` runs, Limina prepares the generated graph, finds reachable generated declaration leaves, and reads each leaf's `references`. When it sees the `runtime-client` generated leaf referencing the generated project for `packages/app/src/node/tsconfig.lib.json`, it compares that source path with `graph.rules.runtime-client.deny.refs`.

The result is a graph check failure that points at the forbidden project reference and prints the configured `reason`. This means the problem is not just one import line; the TypeScript graph itself now says client runtime depends on Node runtime.

## deny.deps

- **Type:** `Array<{ name: string; reason: string }>`

`deny.deps` forbids source imports of selected packages, `#imports`, or Node builtins. `name` can be a package name, a `#subpath` such as `#server/*`, `fs`, `node:fs`, or `node:*` for all Node builtins.

If source covered by the labeled leaf contains:

```ts
// packages/app/src/client/load.ts
import { readFileSync } from 'node:fs';
import { createServerClient } from '@acme/internal-node';
```

`limina graph check` matches `node:*` and `@acme/internal-node` through the `runtime-client` rule and prints the configured reason. Browser/runtime boundaries are then verified by config and real imports, not just team convention.

The matching directory can look like this:

```text
packages/app/
  src/client/tsconfig.lib.json
  src/client/load.ts
packages/internal-node/
  src/index.ts
```

The module imports denied dependencies:

```ts
// packages/app/src/client/load.ts
import { readFileSync } from 'node:fs';
import { createServerClient } from '@acme/internal-node';
```

When `pnpm exec limina graph check` runs, Limina parses imports from `src/client/load.ts` with TypeScript. Because the file belongs to a leaf configured with `liminaOptions.graphRules: ["runtime-client"]`, Limina compares each resolved specifier with `deny.deps`: `node:fs` matches `node:*`, and `@acme/internal-node` matches the package rule.

The result is a graph check failure with the configured reason for each match. Reviewers can immediately see that browser runtime code imported Node-only capabilities instead of guessing whether those imports will break in the browser.
