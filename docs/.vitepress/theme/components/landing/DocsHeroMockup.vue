<script setup lang="ts">
import { useData, useRoute } from 'vitepress';
import { computed, ref } from 'vue';
import NavBarLogo from '../NavBarLogo.vue';
import docusaurusLogo from './framework-logos/docusaurus.svg';
import nextraLogo from './framework-logos/nextra.svg';
import reactLogo from './framework-logos/react.svg';
import rspressLogo from './framework-logos/rspress.svg';
import solidLogo from './framework-logos/solid.svg';
import svelteLogo from './framework-logos/svelte.svg';
import vitepressLogo from './framework-logos/vitepress.svg';
import vueLogo from './framework-logos/vue.svg';

const { lang } = useData();
const route = useRoute();
const isZh = computed(
  () => route.path.includes('/zh/') || lang.value.startsWith('zh'),
);

const copy = computed(() =>
  isZh.value
    ? {
        title: '框架连接',
        diagramLabel: '文档框架的原生 UI 支持与 Docs Islands 跨框架桥接',
        uiLayer: 'UI 框架',
        uiNote: '各自的运行时',
        bridgeLayer: '桥接层',
        bridgeNote: '统一 islands 边界',
        docsLayer: '文档框架',
        docsNote: '内容、路由与构建',
        bridgeDetail: 'SSR · 按需水合',
        available: '已支持',
        native: '默认支持',
        nativeNote: 'VitePress 默认支持 Vue；React 由 Docs Islands 桥接。',
        planned: '规划中',
        current: '当前支持',
        preview: '规划示意',
        hint: '悬停、聚焦或轻触，查看连接',
        previewAction: '查看连接',
      }
    : {
        title: 'Framework connections',
        diagramLabel:
          'Native UI support and cross-framework connections through Docs Islands',
        uiLayer: 'UI frameworks',
        uiNote: 'Their own runtimes',
        bridgeLayer: 'The bridge',
        bridgeNote: 'One islands boundary',
        docsLayer: 'Docs frameworks',
        docsNote: 'Content, routes, builds',
        bridgeDetail: 'SSR · on-demand hydration',
        available: 'Available',
        native: 'Built in',
        nativeNote: 'VitePress includes Vue; Docs Islands bridges React.',
        planned: 'Planned',
        current: 'Available today',
        preview: 'Planned integration',
        hint: 'Hover, focus, or tap to explore',
        previewAction: 'Preview connection',
      },
);

// VitePress provides Vue natively; Docs Islands currently bridges React.
// Dashed routes illustrate the direction described in .agents/docs/intent.md.
const uiFrameworks = [
  { name: 'React', logo: reactLogo, available: true, native: false },
  { name: 'Vue', logo: vueLogo, available: true, native: true },
  { name: 'Svelte', logo: svelteLogo, available: false, native: false },
  { name: 'Solid', logo: solidLogo, available: false, native: false },
];
const bridgeUiFrameworks = uiFrameworks
  .map((framework, index) => ({ ...framework, index }))
  .filter((framework) => !framework.native);
const docsFrameworks = [
  { name: 'VitePress', logo: vitepressLogo, available: true },
  { name: 'Docusaurus', logo: docusaurusLogo, available: false },
  { name: 'Nextra', logo: nextraLogo, available: false },
  { name: 'Rspress', logo: rspressLogo, available: false },
];

const hoveredFramework = ref<string | null>(null);
const focusedFramework = ref<string | null>(null);
const selectedFramework = ref<string | null>(null);
const activeFramework = computed(
  () =>
    hoveredFramework.value ?? focusedFramework.value ?? selectedFramework.value,
);
const isActive = computed(() => activeFramework.value !== null);
const isNativeActive = computed(() => activeFramework.value === 'VitePress');
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
const focusFramework = (framework: string) => {
  hoveredFramework.value = null;
  focusedFramework.value = framework;
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
  const startY =
    activeFramework.value === docsFrameworks[index].name ? 222 : 224;
  const corner = startY - 220;
  return `M ${x} ${startY} Q ${x} 220 ${x < 320 ? x + corner : x - corner} 220 H ${x < 320 ? 316 : 324} Q 320 220 320 216 V 186`;
};
const uiPath = (index: number) => {
  const x = connectorPositions[index];
  const endY =
    isActive.value && (isPlanned.value || uiFrameworks[index].available)
      ? 89
      : 92;
  return `M 320 130 V 102 Q 320 96 ${x < 320 ? 314 : 326} 96 H ${x < 320 ? x + 4 : x - 4} Q ${x} 96 ${x} 92 V ${endY}`;
};
const nativePath = computed(() => {
  const startY = isNativeActive.value ? 222 : 224;
  const endY = isNativeActive.value ? 89 : 92;
  const corner = startY - 220;
  return `M 80 ${startY} Q 80 220 ${80 - corner} 220 H -6 Q -12 220 -12 214 V 110 Q -12 104 -6 104 H 234 Q 240 104 240 98 V ${endY}`;
});
</script>

