---
layout: home
aside: false
editLink: false
markdownStyles: false
title: Docs Islands for VitePress
description: Add React islands to VitePress Markdown, choose when each component hydrates, and keep the static documentation workflow.
---

<script setup>
import VitePressLanding from '../.vitepress/theme/components/VitePressLanding.vue'
</script>

<script lang="react">
  import IntegrationWalkthrough from '../components/react/IntegrationWalkthrough';
</script>

<VitePressLanding locale="en">
  <template #walkthrough>
    <IntegrationWalkthrough spa:sync-render client:load locale="en" pet="sunset" />
  </template>
</VitePressLanding>
