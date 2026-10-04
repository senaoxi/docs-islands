import { inBrowser, onContentUpdated, useData } from 'vitepress';
import { nextTick, onMounted, onUnmounted, type Ref, watch } from 'vue';

export function useArticleAccessibility(isArticle: Ref<boolean>): void {
  const { lang } = useData();
  let dispose: (() => void) | undefined;
  let mounted = true;

  async function refresh(): Promise<void> {
    if (!inBrowser) return;
    await nextTick();
    if (!mounted) return;
    dispose?.();
    dispose = undefined;
    if (!isArticle.value) return;

    const layout = document.querySelector<HTMLElement>('.Layout.di-article');
    if (!layout) return;
    const zh = lang.value.startsWith('zh');
    const regions = [
      ...layout.querySelectorAll<HTMLElement>('.di-table-region'),
    ];

    const updateTables = () => {
      for (const region of regions) {
        const scrollable = region.scrollWidth > region.clientWidth + 1;
        if (scrollable) {
          region.dataset.scrollable = 'true';
          region.tabIndex = 0;
          region.setAttribute('role', 'region');
          region.setAttribute(
            'aria-label',
            zh ? '可横向滚动的表格' : 'Scrollable table',
          );
          region.dataset.scrollLabel = zh
            ? '横向滚动查看其余列 →'
            : 'Scroll horizontally to view more columns →';
        } else {
          delete region.dataset.scrollable;
          region.removeAttribute('tabindex');
          region.removeAttribute('role');
          region.removeAttribute('aria-label');
          delete region.dataset.scrollLabel;
        }
      }
    };
    const resize = new ResizeObserver(updateTables);
    for (const region of regions) {
      resize.observe(region);
      const table = region.querySelector('table');
      if (table) resize.observe(table);
    }
    updateTables();

    for (const button of layout.querySelectorAll<HTMLButtonElement>(
      '.vp-doc div[class*="language-"] > button.copy',
    )) {
      const label = zh ? '复制代码' : 'Copy code';
      button.title = label;
      button.setAttribute('aria-label', label);
    }

    const dropdown = layout.querySelector<HTMLElement>(
      '.VPLocalNavOutlineDropdown',
    );
    const outlineTrigger = dropdown?.querySelector<HTMLButtonElement>('button');
    const syncOutline = () => {
      if (!dropdown || !outlineTrigger) return;
      const panel = dropdown.querySelector<HTMLElement>('.items');
      outlineTrigger.id = 'di-article-outline-trigger';
      const open = outlineTrigger.classList.contains('open');
      outlineTrigger.setAttribute('aria-expanded', String(open));
      outlineTrigger.setAttribute('aria-controls', 'di-article-outline');
      if (panel) {
        panel.id = 'di-article-outline';
        panel.setAttribute('role', 'region');
        panel.setAttribute('aria-labelledby', outlineTrigger.id);
        panel.inert = !open;
      }
    };
    const outlineObserver = new MutationObserver(syncOutline);
    if (dropdown) {
      outlineObserver.observe(dropdown, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class'],
      });
      syncOutline();
    }

    const sidebar = layout.querySelector<HTMLElement>('.VPSidebar');
    const menu = layout.querySelector<HTMLButtonElement>('.VPLocalNav .menu');
    const inertState = new Map<HTMLElement, boolean>();
    let sidebarWasOpen = false;
    let returnMenuFocus = false;
    const restoreBackground = () => {
      for (const [element, wasInert] of inertState) element.inert = wasInert;
      inertState.clear();
    };
    const mobileSidebarOpen = () =>
      window.innerWidth < 960 && Boolean(sidebar?.classList.contains('open'));

    const syncSidebar = () => {
      if (!sidebar) return;
      const open = mobileSidebarOpen();
      if (open && !sidebarWasOpen) {
        for (const child of layout.children) {
          if (
            !(child instanceof HTMLElement) ||
            child === sidebar ||
            child.classList.contains('VPBackdrop')
          )
            continue;
          inertState.set(child, child.inert);
          child.inert = true;
        }
        sidebar.setAttribute('role', 'dialog');
        sidebar.setAttribute('aria-modal', 'true');
        sidebar.setAttribute('aria-labelledby', 'sidebar-aria-label');
        sidebar
          .querySelector<HTMLElement>('#VPSidebarNav')
          ?.focus({ preventScroll: true });
      } else if (!open) {
        restoreBackground();
        sidebar.removeAttribute('role');
        sidebar.removeAttribute('aria-modal');
        sidebar.removeAttribute('aria-labelledby');
        if (sidebarWasOpen && returnMenuFocus)
          menu?.focus({ preventScroll: true });
        returnMenuFocus = false;
      }
      sidebarWasOpen = open;
    };
    const sidebarObserver = new MutationObserver(syncSidebar);
    if (sidebar)
      sidebarObserver.observe(sidebar, {
        attributes: true,
        attributeFilter: ['class'],
      });
    syncSidebar();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (mobileSidebarOpen()) returnMenuFocus = true;
        if (dropdown?.querySelector('.items')) {
          nextTick(() => outlineTrigger?.focus({ preventScroll: true }));
        }
      }
      if (event.key !== 'Tab' || !mobileSidebarOpen() || !sidebar) return;
      const focusable = [
        ...sidebar.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex="0"]',
        ),
      ].filter((element) => element.getClientRects().length);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      const active = document.activeElement;
      if (
        !sidebar.contains(active) ||
        active === sidebar.querySelector('#VPSidebarNav')
      ) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (
        (!event.shiftKey && active === last) ||
        (event.shiftKey && active === first)
      ) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    };
    const onPointer = (event: PointerEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest('.VPBackdrop')
      )
        returnMenuFocus = true;
    };
    document.addEventListener('keydown', onKey, true);
    layout.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('resize', syncSidebar);

    dispose = () => {
      resize.disconnect();
      outlineObserver.disconnect();
      sidebarObserver.disconnect();
      restoreBackground();
      document.removeEventListener('keydown', onKey, true);
      layout.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('resize', syncSidebar);
    };
  }

  onMounted(refresh);
  onContentUpdated(refresh);
  watch([isArticle, lang], refresh, { flush: 'post' });
  onUnmounted(() => {
    mounted = false;
    dispose?.();
  });
}
