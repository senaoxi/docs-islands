---
# https://vitepress.dev/reference/default-theme-home-page
layout: home
aside: false
editLink: false
markdownStyles: false

hero:
  name: 'Docs Islands'
  text: 'Your docs.<br />Real components.'
  tagline: 'Bring React components into VitePress Markdown. Keep your pages static-first. Choose when each island becomes interactive.'
  image:
    src: /favicon.svg
    alt: Docs Islands
  actions:
    - theme: brand
      text: Read the guide
      link: '/vitepress/'
      target: _self
    - theme: alt
      text: View on GitHub
      link: https://github.com/senaoxi/docs-islands
---

<script setup>
import DocsProductMatrix from '../.vitepress/theme/components/landing/DocsProductMatrix.vue'
</script>

<DocsProductMatrix locale="en" />
