# 已实现的范围与未决方向

[English](../intent.md) | [简体中文](./intent.md)

## 证据边界

本记录描述由当前源码、测试、manifest、配置、构建输入、public exports 和命令执行建立的范围。

仅凭实现不能建立目标受众、长期产品定位、未来框架覆盖、设计理由和永久非目标。下文单独记录人类明确提出的文档方向，区别于已交付支持；其他方向问题仍需人类确认。

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

## 人类明确提出的文档方向

2026-10-01，用户明确提出 Docs Islands 应桥接多个文档框架与多个 UI 框架：文档框架处于底层，Docs Islands 处于中间桥接层，UI 框架处于上层。这是产品方向，不是新增集成已经交付的证据。

[首页示意图](../../../docs/.vitepress/theme/components/landing/DocsHeroMockup.vue) 必须清楚呈现这一关系，并区分当前支持与规划中的集成。VitePress 和 React 是当前支持的路径，证据来自[支持的 adapter 集合](../../../packages/vitepress/src/node/constants/adapters/index.ts)、[orchestrator](../../../packages/vitepress/src/node/core/orchestrator.ts) 和 [package exports](../../../packages/vitepress/package.json)。Docusaurus、Nextra、Astro、Vue、Svelte 和 Solid 仅作为规划示例出现。图中展示它们不代表已实现、优先级、发布日期或对某个具体集成路线图的承诺。

