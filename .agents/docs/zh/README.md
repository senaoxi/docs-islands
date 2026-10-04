# 项目上下文记录索引

[English](../README.md) | [简体中文](./README.md)

本目录保存持久的项目上下文。源码、测试、manifest、配置和可执行脚本建立当前行为；记录用于帮助检索，不能证明其中的论断仍然有效。阅读时应查看各记录的证据范围和验证状态。

这些记录都是未加认可标记的 AI 草稿，尚未经过人类认可。

当记录与实现冲突时，检查双方并判断哪一方已经过时。不要默认记录正确。

每份记录区分：

- **当前实现**：由仓库可执行证据直接建立的事实。
- **由实现推导的结果**：根据多个实现事实推导出的结果，不宣称设计意图。
- **需要人类确认的方向**：实现无法建立的受众、理由、未来范围和永久非目标。

| 领域                 | 记录                                                          | 范围                                                                                  |
| -------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 仓库层面已实现的范围 | [intent.md](./intent.md)                                      | 仓库当前对外提供的产品范围，以及源码无法回答的方向问题                                |
| Docs 首页框架示意图  | [intent.md](./intent.md#文档框架方向)                         | 多框架桥接方向、已支持与规划路径、交互、可访问性和移除范围                            |
| 视觉标识与紧凑图示   | [architecture.md](./architecture.md#视觉标识与图示布局)       | 产品各自的 SVG 源、生成版本、有限的小岛动画、紧凑布局及相关设计约束                   |
| VitePress 集成标识   | [intent.md](./intent.md#vitepress-集成标识方向)               | 已采纳的子项目几何、紫色主色、package 范围、保留的主标与本地采用                      |
| VitePress 集成落地页 | [architecture.md](./architecture.md#vitepress-集成落地页展示) | 自动辅助 vi、保留日志、Sunset 完整帧序列、CSS 触发返程、慢速思考循环及语言／base 路由 |
| VitePress 集成文章   | [architecture.md](./architecture.md#vitepress-集成文章主题)   | 局部紫色阅读 tokens、Markdown 归属、表格溢出、移动键盘行为、保留的 islands 及验证边界 |
| 工具链与强制约束     | [technology-stack.md](./technology-stack.md)                  | 包管理器、Node.js、模块格式、任务执行、构建工具和治理工具                             |
| Workspace 与包边界   | [architecture.md](./architecture.md)                          | Workspace 布局、发布单元、私有包、依赖方向、adapter 边界、构建边界和根落地页展示      |
| 第三方 npm 依赖准入  | [dependency-admission.md](./dependency-admission.md)          | 必要性、npm 采用情况、生产产物影响、许可证兼容性、废弃版本拒绝规则和维护状态比较      |
| 历史分离与外部 CLI   | [history-extraction.md](./history-extraction.md)              | 冻结基线、归档、npm 固定版本、changelog 映射基线和验证边界                            |

根级[意图记录](./intent.md) 不定义 Limina、Logaria 或 VitePress 集成的完整长期意图。Limina 实现记录保存在原历史归档中。[history-extraction.md](./history-extraction.md) 拥有本仓库的历史分离和外部 CLI 依赖事实。如果 Logaria 或 VitePress 集成需要稳定的产品边界或决策历史，应新增相应领域的记录，而不是无限扩充根意图记录。

## 双语发布与维护

英文记录位于 `.agents/docs/<name>.md`，作为对外版本。对应中文记录位于 `.agents/docs/zh/<name>.md`，文件名完全相同，不加语言后缀。两种版本均由 Git 跟踪。从本索引或[英文索引](../README.md) 开始阅读；每个主题只有一个 prose owner，以两种语言表达。

每次触发 PCR 更新，都必须在同一次变更中同步更新两种版本。新增、修改、重命名、移动和删除必须成对处理，包括索引路线和语言链接。所有论断、解释、例子、表格、图示、证据、验证状态、限制和未决问题必须在语义上完全一致；只允许语言和因位置不同而调整的链接存在差别。不得推迟翻译，也不得将任一版本缩减为摘要。

完成 PCR 变更前，逐节对照两种版本，检查同名文件及内容对应关系，并检查两个目录中所有相对链接和标题锚点。证据日期和置信度必须一致；翻译不构成新的验证执行或人类认可。具有约束力的[仓库规则](../../../AGENTS.md#bilingual-pcr-maintenance) 适用于每次 PCR 更新，包括纯文字维护。

## 写入与隐私复核

修改记录或保存审计结果时使用 [project-context-writing](../../skills/project-context-writing/SKILL.md)。保留技术事实、理由、决策、验收标准、证据日期与实现限制；去掉私人对话归因、个人路径和会话／任务标识。交付或获授权提交前复核两个语言版本。
