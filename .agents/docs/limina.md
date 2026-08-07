# Limina implementation record

## Evidence boundary

This record describes Limina behavior and boundaries established by the current package source, tests, manifest, schema, root configuration, and executable command paths.

The supplied Codex memory is used only to identify prior corrections, questions, and human direction worth rechecking. It is not evidence that a behavior still exists. When memory, documentation, generated artifacts, and the current implementation disagree, inspect the current implementation first.

Internal module paths are evidence anchors. They are not public compatibility commitments unless they are exported by the package or enforced through a public command, configuration schema, diagnostic contract, or test.

This record is an unstamped AI draft. It has not been human-vouched.

## Current implementation

### Package and public surface

Limina is an independently built and published ESM CLI package. Its manifest currently declares version `0.2.0` and exposes:

- the `limina` executable through `bin/limina.js`
- the main module
- the TypeScript configuration schema
- the package manifest

The main module exports `defineConfig`, validation error classes, governance issue types, issue severity, and the public Limina configuration types.

The current CLI registers these command surfaces:

- `limina init`
- `limina migration`
- `limina check [pipeline]`
- `limina graph prepare`
- `limina graph check`
- `limina graph export`
- `limina proof check`
- `limina source check`
- `limina build <config>`
- `limina checker build [config]`
- `limina checker typecheck`
- `limina package check`
- `limina release check`

This list is a current implementation fact. It must be rechecked before documenting CLI compatibility or migration guidance.

### Configuration and execution model

A Limina configuration can currently define these top-level areas:

- `config`
- `execution`
- `graph`
- `package`
- `pipelines`
- `proof`
- `regions`
- `release`
- `source`

The configuration export may be a configuration object, a promise, or a function receiving the current command and mode.

`limina check` runs a built-in default plan when no named pipeline is selected. The current default task set is:

1. `graph:check`
2. `source:check`
3. `proof:check`
4. `checker:build`
5. `checker:typecheck`

Configured pipelines can compose built-in tasks and command steps. Pipeline execution does not make the exported dependency graph a task scheduler.

A check run creates one preflight context, an execution plan, structured issue collection, and run-summary metadata. The implementation can reuse preflight results within the run and disposes the preflight context when execution completes.

### Checker model

`config.checkers` supports automatic and explicit modes.

When the field is omitted, or when its mode is `auto`, generated-graph preparation discovers source configuration scopes from the validated workspace context. Each scope has one primary declaration-build owner: `vue-tsc` when any governed project owns `.vue` files, otherwise `tsc`. Dependency promotion can move a TypeScript consumer into the Vue-owned scope. Independently, each build-primary source config receives a live Astro capability, Svelte capability, or both when its resolved file set owns those extensions.

Astro and Svelte capabilities do not make those files declaration inputs. A mixed source config projects a wrapper solution over its declaration-compatible files and its framework scheduling references; a framework-only source config projects a transparent solution. No fake framework declarations are generated. Two build-capable checkers cannot own the same expanded source config, one supplemental family cannot occur twice for the same config, and Astro plus Svelte is a valid supplemental combination.

Explicit checker configuration uses named entries with `preset`, `include`, and optional `exclude` fields.

The built-in checker adapters currently have two execution classes:

| Preset         | Execution | Participates in source graph |
| -------------- | --------- | ---------------------------: |
| `tsc`          | build     |                          yes |
| `tsgo`         | build     |                          yes |
| `vue-tsc`      | build     |                          yes |
| `vue-tsgo`     | typecheck |                          yes |
| `svelte-check` | typecheck |                           no |

`checker:build` runs build-capable adapters. `checker:typecheck` runs explicit typecheck-only adapters plus the live per-leaf Astro and Svelte targets attached to build-primary source configs. Astro targets use `astro check --noSync --root <leaf> --tsconfig <config>` and require leaf-local `astro`, `@astrojs/check`, `typescript`, and `.astro/types.d.ts`; Svelte targets use `svelte-check --workspace <leaf> --tsconfig <config>` and require leaf-local `svelte-check`, `svelte`, and `typescript`. Limina does not run Astro sync or SvelteKit sync, enable Svelte incremental/cache paths, or provide framework watch mode. Target IDs are deterministic over the framework family and workspace-relative source config, so full reruns preserve identity without claiming incremental invalidation. A checker being available as a preset does not mean it is active in the current repository configuration.

The repository's `limina:typecheck` Nx target preserves this global checker-build meaning. Its task graph declares build dependencies for the workspace projects whose published artifacts are consumed by that global checker graph, so a fresh invocation does not depend on ignored `dist` state.

### Source configs and generated graph

Source-owned TypeScript configuration and Limina-generated configuration have different roles.

