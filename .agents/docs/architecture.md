# Architecture

## Evidence boundary

This record describes workspace units and boundaries established by manifests, source imports, public exports, build configuration, Limina configuration, and release scripts.

Package names and descriptions do not establish design rationale, future publication plans, or permanent product boundaries. Those points require human confirmation.

## Workspace layout

`pnpm-workspace.yaml` includes these workspace areas:

| Workspace pattern          | Current contents                                                                        |
| -------------------------- | --------------------------------------------------------------------------------------- |
| `packages/*`               | Primary library, CLI, configuration, and internal workspace packages                    |
| `packages/*/docs`          | Package-specific documentation sites                                                    |
| `packages/*/playground`    | Package-specific playground applications                                                |
| `packages/*/smoke`         | Package-specific smoke-test workspaces                                                  |
| `packages/plugins/*`       | Private plugin packages; the current matching package is `@docs-islands/plugin-license` |
| `packages/**/__tests__/**` | Nested test workspaces with their own manifests                                         |
| `docs`                     | Root documentation site workspace                                                       |
| `utils`                    | Shared private utilities package                                                        |

Generated `dist` directories are excluded from workspace discovery.

The current discovered workspace includes the root project, published packages, private packages, package documentation sites, the VitePress playground and smoke workspace, the Limina smoke workspace, and the Logaria plugin test workspace.

## Published packages

Release scripts and package manifests identify three independent publication targets:

| Package                   | Independently published | Current role                                                                                           |
| ------------------------- | ----------------------: | ------------------------------------------------------------------------------------------------------ |
| `@docs-islands/vitepress` |                     yes | VitePress integration package with node, client, React adapter, theme, and development-tooling exports |
| `logaria`                 |                     yes | Runtime logger with helper, core, plugin, and types exports, including build-time pruning facilities   |
| `limina`                  |                     yes | CLI for monorepo architecture, source, package, release, proof, and TypeScript graph governance        |

Each release target has a separate package directory, built publish directory, version, changelog, tag prefix, build step, package checks, and release checks.

## Private workspace packages

| Package                        | Private | Current role                                                                                              |
| ------------------------------ | ------: | --------------------------------------------------------------------------------------------------------- |
| `@docs-islands/core`           |     yes | Shared client, node, runtime, transformation, and type abstractions consumed by the VitePress integration |
| `@docs-islands/eslint-config`  |     yes | Shared ESLint configuration and presets                                                                   |
| `@docs-islands/utils`          |     yes | Shared repository runtime and build utilities, including the `link-guard` binary                          |
| `@docs-islands/agents`         |     yes | Shared coding-agent skills and link tooling for `.claude`, `.cursor`, and `.agent`                        |
| `@docs-islands/plugin-license` |     yes | Private license plugin used by package build configurations                                               |

The current `packages/plugins/*` area contains the license plugin. The implementation does not establish a broader collection of Vite or Rollup plugins.

## Core and VitePress boundary

`@docs-islands/core` does not directly import VitePress APIs. Its manifest exposes client, node, shared, and types entry points.

`@docs-islands/vitepress` imports Core entry points across its client, node, shared, adapter, and type layers. It maps VitePress configuration, lifecycle APIs, build hooks, and runtime behavior onto those shared abstractions.

Core is private in its source manifest and is not a release target.

The VitePress Rolldown configuration externalizes declared runtime dependencies and peer dependencies. Core is a development dependency rather than an external runtime dependency. The current built VitePress manifest does not declare Core, and built JavaScript does not retain Core module imports. This establishes that the current VitePress build incorporates the required Core implementation into its output.

### Derived implementation consequence

The current structure separates framework-neutral runtime abstractions from the VitePress-specific integration. This permits the VitePress package to consume shared abstractions without publishing Core as a separate consumer dependency.

The source establishes the structure, but not the design rationale or future framework plan.

## UI framework adapter boundary

`DocsIslandsAdapter` is the current adapter contract. It provides a framework identifier and an `apply` operation over VitePress configuration and resolved Docs Islands configuration.

`createDocsIslands()` accepts an adapter array. It rejects an empty array, duplicate framework identifiers, and identifiers outside the supported framework set.

The current supported framework set contains only React. The current adapter source directories, Rolldown inputs, and package exports expose only the React adapter and its client entry.

### Derived implementation consequence

The adapter contract and array-based orchestration provide an extension point. They do not establish that multiple UI frameworks are currently implemented or that additional adapters are planned.

## Logaria boundary

Logaria does not depend on `@docs-islands/core` in its manifest or source imports.

`@docs-islands/vitepress` declares Logaria as a runtime dependency. Its source and built output use Logaria core, helper, plugin, and types entry points.

Logaria has independent public exports, build output, package checks, release checks, versioning, and release tags.

Logaria is packaged and released independently and is not structurally coupled to `@docs-islands/core`. The implementation does not establish whether its long-term product scope is Docs Islands-specific or general-purpose.

## Limina boundary

Limina is an independently built and published CLI package with a `limina` binary.

The root repository uses Limina configuration and commands for:

- TypeScript project graph preparation and checking
- Source ownership and dependency checks
- Typecheck coverage proof
- Checker build and typecheck execution
- Built package output checks
- Release consistency checks
- Named graph, library, Vue, consumer, package, and publish pipelines

Current graph rules constrain client and shared runtime imports and project references. They reject configured Node.js built-in dependencies and configured references across client, shared, and node runtime boundaries.

Current package checks cover only the configured built outputs for Logaria, Limina, and `@docs-islands/vitepress`.

Limina is a development and release governance tool. It is not a frontend runtime dependency of the VitePress browser output.

A Limina failure indicates that a configured governance rule, package check, release check, proof, or checker did not pass. It requires investigation; the source does not define a universal defect classification for every failure.

See [limina.md](./limina.md) for Limina's package-local architecture record. That record owns the current workspace authority, generated graph, checker, issue-reporting, and mutation-safety contracts; this repository architecture record only describes Limina's relationship to the other workspace units.

## Derived implementation consequences

The three published packages can version and release independently while sharing private implementation and build packages in one workspace.

The root release configuration does not include Core, repository utilities, agent tooling, ESLint configuration, or the license plugin as publication targets. Their manifests also mark them as private.

The configured graph rules enforce only the boundaries represented by their labels, dependencies, and reference entries. They do not establish every architectural boundary that maintainers may consider important.

## Human direction requiring confirmation

- Is support for documentation frameworks other than VitePress a long-term reason for the Core and VitePress separation?
- Should Logaria remain scoped to Docs Islands usage or develop as a general logging package?
- Will Limina and Docs Islands remain in the same monorepo long term?
- Are any current private packages intended for independent publication?
- Is the plugins workspace expected to expand into a broader plugin collection?
