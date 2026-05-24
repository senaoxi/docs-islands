# limina

`limina` is an architecture governance CLI for TypeScript monorepos. Its goal is not to replace TypeScript, but to bring TypeScript project references, source typechecks, build graph boundaries, compatibility path generation, published package checks, and custom pipelines into one explicit configuration file.

For a small project, `tsc --noEmit` may be enough. Once a repository contains multiple workspace packages, Node/runtime/client code, docs/playground/smoke projects, Vue SFCs, build-tool scripts, and published package checks, a single tsconfig usually cannot serve IDE usage, source checking, `tsc -b`, package publishing, and consumer validation at the same time. Limina is designed for that kind of repository.

## When to use Limina

Limina is a good fit when your project:

- uses pnpm workspaces to manage multiple packages;
- uses TypeScript project references or plans to migrate to a `tsc -b` build graph;
- wants to enforce dependency direction between production code, tools, and tests;
- maintains both browser/client runtime and Node/server runtime code;
- wants CI to prove that every source file is covered by checker entries or allowlist;
- wants to check package exports, type resolution, and runtime import boundaries before publishing dist packages;
- has docs, playground, smoke, Vue SFC, or similar projects that do not fit cleanly inside native `tsc -b`.

Limina is not intended to:

- replace bundlers such as Rolldown, Rollup, Vite, or tsup;
- replace `tsc` or `vue-tsc`;
- publish npm packages for you;
- act as a hidden preset. Limina prefers explicit configuration; all rules should live in `limina.config.mjs`.

## Core concepts

### 1. Checker entry

The checker entry is the single root configured at `config.checkers.<name>.entry`. It usually points at a `tsconfig*.build.json` graph aggregator and reaches multiple `tsconfig*.dts.json` declaration leaf projects.

This layer is used to:

- build or check the declaration graph with `tsc -b` when the checker supports build execution;
- derive `checker:typecheck` targets from the same reachable declaration leaves;
- verify that project references match real imports;
- enforce boundaries such as production, tools, tests, runtime-client, and runtime-node;
- detect incorrect combinations of workspace source dependencies and package exports.

Recommended naming:

```text
tsconfig.build.json               # root or package-level graph aggregator
tsconfig.lib.dts.json           # production declaration leaf
tsconfig.tools.dts.json         # tooling/build script declaration leaf
tsconfig.test.dts.json          # test declaration leaf
```

### 2. Declaration leaf and local companion

Every reachable `tsconfig*.dts.json` leaf should have a strict ordinary typecheck companion. `checker:typecheck` runs no-emit checks against those companions.

Recommended pairs:

```text
tsconfig.lib.dts.json    <->    tsconfig.lib.json
tsconfig.tools.dts.json  <->    tsconfig.tools.json
tsconfig.test.dts.json   <->    tsconfig.test.json
```

The root `tsconfig.json` can still serve IDE and local development needs. A directory with one ordinary type environment should use `tsconfig.json` as the local leaf; a directory with multiple ordinary type environments should make `tsconfig.json` a pure aggregator with `files: []` and `references`.

If `tsconfig.json` contains `references`, it must be a pure aggregator: no `include`, no `compilerOptions`, no `extends`, and no emit or `noEmit` settings. If `tsconfig.json` contains source entries such as `include` or `files`, it is a leaf and must not contain `references`.

### 3. Source dependency and artifact dependency

Limina uses dependency protocols in package manifests to infer dependency semantics.

`workspace:*` means a source dependency:

- it should be represented by TypeScript project references;
- package exports should preferably point to source entries;
- the importing project should reference the declaration leaf that owns the imported source.

`link:`, `file:`, `catalog:`, or normal semver means an artifact dependency:

- it usually should not be represented by a project reference;
- it should be treated as an already built or already published artifact;
- published outputs should be verified by package checks and consumer checks.

This distinction matters. TypeScript project references do not automatically rewrite package exports. Even if project A references project B, an import such as `import '@scope/b'` is still resolved through B's package exports. Therefore, if B's workspace exports point to `dist` while A wants to consume B as source, you need to either change exports or use Limina's generated paths compatibility mechanism.

### 4. Package artifact checks

Passing the source graph only proves that the source layer is relatively consistent. It does not prove that the package installed by consumers is correct.

`limina package check` runs checks against built outputs under `packageChecks.targets[].outDir`:

- `publint`: checks package manifest, exports, files, and other publish-time issues;
- `attw`: uses Are The Types Wrong to check type resolution issues;
- `boundary`: scans built `.js` imports and verifies dependency declarations, self exports, and Node/browser runtime boundaries.

Build dist first, then run package checks before publishing.

## Installation

Run this from the workspace root:

```sh
pnpm add -D limina typescript
```

