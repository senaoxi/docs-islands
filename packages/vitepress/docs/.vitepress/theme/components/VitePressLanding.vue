<script setup lang="ts">
import { withBase } from 'vitepress';
import { computed, onBeforeUnmount, ref } from 'vue';
import {
  getIntegrationSnippets,
  integrationInstall,
} from '../../../components/react/integration-walkthrough-source';

const props = defineProps<{ locale: 'en' | 'zh' }>();
const chinese = computed(() => props.locale === 'zh');
const copy = computed(() =>
  chinese.value
    ? {
        headline: ['文档里的交互，', '交给 React。'],
        introduction:
          '让 VitePress 继续负责页面，在需要交互的示例里加入 React 组件。每个小岛都能独立选择渲染和接管时机。',
        guide: '开始接入',
        examples: '查看真实示例',
        api: '配置与诊断',
        support: '当前支持 VitePress + React 18',
        modelTitle: '交互留在组件边界。',
        modelDescription:
          'VitePress 负责 Markdown、主题和页面路由。适配层生成组件容器；你决定哪些容器需要客户端交互。',
        modelLink: '了解渲染原理',
        default: '默认',
        strategies: [
          '构建时输出 HTML，客户端不接管。',
          '构建时输出 HTML，页面加载后接管。',
          '构建时输出 HTML，进入视口时接管。',
          '在浏览器中渲染，不预生成组件 HTML。',
        ],
        setupTitle: '从一个组件开始。',
        setupDescription:
          '在现有 VitePress 站点安装依赖，接入构建插件与客户端，再把组件放进 Markdown。',
        install: '安装依赖',
        copy: '复制',
        copied: '已复制',
        copyFallback: '请选中代码并复制。',
        config: '配置',
        theme: '客户端',
        component: '组件',
        markdown: 'Markdown',
        prerequisite:
          '示例适用于 VitePress 1.6.4 与 React 18；Node.js 版本要求见完整指南。',
        completeGuide: '查看完整接入指南',
        workflowTitle: '保留熟悉的开发流程。',
        workflowDescription:
          '组件和 Markdown 继续放在同一个文档项目中。开发时走 VitePress 的更新流程，构建时产出静态页面与组件资源。',
        workflowItems: [
          [
            'React 与 Markdown 更新',
            'React HMR 和 Markdown 更新处理衔接在现有 VitePress 工作流中。',
          ],
          [
            '构建时预渲染',
            'SSR 在构建阶段完成；客户端是否接管，由组件的渲染指令决定。',
          ],
          [
            '按需使用 SPA 同步渲染',
            '需要组件更早随路由内容落地时，了解 spa:sync-render 的收益与资源加载代价。',
          ],
        ],
        nextTitle: '把第一个小岛放进文档。',
        nextDescription: '从完整指南开始，或通过示例对照不同渲染策略。',
      }
    : {
        headline: ['React interactions.', 'Inside VitePress.'],
        introduction:
          'Keep VitePress in charge of the page. Add React components where an example needs interaction, and choose rendering and hydration for each island.',
        guide: 'Get started',
        examples: 'Explore real examples',
        api: 'Configuration & diagnostics',
        support: 'Available: VitePress + React 18',
        modelTitle: 'Keep interaction at the component boundary.',
        modelDescription:
          'VitePress owns Markdown, themes, and page routing. The adapter emits component containers; you choose which ones need client interaction.',
        modelLink: 'Understand the rendering model',
        default: 'Default',
        strategies: [
          'Build-time HTML. No client takeover.',
          'Build-time HTML. Hydrate on page load.',
          'Build-time HTML. Hydrate when visible.',
          'Render in the browser, without prerendered component HTML.',
        ],
        setupTitle: 'Start with one component.',
        setupDescription:
          'Install in an existing VitePress site, register the build plugin and client runtime, then place a component in Markdown.',
        install: 'Install dependencies',
        copy: 'Copy',
        copied: 'Copied',
        copyFallback: 'Select the code to copy it.',
        config: 'Config',
        theme: 'Client',
        component: 'Component',
        markdown: 'Markdown',
        prerequisite:
          'For VitePress 1.6.4 and React 18. See the full guide for supported Node.js versions.',
        completeGuide: 'Read the complete setup guide',
        workflowTitle: 'Stay in the VitePress workflow.',
        workflowDescription:
          'Keep components and Markdown in one documentation project. Use the development update loop, then build static pages and component assets.',
        workflowItems: [
          [
            'React and Markdown updates',
            'React HMR and Markdown update handling join the existing VitePress workflow.',
          ],
          [
            'Prerender at build time',
            'SSR happens during the build. The component directive determines whether the client takes over.',
          ],
          [
            'Opt into SPA sync rendering',
            'Use spa:sync-render when a component should land earlier with route content, with its resource-loading trade-offs in mind.',
          ],
        ],
        nextTitle: 'Put your first island in the docs.',
        nextDescription:
          'Follow the complete guide, or compare rendering strategies in the examples.',
      },
);

