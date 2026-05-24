import type { DefaultTheme, LocaleSpecificConfig } from 'vitepress';

const sidebar: DefaultTheme.SidebarItem[] = [
  {
    text: 'Logaria',
    items: [
      {
        text: 'Overview',
        link: '/',
      },
      {
        text: 'Getting Started',
        link: '/getting-started',
      },
      {
        text: 'Runtime Config',
        link: '/runtime-config',
      },
      {
        text: 'Rules & Presets',
        link: '/rules-and-presets',
      },
      {
        text: 'Bundler Plugin',
        link: '/bundler-plugin',
      },
      {
        text: 'Scoped Integrations',
        link: '/scoped-integrations',
      },
      {
        text: 'API Reference',
        link: '/api-reference',
      },
    ],
  },
];

const config: LocaleSpecificConfig<DefaultTheme.Config> & {
  label: string;
} = {
  label: 'English',
  lang: 'en-US',
  title: 'Logaria',
  description:
    'Framework-agnostic runtime logging and build-time pruning for TypeScript packages',
  themeConfig: {
    nav: [
      {
        text: 'Guide',
        link: '/getting-started',
      },
      {
        text: 'API',
        link: '/api-reference',
      },
      {
        text: 'npm',
        link: 'https://www.npmjs.com/package/logaria',
      },
    ],
    sidebar,
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026-present Logaria contributors',
    },
  },
};

export default config;
