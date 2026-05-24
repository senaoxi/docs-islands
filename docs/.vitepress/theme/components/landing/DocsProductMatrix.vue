<script setup lang="ts">
import { withBase } from 'vitepress';
import { computed } from 'vue';

const props = defineProps<{
  locale: 'en' | 'zh';
}>();

const isZh = computed(() => props.locale === 'zh');

const copy = computed(() =>
  isZh.value
    ? {
        eyebrow: '产品矩阵',
        title: '面向产品化文档站点的能力地图。',
        intro:
          'Docs Islands 将站点渲染、运行诊断和架构治理拆成可组合的产品能力。核心包面向页面体验与框架集成，核心控件面向团队协作中的可观测性、规则和边界。',
        packagesEyebrow: 'Core Packages',
        packagesTitle: '文档站点能力',
        packagesIntro: '面向页面体验、框架集成和站点运行时的主能力。',
        controlsEyebrow: 'Core Controls',
        controlsTitle: '工程控制面板',
        controlsIntro: '面向日志、边界、CI 信心与仓库治理的轻量控制层。',
        packageLabel: '核心包',
        controlsLabel: '核心控件',
        vitepressTitle: '@docs-islands/vitepress',
        vitepressBody:
          '在 VitePress Markdown 中接入 React islands，并按组件选择 SSR、client load、visible 或 client-only 策略。',
        vitepressMeta: '跨框架渲染 / SPA 稳定性 / Site DevTools',
        strategySsr: 'SSR islands',
        strategyVisible: 'Visible hydration',
        strategyClient: 'Client-only escape',
        loggerTitle: 'logaria',
        loggerBody:
          '框架无关的日志 runtime，支持 scope 隔离、规则过滤和构建期裁剪。',
        loggerMeta: 'runtime diagnostics',
        liminaTitle: 'limina',
        liminaBody:
          'TypeScript monorepo 架构治理 CLI，检查 project graph、source proof、paths 和发布产物。',
        liminaMeta: 'architecture governance',
        open: '打开文档',
      }
    : {
        eyebrow: 'Product Portfolio',
        title: 'A product map for documentation systems.',
        intro:
          'Docs Islands turns rendering, diagnostics, and repository governance into composable product capabilities. Core packages shape site-facing experiences; core controls give teams precise operational and architectural feedback.',
        packagesEyebrow: 'Core Packages',
        packagesTitle: 'Site-facing capabilities',
        packagesIntro:
          'Primary packages for page experience, framework integration, and documentation runtime behavior.',
        controlsEyebrow: 'Core Controls',
        controlsTitle: 'Engineering control plane',
        controlsIntro:
          'Focused controls for logs, boundaries, CI confidence, and repository governance.',
        packageLabel: 'Core Package',
        controlsLabel: 'Core Controls',
        vitepressTitle: '@docs-islands/vitepress',
        vitepressBody:
          'Bring React islands into VitePress Markdown and choose SSR, client load, visible, or client-only rendering per component.',
        vitepressMeta:
          'cross-framework rendering / SPA stability / Site DevTools',
        strategySsr: 'SSR islands',
        strategyVisible: 'Visible hydration',
        strategyClient: 'Client-only escape',
        loggerTitle: 'logaria',
        loggerBody:
          'Framework-agnostic logging runtime with scoped isolation, rule-based filtering, and build-time pruning.',
        loggerMeta: 'runtime diagnostics',
        liminaTitle: 'limina',
        liminaBody:
          'Architecture governance CLI for TypeScript monorepos, covering project graphs, source proof, paths, and package output checks.',
        liminaMeta: 'architecture governance',
        open: 'Open docs',
      },
);

const links = computed(() =>
  isZh.value
    ? {
        vitepress: '/vitepress/zh/',
        logger: '/logaria/zh/',
        limina: '/limina/zh/',
      }
    : {
        vitepress: '/vitepress/',
        logger: '/logaria/',
        limina: '/limina/',
      },
);
</script>

