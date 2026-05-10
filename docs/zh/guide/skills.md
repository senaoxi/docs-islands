# Agent Skills

Docs Islands 提供了可选的 agent skills，用来帮助 AI coding agent 正确使用项目里的包。这些 skills 会把 `@docs-islands/logger` 和 `@docs-islands/vitepress` 的实践规则打包起来，让 agent 在修改 logger 调用、VitePress 配置、Markdown islands、渲染策略、诊断和集成代码时加载更聚焦的上下文。

## 安装

先查看仓库中可安装的 skills：

```bash
npx skills add XiSenao/docs-islands --list
```

安装 logger skill：

```bash
npx skills add XiSenao/docs-islands --skill docs-islands-logger
```

安装 VitePress skill：

```bash
npx skills add XiSenao/docs-islands --skill docs-islands-vitepress
```

将两个 skills 全局安装到 Codex：

```bash
npx skills add XiSenao/docs-islands \
  --global \
  --agent codex \
  --skill docs-islands-logger \
  --skill docs-islands-vitepress
```

全局安装后需要重启目标 agent，它才会重新加载新的 skill metadata。

## 加载方式

`skills` CLI 会从这个仓库的 `skills/` 目录发现 skill。安装时匹配的是每个 `SKILL.md` frontmatter 中的 `name`，而不是它所介绍的 npm 包名。

Docs Islands 使用带命名空间的 skill 名称：

| Skill                    | 对应辅助的包              |
| ------------------------ | ------------------------- |
| `docs-islands-logger`    | `@docs-islands/logger`    |
| `docs-islands-vitepress` | `@docs-islands/vitepress` |

这里保留命名空间是有意的。像 `logger`、`vitepress` 这样的短名称容易和其他全局 skills 冲突，也会让 agent 误以为这是更通用的 Logger 或 VitePress 指南。

## 注意事项

- 希望跨项目可用时，使用 `--global` 全局安装。
- 希望随当前项目提交和共享时，不要加 `--global`。
- Codex 用户使用 `--agent codex`。`skills` CLI 也可以通过 `--agent` 安装到其他 agent。
- 在敏感仓库里依赖 skill 前，请先检查安装后的内容。Skill 是 agent 指令，会在你授予 agent 的权限范围内影响它的行为。
- Docs Islands 文档或包行为变更后，可以更新 skills：

```bash
npx skills update docs-islands-logger
npx skills update docs-islands-vitepress
```
