import type { DefaultTheme, LocaleSpecificConfig } from 'vitepress';

const vitepressConfig: LocaleSpecificConfig<DefaultTheme.Config> & {
  label: string;
  link?: string;
} = {
  label: '简体中文',
  lang: 'zh',
  description: '面向文档站点的跨框架 Islands 架构',

  themeConfig: {
    nav: [
      {
        text: '产品',
        items: [
          {
            text: '@docs-islands/vitepress',
            link: '/vitepress/zh/',
            target: '_blank',
          },
          {
            text: 'limina',
            link: '/limina/zh/',
            target: '_blank',
          },
          {
            text: 'logaria',
            link: '/logaria/zh/',
            target: '_blank',
          },
        ],
      },
      {
        text: 'Skills',
        link: '/zh/guide/skills',
      },
      {
        text: '参与贡献',
        link: 'https://github.com/XiSenao/docs-islands/blob/main/.github/CONTRIBUTING.zh-CN.md',
      },
    ],
    footer: {
      message: '根据 MIT 许可证发布。',
      copyright: `版权所有 © 2025-present Senao Xi`,
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

    notFound: {
      title: '页面未找到',
      quote:
        '但如果你不改变方向，并且继续寻找，你可能最终会到达你所前往的地方。',
      linkLabel: '前往首页',
      linkText: '带我回首页',
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

export default vitepressConfig;
