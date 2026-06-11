---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: 'Docs Islands for VitePress'
  tagline: 为 VitePress 提供跨框架群岛架构
  image:
    src: /favicon.svg
    alt: Docs Islands for VitePress
  actions:
    - theme: brand
      text: 指南
      link: /zh/guide/
    - theme: alt
      text: GitHub 仓库
      link: https://github.com/senaoxi/docs-islands/tree/main/packages/vitepress

features:
  - title: 在 Markdown 中使用 React
    details: '在 VitePress Markdown 页面里直接导入和渲染 React 组件，保留现有 JSX、TSX 和 TypeScript 工作流。'
    icon: '⚛️'

  - title: 组件级渲染策略
    details: '每个组件都可以单独选择 `ssr:only`、`client:load`、`client:visible` 或 `client:only`，不必把整页改成单独的前端应用。'
    icon: '🎯'

  - title: 改善 SPA 切页表现
    details: '`spa:sync-render` 可以让特定组件在路由切换时更早落到正确位置，减少闪烁和布局偏移。'
    icon: '⚡'

  - title: 保持静态站点结构
    details: '站点仍然按 VitePress 的静态生成方式工作，只在确实需要交互的区域补上客户端接管。'
    icon: '🚀'

  - title: 与 VitePress 工作流对齐
    details: 'React 组件、Markdown 内容和主题扩展继续放在同一条文档工作流里，`HMR` 和构建行为也保持一致。'
    icon: '🛠️'

  - title: Site DevTools
    details: '提供页面浮层、调试日志、包组成视图和构建报告入口，便于定位渲染、`HMR` 和资源体积问题。'
    icon: '🔎'
---