本次首页变更中，用户要求参考 [Vite](https://vite.dev/) 的分层交互，在文档框架被悬停、键盘聚焦或轻触时，产生有节制的向上传递响应。示意图必须保留键盘访问、遵循减少动态效果偏好，并适配本站亮暗主题与手机。Core controls 从本次首页移除，包括组件内不再使用的专用文案和样式；这不移除 Logaria 或 Limina 的产品能力、包或文档。

来源：用户在 2026-10-01 明确提出的首页请求。本记录没有人类认可标记。首页实现的验证与本方向分开，必须由实现该方向的变更报告。

## 人类明确提出的视觉标识方向

2026-10-02，用户选定第一版紫色概念：左下文档轮廓、右侧高轮廓，以及一片分离、倾斜的小岛。标识应保持简约，使用原生 SVG，并能适配 favicon 尺寸、单色和白色反白。平面主色为 `#7051E8`；深墨色与反白版本分别使用 `#211E2E` 和白色。用户提供的概念展示板是参考，不是站点 logo 资产。

用户要求在本地 logo 与 favicon 入口采用这一标识，并参考独立 Limina 站点当前 logo 行为实现克制、有限的动画。外部轮廓保持稳定，小岛在入场或交互时短暂响应。这一参考不将 Limina 纳入 Docs Islands 产品，也不将其几何形状移植到本标识。

同一请求要求通过布局、卡片间距和页脚换行减少首页图示的纵向占用。保留三层关系、可读标签、VitePress + React 的已支持路径、规划标签、悬停／聚焦／触摸选择、键盘取消和减少动态效果支持。本地实现不授权 commit、push 或部署。

来源：用户在 2026-10-02 明确提出的 logo 选择与本地实现请求。本记录没有人类认可标记。实现证据由[视觉架构记录](./architecture.md#视觉标识与图示布局)负责；验证必须由实现该方向的变更报告。

## 人类明确提出的 VitePress 集成标识方向

2026-10-02，用户采纳修订后的集成标识：两块错位圆角文档边界围合一片分离、倾斜的小岛。此前长而弯曲的 V 形因让人联想到人体器官而被否定。保留更简洁的几何文档插槽，以及主标的圆角实心块面和留白；不要恢复被否定的轮廓。

主色为紫色 `#7051E8`。这一标识属于 `@docs-islands/vitepress`，即 Docs Islands 的 VitePress 适配层，不声称是上游 VitePress 官方标识。当前框架支持仍为 VitePress + React。用户授权在本地 package 导航、首页标识、favicon 及相关品牌入口采用该标识，使用单一原生 SVG 源，并沿用现有有限小岛动画与减少动态效果机制。保留主 Docs Islands 与其他产品标识。本请求不授权暂存无关工作、commit、push、部署，或移动用户的参考 PNG。

来源：用户在 2026-10-02 明确作出的否定、修订标识采纳与本地实现请求。本记录没有人类认可标记。采用的几何保存在 [`assets/logo/docs-islands-vitepress.svg`](../../../assets/logo/docs-islands-vitepress.svg)；实现证据由[视觉架构记录](./architecture.md#视觉标识与图示布局)负责。验证必须由实现该方向的变更报告。

### 集成落地页

用户在 2026-10-03 要求终端放在首页 Hero 右侧，即所附截图标示的位置。随后的请求要求移除终端下方的进度句子与说明段落。用户明确 Playground 必须是静态文字，不具有复制能力。

用户在 2026-10-02 要求克制、偏技术的双语落地页，保留当前 React 支持、有效的安装／配置／Markdown 参考、基于源码的开发／构建／SSR 行为、指南／示例／配置入口、既有导航、部署 base 和主站代理边界。采用已认可的紫色集成标识，协调桌面／手机与浅色／深色展示。这是本地工作，不包含 commit、push 或部署。

当前终端用例遵循用户在 2026-10-03 的最新修订：展示此落地页实际 `index.md` 基线及其已有 React 脚本，保留既有 `LandingDemo` 导入与元素，通过其自身字符串属性启用预备好的 React 宠物，以较小尺寸使用 Codex My pets 中现有的 Sunset 角色。原型、图集和 CSS 模块在演示前已经存在。Markdown 接入保存后，Sunset 才出现在终端左下，完整播放五帧跳跃。使用全部八个原生帧向右奔跑；奔跑期间编辑已有 CSS 模块的方向，使用全部八个原生向左奔跑帧跑回。保留尺寸、配色、位置、动画帧相位及 React 实例。在左侧终点持续缓慢循环整套六帧思考动作，这是用户明确选择的结束方式。这替代此前变更尺寸、停在右侧的修订，也替代更早的小猫、攀爬和右上角趴睡要求。移除独立 Page preview、计数器和手动继续阶段。同一自动旅程驱动代码与角色；点击、焦点和悬停不应成为阶段门槛，可见性变化保留时钟且不追赶补播。减少动态效果时显示静止完成状态。

所有模拟文件编辑保留用户要求的辅助 vi 行为：保留原有内容与 imports，显示行号、NORMAL／INSERT 和光标位置，先可见地配对花括号／引号及 JSX／HTML 标签，再填写内部，换行缩进，随后用 Esc 与 `:wq` 保存退出。插入前先开空行，使原有后续内容从不与新增输入拼接；此前修正的 `export default config;`、外层 `};` 与首页脚本闭合行同样遵循此规则。嵌套闭合标签在输入中持续可见并下移；自闭合标签遵循合法 JSX 行为。vi 退出时将命令、保存信息及渲染／HMR 日志保留在终端滚动历史中。打字速度提高 20%（输入延迟除以 1.2），保留阅读停顿。采用确定、自然的词组输入和语义停顿，不追赶后台时间，并验证完整实际浏览器播放及其时长。

终端文件和日志仍明确披露为模拟。移动标识必须通过当前支持的导入式集成为真实 React 组件；不宣称内联函数注册，或掩盖 runtime 能力缺口。单独验证实际 CSS HMR 行为。按终端尺寸测量路线，手机上保持标识不遮挡文字、不溢出。保留页面其他区域的完整接入参考。此版本稳定且验证后，用户授权顺序迁移相同 Docs Islands 用例到 Senao `/repos`，保留其 Limina 演示、公开边界及已有工作；不授权并行构建或部署。

Sunset 是页面内对既有视觉资产的使用，不改变用户当前的 Codex 宠物或已认可的网站主标。复用其实际跳跃、向右奔跑、向左奔跑和思考行，不重绘、镜像或变形角色。每个动作保留完整帧数。只将需要公开的图形资产放入站点；不发布本机宠物元数据、参考截图或个人路径。HMR 现在修改预备控制器的 CSS 方向属性，不缩放或重绘角色颜色。

来源：用户在 2026-10-02 至 2026-10-03 提出的集成落地页实现与修订请求。本记录没有人类认可标记。源码负责的行为记录于[落地页架构](./architecture.md#vitepress-集成落地页展示)；验证仍单独报告。

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
