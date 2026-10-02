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

2026-10-02，用户将本地工作扩展为 VitePress 集成的双语落地页。页面应克制、偏技术，并具有完整阅读顺序：VitePress 文档为什么需要局部交互、当前 React 支持、有效的安装／配置／Markdown 示例，以及按源码核对的 HMR、构建产物和 SSR 行为。主 CTA 必须进入正确指南，次入口提供示例与选项。采用已认可的紫色集成标识，避免泛用功能卡片重复和过高图示，协调桌面／手机与浅色／深色展示。保留既有导航、深链、部署 base 和主站代理边界。新控件必须支持键盘／焦点；提供动画时，支持暂停／重播和减少动态效果。这是本地实现请求，不包含 commit、push 或部署。

用户随后明确提出的十一条演示要求要求：模拟控制台输入与原始 Hello, world! 页面并列，完整展示构建及客户端接入、创建 React 和 Markdown 用法、基于源码的渲染／HMR 日志，以及实际可交互预览。修改组件文案必须在同一实例上保留用户计数，自动阶段变化不能清除它。播放优先尊重用户交互，并支持暂停／继续、明确重新开始和减少动态效果。展示状态保留前须验证 adapter 的真实 HMR 行为；静态模拟不能掩盖 runtime 能力缺口，也不授权无关的 runtime 重构。

用户随后要求所有文件编辑都在已安装／配置的站点中通过 vi 完成：展示原有最小内容、保留既有配置、明确 NORMAL／INSERT 与光标位置，并用 Esc 和 `:wq` 保存退出。演示动作不使用 heredoc、shell 文件重定向或目录初始化。输入须明显放慢，按代码词组或短语分组，在语义边界、换行、模式切换和保存处以可复现的短促输入和停顿推进。须完整验证实际浏览器播放并报告时长；隐藏／离开视口的时间不能触发进度追赶。

用户进一步要求遵循开发者的插入习惯：在已有依赖声明后追加 imports，或新开一行将原有后续内容向下推，不临时覆盖或重排它。输入花括号时必须可见地补齐闭合符号；光标移入内部，再换行／缩进并填写内容。其他成对符号可采用一致的辅助。应将其表述为带辅助的编辑环境，并在浏览器播放中实际检查插入位置与中间配对状态。

用户明确补充：须先将 `export default config;` 和主题的闭合 `};` 下移一行，再在其原位置输入新增语句或方法；中间输入不能与这些原行拼接。

来源：用户在 2026-10-02 明确提出的集成落地页实现请求。本记录没有人类认可标记。源码负责的行为记录于[落地页架构](./architecture.md#vitepress-集成落地页展示)；验证仍单独报告。

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