<template>
  <section class="docs-hero-mockup" :aria-label="copy.diagramLabel">
    <div class="mockup-heading">
      <h2>{{ copy.title }}</h2>
      <p class="interaction-hint">{{ copy.hint }}</p>
    </div>

    <div
      class="flow-scene"
      :class="{ 'is-flow-active': isActive, 'is-planned-flow': isPlanned }"
      @keydown.esc="clearPreview"
    >
      <svg
        class="flow-connectors"
        viewBox="0 0 640 304"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <g
          v-for="framework in bridgeUiFrameworks"
          :key="framework.name"
          class="connection-ui flow-connection"
          :class="{
            'is-available': framework.available,
            'is-connected': isActive && (isPlanned || framework.available),
          }"
        >
          <path class="connection-track" :d="uiPath(framework.index)" />
          <path
            class="connection-signal"
            :d="uiPath(framework.index)"
            pathLength="1"
          />
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
        <g
          class="connection-native flow-connection is-available"
          :class="{ 'is-connected': isNativeActive }"
        >
          <path class="native-clearance" :d="nativePath" />
          <path class="connection-track" :d="nativePath" />
          <path class="connection-signal" :d="nativePath" pathLength="1" />
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
              'is-native': framework.native,
              'is-responding': framework.native
                ? isNativeActive
                : isActive && (isPlanned || framework.available),
            }"
          >
            <span class="framework-mark" aria-hidden="true">
              <img :src="framework.logo" width="22" height="22" alt="" />
            </span>
            <strong>{{ framework.name }}</strong>
            <small>{{
              framework.native
                ? copy.native
                : framework.available
                  ? copy.available
                  : copy.planned
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
            <NavBarLogo class="bridge-mark" :active="isActive" />
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
            @focus="focusFramework(framework.name)"
            @blur="focusedFramework = null"
            @click="selectedFramework = framework.name"
          >
            <span class="framework-mark" aria-hidden="true">
              <img
                :src="framework.logo"
                :class="{ 'nextra-mark': framework.name === 'Nextra' }"
                width="22"
                height="22"
                alt=""
              />
            </span>
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
    <p class="native-support-note">{{ copy.nativeNote }}</p>
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
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 4px 16px;
}

.mockup-heading h2 {
  margin: 0;
  color: var(--flow-strong);
  font-family: var(--vp-font-family-base);
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1.5;
}

.flow-scene {
  position: relative;
  height: 304px;
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

.native-clearance {
  fill: none;
  stroke: var(--docs-home-surface);
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 5;
  vector-effect: non-scaling-stroke;
}

.connection-native .connection-track {
  stroke: color-mix(in srgb, var(--docs-home-success) 48%, var(--flow-line));
}

.connection-native.is-connected .connection-track,
.connection-native .connection-signal {
  stroke: var(--docs-home-success);
}

.is-planned-flow .is-available .connection-track {
  stroke-dasharray: 3 6;
}

.is-planned-flow .connection-native .connection-track {
  stroke-dasharray: none;
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
  top: 24px;
}

.layer-bridge {
  top: 130px;
}

.layer-docs {
  top: 224px;
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
  height: 68px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 6px 5px;
  border: 1px solid color-mix(in srgb, var(--flow-line) 65%, transparent);
  border-radius: 10px;
  background: var(--docs-home-surface);
  color: var(--flow-muted);
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
  height: 22px;
  place-items: center;
}

.framework-mark img {
  width: 22px;
  height: 22px;
  object-fit: contain;
}

:global(.dark .docs-hero-mockup .nextra-mark) {
  filter: invert(1);
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

.ui-tile.is-native {
  border-color: color-mix(
    in srgb,
    var(--docs-home-success) 30%,
    var(--flow-line)
  );
}

.ui-tile.is-native small {
  color: var(--docs-home-success);
}

.ui-tile.is-native.is-responding {
  border-color: var(--docs-home-success);
  color: var(--docs-home-success);
  box-shadow: 0 0 22px
    color-mix(in srgb, var(--docs-home-success) 12%, transparent);
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
  height: 56px;
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
  width: 32px;
  height: 32px;
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
  min-height: 36px;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 12px;
  padding-top: 12px;
  border-top: 1px solid var(--docs-home-border);
}

.flow-caption {
  display: flex;
  min-width: 0;
  flex: 1 1 160px;
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

.native-support-note {
  margin: 8px 0 0;
  color: var(--flow-muted);
  font-size: 11px;
  line-height: 1.6;
}

.interaction-hint {
  margin: 0;
  color: var(--flow-muted);
  font-size: 11px;
  line-height: 1.5;
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

  .flow-scene {
    margin-top: 18px;
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
    font-size: 9px;
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
