import type { DefaultTheme, LocaleSpecificConfig } from 'vitepress';

const sidebar: DefaultTheme.SidebarItem[] = [
  {
    text: 'Limina',
    items: [
      {
        text: 'Overview',
        link: '/limina',
      },
      {
        text: 'Why Limina',
        link: '/why',
      },
      {
        text: 'Getting Started',
        link: '/getting-started',
      },
      {
        text: 'Core Concepts',
        link: '/concepts',
      },
      {
        text: 'Checks & Workflows',
        link: '/checks-and-workflows',
      },
      {
        text: 'Reference',
        link: '/reference',
      },
    ],
  },
];

const config: LocaleSpecificConfig<DefaultTheme.Config> & {
  label: string;
} = {
  label: 'English',
  lang: 'en-US',
  title: 'Limina',
  description:
    'Keep TypeScript monorepos consistent from source graph to published packages.',
  themeConfig: {
    nav: [
      {
        text: 'Guide',
        link: '/getting-started',
      },
      {
        text: 'Reference',
        link: '/reference',
      },
      {
        text: 'npm',
        link: 'https://www.npmjs.com/package/limina',
      },
    ],
    sidebar,
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026-present Limina contributors',
    },
  },
};

export default config;