A source `tsconfig` is a TypeScript solution when the checker-resolved file list is empty and the config directly declares `references`; the resolved list includes `extends` and checker-supported extensions. Limina expands that role only at a path whose basename is exactly `tsconfig.json`. An ordinary source leaf with a `references` field is rejected, and a named solution such as `tsconfig.solution.json` is reported as an unsupported named solution during migration. A supported solution can route to referenced ordinary source configs, but it cannot declare `liminaOptions.outputs`.

Ordinary source leaves provide the compiler scope from which Limina creates generated declaration and build projects under the `.limina` artifact namespace. Generated files are outputs, not user-authored configuration authority. Generated declaration configs explicitly set both `compilerOptions.outDir` and `compilerOptions.declarationDir` to the same managed `.limina/dts` root, so inherited source declaration output settings cannot redirect checker declarations.

Framework import analysis uses leaf-local parser providers. Astro analysis resolves and initializes `@astrojs/compiler` before auto dependency promotion; Svelte analysis resolves `svelte/compiler`. Framework imports can add scheduling references between wrapper or transparent solutions, while the declaration-provider graph continues to contain only declaration-compatible source.

Generated declaration references currently come from two explicit evidence paths:

- `liminaOptions.implicitRefs`, which must resolve to an ordinary source config owned by the same checker scope
- source import analysis resolved through the checker-aware TypeScript declaration provider

Oxc resolution is used for runtime-like import analysis, but an Oxc-only resolution does not establish a TypeScript declaration provider. When Oxc resolves a specifier and TypeScript does not, generated declaration-reference preparation reports the mismatch instead of using the Oxc result as the type graph.

Cross-checker provider edges are permitted only when the implementation can select a compatible declaration provider. Generated references that cross incompatible checker build engines are rejected.

Migration plans JSONC changes as parser-derived local text edits. It reads each target's effective TypeScript config, including `extends`, before planning writes. It scans the complete reachable closure from the selected default entries, recursively expands every TypeScript solution, and aggregates all reachable named solutions with unsupported basenames before checking the worktree or writing a plan. A direct `compilerOptions.declarationDir` is removed only when it is equivalent to the planned single managed artifact root; a declarationDir-only leaf moves its relative path to `liminaOptions.outputs.outDir`, while split output, effective `outFile`, invalid direct values, and an internal solution-role invariant fail closed. Inherited declarationDir remains in its base config. It updates only Limina-governed schema, compiler, output, and source-reference fields while leaving unrelated comments, trailing commas, compact structures, and whitespace outside those fields intact; the existing transaction layer still owns drift checks, atomic replacement, rollback, and recovery.

Graph-rule labels are read from source configuration and projected onto generated declaration projects. Configured graph rules can constrain dependency names and project references for labeled projects.

### Workspace authority and regions

Limina locates the nearest ancestor `pnpm-workspace.yaml` and reads its package patterns. Workspace package discovery currently includes the workspace root manifest and manifests selected by those patterns.

The workspace model distinguishes two package collections:

- raw packages, which preserve the discovered pnpm workspace evidence
- authority packages, which remain after workspace-package exclusions, package-island validation, overlap checks, and region-boundary processing

Source ownership, package lookup, importer lookup, generated-graph selection, and workspace dependency authority use the validated authority model rather than treating every raw package as governed by the current run.

The validated workspace context records package identities, source config paths, descriptor candidates, output roots, region boundaries, and output mutation authorities.

Current region boundaries include package-scope boundaries and nested pnpm-workspace boundaries. A nested pnpm-workspace boundary stops the current governance region. Package-scope exclusions and optional package-scope extension are represented separately.

Workspace package names are optional during path-based discovery and source ownership. Name-dependent operations require a named package. For example, dependency graph nodes are keyed by package name, so an unnamed package can own source but cannot become a dependency graph node.

### Validation domains

Limina separates validation into distinct domains rather than treating every failure as one graph error.

`graph:check` validates generated project architecture, references, import-derived provider relationships, configured graph rules, condition domains, and relevant workspace export/type-entry relationships.

`source:check` validates source ownership and source-owner boundaries, package import authority, workspace dependency declarations, ambient declaration policy, resource declaration availability, and Knip-backed unused module and dependency findings when Knip analysis is enabled.

`proof:check` compares the configured source boundary with checker and graph coverage. Every source file in the proof boundary must be covered by a checker entry or an explicit allowlist entry. Allowlist entries require a reason and are themselves validated against existing coverage and source-boundary membership. Framework proof additionally verifies governed-source coverage, one primary owner, exact supplemental-family coverage, leaf-local target executability and preflight shape, declaration-versus-solution projection consistency, and the exclusion of `.astro` and `.svelte` inputs from generated build configs.

