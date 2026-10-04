---
layout: home
aside: false
editLink: false
markdownStyles: false
title: Docs Islands for VitePress
description: 在 VitePress Markdown 中加入 React 小岛，选择每个组件的客户端接管时机，并保留静态文档工作流。
---

<script setup>
import VitePressLanding from '../.vitepress/theme/components/VitePressLanding.vue'
</script>

<script lang="react">
  import IntegrationWalkthrough from '../components/react/IntegrationWalkthrough';
</script>

<VitePressLanding locale="zh">
  <template #walkthrough>
    <IntegrationWalkthrough spa:sync-render client:load locale="zh" pet="sunset" />
  </template>
</VitePressLanding>