const link = (path: string) => withBase(`${chinese.value ? '/zh' : ''}${path}`);
const install = integrationInstall;
const snippets = computed(() => {
  const { config, theme, component, markdown } = getIntegrationSnippets(
    props.locale,
  );
  return { config, theme, component, markdown };
});
type Tab = 'config' | 'theme' | 'component' | 'markdown';
const tabIds: Tab[] = ['config', 'theme', 'component', 'markdown'];
const selected = ref<Tab>('config');
const copyMessage = ref('');
let copyTimer: ReturnType<typeof globalThis.setTimeout> | undefined;

const copyCode = async (code: string) => {
  if (copyTimer !== undefined) globalThis.clearTimeout(copyTimer);
  try {
    await globalThis.window.navigator.clipboard.writeText(code);
    copyMessage.value = copy.value.copied;
  } catch {
    copyMessage.value = copy.value.copyFallback;
  }
  copyTimer = globalThis.setTimeout(() => {
    copyMessage.value = '';
  }, 2500);
};
const tabKeydown = (event: KeyboardEvent, index: number) => {
  let next: number;
  switch (event.key) {
    case 'ArrowRight': {
      next = (index + 1) % tabIds.length;
      break;
    }
    case 'ArrowLeft': {
      next = (index + tabIds.length - 1) % tabIds.length;
      break;
    }
    case 'Home': {
      next = 0;
      break;
    }
    case 'End': {
      next = tabIds.length - 1;
      break;
    }
    default: {
      return;
    }
  }
  event.preventDefault();
  const tab = tabIds[next];
  if (!tab) return;
  selected.value = tab;
  globalThis.document
    .querySelector<HTMLButtonElement>(`#vp-home-tab-${tab}`)
    ?.focus();
};

onBeforeUnmount(() => {
  if (copyTimer !== undefined) globalThis.clearTimeout(copyTimer);
});
</script>

