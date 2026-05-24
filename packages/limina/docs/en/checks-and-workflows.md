# Checks & Workflows

Limina commands are small on purpose. Each one checks one layer of the repository, and `limina check` composes the common layers together.

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

## Paths Generate and Check

```sh
pnpm exec limina paths generate
pnpm exec limina paths check
```

Paths generation helps with one specific compatibility case: a package is declared as `workspace:*`, the graph says it should be consumed as source, but its package exports still point to build artifacts.

Limina can generate `tsconfig.dts.paths.generated.json` files with source-facing aliases. It does not inject them automatically. Add the generated file manually as the first entry in the relevant declaration leaf's `extends` array.

Use `paths check` in CI to fail when generated files are stale.

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
