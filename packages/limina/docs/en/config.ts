import type { DefaultTheme, LocaleSpecificConfig } from 'vitepress';

const config: LocaleSpecificConfig<DefaultTheme.Config> & {
  label: string;
} = {
  label: 'English',
  lang: 'en-US',
  title: 'Limina',
  description: 'Architecture governance CLI for TypeScript monorepos',
  themeConfig: {
    nav: [
      {
        text: 'Guide',
        link: '/limina',
      },
      {
        text: 'npm',
        link: 'https://www.npmjs.com/package/limina',
      },
    ],
    sidebar: [
      {
        text: 'Limina',
        items: [
          {
            text: 'Overview',
            link: '/',
          },
          {
            text: 'Guide',
            link: '/limina',
          },
        ],
      },
    ],
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026-present Limina contributors',
    },
  },
};

export default config;
