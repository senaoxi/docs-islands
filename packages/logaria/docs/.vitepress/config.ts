import { defineConfig } from 'vitepress';

import enConfig from '../en/config';
import zhConfig from '../zh/config';

const base = '/docs-islands/logaria/';

export default defineConfig({
  base,
  title: 'Logaria',
  description:
    'Framework-agnostic runtime logging and build-time pruning for TypeScript packages',
  cleanUrls: true,
  lastUpdated: true,
  head: [
    [
      'link',
      {
        rel: 'icon',
        type: 'image/svg+xml',
        href: `${base}logo.svg`,
      },
    ],
    ['meta', { name: 'theme-color', content: '#172554' }],
  ],
  rewrites: {
    'en/:rest*': ':rest*',
  },
  locales: {
    root: enConfig,
    zh: zhConfig,
  },
  themeConfig: {
    logo: '/logo.svg',
    outline: 'deep',
    search: {
      provider: 'local',
      options: {
        locales: {
          zh: {
            translations: {
              button: {
                buttonText: '搜索',
                buttonAriaLabel: '搜索文档',
              },
              modal: {
                noResultsText: '没有结果',
                resetButtonTitle: '重置搜索',
                footer: {
                  selectText: '选择',
                  navigateText: '导航',
                  closeText: '关闭',
                },
              },
            },
          },
        },
      },
    },
    socialLinks: [
      {
        icon: 'github',
        link: 'https://github.com/XiSenao/docs-islands/tree/main/packages/logaria',
      },
    ],
  },
});
