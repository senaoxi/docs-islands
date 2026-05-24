import type { DefaultTheme, LocaleSpecificConfig } from 'vitepress';

const sidebar: DefaultTheme.SidebarItem[] = [
  {
    text: 'Logaria',
    items: [
      {
        text: '概览',
        link: '/zh/',
      },
      {
        text: '快速开始',
        link: '/zh/getting-started',
      },
      {
        text: 'Runtime 配置',
        link: '/zh/runtime-config',
      },
      {
        text: '规则与 Preset',
        link: '/zh/rules-and-presets',
      },
      {
        text: '构建插件',
        link: '/zh/bundler-plugin',
      },
      {
        text: 'Scoped 集成',
        link: '/zh/scoped-integrations',
      },
      {
        text: 'API 参考',
        link: '/zh/api-reference',
      },
    ],
  },
];

const config: LocaleSpecificConfig<DefaultTheme.Config> & {
  label: string;
  link: string;
} = {
  label: '简体中文',
  lang: 'zh-CN',
  link: '/zh/',
  title: 'Logaria',
  description: '面向 TypeScript 包的框架无关 runtime logging 与构建期裁剪',
  themeConfig: {
    nav: [
      {
        text: '指南',
        link: '/zh/getting-started',
      },
      {
        text: 'API',
        link: '/zh/api-reference',
      },
      {
        text: 'npm',
        link: 'https://www.npmjs.com/package/logaria',
      },
    ],
    sidebar,
    footer: {
      message: '根据 MIT 许可证发布。',
      copyright: '版权所有 © 2026-present Logaria contributors',
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
