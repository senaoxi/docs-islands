# Limina Troubleshooting Reference

Failure-by-failure cause and fix for Limina error classes. Search for the leading error sentence.

## Config Loading

### `Unable to find limina config. Searched for limina.config.mjs from <cwd> up to the pnpm workspace root at <root>.`

- **Cause**: No `limina.config.mjs` exists from cwd upward through the workspace root.
- **Fix**: Run `limina init`, create the file manually, or pass `--config <path>`.

### `Unable to find limina config at <path>`

- **Cause**: Explicit `--config <path>` does not exist.
- **Fix**: Correct the path, or remove `--config` to let Limina search.

### `no pnpm-workspace.yaml was found in this directory or its parents.`

- **Cause**: Limina cannot infer the workspace root.
- **Fix**: Add `pnpm-workspace.yaml` at the workspace root, or run from inside the workspace.

### `config file must be inside the governed pnpm workspace`

- **Cause**: Explicit `--config` points outside the inferred pnpm workspace root.
- **Fix**: Move the config into the workspace or pass an in-workspace config path.

## Config Shape

### `config.checkers must be an object auto config or an object keyed by checker name.`

- **Cause**: `config.checkers` is neither omitted nor an object.
- **Fix**: Omit `config.checkers`, use `{ mode: 'auto', exclude: [] }`, or use named checker entries like `{ typescript: { preset: 'tsc', include: ['packages/*/tsconfig.json'] } }`.

### `Invalid Limina checker config: config.checkers`

- **Cause**: Auto checker config is not omitted or `{ mode: 'auto', exclude?: string[] }`.
- **Fix**: Omit `config.checkers`, or write `config.checkers: { mode: 'auto', exclude: [] }`.

### `auto checker config must not be mixed with named checker entries.`

- **Cause**: `config.checkers` contains `mode: 'auto'` and one or more named checker entries.
- **Fix**: Choose auto mode or manual named checker mode; do not combine them.

### `checker include must be a non-empty string array.`

- **Cause**: A manual checker is missing `include` or has an invalid value.
- **Fix**: Set `include` to workspace-root-relative selectors for ordinary `tsconfig.json` entry files.

### `Invalid Limina checker entry config`

- **Cause**: Checker entries are selected through `include`.
- **Fix**: Use `include: ['path/to/tsconfig.json']`.

### `Invalid Limina checker config: extensions`

- **Cause**: Built-in checker adapters resolve supported extensions.
- **Fix**: Keep manual checker config to `preset`, `include`, and optional `exclude`.

### `Invalid Limina checker config: routes`

- **Cause**: Source graph routing comes from selected source `tsconfig.json` entries, ordinary source references, and `liminaOptions.implicitRefs`.
- **Fix**: Configure source `tsconfig.json` entries through `include`; use ordinary source references or `liminaOptions.implicitRefs` for source edges.

### `Unsupported Limina checker preset:`

- **Cause**: Preset is not one of `tsc`, `tsgo`, `vue-tsc`, `vue-tsgo`, or `svelte-check`.
- **Fix**: Use a built-in preset.

### `unknown source config field.`

- **Cause**: The top-level `source` object contains a field other than `knip` or `importAuthority`.
- **Fix**: Remove unsupported fields. Tsconfig governance failures must be fixed by changing the relevant `tsconfig.json` coverage/reference shape.

### `Invalid Limina release config: ... release.contentHash`

- **Cause**: `release.contentHash` is not an object, or `baselineTag`/`builtinIgnore`/`ignore` has the wrong shape.
- **Fix**: Use non-empty string/function `baselineTag`, boolean `builtinIgnore`, and non-empty string glob patterns for `ignore`.

## Generated Graph

### `Checker include matched non-entry tsconfig files:`

- **Cause**: `checker.include` matched non-entry files such as `tsconfig.lib.json`.
- **Fix**: Match ordinary `tsconfig.json` entries only. Let those entries reach scoped configs through ordinary source references.

### `Source typecheck config declares project references:`

- **Cause**: A source leaf `tsconfig*.json` has `references`.
- **Fix**: Move IDE aggregation references to a solution-style `tsconfig.json`, or replace dynamic/virtual edges with `liminaOptions.implicitRefs`.

### `Invalid Limina implicit reference:`

- **Cause**: `liminaOptions.implicitRefs` has an invalid shape, self-reference, absolute path, missing target, or target that is not an ordinary source tsconfig.
- **Fix**: Use `{ path, reason }` entries where `path` is relative to the declaring source tsconfig and points to an existing ordinary source `tsconfig*.json`.

