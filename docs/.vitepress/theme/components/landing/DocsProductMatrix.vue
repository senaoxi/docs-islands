<script setup lang="ts">
import { withBase } from 'vitepress';
import { computed } from 'vue';
import DocsMarkdownExample from './DocsMarkdownExample.vue';

const props = defineProps<{ locale: 'en' | 'zh' }>();
const isZh = computed(() => props.locale === 'zh');
const guide = computed(() =>
  withBase(isZh.value ? '/vitepress/zh/' : '/vitepress/'),
);
const copy = computed(() =>
  isZh.value
    ? {
        supported: '当前支持',
        statement: '文档保持轻量，组件保留原生体验。',
        principles: [
          {
            title: '内容先到达',
            body: '用服务端渲染交付页面内容。无需交互的组件，可以只输出静态 HTML。',
            code: 'ssr:only',
          },
          {
            title: '交互按需开始',
            body: '立即水合，或等组件进入视口再启动。浏览器专属组件也有自己的入口。',
            code: 'client:load / client:visible / client:only',
          },
          {
            title: '继续使用熟悉的文档',
            body: '保留 VitePress 的 Markdown 与路由，在页面中直接引入 React 组件。',
            code: 'Markdown + React',
          },
        ],
        eyebrow: '开始接入',
        title: '从一个组件开始。',
        intro:
          '配置 VitePress 集成与 React 适配器后，在 Markdown 中引入组件，为它选择渲染策略。',
        guide: '查看完整接入指南',
        note: '默认仅输出 SSR HTML；需要交互时，显式选择 client 指令。',
        package: 'VitePress 集成',
        skills: '使用编码助手？',
        skillsLink: '查看项目 Skills',
      }
    : {
        supported: 'Available today',
        statement: 'Lightweight pages. Components that feel at home.',
        principles: [
          {
            title: 'Content arrives first',
            body: 'Deliver page content with server rendering. Components that need no interaction can stay static HTML.',
            code: 'ssr:only',
          },
          {
            title: 'Interaction starts on your terms',
            body: 'Hydrate on load or when an island enters the viewport. Browser-only components have a place, too.',
            code: 'client:load / client:visible / client:only',
          },
          {
            title: 'Keep the docs you know',
            body: 'Keep VitePress Markdown and routing. Import React components directly into the pages you already write.',
            code: 'Markdown + React',
          },
        ],
        eyebrow: 'Start building',
        title: 'Start with one component.',
        intro:
          'Configure the VitePress integration and React adapter. Then import a component into Markdown and choose its rendering strategy.',
        guide: 'Read the integration guide',
        note: 'Static SSR HTML is the default. Opt into interaction with a client directive.',
        package: 'VitePress integration',
        skills: 'Working with a coding agent?',
        skillsLink: 'Explore project Skills',
      },
);
</script>

<template>
  <div class="docs-product-matrix">
    <div class="support-strip">
      <span class="support-label"
        ><span aria-hidden="true" class="support-dot"></span
        >{{ copy.supported }}</span
      >
      <strong>VitePress <span aria-hidden="true">×</span> React</strong>
      <span class="support-package">@docs-islands/vitepress</span>
    </div>

    <section class="principles" aria-labelledby="principles-title">
      <h2 id="principles-title">{{ copy.statement }}</h2>
      <div class="principle-grid">
        <article
          v-for="(item, index) in copy.principles"
          :key="item.code"
          class="principle"
        >
          <span class="section-index" aria-hidden="true">0{{ index + 1 }}</span>
          <h3>{{ item.title }}</h3>
          <p>{{ item.body }}</p>
          <code>{{ item.code }}</code>
        </article>
      </div>
    </section>

    <section
      id="core-package"
      class="integration"
      aria-labelledby="integration-title"
    >
      <div class="integration-copy">
        <p class="section-eyebrow">{{ copy.eyebrow }}</p>
        <h2 id="integration-title">{{ copy.title }}</h2>
        <p class="integration-intro">{{ copy.intro }}</p>
        <a class="guide-link" :href="guide" target="_self"
          >{{ copy.guide }} <span aria-hidden="true">→</span></a
        >
      </div>
      <div class="integration-example">
        <div class="example-header">
          <span>{{ copy.package }}</span
          ><code>@docs-islands/vitepress</code>
        </div>
        <DocsMarkdownExample :locale="locale" />
        <p class="example-note">{{ copy.note }}</p>
      </div>
    </section>

    <div class="skills-row">
      <span>{{ copy.skills }}</span>
      <a :href="withBase(isZh ? '/zh/guide/skills' : '/guide/skills')"
        >{{ copy.skillsLink }} <span aria-hidden="true">↗</span></a
      >
    </div>
  </div>
