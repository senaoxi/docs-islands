# 已实现的范围与未决方向

[English](../intent.md) | [简体中文](./intent.md)

## 证据边界

本记录描述由当前源码、测试、manifest、配置、构建输入、public exports 和命令执行建立的范围。

目标受众、长期产品定位、未来框架覆盖、设计理由和永久非目标不能仅由实现建立。下文记录的方向与约束仍与已交付支持分开；未决方向问题仍需明确的项目决策。

## 当前实现

根 manifest 以文档站点描述本仓库，对外的 Docs Islands 包是 `@docs-islands/vitepress`。

当前文档框架集成专属于 VitePress：

- `@docs-islands/vitepress` 接受并修改 VitePress `UserConfig` 对象。
- 其 node 集成 import VitePress types，将 VitePress 配置和 build hooks 映射到包的 runtime。
- 其 client 集成 import `vitepress/client` 生命周期 API，并适配为共享 client contract。
- 已发布包提供 VitePress 专属的 node、client、theme 和开发工具入口。

当前 UI 框架实现是 React：

- `DocsIslandsAdapter` 是 `createDocsIslands()` 使用的 adapter contract。
- `createDocsIslands()` 接受 adapter 数组，并按支持的框架集合校验每个 adapter。
- 当前支持的框架集合只有 `react`。
- 当前源码目录、构建输入和 package exports 只提供 React adapter。

`@docs-islands/core` 提供 VitePress 集成所使用的 client、node、shared 和 types 入口。其 manifest 将该包标记为私有。

当前公开的 Docs Islands 入口不是通用 Web 应用框架。其配置、生命周期集成、exports、peer dependencies、测试、playground 和 smoke 包均围绕 VitePress 文档站点展开。

仓库开发环境通过根 `preinstall` 脚本和包管理器配置强制使用 pnpm。这是仓库约束，并不意味着已发布包的消费者必须使用 pnpm。

Logaria 和 `@docs-islands/vitepress` 是本 workspace 的公开发布单元。发布配置为两者分配独立的包目录、发布目录、版本、changelog 和 tag 前缀。Limina 作为固定到 npm `0.4.0` 的外部开发依赖使用，其源码与发布不再属于本 workspace。

## 由实现推导的结果

Adapter 数组和 adapter contract 允许多个 adapter 实例参与编排，但受支持框架集合和重复框架校验的约束。这是实现性质，并不能证明当前支持多个 UI 框架。

`@docs-islands/core` 与 `@docs-islands/vitepress` 的分离，使框架专属包能够使用框架无关的抽象。源码建立了这种结构，但没有建立设计理由。

仓库可以在一个 workspace 内开发和发布 Docs Islands 与 Logaria，而不将它们合成一个发布包。两者的 manifest、构建产物、release entries 和 tags 仍然独立；外部 Limina CLI 负责该 workspace 的治理。

## 文档框架方向

Docs Islands 的产品方向是桥接文档框架与 UI 框架：文档框架处于底层，Docs Islands 处于中间桥接层，UI 框架处于上层。这个方向不代表新增集成已经交付。

[首页示意图](../../../docs/.vitepress/theme/components/landing/DocsHeroMockup.vue)必须区分当前支持与规划集成。VitePress + React 是当前 Docs Islands 集成，由[支持的 adapter 集合](../../../packages/vitepress/src/node/constants/adapters/index.ts)、[orchestrator](../../../packages/vitepress/src/node/core/orchestrator.ts)和[package exports](../../../packages/vitepress/package.json)建立。Vue 通过 VitePress 原生渲染可用，不是 Docs Islands adapter。Docusaurus、Nextra、Rspress、Svelte 和 Solid 是规划示例；出现这些名称不代表实现、优先级、发布日期或逐项集成路线已经确定。

