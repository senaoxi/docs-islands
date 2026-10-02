# Technology stack

[English](./technology-stack.md) | [简体中文](./zh/technology-stack.md)

## Evidence boundary

This record covers tools and constraints that are present in executable repository configuration, manifests, scripts, build inputs, and governance pipelines.

Tool selection rationale, long-term migration plans, and preferred agent workflow are not established by these files unless an executable constraint encodes them.

## Enforced repository constraints

The root `preinstall` script runs `only-allow pnpm`. Repository installation is therefore restricted to pnpm.

The root manifest pins `packageManager` to `pnpm@11.9.0` and requires pnpm `>=11.9.0`. `pnpm-workspace.yaml` enables `engineStrict`, package-manager version management, and strict catalog mode.

The root Node.js range is `^22.18.0 || >=24.11.0`. The implementation enforces this exact range. The repository does not establish why intermediate versions are excluded.

The root project and the primary TypeScript workspace packages use `"type": "module"`. Rolldown and tsdown build configurations emit ESM for the inspected public and internal package outputs.

Application and library source, together with published build outputs, are ESM-oriented. Tool-required CommonJS configuration still exists, including `.pnpmfile.cjs`, which exports pnpm hooks through `module.exports`.

## Dependency version management

`pnpm-workspace.yaml` defines these named catalogs:

- `dev`
- `docs-dev`
- `format`
- `frameworks`
- `lint`
- `prod`
- `test`

Shared dependency and development dependency versions are primarily referenced through pnpm catalogs.

Peer dependency compatibility ranges remain in individual package manifests. Some dependency values also use workspace protocols or package-local values. The implementation does not place every version exclusively in catalogs.

### Vue compiler declaration dependencies

With `hoist: false`, each Vue compiler must own the dependencies imported by its published declarations. Vue 3.5.39's `@vue/compiler-core` and `@vue/compiler-sfc` declarations import `@babel/types`, but their published manifests list it only as a development dependency. The [pnpm read-package hook](../../.pnpmfile.cjs) supplies the missing dependency for both compilers using each compiler's declared `@babel/parser` range, preserving an existing explicit Babel types dependency. A wildcard previously selected Babel 8 alongside Babel 7's parser; the lockfile now reuses Babel 7.29.7 without introducing a new package or weakening declaration checks.

An ancestor `node_modules/@babel/types` can mask the missing dependency on a developer machine. The [installation regression tests](../../packages/vitepress/src/node/__tests__/compiler-type-dependencies.test.ts) require a compiler-local pnpm dependency and the same Babel types installation used by its parser. The strict VitePress artifact check remains enabled. Local reproduction on 2026-09-25 isolated the virtual store from ancestor Babel packages: the old hook produced two `TS2307` errors in `compiler-sfc.d.ts`; aligning only compiler-core's Babel version still failed. The repaired installation passed direct imports, a transitive Vue workspace with a competing root Babel 8 installation, and NodeNext declaration checking; an invalid declaration was still rejected. These checks ran on macOS with Node 22.18.0 and 24.21.0, pnpm 11.9.0, TypeScript 6.0.3, and Vue 3.5.39. They do not certify a remote GitHub Actions rerun.

## Release version ordering

Root release planning and changelog tag selection share the catalogued `semver` comparator. Numeric prerelease identifiers are ordered numerically (`beta.10` follows `beta.9`); stable releases follow their prereleases. Existing version input parsing and package/legacy tag selection rules remain in [shared release helpers](../../scripts/release/shared.ts). [Regression tests](../../scripts/release/shared.spec.ts) exercise the planning guard and tag consumer, including reversed comparisons and hierarchy. The root declares `semver` and `@types/semver` as development dependencies using the existing catalog; they support release scripts rather than adding a shipped runtime dependency.

## Task orchestration

### Release build environment and cache

Release and publish orchestration in [release.ts](../../scripts/release/release.ts) supplies production mode, `DOCS_ISLANDS_SOURCEMAP=false`, and `DOCS_ISLANDS_MINIFY=true` to package builds and VitePress dependency builds. These explicit child-process values override inherited development settings. VitePress still distinguishes its local-test build with `DOCS_ISLANDS_TEST=1` from its final build with `DOCS_ISLANDS_TEST=0`; ordinary development builds retain their configurable sourcemaps.

Two conditions caused the Logaria release failure investigated on 2026-09-28: standard package release builds inherited Nx's root `.env` sourcemap default, and build cache inputs did not include the build environment. Changing only the environment could therefore restore a cached development tarball. [Nx configuration](../../nx.json) now includes mode, sourcemap, minification, and debug variables in build inputs. The release gate continues rejecting `.map` files and JavaScript source-map directives; generated output must be rebuilt, not manually scrubbed.

The [orchestration regression](../../scripts/release/release.spec.ts) exercises the public publish entry for both workspace release packages with hostile inherited settings and intercepts external processes. Actual Nx/Rolldown reproduction additionally covers cold builds, development/production cache switching, and packed output. The original three-package reproduction was local macOS evidence on Node 24.21.0, pnpm 11.9.0, Nx 23.2.1, Rolldown 1.2.10, and rolldown-plugin-dts 0.28.6; it does not establish remote CI or an npm publication.

### Task runners

Nx provides dependency-graph-aware orchestration and caching for the configured `build` and `docs:build` targets. The root `build` script invokes `nx run-many`, and release scripts invoke package build targets through `pnpm nx run`.

