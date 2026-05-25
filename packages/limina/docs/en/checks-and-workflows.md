# Checks & Workflows

Limina commands are small on purpose. Each one checks one layer of the repository, and `limina check` composes the common layers together.

## Limina's pnpm Monorepo Standard

Limina does not judge whether a pnpm monorepo is well-formed by one fixed folder template. The core standard is simpler: every dependency edge should say the same thing in source imports, `package.json`, TypeScript project references, package exports, and built output.

When those layers agree, a reviewer can answer three questions quickly:

- Who owns this file?
- Is this package using another package as source, or as a built artifact?
- Is the same edge visible to TypeScript, pnpm, and the package consumer?

In practice, that leads to a few repository rules.

First, make package ownership obvious. A source file belongs to the nearest `package.json`. A leaf `tsconfig` should stay inside one package owner, and relative imports should not jump into another package. If `packages/app` needs code from `packages/core`, import `@acme/core`, declare the source import in `dependencies` or `devDependencies`, and let the package export describe the public entry. `peerDependencies` and `optionalDependencies` can describe consumer contracts, but they do not by themselves authorize a source file to import the package. That keeps the boundary visible instead of hiding it in `../../core/src`.

Second, use dependency protocols to say what kind of relationship you want. `workspace:*` means "this is a source dependency inside the workspace". Limina expects that edge to have a matching declaration project reference and source-facing resolution. If the package should be consumed like an installed output, use `link:`, `file:`, `catalog:`, or a semver range instead, and do not keep a project reference for that edge. In short: source dependency means source graph; artifact dependency means package output.

Third, keep the TypeScript graph split by responsibility. A `tsconfig.build.json` should be a pure aggregator with `files: []` and `references`. Each buildable source boundary should have a `tsconfig*.dts.json` declaration leaf for `tsc -b`, plus a local `tsconfig*.json` companion for normal strict typechecking. The declaration leaf explains "what this project builds and references"; the companion explains "how this source should be checked while editing".

Fourth, prefer source-facing package exports for workspace source dependencies. TypeScript resolves package imports through exports, even inside a monorepo. If `@acme/app` depends on `@acme/core` with `workspace:*` but `@acme/core` exports `dist`, the source graph is quietly reading a built artifact. The cleanest fix is to expose source entries for the development graph. Generated `paths` are useful as a compatibility bridge, but they should be explicit, checked in, and reviewed.

Fifth, make coverage provable. Every source file inside Limina's configured source boundary should be covered by a checker entry, a declaration graph project, or a documented allowlist entry. This is why Limina cares about checker entries, local companions, and allowlist reasons: it should be clear which files are checked, which files are generated or exceptional, and why.

Finally, check the published shape separately. Source graph checks prove the workspace is coherent while developing. `package check` proves the built package directory works for consumers: exports, types, runtime imports, README, and license. A healthy pnpm monorepo usually has both workflows: one for PR-time source governance, and one for release-time package output.

The shortest version is: packages own files, manifests own dependency intent, project references own source graph edges, exports own public entrypoints, and package checks own the final artifact. Limina works best when those responsibilities do not blur together.

## Default Check

```sh
pnpm exec limina check
```

The default check runs:

1. `graph:check`
2. `source:check`
3. `proof:check`
4. `checker:typecheck`

Use it as the normal local and PR command once the repository is configured.

It fits well after a local change, before commit, and in pull request CI. When it passes, the source dependency graph, package ownership, coverage proof, and local typechecks agree at the usual development layer. It does not include package output checks, so release flows should still build first and then run `package check`.

## Graph Check

```sh
pnpm exec limina graph check
```

Graph check asks: "Do TypeScript project references match the source imports?"

It checks:

- missing project references for workspace imports;
- cross-package relative imports;
- `workspace:*` dependencies that resolve to build artifacts;
- declaration leaf compiler options required by `tsc -b`;
- local companion parity for important typecheck options;
- label-based deny rules for refs and package dependencies;
- cross-package references that do not have a matching `workspace:*` dependency.

When this fails, read the importing file and the expected reference first. The fix is usually to add a project reference, change the dependency protocol, expose source from package exports, or tighten a graph rule.

For example, `@acme/app` imports `@acme/core`, but app's declaration leaf does not reference core. Graph check points at the importing file, the referenced project, and the current references. Once fixed, real source imports, the `workspace:*` dependency, and TypeScript project references describe the same edge, so the PR does not merge an invisible cross-package dependency.

## Source Check

```sh
pnpm exec limina source check
```

Source check asks: "Does each source file belong to the package that is using it?"

It checks:

- each checked source file has a nearest `package.json` owner;
- one leaf config does not mix several package owners;
- relative imports do not escape the owner package;
- bare package imports are declared in `dependencies` or `devDependencies`;
- `#imports` match the nearest package's `imports` field and stay inside that package.

