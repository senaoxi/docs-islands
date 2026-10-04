# Project Context Records map

[English](./README.md) | [简体中文](./zh/README.md)

This directory stores persistent project context. Source, tests, manifests, configuration and executable scripts establish current behavior; a record is a retrieval aid, not proof that its claims are still current. Consult each record's evidence scope and validation status.

The records are unstamped AI drafts. They have not been human-vouched.

When a record conflicts with the implementation, inspect both sides and determine which one is stale. Do not assume that the record is correct.

Each record separates:

- **Current implementation**: facts directly established by executable repository evidence.
- **Derived implementation consequence**: consequences inferred from multiple implementation facts, without claiming design intent.
- **Human direction requiring confirmation**: audience, rationale, future scope, and permanent non-goals not established by the implementation.

| Area                                 | Record                                                                          | Scope                                                                                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Repository-level implemented scope   | [intent.md](./intent.md)                                                        | The product range currently exposed by the repository, plus direction questions that the source cannot answer                              |
| Docs homepage framework diagram      | [intent.md](./intent.md#human-stated-documentation-direction)                   | Human-stated multi-framework bridge direction, available versus planned paths, interaction, accessibility, and removal scope               |
| Visual identity and compact diagram  | [architecture.md](./architecture.md#visual-identity-and-diagram-layout)         | Product-specific SVG sources, generated variants, finite island animation, compact layout, and linked human-stated directions              |
| VitePress integration identity       | [intent.md](./intent.md#human-stated-vitepress-integration-identity-direction)  | Accepted subproject geometry, purple primary, package scope, preserved parent identity, and local adoption                                 |
| VitePress integration landing        | [architecture.md](./architecture.md#vitepress-integration-landing-presentation) | Automatic assisted vi, retained logs, full Sunset frame sequences, CSS-triggered return, slow thinking loop, and language/base routing     |
| VitePress integration articles       | [architecture.md](./architecture.md#vitepress-integration-article-theme)        | Scoped purple reading tokens, Markdown ownership, table overflow, mobile keyboard behavior, preserved islands, and validation boundaries   |
| Toolchain and enforced constraints   | [technology-stack.md](./technology-stack.md)                                    | Package manager, Node.js, module format, task execution, build tools, and governance tooling                                               |
| Workspace and package boundaries     | [architecture.md](./architecture.md)                                            | Workspace layout, package units, dependency direction, adapter/build boundaries, and root landing presentation                             |
| Third-party npm dependency admission | [dependency-admission.md](./dependency-admission.md)                            | Necessity, npm adoption, production artifact impact, license compatibility, deprecated-version rejection, and maintenance-state comparison |
| History extraction and external CLI  | [history-extraction.md](./history-extraction.md)                                | Frozen baseline, archive, npm pin, mapped changelog bases and validation boundaries                                                        |

The root [intent record](./intent.md) does not define the complete long-term intent of Limina, Logaria, or the VitePress integration. Limina implementation records are preserved in the original-history archive. [history-extraction.md](./history-extraction.md) owns this repository’s extraction and external CLI dependency facts. If Logaria or the VitePress integration needs a stable product boundary or decision history, add another area-specific record instead of expanding the root intent record indefinitely.

## Bilingual publishing and maintenance

English records live in `.agents/docs/<name>.md` and are the public-facing edition. Their Chinese counterparts live in `.agents/docs/zh/<name>.md`, with exactly the same filename and no language suffix. Both editions are tracked by Git. Start from this map or the [Chinese map](./zh/README.md); each topic has one prose owner expressed in two languages.

Every trigger to update PCR requires both editions to be updated in the same change. Additions, edits, renames, moves, and deletions must stay paired, including map routes and language links. Keep all claims, explanations, examples, tables, diagrams, evidence, validation status, caveats, and open questions semantically identical; only language and location-dependent links differ. Do not defer translation or summarize away content in either edition.

Before completing a PCR change, compare the pair section by section, check matching filenames and corresponding content, and resolve every relative link and heading anchor in both directories. Keep evidence dates and confidence levels aligned; translation does not constitute a new validation run or human vouch. The binding [repository rule](../../AGENTS.md#bilingual-pcr-maintenance) applies to every PCR update, including prose-only maintenance.
