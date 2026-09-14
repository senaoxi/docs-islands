# Project Context Records map

[English](./README.md) | [简体中文](./zh/README.md)

This directory stores persistent project context. Source, tests, manifests, configuration and executable scripts establish current behavior; a record is a retrieval aid, not proof that its claims are still current. Consult each record's evidence scope and validation status.

The records are unstamped AI drafts. They have not been human-vouched.

When a record conflicts with the implementation, inspect both sides and determine which one is stale. Do not assume that the record is correct.

Each record separates:

- **Current implementation**: facts directly established by executable repository evidence.
- **Derived implementation consequence**: consequences inferred from multiple implementation facts, without claiming design intent.
- **Human direction requiring confirmation**: audience, rationale, future scope, and permanent non-goals not established by the implementation.

| Area                                         | Record                                                               | Scope                                                                                                                                      |
| -------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Repository-level implemented scope           | [intent.md](./intent.md)                                             | The product range currently exposed by the repository, plus direction questions that the source cannot answer                              |
| Toolchain and enforced constraints           | [technology-stack.md](./technology-stack.md)                         | Package manager, Node.js, module format, task execution, build tools, and governance tooling                                               |
| Workspace and package boundaries             | [architecture.md](./architecture.md)                                 | Workspace layout, published units, private packages, dependency direction, adapter boundaries, and build boundaries                        |
| Limina architecture entry and open direction | [limina.md](./limina.md)                                             | Reading routes, public surface, evidence levels, unresolved human judgments                                                                |
| Limina entities, authority and relations     | [limina-system-model.md](./limina-system-model.md)                   | Identities, actual CLI wiring, phase contracts, graph versus scheduling, failure domains                                                   |
| Limina checker dependency facts              | [limina-semantics.md](./limina-semantics.md)                         | Effective roots, bounded TypeScript, occurrence evidence, framework adapters and capability limits                                         |
| Limina state and mutation                    | [limina-lifecycle.md](./limina-lifecycle.md)                         | Analysis/provider generation, caches, context ownership, artifact recovery, migration, issue freshness                                     |
| Limina invariant impact                      | [limina-invariants.md](./limina-invariants.md)                       | Twelve core properties, causal explanations, source/test evidence matrix and guard strength                                                |
| Limina review and knowledge maintenance      | [limina-architecture-workflow.md](./limina-architecture-workflow.md) | PR impact analysis, single prose owners, update triggers, validation and paid debugging traps                                              |
| Limina reconstruction evidence               | [limina-architecture-audit.md](./limina-architecture-audit.md)       | Working-tree audit, PCR reconciliation, four adversarial reviews, findings and actual validation                                           |
| Third-party npm dependency admission         | [dependency-admission.md](./dependency-admission.md)                 | Necessity, npm adoption, production artifact impact, license compatibility, deprecated-version rejection, and maintenance-state comparison |

The root [intent record](./intent.md) does not define the complete long-term intent of Limina, Logaria, or the VitePress integration. Limina-specific implementation context now belongs in [limina.md](./limina.md). If Logaria or the VitePress integration needs a stable product boundary or decision history, add another area-specific record instead of expanding the root intent record indefinitely.

## Bilingual publishing and maintenance

English records live in `.agents/docs/<name>.md` and are the public-facing edition. Their Chinese counterparts live in `.agents/docs/zh/<name>.md`, with exactly the same filename and no language suffix. Both editions are tracked by Git. Start from this map or the [Chinese map](./zh/README.md); each topic has one prose owner expressed in two languages.

Every trigger to update PCR requires both editions to be updated in the same change. Additions, edits, renames, moves, and deletions must stay paired, including map routes and language links. Keep all claims, explanations, examples, tables, diagrams, evidence, validation status, caveats, and open questions semantically identical; only language and location-dependent links differ. Do not defer translation or summarize away content in either edition.

Before completing a PCR change, compare the pair section by section, check matching filenames and corresponding content, and resolve every relative link and heading anchor in both directories. Keep evidence dates and confidence levels aligned; translation does not constitute a new validation run or human vouch. The binding [repository rule](../../AGENTS.md#bilingual-pcr-maintenance) applies to every PCR update, including prose-only maintenance.
