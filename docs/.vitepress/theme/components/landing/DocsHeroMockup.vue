<script setup lang="ts">
import { useData, useRoute } from 'vitepress';
import { computed, ref } from 'vue';

const { lang } = useData();
const route = useRoute();
const isFlowActivated = ref(false);
const isZh = computed(
  () => route.path.startsWith('/zh/') || lang.value.startsWith('zh'),
);

const activateFlow = () => {
  if (isFlowActivated.value) return;

  isFlowActivated.value = true;
};

const text = computed(() => {
  if (isZh.value) {
    return {
      url: 'docs-islands.dev/principles',
      mapTitle: '设计原则',
      nodes: ['静态优先', '按需交互', '边界可见'],
      panelLabel: '设计理念',
      title: '静态为底，交互成岛',
      insight:
        'Docs Islands 在文档框架之上提供兼容抽象，让 React、Vue 等 UI 框架按自身运行时正常渲染，而不是被文档框架的模板和生命周期锁住。',
      diagramLabel: 'UI 框架兼容模型',
      uiLayer: '正常渲染的 UI 框架',
      uiNote: '按各自运行时挂载、更新和水合',
      uiFrameworks: ['Vue', 'React', 'Svelte', 'Solid'],
      islandsLayer: 'Docs Islands 兼容层',
      islandsTile: 'Docs Islands',
      islandsTileNote: '兼容层',
      islandsNote: '隔离文档框架限制，统一 islands 能力与渲染边界',
      docsLayer: '文档框架宿主',
      docsNote: '继续负责 Markdown、路由和静态构建',
      docsFrameworks: ['VitePress', 'Docusaurus', 'Nextra', 'Rslib'],
      status: 'UI 正常渲染 · 文档静态优先 · 边界清晰',
    };
  }

  return {
    url: 'docs-islands.dev/principles',
    mapTitle: 'Design principles',
    nodes: ['Static-first', 'Island-level', 'Observable'],
    panelLabel: 'Design philosophy',
    title: 'Content First, Interaction as Islands',
    insight:
      'Docs Islands adds a compatibility layer above documentation frameworks so React, Vue, and other UI runtimes can render normally instead of being constrained by the docs framework shell.',
    diagramLabel: 'UI framework compatibility model',
    uiLayer: 'Normally rendered UI frameworks',
    uiNote: 'Mounted, updated, and hydrated by their own runtimes',
    uiFrameworks: ['Vue', 'React', 'Svelte', 'Solid'],
    islandsLayer: 'Docs Islands compatibility layer',
    islandsTile: 'Docs Islands',
    islandsTileNote: 'compat layer',
    islandsNote:
      'Isolates docs-framework limits and unifies islands render boundaries',
    docsLayer: 'Documentation framework host',
    docsNote: 'Still owns Markdown, routing, and static output',
    docsFrameworks: ['VitePress', 'Docusaurus', 'Nextra', 'Rslib'],
    status: 'UI runtimes render normally · docs stay static-first',
  };
});

const frameworkMarks: Record<string, string> = {
  Vue: 'V',
  React: 'R',
  Svelte: 'S',
  Solid: 'S',
  VitePress: 'VP',
  Docusaurus: 'DC',
  Nextra: 'NX',
  Rslib: 'RS',
};

