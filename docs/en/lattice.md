# @docs-islands/lattice

`@docs-islands/lattice` is an architecture governance CLI for TypeScript monorepos. Its goal is not to replace TypeScript, but to bring TypeScript project references, source typechecks, build graph boundaries, compatibility path generation, published package checks, and custom pipelines into one explicit configuration file.

For a small project, `tsc --noEmit` may be enough. Once a repository contains multiple workspace packages, Node/runtime/client code, docs/playground/smoke projects, Vue SFCs, build-tool scripts, and published package checks, a single tsconfig usually cannot serve IDE usage, source checking, `tsc -b`, package publishing, and consumer validation at the same time. Lattice is designed for that kind of repository.

## When to use Lattice

Lattice is a good fit when your project:

- uses pnpm workspaces to manage multiple packages;
- uses TypeScript project references or plans to migrate to a `tsc -b` build graph;
- wants to enforce dependency direction between production code, tools, and tests;
- maintains both browser/client runtime and Node/server runtime code;
- wants CI to prove that every source file is covered by checker routes or allowlist;
- wants to check package exports, type resolution, and runtime import boundaries before publishing dist packages;
- has docs, playground, smoke, Vue SFC, or similar projects that do not fit cleanly inside native `tsc -b`.

Lattice is not intended to:

- replace bundlers such as Rolldown, Rollup, Vite, or tsup;
- replace `tsc` or `vue-tsc`;
- publish npm packages for you;
- act as a hidden preset. Lattice prefers explicit configuration; all rules should live in `lattice.config.mjs`.

## Core concepts

### 1. Build graph route

The build graph route is the route used by native TypeScript build mode. It usually starts from a root `tsconfig.graph.json` and reaches multiple `tsconfig*.build.json` leaf projects.

This layer is used to:

- build or check the declaration graph with `tsc -b`;
- verify that project references match real imports;
- enforce boundaries such as production, tools, tests, runtime-client, and runtime-node;
- detect incorrect combinations of workspace source dependencies and package exports.

Recommended naming:

```text
tsconfig.graph.json               # root or package-level graph aggregator
tsconfig.lib.build.json           # production source build leaf
tsconfig.tools.build.json         # tooling/build script build leaf
tsconfig.test.build.json          # test build leaf
```

### 2. Typecheck route

The typecheck route is the route used by editors and ordinary `tsc --noEmit`. It usually starts from a root `tsconfig.json` and reaches ordinary local configs such as `tsconfig.lib.json`, `tsconfig.tools.json`, and `tsconfig.test.json`.

This layer is used for:

- IDE experience;
- ordinary source typechecking;
- same-name companion comparison with build leaves;
- making sure every build leaf has a strict local typecheck config.

Recommended pairs:

```text
tsconfig.lib.build.json    <->    tsconfig.lib.json
tsconfig.tools.build.json  <->    tsconfig.tools.json
tsconfig.test.build.json   <->    tsconfig.test.json
```

### 3. Source dependency and artifact dependency

Lattice uses dependency protocols in package manifests to infer dependency semantics.

`workspace:*` means a source dependency:

- it should be represented by TypeScript project references;
- package exports should preferably point to source entries;
- the importing project should reference the build leaf that owns the imported source.

`link:`, `file:`, `catalog:`, or normal semver means an artifact dependency:

- it usually should not be represented by a project reference;
- it should be treated as an already built or already published artifact;
- published outputs should be verified by package checks and consumer checks.

This distinction matters. TypeScript project references do not automatically rewrite package exports. Even if project A references project B, an import such as `import '@scope/b'` is still resolved through B's package exports. Therefore, if B's workspace exports point to `dist` while A wants to consume B as source, you need to either change exports or use Lattice's generated paths compatibility mechanism.

### 4. Package artifact checks

Passing the source graph only proves that the source layer is relatively consistent. It does not prove that the package installed by consumers is correct.

`lattice package check` runs checks against built outputs under `packageChecks.targets[].outDir`:

- `publint`: checks package manifest, exports, files, and other publish-time issues;
- `attw`: uses Are The Types Wrong to check type resolution issues;
- `boundary`: scans built `.js` imports and verifies dependency declarations, self exports, and Node/browser runtime boundaries.

Build dist first, then run package checks before publishing.

## Installation

Run this from the workspace root:

```sh
pnpm add -D @docs-islands/lattice typescript
```

If a workspace package needs to call `lattice` from its own `package.json#scripts`, add it to that package's `devDependencies` as well:

```json
{
  "devDependencies": {
    "@docs-islands/lattice": "workspace:*"
  }
}
```

## Minimal configuration

Create `lattice.config.mjs` at the workspace root:

```js
import { defineConfig } from '@docs-islands/lattice/config';

export default defineConfig({
  config: {
    checkers: {
      typescript: {
        preset: 'tsc',
        routes: {
          typecheck: 'tsconfig.json',
          build: 'tsconfig.graph.json',
        },
      },
    },
  },
  pipelines: {
    typecheck: ['graph:check', 'proof:check', 'checker:typecheck', 'checker:build'],
  },
});
```

Add a root script:

```json
{
  "scripts": {
    "typecheck": "lattice check typecheck"
  }
}
```

Run it:

```sh
pnpm typecheck
```

## Recommended TypeScript config structure

A typical workspace can be organized like this:

```text
.
├─ tsconfig.json
├─ tsconfig.graph.json
├─ tsconfig.lib.graph.json
├─ tsconfig.graph.base.json
├─ lattice.config.mjs
└─ packages/
   └─ core/
      ├─ tsconfig.json
      ├─ tsconfig.graph.json
      ├─ tsconfig.lib.json
      ├─ tsconfig.lib.build.json
      ├─ tsconfig.tools.json
      ├─ tsconfig.tools.build.json
      ├─ tsconfig.test.json
      └─ tsconfig.test.build.json
```

The root `tsconfig.graph.base.json` can contain only build-mode options needed by build leaves:

```jsonc
{
  "compilerOptions": {
    "composite": true,
    "incremental": true,
    "noEmit": false,
    "declaration": true,
    "emitDeclarationOnly": true,
    "declarationMap": false,
  },
}
```

The local typecheck config owns strict type semantics:

```jsonc
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ESNext"],
    "types": ["node"],
  },
  "include": ["src/"],
}
```

The build leaf extends the local config and graph base, and only adds build output paths and references:

```jsonc
{
  "extends": ["./tsconfig.lib.json", "../../tsconfig.graph.base.json"],
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "./.tsbuild",
    "tsBuildInfoFile": "./.tsbuild/lib.tsbuildinfo",
  },
  "references": [
    {
      "path": "../utils/tsconfig.lib.build.json",
    },
  ],
}
```

## Configuration details

### `config.checkers`

```js
const latticeConfig = {
  config: {
    checkers: {
      typescript: {
        preset: 'tsc',
        routes: {
          typecheck: 'tsconfig.json',
          build: 'tsconfig.graph.json',
        },
      },
      vue: {
        preset: 'vue-tsc',
        routes: {
          typecheck: 'tsconfig.vue.json',
          build: 'tsconfig.vue.graph.json',
        },
      },
      svelte: {
        preset: 'svelte-check',
        routes: {
          typecheck: 'tsconfig.svelte.json',
        },
      },
    },
  },
};
```

`config.checkers` is the single entrypoint for TypeScript and UI framework checking. A checker without `routes` is ignored. A checker with `routes: {}` is invalid. `routes.typecheck` participates in `lattice checker typecheck` / `checker:typecheck`; `routes.build` participates in `lattice checker build` / `checker:build`.

Built-in presets can omit `extensions`. Defaults are `.ts`, `.tsx`, `.cts`, `.mts`, `.d.ts`, `.d.cts`, `.d.mts`, `.json` for `tsc`; `.vue` for `vue-tsc`; and `.svelte` for `svelte-check`. Explicit `extensions` replace the preset default.

