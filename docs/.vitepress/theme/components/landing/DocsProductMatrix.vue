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
        eyebrow: '核心产品',
        title: '为文档站点补上交互、诊断和工程边界。',
        intro:
          'Docs Islands 面向已经在写文档的团队：页面继续静态优先，交互按组件接入，日志和架构规则也能在同一套工程节奏里被看见。',
        packagesEyebrow: 'Core Package',
        packagesTitle: '核心能力包',
        packagesIntro:
          '先解决页面体验：在 VitePress Markdown 中使用跨框架 islands，把真实组件带进文档。',
        controlsEyebrow: 'Core Controls',
        controlsTitle: '核心控件',
        controlsIntro:
          '再补上团队协作需要的控制层：日志可见性、构建裁剪、依赖边界和发布前架构检查。',
        packageLabel: '主能力',
        controlsLabel: '控制层',
        vitepressTitle: '@docs-islands/vitepress',
        vitepressBody:
          '把孤岛组件放进 VitePress Markdown，并按组件选择 SSR、client load、visible hydration 或 client-only。',
        vitepressCommand: 'pnpm i @docs-islands/vitepress',
        vitepressMeta: '跨框架渲染 / SPA 切页稳定 / Site DevTools',
        vitepressOutcome: '静态文档体验',
        vitepressOutcomeDetail: '保留 VitePress 的生成模型',
        strategySsr: 'SSR islands',
        strategyVisible: 'Visible hydration',
        strategyClient: 'Client-only escape',
        loggerTitle: 'logaria',
        loggerBody:
          '用 scope、level、规则和 preset 管理日志可见性，生产构建可裁剪被关闭的调用。',
        loggerCommand: 'pnpm i logaria',
        loggerMeta: '日志可见性',
        loggerFit: '适合 runtime diagnostics',
        liminaTitle: 'limina',
        liminaBody:
          '在 CI 和发布前检查 TypeScript monorepo 的 project graph、source proof、paths 和产物边界。',
        liminaCommand: 'pnpm i -D limina',
        liminaMeta: '架构边界',
        liminaFit: '适合 architecture governance',
        open: '打开文档',
      }
    : {
        eyebrow: 'Core Products',
        title: 'Add interaction, diagnostics, and boundaries to docs sites.',
        intro:
          'Docs Islands is for teams already writing documentation: keep pages static-first, bring interaction in per component, and make logs and architecture rules visible in the same engineering loop.',
        packagesEyebrow: 'Core Package',
        packagesTitle: 'Core capability package',
        packagesIntro:
          'Start with page experience: use cross-framework islands inside VitePress Markdown and bring real components into docs.',
        controlsEyebrow: 'Core Controls',
        controlsTitle: 'Core controls',
        controlsIntro:
          'Then add the control layer teams need: log visibility, build-time pruning, dependency boundaries, and pre-release architecture checks.',
        packageLabel: 'Primary capability',
        controlsLabel: 'Control layer',
        vitepressTitle: '@docs-islands/vitepress',
        vitepressBody:
          'Put island components inside VitePress Markdown, then choose SSR, client load, visible hydration, or client-only per component.',
        vitepressCommand: 'pnpm i @docs-islands/vitepress',
        vitepressMeta:
          'cross-framework rendering / SPA route stability / Site DevTools',
        vitepressOutcome: 'Static docs feel',
        vitepressOutcomeDetail: 'Keep the VitePress generation model',
        strategySsr: 'SSR islands',
        strategyVisible: 'Visible hydration',
        strategyClient: 'Client-only escape',
        loggerTitle: 'logaria',
        loggerBody:
          'Control log visibility with scopes, levels, rules, and presets, then prune silenced calls from production builds.',
        loggerCommand: 'pnpm i logaria',
        loggerMeta: 'Log visibility',
        loggerFit: 'Built for runtime diagnostics',
        liminaTitle: 'limina',
        liminaBody:
          'Check TypeScript monorepo project graphs, source proof, paths, and package output boundaries before CI or release.',
        liminaCommand: 'pnpm i -D limina',
        liminaMeta: 'Architecture boundaries',
        liminaFit: 'Built for architecture governance',
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
          rel="noopener noreferrer"
          target="_blank"
        >
          <div class="product-card-topline">
            <span class="product-badge">{{ copy.packageLabel }}</span>
            <span class="product-link-label">{{ copy.open }}</span>
          </div>

          <div class="package-showcase">
            <div class="product-main-copy">
              <div class="islands-icon product-icon" aria-hidden="true">
                <img
                  :src="withBase('/vitepress.svg')"
                  :alt="copy.vitepressTitle"
                />
              </div>

              <div>
                <h4>{{ copy.vitepressTitle }}</h4>
                <p>{{ copy.vitepressBody }}</p>

                <div class="product-command" aria-label="Install command">
                  <span>$</span>
                  <code>{{ copy.vitepressCommand }}</code>
                </div>
              </div>
            </div>

            <div class="package-proof" aria-hidden="true">
              <div class="package-proof-panel">
                <span>{{ copy.vitepressOutcome }}</span>
                <strong>{{ copy.vitepressOutcomeDetail }}</strong>
              </div>
              <div class="package-strategy">
                <span>{{ copy.strategySsr }}</span>
                <span>{{ copy.strategyVisible }}</span>
                <span>{{ copy.strategyClient }}</span>
              </div>
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
          rel="noopener noreferrer"
          target="_blank"
        >
          <div class="product-card-topline">
            <span class="product-badge">{{ copy.controlsLabel }}</span>
            <span class="product-link-label">{{ copy.open }}</span>
          </div>

          <div class="control-body">
            <div class="control-logo-frame">
              <img :src="withBase('/logaria.svg')" :alt="copy.loggerTitle" />
            </div>

            <div>
              <h4>{{ copy.loggerTitle }}</h4>
              <p>{{ copy.loggerBody }}</p>
            </div>
          </div>

          <div class="control-footer">
            <div class="product-command product-command-small">
              <span>$</span>
              <code>{{ copy.loggerCommand }}</code>
            </div>
            <span class="product-meta">{{ copy.loggerMeta }}</span>
            <span class="control-fit">{{ copy.loggerFit }}</span>
          </div>
        </a>

        <a
          class="product-card product-card-control"
          :href="withBase(links.limina)"
          rel="noopener noreferrer"
          target="_blank"
        >
          <div class="product-card-topline">
            <span class="product-badge">{{ copy.controlsLabel }}</span>
            <span class="product-link-label">{{ copy.open }}</span>
          </div>

          <div class="control-body">
            <div class="control-logo-frame">
              <img :src="withBase('/limina.svg')" :alt="copy.liminaTitle" />
            </div>

            <div>
              <h4>{{ copy.liminaTitle }}</h4>
              <p>{{ copy.liminaBody }}</p>
            </div>
          </div>

          <div class="control-footer">
            <div class="product-command product-command-small">
              <span>$</span>
              <code>{{ copy.liminaCommand }}</code>
            </div>
            <span class="product-meta">{{ copy.liminaMeta }}</span>
            <span class="control-fit">{{ copy.liminaFit }}</span>
          </div>
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
  max-width: 820px;
  margin: 0 auto 56px;
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
  max-width: 760px;
  margin: 20px auto 0;
  color: var(--vp-c-text-2);
  font-size: 17px;
  line-height: 1.75;
}

