import '@nolebase/vitepress-plugin-enhanced-mark/client/style.css';
import { inject } from '@vercel/analytics';
import 'virtual:group-icons.css';
import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import { h } from 'vue';
import EnhanceLayout from './components/EnhanceLayout.vue';
import DocsHeroMockup from './components/landing/DocsHeroMockup.vue';
import NavBarLogo from './components/NavBarLogo.vue';
import './styles/index.css';

const theme: Theme = {
  extends: DefaultTheme,
  Layout: () => {
    return h(EnhanceLayout, null, {
      'home-hero-image': () => h(DocsHeroMockup),
      'nav-bar-title-before': () => h(NavBarLogo),
    });
  },
  enhanceApp() {
    // Initialize Vercel Analytics
    inject();
  },
};

export default theme;
