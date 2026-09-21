# Limina 系统模型

[English](../limina-system-model.md) | [简体中文](./limina-system-model.md)

本页拥有实体、authority、phase 和 relation 的定义。证据等级与维护规则见[入口](./limina.md)。本模型来自当前生产调用链；目录名称或一个未接入的抽象不构成运行证据。

## 系统边界与真实入口

`bin/limina.js` 在 source 存在时用 tsx 启动 CLI，否则启动构建后的 CLI；[factory](../../../packages/limina/src/cli/factory.ts) 注册 commands。commands 调用 pipeline、graph/source/proof/checker/package/release 的各自 runner。preflight 聚合当前 generation 的 workspace、graph 和 route snapshots；executor 安排 task 顺序、资源与 generation。checker 工具链执行类型检查和声明编译，Limina 解释输入、投影配置、验证关系并管理自身产物。

[AnalysisRun](../../../packages/limina/src/application/analysis/analysis-run.ts) 和 [AnalysisProviderSet](../../../packages/limina/src/core/index.ts) 已参与生产 preflight。[ArchitectureValidationWorkflow](../../../packages/limina/src/application/validation/architecture-workflow.ts) 的 typed registry、views 与 validators 有独立实现和测试，但当前生产调用搜索没有找到它的消费者。实际 graph/source/proof 仍由各自 runner 组织阶段。因此不能画成“CLI 统一执行该 registry 的七个 validator”。这是当前接线边界；将来是否统一属于未决设计。

## 实体与 identity

| 实体                       | Identity / 创建处                                                                                                                                                                                                                   | 拥有什么，不能据此推导什么                                                                                                                                |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace / region         | loader 找到的 workspace root，validated region boundaries                                                                                                                                                                           | pnpm 发现范围不自动等于治理范围；嵌套 workspace、package scope 与 exclusions 参与边界选择                                                                 |
| WorkspacePackage           | 逻辑 package directory + [canonical identity](../../../packages/limina/src/core/workspace/validated/package-identities.ts)；name 可缺省                                                                                             | raw 与 activated packages 分开；同一物理 package 的重复 alias 被拒绝。name-dependent graph export 另要求 name                                             |
| Source config              | normalized absolute config path；[config-paths](../../../packages/limina/src/core/tsconfig/config-paths.ts)                                                                                                                         | checker ownership 单位是 config。`normalizeAbsolutePath` 是 lexical portable path，不能宣称所有 tsconfig symlink alias 都已 realpath 合并                 |
| Type / solution config     | [solution-role](../../../packages/limina/src/core/tsconfig/solution-role.ts) 与 ownership state                                                                                                                                     | 空 effective files 且 raw 存在 references 的 solution 管组织闭包；Limina 的受支持 solution basename 是 `tsconfig.json`；type leaf 才有语义与执行 owner    |
| Checker identity           | [registry](../../../packages/limina/src/checker/registry.ts) 的 exact checker name                                                                                                                                                  | `tsc`、`tsgo`、`vue-tsc` 的执行身份与 TypeScript/Vue 等 semantic family 不等价                                                                            |
| Ownership state            | [checker-ownership-types](../../../packages/limina/src/core/build-graph/checker-ownership-types.ts)                                                                                                                                 | authoritativeOwner、localOwner、semanticAuthority、frozenSemanticAuthority、finalOwner 各有阶段，不是同一个 owner 字段的别名                              |
| ProjectSemanticContext     | [context](../../../packages/limina/src/core/project-dependencies/context.ts)：config/options/roots/raw refs/family/package/toolchain/generation                                                                                     | locked 类型输入的语义解释环境；`fileNames` 是 importer roots，`ownedFileNames` 服务实际归属，Program files 是编译闭包                                     |
| ImportRecord               | [records](../../../packages/limina/src/core/import-analysis/records.ts)：file + kind + locator + specifier                                                                                                                          | 一个字符串可有多个 occurrence。resolution identity 再加 context、mode、redirected reference；同一 specifier 不足以作为缓存 key                            |
| Native / prepared fact     | [dependency-fact](../../../packages/limina/src/core/typescript-semantic/dependency-fact.ts)、[framework contracts](../../../packages/limina/src/core/framework-semantic/contracts.ts)                                               | resolution、admission、TypeEvidence、referenceRequirement、provenance 保留各自含义；fact 不是最终 graph edge                                              |
| Generated graph / target   | [graph result](../../../packages/limina/src/core/build-graph/runner.ts)、[dependency plan](../../../packages/limina/src/typecheck/build/dependency-plan.ts)                                                                         | source→generated/config role/owner/typed edges；执行 target 用 checker + source config + generated config 匹配，不能仅按文件或包名合并                    |
| Namespace / plan / receipt | [namespace](../../../packages/limina/src/domain/artifacts/namespace-core.ts)、[plan](../../../packages/limina/src/domain/artifacts/plan.ts)、[preflight materialization](../../../packages/limina/src/preflight/materialization.ts) | namespace token、plan authenticity、revision 与 receipt slot 各防不同 stale/forged 状态；generation 数字相等不足以授权                                    |
| Finding / issue / attempt  | 各域 finding → issue projector；[attempt IO](../../../packages/limina/src/source-check/snapshot/check-attempt-io.ts)                                                                                                                | issue identity 做稳定去重；attempt ID + sequence + completion digest 证明查询 freshness。domain GovernanceIssue 不能无条件当成 persisted LiminaCheckIssue |