.product-section {
  scroll-margin-top: 96px;
}

.product-section + .product-section {
  margin-top: 44px;
}

.product-section-heading {
  position: relative;
  display: flex;
  max-width: 820px;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  margin: 0 auto 24px;
  padding-top: 34px;
  text-align: center;
}

.product-section-heading::before {
  position: absolute;
  top: 0;
  left: 50%;
  width: min(100%, 760px);
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent,
    color-mix(in srgb, var(--docs-home-hero-title-accent) 34%, transparent),
    color-mix(in srgb, var(--docs-home-accent) 46%, transparent),
    transparent
  );
  content: '';
  transform: translateX(-50%);
}

.product-section-heading::after {
  position: absolute;
  top: -2px;
  left: 50%;
  width: 96px;
  height: 5px;
  border-radius: 999px;
  background: linear-gradient(
    90deg,
    transparent,
    var(--docs-home-hero-title-accent),
    var(--docs-home-accent),
    transparent
  );
  content: '';
  transform: translateX(-50%);
}

.product-section-heading p {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 30px;
  margin: 0;
  border: 1px solid
    color-mix(
      in srgb,
      var(--docs-home-hero-title-accent) 28%,
      var(--docs-home-border)
    );
  border-radius: 999px;
  background: color-mix(
    in srgb,
    var(--docs-home-surface) 72%,
    var(--docs-home-accent-soft)
  );
  color: var(--docs-home-accent-strong);
  font-family: var(--docs-home-font-mono);
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0;
  padding: 0 12px;
  text-transform: uppercase;
}

