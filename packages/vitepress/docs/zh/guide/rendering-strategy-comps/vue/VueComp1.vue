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
      >{{ props.renderCount }}: 渲染策略: {{ props.renderStrategy }}</strong
    >
    <ol>
      <li>
        <strong>组件名称:</strong>
        <span>{{ props.componentName }}</span>
      </li>
      <li>
        <strong>页面标题:</strong>
        <span>{{ props.pageTitle }}</span>
      </li>
      <li>
        <strong>子组件渲染:</strong>
        <slot :vue-info="vueInfo" />
      </li>
    </ol>
  </div>
</template>
