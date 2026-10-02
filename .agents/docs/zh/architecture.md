# 架构

[English](../architecture.md) | [简体中文](./architecture.md)

## 证据边界

本记录描述由 manifest、源码 import、公开 exports、构建配置、Limina 配置和发布脚本建立的 workspace 单元与边界。

包名和描述不能建立设计理由、未来发布计划或永久产品边界。这些内容需要人类确认。

## Workspace 布局

`pnpm-workspace.yaml` 包含以下 workspace 区域：

| Workspace pattern          | 当前内容                                                  |
| -------------------------- | --------------------------------------------------------- |
| `packages/*`               | 主要 library、CLI、配置和内部 workspace 包                |
| `packages/*/docs`          | 各包的文档站点                                            |
| `packages/*/playground`    | 各包的 playground 应用                                    |
| `packages/*/smoke`         | 各包的 smoke-test workspace                               |
| `packages/plugins/*`       | 私有插件包；当前匹配的包是 `@docs-islands/plugin-license` |
| `packages/**/__tests__/**` | 带独立 manifest 的嵌套测试 workspace                      |
| `docs`                     | 根文档站点 workspace                                      |
| `utils`                    | 共享私有工具包                                            |

生成的 `dist` 目录不参与 workspace discovery。

当前发现的 workspace 包括根项目、已发布包、私有包、各包文档站点、VitePress playground 与 smoke workspace、Logaria 插件测试 workspace。

## 文档发布边界

根文档站与各 package 文档站分别构建。根 `docs:build` 部署路径只选择 `@docs-islands/monorepo-docs`、`@docs-islands/logaria-docs` 和 `@docs-islands/vitepress-docs`。随后 `scripts/merge-docs.ts` 只将仍由本站负责的 package 文档合并到 `docs/.vitepress/dist/<target>/`；当前合并目标是 Logaria 和 `@docs-islands/vitepress`。它们的公开 VitePress base 共享固定的 `/repos/docs-islands/` namespace。

Limina 文档被明确排除在该合并之外，因为其独立部署拥有 `/repos/limina/`。根落地页不将 Limina 展示为 Docs Islands 的接入前提，也不发布重复的 `/repos/docs-islands/limina/` 副本。

Docs Islands 的 Vercel project 只负责合并后的静态产物，不在内部 rewrite 公开前缀。Senao 站点是 `/repos/docs-islands/*` 的外部路由 authority，并将请求代理到独立的 Docs Islands Vercel 部署。此前的 `docs.senao.me/docs-islands/*` 入口 redirect 到新 namespace；其中旧 Limina 子树 redirect 到 `/repos/limina/*`。

### 根落地页展示

双语根落地页由 `docs/en/index.md`、`docs/zh/index.md`、`DocsProductMatrix.vue`、`DocsMarkdownExample.vue` 和 `docs/.vitepress/theme/styles/main.css` 中限定首页作用域的样式负责。阅读顺序是产品介绍与指南 CTA、现有架构图、当前支持范围、渲染原则和 Markdown 接入示例。支持范围条明确列出 VitePress + React；此展示不确立未来适配器的支持。参见[已实现范围](./intent.md)。

展示采用无衬线标题、克制的紫色强调、统一对齐和以细线分隔的开放区块。这让接入路径更突出，而不把 Logaria 和 Limina 展示成前置控制层。深浅色 token 限定在 `VPHome` 内；各包主题与文档发布仍保持独立。示例明确用于完成配置之后，并链接到完整接入指南。两个接入 CTA 都通过 `target="_self"` 触发整页导航：各包文档拥有独立的 VitePress 路由清单，即使静态文件位于同一 origin，根站 SPA 路由也无法解析它们。图示内部行为仍由其组件负责；外框样式不确立键盘或点选行为。浏览器报告 reduced motion 时，首页动画与过渡均禁用。

`DocsMarkdownExample.vue` 负责示例的逐字输入、光标、暂停／继续、重播和完整文本复制。它展示 `index.md` 源文件，不包含 shell 提示符或模拟命令输出。SSR、屏幕阅读器和减少动态效果偏好下均可获得完整示例。隐藏的完整文本布局占位防止输入过程中面板高度变化。普通播放在示例进入视口时开始，播放一次，并在离屏或文档隐藏时保留进度；恢复时重设计时基准，不消耗后台经过的时间。开启减少动态效果偏好会立即完成展示，关闭该偏好后仍保留全文，直到用户请求重播。复制控件始终使用完整 Markdown；输入过程中选中文本并复制，也复制完整示例，避免得到截断的前缀。剪贴板失败则显示完整的可选择文本。卸载时清理计时器、可见性 observer 以及媒体和文档监听器。这些控件与样式仅属于此示例区域，不增加包依赖或执行能力。

### 视觉标识与图示布局