.product-section-heading p::before {
  display: block;
  width: 18px;
  height: 2px;
  border-radius: 999px;
  background: linear-gradient(
    90deg,
    var(--docs-home-hero-title-accent),
    var(--docs-home-accent)
  );
  content: '';
}

.product-section-heading > div {
  display: grid;
  justify-items: center;
  gap: 10px;
}

.product-section-heading h3 {
  margin: 0;
  background: linear-gradient(
    105deg,
    var(--vp-c-text-1) 12%,
    var(--docs-home-hero-title-accent) 58%,
    var(--docs-home-accent-strong) 100%
  );
  background-clip: text;
  color: var(--vp-c-text-1);
  font-family: var(--docs-home-font-serif);
  font-size: 40px;
  font-style: italic;
  font-weight: 400;
  line-height: 1.08;
  letter-spacing: 0;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.product-section-heading span {
  display: block;
  max-width: 680px;
  margin: 0;
  color: var(--vp-c-text-2);
  font-size: 16px;
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

.product-card::before {
  position: absolute;
  inset: 0 0 auto;
  height: 4px;
  background: var(--docs-home-accent);
  content: '';
  opacity: 0;
  transition: opacity 0.18s ease;
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

.product-card:hover::before {
  opacity: 1;
}

.product-card-package {
  padding: 30px;
}

.product-card-control {
  min-height: 316px;
  padding: 24px;
}

.product-card-topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.package-showcase {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(260px, 320px);
  gap: 36px;
  align-items: stretch;
  margin-top: 30px;
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
  width: 76px;
  height: 76px;
  border: 1px solid var(--docs-home-border);
  border-radius: 8px;
  background: var(--docs-home-primary-soft);
}

.product-icon svg {
  width: 100%;
  height: 100%;
}

.product-main-copy {
  display: flex;
  align-items: flex-start;
  gap: 22px;
}

.product-card h4 {
  margin: 0;
  color: var(--vp-c-text-1);
  font-family: var(--docs-home-font-serif);
  font-size: 30px;
  font-style: italic;
  font-weight: 400;
  line-height: 1.18;
  letter-spacing: 0;
}

.product-card-control h4 {
  font-size: 24px;
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
  line-height: 1.66;
}

.product-command {
  --product-command-bg: color-mix(
    in srgb,
    var(--docs-home-surface) 84%,
    var(--docs-home-accent-soft)
  );
  --product-command-border: color-mix(
    in srgb,
    var(--docs-home-hero-title-accent) 18%,
    var(--docs-home-border)
  );
  --product-command-text: var(--docs-home-hero-title);
  --product-command-prompt: var(--docs-home-accent-strong);
  --product-command-aura: color-mix(
    in srgb,
    var(--docs-home-accent) 14%,
    transparent
  );
  display: flex;
  align-items: center;
  min-width: 0;
  max-width: 100%;
  gap: 10px;
  width: fit-content;
  margin-top: 24px;
  border: 1px solid var(--product-command-border);
  border-radius: 8px;
  background:
    linear-gradient(135deg, var(--product-command-aura), transparent 58%),
    var(--product-command-bg);
  color: var(--product-command-text);
  padding: 11px 14px;
  box-shadow: var(--docs-home-shadow-sm);
}

:global(.dark) .product-command {
  --product-command-bg: color-mix(
    in srgb,
    var(--docs-home-code-bg) 88%,
    var(--docs-home-hero-title-accent)
  );
  --product-command-border: color-mix(
    in srgb,
    var(--docs-home-hero-title-accent) 28%,
    var(--docs-home-border)
  );
  --product-command-text: var(--vp-c-text-1);
  --product-command-prompt: var(--docs-home-accent-strong);
  --product-command-aura: color-mix(
    in srgb,
    var(--docs-home-hero-title-accent) 18%,
    transparent
  );
}

.product-command span {
  color: var(--product-command-prompt);
  font-family: var(--docs-home-font-mono);
  font-size: 12px;
  font-weight: 700;
}

.product-command code {
  overflow-wrap: anywhere;
  color: var(--product-command-text);
  font-family: var(--docs-home-font-mono);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.35;
}

.product-command-small {
  width: 100%;
  margin-top: 0;
  padding: 10px 12px;
}

.product-command-small code {
  font-size: 12px;
}

.product-meta {
  display: block;
  margin-top: 24px;
  color: var(--docs-home-accent-strong);
  font-family: var(--docs-home-font-mono);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.5;
}

.package-proof {
  display: grid;
  gap: 12px;
  align-content: stretch;
}

.package-proof-panel {
  display: grid;
  min-height: 122px;
  align-content: center;
  gap: 10px;
  border: 1px solid var(--docs-home-border);
  border-radius: 8px;
  background: color-mix(
    in srgb,
    var(--docs-home-accent-soft) 56%,
    var(--docs-home-surface)
  );
  padding: 18px;
}

.package-proof-panel span {
  color: var(--docs-home-accent-strong);
  font-family: var(--docs-home-font-mono);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
}

.package-proof-panel strong {
  color: var(--vp-c-text-1);
  font-size: 17px;
  line-height: 1.45;
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

.control-body {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: 18px;
  align-items: start;
  margin-top: 26px;
}

.control-logo-frame {
  display: grid;
  flex: 0 0 auto;
  width: 72px;
  height: 72px;
  place-items: center;
  border: 1px solid var(--docs-home-border);
  border-radius: 8px;
  background: var(--docs-home-primary-soft);
}

.control-logo-frame img {
  display: block;
  max-width: 54px;
  max-height: 54px;
}

.control-footer {
  display: grid;
  gap: 12px;
  margin-top: 24px;
}

.control-footer .product-meta {
  margin-top: 0;
}

.control-fit {
  color: var(--vp-c-text-3);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.5;
}

@media (max-width: 860px) {
  .docs-product-matrix {
    width: min(100% - 32px, 680px);
    margin-top: 48px;
  }

  .controls-grid,
  .package-showcase {
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
  .docs-product-matrix {
    width: min(100% - 28px, 680px);
  }

  .matrix-heading h2 {
    font-size: 32px;
  }

  .matrix-heading span {
    font-size: 15px;
  }

  .product-section-heading {
    margin-bottom: 20px;
    padding-top: 28px;
  }

  .product-section-heading h3 {
    font-size: 30px;
  }

  .product-section-heading span {
    font-size: 14px;
  }

  .product-card-package,
  .product-card-control {
    padding: 20px;
  }

  .product-card h4 {
    font-size: 22px;
  }

  .product-card-control h4 {
    font-size: 21px;
  }

  .control-body {
    grid-template-columns: 1fr;
  }

  .package-proof-panel {
    min-height: 0;
  }
}
</style>
