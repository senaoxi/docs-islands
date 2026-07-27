# Docs Islands Agent Guide

This file defines the repository-wide operating contract for coding agents. It complements the managed Nx, Limina, and PCR workflow sections below.

## Scope and instruction routing

- These rules apply across the repository.
- A nearer `AGENTS.md` governs its subtree and may add, narrow, or explicitly override repository-level instructions where stated.
- Before changing files in a subtree with a nested instruction file, read that file first. In particular, `packages/limina/AGENTS.md` governs Limina-specific work.
- Start project-context retrieval from `.agents/docs/README.md`. Read only the records relevant to the area being changed.
- Treat source code, tests, manifests, checked-in configuration, and executable scripts as the current behavioral evidence.
- PCR records preserve durable intent, rationale, decisions, and trade-offs. Unstamped drafts are not authoritative when they conflict with executable evidence.
- Keep package-specific rules beside the code they govern instead of copying them into this repository-level file.

## Working agreement

Before editing:

1. Inspect `git status --short` and preserve all pre-existing worktree and index changes.
2. Identify the owning Nx project and its available targets, or explicitly establish that the change is repository-level or cross-cutting.
3. Identify the nearest relevant tests, generated outputs, package manifest, configuration, nested instructions, and PCR records.
4. Define the smallest change that satisfies the request and the concrete checks that would demonstrate completion.

While editing:

- Keep the diff task-scoped. Do not mix behavioral work with unrelated cleanup, renaming, formatting, dependency updates, or speculative refactoring.
- Never discard, overwrite, unstage, reformat, or otherwise alter unrelated user changes.
- Do not use destructive Git commands unless the user explicitly requests them.
- Preserve public behavior and package boundaries unless the task explicitly changes them.
- Add focused regression coverage for bug fixes and observable behavior changes when practical.
- Do not bypass failing lint, type, architecture, or test rules with disables, broad exclusions, weakened assertions, or generated-file edits.
- Fix the source problem when it is within the task scope. When a rule appears incorrect or a failure is unrelated, report it instead of silently weakening the check.
- Do not manually edit generated or transient output such as `dist/`, `.limina/`, `.nx/`, `.tsbuild/`, coverage output, or generated declarations. Change the source or generator and regenerate only when required.
- Use pnpm for dependency operations.
- Shared workspace dependency versions belong in the appropriate catalog in `pnpm-workspace.yaml`.
- Regenerate `pnpm-lock.yaml` through pnpm rather than editing it directly.
- Follow the repository's ESM-only and supported Node.js constraints.
- Do not introduce a parallel package manager, CommonJS compatibility path, or alternate task runner without an explicit architectural decision.
- Update user-facing documentation when observable behavior, supported workflows, configuration, or public boundaries change.
- Update PCR records when durable intent, rationale, decisions, or known traps change, even when no implementation change is required.

## Dependency admission

Before adding or replacing a third-party npm package:

- Read `.agents/docs/dependency-admission.md` and evaluate the candidate against every hard admission gate before editing manifests or lockfiles.
- Do not add a package when its necessity is not established, the selected version is deprecated, its license is incompatible or unclear, its maintenance state is not credible, or its measured production artifact increase exceeds 30%.
- For dependencies that enter a final production artifact, measure the incremental artifact impact with the same production build and compression convention. An increase from 15% through 30% lowers the candidate's preference and requires evaluation of narrower imports, lazy loading, tree shaking, or smaller alternatives.
- Treat npm weekly downloads and maintenance frequency as comparison signals only. They must not override a failed hard gate.
- Do not autonomously approve license exceptions, policy exceptions, or copying third-party source. Report the trade-off and leave the decision to the user.

## Validation strategy

- Prefer the narrowest relevant Nx targets first.
- Discover project targets with `pnpm nx show project <project>` instead of guessing command names or flags.
- Validate an affected project with its available lint, typecheck, unit test, integration test, smoke test, and build targets as appropriate to the change.
- Repository-level scripts and managed workflow commands remain authoritative when no single Nx project target represents the operation.
- When a change falls within Limina's governed surface, follow the managed Limina validation section below.
- Run `pnpm lint:packages` when package manifests, exports, dependencies, publishable outputs, or package structure may be affected.
- Run the relevant documentation build targets when changing user-facing documentation, examples, VitePress integration, or documentation configuration.
- Reserve repository-wide `pnpm build`, `pnpm test`, `pnpm lint`, and `pnpm format` for cross-cutting or release-level validation.
- `pnpm lint` and `pnpm format` mutate files. Do not run them broadly in a dirty worktree unless that mutation scope is intentional.
- Always inspect `git diff --check` and the final `git status --short`.
- Report every validation command executed, its result, and any relevant validation that was not run.

