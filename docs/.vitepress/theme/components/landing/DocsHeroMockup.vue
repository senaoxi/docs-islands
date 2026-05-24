<script setup lang="ts">
import { useData, useRoute } from 'vitepress';
import { computed } from 'vue';

const { lang } = useData();
const route = useRoute();
const isZh = computed(
  () => route.path.startsWith('/zh/') || lang.value.startsWith('zh'),
);

const text = computed(() => {
  if (isZh.value) {
    return {
      url: 'docs-islands.dev/products',
      mapTitle: 'Product Map',
      nodes: ['核心包', '运行时日志', '架构治理'],
      panelLabel: 'Docs Contract',
      title: 'Markdown -> Islands -> Stable Pages',
      insight:
        '把页面渲染、诊断输出和工程边界拆成可检查的层次，让文档站点保持静态优先，也能接入真实交互。',
      codeLabel: 'runtime policy',
      code: 'ssr:only | client:visible | graph:check',
      status: '核心包与控件已对齐',
    };
  }

  return {
    url: 'docs-islands.dev/products',
    mapTitle: 'Product Map',
    nodes: ['Core Package', 'Runtime Logs', 'Graph Rules'],
    panelLabel: 'Docs Contract',
    title: 'Markdown -> Islands -> Stable Pages',
    insight:
      'Flatten rendering, diagnostics, and architecture boundaries into inspectable layers so documentation stays static-first without losing real interaction.',
    codeLabel: 'runtime policy',
    code: 'ssr:only | client:visible | graph:check',
    status: 'Core package and controls aligned',
  };
});
</script>

<template>
  <div class="docs-hero-mockup" aria-label="Docs Islands product map preview">
    <div class="mockup-toolbar">
      <div class="mockup-dots" aria-hidden="true">
        <span></span>
        <span></span>
        <span></span>
      </div>
      <div class="mockup-url">{{ text.url }}</div>
    </div>

    <div class="mockup-body">
      <aside class="mockup-map">
        <p>{{ text.mapTitle }}</p>
        <div
          v-for="(node, index) in text.nodes"
          :key="node"
          class="mockup-node"
          :class="{ 'is-active': index === 0, 'is-muted': index === 2 }"
        >
          <span>{{ index + 1 }}</span>
          <strong>{{ node }}</strong>
        </div>
      </aside>

      <main class="mockup-panel">
        <div class="mockup-eyebrow">{{ text.panelLabel }}</div>
        <h2>{{ text.title }}</h2>
        <p>{{ text.insight }}</p>

        <div class="mockup-code">
          <span>{{ text.codeLabel }}</span>
          <code>{{ text.code }}</code>
        </div>

        <div class="mockup-status">
          <span class="mockup-status-pulse"></span>
          <span>{{ text.status }}</span>
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
.docs-hero-mockup {
  position: relative;
  overflow: hidden;
  width: min(100%, 760px);
  border: 1px solid var(--docs-home-border);
  border-radius: 8px;
  background: var(--docs-home-surface);
  box-shadow: var(--docs-home-shadow-lg);
}

.mockup-toolbar {
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 54px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--docs-home-border);
  background: color-mix(in srgb, var(--docs-home-bg) 72%, transparent);
}

.mockup-dots {
  display: flex;
  flex: 0 0 auto;
  gap: 6px;
}

.mockup-dots span {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--docs-home-border-hover);
}

.mockup-url {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--docs-home-border);
  border-radius: 999px;
  background: var(--docs-home-surface);
  color: var(--vp-c-text-2);
  font-family: var(--docs-home-font-mono);
  font-size: 11px;
  font-weight: 500;
  line-height: 1.4;
  padding: 5px 14px;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mockup-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 220px;
  min-height: 372px;
}

.mockup-panel {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
  padding: 42px;
  text-align: left;
}

.mockup-eyebrow {
  width: fit-content;
  margin-bottom: 18px;
  border: 1px solid var(--docs-home-border);
  border-radius: 999px;
  color: var(--docs-home-accent-strong);
  font-family: var(--docs-home-font-mono);
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  padding: 7px 10px;
  text-transform: uppercase;
}

.mockup-panel h2 {
  max-width: 460px;
  margin: 0 0 18px;
  color: var(--vp-c-text-1);
  font-family: var(--docs-home-font-serif);
  font-size: 34px;
  font-style: italic;
  font-weight: 400;
  letter-spacing: 0;
  line-height: 1.08;
}

.mockup-panel p {
  max-width: 480px;
  margin: 0;
  color: var(--vp-c-text-2);
  font-size: 14px;
  line-height: 1.75;
}

.mockup-code {
  display: grid;
  gap: 8px;
  margin-top: 26px;
  border: 1px solid var(--docs-home-border);
  border-radius: 8px;
  background: var(--docs-home-code-bg);
  color: #d8dee9;
  padding: 16px;
  box-shadow: var(--docs-home-shadow-sm);
}

.mockup-code span {
  color: #a8a29e;
  font-family: var(--docs-home-font-mono);
  font-size: 11px;
}

.mockup-code code {
  color: #f5f5f4;
  font-family: var(--docs-home-font-mono);
  font-size: 13px;
}

.mockup-status {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-top: 18px;
  color: var(--vp-c-text-2);
  font-size: 12px;
  font-weight: 600;
}

.mockup-status-pulse {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--docs-home-success);
  box-shadow: 0 0 0 5px var(--docs-home-success-soft);
}

.mockup-map {
  order: 2;
  border-left: 1px solid var(--docs-home-border);
  background: color-mix(in srgb, var(--docs-home-bg) 70%, transparent);
  padding: 34px 26px;
  text-align: left;
}

.mockup-map p {
  margin: 0 0 22px;
  color: var(--vp-c-text-3);
  font-family: var(--docs-home-font-mono);
  font-size: 11px;
  font-weight: 700;
  line-height: 1.4;
  text-transform: uppercase;
}

.mockup-node {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 18px;
  color: var(--vp-c-text-2);
  font-size: 12px;
  line-height: 1.45;
}

.mockup-node span {
  display: grid;
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  place-items: center;
  border: 1px solid var(--docs-home-border);
  border-radius: 50%;
  background: var(--docs-home-surface);
  color: var(--vp-c-text-3);
  font-family: var(--docs-home-font-mono);
  font-size: 11px;
  font-weight: 700;
}

.mockup-node strong {
  color: inherit;
  font-size: 12px;
  font-weight: 700;
}

.mockup-node.is-active {
  color: var(--vp-c-text-1);
}

.mockup-node.is-active span {
  border-color: color-mix(
    in srgb,
    var(--docs-home-accent) 52%,
    var(--docs-home-border)
  );
  background: var(--docs-home-accent-soft);
  color: var(--docs-home-accent-strong);
}

.mockup-node.is-muted {
  opacity: 0.72;
}

@media (max-width: 720px) {
  .mockup-body {
    grid-template-columns: 1fr;
  }

  .mockup-map {
    order: 0;
    border-left: 0;
    border-bottom: 1px solid var(--docs-home-border);
    padding: 24px;
  }

  .mockup-panel {
    padding: 30px 24px;
  }

  .mockup-panel h2 {
    font-size: 28px;
  }
}
</style>