[`assets/logo/docs-islands.svg`](../../../assets/logo/docs-islands.svg) 是主产品标识的几何源。[`assets/logo/docs-islands-vitepress.svg`](../../../assets/logo/docs-islands-vitepress.svg) 独立负责 VitePress 集成标识：两块错位圆角文档边界与一片分离、倾斜的小岛。每个源都通过产品专属 SVG fragment ID 分开稳定的边界与小岛。[`scripts/sync-brand-assets.ts`](../../../scripts/sync-brand-assets.ts) 确定性地生成十个静态版本：六个主标资产与四个集成资产；`pnpm exec tsx scripts/sync-brand-assets.ts --check` 校验它们的字节内容。集成源生成 `assets/logo/islands-vitepress.svg` 及 package 站点的 logo、favicon 和黑色 Safari mask。双语 package README 引用集成的规范源。主产品与其他产品标识保留各自几何；同一标识的各版本共享该标识的路径。内容未变的生成文件不会被重写。

根站与 package 的 `NavBarLogo.vue` 组件分别引用各自标识的外部 fragment，不复制路径数据。`withBase('/logo.svg')` 保留 package 站点的 `/repos/docs-islands/vitepress/` 资产前缀。两个 package 首页都使用生成的 favicon 作为静态 hero 标识；配置中的 icon 与 mask 入口也来自同一集成源。根站图示继续在中间层复用主标组件。集成标识遵循[人类明确提出的子项目方向](./intent.md#人类明确提出的-vitepress-集成标识方向)。小岛采用 700 ms 的有限激活动画、140 ms 延迟和 `cubic-bezier(0.22, 1, 0.36, 1)`，参考独立维护的 Limina 站点有限入场节奏。进入视口时播放一次，也可响应指针进入、链接聚焦、主题变化或图示激活，没有空闲循环。离开视口、隐藏文档、启用减少动态效果或卸载时取消动画；卸载时清理 observer 和监听器。

根站图示负责 304 px 场景、68 px 框架卡片和 56 px 桥接层。连接线坐标跟随卡片行及激活后的偏移。窄宽度下页脚可自然换行；紧凑性不依赖对整个图示应用 transform 或缩小标签文字。只有 VitePress + React 显示为已支持，保留原有规划路径与输入行为。该布局与标识遵循[人类明确提出的视觉方向](./intent.md#人类明确提出的视觉标识方向)。

这些事实由源码归属建立。浏览器、构建、typecheck 和治理结果必须由实现变更报告；本记录本身不宣称成功执行。

### VitePress 集成落地页展示

集成落地页由双语 `packages/vitepress/docs/*/index.md` 页面、[`VitePressLanding.vue`](../../../packages/vitepress/docs/.vitepress/theme/components/VitePressLanding.vue)、[`LandingDemo.tsx`](../../../packages/vitepress/docs/components/react/LandingDemo.tsx) 和 [`LandingCounter.tsx`](../../../packages/vitepress/docs/components/react/LandingCounter.tsx) 负责。完整接入片段与核实后的日志／事件摘录位于 [`landing-demo-source.ts`](../../../packages/vitepress/docs/components/react/landing-demo-source.ts)，演示样式位于 [`LandingDemo.css`](../../../packages/vitepress/docs/components/react/LandingDemo.css)。阅读顺序是组件边界、控制台接入演示、四种渲染策略、完整最小接入、开发／构建行为，以及指南 CTA。它替换 package 首页的大面积光晕 hero 与重复功能卡片网格；根落地页继续独立负责。

演示是真实的 `client:visible` React 小岛，通过 Vue 落地页组件的 slot 传入。初始 HTML 经过预渲染；React 在 hydration 中从服务端快照切换为客户端快照时启用计数器。Reducer 依次推进原始 Markdown 页面、构建配置、必需的客户端 theme 注册、组件创建、Markdown 集成、渲染日志、可交互计数器、组件文案修改、HMR 事件与更新后的预览。回放表达模拟的文件输入和录制的控制台／事件摘录，不在页面中写磁盘或实际启动开发服务器。摘录标明 adapter 的 `runtime.react.dev-render` 日志组与 `docs-islands:react-hmr:prepare:fast-refresh` 开发事件；路径经过缩短，不虚构耗时。

每个文件阶段在固定、已配置的 VitePress 站点上使用模拟 vi 缓冲区。既有配置的 title 与 description、默认主题以及 Hello, world! 在按定位增补接入代码时持续可见。编辑器显示行号、定位光标、NORMAL／INSERT 模式、导航／编辑按键、Esc 与 `:wq`，随后回到已保存／退出的 shell 状态。组件通过 vi 创建；文案更新重新打开 vi，只替换标题这一行。[`landing-demo-playback.ts`](../../../packages/vitepress/docs/components/react/landing-demo-playback.ts) 负责这些子状态与确定性的词组输入计划：标识符内短促连续输入，在词组、语句和换行之间较长停顿，并有初始阅读停顿及明确的模式／保存停顿。调度器每个定时器只推进一帧，隐藏或离开视口时取消；返回后从同一帧继续，不消耗后台经过的时间。减少动态效果时保留分开的手动编辑步骤。已有目录与初始 VitePress 配置是 fixture 前提，不是演示动作。

辅助编辑器按插入、配对、换行／缩进和光标移动动作保存真实的缓冲区快照及光标位置。新增 imports 追加到已有依赖声明之后；插入换行会将原有后续内容向下推。花括号、圆括号、方括号与引号先成对出现，再填写内部；自动补齐的闭合符号通过移过光标处理，不重复输入。开行动作在新代码块输入任何字符前先保留分隔换行，因此原有 `export default config;` 与外层 `};` 在每个中间缓冲区中都保持独立的后续行。标题更新保留周围的 JSX 标签和计数 hook。界面明确说明配对／缩进辅助，不宣称它们是原生 vi 默认行为。

计数器在阶段变化中保持挂载，更新标题是在同一组件实例上改变 props。播放在首次可交互阶段停下；指针／焦点交互会暂停播放。继续阶段从不重置用户状态。只有明确的重新开始控件改变计数器 key 并重置演示；计数器自身的重置仍是用户明确操作。展示的 HMR 场景只修改字符串，保持组件导出与 hook 结构不变。Adapter 通过 [`createFrameworkComponentHmrPlugin`](../../../packages/vitepress/src/node/plugins/vite-plugin-framework-component-hmr.ts) 与 [React 客户端集成](../../../packages/vitepress/src/client/adapters/react/index.ts) 将这条路径交给 React Fast Refresh。这不承诺所有修改都保留状态，也不改变产品 runtime。

当前支持明确为 VitePress + React 18，与 adapter 及 peer 声明一致。模式说明区分构建时 SSR、客户端接管和仅在浏览器渲染。完整接入包含依赖安装、构建插件、客户端 theme 注册、组件和 Markdown。双语入门指南的 VitePress／SWC 要求及 React 安装范围与 package peer 声明一致。接入参考 Tab 在 SSR 中完整、可选中，使用方向键、Home 和 End 的游动焦点。控制台初始为静态 Hello, world! 示例；只有主动播放才开始输入。暂停／继续、手动下一步、重新开始均为带可见焦点的键盘控件。部分输入时复制仍使用完整源码。隐藏文档及离开视口时保留播放进度；减少动态效果时可手动逐步查看，不进行逐字输入，动态切换该偏好会停止播放；卸载时清理定时器与监听器。`spa:sync-render` 链接保留其资源加载代价。

Vue scoped 样式将完整的深色祖先／组件选择器包在 `:global(.dark .vitepress-landing)` 中。拆成 `:global(.dark) .vitepress-landing` 会使编译后的规则指向祖先，不能覆盖组件本地色板；深色截图与实际计算后的色板检查须捕获这种对比度问题。

配置入口使用现有 `/options/logging` 文档及其侧栏。英文导航此前链接到不存在的 `/options/` 索引；现将目标修正为与中文配置入口一致，不改变导航结构。

落地页链接通过 `withBase` 与当前语言组合，保持在 `/repos/docs-islands/vitepress/` 内。既有导航、文档深链、主站代理边界、package runtime、manifest 和部署配置不变。展示遵循[人类明确提出的集成落地页方向](./intent.md#集成落地页)。浏览器、HMR、构建、typecheck 和治理结果必须由实现变更报告；本记录本身不宣称成功执行。

## 已发布包

发布脚本和 package manifest 确定了三个独立发布目标：

| 包                        | 独立发布 | 当前职责                                                                       |
| ------------------------- | -------: | ------------------------------------------------------------------------------ |
| `@docs-islands/vitepress` |       是 | VitePress 集成包，提供 node、client、React adapter、theme 和开发工具 exports   |
| `logaria`                 |       是 | 运行时日志工具，提供 helper、core、plugin 和 types exports，包括构建时裁剪能力 |

每个发布目标都有独立的包目录、构建后的发布目录、版本、changelog、tag 前缀、构建步骤、package checks 和 release checks。

## 私有 workspace 包

| 包                             | 私有 | 当前职责                                                                       |
| ------------------------------ | ---: | ------------------------------------------------------------------------------ |
| `@docs-islands/core`           |   是 | 供 VitePress 集成使用的共享 client、node、runtime、transformation 和 type 抽象 |
| `@docs-islands/eslint-config`  |   是 | 共享 ESLint 配置与 presets                                                     |
| `@docs-islands/utils`          |   是 | 仓库共享运行时与构建工具，包括 `link-guard` binary                             |
| `@docs-islands/agents`         |   是 | 共享编码 agent skills，以及面向 `.claude`、`.cursor` 和 `.agent` 的链接工具    |
| `@docs-islands/plugin-license` |   是 | 包构建配置使用的私有许可证插件                                                 |

当前 `packages/plugins/*` 区域包含许可证插件。实现没有建立更广泛的 Vite 或 Rollup 插件集合。

## Core 与 VitePress 边界

`@docs-islands/core` 不直接 import VitePress API。其 manifest 提供 client、node、shared 和 types 入口。

`@docs-islands/vitepress` 在 client、node、shared、adapter 和 type 各层 import Core 入口。它将 VitePress 配置、生命周期 API、build hooks 和运行时行为映射到这些共享抽象。

Core 在 source manifest 中为私有包，也不是发布目标。

VitePress 的 Rolldown 配置将声明的 runtime dependencies 和 peer dependencies externalize。Core 是 development dependency，并非外部 runtime dependency。当前构建后的 VitePress manifest 不声明 Core，构建后的 JavaScript 也不保留 Core module imports。这建立了一个当前事实：VitePress 构建将所需的 Core 实现纳入自身产物。

### 由实现推导的结果

当前结构将框架无关的运行时抽象与 VitePress 专属集成分开，使 VitePress 包可以使用共享抽象，而不必将 Core 作为单独的消费者依赖发布。

源码建立了这种结构，但没有建立设计理由或未来框架计划。

## UI 框架 adapter 边界

`DocsIslandsAdapter` 是当前 adapter contract。它提供 framework identifier，以及一个对 VitePress 配置和 resolved Docs Islands 配置执行的 `apply` 操作。

`createDocsIslands()` 接受 adapter 数组。它拒绝空数组、重复的 framework identifier，以及支持框架集合以外的 identifier。

当前支持的框架集合只有 React。当前 adapter 源码目录、Rolldown inputs 和 package exports 只提供 React adapter 及其 client 入口。

### 由实现推导的结果

Adapter contract 与基于数组的编排提供了扩展点，但不能据此认定当前已经实现多个 UI 框架，或已有新增 adapter 的计划。

## Logaria 边界

Logaria 的 manifest 和源码 imports 均不依赖 `@docs-islands/core`。

`@docs-islands/vitepress` 将 Logaria 声明为 runtime dependency。其源码和构建产物使用 Logaria 的 core、helper、plugin 和 types 入口。

Logaria 拥有独立的 public exports、构建产物、package checks、release checks、版本管理和 release tags。

Logaria 独立打包和发布，在结构上不与 `@docs-islands/core` 耦合。实现没有建立其长期产品范围是 Docs Islands 专属还是通用日志工具。

## Limina 边界

Limina 是外部 npm CLI 依赖，提供 `limina` binary。九个开发消费者均引用既有 dev catalog 中精确的 `0.4.0`，不使用 caret 或 tilde。其源码、文档、fixtures 与 release targets 不再属于本 workspace；[分离记录](./history-extraction.md) 拥有 provenance 和恢复说明。

根仓库通过 Limina 配置和命令完成：

- TypeScript project graph preparation 与检查
- Source ownership 与依赖检查
- Typecheck coverage proof
- Checker build 与 typecheck 执行
- 构建后 package output 检查
- Release 一致性检查
- 命名的 graph、library、Vue、consumer、package 和 publish pipelines

当前 graph rules 约束 client 和 shared runtime imports 及 project references。它们拒绝配置指定的 Node.js built-in dependencies，以及配置指定的跨 client、shared 和 node runtime 边界 references。

当前 package checks 覆盖配置指定的 Logaria 和 `@docs-islands/vitepress` 构建产物。

Limina 是开发和发布治理工具，不是 VitePress 浏览器产物的前端 runtime dependency。

Limina 失败表示某项已配置的治理规则、package check、release check、proof 或 checker 未通过，需要调查；源码没有为每一种失败定义统一的缺陷分类。

根配置与安装的 npm 产物建立被治理的命令。Limina 的实现记录仍保存在原历史归档中。本架构记录只拥有它与保留 workspace 单元的关系。

## 由实现推导的结果

两个已发布包可以独立管理版本和发布，同时在同一 workspace 中共享私有实现与构建包。

根发布配置不将 Core、仓库 utilities、agent tooling、ESLint 配置或许可证插件列为发布目标。它们的 manifest 也将其标记为私有包。

已配置的 graph rules 只约束其 labels、dependencies 和 reference entries 表达的边界，并不能建立维护者可能重视的全部架构边界。

## 需要人类确认的方向

- 支持 VitePress 以外的文档框架，是否是 Core 与 VitePress 分离的长期理由？
- Logaria 应继续限定在 Docs Islands 用途，还是发展为通用日志包？
- 当前私有包中是否有计划独立发布的包？
- Plugins workspace 是否预期扩展成更广泛的插件集合？