If a workspace package needs to call `limina` from its own `package.json#scripts`, add it to that package's `devDependencies` as well:

```json
{
  "devDependencies": {
    "limina": "workspace:*"
  }
}
```

## Quick initialization

For a pnpm monorepo that has not yet adopted Limina declaration graph semantics, run this from any directory inside the workspace:

```sh
pnpm exec limina init
```

`limina init` searches upward from the current directory for the nearest `pnpm-workspace.yaml`, displays the workspace root path and root package name, and asks for confirmation. For automation or non-interactive environments, use:

```sh
pnpm exec limina init --yes
```

`--yes` accepts root selection, creation of a missing root `package.json`, and overwriting an existing `limina.config.mjs` or conflicting `limina:check` script. Without `--yes`, the command fails in a non-TTY environment as soon as confirmation is required.

Initialization:

- discovers pnpm workspace packages and scans ordinary `tsconfig*.json` typecheck configs;
- generates a paired `tsconfig[.<scope>].dts.json` for each valid leaf, emitting declarations into a colocated `.limina/` directory;
- resolves real source imports with each leaf's TypeScript `compilerOptions`, including workspace package imports, relative cross-leaf imports, and `#imports`;
- adds a project reference when the resolved target is owned by another leaf, deduplicating repeated targets and never producing self-references;
- generates a `tsconfig.build.json` for each workspace that has declaration leaves, and a root `tsconfig.build.json` that references those aggregators and any root-owned leaves;
- generates `limina.config.mjs`, and adds a `limina:check` script plus a missing `limina` dev dependency to the root `package.json`.

Empty aggregators are not written: if a workspace or the root has no actual `references`, its `tsconfig.build.json` is omitted.

Initialization conservatively refuses these inputs instead of overwriting or migrating them:

- an existing `tsconfig*.build.json` or `tsconfig*.dts.json`, because these are reserved init output names;
- a `tsconfig.json` that has both `references` and actual source files;
- a `tsconfig.<scope>.json` that contains `references`;
- a `workspace:*` import that TypeScript cannot map to an ordinary `tsconfig*.json` leaf, such as an entry resolving to an unmanaged declaration file in `dist`.

After initialization, run:

```sh
pnpm i
pnpm limina:check
```

You only need `pnpm i` first when init added a dependency or created the root `package.json`.

## Minimal configuration

Create `limina.config.mjs` at the workspace root:

```js
import { defineConfig } from 'limina';

export default defineConfig({
  config: {
    checkers: {
      typescript: {
        preset: 'tsc',
        entry: 'tsconfig.build.json',
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
    "typecheck": "limina check typecheck"
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
├─ tsconfig.build.json
├─ tsconfig.lib.build.json
├─ tsconfig.dts.base.json
├─ limina.config.mjs
└─ packages/
   └─ core/
      ├─ tsconfig.json
      ├─ tsconfig.build.json
      ├─ tsconfig.lib.json
      ├─ tsconfig.lib.dts.json
      ├─ tsconfig.tools.json
      ├─ tsconfig.tools.dts.json
      ├─ tsconfig.test.json
      └─ tsconfig.test.dts.json
```

The root `tsconfig.dts.base.json` can contain only build-mode options needed by declaration leaves:

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

The declaration leaf extends the local config and dts base, and only adds declaration output paths and references:

```jsonc
{
  "extends": ["./tsconfig.json", "../../tsconfig.dts.base.json"],
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "./.tsbuild",
    "tsBuildInfoFile": "./.tsbuild/lib.tsbuildinfo",
  },
  "references": [
    {
      "path": "../utils/tsconfig.lib.dts.json",
    },
  ],
}
```

## Configuration details

### `config.checkers`

```js
const liminaConfig = {
  config: {
    checkers: {
      typescript: {
        preset: 'tsc',
        entry: 'tsconfig.build.json',
      },
      vue: {
        preset: 'vue-tsc',
        entry: 'tsconfig.vue.build.json',
      },
      svelte: {
        preset: 'svelte-check',
        entry: 'tsconfig.svelte.build.json',
      },
    },
  },
};
```

`config.checkers` is the single entrypoint for TypeScript and UI framework checking. Every configured checker must declare `entry`. `entry` must be a non-empty string resolved from the workspace root. `routes`, `routes.typecheck`, and `routes.build` are invalid configuration.

`checker:build` starts from each configured checker entry that supports build execution. `checker:typecheck` starts from the same entry, discovers reachable `tsconfig*.dts.json` leaves, and runs the checker's no-emit execution against the paired local companion.

Built-in presets can omit `extensions`. Defaults are `.ts`, `.tsx`, `.cts`, `.mts`, `.d.ts`, `.d.cts`, `.d.mts`, `.json` for `tsc`; `.vue` for `vue-tsc`; and `.svelte` for `svelte-check`. Explicit `extensions` replace the preset default.

