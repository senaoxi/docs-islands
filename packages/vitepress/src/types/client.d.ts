/// <reference types="vite/client" />

import type { PageMetafile } from '#dep-types/page';
import type { SiteDevToolsUserConfig } from '#dep-types/utils';
import type { RENDER_STRATEGY_CONSTANTS } from '@docs-islands/core/shared/constants/render-strategy';
import type {
  DocsInjectComponent,
  DocsRuntimeManagerLike,
} from '@docs-islands/core/types/client';

import type * as ReactRuntime from 'react';
import type * as ReactDOMClient from 'react-dom/client';
import type { DefaultTheme, SiteConfig } from 'vitepress';

/**
 * Compatible VitePress extension types.
 * https://github.com/vuejs/vitepress/blob/6dfcdd3fe8dc73e7b4ad7783df9530dedac1f6bd/src/node/plugin.ts#L36-L40
 */
declare module 'vite' {
  interface UserConfig {
    vitepress?: SiteConfig<DefaultTheme.Config>;
  }
}

declare module 'vitepress' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- must match upstream VitePress generic default for declaration merging
  interface UserConfig<ThemeConfig = any> {
    themeConfig?: ThemeConfig;
    siteDevtools?: SiteDevToolsUserConfig;
  }
}

declare global {
  // Define-time global constant injected via bundler `define`.
  const __BASE__: string | undefined;
  const __CLEAN_URLS__: boolean | undefined;
  // Global React and ReactDOM runtime (loaded dynamically)
  var React: typeof React | undefined;
  var ReactDOM: typeof ReactDOMClient | undefined;

  interface Window {
    __VP_SITE_DATA__?: {
      base?: string;
      cleanUrls?: boolean;
    };
    React?: typeof ReactRuntime;
    ReactDOM?: typeof ReactDOMClient;

    [RENDER_STRATEGY_CONSTANTS.pageMetafile]: Record<string, PageMetafile>;
    [RENDER_STRATEGY_CONSTANTS.componentManager]?: DocsRuntimeManagerLike;
    [RENDER_STRATEGY_CONSTANTS.injectComponent]: DocsInjectComponent<unknown>;
  }
}
