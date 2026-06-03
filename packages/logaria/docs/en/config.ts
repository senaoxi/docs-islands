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
  ? `Released under the MIT License. (${commitId})`
  : 'Released under the MIT License. (dev)';

const sidebar: DefaultTheme.SidebarItem[] = [
  {
    text: 'Introduction',
    items: [
      {
        text: 'Overview',
        link: '/',
      },
      {
        text: 'Why Logaria',
        link: '/why',
      },
      {
        text: 'Project Philosophy',
        link: '/philosophy',
      },
      {
        text: 'Getting Started',
        link: '/getting-started',
      },
    ],
  },
  {
    text: 'Guide',
    items: [
      {
        text: 'Runtime Config',
        link: '/runtime-config',
      },
      {
        text: 'Rules & Presets',
        link: '/rules-and-presets',
      },
      {
        text: 'Bundler Plugin',
        link: '/bundler-plugin',
      },
      {
        text: 'Scoped Integrations',
        link: '/scoped-integrations',
      },
      {
        text: 'Troubleshooting',
        link: '/troubleshooting',
      },
    ],
  },
  {
    text: 'Reference',
    items: [
      {
        text: 'API Reference',
        link: '/api-reference',
      },
    ],
  },
];

const config: LocaleSpecificConfig<DefaultTheme.Config> & {
  label: string;
} = {
  label: 'English',
  lang: 'en-US',
  title: 'Logaria',
  description:
    'A framework-agnostic TypeScript logger with rule-based runtime filtering and build-time pruning — debug-rich code, clean production bundles.',
  themeConfig: {
    nav: [
      {
        text: 'Guide',
        link: '/getting-started',
        activeMatch:
          '^/(getting-started|why|philosophy|runtime-config|rules-and-presets|bundler-plugin|scoped-integrations|troubleshooting)',
      },
      {
        text: 'API',
        link: '/api-reference',
        activeMatch: '^/api-reference',
      },
      {
        text: pkg.version,
        items: [
          {
            text: 'Changelog',
            link: 'https://github.com/XiSenao/docs-islands/blob/main/packages/logaria/CHANGELOG.md',
          },
          {
            text: 'Contributing',
            link: 'https://github.com/XiSenao/docs-islands/blob/main/.github/CONTRIBUTING.md',
          },
        ],
      },
    ],
    sidebar,
    footer: {
      message: footerMessage,
      copyright: 'Copyright © 2026-present Logaria contributors',
    },
  },
};

export default config;