### `config.source`

```js
const liminaConfig = {
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

If `source.include` is omitted, `proof:check` derives the effective source boundary from all configured checker extensions. If `source.include` is present, that list is the complete source boundary and checker extensions are not merged in. `source.exclude` always filters from the effective source boundary; it never decides which modules are valid by itself.

### `graph.rules`

```js
const liminaConfig = {
  graph: {
    rules: {
      'runtime-client': {
        deny: {
          refs: [
            {
              path: 'packages/app/src/node/tsconfig.lib.dts.json',
              reason: 'client runtime must not depend on node runtime',
            },
          ],
          workspaceDeps: [
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

Declare the label in a declaration leaf:

```jsonc
{
  "limina": "runtime-client",
  "extends": ["./tsconfig.json", "../../tsconfig.dts.base.json"],
  "references": [],
}
```

When that project references or imports a denied target, `limina graph check` fails and prints the configured reason.

### `paths`

```js
const liminaConfig = {
  paths: {
    generatedFileName: 'tsconfig.dts.paths.generated.json',
    conditionPriority: ['source', 'development', 'types'],
    artifactDirectories: ['dist', 'build', 'lib', 'esm', 'cjs', 'out'],
  },
};
```

Use case: a `workspace:*` dependency still points to `dist` in package exports, but is also consumed as a source dependency inside the build graph. Run:

```sh
pnpm exec limina paths generate
```

Limina generates `tsconfig.dts.paths.generated.json` and tells you to add it as the first entry in the related declaration leaf's `extends` array:

```jsonc
{
  "extends": [
    "./tsconfig.dts.paths.generated.json",
    "./tsconfig.json",
    "../../tsconfig.dts.base.json",
  ],
}
```

Treat generated paths as a migration bridge, not a long-term default architecture. The long-term solution is to make package exports for workspace source dependencies point directly to source entries.

### Checker coverage

```js
const liminaConfig = {
  config: {
    checkers: {
      vue: {
        preset: 'vue-tsc',
        entry: 'tsconfig.vue.build.json',
      },
    },
  },
};
```

Checker entries cover files validated by TypeScript or framework-aware tools. Common examples include Vue SFCs, Svelte components, VitePress docs, themes, and special fixture projects. Check-only projects still need `tsconfig*.dts.json` leaves so Limina can prove coverage and derive their local companions, but those leaves do not have to represent publishable artifacts.

### `proof.allowlist`

```js
const liminaConfig = {
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

Allowlist is the last resort after all configured checker entries fail to cover a source file. Every entry must explain why it is safe. New allowlist entries should be reviewed strictly during code review.

### `packageChecks.targets`

```js
const liminaConfig = {
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
pnpm exec limina package check
```

Run a single package:

```sh
pnpm exec limina package check --package @acme/core
```

Run only one tool:

```sh
pnpm exec limina package check --package @acme/core --tool publint
pnpm exec limina package check --package @acme/core --tool attw
pnpm exec limina package check --package @acme/core --tool boundary
```

Temporarily override the ATTW profile:

```sh
pnpm exec limina package check --package @acme/core --attw-profile strict
```

### `pipelines`

```js
const liminaConfig = {
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

### `limina init [--yes]`

Generates declaration leaves, graph aggregators, root configuration, and a `limina:check` script for an uninitialized pnpm monorepo.

```sh
pnpm exec limina init
pnpm exec limina init --yes
```

The command derives leaf-to-leaf `references` from TypeScript's resolution of real imports, deduplicates references, and excludes self-references. It fails when `tsconfig*.build.json` or `tsconfig*.dts.json` already exist so existing graph semantics are not overwritten.

### `limina check <pipeline>`

Runs a named pipeline from `limina.config.mjs#pipelines`.

```sh
pnpm exec limina check typecheck
pnpm exec limina check package
pnpm exec limina check publish
```

### `limina graph check`

Checks architecture policy for the build graph.

```sh
pnpm exec limina graph check
```

Common failure reasons:

- a source import does not have a matching project reference;
- a production declaration leaf references a test/tools leaf;
- a project with a `limina` label violates `graph.rules`;
- a `workspace:*` dependency resolves to a build artifact through exports;
- client/shared runtime imports a disallowed runtime boundary.

### `limina proof check`

Proves that checker entries, reachable declaration leaves, local companions, default `tsconfig.json` governance, and the source boundary are consistent.

```sh
pnpm exec limina proof check
```

Common failure reasons:

- a declaration leaf has no paired local config;
- a declaration leaf is not reachable from any checker entry;
- the declaration leaf and local config do not cover the same file set;
- compiler options that affect type semantics drift between the declaration leaf and local companion;
- `tsconfig.json` is neither the single local leaf nor a pure aggregator for multiple local environments;
- a source file is not covered by checker entries or allowlist.

### `limina paths generate`

Generates source paths compatibility configs.

```sh
pnpm exec limina paths generate
```

To make CI fail when generated files are stale:

```sh
pnpm exec limina paths check
```

### `limina checker typecheck`

Runs typecheck targets derived from every configured checker entry.

```sh
pnpm exec limina checker typecheck
pnpm exec limina checker typecheck --concurrency 4
```

`limina checker build` runs build execution for configured checker entries whose preset supports it.

```sh
pnpm exec limina checker build
```

### `limina package check`

Checks built package outputs.

```sh
pnpm exec limina package check
pnpm exec limina package check --package @acme/core
pnpm exec limina package check --tool boundary
```

Build the relevant package first. Otherwise the `outDir` may not contain publish-ready outputs and the check will fail.

## Recommended workflows

### Local development

```sh
pnpm exec limina checker typecheck
pnpm exec limina graph check
```

### Pull request checks

```sh
pnpm exec limina check typecheck
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
pnpm exec limina package check
pnpm exec limina check publish
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
      - run: pnpm exec limina check typecheck

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
      - run: pnpm exec limina package check
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

### 2. Declaration leaves should only contain build-mode differences

`tsconfig*.dts.json` should extend the paired local config and only add:

- `composite`;
- `incremental`;
- `declaration` / `emitDeclarationOnly`;
- `rootDir`;
- `outDir`;
- `tsBuildInfoFile`;
- direct `references`.

Do not secretly change type semantics such as `strict`, `types`, or `lib` inside declaration leaves.

### 3. Prefer fixing package exports over relying on generated paths forever

Generated paths are a compatibility bridge. The long-term design should make package exports for workspace source dependencies point directly to source entries, then rewrite source exports to dist exports during publish builds.

### 4. Run both source checks and package checks

`graph:check` and `proof:check` protect source architecture. `package:check` protects the artifact that consumers install. They are not interchangeable.

### 5. Keep allowlists small and explicit

Every allowlist entry should answer:

- Why is this file not part of the graph?
- Which checker entry, build step, or runtime mechanism covers it?
- Where will CI fail if it breaks?

## FAQ

### How does `limina checker typecheck` choose targets?

`limina checker typecheck` loads `limina.config.mjs`, walks every configured checker `entry`, discovers reachable `tsconfig*.dts.json` leaves, maps each leaf to its paired local companion, and runs the checker in no-emit/typecheck mode for those companions.

### Why do package checks require a build first?

Package checks inspect published outputs under `outDir`, not the source directory. Without a prior build, `outDir/package.json`, JavaScript files, or declaration files may not exist, so the result would not be meaningful.

### Why do workspace exports pointing to dist cause graph problems?

`tsc -b` project references tell TypeScript about build order and declaration redirects, but they do not rewrite package exports. When source code imports a package name, TypeScript still resolves it from the package manifest. If exports point to dist, the source graph mixes in artifact resolution.

### Should Vue SFCs be placed in the graph?

Usually no. Put Vue/VitePress/SFC projects behind a checker `entry` with the `vue-tsc` preset, typically a dedicated `tsconfig.vue.build.json` graph aggregator. Docs and other check-only projects should add `tsconfig*.dts.json` declaration leaves that point to their local companions, even when those leaves only serve checking and proof coverage.

### When should I use `--mode`?

Use `--mode` when `limina.config.mjs` exports a function and returns different config by environment:

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
pnpm exec limina --mode ci check typecheck
```

## Maintainer release checklist

Before publishing `limina` itself, check that:

- `package.json#private` has been removed or set to `false`;
- `package.json#files` includes the README files, user guides, bin, and dist files you want to publish;
- `pnpm build` has generated dist;
- the dist `package.json` has `exports`, `types`, and `bin` pointing at built files;
- `pnpm test` passes;
- `pnpm typecheck` or an equivalent source graph check passes;
- `pnpm exec limina package check --package limina` or an equivalent check passes;
- `npm pack --dry-run` does not omit key files;
- the README and user guide are in sync with the CLI implementation.

## Glossary

- **declaration leaf**: a `tsconfig*.dts.json` project that owns declaration emit semantics and direct references.
- **graph aggregator**: a `tsconfig*.build.json` graph config that only contains `files: []` and `references`.
- **local companion config**: the ordinary typecheck config paired with a declaration leaf, such as `tsconfig.lib.json` or `tsconfig.json`.
- **checker entry**: the single configured root for a checker, used by both build execution and typecheck target discovery.
- **artifact dependency**: a built or published artifact dependency consumed through `link:`, `file:`, `catalog:`, or semver.
- **source dependency**: a source dependency consumed through `workspace:*` and expected to be represented in TypeScript project references.

## License

MIT