文档框架被悬停、键盘聚焦或轻触时，应产生有节制的向上传递响应，参考 [Vite](https://vite.dev/) 的分层交互。保留键盘访问、减少动态效果、亮暗主题与手机布局。首页移除 Core controls 及不再使用的组件专属文案和样式；Logaria 与 Limina 仍保留独立能力、包和文档。

这些约束没有人类认可标记。实现与验证证据仍须与产品方向分开。

## 视觉标识方向

Docs Islands 标识采用左下文档轮廓、右侧高轮廓和一片分离、倾斜的小岛。保持简约、原生 SVG、favicon 尺寸可辨识，并适用于单色和白色反白。主色为 `#7051E8`，深墨色与反白分别为 `#211E2E` 和白色。参考图形不是站点资产。

Logo 与 favicon 入口共用这一标识及克制的有限动画，参考独立 Limina 站点的 logo 行为。外部轮廓保持稳定，小岛在入场或交互时短暂响应。这一参考既不将 Limina 纳入产品，也不移植其几何形状。

通过布局、卡片间距和页脚换行降低示意图高度，同时保留三层结构、可读标签、VitePress + React 路径、原生 Vue 区分、规划标签、悬停／聚焦／触控选择、键盘退出与减少动态效果。

这些约束没有人类认可标记。[视觉架构](./architecture.md#视觉标识与图示布局)负责实现证据；实现变更必须报告验证。

## VitePress 集成标识方向

集成标识采用两条错位的圆角文档边界，围绕一片分离、倾斜的小岛。简洁的几何文档槽保留主标的圆角实心形状与负空间；排除此前的长曲线 V，因为其有机外观妨碍文档隐喻的辨识。

紫色 `#7051E8` 属于 Docs Islands 的 VitePress 适配层 `@docs-islands/vitepress`，不代表上游 VitePress 官方标识。当前支持仍为 VitePress + React。Package 导航、首页标识、favicon 与相关品牌入口采用同一原生 SVG 源及既有有限小岛动画和减少动态效果机制。保留主项目与其他产品标识；参考 PNG 不进入公开资产。

这些约束没有人类认可标记。[`assets/logo/docs-islands-vitepress.svg`](../../../assets/logo/docs-islands-vitepress.svg)保留采用的几何形状；[视觉架构](./architecture.md#视觉标识与图示布局)负责实现证据及验证边界。

### 集成落地页

Terminal 演示通过 `@docs-islands/vitepress` 集成 React 组件。双语首页及 Terminal 修改前后的 Markdown 缓冲区均为 `IntegrationWalkthrough` 配置 `spa:sync-render client:load`。`client:load` 调度立即 hydration；显式启用的 `spa:sync-render` 让预渲染 HTML 与 CSS 随生产环境 SPA 导航同步落地。这一源码配置不修复[共享 loader 的 hydration 限制](./architecture.md#vitepress-集成落地页展示)。

终端位于桌面首页 Hero 右侧。省略终端下方的进度句子与说明段落。Playground 是静态文字，不具有复制能力。

克制、偏技术的双语页面保留当前 React 支持、有效的安装／配置／Markdown 参考、基于源码的开发／构建／SSR 说明、指南／示例／配置入口、导航、部署 base 与主站代理边界。桌面／手机及浅色／深色展示共用紫色集成标识。

用例展示实际 `index.md` 基线及既有 React script，保留 `IntegrationWalkthrough` 导入和元素，通过普通字符串属性启用预备好的小尺寸 Sunset 组件。原型、图集与 CSS 模块在回放前已经存在。模拟保存 Markdown 后，Sunset 在左下出现并播放全部五个跳跃帧。它使用全部八个原生帧向右奔跑；修改既有 CSS 模块方向后，使用全部八个原生向左帧返程。保留尺寸、配色、位置、帧相位与 React 实例。在左侧终点慢速循环全部六个思考帧。整个过程是一次自动旅程，不设置独立 Page 预览、计数器、手动继续或点击／聚焦／悬停门槛。可见性变化保留时钟且不追赶后台时间；减少动态效果时显示静态完成状态。

辅助 vi 模拟保留既有内容与导入，显示行号、NORMAL/INSERT 与光标位置，先配对括号／引号和 JSX/HTML 标签再填充内容，为新行缩进，最后用 Esc 与 `:wq` 保存退出。插入前预留换行，避免与后续内容粘连，包括 `export default config;`、外层 `};` 和首页 script 闭合。嵌套闭合标签持续可见并随插入内容下移；自闭合标签保持正确 JSX 行为。退出 vi 后，shell scrollback 保留命令、保存提示和渲染／HMR 输出。输入延迟除以 1.2，阅读停顿保持不变。采用确定性的自然 token 批次与语义停顿，不追赶后台时间。验收要求完整真实浏览器回放及实测时长。

文件与日志仍明确标为模拟。移动图形必须使用已支持的导入式 React 集成；不得暗示内联函数注册或掩盖 runtime 缺口。实际 CSS HMR 连续性须单独验证。按终端尺寸测量路线，防止文本遮挡与手机溢出；保留完整配置参考。后续 Senao `/repos` 集成仍是待实现约束：此用例稳定且验证通过后按顺序复用，保留独立 Limina 演示、公开边界与既有工作，避免并发构建。本地实现与验证不代表已经部署。

Sunset 是页面内图形，与网站主标及应用宠物设置独立。复用图集完整的原生跳跃、向右奔跑、向左奔跑与思考行，不重绘、镜像或变形。只发布必要图形，不包含本机宠物元数据、参考截图或个人路径。HMR 修改预备控制器的 CSS 方向属性，不缩放或重绘角色配色。

这些约束没有人类认可标记。[落地页架构](./architecture.md#vitepress-集成落地页展示)负责源码行为与已知限制；runtime、浏览器和构建验证须单独报告。

## 当前实现未建立的内容

当前实现建立了 VitePress 是唯一文档框架集成的事实，没有建立支持其他文档框架的计划。

当前实现建立了 React 是唯一 UI 框架 adapter 的事实，没有建立新增 Vue、Svelte、Solid 或其他 adapter 的计划。

当前实现不是通用 Web 应用框架，但这不能建立“成为通用 Web 应用框架是永久非目标”的结论。

源码没有建立主要受众是文档团队、组件库维护者、企业用户还是其他群体。

## 需要人类确认的方向

- 应优先推进哪些新增文档框架集成，哪些证据能够建立对它们的支持？
- 应优先推进哪些新增 UI 框架 adapter，哪些证据能够建立对它们的支持？
- 根 Docs Islands 项目、Limina 和 Logaria 的长期产品关系是什么？
- 主要目标用户是谁？
- 哪些方向是永久非目标？
- `@docs-islands/core` 与 VitePress 集成分离的哪些设计理由应记录下来？
