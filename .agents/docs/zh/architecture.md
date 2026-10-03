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

Hero 在 1152 px 桌面网格中给介绍与图示分配 0.9:1.1 的列宽比例，间距为 56 px，在 1150 px 及以下缩为 40 px。低于 1024 px 时，介绍先于图示放入 680 px 的单列。两种布局中，标题、说明和操作都保持统一左边缘。英文标题在两句之间明确换行。实心指南按钮与更轻的外部 GitHub 链接建立操作层级。图示只保留紧凑标题与交互提示，不重复 Hero 的宣传介绍。中性卡片边框、克制阴影与更宽的横向卡片间距减少相互竞争的外框；支持标签与规划连接的虚线语义保留。这些变更实现[首页构图优化请求](./intent.md#人类明确提出的视觉标识方向)。

`DocsMarkdownExample.vue` 负责示例的逐字输入、光标、暂停／继续、重播和完整文本复制。它展示 `index.md` 源文件，不包含 shell 提示符或模拟命令输出。SSR、屏幕阅读器和减少动态效果偏好下均可获得完整示例。隐藏的完整文本布局占位防止输入过程中面板高度变化。普通播放在示例进入视口时开始，播放一次，并在离屏或文档隐藏时保留进度；恢复时重设计时基准，不消耗后台经过的时间。开启减少动态效果偏好会立即完成展示，关闭该偏好后仍保留全文，直到用户请求重播。复制控件始终使用完整 Markdown；输入过程中选中文本并复制，也复制完整示例，避免得到截断的前缀。剪贴板失败则显示完整的可选择文本。卸载时清理计时器、可见性 observer 以及媒体和文档监听器。这些控件与样式仅属于此示例区域，不增加包依赖或执行能力。

### 视觉标识与图示布局

[`assets/logo/docs-islands.svg`](../../../assets/logo/docs-islands.svg) 是主产品标识的几何源。[`assets/logo/docs-islands-vitepress.svg`](../../../assets/logo/docs-islands-vitepress.svg) 独立负责 VitePress 集成标识：两块错位圆角文档边界与一片分离、倾斜的小岛。每个源都通过产品专属 SVG fragment ID 分开稳定的边界与小岛。[`scripts/sync-brand-assets.ts`](../../../scripts/sync-brand-assets.ts) 确定性地生成十个静态版本：六个主标资产与四个集成资产；`pnpm exec tsx scripts/sync-brand-assets.ts --check` 校验它们的字节内容。集成源生成 `assets/logo/islands-vitepress.svg` 及 package 站点的 logo、favicon 和黑色 Safari mask。双语 package README 引用集成的规范源。主产品与其他产品标识保留各自几何；同一标识的各版本共享该标识的路径。内容未变的生成文件不会被重写。

根站与 package 的 `NavBarLogo.vue` 组件分别引用各自标识的外部 fragment，不复制路径数据。`withBase('/logo.svg')` 保留 package 站点的 `/repos/docs-islands/vitepress/` 资产前缀。两个 package 首页都使用生成的 favicon 作为静态 hero 标识；配置中的 icon 与 mask 入口也来自同一集成源。根站图示继续在中间层复用主标组件。集成标识遵循[人类明确提出的子项目方向](./intent.md#人类明确提出的-vitepress-集成标识方向)。小岛采用 700 ms 的有限激活动画、140 ms 延迟和 `cubic-bezier(0.22, 1, 0.36, 1)`，参考独立维护的 Limina 站点有限入场节奏。进入视口时播放一次，也可响应指针进入、链接聚焦、主题变化或图示激活，没有空闲循环。离开视口、隐藏文档、启用减少动态效果或卸载时取消动画；卸载时清理 observer 和监听器。

根站图示负责 304 px 场景、68 px 框架卡片和 56 px 桥接层。连接线坐标跟随卡片行及激活后的偏移。窄宽度下页脚可自然换行；紧凑性不依赖对整个图示应用 transform 或缩小标签文字。VitePress + React 是已支持的 Docs Islands 桥接路径。Vue 标为 VitePress 默认支持：绿色直接连接绕过桥接层，卡片与信号只响应 VitePress。Vue 不进入桥接层的已支持或规划路径。背景色留白让交叉连接线在视觉上保持独立，预览其他规划集成时，原生支持仍保留实线。页脚说明两种支持关系。文档卡片获得焦点时清除此前的指针预览，使键盘导航在鼠标仍停留于其他卡片时也能选择自己的路径。其余规划路径与输入行为保留。该布局与标识遵循[人类明确提出的视觉方向](./intent.md#人类明确提出的视觉标识方向)和[原生支持纠正](./intent.md#人类明确提出的文档方向)。

上下两排框架都在 22 px 图标区域使用本地压缩后的上游 SVG 标识：React、Vue、Svelte、Solid、VitePress、Docusaurus、Nextra 和 Rspress。Vite 导入按部署 base 解析资产 URL。Nextra 图形标识从其官方文字标识资产中提取，并在站点深色主题下反色；各图片都是可见框架名称旁的装饰元素。[资产来源](../../../docs/.vitepress/theme/components/landing/framework-logos/README.md) 记录上游出处。Rspress 按[框架 logo 方向](./intent.md#人类明确提出的文档方向) 替换原 Astro 示例。

这些事实由源码归属建立。浏览器、构建、typecheck 和治理结果必须由实现变更报告；本记录本身不宣称成功执行。

### VitePress 集成落地页展示

集成落地页由双语 `packages/vitepress/docs/*/index.md` 页面、[`VitePressLanding.vue`](../../../packages/vitepress/docs/.vitepress/theme/components/VitePressLanding.vue)、[`IslandPrototype.tsx`](../../../packages/vitepress/docs/components/react/IslandPrototype.tsx) 和 [`LandingDemo.tsx`](../../../packages/vitepress/docs/components/react/LandingDemo.tsx) 负责。[`landing-demo-landing.ts`](../../../packages/vitepress/docs/components/react/landing-demo-landing.ts) 保存实际首页基线及原型已有 CSS 模块的快照。[`landing-demo-source.ts`](../../../packages/vitepress/docs/components/react/landing-demo-source.ts) 单独负责完整安装／接入参考。阅读顺序为介绍与终端演示、组件边界和四种渲染策略、完整最小接入、开发／构建行为及指南 CTA。根落地页继续独立负责。

终端 slot 位于 Hero 内，与介绍并排。超过 1100 CSS 像素时，左侧文案保留 490 px 列宽，右侧演示向视口边缘展开。终端使用 Hero 的介绍，不再重复显示演示标题，代码区高度随视口高度调整。1100 px 及以下，演示在单列中文案之后显示；700 px 及以下保留已有手机轨道、内部间距及代码区高度。两种语言共用此布局。移除终端下方的进度句子与说明段落；工具栏仍标明辅助 vi 模拟，Playground 是静态文字，没有按钮、链接、剪贴板操作或复制反馈。

首页已有 `<script lang="react">` 中保留 `LandingDemo` 导入，并经 Vue 落地页 slot 使用 `client:visible` 渲染。终端在该保留元素上添加 `pet="sunset"`。`pet` 是本地演示组件的普通字符串属性，不是 Docs Islands 配置 API。`LandingDemo` 导入预备好的 `IslandPrototype` React 子组件，仅在模拟保存后显示。这使用 adapter 已支持的导入式注册和字符串属性传输，不需要 Markdown 内嵌 React children 或 React portal；当前生产运行时将 `react-dom` 外部化到 client root API，其中未提供 `createPortal`。`IslandPrototype` 通过 CSS 显示原始 Sunset v2 图集：八列、十一行，每格 192 × 208 像素。完整序列使用第 4 行的五个跳跃帧、第 1 行的八个向右奔跑帧、第 2 行的八个原生向左奔跑帧，以及第 8 行的六个思考帧。Vite 按各自部署 base 解析同目录 `sunset.webp` 地址。图集从用户授权的宠物资产原样复制；不发布宠物元数据或参考截图。已认可的主标和 favicon 继续独立负责。

原型与 CSS 模块已经存在于配置好的站点中。终端编辑本页 `en/index.md` 或 `zh/index.md` 启用预备组件，回放捕获的开发服务日志，再将已有模块的 `--run-direction` 从 `right` 改为 `left`。尺寸与配色均保持不变。该自定义属性由本演示预备的运动控制器读取，不是浏览器或 Docs Islands 的方向 API。工具栏标明 vi 编辑模拟与实测日志回放；生产页面不写文件或运行开发服务器。可见图形的宿主只在模拟 Markdown 保存后出现。CSS 模块保存最终方向；HMR 日志行到达时，展示层的初始方向选择器不再匹配。运行中的控制器读取计算后 CSS，记录一次返程请求，在短暂减速并完成当前完整步伐后沿原路线跑回。实际 CSS HMR 须单独测试。当前开发运行时在 Markdown HMR 替换已有 React 入口时可能重复创建 React root，随后的 CSS 编辑可能重置子树。捕获日志的开发会话在 Markdown 接入后、修改 CSS 前刷新预览；这一浏览器动作不是服务端日志行。CSS HMR 连续性限定于这次干净加载，不宣称不刷新即可热替换 Markdown React 入口。本次变更不修复或扩大产品运行时。

[`landing-demo-playback.ts`](../../../packages/vitepress/docs/components/react/landing-demo-playback.ts) 负责固定缓冲区／光标帧与确定性的词组输入，在语义边界、换行、编辑模式及保存处停顿。新增 imports 位于既有声明之后。开行动作在首个字符前保留换行，使原有后续内容保持独立行。花括号、圆括号、方括号、引号和 JSX／HTML 标签先可见地配对，再填入内容。闭合符号通过移过光标处理，不重复输入；嵌套闭合标签随子内容下移。属性中的箭头、比较运算及引号内 `>` 不触发标签补全；自闭合标签不产生额外闭合标签。编辑器显示行号、定位光标、NORMAL／INSERT、导航／编辑按键、Esc 和 `:wq`，随后返回 shell 历史。界面明确为带辅助的 vi，不宣称原生 vi 默认行为。命令与捕获的服务端日志累积在终端滚动历史中；vi 临时显示独立缓冲区，退出后恢复历史。最终记录中每条捕获的输出只出现一次，不编造保存或预览消息。输入延迟除以 1.2，实现要求的 20% 提速；阅读停顿保持不变。

[`landing-demo-landing.ts`](../../../packages/vitepress/docs/components/react/landing-demo-landing.ts) 中的日志快照保留了 2026-10-03 捕获的终端 stdout，环境为 Node.js 24.21.0、pnpm 11.9.0、VitePress 1.6.4、Vite 5.4.21、React 18.3.1、Logaria 0.0.3，以及本地 `@docs-islands/vitepress` 0.3.0 构建。已连接页面使用 docs 站点的 runtime preset 与 Markdown message filter。只去除 ANSI 控制序列及首尾换行；时间戳取值、`[vitepress] hmr update`、相对路径和措辞均保留。Markdown 路径对应正在编辑的语言文件。更新 `IslandPrototype.module.css` 会到达导入它的 `IslandPrototype.tsx` React HMR 边界，因此保留捕获到的 `.tsx` 服务端路径。浏览器的 `runtime.react.dev-render` 与 `[vite] hot updated` 消息不进入终端历史。这些是演示中两次保存的快照，不对其他日志设置、客户端连接或工具版本承诺完整日志清单；实际 HMR 事件次数可能变化。相关条件变化时重新捕获对应进程输出，不从源码模板合成消息。

[`TerminalCode.tsx`](../../../packages/vitepress/docs/components/react/TerminalCode.tsx) 为演示中嵌入 React 的 Markdown、CSS 和 shell 历史渲染可选择的语法着色文本。其小型词法处理仅面向这些预备缓冲区与尚未输入完整的内容；通过 React 文本节点渲染，不注入 HTML，也不增加依赖。浅色与深色主题使用独立色板，区分关键字、标签、属性、字符串、数字及日志标记。滚动容器保留键盘聚焦和无障碍只读标签。着色 span 保留缓冲区的文本与空白，因此不改变行号、光标坐标或播放节奏。

补充本地构建产物扫描发现，生成的 page metafile 中保留了宿主机绝对模块 ID，预构建的 Site DevTools 分块中也保留了 Vue `__file` 绝对路径。这阻塞了落地页演示要求的更严格“无个人路径”发布条件。页面本地源码与模拟日志使用相对路径，但构建成功不能证明全部公开元数据已经脱敏。展示层变更没有修复元数据生成器或预构建包。

本地界面验证还必须考虑文档配置中的构建期 AI 报告。Nx 23.2.1 的根环境与任务环境 dotenv 展开都可能用文件值替换显式传入的空字符串 provider 环境变量。因此，在调用 Nx 前清空 API key 变量不能可靠禁用分析。直接调用仓库环境工具时会保留空运行时覆盖值，但任务启动器先于它运行。下次仅验证界面的构建之前，须先确定最终构建进程无法执行 provider；CI 缓存回退与 fetch 失败都不能证明未尝试请求。

同一时间轴驱动代码、路线和图集帧。ResizeObserver 测量终端边框；Sunset 在左侧完整播放 840ms 跳跃序列，沿底边向右奔跑，再在 CSS 方向更新后返回左侧。帧框始终保持桌面 48 × 52 CSS 像素、手机 36 × 39。内部预留轨道使角色避开文字和操作入口。同一调度器以不超过 80ms 的时间片推进逻辑时钟，保留输入延迟，使帧序列和移动在阅读、保存期间持续。[`sunset-motion.ts`](../../../packages/vitepress/docs/components/react/sunset-motion.ts) 分离归一化路线进度与图集选帧。双向奔跑均使用七个 120ms 帧和最后一个 220ms 帧；转向与到达位于完整步伐边界，速度采用 400ms 缓动。在左侧终点缓慢循环全部六个思考帧：五个 450ms 帧和最后 780ms 停留，每轮共 3030ms。往返旅程只运行一次。首轮思考结束后 JavaScript 调度器停止，由 CSS 延续用户要求的思考循环。聚焦和悬停不暂停播放。隐藏页面或完全离开视口会同时暂停逻辑时钟与 CSS 循环；重新进入续接，不重启、不追赶。减少动态效果时立即显示静止的最终思考帧。卸载清理定时器和观察器。

当前支持仍为 VitePress + React 18，与 adapter 及 peer 声明一致。模式说明区分构建时 SSR、客户端接管和仅在浏览器渲染。完整接入参考保留安装、构建插件配置、必需的客户端 theme 注册、组件与 Markdown 示例。SSR 可选中的参考 Tab 保留游动键盘焦点。终端用例不替换完整接入参考或扩展 runtime 支持。既有导航、文档深链、主站代理边界、package runtime、manifest 和部署配置保持不变。落地页链接通过 `withBase` 与当前语言组合，位于 `/repos/docs-islands/vitepress/` 内；配置入口继续使用 `/options/logging`。

Vue scoped 样式将完整的深色祖先／组件选择器包在 `:global(.dark .vitepress-landing)` 中。拆成 `:global(.dark) .vitepress-landing` 会指向祖先，不能覆盖本地色板。深色截图与计算后的色板检查须捕获此问题。展示遵循[人类明确提出的落地页方向](./intent.md#集成落地页)。浏览器、实际 CSS HMR、构建、typecheck 和治理结果须由实现变更报告；本记录本身不宣称成功执行。

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