<template>
  <div class="vitepress-landing">
    <section class="landing-hero" aria-labelledby="integration-title">
      <div class="hero-copy">
        <p class="eyebrow">
          <img
            :src="withBase('/logo.svg')"
            alt="Docs Islands for VitePress"
            width="28"
            height="28"
          />@docs-islands/vitepress
        </p>
        <h1 id="integration-title">
          <span>{{ copy.headline[0] }}</span
          ><span class="accent">{{ copy.headline[1] }}</span>
        </h1>
        <p class="introduction">{{ copy.introduction }}</p>
        <div class="hero-actions">
          <a class="button primary" :href="link('/guide/getting-started')"
            >{{ copy.guide }} <span aria-hidden="true">→</span></a
          ><a class="text-link" :href="link('/guide/how-it-works')"
            >{{ copy.examples }} <span aria-hidden="true">↗</span></a
          >
        </div>
        <p class="support"><span aria-hidden="true" />{{ copy.support }}</p>
      </div>
      <section
        class="walkthrough-section"
        :aria-label="
          chinese ? 'React 集成演示' : 'React integration walkthrough'
        "
      >
        <slot name="walkthrough" />
      </section>
    </section>

    <section class="model-section" aria-labelledby="model-title">
      <div class="section-intro">
        <p class="section-number">
          01 / {{ chinese ? '渲染边界' : 'THE RENDERING MODEL' }}
        </p>
        <h2 id="model-title">{{ copy.modelTitle }}</h2>
        <p>{{ copy.modelDescription }}</p>
        <a class="text-link" :href="link('/guide/how-it-works')"
          >{{ copy.modelLink }} <span aria-hidden="true">→</span></a
        >
      </div>
      <dl class="strategies">
        <div
          v-for="(directive, index) in [
            'ssr:only',
            'client:load',
            'client:visible',
            'client:only',
          ]"
          :key="directive"
        >
          <dt>
            <code>{{ directive }}</code
            ><span v-if="index === 0">{{ copy.default }}</span>
          </dt>
          <dd>{{ copy.strategies[index] }}</dd>
        </div>
      </dl>
    </section>

    <section class="setup-section" aria-labelledby="setup-title">
      <div class="setup-heading">
        <div>
          <p class="section-number">
            02 / {{ chinese ? '开始接入' : 'SETUP' }}
          </p>
          <h2 id="setup-title">{{ copy.setupTitle }}</h2>
        </div>
        <p>{{ copy.setupDescription }}</p>
      </div>
      <div class="install-command">
        <div>
          <span>{{ copy.install }}</span
          ><button type="button" @click="copyCode(install)">
            {{ copy.copy }}
          </button>
        </div>
        <pre tabindex="0"><code>{{ install }}</code></pre>
      </div>
      <div class="code-workbench">
        <div class="code-tabs" role="tablist" :aria-label="copy.setupTitle">
          <button
            v-for="(tab, index) in tabIds"
            :id="`vp-home-tab-${tab}`"
            :key="tab"
            role="tab"
            type="button"
            :aria-selected="selected === tab"
            :aria-controls="`vp-home-panel-${tab}`"
            :tabindex="selected === tab ? 0 : -1"
            @click="selected = tab"
            @keydown="tabKeydown($event, index)"
          >
            <span>{{ String(index + 1).padStart(2, '0') }}</span
            >{{ copy[tab] }}
          </button>
        </div>
        <div
          v-for="tab in tabIds"
          v-show="selected === tab"
          :id="`vp-home-panel-${tab}`"
          :key="tab"
          class="code-panel"
          role="tabpanel"
          :aria-labelledby="`vp-home-tab-${tab}`"
          tabindex="0"
        >
          <div class="code-toolbar">
            <span>{{ snippets[tab].file }}</span>
            <div class="code-actions">
              <button type="button" @click="copyCode(snippets[tab].code)">
                {{ copy.copy }}
              </button>
            </div>
          </div>
          <div class="code-frame">
            <pre><code>{{ snippets[tab].code }}</code></pre>
          </div>
        </div>
      </div>
      <div class="setup-footer">
        <p>{{ copy.prerequisite }}</p>
        <a class="text-link" :href="link('/guide/getting-started')"
          >{{ copy.completeGuide }} <span aria-hidden="true">→</span></a
        >
      </div>
      <p class="copy-status" role="status" aria-live="polite">
        {{ copyMessage }}
      </p>
    </section>

    <section class="workflow-section" aria-labelledby="workflow-title">
      <div class="section-intro">
        <p class="section-number">
          03 / {{ chinese ? '开发与构建' : 'DEVELOPMENT & BUILD' }}
        </p>
        <h2 id="workflow-title">{{ copy.workflowTitle }}</h2>
        <p>{{ copy.workflowDescription }}</p>
      </div>
      <div class="workflow-list">
        <div v-for="item in copy.workflowItems" :key="item[0]">
          <h3>{{ item[0] }}</h3>
          <p>{{ item[1] }}</p>
        </div>
        <a class="text-link" :href="link('/options/logging')"
          >{{ copy.api }} <span aria-hidden="true">→</span></a
        >
      </div>
    </section>
    <section class="next-section" aria-labelledby="next-title">
      <div>
        <h2 id="next-title">{{ copy.nextTitle }}</h2>
        <p>{{ copy.nextDescription }}</p>
      </div>
      <a class="button primary" :href="link('/guide/getting-started')"
        >{{ copy.guide }} <span aria-hidden="true">→</span></a
      >
    </section>
  </div>