### `config.source`

```js
const latticeConfig = {
  config: {
    source: {
      include: ['**/*.{ts,tsx,cts,mts}', '**/*.d.{ts,cts,mts}', '**/*.json'],
      exclude: [
        'node_modules',
        'dist',
        '.git',
        '.tsbuild',
        'coverage',
        '**/tsconfig*.json',
        '**/package.json',
      ],
    },
  },
};
```

If `source.include` is omitted, `proof:check` derives the effective source boundary from all active checker extensions. If `source.include` is present, that list is the complete source boundary and checker extensions are not merged in. `source.exclude` always filters from the effective source boundary; it never decides which modules are valid by itself.

### `graph.rules`

```js
const latticeConfig = {
  graph: {
    rules: {
      'runtime-client': {
        deny: {
          refs: [
            {
              path: 'packages/app/src/node/tsconfig.lib.build.json',
              reason: 'client runtime must not depend on node runtime',
            },
          ],
          deps: [
            {
              name: '@acme/node-only',
              reason: 'client runtime must not consume node-only packages',
            },
          ],
        },
      },
    },
  },
};
```

Declare the label in a build leaf:

```jsonc
{
  "lattice": "runtime-client",
  "extends": ["./tsconfig.lib.json", "../../tsconfig.graph.base.json"],
  "references": [],
}
```

When that project references or imports a denied target, `lattice graph check` fails and prints the configured reason.

### `paths`

```js
const latticeConfig = {
  paths: {
    generatedFileName: 'tsconfig.graph.paths.generated.json',
    conditionPriority: ['source', 'development', 'types'],
    artifactDirectories: ['dist', 'build', 'lib', 'esm', 'cjs', 'out'],
  },
};
```

Use case: a `workspace:*` dependency still points to `dist` in package exports, but is also consumed as a source dependency inside the build graph. Run:

```sh
pnpm exec lattice paths generate
```

Lattice generates `tsconfig.graph.paths.generated.json` and tells you to add it as the first entry in the related build config's `extends` array:

```jsonc
{
  "extends": [
    "./tsconfig.graph.paths.generated.json",
    "./tsconfig.lib.json",
    "../../tsconfig.graph.base.json",
  ],
}
```

Treat generated paths as a migration bridge, not a long-term default architecture. The long-term solution is to make package exports for workspace source dependencies point directly to source entries.

### Checker coverage

```js
const latticeConfig = {
  config: {
    checkers: {
      vue: {
        preset: 'vue-tsc',
        routes: {
          typecheck: 'docs/tsconfig.json',
        },
      },
    },
  },
};
```

Checker routes cover files that do not enter the TypeScript build graph but are still validated by a framework-aware tool. Common examples include Vue SFCs, Svelte components, VitePress docs, themes, and special fixture projects.

### `proof.allowlist`

```js
const latticeConfig = {
  proof: {
    allowlist: [
      {
        file: 'src/generated/runtime.d.ts',
        reason: 'Generated declaration-only runtime shim copied into dist.',
      },
    ],
  },
};
```

Allowlist is the last resort after all configured checker routes fail to cover a source file. Every entry must explain why it is safe. New allowlist entries should be reviewed strictly during code review.

### `packageChecks.targets`

```js
const latticeConfig = {
  packageChecks: {
    targets: [
      {
        name: '@acme/core',
        outDir: 'packages/core/dist',
        checks: ['publint', 'attw', 'boundary'],
        publint: {
          strict: true,
        },
        attw: {
          profile: 'esm-only',
        },
        boundary: {
          environment: (file) => (file.startsWith('node/') ? 'node' : 'browser'),
          ignoredExternalPackages: ['@acme/runtime-shim'],
        },
      },
    ],
  },
};
```

`outDir` must point to the already-built, publish-ready package output directory. It should contain the built `package.json`, JavaScript files, and type declarations.

Run all package checks:

```sh
pnpm exec lattice package check
```

Run a single package:

```sh
pnpm exec lattice package check --package @acme/core
```

