<script setup lang="ts">
import { useData, useRoute } from 'vitepress';
import { computed, ref } from 'vue';

const { lang } = useData();
const route = useRoute();
const isZh = computed(
  () => route.path.includes('/zh/') || lang.value.startsWith('zh'),
);

const copy = computed(() =>
  isZh.value
    ? {
        eyebrow: '跨框架，清晰的边界',
        title: '你的文档，你的 UI。',
        intro: '连接文档框架与 UI 运行时，让内容保持静态，让交互成为孤岛。',
        diagramLabel: '文档框架通过 Docs Islands 桥接 UI 框架',
        uiLayer: 'UI 框架',
        uiNote: '各自的运行时',
        bridgeLayer: '桥接层',
        bridgeNote: '统一 islands 边界',
        docsLayer: '文档框架',
        docsNote: '内容、路由与构建',
        bridgeDetail: 'SSR · 按需水合',
        available: '已支持',
        planned: '规划中',
        current: '当前支持',
        preview: '规划示意',
        hint: '悬停、聚焦或轻触文档框架，查看连接',
        previewAction: '查看连接',
      }
    : {
        eyebrow: 'Cross-framework, clear boundaries',
        title: 'Your docs. Your UI.',
        intro:
          'A bridge from documentation to UI runtimes. Content stays static. Interaction becomes an island.',
        diagramLabel:
          'Documentation frameworks connect to UI frameworks through Docs Islands',
        uiLayer: 'UI frameworks',
        uiNote: 'Their own runtimes',
        bridgeLayer: 'The bridge',
        bridgeNote: 'One islands boundary',
        docsLayer: 'Docs frameworks',
        docsNote: 'Content, routes, builds',
        bridgeDetail: 'SSR · on-demand hydration',
        available: 'Available',
        planned: 'Planned',
        current: 'Available today',
        preview: 'Planned integration',
        hint: 'Hover, focus, or tap a docs framework to follow the connection',
        previewAction: 'Preview connection',
      },
);

// Only VitePress + React ships today. Dashed routes illustrate the direction
// described in .agents/docs/intent.md, rather than claiming adapter support.
const uiFrameworks = [
  { name: 'React', mark: 'R', available: true },
  { name: 'Vue', mark: 'V', available: false },
  { name: 'Svelte', mark: 'Sv', available: false },
  { name: 'Solid', mark: 'So', available: false },
];
const docsFrameworks = [
  { name: 'VitePress', mark: 'VP', available: true },
  { name: 'Docusaurus', mark: 'D', available: false },
  { name: 'Nextra', mark: 'N', available: false },
  { name: 'Astro', mark: 'A', available: false },
];

const hoveredFramework = ref<string | null>(null);
const focusedFramework = ref<string | null>(null);
const selectedFramework = ref<string | null>(null);
const activeFramework = computed(
  () =>
    hoveredFramework.value ?? focusedFramework.value ?? selectedFramework.value,
);
const isActive = computed(() => activeFramework.value !== null);
const isPlanned = computed(
  () => isActive.value && activeFramework.value !== 'VitePress',
);
const activePath = computed(() =>
  isActive.value
    ? `${activeFramework.value} → Docs Islands → ${isPlanned.value ? copy.value.uiLayer : 'React'}`
    : 'VitePress + React',
);

const enterFramework = (event: PointerEvent, framework: string) => {
  if (event.pointerType !== 'touch') hoveredFramework.value = framework;
};
const leaveFramework = () => {
  hoveredFramework.value = null;
};
const clearPreview = () => {
  hoveredFramework.value = null;
  focusedFramework.value = null;
  selectedFramework.value = null;
};

const connectorPositions = [80, 240, 400, 560];
const docsPath = (index: number) => {
  const x = connectorPositions[index];
  return `M ${x} 304 V 285 Q ${x} 275 ${x < 320 ? x + 10 : x - 10} 275 H ${x < 320 ? 310 : 330} Q 320 275 320 265 V 248`;
};
const uiPath = (index: number) => {
  const x = connectorPositions[index];
  return `M 320 172 V 158 Q 320 148 ${x < 320 ? 310 : 330} 148 H ${x < 320 ? x + 10 : x - 10} Q ${x} 148 ${x} 138 V 124`;
};
</script>

