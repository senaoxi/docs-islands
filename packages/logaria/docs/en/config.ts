import type { DefaultTheme, LocaleSpecificConfig } from 'vitepress';

const sidebar: DefaultTheme.SidebarItem[] = [
  {
    text: 'Introduction',
    items: [
      {
        text: 'Overview',
        link: '/',
      },
      {
        text: 'Why Logaria',
        link: '/why',
      },
      {
        text: 'Project Philosophy',
        link: '/philosophy',
      },
      {
        text: 'Getting Started',
        link: '/getting-started',
      },
    ],
  },
  {
    text: 'Guide',
    items: [
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
        text: 'Troubleshooting',
        link: '/troubleshooting',
      },
    ],
  },
  {
    text: 'Reference',
    items: [
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
    'A framework-agnostic TypeScript logger with rule-based runtime filtering and build-time pruning — debug-rich code, clean production bundles.',
  themeConfig: {
    nav: [
      {
        text: 'Guide',
        link: '/getting-started',
        activeMatch:
          '^/(getting-started|why|philosophy|runtime-config|rules-and-presets|bundler-plugin|scoped-integrations|troubleshooting)',
      },
      {
        text: 'API',
        link: '/api-reference',
        activeMatch: '^/api-reference',
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
