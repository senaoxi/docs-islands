---
# https://vitepress.dev/reference/default-theme-home-page
layout: home
aside: false
editLink: false
markdownStyles: false

hero:
  name: 'Docs Islands'
  text: '让文档，<br />拥有真实交互。'
  tagline: '在 VitePress Markdown 中使用 React 组件。保留静态优先的页面，为每个 island 选择交互时机。'
  image:
    src: /favicon.svg
    alt: Docs Islands
  actions:
    - theme: brand
      text: 开始接入
      link: '/vitepress/zh/'
      target: _self
    - theme: alt
      text: 在 GitHub 上查看
      link: https://github.com/senaoxi/docs-islands
---

<script setup>
import DocsProductMatrix from '../.vitepress/theme/components/landing/DocsProductMatrix.vue'
</script>

<DocsProductMatrix locale="zh" />
