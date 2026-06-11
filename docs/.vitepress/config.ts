import { loadEnv } from '@docs-islands/utils/env';
import type { DefaultTheme, UserConfig } from 'vitepress';
import { defineConfig } from 'vitepress';
import {
  groupIconMdPlugin,
  groupIconVitePlugin,
} from 'vitepress-plugin-group-icons';
import llmstxt from 'vitepress-plugin-llms';
import enConfig from '../en/config';
import zhConfig from '../zh/config';
import { dynamicProxyPlugin } from './dynamicProxyPlugin';

const { release } = loadEnv();

const base = '/docs-islands/';

const vitepressConfig: UserConfig<DefaultTheme.Config> = defineConfig({
  base,
  title: 'Docs Islands',

  rewrites: {
    'en/:rest*': ':rest*',
  },
  head: [
    [
      'link',
      {
        rel: 'icon',
        type: 'image/svg+xml',
        href: `${base}favicon.svg`,
      },
    ],
    [
      'link',
      {
        rel: 'mask-icon',
        href: `${base}safari-pinned-tab.svg`,
        color: '#646CFF',
      },
    ],
    ['meta', { name: 'theme-color', content: '#0f172a' }],
  ],
  lastUpdated: true,
  cleanUrls: true,
  metaChunk: true,
  locales: {
    root: enConfig,
    zh: zhConfig,
  },
  markdown: {
    config: (md) => {
      md.use(groupIconMdPlugin);
    },
  },
  vite: {
    plugins: [
      dynamicProxyPlugin(),
      groupIconVitePlugin(),
      release &&
        llmstxt({
          workDir: 'en',
          ignoreFiles: ['index.md'],
        }),
    ],
  },
  themeConfig: {
    outline: 'deep',
    socialLinks: [
      {
        icon: 'github',
        link: 'https://github.com/senaoxi/docs-islands',
      },
    ],
  },
});

export default vitepressConfig;