<template>
  <section class="docs-hero-mockup" :aria-label="copy.diagramLabel">
    <div class="mockup-heading">
      <p class="mockup-eyebrow">{{ copy.eyebrow }}</p>
      <h2>{{ copy.title }}</h2>
      <p class="mockup-intro">{{ copy.intro }}</p>
    </div>

    <div
      class="flow-scene"
      :class="{ 'is-flow-active': isActive, 'is-planned-flow': isPlanned }"
      @keydown.esc="clearPreview"
    >
      <svg
        class="flow-connectors"
        viewBox="0 0 640 410"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <g
          v-for="(framework, index) in uiFrameworks"
          :key="framework.name"
          class="connection-ui flow-connection"
          :class="{
            'is-available': framework.available,
            'is-connected': isActive && (isPlanned || framework.available),
          }"
        >
          <path class="connection-track" :d="uiPath(index)" />
          <path class="connection-signal" :d="uiPath(index)" pathLength="1" />
        </g>
        <g
          v-for="(framework, index) in docsFrameworks"
          :key="framework.name"
          class="connection-docs flow-connection"
          :class="{
            'is-available': framework.available,
            'is-connected': activeFramework === framework.name,
          }"
        >
          <path class="connection-track" :d="docsPath(index)" />
          <path class="connection-signal" :d="docsPath(index)" pathLength="1" />
        </g>
      </svg>

      <div class="flow-layer layer-ui">
        <div class="layer-label">
          <span class="layer-number" aria-hidden="true">03</span>
          <div>
            <h3>{{ copy.uiLayer }}</h3>
            <p>{{ copy.uiNote }}</p>
          </div>
        </div>
        <ul class="framework-rail">
          <li
            v-for="framework in uiFrameworks"
            :key="framework.name"
            class="framework-tile ui-tile"
            :class="{
              'is-available': framework.available,
              'is-responding': isActive && (isPlanned || framework.available),
            }"
          >
            <span class="framework-mark" aria-hidden="true">
              <svg
                v-if="framework.name === 'React'"
                viewBox="0 0 32 32"
                fill="none"
              >
                <g stroke="currentColor" stroke-width="1.4">
                  <ellipse cx="16" cy="16" rx="14" ry="5.5" />
                  <ellipse
                    cx="16"
                    cy="16"
                    rx="14"
                    ry="5.5"
                    transform="rotate(60 16 16)"
                  />
                  <ellipse
                    cx="16"
                    cy="16"
                    rx="14"
                    ry="5.5"
                    transform="rotate(120 16 16)"
                  />
                </g>
                <circle cx="16" cy="16" r="2.6" fill="currentColor" />
              </svg>
              <svg
                v-else-if="framework.name === 'Vue'"
                viewBox="0 0 32 32"
                fill="none"
              >
                <path
                  d="M3 7 L16 28 L29 7 M10 7 L16 17 L22 7"
                  stroke="currentColor"
                  stroke-width="3"
                />
              </svg>
              <span v-else>{{ framework.mark }}</span>
            </span>
            <strong>{{ framework.name }}</strong>
            <small>{{
              framework.available ? copy.available : copy.planned
            }}</small>
          </li>
        </ul>
      </div>

      <div class="flow-layer layer-bridge">
        <div class="layer-label">
          <span class="layer-number" aria-hidden="true">02</span>
          <div>
            <h3>{{ copy.bridgeLayer }}</h3>
            <p>{{ copy.bridgeNote }}</p>
          </div>
        </div>
        <div class="bridge-rail">
          <div class="bridge-card">
            <svg
              class="bridge-mark"
              viewBox="0 0 40 40"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M4 26 L20 34 L36 26 M4 19 L20 27 L36 19 M4 12 L20 4 L36 12 L20 20 Z"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linejoin="round"
              />
              <path
                d="M20 10 V15 M17.5 12.5 H22.5"
                stroke="currentColor"
                stroke-width="1.5"
              />
            </svg>
            <div>
              <strong>docs-islands</strong>
              <span>{{ copy.bridgeDetail }}</span>
            </div>
            <span class="bridge-light" aria-hidden="true"></span>
          </div>
        </div>
      </div>

      <div class="flow-layer layer-docs">
        <div class="layer-label">
          <span class="layer-number" aria-hidden="true">01</span>
          <div>
            <h3>{{ copy.docsLayer }}</h3>
            <p>{{ copy.docsNote }}</p>
          </div>
        </div>
        <div class="framework-rail">
          <button
            v-for="framework in docsFrameworks"
            :key="framework.name"
            type="button"
            class="docs-tile framework-tile"
            :class="{
              'is-available': framework.available,
              'is-selected': activeFramework === framework.name,
            }"
            :aria-label="`${copy.previewAction}: ${framework.name} · ${framework.available ? copy.available : copy.planned}`"
            @pointerenter="enterFramework($event, framework.name)"
            @pointerleave="leaveFramework"
            @pointercancel="leaveFramework"
            @focus="focusedFramework = framework.name"
            @blur="focusedFramework = null"
            @click="selectedFramework = framework.name"
          >
            <span class="framework-mark" aria-hidden="true">{{
              framework.mark
            }}</span>
            <strong>{{ framework.name }}</strong>
            <small>{{
              framework.available ? copy.available : copy.planned
            }}</small>
          </button>
        </div>
      </div>
    </div>

    <div class="mockup-footer">
      <p
        class="flow-caption"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <span
          class="caption-dot"
          :class="{ 'is-planned': isPlanned }"
          aria-hidden="true"
        ></span>
        <span
          >{{ isPlanned ? copy.preview : copy.current
          }}<strong>{{ activePath }}</strong></span
        >
      </p>
      <div class="flow-legend" aria-hidden="true">
        <span
          ><i class="available-line legend-line"></i>{{ copy.available }}</span
        >
        <span><i class="legend-line"></i>{{ copy.planned }}</span>
      </div>
    </div>
    <p class="interaction-hint">{{ copy.hint }}</p>
  </section>