## Authority 的六个维度

| 维度                | 来源                                                                                                                                             | 拒绝的跨维度推导                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| Workspace authority | [validated create](../../../packages/limina/src/core/workspace/validated/create.ts)：raw discovery → exclusions/overlap/islands/output authority | “pnpm 找到包”不能证明它在本次治理范围                             |
| Semantic authority  | explicit/config/root/dependency evidence 在 ownership 求解中锁定                                                                                 | “最后由 vue-tsc 构建”不能改写成 Vue 解析                          |
| Execution ownership | explicit leaf closure、equality coloring、fallback、finalization                                                                                 | 构建身份不证明 runtime import 被 package 授权                     |
| Source ownership    | 实际 root membership、validated package/source rules                                                                                             | 目录最接近、exports 名称、Oxc 找到文件都不能替代实际 owner        |
| Artifact authority  | namespace/authenticated plan/revision 与 managed-output attribution                                                                              | 输出反向归属不重新创造源码 reference；有输出路径不等于允许写      |
| Mutation authority  | trusted base 的物理 identity、scope、generation、path/identity guards                                                                            | lexical containment 不充分；计划写某路径不能授权沿 symlink 改别处 |

一个项目可以有 TypeScript semantic authority、`vue-tsc` final owner、source package owner 与独立 output authority；这是合法组合。[I01–I12](./limina-invariants.md) 说明哪些转换受保护。

## Validated region 的内部查询索引

[WorkspaceRegionPathIndex](../../../packages/limina/src/core/workspace/validated/path-index.ts) 只消费最终 `ValidatedWorkspaceContext`。validation 负责确认 activated package identities、stable boundaries 与 source configs；[索引构建器](../../../packages/limina/src/core/workspace/validated/path-index-build.ts) 不重新扫描 manifest/workspace、不重新解释 exclusions 或 extended scopes。否则一次查询就可能重新赋予 validation 已经排除的 authority。

运行时 activated-package 与 boundary authority 只能来自这层 trie-backed index，直接查询或通过 [WorkspaceLookupIndex](../../../packages/limina/src/core/workspace/lookup/workspace-index.ts)。它的 package/owner lookup 只选择 classification 返回的精确目录，不回退到最近的 containing package 或 owner。即使文件物理上仍位于 activated 祖先下，boundary 结果也必须保持 null ownership。内部 export 不得以兼容 alias 保留 package-array 或 owner-array classifier。

这层索引承载高频的文件级 membership predicate。同一 provider 内，[source candidate 收集](../../../packages/limina/src/core/workspace/file-candidates.ts) 逐文件过滤，[graph check](../../../packages/limina/src/graph-check/check-context.ts) 与 [source check](../../../packages/limina/src/source-check/source-projects.ts) 分别过滤 project fileNames / ownedFileNames；[owned sources 校验](../../../packages/limina/src/core/build-graph/source-projects.ts)、[framework source root](../../../packages/limina/src/core/build-graph/framework-file-root.ts)、[source config ownership](../../../packages/limina/src/core/build-graph/source-config-collection.ts) 和 [local import governance](../../../packages/limina/src/source-check/import-record-validation.ts) 继续依赖这些分类。下游通过同一 index 的 classifyPath、isInsideActivatedRegion、findPackageForPath、isSourceConfigPath 或 lookup facade 反复查询，因此评估应包括整批新文件的首次分类、跨步骤的 exact-cache 重用和 provider 总生命周期成本。单次 cwd 查询仍是实际边界场景，但不代表这些治理流程的主调用性质。

