<script setup lang="ts">
import { useData, useRoute } from 'vitepress';
import { computed, ref } from 'vue';

const { lang } = useData();
const route = useRoute();
const hoveredDocFramework = ref<string | null>(null);
const isFlowHovered = computed(() => hoveredDocFramework.value !== null);
const isZh = computed(
  () => route.path.startsWith('/zh/') || lang.value.startsWith('zh'),
);

const setHoveredDocFramework = (framework: string | null) => {
  hoveredDocFramework.value = framework;
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

interface ConnectorPoint {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const uiConnectorPoints: ConnectorPoint[] = [
  { x1: -44, y1: -34, x2: -96, y2: -58 },
  { x1: -22, y1: -42, x2: -38, y2: -76 },
  { x1: 22, y1: -42, x2: 38, y2: -76 },
  { x1: 44, y1: -34, x2: 96, y2: -58 },
];

const docConnectorPoints: ConnectorPoint[] = [
  { x1: -96, y1: 58, x2: -44, y2: 34 },
  { x1: -38, y1: 76, x2: -22, y2: 42 },
  { x1: 38, y1: 76, x2: 22, y2: 42 },
  { x1: 96, y1: 58, x2: 44, y2: 34 },
];

const uiConnectorLines = computed(() =>
  text.value.uiFrameworks.map((framework, index) => ({
    framework,
    ...uiConnectorPoints[index],
  })),
);

const docConnectorLines = computed(() =>
  text.value.docsFrameworks.map((framework, index) => ({
    framework,
    ...docConnectorPoints[index],
  })),
);

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
          :class="{ 'is-flow-active': isFlowHovered }"
          :aria-label="text.diagramLabel"
        >
          <span class="flow-kicker">{{ text.diagramLabel }}</span>

          <div class="flow-diagram" aria-hidden="true">
            <div class="tile-scene">
              <svg
                class="tile-connectors-svg"
                viewBox="-255 -160 510 320"
                preserveAspectRatio="none"
              >
                <g
                  v-for="line in uiConnectorLines"
                  :key="`ui-connector-${line.framework}`"
                  class="tile-connector-group tile-connector-group-ui"
                  :class="{ 'is-line-active': isFlowHovered }"
                >
                  <line
                    class="tile-connector-dash tile-connector-segment"
                    :x1="line.x1"
                    :y1="line.y1"
                    :x2="line.x2"
                    :y2="line.y2"
                  />
                  <line
                    class="tile-connector-glow tile-connector-segment"
                    pathLength="1"
                    :x1="line.x1"
                    :y1="line.y1"
                    :x2="line.x2"
                    :y2="line.y2"
                  />
                  <line
                    class="tile-connector-core tile-connector-segment"
                    pathLength="1"
                    :x1="line.x1"
                    :y1="line.y1"
                    :x2="line.x2"
                    :y2="line.y2"
                  />
                  <line
                    class="tile-connector-segment tile-connector-sheen"
                    pathLength="1"
                    :x1="line.x1"
                    :y1="line.y1"
                    :x2="line.x2"
                    :y2="line.y2"
                  />
                </g>
                <g
                  v-for="line in docConnectorLines"
                  :key="`doc-connector-${line.framework}`"
                  class="tile-connector-group tile-connector-group-doc"
                  :class="{
                    'is-line-active': hoveredDocFramework === line.framework,
                  }"
                >
                  <line
                    class="tile-connector-dash tile-connector-segment"
                    :x1="line.x1"
                    :y1="line.y1"
                    :x2="line.x2"
                    :y2="line.y2"
                  />
                  <line
                    class="tile-connector-glow tile-connector-segment"
                    pathLength="1"
                    :x1="line.x1"
                    :y1="line.y1"
                    :x2="line.x2"
                    :y2="line.y2"
                  />
                  <line
                    class="tile-connector-core tile-connector-segment"
                    pathLength="1"
                    :x1="line.x1"
                    :y1="line.y1"
                    :x2="line.x2"
                    :y2="line.y2"
                  />
                  <line
                    class="tile-connector-segment tile-connector-sheen"
                    pathLength="1"
                    :x1="line.x1"
                    :y1="line.y1"
                    :x2="line.x2"
                    :y2="line.y2"
                  />
                </g>
              </svg>

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

              <div class="flow-islands flow-tile">
                <span class="flow-tile-mark">DI</span>
                <strong>{{ text.islandsTile }}</strong>
                <small>{{ text.islandsTileNote }}</small>
              </div>

              <div class="flow-doc-frameworks tile-cluster">
                <span
                  v-for="framework in text.docsFrameworks"
                  :key="framework"
                  class="flow-doc-tile flow-tile"
                  :class="{
                    'is-doc-active': hoveredDocFramework === framework,
                  }"
                  @mouseenter="setHoveredDocFramework(framework)"
                  @mouseover="setHoveredDocFramework(framework)"
                  @mouseleave="setHoveredDocFramework(null)"
                  @pointerenter="setHoveredDocFramework(framework)"
                  @pointerleave="setHoveredDocFramework(null)"
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
    var(--docs-home-border-hover) 72%,
    var(--docs-home-accent)
  );
  --mockup-code-flow-core: color-mix(
    in srgb,
    var(--docs-home-border-hover) 62%,
    var(--docs-home-accent)
  );
  --mockup-code-flow-hot: color-mix(
    in srgb,
    white 82%,
    var(--docs-home-accent)
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
  --mockup-code-flow-line: rgb(224 184 138 / 52%);
  --mockup-code-flow-core: rgb(215 191 166 / 72%);
  --mockup-code-flow-hot: rgb(255 245 232 / 78%);
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
  --tile-edge: color-mix(in srgb, var(--mockup-code-pill-border) 42%, #8a7460);
  z-index: 1;
  cursor: pointer;
  pointer-events: auto;
  border-color: color-mix(
    in srgb,
    var(--mockup-code-layer-border) 72%,
    var(--mockup-code-pill-border)
  );
  background:
    linear-gradient(180deg, rgb(255 255 255 / 42%), transparent 52%),
    radial-gradient(
      circle at 50% -18%,
      color-mix(in srgb, var(--mockup-code-pill-border) 34%, transparent),
      transparent 58%
    ),
    repeating-linear-gradient(
      135deg,
      color-mix(in srgb, var(--mockup-code-layer-border) 18%, transparent) 0 1px,
      transparent 1px 7px
    ),
    var(--mockup-code-layer-muted-bg);
  box-shadow:
    0 18px 24px color-mix(in srgb, var(--docs-home-code-bg) 18%, transparent),
    0 8px 14px color-mix(in srgb, var(--tile-edge) 16%, transparent),
    0 1px 0 rgb(255 255 255 / 58%) inset,
    0 -1px 0 color-mix(in srgb, var(--tile-edge) 22%, transparent) inset;
}

.flow-doc-frameworks .flow-tile::after {
  right: 12px;
  bottom: -11px;
  left: 14px;
  height: 12px;
  opacity: 0.78;
  filter: blur(0.2px);
}

.flow-doc-frameworks .flow-tile::before {
  background: linear-gradient(
    112deg,
    transparent 0%,
    transparent 31%,
    rgb(255 255 255 / 32%) 48%,
    transparent 66%,
    transparent 100%
  );
  opacity: 0.38;
  transform: translateX(-16%);
}

.flow-doc-frameworks .flow-tile .flow-tile-mark {
  border-color: color-mix(
    in srgb,
    var(--mockup-code-pill-border) 54%,
    var(--mockup-code-layer-border)
  );
  background:
    linear-gradient(180deg, rgb(255 255 255 / 54%), transparent 60%),
    color-mix(in srgb, var(--mockup-code-pill-bg) 92%, var(--docs-home-bg));
  box-shadow:
    0 1px 0 rgb(255 255 255 / 58%) inset,
    0 6px 14px color-mix(in srgb, var(--tile-edge) 10%, transparent);
}

.flow-doc-frameworks .flow-tile strong {
  color: color-mix(in srgb, var(--mockup-code-text) 88%, var(--tile-edge));
  text-shadow: 0 1px 0 rgb(255 255 255 / 34%);
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

.flow-doc-frameworks .flow-tile:is(:hover, .is-doc-active) {
  border-color: var(--mockup-code-pill-border);
  box-shadow:
    0 18px 24px color-mix(in srgb, var(--docs-home-code-bg) 18%, transparent),
    0 8px 14px color-mix(in srgb, var(--tile-edge) 18%, transparent),
    0 0 18px var(--mockup-code-docs-aura),
    0 1px 0 rgb(255 255 255 / 62%) inset,
    0 -1px 0 color-mix(in srgb, var(--tile-edge) 30%, transparent) inset;
  opacity: 1;
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

.tile-connectors-svg {
  position: absolute;
  z-index: 0;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
}

.tile-connector-segment {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
  pointer-events: none;
  vector-effect: non-scaling-stroke;
}

.tile-connector-dash {
  opacity: 0.62;
  stroke: color-mix(in srgb, var(--mockup-code-flow-line) 88%, transparent);
  stroke-width: 1.35;
  stroke-dasharray: 4 6.5;
  filter: drop-shadow(
      0 0 4px color-mix(in srgb, var(--mockup-code-flow-line) 24%, transparent)
    )
    drop-shadow(
      0 1px 0 color-mix(in srgb, var(--docs-home-bg) 54%, transparent)
    );
  transition:
    filter 0.42s ease,
    opacity 0.42s ease,
    stroke 0.42s ease,
    stroke-dasharray 0.42s ease,
    stroke-width 0.42s ease;
}

.tile-connector-glow,
.tile-connector-core,
.tile-connector-sheen {
  --connector-active-opacity: 1;
  opacity: 0;
  stroke-dashoffset: 1;
  transition:
    filter 0.42s ease,
    opacity 0.42s ease,
    stroke 0.42s ease,
    stroke-width 0.42s ease;
}

.tile-connector-glow {
  --connector-active-opacity: 0.34;
  stroke: var(--mockup-code-flow-core);
  stroke-width: 6.5;
  stroke-dasharray: 1;
  filter: blur(2.8px);
}

.tile-connector-core {
  stroke: var(--mockup-code-flow-core);
  stroke-width: 1.45;
  stroke-dasharray: 1;
  filter: drop-shadow(0 0 2px var(--mockup-code-flow-line))
    drop-shadow(
      0 0 7px color-mix(in srgb, var(--mockup-code-flow-core) 28%, transparent)
    );
}

.tile-connector-sheen {
  stroke: var(--mockup-code-flow-hot);
  stroke-width: 0.68;
  stroke-dasharray: 0.18 0.82;
  stroke-dashoffset: 1.18;
  filter: drop-shadow(0 0 2px var(--mockup-code-flow-hot))
    drop-shadow(0 0 5px var(--mockup-code-flow-core));
}

.tile-connector-group-ui .tile-connector-dash {
  opacity: 0.5;
}

.tile-connector-group-doc .tile-connector-dash {
  opacity: 0.68;
}

.tile-connector-group.is-line-active .tile-connector-dash {
  opacity: 0.2;
  stroke: var(--mockup-code-flow-line);
  stroke-dasharray: none;
  stroke-width: 1.05;
}

.tile-connector-group.is-line-active .tile-connector-glow {
  animation: connector-line-draw 1.08s cubic-bezier(0.2, 0.82, 0.22, 1) forwards;
}

.tile-connector-group.is-line-active .tile-connector-core {
  animation: connector-line-draw 1.08s cubic-bezier(0.2, 0.82, 0.22, 1) forwards;
}

.tile-connector-group.is-line-active .tile-connector-sheen {
  animation: connector-sheen 5.2s linear 1.05s infinite;
}

.tile-connector-group-doc.is-line-active .tile-connector-glow {
  --connector-active-opacity: 0.42;
  stroke-width: 7.5;
}

.tile-connector-group-doc.is-line-active .tile-connector-core {
  stroke-width: 1.72;
}

.tile-connector-group-ui.is-line-active .tile-connector-glow,
.tile-connector-group-ui.is-line-active .tile-connector-core {
  animation-delay: 1.08s;
  animation-duration: 1.26s;
}

.tile-connector-group-ui.is-line-active .tile-connector-dash {
  transition-delay: 1.08s;
}

.tile-connector-group-ui.is-line-active .tile-connector-sheen {
  animation-delay: 2.28s;
}

.flow-doc-frameworks .flow-tile:is(:hover, .is-doc-active)::before,
.mockup-code:is(.is-flow-active, :has(.flow-doc-tile:hover))
  .flow-islands::before,
.mockup-code:is(.is-flow-active, :has(.flow-doc-tile:hover))
  .flow-ui-frameworks
  .flow-tile::before {
  animation: flow-sheen 4.8s ease-in-out infinite;
}

.mockup-code:is(.is-flow-active, :has(.flow-doc-tile:hover)) .flow-islands {
  border-color: var(--mockup-code-pill-border);
  filter: none;
  opacity: 1;
  transform: translate3d(var(--tile-x), var(--tile-y), 0) scale(1);
  animation: layer-breathe 4.8s ease-in-out 0.92s infinite;
  transition-delay: 0.74s;
}

.mockup-code:is(.is-flow-active, :has(.flow-doc-tile:hover))
  .flow-ui-frameworks
  .flow-tile {
  border-color: var(--mockup-code-pill-border);
  filter: none;
  opacity: 1;
  box-shadow: 0 0 14px var(--mockup-code-ui-aura);
  transform: translate3d(var(--tile-x), var(--tile-y), 0) scale(1);
  animation: framework-signal 4.8s ease-in-out 2.5s infinite;
}

.mockup-code:is(.is-flow-active, :has(.flow-doc-tile:hover))
  .flow-ui-frameworks
  .flow-tile:nth-child(1) {
  transition-delay: 2.08s;
}

.mockup-code:is(.is-flow-active, :has(.flow-doc-tile:hover))
  .flow-ui-frameworks
  .flow-tile:nth-child(2) {
  animation-delay: 2.66s;
  transition-delay: 2.2s;
}

.mockup-code:is(.is-flow-active, :has(.flow-doc-tile:hover))
  .flow-ui-frameworks
  .flow-tile:nth-child(3) {
  animation-delay: 2.8s;
  transition-delay: 2.32s;
}

.mockup-code:is(.is-flow-active, :has(.flow-doc-tile:hover))
  .flow-ui-frameworks
  .flow-tile:nth-child(4) {
  animation-delay: 2.94s;
  transition-delay: 2.44s;
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

@keyframes connector-line-draw {
  0% {
    opacity: 0;
    stroke-dashoffset: 1;
  }

  22% {
    opacity: calc(var(--connector-active-opacity) * 0.72);
  }

  100% {
    opacity: var(--connector-active-opacity);
    stroke-dashoffset: 0;
  }
}

@keyframes connector-sheen {
  0% {
    opacity: 0;
    stroke-dashoffset: 1.18;
  }

  20%,
  78% {
    opacity: 0.52;
  }

  100% {
    opacity: 0;
    stroke-dashoffset: -0.2;
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
    --tile-x: -88px;
    --tile-y: -118px;
  }

  .flow-ui-frameworks .flow-tile:nth-child(2) {
    --tile-x: -29px;
    --tile-y: -164px;
  }

  .flow-ui-frameworks .flow-tile:nth-child(3) {
    --tile-x: 29px;
    --tile-y: -164px;
  }

  .flow-ui-frameworks .flow-tile:nth-child(4) {
    --tile-x: 88px;
    --tile-y: -118px;
  }

  .flow-doc-frameworks .flow-tile:nth-child(1) {
    --tile-x: -88px;
    --tile-y: 118px;
  }

  .flow-doc-frameworks .flow-tile:nth-child(2) {
    --tile-x: -29px;
    --tile-y: 164px;
  }

  .flow-doc-frameworks .flow-tile:nth-child(3) {
    --tile-x: 29px;
    --tile-y: 164px;
  }

  .flow-doc-frameworks .flow-tile:nth-child(4) {
    --tile-x: 88px;
    --tile-y: 118px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .flow-tile::before,
  .flow-tile,
  .flow-islands,
  .tile-connector-segment {
    animation: none;
  }
}
</style>
