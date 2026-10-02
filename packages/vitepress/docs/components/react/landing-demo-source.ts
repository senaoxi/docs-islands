export const integrationInstall =
  'pnpm add -D @docs-islands/vitepress @vitejs/plugin-react-swc@^4.3.1\npnpm add react@^18.2.0 react-dom@^18.2.0';

export interface EditorChange {
  before: string;
  after: string;
  keys: string;
  label: string;
}
export type EditorPart = string | EditorChange;

const beforeText = (parts: EditorPart[]) =>
  parts.map((part) => (typeof part === 'string' ? part : part.before)).join('');
const afterText = (parts: EditorPart[]) =>
  parts.map((part) => (typeof part === 'string' ? part : part.after)).join('');
const snippet = (file: string, parts: EditorPart[]) => ({
  file,
  parts,
  before: beforeText(parts),
  code: afterText(parts),
});
const component = (heading: string) => `import { useState } from 'react';

export default function Counter() {
  const [count, setCount] = useState(0);

  return (
    <section>
      <h2>${heading}</h2>
      <button onClick={() => setCount(value => value + 1)}>
        {count}
      </button>
    </section>
  );
}`;

export function getIntegrationSnippets(locale: 'en' | 'zh') {
  const chinese = locale === 'zh';
  const title = chinese ? '一个 React 小岛。' : 'One React island.';
  const updatedTitle = chinese
    ? '同一小岛，更新文案。'
    : 'Same island. New copy.';
  const config = snippet('.vitepress/config.ts', [
    "import { defineConfig } from 'vitepress';\n",
    {
      before: '',
      after:
        "import { createDocsIslands } from '@docs-islands/vitepress';\nimport { react } from '@docs-islands/vitepress/adapters/react';\n",
      keys: '1Go',
      label: chinese ? '增补集成 imports' : 'Add integration imports',
    },
    "\nconst config = defineConfig({\n  title: 'My docs',\n  description: 'A VitePress site.',\n});\n\n",
    {
      before: '',
      after: 'createDocsIslands({ adapters: [react()] }).apply(config);\n\n',
      keys: 'GO',
      label: chinese
        ? '对既有配置应用 adapter'
        : 'Apply the adapter to the existing config',
    },
    'export default config;',
  ]);
  const theme = snippet('.vitepress/theme/index.ts', [
    "import type { Theme } from 'vitepress';\nimport DefaultTheme from 'vitepress/theme';\n",
    {
      before: '',
      after:
        "import { reactClient } from '@docs-islands/vitepress/adapters/react/client';\n",
      keys: '2Go',
      label: chinese ? '引入 React 客户端' : 'Import the React client',
    },
    '\nconst theme: Theme = {\n  extends: DefaultTheme,\n',
    {
      before: '',
      after: '  async enhanceApp() {\n    await reactClient();\n  },\n',
      keys: '/extends ↵ o',
      label: chinese
        ? '保留默认主题，增补客户端注册'
        : 'Keep the default theme; register the client',
    },
    '};\n\nexport default theme;',
  ]);
  const counterCode = component(title);
  const counter = snippet('Counter.tsx', [
    {
      before: '',
      after: counterCode,
      keys: 'i',
      label: chinese ? '新建计数器组件' : 'Create the counter component',
    },
  ]);
  const markdown = snippet('index.md', [
    '# Hello, world!\n\n',
    {
      before: '',
      after: `<script lang="react">
  import Counter from './Counter';
</script>

<Counter client:visible />`,
      keys: 'Gi',
      label: chinese
        ? '保留 Hello, world!，加入组件'
        : 'Keep Hello, world!; add the component',
    },
  ]);
  const parts = counterCode.split(title);
  const updatedComponent = snippet('Counter.tsx', [
    parts[0]!,
    {
      before: title,
      after: updatedTitle,
      keys: '8Gf>lct<',
      label: chinese ? '只修改标题这一行' : 'Change only the heading line',
    },
    parts[1]!,
  ]);
  return {
    config,
    theme,
    component: counter,
    markdown,
    updatedComponent,
    title,
    updatedTitle,
  };
}

// Verified console excerpts; paths are shortened. The HMR websocket event is
// owned by src/shared/constants/react-hmr.ts and observed in the minimal fixture.
export const integrationRenderLog = `@docs-islands/vitepress[runtime.react.dev-render]:
  Component Counter scheduled for client:visible render (hydrate)
@docs-islands/vitepress[runtime.react.dev-render]:
  Component Counter client:visible render completed (hydrate)`;
export const integrationHmrLog = `dev websocket event:
  docs-islands:react-hmr:prepare:fast-refresh
[vite] hot updated: /Counter.tsx`;
