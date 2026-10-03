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
  import LandingDemo from '../components/react/LandingDemo';
</script>

<VitePressLanding locale="en">
  <template #demo>
    <LandingDemo client:visible locale="en" pet="sunset" />
  </template>
</VitePressLanding>
