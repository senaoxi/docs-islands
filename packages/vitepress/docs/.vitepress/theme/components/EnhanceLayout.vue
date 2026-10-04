<script setup lang="ts">
import SiteDevToolsConsole from '@docs-islands/vitepress/devtools/client';
import '@docs-islands/vitepress/devtools/client/style.css';
import { Analytics } from '@vercel/analytics/vue';
import { useData } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import { computed } from 'vue';
import { useArticleAccessibility } from '../composables/useArticleAccessibility';

const { frontmatter, page } = useData();
const isArticle = computed(
  () => !page.value.isNotFound && (frontmatter.value.layout ?? 'doc') === 'doc',
);

useArticleAccessibility(isArticle);
</script>

<template>
  <DefaultTheme.Layout v-bind="$attrs" :class="{ 'di-article': isArticle }">
    <template v-for="(_, name) in $slots" #[name]="slotProps">
      <slot :name="name" v-bind="slotProps"></slot>
    </template>
  </DefaultTheme.Layout>
  <Analytics />
  <SiteDevToolsConsole />
</template>