## Completion standard

A task is complete only when:

- the requested behavior has been implemented;
- the relevant checks have passed;
- the agent has not introduced unrelated changes;
- generated outputs were handled through their owning source or generator;
- remaining failures, skipped checks, and uncertainties are stated explicitly.

Do not claim that a command passed unless it was executed successfully in the current workspace.

## Managed sections

The Nx, Limina, and PCR sections below are independently managed workflow components.

Preserve their start and end markers. Do not manually edit generated content inside a managed section. Update a section through its owning generator or setup workflow.

<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

## General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

### Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

### When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax

<!-- nx configuration end-->

<!-- LIMINA:START -->

## Limina validation

This repository uses Limina to validate TypeScript project references, source ownership, package boundaries, checker coverage, and declaration builds.

Follow this section when a task changes governed:

- source files or imports;
- `tsconfig*.json`;
- `package.json`;
- package or workspace boundaries;
- checker or Limina configuration;
- declaration or build outputs.

Before considering the task complete:

1. Run:

   `pnpm exec limina check`

2. When it fails, inspect the persisted structured diagnostics with:

   `pnpm exec limina check --issues --format json`

3. Fix failures introduced by, or directly relevant to, the current change.

4. Preserve and report unrelated pre-existing failures. Do not expand the task scope to fix them without explicit user direction.

5. Rerun `pnpm exec limina check` after relevant fixes.

6. Do not manually edit files under `.limina/`.

7. Do not weaken Limina rules, exclusions, checker coverage, or allowlists unless the task explicitly requires a governance-policy change.

8. When resolving an issue would require a Limina configuration entry containing a reason field, explain:

   - the proposed exception;
   - its exact scope;
   - its risks;
   - available alternatives.

   Do not add or modify that configuration entry. The user must explicitly decide to accept and author the exception.

9. A successful Limina check does not replace the repository's lint, test, build, package, or runtime verification.

For focused investigation, use:

- `pnpm exec limina graph check`
- `pnpm exec limina source check`
- `pnpm exec limina proof check`
<!-- LIMINA:END -->

<!-- PCR:START -->

## Project Context Records (PCR)

This project follows **Project Context Records (PCR)** — methodology: https://github.com/hyfdev/project-context-records. PCR keeps the project's durable judgment — the _why_, the decisions, the intent — so you inherit it instead of re-deriving or re-litigating what's already settled.

When working here:

- **Where records live.** Records are in `.agents/docs/`, one topic per file, cross-linked with relative Markdown links.
  - A `README.md` there is the **map**: it routes code areas or hotspots to the exact record or heading, one-line gist per route. Create it when retrieval stops being a glance or one record grows into a long ledger.
- **Read first.** Start from the map if present, else scan the folder. Open the records or headings that cover an area before changing or answering for it; if the area has a decision ledger, read it first.
- **Use the strongest durable form.** Machine-checkable constraints go in types, tests, lints, or CI; rules that must bind every session go in the agent-instructions file, outside the markers; single-spot rationale goes beside the code with a link; records carry the cross-cutting judgment, intent, and context that must stay prose.
- **Record as you go.** Capture context when a decision lands, a trap costs you, a human corrects you, or a human asks — anything true about this project, not durable in a stronger form, and useful beyond the moment.
  - Report what you record so a human can review or vouch it.
  - Records are as public as the repo: keep secrets out, and ask before recording rationale from private context.
- **Write to be acted on.** Lead with the current conclusion and where it applies; capture the why — trade-offs, alternatives rejected, known pitfalls. Keep each topic's current truth in one fresh place, updated in place: evolution belongs to git, never to supersede chains.
- **Keep it fresh.** Update affected records in the same change that touches their subject.
  - When code and a record disagree, decide which side went stale and fix that side.
  - Back facts with durable evidence — tests, reproducible commands, committed artifacts, stable URLs, commit hashes — not ephemeral paths or one session's output.