### `Duplicate Limina checker entry:`

- **Cause**: Two configured checkers directly select the same `tsconfig.json` entry after `include`/`exclude`.
- **Fix**: Narrow `config.checkers.<name>.include` or `exclude` so each entry config belongs to one checker.

### `Duplicate Limina checker ownership:`

- **Cause**: Two checkers with the same preset govern the same source tsconfig after solution references expand.
- **Fix**: Split or narrow checker selectors so only one checker owns that source config for the preset.

### `Source config contains files outside checker coverage:`

- **Cause**: A source config includes files outside the extension capability of the checker preset covering it.
- **Fix**: Add a checker with the needed capability through another `tsconfig.json` entry, or move the file to a config covered by the right checker.

### `Unsupported auto checker source file extension:`

- **Cause**: Auto mode found a source extension outside TypeScript/JavaScript/JSON/Vue support.
- **Fix**: Configure `config.checkers` manually with a suitable built-in checker, or move/exclude the unsupported file.

## Graph Check

### `Invalid declaration leaf compiler option:` / `Missing declaration leaf output option:`

- **Cause**: A generated declaration config does not satisfy build-safe emit options.
- **Fix**: Do not edit `.limina` by hand. Fix the source tsconfig/base options and rerun `limina graph prepare`; if generated output is stale, regenerate it.

### `Typecheck option mismatch between declaration leaf and companion config:`

- **Cause**: Generated declaration config and source config disagree on type-affecting compiler options.
- **Fix**: Align the source config and shared bases, then rerun graph preparation/checks.

### `Project reference crosses workspace packages without a declared dependency:`

- **Cause**: A generated cross-package reference exists but the importing package does not declare the target workspace package.
- **Fix**: Declare the target in `dependencies`, `devDependencies`, `peerDependencies`, or `optionalDependencies`; if consuming built output intentionally, remove the source edge and use an artifact dependency model.

### `Denied graph access:`

- **Cause**: A labeled generated project references or imports a target denied by `graph.rules`.
- **Fix**: Remove the offending edge/import, remove the label, or intentionally relax the rule.

### `Workspace source dependency resolved outside the source graph:` / `Referenced workspace dependency resolves through package exports to a build artifact:`

- **Cause**: A `workspace:*` source dependency resolves to a file Limina does not govern, commonly `dist`.
- **Fix**: Point source manifest exports at source files, or change the dependency to `link:`, `file:`, `catalog:`, or semver and remove the source graph edge.

### `Missing project reference for workspace import:`

- **Cause**: An import resolves to another governed source config, but the generated graph cannot prove the needed edge.
- **Fix**: Make the target reachable from selected `tsconfig.json` entries, or add `liminaOptions.implicitRefs` when the edge is dynamic/virtual.

### `Expected graph target is not reachable from any checker entry:`

- **Cause**: A target source config exists but no selected checker entry can reach it.
- **Fix**: Adjust `checker.include` or source `tsconfig.json` references so the target is inside checker coverage, then run `limina graph prepare`.

## Source Check

### `Source file has no package owner:`

- **Cause**: A governed source file has no `package.json` ancestor inside the workspace.
- **Fix**: Move it under a workspace package or exclude it from the relevant source config/boundary.

### `Tsconfig source file set mixes package owners:`

- **Cause**: Non-aggregator coverage spans more than one nearest package owner.
- **Fix**: Split the source config or move files so each non-aggregator source/config coverage stays within one package owner.

### `Relative import escapes package owner scope:`

- **Cause**: A relative import resolves into another package directory.
- **Fix**: Import through the target package name and public exports instead.

### `Unauthorized bare package import:`

- **Cause**: Imported package is not declared in the importing owner's dependency sections.
- **Fix**: Add it to `dependencies`, `devDependencies`, `peerDependencies`, or `optionalDependencies`.

### `Unauthorized package import specifier:` / `Package import resolves to another package owner:` / `Unresolved package import specifier:` / `Package import resolves outside package ownership:`

- **Cause**: A `#imports` specifier does not match `package.json#imports`, resolves to another workspace owner, cannot be resolved, or escapes the current owner without a declared artifact dependency.
- **Fix**: Correct `imports`, keep owner-local aliases inside the package, import other workspace packages by package name, or declare the artifact dependency.

### `Tsconfig search cannot determine module owner:` / `Source module belongs to multiple tsconfig governance units:`

- **Cause**: Upward bare `tsconfig.json` search cannot identify exactly one ordinary typecheck owner for a package-owned source module.
- **Fix**: Make one `tsconfig.json` between the module directory and workspace root include or reference exactly one owner config.

