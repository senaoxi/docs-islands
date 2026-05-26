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
