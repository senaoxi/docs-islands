---
# https://vitepress.dev/reference/default-theme-home-page
layout: home
aside: false
editLink: false
markdownStyles: false

hero:
  name: 'Docs Islands'
  tagline: Cross-framework Islands Architecture for documentation sites
  image:
    src: /favicon.svg
    alt: Docs Islands
  actions:
    - theme: brand
      text: Explore Products
      link: '#core-package'
    - theme: alt
      text: View on GitHub
      link: https://github.com/XiSenao/docs-islands
---

<script setup>
import DocsProductMatrix from '../.vitepress/theme/components/landing/DocsProductMatrix.vue'
</script>

<DocsProductMatrix locale="en" />
