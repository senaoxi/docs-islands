import type { DefaultTheme, LocaleSpecificConfig } from 'vitepress';

const config: LocaleSpecificConfig<DefaultTheme.Config> & {
  label: string;
  link: string;
} = {
  label: '简体中文',
  lang: 'zh-CN',
  link: '/zh/',
  title: 'Limina',
  description: '面向 TypeScript monorepo 的架构治理 CLI',
  themeConfig: {
    nav: [
      {
        text: '指南',
        link: '/zh/limina',
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
            text: '概览',
            link: '/zh/',
          },
          {
            text: '指南',
            link: '/zh/limina',
          },
        ],
      },
    ],
    footer: {
      message: '根据 MIT 许可证发布。',
      copyright: '版权所有 © 2026-present Limina contributors',
    },
    docFooter: {
      prev: '上一页',
      next: '下一页',
    },
    outline: {
      label: '页面导航',
      level: 'deep',
    },
    lastUpdated: {
      text: '最后更新于',
    },
    langMenuLabel: '多语言',
    returnToTopLabel: '回到顶部',
    sidebarMenuLabel: '菜单',
    darkModeSwitchLabel: '主题',
    lightModeSwitchTitle: '切换到浅色模式',
    darkModeSwitchTitle: '切换到深色模式',
    skipToContentLabel: '跳转到内容',
  },
};

export default config;
