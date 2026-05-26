---
# https://vitepress.dev/reference/default-theme-home-page
layout: home
aside: false
editLink: false
markdownStyles: false

hero:
  name: 'Docs Islands'
  tagline: 面向文档站点的跨框架 Islands 架构
  image:
    src: /favicon.svg
    alt: Docs Islands
  actions:
    - theme: brand
      text: 浏览产品
      link: '#core-package'
    - theme: alt
      text: 在 GitHub 上查看
      link: https://github.com/XiSenao/docs-islands
---

<script setup>
import DocsProductMatrix from '../.vitepress/theme/components/landing/DocsProductMatrix.vue'
</script>

<DocsProductMatrix locale="zh" />