const getFrameworkMark = (framework: string) =>
  frameworkMarks[framework] ?? framework.slice(0, 2).toUpperCase();
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

        <div
          class="mockup-code"
          :class="{ 'is-flow-active': isFlowActivated }"
          :aria-label="text.diagramLabel"
        >
          <span class="flow-kicker">{{ text.diagramLabel }}</span>

          <div class="flow-diagram" aria-hidden="true">
            <div class="tile-scene">
              <div class="flow-ui-frameworks tile-cluster">
                <span
                  v-for="framework in text.uiFrameworks"
                  :key="framework"
                  class="flow-tile flow-ui-tile"
                >
                  <span class="flow-tile-mark">
                    {{ getFrameworkMark(framework) }}
                  </span>
                  <strong>
                    {{ framework }}
                  </strong>
                </span>
              </div>

              <div class="flow-stream flow-stream-to-ui">
                <span></span>
                <span></span>
                <span></span>
              </div>

              <div class="flow-islands flow-tile">
                <span class="flow-tile-mark">DI</span>
                <strong>{{ text.islandsTile }}</strong>
                <small>{{ text.islandsTileNote }}</small>
              </div>

              <div class="flow-stream flow-stream-to-islands">
                <span></span>
                <span></span>
                <span></span>
              </div>

              <div class="flow-doc-frameworks tile-cluster">
                <span
                  v-for="framework in text.docsFrameworks"
                  :key="framework"
                  class="flow-doc-tile flow-tile"
                  @mouseenter="activateFlow"
                  @mouseover="activateFlow"
                  @pointerenter="activateFlow"
                  @pointerdown="activateFlow"
                  @touchstart.passive="activateFlow"
                >
                  <span class="flow-tile-mark">
                    {{ getFrameworkMark(framework) }}
                  </span>
                  <strong>
                    {{ framework }}
                  </strong>
                </span>
              </div>
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
  --mockup-code-bg: color-mix(
    in srgb,
    var(--docs-home-surface) 72%,
    var(--docs-home-bg)
  );
  --mockup-code-border: color-mix(
    in srgb,
    var(--docs-home-accent) 24%,
    var(--docs-home-border)
  );
  --mockup-code-text: var(--docs-home-hero-title);
  --mockup-code-muted: color-mix(
    in srgb,
    var(--vp-c-text-2) 84%,
    var(--docs-home-hero-title-accent)
  );
  --mockup-code-subtle: var(--vp-c-text-3);
  --mockup-code-layer-bg: color-mix(
    in srgb,
    var(--docs-home-surface) 86%,
    var(--docs-home-primary-soft)
  );
  --mockup-code-layer-muted-bg: color-mix(
    in srgb,
    var(--docs-home-surface) 82%,
    var(--docs-home-accent-soft)
  );
  --mockup-code-islands-bg: color-mix(
    in srgb,
    var(--docs-home-surface) 76%,
    var(--docs-home-accent-soft)
  );
  --mockup-code-layer-border: color-mix(
    in srgb,
    var(--docs-home-accent) 22%,
    var(--docs-home-border)
  );
  --mockup-code-runtime-aura: color-mix(
    in srgb,
    var(--docs-home-hero-title-accent) 8%,
    transparent
  );
  --mockup-code-ui-aura: color-mix(
    in srgb,
    var(--docs-home-accent) 10%,
    transparent
  );
  --mockup-code-docs-aura: color-mix(
    in srgb,
    var(--docs-home-primary) 6%,
    transparent
  );
  --mockup-code-islands-aura: color-mix(
    in srgb,
    var(--docs-home-accent) 12%,
    transparent
  );
  --mockup-code-sheen: color-mix(
    in srgb,
    var(--docs-home-accent) 18%,
    transparent
  );
  --mockup-code-flow-line: color-mix(
    in srgb,
    var(--docs-home-accent) 34%,
    transparent
  );
  --mockup-code-pill-bg: color-mix(
    in srgb,
    var(--docs-home-surface) 88%,
    var(--docs-home-primary-soft)
  );
  --mockup-code-pill-border: color-mix(
    in srgb,
    var(--docs-home-accent) 22%,
    var(--docs-home-border)
  );
  --mockup-code-pill-text: var(--vp-c-text-1);
  display: grid;
  gap: 12px;
  margin-top: 26px;
  border: 1px solid var(--mockup-code-border);
  border-radius: 8px;
  background: var(--mockup-code-bg);
  color: var(--mockup-code-text);
  padding: 16px;
  box-shadow: var(--docs-home-shadow-sm);
  transition:
    border-color 0.28s ease,
    box-shadow 0.28s ease;
}

.mockup-code:is(.is-flow-active, :has(.flow-doc-tile:hover)) {
  border-color: var(--mockup-code-pill-border);
  box-shadow:
    var(--docs-home-shadow-sm),
    0 0 30px var(--mockup-code-islands-aura);
}

:global(.dark) .mockup-code {
  --mockup-code-bg: color-mix(
    in srgb,
    var(--docs-home-code-bg) 86%,
    var(--docs-home-hero-title-accent)
  );
  --mockup-code-border: color-mix(
    in srgb,
    var(--docs-home-hero-title-accent) 28%,
    var(--docs-home-border)
  );
  --mockup-code-text: var(--vp-c-text-1);
  --mockup-code-muted: #cbd5e1;
  --mockup-code-subtle: #a8a29e;
  --mockup-code-layer-bg: rgb(255 255 255 / 6%);
  --mockup-code-layer-muted-bg: rgb(255 255 255 / 4%);
  --mockup-code-islands-bg: rgb(66 184 131 / 15%);
  --mockup-code-layer-border: rgb(255 255 255 / 10%);
  --mockup-code-runtime-aura: rgb(97 218 251 / 16%);
  --mockup-code-ui-aura: rgb(66 184 131 / 20%);
  --mockup-code-docs-aura: rgb(255 255 255 / 7%);
  --mockup-code-islands-aura: rgb(109 91 208 / 38%);
  --mockup-code-sheen: rgb(245 245 244 / 16%);
  --mockup-code-flow-line: rgb(97 218 251 / 72%);
  --mockup-code-pill-bg: rgb(255 255 255 / 6%);
  --mockup-code-pill-border: rgb(97 218 251 / 20%);
  --mockup-code-pill-text: #d8dee9;
}