### `Invalid source Knip workspace config:`

- **Cause**: `source.knip.workspaces` is not package-keyed object config, or a key does not name a workspace package.
- **Fix**: Key entries by existing package names, for example `source.knip.workspaces["@example/app"]`.

### `Invalid source Knip workspace config: ... tsConfig`

- **Cause**: `source.knip.workspaces` accepts `entry`, `ignoreDependencies`, and `ignoreFiles`.
- **Fix**: Keep package-specific Knip config to those fields, or add a static package script such as `"build": "limina checker build tsconfig.json"` when the package needs a specific Knip tsconfig source.

### `Invalid source Knip entry config:` / `Invalid source Knip dependency ignore config:` / `Invalid source Knip file ignore config:`

- **Cause**: `entry`, `ignoreDependencies`, or `ignoreFiles` entries have invalid shape or stale package/file references.
- **Fix**: Use non-empty `files`/`dep`/`file` plus `reason`, and keep file globs inside the named package owner.

## Proof Check

### `Source-level DTS config is invalid:`

- **Cause**: Declaration configs are generated under `.limina`.
- **Fix**: Delete it from source. Limina generates declaration configs under `.limina` from checker `include` source tsconfigs.

### `Default tsconfig.json references a non-typecheck config:`

- **Cause**: A source `tsconfig.json` aggregator references a build/declaration/generated config.
- **Fix**: Reference only ordinary source `tsconfig*.json` files.

### `Build graph config is not a pure aggregator:` / `Default tsconfig.json is not a pure aggregator:`

- **Cause**: A pure aggregator has extra keys or non-empty `files`.
- **Fix**: Keep only `$schema`, `files: []`, `references`, and allowed Limina metadata. Move source inputs and compiler options into source leaves.

### `Directory with typecheck environments is missing default tsconfig.json:`

- **Cause**: A directory has scoped source environments but lacks a default `tsconfig.json`.
- **Fix**: Add `tsconfig.json` as a leaf for one environment or a pure aggregator for multiple environments.

### `Single typecheck environment should use default tsconfig.json:`

- **Cause**: A directory has only one ordinary scoped environment instead of using default `tsconfig.json`.
- **Fix**: Rename or merge the scoped config into `tsconfig.json`.

### `Directory with multiple typecheck environments must use tsconfig.json as an aggregator:`

- **Cause**: Multiple ordinary source environments exist but `tsconfig.json` is not a references aggregator.
- **Fix**: Convert `tsconfig.json` to a pure aggregator referencing the scoped configs.

### `DTS config file set does not match its local typecheck config:` / `DTS config overrides a typecheck compiler option from its local typecheck config:`

- **Cause**: Generated declaration config output differs from source config file/type semantics.
- **Fix**: Fix the source config/base config and regenerate `.limina` with `limina graph prepare`.

### `Duplicate checker graph coverage:`

- **Cause**: The generated checker graph covers the same source file through multiple declaration owners.
- **Fix**: Narrow source config `include`/`exclude` or checker selectors so each file has a single generated declaration owner for that checker graph.

### `Source files are not covered by typecheck proof:`

- **Cause**: A file in `config.source` is not covered by generated graph coverage, checker entry coverage, or `proof.allowlist`.
- **Fix**: Extend checker coverage or add an explicit allowlist entry with a reason.

### `Typecheck proof allowlist references a missing file:` / `Typecheck proof allowlist file is outside the configured source boundary:` / `Typecheck proof allowlist file is already covered without the allowlist:`

- **Cause**: An allowlist entry is stale, outside the boundary, or redundant.
- **Fix**: Delete the entry or fix the file path/boundary.

## Checker Run

### `Missing checker peer dependencies:`

- **Cause**: A configured preset's required package is not installed.
- **Fix**: Run the printed `pnpm add -D <packages>` command.

### `Unable to resolve build tsconfig:`

- **Cause**: `limina checker build [config]` could not find a source config from the argument or cwd.
- **Fix**: Pass an existing JSON config path, or run from a directory with a `tsconfig.json` in its workspace parent chain.

### `Invalid checker build config:`

- **Cause**: The selected config is outside the workspace, not JSON, a directory, or a generated `.limina` artifact.
- **Fix**: Pass an ordinary source tsconfig path.

### `No build-capable Limina checker found for source tsconfig:`

- **Cause**: The selected source config is governed only by typecheck-only checkers.
- **Fix**: Configure `tsc`, `tsgo`, or `vue-tsc` coverage for that source config.

### `Invalid Limina checker build preset:`