[Governance trie](../../../packages/limina/src/core/workspace/validated/governance-trie.ts) 将 canonical package roots 编成 activation，将 stable boundary roots 按原 lexical owner attribution 编成 owner-scoped cuts。virtual root 保留 absolute root/drive，因而 config root 外的 activated package 也可以命中。DFS 先选 activation，再应用 cuts，将有效 owner 与具体 boundary 直接保存在节点上；查询沿完整 path segments 取最长匹配，不需要为源码目录或每个 node_modules 建节点。

例如 A activation → B cut(A) → C activation → D cut(C)，四个子树分别得到 A、boundary B、C、boundary D。DFS 仍保留最近 activated identity 的归因：如果 B 后还有更深的 cut(A)，诊断必须返回更深 boundary，不能因 B 已将有效 owner 置空而漏掉它。沿分支保存并回退 owner cuts 也覆盖 symlink 把某 cut 的 canonical root 投影到 owner activation 上方的情况。归因身份不等于当前治理权限；boundary 仍使该 owner 的分类返回 null。

节点只保存一个路径段；只有多个 child 才分配 Map，单 child 直接连接，owner/boundary 内联保存。这样减少稀疏链的保留对象，而不引入 radix compression 或另一套查询后端。activation/cut 事件表与 DFS 归因栈仅在构建期存在。200–300 包、少量边界、较深源码目录是性能评估的代表模型；密集边界仍需独立压力检查，不能用访问次数或其中一个样本概括所有运行成本。

lexical exact cache 仍位于 canonicalization 之前；未命中才使用原 canonicalProjectedPathSync 和 instance canonical cache。source config 继续独立保存 canonical Set，并先要求文件位于 activated region；trie 不参与 importer 的 lexical matching。`workspace-path-trie-segment-visit` 计量尝试的段查找（含第一个缺失段），不再以 ancestor visit 命名。公开 classification 字段、具体 boundary 对象和负结果缓存保持不变。

其他 path algorithm 各有独立职责：builder 在发布 trie 前归因 boundary cuts；candidate glob ignores 先剪枝枚举，再由 index 最终检查 membership；importer matching 保留 lexical 语义；project ownership 与已知 package 的 artifact/config grouping 仍是局部关系。[Package-scope lookup](../../../packages/limina/src/core/workspace/lookup/package-scope.ts) 先从 trie 获得 activated package，再搜索 manifest。在向上遍历祖先前，它利用查询路径和已选包根的 canonical path，将查询转换到该包保留的 lexical directory 下。因此，搜索路径与停止根使用同一种路径写法，即使 alias 直接指向包内子目录，或查询带有尚不存在的尾部路径，也能成立。无名称的 activated root 会让 named-scope lookup 返回 null，不能借用包外祖先的名称。返回的 manifest 路径保留 exact package-path map 使用的包身份。这一转换发生在 trie 准入之后，不会选择另一个 owner；未激活的路径仍被拒绝，独立的 node_modules lookup 保留 lexical search。[Package-scope guards](../../../packages/limina/src/__tests__/workspace-package-scope.spec.ts) 覆盖 alias 双向查询、查询与缓存顺序、nested scopes、boundary 拒绝及 resolved-target facade。