.flow-kicker {
  color: var(--mockup-code-subtle);
  font-family: var(--docs-home-font-mono);
  font-size: 11px;
  line-height: 1;
  text-transform: uppercase;
}

.flow-diagram {
  min-width: 0;
}

.tile-scene {
  position: relative;
  width: min(100%, 510px);
  min-height: 320px;
  margin: 0 auto;
  isolation: isolate;
}

.tile-cluster {
  position: absolute;
  inset: 0;
  min-width: 0;
  pointer-events: none;
}

.flow-tile {
  --tile-x: 0px;
  --tile-y: 0px;
  --tile-scale: 0.96;
  --tile-opacity: 0.58;
  --tile-edge: color-mix(in srgb, var(--mockup-code-layer-border) 76%, #000);
  position: absolute;
  top: 50%;
  left: 50%;
  display: grid;
  width: 106px;
  min-height: 68px;
  margin: -34px 0 0 -53px;
  place-items: center;
  gap: 6px;
  overflow: visible;
  padding: 10px;
  border: 1px solid var(--mockup-code-layer-border);
  border-radius: 8px;
  background:
    linear-gradient(135deg, var(--mockup-code-docs-aura), transparent 44%),
    var(--mockup-code-layer-muted-bg);
  box-shadow:
    0 12px 20px color-mix(in srgb, var(--docs-home-code-bg) 14%, transparent),
    0 1px 0 rgb(255 255 255 / 28%) inset;
  color: var(--mockup-code-pill-text);
  font-family: var(--docs-home-font-mono);
  opacity: var(--tile-opacity);
  text-align: center;
  transform: translate3d(var(--tile-x), var(--tile-y), 0)
    scale(var(--tile-scale));
  transition:
    border-color 0.28s ease,
    box-shadow 0.28s ease,
    filter 0.28s ease,
    opacity 0.28s ease,
    transform 0.28s ease;
}

.flow-tile::before {
  position: absolute;
  inset: 0;
  content: '';
  opacity: 0;
  transform: translateX(-40%);
  animation: none;
}

.flow-tile::after {
  position: absolute;
  right: 10px;
  bottom: -9px;
  left: 10px;
  z-index: -1;
  height: 10px;
  border-radius: 0 0 8px 8px;
  background: linear-gradient(
    180deg,
    var(--tile-edge),
    color-mix(in srgb, var(--tile-edge) 40%, transparent)
  );
  content: '';
  opacity: 0.68;
  transform: skewX(-28deg);
  transform-origin: top;
}

.flow-tile-mark,
.flow-tile strong,
.flow-tile small {
  position: relative;
  z-index: 1;
}

.flow-tile-mark {
  display: grid;
  width: 30px;
  height: 24px;
  place-items: center;
  border: 1px solid var(--mockup-code-layer-border);
  border-radius: 6px;
  background:
    linear-gradient(135deg, var(--mockup-code-ui-aura), transparent 60%),
    var(--mockup-code-pill-bg);
  color: var(--mockup-code-text);
  font-size: 10px;
  font-weight: 800;
  line-height: 1;
}

.flow-tile strong {
  max-width: 100%;
  overflow: hidden;
  color: var(--mockup-code-pill-text);
  font-size: 10px;
  font-weight: 700;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.flow-tile small {
  color: var(--mockup-code-muted);
  font-size: 9px;
  font-weight: 700;
  line-height: 1;
  text-transform: uppercase;
}

.flow-tile::before {
  background: linear-gradient(
    90deg,
    transparent,
    var(--mockup-code-sheen),
    transparent
  );
}

.flow-ui-frameworks .flow-tile {
  --tile-opacity: 0.34;
  --tile-edge: color-mix(in srgb, var(--mockup-code-ui-aura) 60%, #000);
  z-index: 2;
  background:
    linear-gradient(135deg, var(--mockup-code-ui-aura), transparent 52%),
    linear-gradient(315deg, var(--mockup-code-runtime-aura), transparent 60%),
    var(--mockup-code-layer-bg);
  filter: saturate(0.72);
}

.flow-ui-frameworks .flow-tile:nth-child(1) {
  --tile-x: -150px;
  --tile-y: -86px;
}

.flow-ui-frameworks .flow-tile:nth-child(2) {
  --tile-x: -50px;
  --tile-y: -120px;
}

.flow-ui-frameworks .flow-tile:nth-child(3) {
  --tile-x: 50px;
  --tile-y: -120px;
}

.flow-ui-frameworks .flow-tile:nth-child(4) {
  --tile-x: 150px;
  --tile-y: -86px;
}

.flow-doc-frameworks {
  pointer-events: none;
}

.flow-doc-frameworks .flow-tile {
  --tile-opacity: 0.84;
  z-index: 1;
  cursor: pointer;
  pointer-events: auto;
}

.flow-doc-frameworks .flow-tile:nth-child(1) {
  --tile-x: -150px;
  --tile-y: 86px;
}

.flow-doc-frameworks .flow-tile:nth-child(2) {
  --tile-x: -50px;
  --tile-y: 120px;
}

.flow-doc-frameworks .flow-tile:nth-child(3) {
  --tile-x: 50px;
  --tile-y: 120px;
}

.flow-doc-frameworks .flow-tile:nth-child(4) {
  --tile-x: 150px;
  --tile-y: 86px;
}

.flow-doc-frameworks .flow-tile:hover {
  border-color: var(--mockup-code-pill-border);
  box-shadow: 0 0 18px var(--mockup-code-docs-aura);
  transform: translate3d(var(--tile-x), calc(var(--tile-y) - 3px), 0) scale(1);
}

.flow-islands {
  --tile-edge: color-mix(in srgb, var(--mockup-code-islands-aura) 70%, #000);
  z-index: 3;
  width: 130px;
  min-height: 84px;
  margin: -42px 0 0 -65px;
  background:
    linear-gradient(135deg, var(--mockup-code-islands-aura), transparent 56%),
    var(--mockup-code-islands-bg);
  filter: saturate(0.72);
  opacity: 0.62;
  animation: none;
}

.flow-islands .flow-tile-mark {
  border-color: var(--mockup-code-pill-border);
  background:
    linear-gradient(135deg, var(--mockup-code-islands-aura), transparent 58%),
    var(--mockup-code-pill-bg);
}

.flow-stream {
  position: absolute;
  left: 50%;
  z-index: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  width: 168px;
  height: 52px;
  pointer-events: none;
  transform: translateX(-50%);
}

.flow-stream-to-ui {
  top: 82px;
}

.flow-stream-to-islands {
  top: 186px;
}

.flow-stream span {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(
    180deg,
    transparent,
    var(--mockup-code-flow-line),
    transparent
  );
  opacity: 0.35;
  transform: translateY(7px) scaleY(0.24);
  animation: none;
  transition:
    opacity 0.24s ease,
    transform 0.24s ease;
}

.mockup-code:is(.is-flow-active, :has(.flow-doc-tile:hover))
  .flow-doc-frameworks
  .flow-tile {
  border-color: var(--mockup-code-pill-border);
  box-shadow: 0 0 18px var(--mockup-code-docs-aura);
  opacity: 1;
  transform: translate3d(var(--tile-x), var(--tile-y), 0) scale(1);
}

.mockup-code:is(.is-flow-active, :has(.flow-doc-tile:hover))
  .flow-doc-frameworks
  .flow-tile::before,
.mockup-code:is(.is-flow-active, :has(.flow-doc-tile:hover))
  .flow-islands::before,
.mockup-code:is(.is-flow-active, :has(.flow-doc-tile:hover))
  .flow-ui-frameworks
  .flow-tile::before {
  animation: flow-sheen 4.8s ease-in-out infinite;
}

.mockup-code:is(.is-flow-active, :has(.flow-doc-tile:hover))
  .flow-stream-to-islands
  span {
  opacity: 0.88;
  transform: translateY(0) scaleY(0.8);
  animation: flow-rise 2.4s ease-in-out infinite;
}

.mockup-code:is(.is-flow-active, :has(.flow-doc-tile:hover))
  .flow-stream-to-islands
  span:nth-child(2) {
  animation-delay: 0.28s;
}

.mockup-code:is(.is-flow-active, :has(.flow-doc-tile:hover))
  .flow-stream-to-islands
  span:nth-child(3) {
  animation-delay: 0.56s;
}

.mockup-code:is(.is-flow-active, :has(.flow-doc-tile:hover)) .flow-islands {
  border-color: var(--mockup-code-pill-border);
  filter: none;
  opacity: 1;
  transform: translate3d(var(--tile-x), var(--tile-y), 0) scale(1);
  animation: layer-breathe 4.8s ease-in-out 0.2s infinite;
  transition-delay: 0.18s;
}

.mockup-code:is(.is-flow-active, :has(.flow-doc-tile:hover))
  .flow-stream-to-ui
  span {
  opacity: 0.88;
  transform: translateY(0) scaleY(0.8);
  animation: flow-rise 2.4s ease-in-out 0.52s infinite;
  transition-delay: 0.44s;
}

.mockup-code:is(.is-flow-active, :has(.flow-doc-tile:hover))
  .flow-stream-to-ui
  span:nth-child(2) {
  animation-delay: 0.8s;
}

.mockup-code:is(.is-flow-active, :has(.flow-doc-tile:hover))
  .flow-stream-to-ui
  span:nth-child(3) {
  animation-delay: 1.08s;
}

.mockup-code:is(.is-flow-active, :has(.flow-doc-tile:hover))
  .flow-ui-frameworks
  .flow-tile {
  border-color: var(--mockup-code-pill-border);
  filter: none;
  opacity: 1;
  box-shadow: 0 0 14px var(--mockup-code-ui-aura);
  transform: translate3d(var(--tile-x), var(--tile-y), 0) scale(1);
  animation: framework-signal 4.8s ease-in-out 0.9s infinite;
}

.mockup-code:is(.is-flow-active, :has(.flow-doc-tile:hover))
  .flow-ui-frameworks
  .flow-tile:nth-child(1) {
  transition-delay: 0.76s;
}

.mockup-code:is(.is-flow-active, :has(.flow-doc-tile:hover))
  .flow-ui-frameworks
  .flow-tile:nth-child(2) {
  animation-delay: 1.04s;
  transition-delay: 0.88s;
}

.mockup-code:is(.is-flow-active, :has(.flow-doc-tile:hover))
  .flow-ui-frameworks
  .flow-tile:nth-child(3) {
  animation-delay: 1.18s;
  transition-delay: 1s;
}

.mockup-code:is(.is-flow-active, :has(.flow-doc-tile:hover))
  .flow-ui-frameworks
  .flow-tile:nth-child(4) {
  animation-delay: 1.32s;
  transition-delay: 1.12s;
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
    border-color: var(--mockup-code-layer-border);
    box-shadow: 0 0 0 transparent;
  }

  50% {
    border-color: var(--mockup-code-pill-border);
    box-shadow: 0 0 22px var(--mockup-code-islands-aura);
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
    border-color: var(--mockup-code-layer-border);
    transform: translate3d(var(--tile-x), var(--tile-y), 0) scale(1);
  }

  45%,
  55% {
    border-color: var(--mockup-code-pill-border);
    transform: translate3d(var(--tile-x), calc(var(--tile-y) - 3px), 0)
      scale(1.02);
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

  .tile-scene {
    width: min(100%, 300px);
    min-height: 438px;
  }

  .flow-tile {
    width: 96px;
    min-height: 62px;
    margin: -31px 0 0 -48px;
    padding: 8px;
  }

  .flow-islands {
    width: 120px;
    min-height: 78px;
    margin: -39px 0 0 -60px;
  }

  .flow-ui-frameworks .flow-tile:nth-child(1) {
    --tile-x: -68px;
    --tile-y: -152px;
  }

  .flow-ui-frameworks .flow-tile:nth-child(2) {
    --tile-x: 68px;
    --tile-y: -152px;
  }

  .flow-ui-frameworks .flow-tile:nth-child(3) {
    --tile-x: -68px;
    --tile-y: -72px;
  }

  .flow-ui-frameworks .flow-tile:nth-child(4) {
    --tile-x: 68px;
    --tile-y: -72px;
  }

  .flow-doc-frameworks .flow-tile:nth-child(1) {
    --tile-x: -68px;
    --tile-y: 72px;
  }

  .flow-doc-frameworks .flow-tile:nth-child(2) {
    --tile-x: 68px;
    --tile-y: 72px;
  }

  .flow-doc-frameworks .flow-tile:nth-child(3) {
    --tile-x: -68px;
    --tile-y: 152px;
  }

  .flow-doc-frameworks .flow-tile:nth-child(4) {
    --tile-x: 68px;
    --tile-y: 152px;
  }

  .flow-stream {
    width: 132px;
    height: 44px;
  }

  .flow-stream-to-ui {
    top: 142px;
  }

  .flow-stream-to-islands {
    top: 252px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .flow-tile::before,
  .flow-tile,
  .flow-islands,
  .flow-stream span {
    animation: none;
  }
}
</style>
