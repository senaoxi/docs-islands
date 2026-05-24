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
      url: 'docs-islands.dev/principles',
      mapTitle: '设计原则',
      nodes: ['静态优先', '按需交互', '边界可见'],
      panelLabel: '设计理念',
      title: '静态为底，交互成岛',
      insight:
        'Docs Islands 在不同文档框架之上提供一层兼容抽象，把稳定内容与可独立激活的交互单元组合成用户最终看到的页面。',
      diagramLabel: '兼容模型',
      userLayer: '用户看到的内容',
      islandsLayer: 'Docs Islands 兼容层',
      islandsNote: '统一 islands 能力与渲染边界',
      frameworks: ['VitePress', 'Docusaurus', 'Nextra', 'Rslib'],
      status: '静态优先 · 交互按需 · 边界清晰',
    };
  }

  return {
    url: 'docs-islands.dev/principles',
    mapTitle: 'Design principles',
    nodes: ['Static-first', 'Island-level', 'Observable'],
    panelLabel: 'Design philosophy',
    title: 'Content First, Interaction as Islands',
    insight:
      'Docs Islands adds a compatibility layer above documentation frameworks, combining stable content with independently activated interactive islands into the page users actually see.',
    diagramLabel: 'compatibility model',
    userLayer: 'User-facing content',
    islandsLayer: 'Docs Islands compatibility layer',
    islandsNote: 'Unified islands behavior and render boundaries',
    frameworks: ['VitePress', 'Docusaurus', 'Nextra', 'Rslib'],
    status: 'Static-first · interactive by intent · clear boundaries',
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
          :class="{ 'is-active': index === 0 }"
        >
          <span>{{ index + 1 }}</span>
          <strong>{{ node }}</strong>
        </div>
      </aside>

      <main class="mockup-panel">
        <div class="mockup-eyebrow">{{ text.panelLabel }}</div>
        <h2>{{ text.title }}</h2>
        <p>{{ text.insight }}</p>

        <div class="mockup-code" :aria-label="text.diagramLabel">
          <span class="flow-kicker">{{ text.diagramLabel }}</span>

          <div class="flow-diagram" aria-hidden="true">
            <div class="flow-row flow-user">
              <strong>{{ text.userLayer }}</strong>
            </div>

            <div class="flow-stream flow-stream-up">
              <span></span>
              <span></span>
              <span></span>
            </div>

            <div class="flow-row flow-islands">
              <strong>{{ text.islandsLayer }}</strong>
              <span>{{ text.islandsNote }}</span>
            </div>

            <div class="flow-stream">
              <span></span>
              <span></span>
              <span></span>
            </div>

            <div class="flow-frameworks">
              <span v-for="framework in text.frameworks" :key="framework">
                {{ framework }}
              </span>
            </div>
          </div>
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
  gap: 12px;
  margin-top: 26px;
  border: 1px solid var(--docs-home-border);
  border-radius: 8px;
  background: var(--docs-home-code-bg);
  color: #d8dee9;
  padding: 16px;
  box-shadow: var(--docs-home-shadow-sm);
}

.flow-kicker {
  color: #a8a29e;
  font-family: var(--docs-home-font-mono);
  font-size: 11px;
  line-height: 1;
  text-transform: uppercase;
}

.flow-diagram {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.flow-row {
  position: relative;
  display: grid;
  min-width: 0;
  overflow: hidden;
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 7px;
}

.flow-row::before {
  position: absolute;
  inset: 0;
  content: '';
  opacity: 0;
  transform: translateX(-40%);
  animation: flow-sheen 4.8s ease-in-out infinite;
}

.flow-row strong,
.flow-row span {
  position: relative;
  z-index: 1;
}

.flow-user {
  place-items: center;
  min-height: 40px;
  background:
    linear-gradient(135deg, rgb(66 184 131 / 16%), transparent 44%),
    rgb(255 255 255 / 6%);
}

.flow-user::before {
  background: linear-gradient(
    90deg,
    transparent,
    rgb(97 218 251 / 18%),
    transparent
  );
}

.flow-user strong {
  color: #f5f5f4;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.3;
}

.flow-islands {
  gap: 4px;
  min-height: 54px;
  padding: 10px 14px;
  background:
    linear-gradient(135deg, rgb(109 91 208 / 38%), transparent 56%),
    rgb(66 184 131 / 15%);
  animation: layer-breathe 4.8s ease-in-out infinite;
}

.flow-islands::before {
  background: linear-gradient(
    90deg,
    transparent,
    rgb(245 245 244 / 16%),
    transparent
  );
}

.flow-islands strong {
  color: #f5f5f4;
  font-size: 13px;
  line-height: 1.25;
}

.flow-islands span {
  color: #cbd5e1;
  font-size: 11px;
  line-height: 1.35;
}

.flow-stream {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  height: 16px;
  padding: 0 42px;
}

.flow-stream span {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(
    180deg,
    transparent,
    rgb(97 218 251 / 72%),
    transparent
  );
  opacity: 0.35;
  transform: scaleY(0.45);
  animation: flow-rise 2.4s ease-in-out infinite;
}

.flow-stream span:nth-child(2) {
  animation-delay: 0.28s;
}

.flow-stream span:nth-child(3) {
  animation-delay: 0.56s;
}

.flow-frameworks {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 7px;
}

.flow-frameworks span {
  display: grid;
  min-width: 0;
  min-height: 34px;
  place-items: center;
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 7px;
  background: rgb(255 255 255 / 6%);
  color: #d8dee9;
  font-family: var(--docs-home-font-mono);
  font-size: 10px;
  font-weight: 600;
  line-height: 1.2;
  text-align: center;
  animation: framework-signal 4.8s ease-in-out infinite;
}

.flow-frameworks span:nth-child(2) {
  animation-delay: 0.2s;
}

.flow-frameworks span:nth-child(3) {
  animation-delay: 0.4s;
}

.flow-frameworks span:nth-child(4) {
  animation-delay: 0.6s;
}

@keyframes flow-sheen {
  0%,
  58% {
    opacity: 0;
    transform: translateX(-40%);
  }

  72% {
    opacity: 1;
  }

  100% {
    opacity: 0;
    transform: translateX(40%);
  }
}

@keyframes layer-breathe {
  0%,
  100% {
    border-color: rgb(255 255 255 / 12%);
    box-shadow: 0 0 0 rgb(109 91 208 / 0%);
  }

  50% {
    border-color: rgb(97 218 251 / 32%);
    box-shadow: 0 0 22px rgb(109 91 208 / 20%);
  }
}

@keyframes flow-rise {
  0%,
  100% {
    opacity: 0.25;
    transform: translateY(5px) scaleY(0.42);
  }

  50% {
    opacity: 0.9;
    transform: translateY(-5px) scaleY(1);
  }
}

@keyframes framework-signal {
  0%,
  100% {
    border-color: rgb(255 255 255 / 10%);
    transform: translateY(0);
  }

  45%,
  55% {
    border-color: rgb(66 184 131 / 38%);
    transform: translateY(-2px);
  }
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

  .flow-frameworks {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (prefers-reduced-motion: reduce) {
  .flow-row::before,
  .flow-islands,
  .flow-stream span,
  .flow-frameworks span {
    animation: none;
  }
}
</style>
