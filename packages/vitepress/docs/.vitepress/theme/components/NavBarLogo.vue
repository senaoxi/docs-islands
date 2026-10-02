<script setup lang="ts">
import { useData, withBase } from 'vitepress';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps<{ active?: boolean }>();
const { isDark } = useData();
const logoHref = computed(() => withBase('/logo.svg'));
const logoRef = ref<InstanceType<typeof globalThis.SVGSVGElement> | null>(null);
const islandRef = ref<InstanceType<typeof globalThis.SVGUseElement> | null>(
  null,
);

let observer: IntersectionObserver | undefined;
let motionQuery: MediaQueryList | undefined;
let anchor: HTMLAnchorElement | null = null;
let animation: Animation | undefined;
let isVisible = false;
let hasEntered = false;

const stopAnimation = () => {
  animation?.cancel();
  animation = undefined;
};

const activateIsland = () => {
  const island = islandRef.value;
  if (
    !island ||
    !isVisible ||
    !motionQuery ||
    motionQuery.matches ||
    globalThis.document.hidden ||
    animation?.playState === 'running'
  ) {
    return;
  }

  // Match Limina's finite reveal cadence; keep the document boundary stationary.
  animation = island.animate(
    [
      { transform: 'translateY(0)', opacity: 1 },
      { transform: 'translateY(-3px)', opacity: 0.8, offset: 0.3 },
      { transform: 'translateY(0)', opacity: 1 },
    ],
    {
      duration: 700,
      delay: 140,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    },
  );
  animation.onfinish = () => {
    animation = undefined;
  };
};

const updateAvailability = () => {
  if (!isVisible || globalThis.document.hidden) {
    stopAnimation();
    return;
  }
  if (!hasEntered) {
    hasEntered = true;
    activateIsland();
  }
};

onMounted(() => {
  const logo = logoRef.value;
  if (!logo) {
    return;
  }

  motionQuery = globalThis.matchMedia('(prefers-reduced-motion: reduce)');
  motionQuery.addEventListener('change', stopAnimation);
  observer = new IntersectionObserver(([entry]) => {
    isVisible = entry?.isIntersecting ?? false;
    updateAvailability();
  });
  observer.observe(logo);
  anchor = logo.closest('a');
  anchor?.addEventListener('focus', activateIsland);
  anchor?.addEventListener('pointerenter', activateIsland);
  globalThis.document.addEventListener('visibilitychange', updateAvailability);
});

watch(() => isDark.value, activateIsland);
watch(
  () => props.active,
  (active) => {
    if (active) {
      activateIsland();
    }
  },
);

onBeforeUnmount(() => {
  observer?.disconnect();
  motionQuery?.removeEventListener('change', stopAnimation);
  anchor?.removeEventListener('focus', activateIsland);
  anchor?.removeEventListener('pointerenter', activateIsland);
  globalThis.document.removeEventListener(
    'visibilitychange',
    updateAvailability,
  );
  stopAnimation();
});
</script>

<template>
  <svg
    ref="logoRef"
    class="docs-islands-logo logo"
    viewBox="0 0 448 448"
    width="32"
    height="32"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    @pointerenter="activateIsland"
  >
    <use :href="`${logoHref}#docs-islands-vitepress-frame`" />
    <use
      ref="islandRef"
      class="logo-island"
      :href="`${logoHref}#docs-islands-vitepress-island`"
    />
  </svg>
</template>

<style scoped>
.logo {
  display: block;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  overflow: visible;
  color: #7051e8;
}

:global(.VPNavBarTitle .docs-islands-logo) {
  width: 32px;
  height: 32px;
  margin-right: 10px;
}

:global(.dark .docs-islands-logo) {
  color: #c3b4ff;
}

.logo-island {
  transform-box: fill-box;
  transform-origin: center;
}
</style>