<template>
  <section id="products" class="docs-product-matrix">
    <div class="matrix-heading">
      <p>{{ copy.eyebrow }}</p>
      <h2>{{ copy.title }}</h2>
      <span>{{ copy.intro }}</span>
    </div>

    <section id="core-package" class="product-section">
      <div class="product-section-heading">
        <p>{{ copy.packagesEyebrow }}</p>
        <div>
          <h3>{{ copy.packagesTitle }}</h3>
          <span>{{ copy.packagesIntro }}</span>
        </div>
      </div>

      <div class="package-grid">
        <a
          class="product-card product-card-package"
          :href="withBase(links.vitepress)"
        >
          <div class="product-card-topline">
            <span class="product-badge">{{ copy.packageLabel }}</span>
            <span class="product-link-label">{{ copy.open }}</span>
          </div>
          <div class="product-card-body product-card-body-package">
            <div class="product-main-copy">
              <div class="product-icon islands-icon" aria-hidden="true">
                <svg
                  viewBox="0 0 96 96"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <circle cx="37" cy="49" r="25" fill="#42B883" />
                  <circle cx="59" cy="49" r="25" fill="#61DAFB" />
                  <path
                    d="M48 30L54 43L68 44L58 54L61 68L48 61L35 68L38 54L28 44L42 43L48 30Z"
                    fill="#6D5BD0"
                  />
                </svg>
              </div>
              <div>
                <h4>{{ copy.vitepressTitle }}</h4>
                <p>{{ copy.vitepressBody }}</p>
              </div>
            </div>

            <div class="package-strategy" aria-hidden="true">
              <span>{{ copy.strategySsr }}</span>
              <span>{{ copy.strategyVisible }}</span>
              <span>{{ copy.strategyClient }}</span>
            </div>
          </div>
          <span class="product-meta">{{ copy.vitepressMeta }}</span>
        </a>
      </div>
    </section>

    <section id="core-controls" class="product-section">
      <div class="product-section-heading">
        <p>{{ copy.controlsEyebrow }}</p>
        <div>
          <h3>{{ copy.controlsTitle }}</h3>
          <span>{{ copy.controlsIntro }}</span>
        </div>
      </div>

      <div class="controls-grid" role="group" :aria-label="copy.controlsLabel">
        <a
          class="product-card product-card-control"
          :href="withBase(links.logger)"
          target="_self"
        >
          <div class="product-card-topline">
            <span class="product-badge">{{ copy.controlsLabel }}</span>
            <span class="product-link-label">{{ copy.open }}</span>
          </div>
          <div class="product-card-body">
            <div class="product-icon logger-icon" aria-hidden="true">
              <svg
                viewBox="0 0 96 96"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <rect
                  x="18"
                  y="20"
                  width="60"
                  height="56"
                  rx="8"
                  fill="#101828"
                />
                <path
                  d="M31 36H63"
                  stroke="#38BDF8"
                  stroke-width="6"
                  stroke-linecap="round"
                />
                <path
                  d="M31 50H56"
                  stroke="#A3E635"
                  stroke-width="6"
                  stroke-linecap="round"
                />
                <path
                  d="M31 64H67"
                  stroke="#F59E0B"
                  stroke-width="6"
                  stroke-linecap="round"
                />
              </svg>
            </div>
            <div>
              <h4>{{ copy.loggerTitle }}</h4>
              <p>{{ copy.loggerBody }}</p>
            </div>
          </div>
          <span class="product-meta">{{ copy.loggerMeta }}</span>
        </a>

        <a
          class="product-card product-card-control"
          :href="withBase(links.limina)"
        >
          <div class="product-card-topline">
            <span class="product-badge">{{ copy.controlsLabel }}</span>
            <span class="product-link-label">{{ copy.open }}</span>
          </div>
          <div class="product-card-body">
            <div class="product-icon limina-icon" aria-hidden="true">
              <svg
                viewBox="0 0 96 96"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <rect
                  x="12"
                  y="12"
                  width="72"
                  height="72"
                  rx="18"
                  fill="#111827"
                />
                <path
                  d="M25 35L52 48L25 61"
                  stroke="#91A4B7"
                  stroke-width="5"
                  stroke-linecap="round"
                />
                <path
                  d="M39 25V71M56 25V71"
                  stroke="#E5E7EB"
                  stroke-width="7"
                  stroke-linecap="round"
                />
                <circle cx="68" cy="48" r="11" fill="#22D3EE" />
                <path
                  d="M63 48.5L67 52L74 44"
                  stroke="#111827"
                  stroke-width="3.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </div>
            <div>
              <h4>{{ copy.liminaTitle }}</h4>
              <p>{{ copy.liminaBody }}</p>
            </div>
          </div>
          <span class="product-meta">{{ copy.liminaMeta }}</span>
        </a>
      </div>
    </section>
  </section>
</template>

<style scoped>
.docs-product-matrix {
  width: min(1184px, calc(100% - 48px));
  margin: 84px auto 24px;
}

.matrix-heading {
  max-width: 780px;
  margin: 0 auto 52px;
  text-align: center;
}

.matrix-heading p {
  width: fit-content;
  margin: 0 auto 16px;
  border: 1px solid var(--docs-home-border);
  border-radius: 999px;
  color: var(--docs-home-accent-strong);
  font-family: var(--docs-home-font-mono);
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0;
  padding: 7px 10px;
  text-transform: uppercase;
}

.matrix-heading h2 {
  margin: 0;
  color: var(--vp-c-text-1);
  font-family: var(--docs-home-font-serif);
  font-size: 46px;
  font-style: italic;
  font-weight: 400;
  line-height: 1.08;
  letter-spacing: 0;
}

.matrix-heading span {
  display: block;
  max-width: 720px;
  margin: 20px auto 0;
  color: var(--vp-c-text-2);
  font-size: 17px;
  line-height: 1.75;
}

.product-section {
  scroll-margin-top: 96px;
}

.product-section + .product-section {
  margin-top: 40px;
}

