# Limina Package Checks Reference

Detail on `limina package check` and `limina release check` — the consumer-facing package tools, release-only tarball hygiene, and how both commands select configured package entries.

## When to run

After `pnpm build` (or whatever produces the publish-ready `outDir`). The source graph and the package output are validated independently. Source-only changes that pass `limina check` can still produce a broken package; the inverse is also true.

A recommended `publish` pipeline:

```js
pipelines: {
  publish: [
    'graph:check',
    'proof:check',
    { type: 'command', command: 'pnpm', args: ['build'] },
    'package:check',
    'release:check',
  ],
},
```

## What is checked per entry

For every entry selected by the CLI plan:

1. **Manifest presence** — `<outDir>/package.json` must exist.
2. **Manifest readiness** — output dependencies must not expose `workspace:`, `link:`, `file:`, or `catalog:` specifiers.
3. **Tarball pack** (only if `publint` or `attw` is enabled) — Limina runs `@publint/pack` against `outDir` (with `ignoreScripts: true` and `packageManager: 'pnpm'`) into a temporary directory and feeds the buffer to both tools.
4. **publint** — runs `publint` with its strict option enabled by default against the tarball. Limina logs every message returned by publint and fails if any message remains after publint's own `level` filtering.
5. **attw (Are The Types Wrong)** — calls `@arethetypeswrong/core`'s `checkPackage` on the tarball. Problems are filtered by the active profile and `ignoreRules`; remaining problems fail unless `attw.level` is `warn`.
6. **boundary** — extracts bare-package import specifiers from every `.js`/`.mjs`/`.cjs` in the output via `es-module-lexer` and validates each.

The temporary tarball directory is removed after the entry completes (success or failure).

`package:check` does not enforce publish-only hygiene such as README/license files, `private: true`, source maps, registry metadata, dependency artifact hashes, or workspace publish order. Those belong to `release:check`.

## What release check owns

For every selected release entry, Limina reads `<outDir>/package.json`, rejects `private: true`, packs the npm tarball, and validates the tarball itself:

1. The tarball must contain root `package.json`, `README.md`, and `LICENSE.md`.
2. The tarball must not contain any `*.map` file.
3. Tarball JavaScript files (`*.js`, `*.mjs`, `*.cjs`) must not contain `sourceMappingURL` directives (`//# sourceMappingURL=` or `/*# sourceMappingURL=... */`).
4. Source publish dependency sections must not use `link:`, must not depend on private workspace packages, and `workspace:` dependencies must name real workspace packages.
5. Packed publish dependency sections must not expose `workspace:` or `link:` and must keep ranges compatible with the local workspace dependency versions.
6. Workspace packages in the publish dependency chain must already exist in npm registry metadata with a usable `gitHead`, unless they are the root package currently being checked.

## publint configuration

```ts
publint?: boolean | {
  level?: 'error' | 'warning' | 'suggestion';
  strict?: boolean;
}
```

`strict` defaults to `true`. `level` is passed through to publint; any message returned by publint after that filtering is logged and fails the subcheck. `publint: false` removes publint from the entry's enabled check set; an object config enables it.

## attw configuration

```ts
attw?: boolean | {
  entrypoints?: string[];
  entrypointsLegacy?: boolean;
  excludeEntrypoints?: (string | RegExp)[];
  ignoreRules?: PackageAttwIgnoreRule[];
  includeEntrypoints?: string[];
  level?: 'error' | 'warn';
  profile?: 'strict' | 'node16' | 'esm-only';
}
```

| Profile    | Ignored resolutions                                              |
| ---------- | ---------------------------------------------------------------- |
| `strict`   | (none) — every problem fails                                     |
| `node16`   | (none)                                                           |
| `esm-only` | `node16-cjs` — pure ESM packages skip the CJS resolution failure |

CLI override: `--attw-profile <name>` swaps the profile for one invocation without editing the config.

`entrypoints`, `entrypointsLegacy`, `excludeEntrypoints`, and `includeEntrypoints` are passed to ATTW's `checkPackage`. `ignoreRules` filters problem kinds after profile filtering. If `level` is `warn`, remaining ATTW problems are logged as warnings and the ATTW subcheck passes; otherwise remaining problems fail the subcheck.
`attw: false` removes ATTW from the entry's enabled check set; an object config enables it.

Reported problem kinds (with formatted output):

| Kind                      | Message                                         |
| ------------------------- | ----------------------------------------------- |
| `NoResolution`            | `No resolution [resolution: X] [entrypoint: Y]` |
| `UntypedResolution`       | `Untyped resolution [...]`                      |
| `FalseESM`                | `False ESM: <types> -> <impl>`                  |
| `FalseCJS`                | `False CJS: <types> -> <impl>`                  |
| `CJSResolvesToESM`        | `CJS resolves to ESM [...]`                     |
| `FallbackCondition`       | `Fallback condition used [...]`                 |
| `NamedExports`            | Lists missing names, or marks all-missing       |
| `FalseExportDefault`      | Mismatched default between types/impl           |
| `MissingExportEquals`     | TS export equals missing in impl                |
| `InternalResolutionError` | TypeScript's own resolver failure               |
| `UnexpectedModuleSyntax`  | Module syntax surprise in a file                |
| `CJSOnlyExportsDefault`   | CJS exports only default in a file              |

The check requires `result.types` to be set; a package with no type entry fails immediately with `package has no types`.

Accepted `ignoreRules` names:

- `cjs-only-exports-default`
- `cjs-resolves-to-esm`
- `fallback-condition`
- `false-cjs`
- `false-esm`
- `false-export-default`
- `internal-resolution-error`
- `missing-export-equals`
- `named-exports`
- `no-resolution`
- `unexpected-module-syntax`
- `untyped-resolution`

## boundary configuration

```ts
boundary?: {
  environment?: 'browser' | 'node' | string | ((relativeFilePath: string) => string);
  ignoredExternalPackages?: string[];
}
```

How `environment` is resolved per file:

1. If `environment` is a function, it is called with the file's path relative to `outDir`.
2. If `environment` is a string, every file uses that environment.
3. Otherwise (omitted), the heuristic: files whose relative path starts with `node/` or `plugin/` are `node`; all others are `browser`.

For each emitted module, every bare-package import specifier is validated:

| Specifier shape                                                                        | Rule                                                                                                                                                                           |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Relative (`./`, `../`) or absolute path / `file:` / URL                                | Allowed (skipped).                                                                                                                                                             |
| Node builtin (`fs`, `node:fs`, etc.)                                                   | Allowed only when `environment === 'node'`. Otherwise: `browser/runtime output must not import Node builtin "..."`.                                                            |
| Self specifier (matches own `manifest.name` or any `exports` key, including wildcards) | Allowed only when matched; otherwise: `self import "X" is not exposed by output package.json exports`.                                                                         |
| External package                                                                       | Allowed only when the package root appears in `dependencies`, `peerDependencies`, `optionalDependencies` (from the OUTPUT manifest), or in `boundary.ignoredExternalPackages`. |

Violations are sorted by file path then by specifier and reported one per line:

```
[<label>] [boundary] dist/runtime/index.js (browser) imports "node:fs": browser/runtime output must not import Node builtin "node:fs"
```

`ignoredExternalPackages` is for legitimate runtime-shim exceptions only. Adding a package here silences the boundary auditor for that package across every emitted module.

### `manifest.exports` self-match rules

`boundary` builds a set of allowed self specifiers from the output manifest's `exports`:

- `'.'` adds the package name itself.
- `'./foo'` adds `<name>/foo`.
- `'./foo/*'` adds the prefix `<name>/foo/` — any specifier with that prefix is allowed.
- Any other key shape is ignored.

If the output uses `package.json#exports` subpaths or wildcard subpaths and your runtime imports `<name>/foo/bar`, the boundary check will pass only when `foo/bar` is covered by one of those keys.

## Entry selection rules

`package.entries` may contain multiple entries. `limina package check` selects which to run:

1. `--package <name>` — filters by exact `name` match. Missing match is a hard error listing the configured names.
2. No `--package`:
   - Read the nearest `package.json` from cwd, walking up to the workspace root.
   - If the package name matches a configured entry name, run only that entry.
   - Otherwise run every configured entry.
3. `--tool <name>` further restricts the per-entry check list. If the resulting list is empty for every selected entry, the run fails.

`limina release check` uses stricter selection:

1. `--package <name>` may be repeated and skips cwd matching.
2. Without `--package`, the nearest cwd `package.json#name` must match one configured entry.
3. A missing cwd package name or unmatched package name is a hard error.

The selection reason is logged at the top of the run:

```
Package check plan:
  config: limina.config.mts
  cwd: packages/limina
  selection: nearest package.json name "limina" matched configured entry name.
  entries:
    - limina
      outDir: packages/limina/dist
      checks: publint, attw, boundary
```

## Common configuration shapes

### Single ESM-only library, browser output

```js
package: {
  entries: [{
    name: '@acme/runtime',
    outDir: 'packages/runtime/dist',
    // checks defaults to ['publint', 'attw', 'boundary']
    // publint.strict defaults to true
    // attw.profile defaults to 'esm-only'
    // boundary.environment heuristic: only files under 'node/' or 'plugin/' are node
  }],
}
```

### Mixed runtime package with a node-only subfolder

```js
package: {
  entries: [{
    name: '@acme/sdk',
    outDir: 'packages/sdk/dist',
    boundary: {
      environment: (file) => file.startsWith('server/') ? 'node' : 'browser',
      ignoredExternalPackages: ['@acme/runtime-shim'],
    },
  }],
}
```

### Stricter ATTW for a CJS+ESM dual-export

```js
package: {
  entries: [{
    name: '@acme/duo',
    outDir: 'packages/duo/dist',
    attw: { profile: 'node16' },
  }],
}
```

### Run only one tool

```sh
pnpm exec limina package check --package @acme/sdk --tool publint
pnpm exec limina package check --tool boundary
```

### Release tarball is not publishable

Run `limina release check --package <name>` and fix the reported tarball issue: remove `private: true`, add missing README/license files to the packed output, exclude `*.map` files, or strip `sourceMappingURL` comments from emitted JavaScript.

## Release content hash configuration

`release:check` can compare workspace dependency artifact contents against npm registry metadata.

```ts
release: {
  contentHash: {
    baselineTag: 'latest',
    builtinIgnore: true,
    ignore: ['client/**'],
  },
}
```

- `baselineTag` defaults to `latest` and may be a function receiving `{ importerName, dependencyName }`.
- `builtinIgnore: true` enables Limina's built-in artifact ignore set only when `ignore` is omitted or a function returns `undefined`.
- `ignore` may be an array of package-relative glob patterns or a function returning an array/`undefined`.
- Empty tags and empty ignore patterns are rejected.

## Boundary auditor access

Use `limina package check --tool boundary` for published-output boundary validation. The package root is a CLI/config authoring surface.