- **Provenance.** Unstamped text is AI-accumulated: challenge and verify it freely. `[VOUCHED @handle YYYY-MM-DD]` means the named human explicitly accepted the covered words as current project direction.
  - A vouch is direction, not proof: facts keep needing durable evidence. Don't reopen vouched direction for its own sake — only on new evidence, a changed constraint, or the human's say-so.
  - When evidence argues with vouched direction, record the conflict and surface it to a human; stay inside the direction unless progress becomes impossible. Silence is not an option.
  - Scope: at a non-heading line's end, the stamp covers that line; alone on the first nonblank line below a heading, that section until the next heading of the same or higher level; alone below the document title, the whole file. Never in heading text — link anchors derive from headings.
  - Add a stamp only on explicit instruction. A stamp added by work under review counts only once the named human confirms it; an unchanged stamp on the target branch is inherited project state.
  - The stamp binds the exact covered words. Any edit that changes them — or changes which words the scope covers — removes the stamp until the human re-vouches; a change that leaves the covered words identical keeps it.
  - Legacy stamp forms (undated, before the title, inside a heading) stay valid with their original scope; never move, re-date, or reinterpret one without the human's approval.
- **Decision ledgers.** When the human declares that an area records decisions, keep that area's judgments in `<area>-decisions.md` and register new judgments there.
  - Placement: beside the area's derived document (`DESIGN-decisions.md` beside `DESIGN.md`, typically both in the records folder); with no derived document, in the records folder — a map route either way.
  - You may propose opening a ledger; only the human opens one.
  - The register contract, stated at the top of the file: only judgments the human actually expressed enter — a finished implementation, a passed review, resemblance to a reference, or silence is not acceptance. Never invent a rationale: if no reason was given, the entry says so.
  - Record the act of judgment, not the chosen thing's full content — exhaustive detail lives in the area's own document, linked. Edit entries in place; git keeps history.
  - Entries sit under **Decided** or **Open**. An Open entry marks a known-undecided question — current behavior is not a choice — with any stopgap and what would settle it. A Decided entry carries:
    - a short stable topic heading — map routes and stamp scopes anchor to it;
    - **Ruling:** one plain sentence, its force in its own wording — must / never / prefer / default to; no status field;
    - **Limits:** what it does not govern, what may change without reopening it, what would reopen it — a stopgap is a ruling plus its reopen condition;
    - **Why:** premises, alternatives compared, rejections — exactly as the human gave them;
    - **Source:** who expressed it, when, a durable pointer; for "accept the reviewed thing as a whole", pin the thing (commit hash, spec section) instead of transcribing it;
    - the vouch stamp, once the human vouches the entry, alone under the entry's heading — covering the whole entry.
- **Distill when a human reviews.** Accumulation is noisy by design; the valve is a human pass, and you draft it.
  - Propose: prune what is contradicted or dead, merge near-duplicates, promote buried context, fix map drift. Unattended, apply this to your own unstamped layer as you go — never the vouched one.
  - Flag: unstamped direction that has become load-bearing, factual claims whose evidence no longer holds, vouches plausibly affected by changes to what they cover.
  - The human decides and vouches.
- **Suggested topics.** Draft the missing ones that apply; when an existing doc already covers a topic, enroll it — a map route pointing at it where it lives, held to these same rules — instead of drafting a twin:
  - `intent.md` — what this is trying to be, for whom, and the non-goals; enroll the README instead if it truly covers them.
  - `technology-stack.md` — why tools, restrictions, and pins exist; not a manifest dump.
  - `architecture.md` — units, boundaries, and why the lines are where they are; when structure isn't glanceable.
  - `gotchas.md` — traps already paid for, each with its why; only real paid lessons.
  - `DESIGN.md` — only for a visual surface; follow https://github.com/google-labs-code/design.md (records folder by default — the spec fixes no location), enroll it in the map, and suggest wiring its linter into the project's own checks with the file's actual path (e.g. `npx @google/design.md lint .agents/docs/DESIGN.md`; platform variants in the spec).
  - `loop-goal.md` — only for an unattended run: the run's contract — goal, boundaries, finish criteria. You may draft it; the run starts only once the human has vouched the whole file (stamp below the title), and a human edit plus re-vouch re-baselines it. Never edit it yourself; if the contract itself blocks progress, stop and surface the conflict rather than stepping outside it.
  - `loop-status.md` — only for an unattended run: the run's memory — done, in flight, next, blocked — overwritten in place each iteration; its final overwrite is the handover to the returning human (what landed, what to vouch, what to prune, conflicts included). Both `loop-*` files die after the human's distillation pass over that handover; git keeps them.
  <!-- PCR:END -->
