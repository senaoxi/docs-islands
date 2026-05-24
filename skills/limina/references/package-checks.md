# Limina Package Checks Reference

Detail on `limina package check` — the three tools that run against a BUILT package output (the directory that will be published), the rules they enforce, and how to configure each.

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
  ],
},
```

## What is checked per target

For every target selected by the CLI plan:

1. **Manifest presence** — `<outDir>/package.json` must exist.
2. **Required public files** — if `package.json.private !== true`, the output directory must also contain `README.md` AND `LICENSE.md`. Missing files are a hard error.
3. **Tarball pack** (only if `publint` or `attw` is enabled) — Limina runs `@publint/pack` against `outDir` (with `ignoreScripts: true` and `packageManager: 'pnpm'`) into a temporary directory and feeds the buffer to both tools.
4. **publint** — runs `publint` in strict mode (overridable) against the tarball. Every error and warning is logged; any message of type `error` or `warning` fails the check.
5. **attw (Are The Types Wrong)** — calls `@arethetypeswrong/core`'s `checkPackage` on the tarball. Problems are filtered by the active profile, then any remaining problem fails the check.
6. **boundary** — extracts bare-package import specifiers from every `.js`/`.mjs`/`.cjs` in the output via `es-module-lexer` and validates each.

The temporary tarball directory is removed after the target completes (success or failure).

## publint configuration

```ts
publint?: { strict?: boolean }   // default { strict: true }
```

Strict mode emits warnings as failure conditions in addition to errors. Set `strict: false` to allow warnings to log without failing the check.

## attw configuration

```ts
attw?: { profile?: 'strict' | 'node16' | 'esm-only' }   // default 'esm-only'
```

| Profile    | Ignored resolutions                                              |
| ---------- | ---------------------------------------------------------------- |
| `strict`   | (none) — every problem fails                                     |
| `node16`   | (none)                                                           |
| `esm-only` | `node16-cjs` — pure ESM packages skip the CJS resolution failure |

CLI override: `--attw-profile <name>` swaps the profile for one invocation without editing the config.

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

## Target selection rules

`packageChecks.targets` may contain multiple targets. The CLI selects which to run:

1. `--package <name>` — filters by exact `name` match. Missing match is a hard error listing the configured names.
2. No `--package`:
   - Read the nearest `package.json` from cwd, walking up to the workspace root.
   - If the package name matches a configured target name, run only that target.
   - Otherwise run every configured target.
3. `--tool <name>` further restricts the per-target check list. If the resulting list is empty for every selected target, the run fails.

The selection reason is logged at the top of the run:

```
Package check plan:
  config: limina.config.mjs
  cwd: packages/limina
  selection: nearest package.json name "limina" matched configured target name.
  targets:
    - limina
      outDir: packages/limina/dist
      checks: publint, attw, boundary
```

## Common configuration shapes

### Single ESM-only library, browser output

```js
packageChecks: {
  targets: [{
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
packageChecks: {
  targets: [{
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
packageChecks: {
  targets: [{
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

### Public package missing `README.md` / `LICENSE.md`

Either add them to the build output OR set `private: true` in the OUTPUT `package.json` (not the source one). Limina enforces this on the artifact, not the source.

## Programmatic boundary auditor

The runtime boundary auditor is exported as `auditPublishedPackageBoundaries` (not from the top-level `limina` entry — it lives in the package check command module). For most use cases run `limina package check --tool boundary` instead of calling it directly.
