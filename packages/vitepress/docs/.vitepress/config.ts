import { loadEnv } from '@docs-islands/utils/env';
import { createDocsIslands } from '@docs-islands/vitepress';
import { react } from '@docs-islands/vitepress/adapters/react';
import { vitepress as vitepressLogger } from '@docs-islands/vitepress/logger/presets';
import { claude, doubao } from '@docs-islands/vitepress/models';
import isInCi from 'is-in-ci';
import { join } from 'pathe';
import { type DefaultTheme, defineConfig, type UserConfig } from 'vitepress';
import {
  groupIconMdPlugin,
  groupIconVitePlugin,
} from 'vitepress-plugin-group-icons';
import llmstxt from 'vitepress-plugin-llms';
import enConfig from '../en/config';
import zhConfig from '../zh/config';

const { release, siteDevtools } = loadEnv();
const { DOUBAO_BASE_URL, DOUBAO_API_KEY, CLAUDE_BASE_URL, CLAUDE_API_KEY } =
  siteDevtools;
const vitepressPackageName = '@docs-islands/vitepress';
const base = `/${vitepressPackageName.replace('@', '')}/`;
const claudeUS = claude.provider({
  label: 'Claude US',
  baseUrl: CLAUDE_BASE_URL,
  apiKey: CLAUDE_API_KEY,
  timeoutMs: 300_000,
});
const doubaoCN = doubao.provider({
  label: 'Doubao CN',
  baseUrl: DOUBAO_BASE_URL,
  apiKey: DOUBAO_API_KEY,
  timeoutMs: 300_000,
});
const claudeOpus = claudeUS.model({
  label: 'Claude Opus',
  maxTokens: 4096,
  model: 'claude-opus-4-7',
  default: true,
});
const doubaoPro = doubaoCN.model({
  label: 'Doubao Pro',
  model: 'doubao-seed-2-0-pro-260215',
  temperature: 0.2,
  thinking: true,
  maxTokens: 4096,
});
const claudeOpusCacheId = 'claude-opus';

const docsLoggerProbePreset = {
  rules: {
    controlledVisible: {
      group: 'docs.logger.injected.visible',
      levels: 'inherit',
      main: '@docs-islands/vitepress-docs/logger-scope-playground',
    },
  },
} as const;

const vitepressConfig: UserConfig<DefaultTheme.Config> = defineConfig({
  base,
  title: '@docs-islands/vitepress',

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
      {
        name: 'vite-plugin-environment-api-dependency-module-hot-update',
        apply: 'serve',
        async handleHotUpdate(ctx) {
          const { file, server, modules } = ctx;

          if (file.includes('local-data.json')) {
            const updateModuleEntryPath = join(file, '../', 'ReactComp2.tsx');
            const updateModuleEntry = await server.moduleGraph.getModuleByUrl(
              updateModuleEntryPath,
            );
            if (updateModuleEntry) {
              server.moduleGraph.invalidateModule(
                updateModuleEntry,
                new Set(),
                Date.now(),
                true,
              );
              return [updateModuleEntry];
            }
          }

          return modules;
        },
      },
      groupIconVitePlugin(),
      release &&
        llmstxt({
          workDir: 'en',
        }),
    ],
  },
  themeConfig: {
    outline: 'deep',
    socialLinks: [
      {
        icon: 'github',
        link: 'https://github.com/XiSenao/docs-islands/tree/main/packages/vitepress',
      },
    ],
  },
});

createDocsIslands({
  adapters: [react()],
  logging: {
    debug: true,
    treeshake: true,
    levels: release ? ['warn', 'error'] : ['info', 'success', 'warn', 'error'],
    plugins: {
      docsLoggerProbe: docsLoggerProbePreset,
      vitepress: vitepressLogger,
    },
    extends: ['vitepress/runtime'],
    rules: {
      'docsLoggerProbe/controlledVisible': {
        levels: ['info'],
      },
      'vitepress/aiBuildReports': {
        levels: ['info', 'success', 'warn', 'error'],
      },
      'vitepress/aiServer': {
        levels: ['info', 'success', 'warn', 'error'],
      },
      'vitepress/markdownUpdate': {
        levels: ['info', 'success', 'warn', 'error'],
        message: '*changed, container script content will be re-parsed...*',
      },
    },
  },
  siteDevtools: {
    analysis: {
      providers: [claudeUS, doubaoCN],
      buildReports: {
        cache: {
          dir: '.vitepress/site-devtools-reports',
          // Environmental factors can cause prompts to be unstable, thereby destroying cacheKey.
          strategy: isInCi ? 'fallback' : 'exact',
        },
        includeChunks: true,
        includeModules: true,
        models: [claudeOpus, doubaoPro],
        resolvePage: ({ page }) => {
          const { routePath } = page;

          if (!routePath) {
            return null;
          }

          const cacheDir = `${claudeOpusCacheId}/${routePath.replaceAll('/', '__')}`;

          return {
            model: claudeOpus,
            cache: {
              dir: `.vitepress/site-devtools-reports/${cacheDir}`,
              strategy: isInCi ? 'fallback' : 'exact',
            },
          };
        },
      },
    },
  },
}).apply(vitepressConfig);

export default vitepressConfig;