</template>

<style scoped>
.vitepress-landing {
  --landing-accent: #7051e8;
  --landing-soft: #f5f2ff;
  --landing-border: #e7e4ee;
  --landing-muted: #706b7b;
  --landing-ink: #211e2e;
  --landing-panel: #fbfaff;
  max-width: 1160px;
  margin: 0 auto;
  padding: 0 32px;
  color: var(--landing-ink);
}
:global(.dark .vitepress-landing) {
  --landing-accent: #c3b4ff;
  --landing-soft: #282237;
  --landing-border: #37313f;
  --landing-muted: #a5a0ad;
  --landing-ink: #ece9f2;
  --landing-panel: #222027;
}
:global(.VPHome) {
  margin-bottom: 64px;
}
h1,
h2,
h3,
p,
pre,
dl,
dd {
  margin: 0;
}
.landing-hero {
  display: grid;
  grid-template-columns: minmax(0, 490px) minmax(0, 1fr);
  align-items: center;
  gap: 64px;
  width: calc(50vw + 50% - 24px);
  padding-bottom: 56px;
}
.hero-copy,
.walkthrough-section {
  min-width: 0;
}
.walkthrough-section :deep(.walkthrough-heading) {
  display: none;
}
.walkthrough-section :deep(.walkthrough-route-shell) {
  padding-top: 0;
}
.walkthrough-section :deep(.walkthrough-terminal-code) {
  height: clamp(220px, 28vh, 320px);
}
.walkthrough-section :deep(.walkthrough-terminal-inner) {
  margin: 12px 20px 48px;
}
.eyebrow {
  display: flex;
  align-items: center;
  gap: 12px;
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
  color: var(--landing-muted);
  margin-bottom: 24px;
}
.eyebrow img {
  flex-shrink: 0;
}
h1 {
  font-size: clamp(36px, 4.2vw, 52px);
  font-weight: 600;
  line-height: 1.12;
  letter-spacing: -0.04em;
}
h1 span {
  display: block;
}
.accent {
  color: var(--landing-accent);
}
.introduction {
  max-width: 490px;
  font-size: 16px;
  line-height: 1.75;
  color: var(--landing-muted);
  margin-top: 24px;
}
.hero-actions {
  display: flex;
  align-items: center;
  gap: 24px;
  flex-wrap: wrap;
  margin-top: 28px;
}
.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
  min-height: 44px;
  border-radius: 8px;
  padding: 0 20px;
  font-size: 14px;
  font-weight: 600;
}
.primary {
  color: #fff;
  background: #7051e8;
}
.primary:hover {
  background: #6243d6;
}
.text-link {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--landing-accent);
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
}
.text-link:hover {
  text-decoration: underline;
  text-underline-offset: 4px;
}
.support {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 22px;
  color: var(--landing-muted);
  font-size: 12px;
}
.support > span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--landing-accent);
}
.model-section,
.workflow-section {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 96px;
  padding: 52px 0;
  border-top: 1px solid var(--landing-border);
}
.section-number {
  color: var(--landing-accent);
  font: 10px/1.5 var(--vp-font-family-mono);
  letter-spacing: 0.06em;
  margin-bottom: 16px;
}
h2 {
  font-size: 27px;
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: -0.025em;
}
.section-intro > p:not(.section-number),
.setup-heading > p {
  color: var(--landing-muted);
  font-size: 14px;
  line-height: 1.8;
  margin-top: 16px;
}
.section-intro > .text-link {
  margin-top: 22px;
}
.strategies {
  align-self: center;
}
.strategies > div {
  display: grid;
  grid-template-columns: 155px 1fr;
  align-items: start;
  gap: 20px;
  padding: 16px 0;
  border-bottom: 1px solid var(--landing-border);
}
.strategies > div:first-child {
  padding-top: 0;
}
.strategies > div:last-child {
  border-bottom: 0;
}
.strategies dt {
  display: flex;
  align-items: center;
  gap: 9px;
  font: 12px/1.6 var(--vp-font-family-mono);
}
.strategies dt span {
  padding: 1px 5px;
  background: var(--landing-soft);
  border-radius: 4px;
  color: var(--landing-accent);
  font: 9px/1.6 var(--vp-font-family-base);
}
.strategies dd {
  color: var(--landing-muted);
  font-size: 12px;
  line-height: 1.7;
}
.setup-section {
  border-top: 1px solid var(--landing-border);
  padding: 52px 0 26px;
}
.setup-heading {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 96px;
  align-items: end;
  margin-bottom: 28px;
}
.setup-heading > p {
  margin: 0;
}
.install-command {
  border: 1px solid var(--landing-border);
  border-radius: 10px;
  background: var(--landing-panel);
  padding: 18px 24px;
  margin-bottom: 16px;
}
.install-command > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  font-size: 11px;
  color: var(--landing-muted);
}
.install-command pre {
  font: 12px/1.9 var(--vp-font-family-mono);
  overflow-x: auto;
}
.install-command button,
.code-actions button {
  min-height: 28px;
  padding: 0 6px;
  border-radius: 4px;
  font-size: 11px;
  color: var(--landing-accent);
}
.code-workbench {
  overflow: hidden;
  border: 1px solid var(--landing-border);
  border-radius: 10px;
  background: var(--landing-panel);
}
.code-tabs {
  display: flex;
  gap: 6px;
  padding: 0 20px;
  border-bottom: 1px solid var(--landing-border);
}
.code-tabs button {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 48px;
  padding: 0 14px;
  border-bottom: 2px solid transparent;
  color: var(--landing-muted);
  font-size: 12px;
}
.code-tabs button[aria-selected='true'] {
  color: var(--landing-accent);
  border-bottom-color: var(--landing-accent);
}
.code-tabs button > span {
  font: 9px var(--vp-font-family-mono);
  opacity: 0.6;
}
.code-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 16px 24px 4px;
  font: 11px var(--vp-font-family-mono);
  color: var(--landing-muted);
}
.code-actions {
  display: flex;
  gap: 10px;
}
.code-actions button:disabled {
  opacity: 0.35;
  cursor: default;
}
.code-frame {
  position: relative;
  min-height: 286px;
  max-height: 330px;
  overflow: auto;
}
.code-frame pre {
  padding: 20px 24px 24px;
  font: 12px/1.8 var(--vp-font-family-mono);
  tab-size: 2;
}
.setup-footer {
  display: flex;
  align-items: start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 14px;
  margin-top: 18px;
}
.setup-footer > p {
  max-width: 570px;
  font-size: 11px;
  color: var(--landing-muted);
  line-height: 1.7;
}
.setup-footer .text-link {
  font-size: 12px;
}
.copy-status {
  min-height: 24px;
  margin-top: 8px;
  font-size: 11px;
  color: var(--landing-accent);
}
.workflow-list > div {
  padding-bottom: 22px;
}
.workflow-list h3 {
  font-size: 14px;
  font-weight: 600;
}
.workflow-list p {
  color: var(--landing-muted);
  font-size: 12px;
  line-height: 1.8;
  margin-top: 7px;
}
.next-section {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 28px;
  padding: 40px 0 8px;
  border-top: 1px solid var(--landing-border);
}
.next-section h2 {
  font-size: 24px;
}
.next-section p {
  color: var(--landing-muted);
  font-size: 13px;
  margin-top: 12px;
  line-height: 1.7;
}
a:focus-visible,
button:focus-visible,
[tabindex='0']:focus-visible,
:deep(.landing-counter button:focus-visible) {
  outline: 2px solid var(--landing-accent);
  outline-offset: 4px;
}
@media (max-width: 1100px) {
  .vitepress-landing {
    padding-top: 64px;
  }
  .landing-hero {
    grid-template-columns: minmax(0, 1fr);
    gap: 32px;
    width: auto;
  }
  .walkthrough-section :deep(.walkthrough-terminal-code) {
    height: 348px;
  }
  .walkthrough-section :deep(.walkthrough-route-shell) {
    padding-top: var(--walkthrough-rail);
  }
}
@media (max-width: 960px) {
  .model-section,
  .workflow-section,
  .setup-heading {
    gap: 48px;
  }
  .strategies > div {
    grid-template-columns: 1fr;
    gap: 6px;
  }
}
@media (max-width: 700px) {
  .vitepress-landing {
    padding: 40px 24px 0;
  }
  .landing-hero {
    padding-bottom: 36px;
  }
  .walkthrough-section :deep(.walkthrough-terminal-code) {
    height: 286px;
  }
  .walkthrough-section :deep(.walkthrough-terminal-inner) {
    margin: 8px 12px 50px;
  }
  h1 {
    font-size: 38px;
  }
  .eyebrow {
    margin-bottom: 20px;
  }
  .introduction {
    font-size: 14px;
    margin-top: 20px;
  }
  .hero-actions {
    gap: 20px;
    margin-top: 24px;
  }
  .hero-actions .text-link {
    font-size: 12px;
  }
  .support {
    margin-top: 18px;
  }
  .document-body {
    padding: 22px 20px;
  }
  .model-section,
  .workflow-section,
  .setup-heading {
    grid-template-columns: 1fr;
    gap: 28px;
  }
  .model-section,
  .workflow-section,
  .setup-section {
    padding-top: 36px;
    padding-bottom: 36px;
  }
  h2 {
    font-size: 24px;
  }
  .section-intro > p:not(.section-number),
  .setup-heading > p {
    font-size: 13px;
  }
  .strategies > div {
    grid-template-columns: 135px 1fr;
    gap: 12px;
  }
  .strategies dt {
    font-size: 11px;
    gap: 5px;
  }
  .strategies dd {
    font-size: 11px;
  }
  .setup-heading {
    gap: 14px;
    margin-bottom: 22px;
  }
  .install-command {
    padding: 16px;
  }
  .install-command pre {
    font-size: 11px;
  }
  .code-tabs {
    padding: 0 8px;
    gap: 0;
  }
  .code-tabs button {
    gap: 5px;
    padding: 0 9px;
    font-size: 11px;
  }
  .code-toolbar {
    padding: 14px 16px 4px;
    gap: 8px;
  }
  .code-actions {
    gap: 8px;
  }
  .code-frame pre {
    padding: 18px 16px 20px;
    font-size: 11px;
  }
  .next-section {
    align-items: start;
    flex-direction: column;
    padding-top: 32px;
  }
  .next-section h2 {
    font-size: 23px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .typing-caret {
    animation: none;
  }
}
@media (max-width: 380px) {
  .code-tabs {
    gap: 0;
    padding: 0 8px;
  }
  .code-tabs button {
    padding: 0 8px;
    font-size: 10px;
  }
  .code-tabs button > span {
    display: none;
  }
}
</style>
