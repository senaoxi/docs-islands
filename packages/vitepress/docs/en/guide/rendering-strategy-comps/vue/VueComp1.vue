<script setup lang="ts">
export interface CompProps {
  componentName: string;
  renderStrategy: string;
  pageTitle: string;
  renderCount: number;
}

const props = defineProps<CompProps>();
const vueInfo = 'VueComp1';
</script>

<template>
  <div class="vue-comp1-example">
    <strong
      >{{ props.renderCount }}: Rendering Strategy:
      {{ props.renderStrategy }}</strong
    >
    <ol>
      <li>
        <strong>Component Name:</strong>
        <span>{{ props.componentName }}</span>
      </li>
      <li>
        <strong>Page Title:</strong>
        <span>{{ props.pageTitle }}</span>
      </li>
      <li>
        <strong>Child Component Rendering:</strong>
        <slot :vue-info="vueInfo" />
      </li>
    </ol>
  </div>
</template>