</template>

<style scoped>
.docs-hero-mockup {
  --flow-accent: var(--docs-home-hero-title-accent);
  --flow-strong: var(--docs-home-hero-title);
  --flow-muted: var(--vp-c-text-2);
  --flow-line: var(--docs-home-border-hover);
  position: relative;
  border: 1px solid var(--docs-home-border);
  border-radius: 16px;
  background: var(--docs-home-surface);
  box-shadow: 0 12px 44px
    color-mix(in srgb, var(--docs-home-primary) 6%, transparent);
  padding: 32px 36px 20px;
  text-align: left;
}

.mockup-heading {
  max-width: 650px;
}

.mockup-eyebrow {
  margin: 0 0 14px;
  color: var(--docs-home-accent-strong);
  font-family: var(--docs-home-font-mono);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  line-height: 1.5;
  text-transform: uppercase;
}

.mockup-heading h2 {
  margin: 0;
  color: var(--flow-strong);
  font-family: var(--docs-home-font-serif);
  font-size: 34px;
  font-style: italic;
  font-weight: 400;
  line-height: 1.2;
}

.mockup-intro {
  max-width: 560px;
  margin: 12px 0 0;
  color: var(--flow-muted);
  font-size: 14px;
  line-height: 1.7;
}

.flow-scene {
  position: relative;
  height: 410px;
  margin-top: 14px;
  user-select: none;
}