</template>

<style scoped>
.docs-product-matrix {
  width: min(1152px, calc(100% - 64px));
  margin: 0 auto;
}
.support-strip {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 20px 36px;
  padding: 22px 0;
  border-block: 1px solid var(--docs-home-border);
  font-size: 13px;
}
.support-label {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--vp-c-text-2);
}
.support-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--docs-home-accent-strong);
}
.support-strip strong {
  display: flex;
  gap: 18px;
  font-weight: 600;
}
.support-strip strong span {
  color: var(--vp-c-text-2);
  font-weight: 400;
}
.support-package {
  margin-left: auto;
  font-family: var(--docs-home-font-mono);
  color: var(--vp-c-text-2);
  font-size: 12px;
}
.principles {
  padding: 76px 0 72px;
}
h2 {
  margin: 0;
  max-width: 640px;
  font-size: 36px;
  font-weight: 600;
  line-height: 1.2;
  letter-spacing: -0.035em;
  text-wrap: balance;
}
.principle-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin-top: 40px;
}
.principle {
  display: flex;
  flex-direction: column;
  padding: 0 28px;
  border-left: 1px solid var(--docs-home-border);
}
.principle:first-child {
  padding-left: 0;
  border: 0;
}
.principle:last-child {
  padding-right: 0;
}
.section-index,
.section-eyebrow {
  font-family: var(--docs-home-font-mono);
  font-size: 12px;
  color: var(--docs-home-accent-strong);
}
.principle h3 {
  margin: 18px 0 12px;
  font-size: 18px;
  font-weight: 600;
  line-height: 1.4;
  letter-spacing: -0.02em;
}
.principle p {
  margin: 0 0 24px;
  color: var(--vp-c-text-2);
  font-size: 14px;
  line-height: 1.8;
}
.principle code {
  margin-top: auto;
  font-size: 11px;
  line-height: 1.7;
  color: var(--docs-home-accent-strong);
  overflow-wrap: anywhere;
}
.integration {
  display: grid;
  grid-template-columns: 0.85fr 1.15fr;
  align-items: center;
  gap: 72px;
  padding: 64px 0;
  border-block: 1px solid var(--docs-home-border);
  scroll-margin-top: 96px;
}
.section-eyebrow {
  margin: 0 0 20px;
}
.integration-intro {
  margin: 22px 0 28px;
  color: var(--vp-c-text-2);
  font-size: 15px;
  line-height: 1.8;
}
.guide-link {
  display: inline-flex;
  gap: 20px;
  align-items: center;
  min-height: 44px;
  color: var(--docs-home-accent-strong);
  font-size: 14px;
  font-weight: 600;
}
a:hover {
  text-decoration: underline;
  text-underline-offset: 5px;
}
.integration-example {
  min-width: 0;
  border: 1px solid var(--docs-home-border);
  border-radius: 10px;
  background: var(--docs-home-surface);
  overflow: hidden;
}
.example-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 16px;
  padding: 18px 22px;
  border-bottom: 1px solid var(--docs-home-border);
}
.example-header span {
  font-size: 12px;
  color: var(--vp-c-text-2);
}
.example-header code {
  font-size: 12px;
  overflow-wrap: anywhere;
}
.example-note {
  margin: 0;
  padding: 16px 22px;
  border-top: 1px solid var(--docs-home-border);
  color: var(--vp-c-text-2);
  font-size: 12px;
  line-height: 1.7;
}
.skills-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  padding: 26px 0 36px;
  color: var(--vp-c-text-2);
  font-size: 13px;
}
.skills-row a {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  gap: 16px;
  color: var(--docs-home-hero-title);
}
@media (max-width: 959px) {
  .integration {
    gap: 36px;
  }
}
@media (max-width: 720px) {
  .docs-product-matrix {
    width: calc(100% - 40px);
  }
  .support-strip {
    gap: 16px 22px;
  }
  .support-package {
    width: 100%;
    margin-left: 16px;
  }
  .principles {
    padding: 48px 0;
  }
  h2 {
    font-size: 30px;
  }
  .principle-grid {
    grid-template-columns: 1fr;
    gap: 28px;
    margin-top: 32px;
  }
  .principle,
  .principle:first-child,
  .principle:last-child {
    padding: 0 0 0 20px;
    border-left: 1px solid var(--docs-home-border);
  }
  .principle h3 {
    margin-top: 8px;
  }
  .principle p {
    margin-bottom: 12px;
  }
  .integration {
    grid-template-columns: 1fr;
    padding: 44px 0;
    gap: 28px;
  }
  .skills-row {
    padding-bottom: 24px;
  }
}
</style>
