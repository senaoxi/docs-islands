import { loadEnv } from '@docs-islands/utils/env';
import pkg from 'logaria/package.json';
import { execSync } from 'node:child_process';
import type { DefaultTheme, LocaleSpecificConfig } from 'vitepress';

const { env } = loadEnv();
const isBuild = env === 'production';

function resolveCommitId(): string | null {
  if (!isBuild) {
    return 'dev';
  }

  try {
    return execSync('git rev-parse --short=7 HEAD', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

const commitId = resolveCommitId();
const footerMessage = commitId
  ? `根据 MIT 许可证发布。 (${commitId})`
  : '根据 MIT 许可证发布。 (dev)';

const sidebar: DefaultTheme.SidebarItem[] = [
  {
    text: '指南',
    items: [
      {
        text: '介绍',
        link: '/zh/introduction',
      },
      {
        text: '为什么是 Logaria',
        link: '/zh/why',
      },
      {
        text: '快速开始',
        link: '/zh/getting-started',
      },
      {
        text: '特性一览',
        link: '/zh/features',
      },
    ],
  },
  {
    text: '深入',
    items: [
      {
        text: '核心概念',
        link: '/zh/concepts',
      },
      {
        text: '运行时配置',
        link: '/zh/runtime-config',
      },
      {
        text: '规则与预设',
        link: '/zh/rules-and-presets',
      },
      {
        text: '构建插件',
        link: '/zh/bundler-plugin',
      },
      {
        text: '作用域集成',
        link: '/zh/scoped-integrations',
      },
    ],
  },
  {
    text: '参考',
    items: [
      {
        text: 'API 参考',
        link: '/zh/api-reference',
      },
      {
        text: '常见问题',
        link: '/zh/troubleshooting',
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
  description:
    '框架无关的 TypeScript 日志器，结合规则化运行时过滤与构建期裁剪——开发时尽情记录，生产构建保持干净。',
  themeConfig: {
    nav: [
      {
        text: '指南',
        link: '/zh/introduction',
        activeMatch: '^/zh/(introduction|why|getting-started|features)',
      },
      {
        text: '深入',
        link: '/zh/concepts',
        activeMatch:
          '^/zh/(concepts|runtime-config|rules-and-presets|bundler-plugin|scoped-integrations)',
      },
      {
        text: '参考',
        link: '/zh/api-reference',
        activeMatch: '^/zh/(api-reference|troubleshooting)',
      },
      {
        text: pkg.version,
        items: [
          {
            text: '更新日志',
            link: 'https://github.com/senaoxi/docs-islands/blob/main/packages/logaria/CHANGELOG.md',
          },
          {
            text: '参与贡献',
            link: 'https://github.com/senaoxi/docs-islands/blob/main/.github/CONTRIBUTING.md',
          },
        ],
      },
    ],
    sidebar,
    footer: {
      message: footerMessage,
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
