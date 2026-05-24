import type { DefaultTheme, LocaleSpecificConfig } from 'vitepress';

const vitepressConfig: LocaleSpecificConfig<DefaultTheme.Config> & {
  label: string;
  link?: string;
} = {
  label: 'English',
  lang: 'en',
  description: 'Cross-framework Islands Architecture for documentation sites',

  themeConfig: {
    nav: [
      {
        text: 'Products',
        items: [
          {
            text: '@docs-islands/vitepress',
            link: '/vitepress/',
            target: '_blank',
          },
          {
            text: 'limina',
            link: '/limina/',
            target: '_blank',
          },
          {
            text: 'logaria',
            link: '/logaria/',
            target: '_blank',
          },
        ],
      },
      {
        text: 'Skills',
        link: '/guide/skills',
      },
      {
        text: 'Contributing',
        link: 'https://github.com/XiSenao/docs-islands/blob/main/.github/CONTRIBUTING.md',
      },
    ],
    footer: {
      message: 'Released under the MIT License.',
      copyright: `Copyright © 2025-present Senao Xi`,
    },
  },
};

export default vitepressConfig;