Run only one tool:

```sh
pnpm exec lattice package check --package @acme/core --tool publint
pnpm exec lattice package check --package @acme/core --tool attw
pnpm exec lattice package check --package @acme/core --tool boundary
```

Temporarily override the ATTW profile:

```sh
pnpm exec lattice package check --package @acme/core --attw-profile strict
```

### `pipelines`

```js
const latticeConfig = {
  pipelines: {
    typecheck: ['graph:check', 'proof:check', 'checker:typecheck', 'checker:build'],
    package: [
      {
        type: 'command',
        command: 'pnpm',
        args: ['build'],
      },
      'package:check',
    ],
  },
};
```

A pipeline can contain two types of steps:

- built-in tasks: `graph:check`, `proof:check`, `checker:typecheck`, `checker:build`, `package:check`;
- command steps: expressed as `{ type: 'command', command, args, cwd, env }`.

Command steps run from the workspace root by default and inherit `process.env`.

## CLI reference

### `lattice check <pipeline>`

Runs a named pipeline from `lattice.config.mjs#pipelines`.

```sh
pnpm exec lattice check typecheck
pnpm exec lattice check package
pnpm exec lattice check publish
```

### `lattice graph check`

Checks architecture policy for the build graph.

```sh
pnpm exec lattice graph check
```

Common failure reasons:

- a source import does not have a matching project reference;
- a production build leaf references a test/tools leaf;
- a project with a `lattice` label violates `graph.rules`;
- a `workspace:*` dependency resolves to a build artifact through exports;
- client/shared runtime imports a disallowed runtime boundary.

### `lattice proof check`

Proves that the build graph route, typecheck route, and source boundary are consistent.

```sh
pnpm exec lattice proof check
```

Common failure reasons:

- a build leaf has no same-name local config;
- a local config is not reachable from the root typecheck route;
- the build leaf and local config do not cover the same file set;
- a source file is not covered by checker routes or allowlist.

### `lattice paths generate`

Generates source paths compatibility configs.

```sh
pnpm exec lattice paths generate
```

To make CI fail when generated files are stale:

```sh
pnpm exec lattice paths check
```

### `lattice checker typecheck`

Runs every configured checker `typecheck` route. The route registry in `config.checkers` is the only target source.

```sh
pnpm exec lattice checker typecheck
pnpm exec lattice checker typecheck --concurrency 4
```

`lattice checker build` runs configured checker `build` routes.

```sh
pnpm exec lattice checker build
```

### `lattice package check`

Checks built package outputs.

```sh
pnpm exec lattice package check
pnpm exec lattice package check --package @acme/core
pnpm exec lattice package check --tool boundary
```

Build the relevant package first. Otherwise the `outDir` may not contain publish-ready outputs and the check will fail.

## Recommended workflows

### Local development

```sh
pnpm exec lattice checker typecheck
pnpm exec lattice graph check
```

### Pull request checks

```sh
pnpm exec lattice check typecheck
```

A recommended `typecheck` pipeline includes:

1. building any internal tools needed before graph checks;
2. `graph:check`;
3. `proof:check`;
4. `checker:typecheck`;
5. `checker:build` when build-mode validation is required.

### Pre-publish checks

```sh
pnpm build
pnpm exec lattice package check
pnpm exec lattice check publish
```

A recommended `publish` pipeline includes at least:

- `graph:check`;
- `proof:check`;
- building all packages to be published;
- `package:check`;
- consumer docs/playground/smoke typechecks;
- `npm pack --dry-run` or an equivalent verification.

## CI example

```yaml
name: Typecheck

on:
  pull_request:
  push:
    branches: [main]

jobs:
  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20.19.0
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec lattice check typecheck

  package-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20.19.0
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - run: pnpm exec lattice package check
```

## Best practices

### 1. Do not put all source files into one giant tsconfig

In a large project, a package often contains production source, build tools, tests, fixtures, and docs at the same time. Split by responsibility:

- `lib`: production source;
- `tools`: build scripts, release scripts, rollup/rolldown/vite configs;
- `test`: unit tests and test utilities;
- `runtime-client`: browser runtime code;
- `runtime-node`: Node runtime code;
- `runtime-shared`: code shared between both runtimes.

### 2. Build leaves should only contain build-mode differences

`tsconfig*.build.json` should extend the same-name local config and only add:

- `composite`;
- `incremental`;
- `declaration` / `emitDeclarationOnly`;
- `rootDir`;
- `outDir`;
- `tsBuildInfoFile`;
- direct `references`.

Do not secretly change type semantics such as `strict`, `types`, or `lib` inside build leaves.

### 3. Prefer fixing package exports over relying on generated paths forever

Generated paths are a compatibility bridge. The long-term design should make package exports for workspace source dependencies point directly to source entries, then rewrite source exports to dist exports during publish builds.

### 4. Run both source checks and package checks

`graph:check` and `proof:check` protect source architecture. `package:check` protects the artifact that consumers install. They are not interchangeable.

### 5. Keep allowlists small and explicit

Every allowlist entry should answer:

- Why is this file not part of the graph?
- Which checker route, build step, or runtime mechanism covers it?
- Where will CI fail if it breaks?

## FAQ

### How does `lattice checker typecheck` choose targets?

`lattice checker typecheck` loads `lattice.config.mjs` and runs every active checker that declares `routes.typecheck`. One-off TypeScript projects should be added to `config.checkers.<name>.routes` instead of passed through a CLI override.

### Why do package checks require a build first?

Package checks inspect published outputs under `outDir`, not the source directory. Without a prior build, `outDir/package.json`, JavaScript files, or declaration files may not exist, so the result would not be meaningful.

### Why do workspace exports pointing to dist cause graph problems?

`tsc -b` project references tell TypeScript about build order and declaration redirects, but they do not rewrite package exports. When source code imports a package name, TypeScript still resolves it from the package manifest. If exports point to dist, the source graph mixes in artifact resolution.

### Should Vue SFCs be placed in the graph?

Usually no. Put Vue/VitePress/SFC projects in `config.checkers.<name>.routes` with the `vue-tsc` preset, then let `checker:typecheck` and `checker:build` dispatch the matching routes.

### When should I use `--mode`?

Use `--mode` when `lattice.config.mjs` exports a function and returns different config by environment:

```js
export default defineConfig(({ mode }) => ({
  pipelines: {
    typecheck:
      mode === 'ci'
        ? ['graph:check', 'proof:check', 'checker:typecheck', 'checker:build']
        : ['checker:typecheck'],
  },
}));
```

Run:

```sh
pnpm exec lattice --mode ci check typecheck
```

## Maintainer release checklist

Before publishing `@docs-islands/lattice` itself, check that:

- `package.json#private` has been removed or set to `false`;
- `package.json#files` includes the README files, user guides, bin, and dist files you want to publish;
- `pnpm build` has generated dist;
- the dist `package.json` has `exports`, `types`, and `bin` pointing at built files;
- `pnpm test` passes;
- `pnpm typecheck` or an equivalent source graph check passes;
- `pnpm exec lattice package check --package @docs-islands/lattice` or an equivalent check passes;
- `npm pack --dry-run` does not omit key files;
- the README and user guide are in sync with the CLI implementation.

## Glossary

- **build leaf**: a `tsconfig*.build.json` actually built or checked by `tsc -b`.
- **graph aggregator**: a graph config that only contains `files: []` and `references`.
- **local companion config**: the ordinary typecheck config paired with a build leaf, such as `tsconfig.lib.json`.
- **checker route**: a `typecheck` or `build` route covered by a tool such as `tsc`, `vue-tsc`, or `svelte-check`.
- **artifact dependency**: a built or published artifact dependency consumed through `link:`, `file:`, `catalog:`, or semver.
- **source dependency**: a source dependency consumed through `workspace:*` and expected to be represented in TypeScript project references.

## License

MIT
