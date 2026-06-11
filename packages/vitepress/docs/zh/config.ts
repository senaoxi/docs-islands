import { loadEnv } from '@docs-islands/utils/env';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import type { DefaultTheme, LocaleSpecificConfig } from 'vitepress';

const __require = createRequire(import.meta.url);
const pkg = __require('@docs-islands/vitepress/package.json');
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

const vitepressConfig: LocaleSpecificConfig<DefaultTheme.Config> & {
  label: string;
  link?: string;
} = {
  label: '简体中文',
  lang: 'zh',
  description: '在 VitePress 的 Markdown 中渲染 React 孤岛组件',

  themeConfig: {
    nav: [
      {
        text: '首页',
        link: '/zh/',
      },
      {
        text: '指南',
        activeMatch: '/zh/guide/',
        link: '/zh/guide/',
      },
      {
        text: '配置与诊断',
        activeMatch: '/zh/options/',
        link: '/zh/options/logging',
      },
      {
        text: pkg.version,
        items: [
          {
            text: '更新日志',
            link: 'https://github.com/senaoxi/docs-islands/blob/main/packages/vitepress/CHANGELOG.md',
          },
          {
            text: '参与贡献',
            link: 'https://github.com/senaoxi/docs-islands/blob/main/.github/CONTRIBUTING.zh-CN.md',
          },
        ],
      },
    ],
    sidebar: [
      {
        text: '指南',
        items: [
          {
            text: '介绍',
            link: '/zh/guide/',
          },
          {
            text: '快速上手',
            link: '/zh/guide/getting-started',
          },
          {
            text: '工作原理',
            link: '/zh/guide/how-it-works',
          },
          {
            text: '排障',
            link: '/zh/guide/troubleshooting',
          },
        ],
      },
      {
        text: '配置与诊断',
        items: [
          {
            text: '日志配置',
            link: '/zh/options/logging',
          },
          {
            text: '站点开发工具',
            items: [
              {
                text: '概览',
                link: '/zh/options/site-devtools/',
              },
              {
                text: '构建期分析',
                link: '/zh/options/site-devtools/analysis',
              },
              {
                text: '提供商与模型',
                link: '/zh/options/site-devtools/models',
              },
              {
                text: '构建报告',
                link: '/zh/options/site-devtools/build-reports',
              },
            ],
          },
        ],
      },
    ],
    footer: {
      message: footerMessage,
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
