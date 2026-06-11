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
  ? `Released under the MIT License. (${commitId})`
  : 'Released under the MIT License. (dev)';

const vitepressConfig: LocaleSpecificConfig<DefaultTheme.Config> & {
  label: string;
  link?: string;
} = {
  label: 'English',
  lang: 'en',
  description:
    'Render React islands inside VitePress Markdown without giving up its static-first model',

  themeConfig: {
    nav: [
      {
        text: 'Home',
        link: '/',
      },
      {
        text: 'Guide',
        activeMatch: '/guide/',
        link: '/guide/',
      },
      {
        text: 'Options',
        activeMatch: '/options/',
        link: '/options/',
      },
      {
        text: pkg.version,
        items: [
          {
            text: 'Changelog',
            link: 'https://github.com/senaoxi/docs-islands/blob/main/packages/vitepress/CHANGELOG.md',
          },
          {
            text: 'Contributing',
            link: 'https://github.com/senaoxi/docs-islands/blob/main/.github/CONTRIBUTING.md',
          },
        ],
      },
    ],
    sidebar: [
      {
        text: 'Guide',
        items: [
          {
            text: 'Introduction',
            link: '/guide/',
          },
          {
            text: 'Getting Started',
            link: '/guide/getting-started',
          },
          {
            text: 'How It Works',
            link: '/guide/how-it-works',
          },
          {
            text: 'Troubleshooting',
            link: '/guide/troubleshooting',
          },
        ],
      },
      {
        text: 'Options',
        items: [
          {
            text: 'logging',
            link: '/options/logging',
          },
          {
            text: 'Site DevTools',
            items: [
              {
                text: 'Overview',
                link: '/options/site-devtools/',
              },
              {
                text: 'Build-time Analysis',
                link: '/options/site-devtools/analysis',
              },
              {
                text: 'Providers and Models',
                link: '/options/site-devtools/models',
              },
              {
                text: 'Build Reports',
                link: '/options/site-devtools/build-reports',
              },
            ],
          },
        ],
      },
    ],
    footer: {
      message: footerMessage,
      copyright: `Copyright © 2025-present Senao Xi`,
    },
    docFooter: {
      prev: 'Previous page',
      next: 'Next page',
    },
    outline: {
      label: 'On this page',
      level: 'deep',
    },
    lastUpdated: {
      text: 'Last updated',
    },
    notFound: {
      title: 'Page Not Found',
      quote:
        'But if you do not change direction, and if you keep looking, you may end up where you are heading.',
      linkLabel: 'Go to home',
      linkText: 'Take me home',
    },
    langMenuLabel: 'Languages',
    returnToTopLabel: 'Return to top',
    sidebarMenuLabel: 'Menu',
    darkModeSwitchLabel: 'Theme',
    lightModeSwitchTitle: 'Switch to light theme',
    darkModeSwitchTitle: 'Switch to dark theme',
    skipToContentLabel: 'Skip to content',
  },
};

export default vitepressConfig;