.flow-scene::before {
  position: absolute;
  inset: 0 0 0 144px;
  background-image: radial-gradient(
    var(--docs-home-border-hover) 0.7px,
    transparent 0.7px
  );
  background-size: 20px 20px;
  content: '';
  mask-image: radial-gradient(ellipse at center, #000, transparent 70%);
  opacity: 0.6;
  pointer-events: none;
}

.flow-connectors {
  position: absolute;
  top: 0;
  left: 144px;
  width: calc(100% - 144px);
  height: 100%;
  overflow: visible;
  pointer-events: none;
}

.connection-track,
.connection-signal {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}

.connection-track {
  stroke: var(--flow-line);
  stroke-dasharray: 3 6;
  stroke-width: 1;
  transition: stroke 180ms ease;
}

.is-available .connection-track {
  stroke: color-mix(in srgb, var(--flow-accent) 48%, var(--flow-line));
  stroke-dasharray: none;
}

.connection-signal {
  stroke: var(--flow-accent);
  stroke-dasharray: 0.18 0.82;
  stroke-dashoffset: 0.18;
  stroke-width: 2;
  opacity: 0;
}

.is-connected .connection-track {
  stroke: var(--flow-accent);
}

.is-connected .connection-signal {
  animation: signal-travel 520ms ease-out both;
}

.connection-ui.is-connected .connection-track {
  transition-delay: 280ms;
}

.connection-ui.is-connected .connection-signal {
  animation-delay: 280ms;
}

.is-planned-flow .is-available .connection-track {
  stroke-dasharray: 3 6;
}

.is-planned-flow .connection-signal {
  opacity: 0.55;
}

.flow-layer {
  position: absolute;
  left: 0;
  right: 0;
  display: grid;
  grid-template-columns: 144px minmax(0, 1fr);
  align-items: center;
}

.layer-ui {
  top: 38px;
}

.layer-bridge {
  top: 172px;
}

.layer-docs {
  top: 304px;
}

.layer-label {
  display: flex;
  align-items: flex-start;
  gap: 9px;
}

.layer-number {
  color: var(--docs-home-accent-strong);
  font-family: var(--docs-home-font-mono);
  font-size: 10px;
  line-height: 20px;
}

.layer-label h3 {
  margin: 0;
  color: var(--vp-c-text-1);
  font-size: 12px;
  font-weight: 600;
  line-height: 20px;
}

.layer-label p {
  margin: 3px 0 0;
  color: var(--flow-muted);
  font-size: 10px;
  line-height: 1.5;
}

.framework-rail {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  justify-items: center;
  margin: 0;
  padding: 0;
  list-style: none;
}

.framework-tile {
  position: relative;
  display: flex;
  width: calc(100% - 14px);
  max-width: 122px;
  min-width: 0;
  height: 86px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 5px;
  border: 1px dashed var(--flow-line);
  border-radius: 10px;
  background: var(--docs-home-surface);
  color: var(--flow-muted);
  box-shadow: 0 3px 8px
    color-mix(in srgb, var(--docs-home-primary) 3%, transparent);
  transition:
    border-color 180ms ease,
    color 180ms ease,
    background-color 180ms ease,
    box-shadow 220ms ease,
    transform 220ms ease;
}

.framework-tile.is-available {
  border-style: solid;
  border-color: color-mix(in srgb, var(--flow-accent) 30%, var(--flow-line));
  color: var(--flow-strong);
  background: color-mix(
    in srgb,
    var(--flow-accent) 3%,
    var(--docs-home-surface)
  );
}

.framework-mark {
  display: grid;
  height: 24px;
  place-items: center;
  color: inherit;
  font-family: var(--docs-home-font-mono);
  font-size: 17px;
  font-weight: 600;
  line-height: 1;
}

.framework-mark svg {
  width: 28px;
  height: 28px;
}

.framework-tile strong {
  max-width: 100%;
  color: inherit;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.2;
}

.framework-tile small {
  color: var(--flow-muted);
  font-size: 9px;
  line-height: 1;
}

.framework-tile.is-available small {
  color: var(--docs-home-accent-strong);
}

.ui-tile.is-responding {
  border-color: var(--flow-accent);
  color: var(--flow-accent);
  box-shadow: 0 0 22px color-mix(in srgb, var(--flow-accent) 12%, transparent);
  transform: translateY(-3px);
  transition-delay: 420ms;
}

.docs-tile {
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
}

.docs-tile.is-selected {
  border-color: var(--flow-accent);
  color: var(--flow-strong);
  background: color-mix(
    in srgb,
    var(--flow-accent) 7%,
    var(--docs-home-surface)
  );
  box-shadow: 0 4px 16px color-mix(in srgb, var(--flow-accent) 12%, transparent);
  transform: translateY(-2px);
}

.docs-tile:focus-visible {
  outline: 2px solid var(--flow-accent);
  outline-offset: 4px;
}

.bridge-rail {
  position: relative;
  display: grid;
  place-items: center;
}

.bridge-rail::before {
  position: absolute;
  inset: -13px 8px;
  border: 1px solid color-mix(in srgb, var(--flow-accent) 10%, transparent);
  border-radius: 14px;
  background: linear-gradient(
    90deg,
    transparent,
    color-mix(in srgb, var(--flow-accent) 4%, transparent),
    transparent
  );
  content: '';
  pointer-events: none;
}

.bridge-card {
  position: relative;
  display: flex;
  width: min(248px, 100%);
  height: 76px;
  align-items: center;
  justify-content: center;
  gap: 12px;
  border: 1px solid color-mix(in srgb, var(--flow-accent) 38%, var(--flow-line));
  border-radius: 12px;
  background: var(--docs-home-surface);
  color: var(--flow-strong);
  box-shadow:
    0 6px 18px color-mix(in srgb, var(--flow-accent) 6%, transparent),
    0 3px 0 color-mix(in srgb, var(--flow-accent) 12%, var(--docs-home-surface));
  transition:
    border-color 200ms ease,
    background-color 200ms ease,
    box-shadow 220ms ease;
}

.bridge-mark {
  flex: 0 0 auto;
  width: 36px;
  height: 36px;
  color: var(--flow-accent);
}

.bridge-card strong {
  display: block;
  font-family: var(--docs-home-font-mono);
  font-size: 16px;
  font-weight: 600;
  line-height: 1.4;
}

.bridge-card span {
  display: block;
  margin-top: 4px;
  color: var(--flow-muted);
  font-size: 10px;
  line-height: 1.5;
}

.bridge-card .bridge-light {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 5px;
  height: 5px;
  margin: 0;
  border-radius: 50%;
  background: var(--flow-line);
  transition:
    background-color 180ms ease,
    box-shadow 180ms ease;
}

.is-flow-active .bridge-card {
  border-color: var(--flow-accent);
  background: color-mix(
    in srgb,
    var(--flow-accent) 5%,
    var(--docs-home-surface)
  );
  box-shadow:
    0 0 28px color-mix(in srgb, var(--flow-accent) 12%, transparent),
    0 3px 0 color-mix(in srgb, var(--flow-accent) 28%, var(--docs-home-surface));
  transition-delay: 160ms;
}

.is-flow-active .bridge-light {
  background: var(--flow-accent);
  box-shadow: 0 0 8px var(--flow-accent);
  transition-delay: 160ms;
}

.mockup-footer {
  display: flex;
  min-height: 48px;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--docs-home-border);
}

