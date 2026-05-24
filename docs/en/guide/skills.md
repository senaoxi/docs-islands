# Agent Skills

Docs Islands publishes optional agent skills for using its packages with AI coding agents. These skills package the practical usage rules for `logaria` and `@docs-islands/vitepress`, so the agent can load focused guidance when it is changing logger calls, VitePress configuration, Markdown islands, render strategies, diagnostics, or related integration code.

## Install

List the available skills first:

```bash
npx skills add XiSenao/docs-islands --list
```

Install the logger skill:

```bash
npx skills add XiSenao/docs-islands --skill logaria
```

Install the VitePress skill:

```bash
npx skills add XiSenao/docs-islands --skill docs-islands-vitepress
```

Install both skills globally for Codex:

```bash
npx skills add XiSenao/docs-islands \
  --global \
  --agent codex \
  --skill logaria \
  --skill docs-islands-vitepress
```

Restart the target agent after installing global skills so it can load the new skill metadata.

## Loading Model

The `skills` CLI discovers skill folders from this repository's `skills/` directory. Each skill is installed by its `SKILL.md` frontmatter `name`, not by the npm package name it documents.

Docs Islands uses namespaced skill names:

| Skill                    | Package it helps with     |
| ------------------------ | ------------------------- |
| `logaria`                | `logaria`                 |
| `docs-islands-vitepress` | `@docs-islands/vitepress` |

The namespace is intentional. Short names like `logger` or `vitepress` can conflict with unrelated global skills and make the agent load guidance that is broader than Docs Islands.

## Notes

- Install globally with `--global` when you want the skills available across projects.
- Omit `--global` when you want the skills copied into the current project.
- Use `--agent codex` for Codex. The `skills` CLI also supports other agents through its `--agent` option.
- Review installed skills before relying on them in sensitive repositories. Skills are instructions for an agent that already has the permissions you grant it.
- Update skills after Docs Islands documentation or package behavior changes:

```bash
npx skills update logaria
npx skills update docs-islands-vitepress
```