`checker:build` and `checker:typecheck` execute the active checker adapters according to their execution class.

`package:check` operates on configured built package outputs. Its current tool model includes Publint, Are the Types Wrong, and Limina package-boundary checks. Package entries, rather than every workspace package, define the checked output set.

`release:check` evaluates configured release readiness. The current configuration surface includes content-hash comparison and npm package-manifest lint configuration. The command checks release state; it does not publish a package.

A failure means that a configured detector, rule, checker, or execution step did not pass. The implementation does not classify every failure as a product defect.

### Dependency graph export

`limina graph export` emits a JSON document containing package nodes, dependency edges, and per-edge evidence. The current schema version is `1`, and the current views are:

- `all`
- `source`
- `artifact`

Each edge records the importing file, module specifier, and resolved path used as evidence.

The exported document describes dependency facts observed by Limina. Its schema does not encode task definitions, task cache policy, execution resources, or a build schedule.

### Issue reporting and persisted state

Limina maintains canonical issue codes and rule metadata. Issue codes are associated with owning task domains, and rule metadata distinguishes active, planned, and retired states.

A completed check writes structured run and issue state under the `.limina` artifact namespace. The current check snapshot version is `7`; the source-issue snapshot remains a separate version-`1` format. Standalone issue-producing commands write addressable invocation records.

Check execution publishes metadata only after config loading, semantic validation, preflight/profile setup, and execution-plan validation succeed. Each published attempt has a monotonically increasing sequence plus started and terminal metadata. `last-run.json` remains the only completed version-`7` inventory; `latest-completed.json` authenticates its attempt identity, sequence, timestamp, and content hash. Attempt directories do not contain copies of the inventory.

`limina check --issues` reads persisted state. It does not execute a fresh check. It can query the latest freshness-authenticated completed check or a selected standalone invocation and filter by rule, file, scope, task, checker, or package. A published latest attempt that is running, incomplete, interrupted, aborted, persistence-failed, or inconsistent prevents fallback to older issues. A corrupt `latest-attempt.json` also prevents both query and sequence allocation. A torn `last-run.json`/`latest-completed.json` pair fails closed until a later higher-sequence successful check overwrites the pair.

Current output formats are human-readable text, JSON, and NDJSON. Human output can be bounded for terminal use. Machine-readable issue output remains separate from terminal presentation.

Source finding producers retain typed semantic facts. Canonical issue identity incorporates those facts internally without adding them to the public issue schema, so distinct same-location findings remain distinct while repeated observations of the same finding deduplicate to a stable issue ID. Canonical issue collection uses code-unit ordering rather than the process locale.

Snapshot and profile writes use the repository's atomic writer. Profiling output is enabled only when `LIMINA_PROFILE=1`.

### Artifact and mutation boundaries

The `.limina` directory is represented as an authenticated artifact namespace with a logical root, canonical root, generation identity, and generation token. Artifact paths are checked for lexical and canonical containment.

Generated artifact materialization uses a canonical-root cross-process reader/writer lease with a 30-second bounded wait. A writer validates the plan's base revision after taking the lease and may rebuild the complete plan once if it drifted. Before its first mutation it atomically publishes an in-progress marker containing the base and desired revisions plus the complete owned-path universe. The manifest is written last. Readers fail closed while recovery is required; the next writer force-writes one fresh complete plan, removes non-target owned paths, verifies the desired tree, and only then removes the marker. This recovery model intentionally does not add a journal, backup tree, roll-forward state machine, completed-commit marker, or consumer-side second revision handshake.

The generated-graph manifest remains schema version `3`; live governed-source and framework-capability descriptors are not serialized into it. Supported older positive manifest versions are accepted only as artifact-ownership ledgers so stale owned paths can be deleted before the current plan writes a fresh version-`3` manifest. Future, zero, negative, non-integer, or malformed versions remain invalid. Artifact and descriptor ordering uses code-unit comparison rather than locale-sensitive ordering.

Checker project-config parsing caches belong to an `AnalysisProviderSet` and therefore to one repository generation. Graph, source, proof, owner, and checker projections share that generation's cache; advancing creates a new provider set and cache. Direct parser calls without a cache remain uncached, and virtual-file identities remain separate from physical-file identities.

Runtime-like import collection recognizes CommonJS `require` through a TypeScript syntax-AST lexical binding pass shared by the Oxc and TypeScript paths. Shadowed `require` names are not treated as the global loader. Only direct immutable `createRequire(import.meta.url)` bindings are recognized; mutable, transitive, destructured, computed, optional, and indirect aliases are excluded.