Nx is not the repository's only task orchestrator:

- Root linting invokes ESLint directly and then runs recursive package lint scripts with pnpm.
- Formatting invokes Prettier directly.
- Several test, documentation, linking, and cleanup operations use the repository `_run` script, implemented by `scripts/run-workspace-script.ts`.
- Other commands use pnpm recursive or filtered execution directly.
- Architecture and type governance commands invoke Limina pipelines.

Agent workflow preferences in `AGENTS.md` are operating instructions. They are not descriptions of exclusive runtime orchestration.

## TypeScript and build tools

TypeScript is the primary source language and type system across the inspected packages.

The root Limina configuration assigns the TypeScript checker scope to the `tsgo` preset and the Vue-related scope to the `vue-tsc` preset. The `graph` and `lib` pipelines execute `tsgo -b`. The `vue` pipeline executes `vue-tsc -b`.

The root pipelines execute the installed `tsgo` and `vue-tsc` tools. Limina-specific checker adapter implementation and tests are outside this workspace.

Build tools differ by package:

- `@docs-islands/core`, `@docs-islands/vitepress`, Logaria, and `@docs-islands/agents` use Rolldown for their primary JavaScript builds.
- Their inspected Rolldown configurations use `rolldown-plugin-dts` for declaration output.
- The VitePress theme build uses tsdown.
- `@docs-islands/eslint-config`, `@docs-islands/utils`, and `@docs-islands/plugin-license` build through Limina commands rather than the same Rolldown configuration pattern.

The repository does not use one build tool uniformly for every package.

## CI status aggregation

The [CI status gate](../../.github/workflows/ci.yml) waits for the retained build, quality, test, smoke and docs jobs. It fails when any declared dependency fails or is cancelled; existing change-filter skips remain allowed. Limina implementation matrices and integration jobs moved out with its source. The 2026-10-02 extraction validation checked all 24 distinct projected CI configurations for valid job dependencies. The candidate branch is explicitly enabled for push CI; only an Actions run at its exact SHA can establish remote results.

## Browser testing

Browser-facing tests use the Vitest Node runner for orchestration and drive
Chromium directly through the `playwright-chromium` library. The repository
does not use Playwright Test, Vitest Browser Mode, or the full `playwright`
package.

The VitePress playground keeps its shared VitePress development server and
Chromium server in Vitest global setup. Each test receives an isolated page,
and playground-local asynchronous matchers poll real Playwright locators.
Those custom matchers use their own timeout options rather than Vitest's
`expect.poll` timeout. A first `client:only` render can include a cold Vite and
React transform, so browser tests wait for the component's complete markup
inside its render container with a scoped timeout instead of treating the
empty server-rendered container as client readiness.

The VitePress consumer smoke suite uses Vitest fixtures: Chromium is scoped to
the worker, while the consumer installation, development server, browser
context, and page are recreated for every test attempt. Failed browser smoke
tests retain text diagnostics, a screenshot, and a trace as Vitest
attachments. The MPA integration smoke remains a Node-only Vitest test.

## Limina

The workspace consumes real npm `limina@0.4.0` through an exact dev catalog pin and nine development dependency references. Root scripts use it for the default check, named graph/lib/vue/consumer pipelines, package artifact checks and release checks. Root configuration remains the repository’s policy owner; no exception or allowlist was added for extraction.

The CLI’s optional governance peers `@arethetypeswrong/core`, `knip`, `npm-package-json-lint` and `publint` are now explicit root development dependencies, preserving the configured checks formerly supported by Limina’s workspace dev dependencies. Knip stays at the frozen baseline’s `6.38.0`. This is development tooling and does not enter VitePress browser output.

The exact npm version is MIT, not deprecated, and supports the repository’s Node range. Its npm repository and provenance still point to the original `docs-islands` publication at `97fc3accfcc4c4f6aaf9be05e28d0d8c4ec9b08e`; that fact is retained rather than presented as a new independent publication. The installed CLI’s configuration and commands were exercised directly. A version number or absence of a breaking-change label is not capability evidence. See [history-extraction.md](./history-extraction.md) for archive, tag mapping and verification boundaries.

## Logaria and internal packages

Logaria is a separately built and published package with runtime, helper, core, plugin, types, and package exports.

`@docs-islands/vitepress` declares Logaria as a runtime dependency. Its source and built output import Logaria runtime and plugin entry points.

The following packages are private workspace packages in their current manifests:

- `@docs-islands/eslint-config`
- `@docs-islands/utils`
- `@docs-islands/agents`
- `@docs-islands/plugin-license`

`@docs-islands/agents` contains a link script that distributes skill directories into `.claude`, `.cursor`, and `.agent` through symlinks or junctions.

The package names and current mechanics do not establish future publication plans or broader product roles.

## Derived implementation consequences

Strict catalog mode makes undeclared catalog references and catalog drift repository-level dependency-management concerns. This is a consequence of the pnpm configuration, not a statement that every package version is centralized.

The mixed task model permits Nx caching for selected dependency-aware builds while retaining direct execution for linting, formatting, custom workspace scripts, and Limina governance.

## Human direction requiring confirmation

- Why does the repository enforce this exact Node.js support range?
- Is the current split among Nx, `_run`, pnpm recursive execution, and direct tool calls intended to remain stable?
- Is `vue-tsgo` expected to replace any current `vue-tsc` execution path?
- Are any private workspace packages intended for future publication?