Use this to keep package ownership boring and easy to review.

For example, `packages/app/src/main.ts` might reach into another package through `../core/src/foo`, or import `zod` without declaring it in the nearest `package.json`. After the fix, cross-package dependencies go through package exports and manifests, which is easier to review and closer to how consumers use the package.

## Proof Check

```sh
pnpm exec limina proof check
```

Proof check asks: "Can we prove the source files are covered by the graph, checker entries, or explicit exceptions?"

It checks:

- every `tsconfig*.dts.json` is reachable from a checker entry;
- every declaration leaf has a strict local companion;
- declaration leaves and companions include the same files and typecheck semantics;
- build graph configs are pure aggregators;
- default `tsconfig.json` files use the expected role;
- source files are covered by graph projects, checker entries, or `proof.allowlist`;
- allowlist entries have a non-empty file and reason.

Use allowlists for generated files or intentional exceptions, and keep the reason useful for reviewers.

For example, `packages/core/src/generated/runtime.d.ts` may be produced by a build step and not covered by a normal checker entry. Proof check asks you to either include it in checker coverage or document it in `proof.allowlist` with a file and reason. The team can then see which files are really checked and which exceptions are intentional.

## Checker Typecheck and Build

```sh
pnpm exec limina checker typecheck
pnpm exec limina checker build
```

`checker typecheck` discovers reachable declaration leaves from each checker entry, maps them to local companions, and runs the checker in no-emit mode.

`checker build` runs supported checker entries in build mode. The built-in presets are:

| Preset         | Typecheck | Build | Default files       |
| -------------- | --------- | ----- | ------------------- |
| `tsc`          | yes       | yes   | TypeScript and JSON |
| `vue-tsc`      | yes       | yes   | `.vue`              |
| `svelte-check` | yes       | no    | `.svelte`           |

Use `--concurrency <n>` with `checker typecheck` when you want to limit parallel checker processes.

Run `checker typecheck` after source, `tsconfig`, Vue/Svelte, or checker config changes. Run `checker build` when declaration output or the build graph itself needs confirmation. Limina discovers the targets from checker entries and invokes the right tool, so framework files are handled by framework checkers instead of being forced into a plain `tsc -b` graph.

## Paths Generate and Check

```sh
pnpm exec limina paths generate
pnpm exec limina paths check
```

Paths generation helps with one specific compatibility case: a package is declared as `workspace:*`, the graph says it should be consumed as source, but its package exports still point to build artifacts.

Limina can generate `tsconfig.dts.paths.generated.json` files with source-facing aliases. It does not inject them automatically. Add the generated file manually as the first entry in the relevant declaration leaf's `extends` array.

Use `paths check` in CI to fail when generated files are stale.

For example, `@acme/core` still exports `dist`, but `@acme/app` consumes it with `workspace:*` as a source dependency. Graph check reports artifact resolution; `paths generate` writes source aliases. After you add the generated config as the first `extends` entry in the declaration leaf, `paths check` can catch stale aliases when exports or source entries change.

## Package Check

```sh
pnpm exec limina package check
pnpm exec limina package check --package @acme/core
pnpm exec limina package check --tool publint
```

Package check asks: "Would the built package work for consumers?"

It runs configured targets from `packageChecks.targets`:

- `publint` checks package metadata and publish-time issues;
- `attw` checks type resolution with Are The Types Wrong;
- `boundary` scans emitted JavaScript imports for runtime and dependency boundary violations.

Public package outputs must include `README.md` and `LICENSE.md` unless the output `package.json` sets `private: true`.

Build first, then run package checks.

For example, source typechecking may pass while `packages/core/dist/package.json` points `types` at a missing declaration file, or browser output still imports `node:fs`. Package check fails at the built-output layer. It validates the directory consumers install, not only the development-time source tree.

## Custom Pipelines

Use `pipelines` when your repository needs a named workflow:

```js
export default defineConfig({
  pipelines: {
    package: ['checker:build', 'package:check'],
    publish: [
      'graph:check',
      'source:check',
      'proof:check',
      'checker:typecheck',
      'checker:build',
      'package:check',
    ],
  },
});
```

Run them with:

```sh
pnpm exec limina check package
pnpm exec limina check publish
```

Pipeline steps can be built-in Limina tasks or external commands. Object-form command steps are best when arguments, `cwd`, or environment variables need to be unambiguous.

Teams can turn common flows such as "PR check", "pre-publish check", or "package output only" into named entrypoints. CI, package scripts, and local commands then share the same order. For example, `limina check publish` can run graph/source/proof/typecheck, build, and package output checks without each CI job hand-writing that sequence.