可执行边界由 [workspace directory index tests](../../../packages/limina/src/__tests__/workspace-directory-index.spec.ts) 的仅限测试的 trie semantic equivalence 线性 oracle、跨 cut 与重入的 package/owner facade 直接对比、重入/同根事件/canonical relocation/cache/error 与深目录停止条件保护；[workspace validation tests](../../../packages/limina/src/__tests__/workspace-validation.spec.ts) 检查最终治理事实与指标。索引有效期见[生命周期页](./limina-lifecycle.md#cache-identity-与能力范围)。

[FileOwnerLookup](../../../packages/limina/src/core/build-graph/file-owner-lookup.ts) 为 build-graph 消费者独立索引已登记文件归属。effective membership 服务 pending qualification、ownership dependency 与 coloring；governed owned files 服务 declaration selection 与 framework scheduling。exact lexical 命中保持已有 overlap 规则，仅 miss 时查询 canonical identity；fallback 返回所有已登记 config、按 config 去重，只接受唯一 owner，多 owner 报歧义，不按目录深度选择。结果同时返回 owner 登记路径，用于 `ownedFileNames` 与 Vue profile 匹配；resolution、occurrence 和诊断保留原始 lexical 写法。不通过目录遍历虚构 owner，WorkspaceSourceBoundary 仍只回答 Boolean membership。[Owner lookup tests](../../../packages/limina/src/__tests__/file-owner-lookup.spec.ts) 覆盖双向 alias、exact/fallback 冲突、查询顺序、跨 checker provider 匹配和 alias 变化后的新索引；[generated graph tests](../../../packages/limina/src/__tests__/generated-graph.spec.ts) 覆盖关系消费者。

## Pipeline 与 phase contracts

```mermaid
flowchart TB
  CLI["CLI 与配置验证"] --> Plan["Execution plan：任务与 command 分段"]
  Plan --> Workspace["当前 generation 的 validated workspace"]
  Workspace --> Ownership["roots 与 dependency facts → authority lock / freeze"]
  Ownership --> Graph["color / finalize → typed graph 与 artifact plan"]
  Graph --> Checks["graph / source / proof 按各自阶段读取事实"]
  Graph --> Materialize["需要文件的任务：materialization prerequisite"]
  Materialize --> Checker["checker build / typecheck"]
  Materialize -->|"含文件任务的 segment，其余 tasks 也等待"| Checks
  Checks --> Result["task outcomes 与 issue freshness"]
  Checker --> Result
  Plan --> Command["command step：执行后推进 generation"]
  Command --> Workspace
```

箭头表示依赖，不表示所有任务逐个串行执行。[steps](../../../packages/limina/src/pipeline/steps.ts) 定义默认 graph/source/proof/checker build/checker typecheck 五类任务；[plan](../../../packages/limina/src/pipeline/plan.ts) 将默认 tasks 标为 independent，named pipeline 标为 ordered。`after` 表示等待结束，`requiresSuccessOf` 表示成功前提。命令划分 generation；需要文件的 segment 插入 materialization prerequisite，该 segment 的 tasks 等它成功。用户的根 `lib` pipeline 是配置选择，不是默认 pipeline。

| Phase                     | 合法输入 → 输出                                                                                                           | 不得提前使用的事实 / 失败边界                                                                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Load / validate           | config export + root → normalized config/validated plan                                                                   | schema/config 失败可发生在 attempt 发布之前，不能承诺每个 CLI 失败都有新 inventory                                                                                            |
| Workspace validation      | raw package/config候选 → ValidatedWorkspaceContext                                                                        | overlap、重复物理 package、无效 scope/output authority 阻断后续投影；rawPackages 留作原始证据                                                                                 |
| Ownership discovery       | default entries、raw references、named scopes → type/solution states                                                      | named solution 的 authoritative closure 此时已参与；不能说所有 solution constraints 都发生在 freeze 后                                                                        |
| Evidence convergence      | pending native facts / locked checker facts → 完整 dependency requirement set、locked semantic family                     | 先收集全部 pending requirements 再应用依赖锁，避免首个 import 隐藏跨框架冲突                                                                                                  |
| Freeze / color / finalize | locked semantic facts → frozen authority、exact owner、solution closure、checker entries                                  | [resolution](../../../packages/limina/src/core/build-graph/checker-ownership-resolution.ts) 先 freeze，后 Vue promotion / build coloring / finalization；后面只能改变执行归属 |
| Graph projection          | requirements + 实际 source membership + implicit refs → declaration / framework relations、generated files、artifact plan | 找不到唯一 owner、deny、checker identity conflict 不能靠最近目录或弱 resolver补齐                                                                                             |
| Validation                | graph/route/source evidence → 域内 finding、issue/outcome                                                                 | graph、source、proof 各自有前置阶段；proof 的 route/config 失败会限制后续 coverage 判断                                                                                       |
| Materialize / checker     | authenticated plan/authority → files/receipt → external checker outcome                                                   | 内存 graph 不代表磁盘已完成；产物发布与 checker 程序退出分别报告                                                                                                              |
| Complete / query          | settled outcomes → authenticated attempt terminal state                                                                   | query 读取已有状态，不重新运行；最新失败状态禁止伪装旧 completed inventory 为新结果                                                                                           |

## Relation taxonomy

| Relation                     | Producer / 意义                                                                                                 | 下游权限与边界                                                                               |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| raw tsconfig reference       | source config 的 TypeScript 输入关系                                                                            | 可影响原生语义与 solution closure；inferred/generated refs 不倒灌回该输入                    |
| solution-leaf equality       | solution terminal leaf closure                                                                                  | 参与 build identity equality；不要求先有 import occurrence                                   |
| native occurrence resolution | TS 的 module/path/type/lib/JSX channels                                                                         | 只证明该 occurrence 的解释结果；admission 与 TypeEvidence 独立                               |
| referenceRequirement         | NativeDependencyFact 的 source-semantic / compiler-membership                                                   | 是需要 compiler relationship 的证据；仍需 membership、deny、identity 与 graph 分类           |
| `implicitRefs`               | 用户 liminaOptions 声明的 config relation                                                                       | 可生成 references，拥有自己的合法性约束；无需虚构 import evidence                            |
| declaration-provider         | [reference-recording](../../../packages/limina/src/core/build-graph/reference-recording.ts)                     | 生成 TypeScript references、声明构建依赖；成功边 exact checker 相同且 reusable               |
| framework-schedule           | [framework-reference-inference](../../../packages/limina/src/core/build-graph/framework-reference-inference.ts) | 证明的 source implementation 顺序；不生成 tsconfig reference，不赋予 declaration cache reuse |
| output/artifact attribution  | managed output lookup 与 output declarations                                                                    | 支持 concrete declaration evidence/diagnostics；不能回推源码建边                             |
| configured governance rule   | graph labels/rules、source package/import/ambient policy、proof boundaries                                      | 可以判定观察到的关系违法；不能创造缺失的 compiler fact                                       |
| exported dependency edge     | [dependency-graph](../../../packages/limina/src/dependency-graph/) 的 package source/artifact evidence          | 用于架构观察；export schema 没有完整 task/resource/cache model，不是 execution plan          |

声明目标 `.d.ts/.d.mts/.d.cts` 是 artifact 终点；存在 source 文件也不够，必须有合法 requirement。执行依赖计划同时看到声明边与调度边；dependency plan 先过滤相同 target 的自依赖；两个及以上 target 的 SCC 中含 declaration relation 被拒绝，纯 framework SCC 可以执行。准确 guard 见 [graph-validation](../../../packages/limina/src/core/build-graph/graph-validation.ts) 与 [declaration-cycle](../../../packages/limina/src/typecheck/build/declaration-cycle.ts)。

## Failure semantics 与投影边界

配置/namespace/authority 不合法通常直接 throw；语义 preparation 不支持、source-map 不可信等成为 stage-specific failure；module missing、resource、unmapped generated 可成为 observation。`resource` 不是 TypeEvidence，missing 不等于异常。graph/source/proof 在自己的领域决定这些事实是否构成 issue。

graph runner 验证关系、rules、condition/export 约束；source runner 验证 ownership、package import/dependency/ambient 规则并可结合 Knip；proof runner 比较 expected source 与 checker coverage；package runner检查配置 outputs；release runner检查发布一致性。可选工具与配置决定覆盖面，单个域通过不证明其他域通过。入口证据：[graph](../../../packages/limina/src/graph-check/runner.ts)、[source](../../../packages/limina/src/source-check/runner.ts)、[proof](../../../packages/limina/src/proof/runner.ts)、[package](../../../packages/limina/src/package-check/runner.ts)。

source resource 检查分别问物理文件是否存在、类型是否声明、package import 是否授权；[resource-module-findings](../../../packages/limina/src/source-check/resource-module-findings.ts) 按原样检查 module specifier：`package.json#imports` key 保留其中的 `?`/`#`，普通 specifier 也不会在 query 或 fragment 处拆分去检查另一条物理路径，因此带 query 的导入不会仅凭后缀产生 resource finding。写 issue 时路径规范化。proof allowlist 带 reason 并接受范围/已有coverage校验；它是明确配置的例外，不代表 checker 实际读取了文件。package 检查配置 entries 的 Publint/ATTW/boundary 结果，不自动覆盖所有 raw workspace packages。

executor 区分 passed、failed、disabled、blocked、skipped 等 task outcome，stop policy、前提依赖与基础设施异常另有处理。issue presentation 和 completed inventory 不能把“未运行”“数据不可用”变成“零问题”。精确状态以 [tasks](../../../packages/limina/src/execution/tasks.ts)、[execution-results](../../../packages/limina/src/execution/execution-results.ts) 和 [snapshot types](../../../packages/limina/src/source-check/snapshot/types.ts) 为准。
