# 历史分离与外部 Limina 依赖

[English](../history-extraction.md) | [简体中文](./history-extraction.md)

## 证据与权威边界

这是 2026-10-02 仅在云端执行分离工作的未盖章实现记录。此前失败云环境的 bundles 与候选对象无法取得。本轮重新构建投影，不声称沿用或复现此前候选 SHA。

最初冻结的 main 是 `57f5cacdbf00b39a3861a711ff6b949976086191`。完成前，远端 main 前进到 `99e797c7c8ab6da76f98d1123ec289878cd1b119`。新增的唯一业务提交已纳入：两个首页组件与其原始内容逐字节相同，其中的双语 intent/map 修改与分离记录合并。其他 UI 任务尚未提交的工作不属于本轮范围。

更新后的冻结历史包含 384 个线性提交。投影 `39555cecc0ba44b4e3975c5630ee4256e64e1748` 保留 287 个，删除 97 个投影后为空的提交：92 个只含专属路径，另有五个混合提交的剩余投影 tree 没有变化。路径分类包含专属实现、文档和 PCR 路径；不代表每个路径混合提交都包含业务行为。[提交映射](../../../maintenance/history-extraction-20261002/commit-map.tsv) 逐项记录原 SHA、投影 SHA、处理动作、分类与主题。

## 范围与保留

投影移除 `packages/limina`、它的专属 skill、包文档与实现 PCR 记录。对于 manifests、根 catalogs/locks、发布脚本及 CI，只移除该实现独占的项目。共享 utils、ESLint、license 工具、仓库治理、Docs Islands 与 Logaria 行为均保留。不按通用子串删除；“eliminates”等普通单词及共享首页营销素材保留。

每个保留提交维持作者、提交者、时间戳与完整正文。重写提交无法保留有效的原签名，不伪造替代签名。原有签名对象保存在归档中。

只计划正常 push 新候选分支与 `archive/pre-limina-extraction-20261002`。归档指向更新后的完整原历史。Main、现有分支与 tags 不重写或删除。恢复 bundle 同时保留原有 heads、tags 和已获取的 pull-request refs。归档与旧 refs 继续保存原对象；这既不是隐私清除，也不代表仓库体积缩减。

## 真实 npm 迁移

九处开发消费者均使用 `limina: catalog:dev`，由 dev catalog 中精确的 `limina: 0.4.0` 支持。每个 manifest 写字面版本会违反仓库的 catalog lint 规则。此共享精确固定没有范围，解析到真实 registry 包，而非 workspace 链接或内嵌构建。最终 lock 由 pnpm 重新生成，并在独立干净 worktree 中验证 frozen 安装。

`@arethetypeswrong/core`、`knip`、`npm-package-json-lint` 与 `publint` 成为显式根开发依赖，因为配置中的可选治理 peers 此前通过 Limina 自身 workspace 开发依赖提供。Knip 保持基线的 `6.38.0`；治理策略及 checker/proof exceptions 均保留。

该 registry 版本使用 MIT、未废弃，并声明 Node `^22.18.0 || >=24.11.0`。其 repository 与 provenance 仍描述 `97fc3accfcc4c4f6aaf9be05e28d0d8c4ec9b08e` 上此前的 `docs-islands` 发布。用户暂时接受此真实版本，不代表已在独立仓库新发布。本轮分离不发布任何 npm 版本。配置支持由安装后 CLI 的实际执行确立，不从版本号或 changelog 标签推断。

## Tags 与发布基线

现有 tags 保留原 target。将未改变的旧 tag 直接用于重写分支，首次 changelog 可能包含无关旧历史。首次分离后的发布应使用既有 `--from-tag` 参数，传入对应映射后的 commit SHA：

```sh
pnpm changelog --package logaria --type patch --dry-run --from-tag 7e6591cc0ff73947d3cef50d2b6c04dcca1d64ef
pnpm changelog --package vitepress --type patch --dry-run --from-tag dbec0d74859fa2c2b77d8f1bdabfafb6f6a1b4a8
```

在最初 57f5 基线上，映射后的范围保留 Logaria 的一个提交及 VitePress 的 41 个提交；直接使用旧 tag 则在投影上统计为 28 与 178。之后的 hero 与迁移提交是合理的新范围条目。交付的 tag 映射覆盖其余原有 tags；不将旧 tag 移动到投影 SHA。

## 验证与限制

独立[历史验证器](../../../maintenance/history-extraction-20261002/verify-history.py)比较每个原始/投影 tree、保留 lock importers、非 Limina manifest 值、提交元数据及 CI 任务依赖。单独的最终 tree 清单将迁移与更新后的 main 对比，包括两个 hero 组件 blob 及共享包。Bundle 恢复验证使用全新 bare 仓库，检查精确 refs 与 trees。

初步 Linux 验证通过九项目包构建、真实 Limina default/package 检查、379 个 VitePress 单元测试、99 个 Logaria 单元测试、六个发布脚本测试与三个站点的文档构建。此前冻结基线复现了 VitePress 的 Vite 5 `module-runner` 解析失败；真实 lock 再生成使保留的单元测试套件通过，没有新增自定义 override。最终报告与命令清单区分初步执行、最终干净 worktree 执行及候选精确 SHA 上的远端 CI。

基线与候选的消费者 MPA smoke 均在导入 `@vitejs/plugin-react-swc` 时失败。独立真实消费者诊断出 SWC 的 `ERR_SWC_NATIVE_CACHE`：云文件系统中，默认缓存与新建私有缓存均具有不受信任的父目录。不削弱缓存安全检查、断言、治理门禁或权限。Playwright 官方浏览器下载在此云环境也返回 HTTP 403；使用既有受支持 executable override 的测试可以使用系统 Chromium，实际浏览器覆盖记录在报告中。冻结基线中的 utils test target 没有测试文件。这些事实不能证明产品回归，也不能证明 smoke/CI 已通过。

## 恢复与复现

[恢复说明](../../../maintenance/history-extraction-20261002/README.md)介绍全新 clone 的 checkout、bundle 恢复、本地对比及投影复现。交付包含原始与候选 bundles、完整逐文件决策、tag 映射、registry integrity 证据及命令日志。恢复创建独立本地 refs 或仓库，不需要 reset 本地 main 或 force 任何远端 ref。
