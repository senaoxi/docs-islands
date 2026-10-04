import type { EditorPart } from './integration-walkthrough-source';

const homepageBefore = {
  en: '---\nlayout: home\naside: false\neditLink: false\nmarkdownStyles: false\ntitle: Docs Islands for VitePress\ndescription: Add React islands to VitePress Markdown, choose when each component hydrates, and keep the static documentation workflow.\n---\n\n<script setup>\nimport VitePressLanding from \'../.vitepress/theme/components/VitePressLanding.vue\'\n</script>\n\n<script lang="react">\n  import IntegrationWalkthrough from \'../components/react/IntegrationWalkthrough\';\n</script>\n\n<VitePressLanding locale="en">\n  <template #walkthrough>\n    <IntegrationWalkthrough spa:sync-render client:load locale="en" />\n  </template>\n</VitePressLanding>\n',
  zh: '---\nlayout: home\naside: false\neditLink: false\nmarkdownStyles: false\ntitle: Docs Islands for VitePress\ndescription: 在 VitePress Markdown 中加入 React 小岛，选择每个组件的客户端接管时机，并保留静态文档工作流。\n---\n\n<script setup>\nimport VitePressLanding from \'../.vitepress/theme/components/VitePressLanding.vue\'\n</script>\n\n<script lang="react">\n  import IntegrationWalkthrough from \'../components/react/IntegrationWalkthrough\';\n</script>\n\n<VitePressLanding locale="zh">\n  <template #walkthrough>\n    <IntegrationWalkthrough spa:sync-render client:load locale="zh" />\n  </template>\n</VitePressLanding>\n',
};
const prototypeCss =
  ".prototype {\n  display: block;\n  width: 100%;\n  height: 100%;\n  background-image: url('./sunset.webp');\n  background-repeat: no-repeat;\n  background-size: 800% 1100%;\n  background-position: var(--sprite-x, 0%) var(--sprite-y, 0%);\n  transform-origin: 50% 100%;\n  --run-direction: left;\n}\n";
export const prototypeInitialDirection = 'right';
export const prototypeFinalDirection = 'left';

const snippet = (file: string, parts: EditorPart[]) => ({
  file,
  parts,
  before: parts
    .map((part) => (typeof part === 'string' ? part : part.before))
    .join(''),
  code: parts
    .map((part) => (typeof part === 'string' ? part : part.after))
    .join(''),
});

// These before buffers are the actual homepage files at this change's baseline.
// The additions use the existing import-based React integration API.
export function getIntegrationWalkthroughSnippets(locale: 'en' | 'zh') {
  const chinese = locale === 'zh';
  const original = homepageBefore[locale];
  const originalUse = `    <IntegrationWalkthrough spa:sync-render client:load locale="${locale}" />\n`;
  const [usePrefix, useRest] = original.split(originalUse);
  const page = snippet(`${locale}/index.md`, [
    `${usePrefix!}    <IntegrationWalkthrough spa:sync-render client:load locale="${locale}"`,
    {
      before: '',
      after: ' pet="sunset"',
      keys: '/IntegrationWalkthrough spa ↵ f> 2h i',
      label: chinese
        ? '保留 IntegrationWalkthrough，启用其已有 Sunset 组件'
        : 'Keep IntegrationWalkthrough; enable its existing Sunset component',
    },
    ` />\n${useRest!}`,
  ]);
  const initialCss = prototypeCss.replace(
    `--run-direction: ${prototypeFinalDirection};`,
    `--run-direction: ${prototypeInitialDirection};`,
  );
  const [directionPrefix, directionRest] = initialCss.split(
    `--run-direction: ${prototypeInitialDirection};`,
  );
  const updatedStyles = snippet('components/react/IslandPrototype.module.css', [
    `${directionPrefix!}--run-direction: `,
    {
      before: prototypeInitialDirection,
      after: prototypeFinalDirection,
      keys: '/right ↵ cgn',
      label: chinese
        ? '修改已有 CSS，让 Sunset 往回跑'
        : 'Change the existing CSS to run back',
    },
    `;${directionRest!}`,
  ]);
  return { page, updatedStyles, logs: prototypeLogs[locale] };
}

// Recorded stdout from VitePress 1.6.4 + @docs-islands/vitepress 0.3.0,
// using the docs site's logging rules and a connected development page.
// Timestamps are capture values. CSS-module HMR reaches its React boundary.
// Browser hydration/fast-refresh messages do not belong in this transcript.
const prototypeLogs = {
  en: {
    markdown: '5:04:29 PM [vitepress] hmr update /en/index.md',
    hmr: '5:04:32 PM [vitepress] hmr update /components/react/IslandPrototype.tsx',
  },
  zh: {
    markdown: '5:05:29 PM [vitepress] hmr update /zh/index.md',
    hmr: '5:05:32 PM [vitepress] hmr update /components/react/IslandPrototype.tsx',
  },
} as const;