.flow-caption {
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 0;
  color: var(--flow-muted);
  font-size: 10px;
  line-height: 1.5;
}

.flow-caption strong {
  display: block;
  color: var(--flow-strong);
  font-family: var(--docs-home-font-mono);
  font-size: 11px;
  font-weight: 500;
  line-height: 1.6;
}

.caption-dot {
  flex: 0 0 auto;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--docs-home-success);
}

.caption-dot.is-planned {
  background: var(--docs-home-accent);
}

.flow-legend,
.flow-legend > span {
  display: flex;
  align-items: center;
  gap: 7px;
}

.flow-legend {
  flex: 0 0 auto;
  gap: 14px;
  color: var(--flow-muted);
  font-size: 10px;
}

.legend-line {
  display: block;
  width: 18px;
  border-top: 1px dashed var(--flow-line);
}

.available-line {
  border-top-style: solid;
  border-top-color: var(--flow-accent);
}

.interaction-hint {
  margin: 12px 0 0;
  color: var(--flow-muted);
  font-size: 10px;
  line-height: 1.6;
}

@keyframes signal-travel {
  0% {
    stroke-dashoffset: 0.18;
    opacity: 0;
  }
  15% {
    opacity: 0.9;
  }
  85% {
    opacity: 0.9;
  }
  100% {
    stroke-dashoffset: -1;
    opacity: 0;
  }
}

@media (max-width: 680px) {
  .docs-hero-mockup {
    padding: 24px 20px 18px;
  }

  .mockup-heading h2 {
    font-size: 28px;
  }

  .mockup-intro {
    font-size: 12px;
  }

  .flow-scene {
    margin-top: 30px;
  }

  .flow-scene::before,
  .flow-connectors {
    left: 0;
    width: 100%;
  }

  .flow-layer {
    grid-template-columns: minmax(0, 1fr);
  }

  .layer-label {
    position: absolute;
    top: -27px;
    left: 0;
    align-items: center;
  }

  .layer-label p {
    display: none;
  }

  .layer-label h3 {
    font-size: 11px;
  }

  .framework-tile {
    width: calc(100% - 4px);
    padding-inline: 0;
  }

  .framework-tile strong {
    font-size: clamp(9px, 2.5vw, 12px);
  }

  .framework-tile small {
    font-size: 8px;
  }

  .mockup-footer {
    align-items: flex-start;
    flex-direction: column;
    gap: 10px;
  }

  .flow-legend {
    gap: 14px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .flow-scene .framework-tile,
  .flow-scene .bridge-card,
  .flow-scene .bridge-light,
  .flow-scene .connection-track,
  .flow-scene .connection-signal {
    animation: none;
    transition: none;
  }

  .ui-tile.is-responding,
  .docs-tile.is-selected {
    transform: none;
  }

  .connection-signal {
    display: none;
  }
}
</style>
