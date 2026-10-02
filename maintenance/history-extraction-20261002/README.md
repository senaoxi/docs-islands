# Cloud history extraction recovery

The original baseline for this reconstructed run is
`99e797c7c8ab6da76f98d1123ec289878cd1b119`, including the user's committed hero
work. The projection is `39555cecc0ba44b4e3975c5630ee4256e64e1748`.
The delivery report supplies the final migration commit SHA, bundle checksums,
exact remote push results and CI status. See the paired
[English record](../../.agents/docs/history-extraction.md) and
[Chinese record](../../.agents/docs/zh/history-extraction.md).

## Fetch the independent candidate

These commands create a separate local branch; they do not change local main.
Run them in a clean worktree. If the local branch name already exists, choose
a different local name.

```sh
git fetch origin codex/docs-islands-history-cleanup-20261002
git switch --create docs-islands-history-cleanup-20261002 FETCH_HEAD
git rev-parse HEAD
```

Compare the last SHA to the delivered report before installing. The candidate
uses the declared pnpm 11.9.0 and supported Node range:

```sh
pnpm install --frozen-lockfile
pnpm nx run-many -t build --nxBail
pnpm exec limina check
pnpm lint:packages
```

The exact npm Limina 0.4.0 is pinned through the existing dev catalog. It is not
an embedded workspace package. See the report for browser/smoke environment
limits and the full command ledger.

## Recover the complete original and candidate objects

The delivered `original-all-refs.bundle` archives original heads, tags and
fetched pull-request refs. `candidates-and-archive.bundle` carries the final
candidate and `archive/pre-limina-extraction-20261002` without prerequisites.
Both have been exercised in fresh bare repositories. Verify `SHA256SUMS`
before recovery.

```sh
git init --bare original-restored.git
git -C original-restored.git fetch /absolute/path/original-all-refs.bundle 'refs/*:refs/*'
git -C original-restored.git fsck --full
git -C original-restored.git rev-parse refs/heads/archive/pre-limina-extraction-20261002

git init --bare candidate-restored.git
git -C candidate-restored.git fetch /absolute/path/candidates-and-archive.bundle 'refs/*:refs/*'
git -C candidate-restored.git fsck --full
git -C candidate-restored.git rev-parse refs/heads/codex/docs-islands-history-cleanup-20261002
```

An initially unborn bare repository HEAD is expected until a symbolic HEAD is
chosen; it does not invalidate fetched objects. To inspect old history in an
ordinary existing clone, use a new local branch:

```sh
git fetch origin archive/pre-limina-extraction-20261002
git switch --create inspect-pre-limina-extraction FETCH_HEAD
```

For a local rollback of candidate migration edits, inspect or branch from the
projection SHA above. For complete pre-extraction behavior, inspect the archive
SHA. Do not reset main, overwrite an existing remote ref or change old tags as
part of recovery. Archive and existing refs preserve the original Limina history
and signed objects; this operation makes no privacy-purge or size-reduction claim.

## Reproduce and independently check the projection

Use a separate repository containing the original bundle objects. Python 3 and
PyYAML are prerequisites for the retained YAML parser. Choose an output ref that
does not exist; the script refuses to overwrite any output ref.

```sh
mkdir projection-evidence
python3 maintenance/history-extraction-20261002/project-history.py /absolute/path/original-restored.git /absolute/path/projection-evidence 99e797c7c8ab6da76f98d1123ec289878cd1b119 refs/heads/reproduced-history-extraction
python3 maintenance/history-extraction-20261002/verify-history.py /absolute/path/original-restored.git /absolute/path/projection-evidence
git -C original-restored.git rev-parse refs/heads/reproduced-history-extraction
```

The resulting SHA must be `39555cecc0ba44b4e3975c5630ee4256e64e1748`.
The script projects each complete tree, removes exclusively Limina-owned
entries, drops a commit only when its projected tree is unchanged, and preserves
retained commit metadata/messages. It does not regenerate a final installable
lockfile. The subsequent migration uses a real pnpm install to regenerate that
lockfile. Its exact patch is recoverable from the candidate bundle:

```sh
git -C candidate-restored.git diff --binary 39555cecc0ba44b4e3975c5630ee4256e64e1748 refs/heads/codex/docs-islands-history-cleanup-20261002 > migration.patch
```

`commit-map.tsv` records all 384 original commits. The delivery also includes
the detailed JSON classification, changed-file decisions, tag mapping, registry
metadata and integrity comparison, final tree inventory, reproduction scripts
and command logs, including unsuccessful baseline/environment attempts. Earlier
failed-cloud candidate SHAs and counts are historical references, not results
claimed by this reconstructed run.

## Preserve the first changelog range

Original tags still point into original history. For the first candidate-based
release, use the existing `--from-tag` argument with its mapped baseline:

```sh
pnpm changelog --package logaria --type patch --dry-run --from-tag 7e6591cc0ff73947d3cef50d2b6c04dcca1d64ef
pnpm changelog --package vitepress --type patch --dry-run --from-tag dbec0d74859fa2c2b77d8f1bdabfafb6f6a1b4a8
```

This avoids counting divergent original history while preserving the new hero
and migration commits. No npm publication or tag movement is part of this task.
