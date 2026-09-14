# 项目上下文记录索引

[English](../README.md) | [简体中文](./README.md)

本目录保存持久的项目上下文。源码、测试、manifest、配置和可执行脚本建立当前行为；记录用于帮助检索，不能证明其中的论断仍然有效。阅读时应查看各记录的证据范围和验证状态。

这些记录都是未加认可标记的 AI 草稿，尚未经过人类认可。

当记录与实现冲突时，检查双方并判断哪一方已经过时。不要默认记录正确。

每份记录区分：

- **当前实现**：由仓库可执行证据直接建立的事实。
- **由实现推导的结果**：根据多个实现事实推导出的结果，不宣称设计意图。
- **需要人类确认的方向**：实现无法建立的受众、理由、未来范围和永久非目标。

| 领域                          | 记录                                                                 | 范围                                                                                             |
| ----------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 仓库层面已实现的范围          | [intent.md](./intent.md)                                             | 仓库当前对外提供的产品范围，以及源码无法回答的方向问题                                           |
| 工具链与强制约束              | [technology-stack.md](./technology-stack.md)                         | 包管理器、Node.js、模块格式、任务执行、构建工具和治理工具                                        |
| Workspace 与包边界            | [architecture.md](./architecture.md)                                 | Workspace 布局、发布单元、私有包、依赖方向、adapter 边界和构建边界                               |
| Limina 架构入口与未决方向     | [limina.md](./limina.md)                                             | 阅读路线、公开接口、证据层级、未决的人类判断                                                     |
| Limina 实体、authority 与关系 | [limina-system-model.md](./limina-system-model.md)                   | Identity、CLI 实际接线、phase contracts、graph 与 scheduling 的区别、失败域                      |
| Limina checker 依赖事实       | [limina-semantics.md](./limina-semantics.md)                         | Effective roots、bounded TypeScript、occurrence evidence、framework adapters 与能力边界          |
| Limina 状态与修改             | [limina-lifecycle.md](./limina-lifecycle.md)                         | Analysis/provider generation、缓存、context ownership、artifact 恢复、migration、issue freshness |
| Limina invariant 影响         | [limina-invariants.md](./limina-invariants.md)                       | 12 条核心性质、因果解释、source/test evidence matrix 和 guard 强度                               |
| Limina 审查与知识维护         | [limina-architecture-workflow.md](./limina-architecture-workflow.md) | PR 影响分析、单一 prose owner、更新触发条件、验证和已付出调试代价的陷阱                          |
| Limina 重建证据               | [limina-architecture-audit.md](./limina-architecture-audit.md)       | Working-tree 审计、PCR reconciliation、四轮对抗性审查、发现与实际验证                            |
| 第三方 npm 依赖准入           | [dependency-admission.md](./dependency-admission.md)                 | 必要性、npm 采用情况、生产产物影响、许可证兼容性、废弃版本拒绝规则和维护状态比较                 |

根级[意图记录](./intent.md) 不定义 Limina、Logaria 或 VitePress 集成的完整长期意图。Limina 专属实现上下文现在归 [limina.md](./limina.md)。如果 Logaria 或 VitePress 集成需要稳定的产品边界或决策历史，应新增相应领域的记录，而不是无限扩充根意图记录。

## 双语发布与维护

英文记录位于 `.agents/docs/<name>.md`，作为对外版本。对应中文记录位于 `.agents/docs/zh/<name>.md`，文件名完全相同，不加语言后缀。两种版本均由 Git 跟踪。从本索引或[英文索引](../README.md) 开始阅读；每个主题只有一个 prose owner，以两种语言表达。

每次触发 PCR 更新，都必须在同一次变更中同步更新两种版本。新增、修改、重命名、移动和删除必须成对处理，包括索引路线和语言链接。所有论断、解释、例子、表格、图示、证据、验证状态、限制和未决问题必须在语义上完全一致；只允许语言和因位置不同而调整的链接存在差别。不得推迟翻译，也不得将任一版本缩减为摘要。

完成 PCR 变更前，逐节对照两种版本，检查同名文件及内容对应关系，并检查两个目录中所有相对链接和标题锚点。证据日期和置信度必须一致；翻译不构成新的验证执行或人类认可。具有约束力的[仓库规则](../../../AGENTS.md#bilingual-pcr-maintenance) 适用于每次 PCR 更新，包括纯文字维护。
