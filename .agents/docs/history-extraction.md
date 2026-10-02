# History extraction and external Limina dependency

[English](./history-extraction.md) | [简体中文](./zh/history-extraction.md)

## Evidence and authority

This is an unstamped implementation record for the cloud-only extraction on 2026-10-02. The failed earlier cloud environment's bundles and candidate objects were unavailable. This run rebuilt the projection and does not claim to reuse or reproduce those earlier candidate SHAs.

The first frozen main was `57f5cacdbf00b39a3861a711ff6b949976086191`. Before completion, remote main advanced to `99e797c7c8ab6da76f98d1123ec289878cd1b119`. That one additional business commit is included: both landing components are byte-identical to its originals, and its bilingual intent/map edits are combined with the extraction records. Uncommitted work from other UI tasks is outside this run.

The updated frozen history has 384 linear commits. Projection `39555cecc0ba44b4e3975c5630ee4256e64e1748` retains 287 and drops 97 projected-empty commits: 92 with only exclusive paths and five mixed commits whose remaining projected tree is unchanged. Path classes count exclusive implementation/docs/PCR paths; they are not a claim that every path-mixed commit contains business behavior. The [commit map](../../maintenance/history-extraction-20261002/commit-map.tsv) records each original SHA, projected SHA, action, class and subject.

## Scope and preservation

The projection removes `packages/limina`, its dedicated skill, package documentation and implementation PCR records. For manifests, root catalogs/locks, release scripts and CI, it removes entries owned exclusively by that implementation. It preserves shared utils, ESLint, license tooling, repository governance, Docs Islands and Logaria behavior. It makes no generic substring deletion; ordinary words such as “eliminates” and shared landing marketing assets are preserved.

Each retained commit preserves its author, committer, timestamps and complete message. Rewritten commits cannot retain valid original signatures; no replacement signature is fabricated. The original signed objects remain in the archive.

Only a new candidate branch and `archive/pre-limina-extraction-20261002` are intended for normal push. The archive points to the complete updated original history. Main, existing branches and tags are not rewritten or deleted. The recovery bundle also retains the original heads, tags and fetched pull-request refs. Keeping that archive and old refs preserves original objects; this is neither a privacy purge nor a claim of repository size reduction.

## Real npm migration

All nine development consumers use `limina: catalog:dev`, backed by the exact `limina: 0.4.0` dev catalog entry. A literal version in every manifest would violate the repository's catalog lint rule. This shared exact pin has no range and resolves to the real registry package, not a workspace link or embedded build. Pnpm regenerates the final lock and a separate clean worktree verifies frozen installation.

`@arethetypeswrong/core`, `knip`, `npm-package-json-lint` and `publint` are explicit root development dependencies because the configured optional governance peers were previously available through Limina's own workspace development dependencies. Knip remains at the baseline's `6.38.0`; governance policies and checker/proof exceptions are preserved.

The registry version is MIT, not deprecated, and declares Node `^22.18.0 || >=24.11.0`. Its repository and provenance still describe the earlier `docs-islands` publication at `97fc3accfcc4c4f6aaf9be05e28d0d8c4ec9b08e`. The user's temporary acceptance of this real version does not establish a new independent-repository publication. No npm version is published by this extraction. Configuration support is established by running the installed CLI, not inferred from a version number or changelog label.

## Tags and release baselines

Existing tags keep their original targets. Passing an unchanged old tag directly to a rewritten branch can include unrelated old history in the first changelog. Use the existing `--from-tag` option with its mapped commit SHA for the first post-extraction release:

```sh
pnpm changelog --package logaria --type patch --dry-run --from-tag 7e6591cc0ff73947d3cef50d2b6c04dcca1d64ef
pnpm changelog --package vitepress --type patch --dry-run --from-tag dbec0d74859fa2c2b77d8f1bdabfafb6f6a1b4a8
```

At the initial 57f5 baseline, the mapped ranges preserve Logaria's one commit and VitePress's 41; the unchanged old tags otherwise count 28 and 178 against the projection. The subsequent hero and migration commits are legitimate new range entries. The delivered tag map covers the remaining original tags; no old tag is moved to its projected SHA.

## Verification and limits

The independent [history verifier](../../maintenance/history-extraction-20261002/verify-history.py) compares every original/projected tree, retained lock importers, non-Limina manifest values, commit metadata and CI job dependencies. A separate final-tree inventory checks the migration against updated main, including both hero component blobs and shared packages. The bundle recovery exercises use fresh bare repositories and check exact refs and trees.

Initial Linux validation passed the nine-project package build, real Limina default and package checks, 379 VitePress unit tests, 99 Logaria unit tests, six release-script tests and the three-site documentation build. The earlier frozen baseline reproduced VitePress's Vite 5 `module-runner` resolution failure; real lock regeneration allowed the retained unit suite to pass without a custom override. The final report and command ledger distinguish initial runs, final clean-worktree runs and remote CI at the exact candidate SHA.

The baseline and candidate consumer MPA smoke both failed while importing `@vitejs/plugin-react-swc`. A standalone real consumer diagnosed SWC's `ERR_SWC_NATIVE_CACHE`: this cloud filesystem has an untrusted parent for both the default cache and a fresh private cache. No cache security guard, assertion, governance gate or permission is weakened. Playwright's official browser download also returned HTTP 403 in this cloud environment; tests using the existing supported executable override can use system Chromium, and the report records the actual browser coverage. The utils test target has no test files in the frozen baseline. These facts do not establish a product regression or a successful smoke/CI run.

## Recovery and reproduction

The [recovery guide](../../maintenance/history-extraction-20261002/README.md) explains fresh-clone checkout, bundle restoration, local comparison and projection reproduction. The original and candidate bundles, full per-file decisions, tag map, registry integrity evidence and command logs accompany the delivery. Recovery creates separate local refs or repositories; it does not require resetting local main or forcing any remote ref.