.product-section-heading {
  display: grid;
  grid-template-columns: minmax(180px, 0.32fr) minmax(0, 1fr);
  gap: 28px;
  align-items: end;
  margin-bottom: 18px;
  padding-top: 24px;
  border-top: 1px solid var(--docs-home-border);
}

.product-section-heading p {
  margin: 0 0 4px;
  color: var(--docs-home-accent-strong);
  font-family: var(--docs-home-font-mono);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
}

.product-section-heading h3 {
  margin: 0;
  color: var(--vp-c-text-1);
  font-family: var(--docs-home-font-serif);
  font-size: 34px;
  font-style: italic;
  font-weight: 400;
  line-height: 1.14;
  letter-spacing: 0;
}

.product-section-heading span {
  display: block;
  max-width: 640px;
  margin-top: 8px;
  color: var(--vp-c-text-2);
  font-size: 15px;
  line-height: 1.7;
}

.package-grid,
.controls-grid {
  display: grid;
  gap: 18px;
}

.controls-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.product-card {
  position: relative;
  display: flex;
  overflow: hidden;
  flex-direction: column;
  justify-content: space-between;
  border: 1px solid var(--docs-home-border);
  border-radius: 8px;
  background: var(--docs-home-surface);
  color: inherit;
  text-decoration: none;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.18s ease;
}

.product-card:hover {
  border-color: color-mix(
    in srgb,
    var(--docs-home-accent) 46%,
    var(--docs-home-border)
  );
  box-shadow: var(--docs-home-shadow-md);
  transform: translateY(-2px);
}

.product-card-package {
  padding: 30px;
}

.product-card-control {
  min-height: 236px;
  padding: 22px;
}

.product-card-topline,
.product-card-body {
  display: flex;
  align-items: flex-start;
  gap: 18px;
}

.product-card-topline {
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.product-card-body {
  margin-top: 28px;
}

.product-card-body-package {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(220px, 280px);
  gap: 32px;
  align-items: center;
}

.product-card-control .product-card-body {
  margin-top: 20px;
}

.product-badge {
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  padding: 0 10px;
  border-radius: 8px;
  background: var(--docs-home-accent-soft);
  color: var(--docs-home-accent-strong);
  font-family: var(--docs-home-font-mono);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0;
}

.product-link-label {
  color: var(--vp-c-text-3);
  font-size: 13px;
  font-weight: 700;
}

.product-card:hover .product-link-label {
  color: var(--vp-c-text-1);
}

.product-link-label::after {
  content: ' ->';
}

.product-icon {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 72px;
  height: 72px;
  border: 1px solid var(--docs-home-border);
  border-radius: 8px;
  background: var(--docs-home-primary-soft);
}

.product-card-control .product-icon {
  width: 56px;
  height: 56px;
}

.product-icon svg {
  width: 100%;
  height: 100%;
}

.product-main-copy {
  display: flex;
  align-items: flex-start;
  gap: 20px;
}

.product-card h4 {
  margin: 0;
  color: var(--vp-c-text-1);
  font-family: var(--docs-home-font-serif);
  font-size: 28px;
  font-style: italic;
  font-weight: 400;
  line-height: 1.18;
  letter-spacing: 0;
}

.product-card-control h4 {
  font-size: 22px;
}

.product-card p {
  margin: 12px 0 0;
  color: var(--vp-c-text-2);
  font-size: 15px;
  line-height: 1.72;
}

.product-card-control p {
  margin-top: 8px;
  font-size: 14px;
  line-height: 1.62;
}

.product-meta {
  display: block;
  margin-top: 28px;
  color: var(--docs-home-accent-strong);
  font-family: var(--docs-home-font-mono);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.5;
}

.package-strategy {
  display: grid;
  gap: 10px;
  align-content: center;
}

.package-strategy span {
  position: relative;
  display: block;
  padding: 10px 12px 10px 34px;
  border: 1px solid var(--docs-home-border);
  border-radius: 999px;
  color: var(--vp-c-text-2);
  font-family: var(--docs-home-font-mono);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.2;
}

.package-strategy span::before {
  position: absolute;
  top: 50%;
  left: 12px;
  width: 10px;
  height: 10px;
  border: 2px solid var(--docs-home-accent);
  border-radius: 999px;
  content: '';
  transform: translateY(-50%);
}

@media (max-width: 860px) {
  .docs-product-matrix {
    width: min(100% - 32px, 680px);
    margin-top: 48px;
  }

  .product-section-heading,
  .controls-grid,
  .product-card-body-package {
    grid-template-columns: 1fr;
  }

  .product-main-copy {
    flex-direction: column;
  }

  .product-card-control {
    min-height: 0;
  }
}

@media (max-width: 560px) {
  .matrix-heading h2 {
    font-size: 32px;
  }

  .product-card-package,
  .product-card-control {
    padding: 20px;
  }

  .product-card-body {
    flex-direction: column;
    gap: 14px;
  }

  .product-card h4 {
    font-size: 20px;
  }
}
</style>