Programmatic custom analysis providers are generation-zero only. An attempted generation advance fails before disposing the current providers, incrementing generation, or replacing them with defaults.

Configured output roots are collected while validating the workspace context. Limina creates mutation authorities that distinguish:

- the trusted logical and canonical base
- the logical and canonical mutation root
- file or directory scope
- the generation in which the authority is valid

Managed checker output validates projected files against the authenticated authority instead of relying on lexical path containment alone. The implementation also records filesystem identity for mutation snapshots and reports authority or binding drift.

The public `--raw` build path is distinct from managed checker execution. The source establishes the separate path; it does not establish whether `--raw` is a permanent product commitment.

## Derived implementation consequences

The generated graph is shared evidence for graph validation, proof coverage, checker planning, source analysis, and package-boundary reasoning. Changing graph generation can therefore affect multiple validation domains even when the public change appears local.

The distinction between raw workspace evidence and validated authority packages means that a package can remain diagnostic evidence without receiving source ownership, named lookup, generated-graph, or workspace-dependency authority in the current run.

The TypeScript declaration provider and Oxc runtime-like resolver answer different questions. A runtime-resolvable module is not automatically a valid type provider.

The package can refactor internal modules without changing users when the public CLI, configuration schema, generated artifacts, issue contracts, and observable validation semantics remain unchanged. The source does not establish that the current internal directory structure is permanent.

Limina can execute commands and configured pipelines, but its exported dependency graph is not sufficient to act as a general task graph or build-order authority.

CLI process tests must keep commands that mutate the same `.limina` artifact namespace sequential. Once an invocation record or completed check snapshot exists, independent `check --issues` queries are read-only and can run concurrently; this avoids making fixed per-test budgets depend on repeated development-entry cold starts on slower CI platforms.

Cross-platform tests must represent Limina-owned absolute paths in their canonical portable form even when Node filesystem calls use platform-native paths. Inline ESM child processes must import local modules through `file:` URLs rather than raw filesystem paths so Windows drive letters are not interpreted as URL schemes.

Cross-process materialization tests must release deliberately paused children through an already-open process channel rather than polling a filesystem sentinel. This keeps the lease contention under test while removing filesystem polling and scheduler timing from the synchronization barrier; child-result assertions should include captured process output when an exit is unsuccessful.

Isolated package fixtures that project pnpm dependencies into a temporary `node_modules` tree must keep scoped namespace directories physical and junction each package below them individually. Junctioning the namespace directory itself adds a nested reparse-point boundary that can make scoped ESM packages unreachable on Windows before the fixture reaches its intended dependency-resolution boundary.

## Human direction requiring confirmation

The supplied Codex memory contains repeated user instructions that are not implementation proof. They are recorded here as unvouched direction requiring human review:

- Limina behavior documentation should treat the current source, tests, schema, and executable configuration as the factual authority.
- Limina reference text should describe current accepted and rejected forms in the present tense instead of carrying historical compatibility or migration narratives into the current contract.
- Dependency graph export should remain scoped architecture evidence for review and diagnostics, not an authoritative task graph or build-order source.
- Performance-oriented internal changes should demonstrate semantic equivalence for observable issues, generated manifests, and resolution results before they are accepted.

The current implementation does not answer these longer-term questions:

- Which CLI commands, configuration fields, issue codes, snapshot formats, and generated paths are compatibility commitments?
- Is automatic checker selection intended to remain the default onboarding contract?
- Are workspace regions permanently governance boundaries only, or could they become orchestration units?
- Is `limina build --raw` intended to remain a supported escape path?
- Will Limina expose a general third-party checker, rule, or plugin contract beyond the current built-in presets and configuration surfaces?
- Is the current domain/application/internal module separation a durable architecture boundary or an implementation detail?

## Evidence anchors

Recheck these repository areas before updating this record:

- `packages/limina/package.json`
- `packages/limina/src/index.ts`
- `packages/limina/src/cli.ts`
- `packages/limina/src/config/`
- `packages/limina/src/pipeline/runner.ts`
- `packages/limina/src/checker/registry.ts`
- `packages/limina/src/core/workspace/`
- `packages/limina/src/core/build-graph/runner.ts`
- `packages/limina/src/dependency-graph/`
- `packages/limina/src/graph-check/`
- `packages/limina/src/source-check/`
- `packages/limina/src/proof/`
- `packages/limina/src/package-check/`
- `packages/limina/src/check-reporting/`
- `packages/limina/src/domain/artifacts/`
- `packages/limina/src/utils/mutation-boundary.ts`
- `packages/limina/src/utils/mutation/`
- `packages/limina/src/typecheck/managed-mutation.ts`
- `packages/limina/src/typecheck/managed/`
- `limina.config.mts`
