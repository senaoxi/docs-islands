# Project Context Records map

This directory stores persistent project context verified against the current source, tests, manifests, configuration, build scripts, and release scripts.

The records are unstamped AI drafts. They have not been human-vouched.

When a record conflicts with the implementation, inspect both sides and determine which one is stale. Do not assume that the record is correct.

Each record separates:

- **Current implementation**: facts directly established by executable repository evidence.
- **Derived implementation consequence**: consequences inferred from multiple implementation facts, without claiming design intent.
- **Human direction requiring confirmation**: audience, rationale, future scope, and permanent non-goals not established by the implementation.

| Area                                 | Record                                               | Scope                                                                                                                                                                  |
| ------------------------------------ | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository-level implemented scope   | [intent.md](./intent.md)                             | The product range currently exposed by the repository, plus direction questions that the source cannot answer                                                          |
| Toolchain and enforced constraints   | [technology-stack.md](./technology-stack.md)         | Package manager, Node.js, module format, task execution, build tools, and governance tooling                                                                           |
| Workspace and package boundaries     | [architecture.md](./architecture.md)                 | Workspace layout, published units, private packages, dependency direction, adapter boundaries, and build boundaries                                                    |
| Limina implementation and direction  | [limina.md](./limina.md)                             | Public commands, configuration, checker model, workspace authority, generated graph, validation domains, reporting, mutation boundaries, and unvouched human direction |
| Third-party npm dependency admission | [dependency-admission.md](./dependency-admission.md) | Necessity, npm adoption, production artifact impact, license compatibility, deprecated-version rejection, and maintenance-state comparison                             |

The root [intent record](./intent.md) does not define the complete long-term intent of Limina, Logaria, or the VitePress integration. Limina-specific implementation context now belongs in [limina.md](./limina.md). If Logaria or the VitePress integration needs a stable product boundary or decision history, add another area-specific record instead of expanding the root intent record indefinitely.
