# Limina Troubleshooting Reference

Failure-by-failure cause and fix for the error classes Limina emits. Use this when a command fails — search for the leading error sentence (`grep`-friendly).

## Config loading

### `Unable to find limina config. Searched for limina.config.mjs from <cwd> up to the pnpm workspace root at <root>.`

- **Cause**: No `limina.config.mjs` exists from cwd upward through the workspace root.
- **Fix**: Run `limina init` (or `limina init --yes` in CI), or create the file manually, or pass `--config <path>`.

### `Unable to find limina config at <path>`

- **Cause**: An explicit `--config <path>` was passed but the file does not exist.
- **Fix**: Correct the path, or remove `--config` to let Limina search.

### `no pnpm-workspace.yaml was found in this directory or its parents.`

- **Cause**: Limina cannot infer the workspace root.
- **Fix**: Add `pnpm-workspace.yaml` at the workspace root, or run the command from inside an existing workspace.

### `Unable to load Limina config at <path>: config file must be inside the governed pnpm workspace at <root>.`

- **Cause**: `--config <path>` points outside the pnpm workspace.
- **Fix**: Move the config inside the workspace, or pass a path that resolves under the inferred root.

### `Invalid Limina checker config: ... reason: checker entry must be a non-empty string path.`

- **Cause**: A `config.checkers.<name>` entry is missing `entry` or has an empty value.
- **Fix**: Set `entry: 'tsconfig.build.json'` (or the project's equivalent graph aggregator).

### `Invalid Limina checker config: ... reason: extensions may only be omitted for built-in presets.`

- **Cause**: A non-built-in preset name (anything other than `tsc` / `tsgo` / `vue-tsc` / `vue-tsgo` / `svelte-check`) does not declare `extensions`.
- **Fix**: Either switch to a built-in preset OR declare `extensions: ['.foo']`. Custom presets also need a registered adapter — without one, Limina rejects the preset.

### `Invalid Limina checker config: ... reason: checker routes are not supported; move routes.build to entry and migrate routes.typecheck targets to tsconfig*.dts.json leaves reachable from that entry with local companions.`

- **Cause**: Old config shape with a `routes` field on a checker entry.
- **Fix**: Rename `routes.build` → `entry`. Convert each `routes.typecheck` target into a `tsconfig*.dts.json` leaf reachable from `entry`, paired with a local companion.

### `Unsupported Limina checker preset:`

- **Cause**: The preset name has no registered adapter.
- **Fix**: Use `tsc`, `tsgo`, `vue-tsc`, `vue-tsgo`, or `svelte-check`.

## Graph check

### `Invalid declaration leaf compiler option:`

- **Cause**: A `tsconfig*.dts.json` final-resolved compilerOptions do not satisfy: `composite: true`, `incremental: true`, `noEmit: false`, `declaration: true`, `emitDeclarationOnly: true`.
- **Fix**: Set the offending option to the required value. Most projects centralize these in a shared `tsconfig.dts.base.json` and extend it.

### `Missing declaration leaf output option:`

- **Cause**: The leaf is missing `rootDir`, `outDir`, or `tsBuildInfoFile`.
- **Fix**: Add explicit values so declaration output and tsbuildinfo files do not collide across leaves in the same directory.

### `Missing typecheck companion config:`

- **Cause**: A `tsconfig*.dts.json` exists but its paired ordinary `tsconfig*.json` does not.
- **Fix**: Create the companion. Pair by replacing `.dts.json` with `.json` (e.g. `tsconfig.lib.dts.json` ↔ `tsconfig.lib.json`).

### `Typecheck option mismatch between declaration leaf and companion config:`

- **Cause**: A type-affecting compilerOption diverges between the leaf and the companion. Compared options include `strict*`, `target`, `module`, `moduleResolution`, `lib`, `types`, `typeRoots`, `customConditions`, `jsx`, `jsxImportSource`, `verbatimModuleSyntax`, etc.
- **Fix**: Move shared type semantics into a base config that both extend, or align the values. Do not redeclare type-affecting options in the leaf — keep them in the companion.

### `Declaration leaf includes files missing from its companion typecheck config:`

- **Cause**: The leaf's resolved `files` set is not a subset of the companion's.
- **Fix**: Update `include`/`files` so the companion covers every file the leaf emits.

### `Project reference crosses workspace packages without a workspace:* dependency:`

- **Cause**: A leaf references a leaf in another workspace package but the importing package does not declare a `workspace:*` dependency on the target package.
- **Fix**: Add `"<target-pkg>": "workspace:*"` to dependencies/devDependencies/peerDependencies/optionalDependencies in the importing package's `package.json`. If the package intentionally consumes the artifact, REMOVE the project reference instead.

### `Denied graph access:`

- **Cause**: A labeled dts leaf references or imports a target that matches the rule's `deny.refs` or `deny.deps`.
- **Fix**: Either remove the offending reference/import, OR remove the label, OR (rarely) relax the deny rule. The reason printed in the error is the rule's `reason` field — it tells the human what the rule is trying to prevent.

### `Cross-package relative import:`

- **Cause**: A file uses a `../../<other-package>/...` relative import to reach another workspace package.
- **Fix**: Replace the relative import with the package specifier (e.g. `@acme/other`). Workspace packages must depend through their package exports.

### `Workspace source dependency resolved outside the source graph:` / `Referenced workspace dependency resolves through package exports to a build artifact:`

- **Cause**: A `workspace:*` import resolved to a file that the source graph does not own — typically because the dep's `package.json#exports` points at `dist`.
- **Fix**: Either change the dep's exports to point at source files (long-term), OR run `limina paths generate` and add the generated file as the first `extends` entry of the importing leaf (transitional bridge).

### `Workspace source import resolved outside the workspace graph:`

- **Cause**: A `workspace:*` import resolved to a non-workspace file.
- **Fix**: Confirm the dep is actually a workspace package and is published correctly inside the workspace. Otherwise switch the dep to an artifact protocol.

### `Unresolved workspace import:`

- **Cause**: A specifier matches a workspace package by name but TypeScript could not resolve a file.
- **Fix**: Verify the dep's `package.json#exports` includes the requested subpath. Add or correct the export entry.

### `Missing project reference for workspace import:`

- **Cause**: An import resolves to a file owned by another leaf, but the importing leaf does not list a project reference to it.
- **Fix**: Add `{ "path": "../<target>/tsconfig.<scope>.dts.json" }` to the importing leaf's `references`.

### `Expected graph target is not reachable from any checker entry:`

- **Cause**: An import maps to a leaf that exists on disk but no checker entry's transitive references include it.
- **Fix**: Add the missing reference chain — extend an aggregator (`tsconfig*.build.json`) so it can reach the leaf.

## Source check

### `Source file has no package owner:`

- **Cause**: A file checked by the leaf has no `package.json` ancestor inside the workspace.
- **Fix**: Ensure the file is inside a workspace package directory, OR exclude it from the leaf.

### `Tsconfig source file set mixes package owners:`

- **Cause**: A non-aggregator leaf and/or its companion span more than one nearest-`package.json` owner.
- **Fix**: Move files so the leaf stays within one owner. Aggregators may span owners; leaves and their companions must not.

### `Relative import escapes package owner scope:`

- **Cause**: A relative path in a source file resolves into a different package's directory.
- **Fix**: Replace the relative import with the target package's name.

### `Unauthorized bare package import:`

- **Cause**: An imported package is not listed in `dependencies` or `devDependencies` of the importing package. (Limina also tells you if it found the package in `peerDependencies` or `optionalDependencies` — those are NOT authorizing.)
- **Fix**: Add the package to the appropriate authorized section in the importing package's manifest.

### `Unauthorized package import specifier:` / `Unresolved package import specifier:` / `Package import escapes package owner scope:`

- **Cause**: A `#xxx` package-import specifier (1) does not match any `package.json#imports` key, (2) cannot be resolved, OR (3) resolves outside the owner package's directory.
- **Fix**: Add the corresponding key to `package.json#imports` and ensure the target file is inside the same package.

## Proof check

### `DTS config is not reachable from any checker entry:`

- **Cause**: A `tsconfig*.dts.json` exists but no checker entry's transitive references include it.
- **Fix**: Add it to the relevant aggregator chain, OR delete the orphan file.

### `Duplicate checker graph declaration owner:`

- **Cause**: The same dts leaf is reachable from two different graph-capable checker entries.
- **Fix**: Each dts leaf must be owned by exactly one graph-capable entry. Split the entries' aggregator trees.

### `Duplicate checker graph coverage:`

- **Cause**: The same source file is included by two declaration leaves' configs.
- **Fix**: Move the file into one leaf only, or narrow `include`/`exclude` patterns.

### `Build graph config is not a pure aggregator:` / `Default tsconfig.json is not a pure aggregator:`

- **Cause**: The config has keys other than `$schema`, `files`, `references`, OR `files` is not an empty array.
- **Fix**: Remove `include`, `compilerOptions`, `extends`, etc. from the aggregator. Source inputs and options belong in leaves.

### `Default tsconfig.json references a non-typecheck config:`

- **Cause**: A `tsconfig.json` aggregator references `tsconfig*.dts.json` or `tsconfig*.build.json`.
- **Fix**: Reference only ordinary `tsconfig*.json` files. The default `tsconfig.json` is the IDE/typecheck entry, not the build graph.

### `Directory with typecheck environments is missing default tsconfig.json:`

- **Cause**: A directory contains `tsconfig.<scope>.json` but no `tsconfig.json`.
- **Fix**: Add `tsconfig.json` — as a leaf if there is only one environment, or as an aggregator with `references` if there are multiple.

### `Single typecheck environment should use default tsconfig.json:`

- **Cause**: A directory has only one ordinary scoped `tsconfig.<scope>.json` and a separate `tsconfig.json`.
- **Fix**: Merge the scoped config into `tsconfig.json` (or rename it). One environment per directory should live in `tsconfig.json`.

### `Directory with multiple typecheck environments must use tsconfig.json as an aggregator:`

- **Cause**: A directory has multiple environments but `tsconfig.json` does not have `references`.
- **Fix**: Convert `tsconfig.json` into a pure aggregator referencing the scoped configs.

### `DTS config is not valid for tsc -b:` (reason `compilerOptions.composite must be true` / `noEmit must not be true`)

- **Cause**: The leaf's resolved options are wrong for declaration emit through `tsc -b`.
- **Fix**: Set `composite: true`, ensure `noEmit` is not `true`, set `declaration: true`, `emitDeclarationOnly: true`.

### `DTS config file set does not match its strict local tsconfig:`

- **Cause**: The leaf and companion have different file lists.
- **Fix**: Align `include`/`files` so they cover the same files.

### `DTS config overrides a typecheck compiler option from its strict local tsconfig:`

- **Cause**: The leaf redeclares a type-affecting compilerOption with a different value than the companion.
- **Fix**: Remove that option from the leaf, or update the companion to match.

### `Source files are not covered by typecheck proof:`

- **Cause**: A file in `config.source` boundary is not covered by any checker entry's reachable projects and is not in `proof.allowlist`.
- **Fix**: Extend a checker entry to cover it (preferred), OR add an explicit allowlist entry with a reason.

### `Typecheck proof allowlist references a missing file:` / `Typecheck proof allowlist file is outside the configured source boundary:` / `Typecheck proof allowlist file is already covered without the allowlist:`

- **Cause**: An allowlist entry is stale or unnecessary.
- **Fix**: Delete the entry or fix the path. Allowlist exists only for files inside the source boundary that no checker entry can cover.

## Checker run

### `Missing checker peer dependencies:`

- **Cause**: A configured preset's required peer (`typescript` for `tsc`, `@typescript/native-preview` for `tsgo`, `vue-tsc`, `vue-tsgo`, or `svelte-check`) is not installed.
- **Fix**: Run the `pnpm add -D <packages>` command Limina prints at the bottom of the error.

### `Checker entry references a missing tsconfig:`

- **Cause**: `config.checkers.<name>.entry` points to a file that does not exist.
- **Fix**: Create the file or correct the path. `limina init` would create it from scratch if the workspace has not been bootstrapped.

### `Checker entry has no declaration leaf targets:`

- **Cause**: The entry's transitive references contain no `tsconfig*.dts.json`.
- **Fix**: Add `references` to leaves through aggregators, OR remove the checker entry if it has nothing to check.

### `DTS leaf companion config is missing:` (during checker run)

- **Cause**: A reachable leaf has no paired companion file.
- **Fix**: Create the companion (`tsconfig.<scope>.json`).

### `No source-only checker entries configured.`

- **Cause**: `limina checker typecheck` found no configured `vue-tsgo` or `svelte-check` entries.
- **Fix**: This is OK if all configured checkers are first-class build checkers. Add a source-only checker only when you need direct framework checker execution outside `checker build`; prefer `vue-tsc` when Vue checks need TypeScript project-reference boundaries or incremental build behavior.

### `Typecheck failed for N config(s):`

- **Cause**: One or more no-emit typecheck runs returned non-zero. Each failing config is printed below the summary.
- **Fix**: Open each file and fix the type errors reported by the underlying checker. Limina forwards the checker's stdio so the actual TypeScript errors are above the summary line.

## Paths

### `TypeScript graph path state is stale; run \`limina paths generate\`, ...`

- **Cause**: `limina paths check` found a difference between expected and on-disk generated files.
- **Fix**: Run `limina paths generate`, commit the changes, and ensure each affected leaf extends the generated file as the FIRST entry.

### Generated file content is re-emitted on every run

- **Cause**: The leaf does not `extends` the generated file first. Limina re-resolves imports without the generated `paths`, which yields a different result.
- **Fix**: Add the generated file as `extends[0]` in the affected leaves.

## Package check

### `outDir package.json not found for <label> at <path>. Run the package build first.`

- **Cause**: `outDir` does not exist or has no `package.json`.
- **Fix**: Build the package first (`pnpm build`), and confirm `outDir` points at the publish-ready directory, not the source directory.

### `publint found N issue(s):` / `attw found N problem(s):` / `package boundary found N issue(s):`

- **Cause**: Individual tool failures. Each issue is logged above the summary line with the exact rule that failed.
- **Fix**: Read each issue line, address it in the build output (fix exports, fix types, remove an unauthorized import, add a missing dependency to the output manifest, add the package to `boundary.ignoredExternalPackages` if it's an intentional shim, etc.).

### `No package entries are configured.` / `No package entry named "..." is configured.`

- **Cause**: `package.entries` is empty, or `--package <name>` does not match any configured entry.
- **Fix**: Add an entry to the config, or remove/correct `--package`.

### `No package entries have "<tool>" enabled.` / `No package checks are enabled.`

- **Cause**: `--tool <name>` resolved to zero runnable entries across the selection.
- **Fix**: Either add the tool to the entry's `checks` array, or drop `--tool` from the command.

## Release check

### `Release tarball is not publishable:`

- **Cause**: The selected release output cannot be published cleanly. Common causes include `private: true`, missing `README.md`/`LICENSE.md`, packed `*.map` files, or JavaScript files with `sourceMappingURL` comments.
- **Fix**: Remove `private: true` from publishable output manifests, copy README/license files into the packed output, exclude source map files from the package, and strip source map directives from emitted JavaScript.

### `No package name was found from cwd up to the workspace root.`

- **Cause**: `limina release check` was run without `--package` outside a configured package directory, or the nearest `package.json` has no `name`.
- **Fix**: Run from a package directory whose `package.json#name` matches `package.entries[].name`, or pass `--package <name>`.

## Pipelines

### `Pipeline instruction "<name>" was not found.`

- **Cause**: `limina check <name>` was called but `pipelines[<name>]` is undefined.
- **Fix**: Define the pipeline in `limina.config.mjs#pipelines`, or run `limina check` (no arg) for the default pipeline.

### `Pipeline command step must not be empty.`

- **Cause**: A pipeline step string contained only whitespace.
- **Fix**: Replace the empty step with a built-in task name or a proper command.

### `default check blocked at <step>` / `pipeline blocked: <name> at <step>`

- **Cause**: A step failed; remaining steps are reported as skipped.
- **Fix**: Open the failing step's logs above the summary and address its root cause. Limina stops at the first failure to avoid burying real errors.