- **Cause**: `--preset` selected a build checker that does not reach the managed source target.
- **Fix**: Use one of the available presets printed in the error, or omit `--preset`.

### `Unknown option: --checker. Use --preset instead.`

- **Cause**: Checker build selects presets with `--preset`.
- **Fix**: Use `--preset tsc`, `--preset tsgo`, or `--preset vue-tsc`.

### `Unknown option: --project. Pass the config as a positional argument.`

- **Cause**: Checker build receives the config as a positional argument.
- **Fix**: Run `limina checker build path/to/tsconfig.json`.

### `checker typecheck does not accept --preset.` / `checker typecheck does not accept --watch.`

- **Cause**: These flags only apply to targeted checker build.
- **Fix**: Run `limina checker typecheck` with no config/preset/watch.

### `No second-class checker entries configured.`

- **Cause**: No `vue-tsgo` or `svelte-check` typecheck-only entries exist.
- **Fix**: This is okay if all configured checkers are build-capable.

## Check Issue Inventory

### `limina check --issues does not accept a pipeline name`

- **Cause**: `--issues` reads the last-run issue snapshot instead of running a pipeline.
- **Fix**: Drop the pipeline name, for example `limina check --issues --verbose`.

### `limina check --task, --checker, and --format require --issues`

- **Cause**: Last-run issue inventory filters were used while running the check pipeline.
- **Fix**: Add `--issues`, or remove those filters from the pipeline run.

### `Invalid check --issues --format "...". Expected one of: human, json, ndjson.`

- **Cause**: Unsupported issue inventory output format.
- **Fix**: Use `--format human`, `--format json`, or `--format ndjson`.

### `Unknown check --rule code "...".`

- **Cause**: `--rule` was given a value outside Limina's stable issue code list.
- **Fix**: Run `limina check --issues --rule --help` to see supported rule codes.

## Package Check

### `outDir package.json not found for <label> at <path>. Run the package build first.`

- **Cause**: `outDir` lacks a built package manifest.
- **Fix**: Build the package and ensure `outDir` points at publish-ready output.

### `output package.json exposes a pnpm-local dependency specifier`

- **Cause**: Built output manifest still exposes `workspace:`, `link:`, `file:`, or `catalog:`.
- **Fix**: Fix the dist manifest generation so published output has npm-compatible ranges.

### `publint found N issue(s):` / `attw found N problem(s):` / `package boundary found N issue(s):`

- **Cause**: Individual package tools found issues.
- **Fix**: Read each issue line and fix exports, types, runtime imports, output dependencies, or boundary config.

### `No package entries are configured.` / `No package entry named "..." is configured.`

- **Cause**: `package.entries` is empty, or `--package` does not match.
- **Fix**: Add the entry or correct the filter.

### `No package entries have "<tool>" enabled.` / `No package checks are enabled.`

- **Cause**: Tool selection resolves to no runnable checks.
- **Fix**: Enable the tool in `checks` or remove the `--tool` filter.

## Release Check

### `Release tarball is not publishable:`

- **Cause**: Output has `private: true`, missing README/license, source maps, or source map directives.
- **Fix**: Make packed output publishable.

### `output package manifest must not expose workspace:, link:, file:, or catalog: dependency specifiers`

- **Cause**: Release output still contains pnpm-local dependency specifiers.
- **Fix**: Fix the output manifest generation before publishing.

### `release.contentHash.baselineTag must resolve to a non-empty string`

- **Cause**: Configured `baselineTag` function returned an empty/non-string value.
- **Fix**: Return a non-empty dist-tag string.

### `release.contentHash.ignore must resolve to an array of non-empty strings or undefined`

- **Cause**: Configured `ignore` function returned an invalid value.
- **Fix**: Return `undefined` or an array of non-empty glob patterns.

### `No package name was found from cwd up to the workspace root.`

- **Cause**: `limina release check` ran without `--package` outside a configured package directory.
- **Fix**: Run from a configured package directory or pass `--package <name>`.

## Pipelines

### `Pipeline instruction "<name>" was not found.`

- **Cause**: `limina check <name>` was called but `pipelines[name]` is undefined.
- **Fix**: Define the pipeline or run `limina check` with no name.

### `Pipeline command step must not be empty.`

- **Cause**: A pipeline string step contained only whitespace.
- **Fix**: Replace it with a built-in task or command.

### `default check blocked at <step>` / `pipeline blocked: <name> at <step>`

- **Cause**: A step failed; remaining steps were skipped.
- **Fix**: Read the failing step's logs above the summary and address that root cause.
