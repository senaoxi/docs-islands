<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue';

const props = defineProps<{ locale: 'en' | 'zh' }>();
const copy = computed(() =>
  props.locale === 'zh'
    ? {
        label: '配置完成后的 Markdown 示例',
        typing: '正在输入示例',
        paused: '已暂停',
        ready: '完整示例',
        waiting: '等待播放',
        pause: '暂停',
        resume: '继续',
        replay: '重播',
        copy: '复制',
        copyLabel: '复制完整 Markdown 示例',
        copied: '已复制',
        copyFailed: '请选中代码复制',
      }
    : {
        label: 'Markdown, after setup',
        typing: 'Typing example',
        paused: 'Paused',
        ready: 'Full example',
        waiting: 'Ready to play',
        pause: 'Pause',
        resume: 'Resume',
        replay: 'Replay',
        copy: 'Copy',
        copyLabel: 'Copy the complete Markdown example',
        copied: 'Copied',
        copyFailed: 'Select the code to copy',
      },
);
const source = `<script lang="react">\n  import Counter from './Counter';\n\u003C/script>\n\n<Counter client:visible />`;
const codeId = useId();
const labelId = useId();
const exampleRoot = ref<HTMLElement>();
// SSR and readers without JavaScript receive the complete example.
const progress = ref(source.length);
const mounted = ref(false);
const reducedMotion = ref(true);
const inView = ref(false);
const pageVisible = ref(true);
const paused = ref(false);
const copyState = ref<'idle' | 'copied' | 'failed'>('idle');
const complete = computed(() => progress.value === source.length);
const visibleSource = computed(() => source.slice(0, progress.value));
const playing = computed(
  () =>
    mounted.value &&
    !complete.value &&
    !reducedMotion.value &&
    !paused.value &&
    inView.value &&
    pageVisible.value,
);
const status = computed(() => {
  if (copyState.value === 'copied') return copy.value.copied;
  if (copyState.value === 'failed') return copy.value.copyFailed;
  if (complete.value) return copy.value.ready;
  if (paused.value) return copy.value.paused;
  return playing.value ? copy.value.typing : copy.value.waiting;
});

let timer: ReturnType<typeof globalThis.setTimeout> | undefined;
let copyTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
let observer: IntersectionObserver | undefined;
let media: MediaQueryList | undefined;
let elapsed = 0;
let remaining = 320;
let lastTick = 0;

const stop = () => {
  globalThis.clearTimeout(timer);
  timer = undefined;
};
const start = () => {
  if (timer !== undefined || !playing.value) return;
  lastTick = globalThis.performance.now();
  // Small capped ticks keep the typing rhythm steady after browser stalls.
  timer = globalThis.setTimeout(tick, 40);
};
const tick = () => {
  timer = undefined;
  if (!playing.value) return;
  const now = globalThis.performance.now();
  elapsed += Math.min(now - lastTick, 120);
  lastTick = now;
  while (elapsed >= remaining && !complete.value) {
    elapsed -= remaining;
    progress.value += 1;
    const previous = source[progress.value - 1];
    remaining = previous === '\n' ? 420 : previous === ' ' ? 95 : 42;
  }
  if (playing.value) timer = globalThis.setTimeout(tick, 40);
};
watch(playing, (active) => (active ? start() : stop()), { flush: 'sync' });

const replay = () => {
  if (reducedMotion.value) return;
  stop();
  elapsed = 0;
  remaining = 320;
  progress.value = 0;
  paused.value = false;
  start();
};
const copySelection = (event: ClipboardEvent) => {
  if (!complete.value && event.clipboardData) {
    event.clipboardData.setData('text/plain', source);
    event.preventDefault();
  }
};
const copySource = async () => {
  globalThis.clearTimeout(copyTimer);
  try {
    await globalThis.window.navigator.clipboard.writeText(source);
    if (!mounted.value) return;
    copyState.value = 'copied';
  } catch {
    if (!mounted.value) return;
    // The full text remains selectable when clipboard access is unavailable.
    progress.value = source.length;
    copyState.value = 'failed';
  }
  copyTimer = globalThis.setTimeout(() => {
    copyState.value = 'idle';
  }, 2400);
};
const onVisibility = () => {
  pageVisible.value = !globalThis.document.hidden;
};
const onMotion = (event: MediaQueryListEvent) => {
  reducedMotion.value = event.matches;
  if (event.matches) {
    progress.value = source.length;
    paused.value = false;
  }
};

onMounted(() => {
  media = globalThis.matchMedia('(prefers-reduced-motion: reduce)');
  reducedMotion.value = media.matches;
  pageVisible.value = !globalThis.document.hidden;
  if (!media.matches) progress.value = 0;
  mounted.value = true;
  observer = new IntersectionObserver(
    ([entry]) => {
      inView.value = entry.isIntersecting && entry.intersectionRatio >= 0.15;
    },
    { threshold: [0, 0.15] },
  );
  if (exampleRoot.value) observer.observe(exampleRoot.value);
  media.addEventListener('change', onMotion);
  globalThis.document.addEventListener('visibilitychange', onVisibility);
});
onBeforeUnmount(() => {
  mounted.value = false;
  stop();
  globalThis.clearTimeout(copyTimer);
  observer?.disconnect();
  media?.removeEventListener('change', onMotion);
  globalThis.document.removeEventListener('visibilitychange', onVisibility);
});
</script>

<template>
  <div ref="exampleRoot" class="markdown-terminal">
    <div class="terminal-chrome">
      <div class="terminal-file">
        <svg viewBox="0 0 16 16" aria-hidden="true" fill="none">
          <path
            d="M9.5 2H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5.5L9.5 2Z M9 2v4h4M5.5 9h5M5.5 11h3"
            stroke="currentColor"
            stroke-width="1.2"
            stroke-linejoin="round"
          />
        </svg>
        <span>index.md</span>
      </div>
      <span :id="labelId" class="source-kind">{{ copy.label }}</span>
    </div>
    <div
      :id="codeId"
      class="code-region"
      role="region"
      :aria-labelledby="labelId"
      tabindex="0"
      @copy="copySelection"
    >
      <pre
        class="terminal-code"
        aria-hidden="true"
      ><code class="code-reserve">{{ source }}</code><code class="code-visible"><span class="typed-source">{{ visibleSource }}</span><span v-if="!complete && !reducedMotion" class="terminal-cursor" :class="{ 'is-playing': playing }"></span></code></pre>
      <pre class="sr-only"><code>{{ source }}</code></pre>
    </div>
    <div class="terminal-controls">
      <span class="playback-status" role="status" aria-live="polite">{{
        status
      }}</span>
      <div class="playback-buttons">
        <button
          type="button"
          class="pause-button"
          :disabled="complete || reducedMotion"
          :aria-controls="codeId"
          :aria-label="paused ? copy.resume : copy.pause"
          @click="paused = !paused"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path v-if="paused" d="M5 3 12 8 5 13Z" />
            <path v-else d="M4 3h3v10H4zM9 3h3v10H9z" /></svg
          >{{ paused ? copy.resume : copy.pause }}
        </button>
        <button
          type="button"
          class="replay-button"
          :disabled="reducedMotion"
          :aria-controls="codeId"
          @click="replay"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true" fill="none">
            <path
              d="M3 6a5 5 0 1 1-.1 4M3 2v4h4"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            /></svg
          >{{ copy.replay }}
        </button>
        <button
          type="button"
          class="copy-button"
          :aria-controls="codeId"
          :aria-label="copyState === 'copied' ? copy.copied : copy.copyLabel"
          @click="copySource"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true" fill="none">
            <path
              v-if="copyState === 'copied'"
              d="m3 8 3 3 7-7"
              stroke="currentColor"
              stroke-width="1.5"
            />
            <g v-else stroke="currentColor" stroke-width="1.3">
              <rect x="5" y="5" width="8" height="8" rx="1" />
              <path
                d="M10 5V3a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2"
              />
            </g></svg
          >{{ copyState === 'copied' ? copy.copied : copy.copy }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.markdown-terminal {
  padding: 20px 22px 12px;
  background: color-mix(
    in srgb,
    var(--docs-home-bg) 35%,
    var(--docs-home-surface)
  );
}
.terminal-chrome,
.terminal-file {
  display: flex;
  align-items: center;
}
.terminal-chrome {
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 8px;
  color: var(--vp-c-text-2);
  font-size: 11px;
}
.terminal-file {
  gap: 12px;
  font-family: var(--docs-home-font-mono);
}
.terminal-file svg {
  width: 14px;
  height: 14px;
}
.terminal-code {
  display: grid;
  margin: 24px 0 18px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 13px;
  line-height: 1.9;
  color: var(--docs-home-accent-strong);
}
.terminal-code code {
  grid-area: 1 / 1;
  min-width: 0;
  font-family: var(--docs-home-font-mono);
}
.code-reserve {
  visibility: hidden;
}
.code-region:focus-visible {
  outline: 2px solid var(--docs-home-accent-strong);
  outline-offset: 5px;
  border-radius: 3px;
}
.terminal-cursor {
  display: inline-block;
  width: 0.55em;
  height: 1em;
  margin-left: 2px;
  vertical-align: -0.18em;
  background: currentColor;
}
.terminal-cursor.is-playing {
  animation: markdown-cursor 1s steps(1) infinite;
}
.terminal-controls {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  border-top: 1px solid var(--docs-home-border);
  padding-top: 8px;
}
.playback-status {
  color: var(--vp-c-text-2);
  font-size: 11px;
}
.playback-buttons {
  display: flex;
  gap: 4px;
  margin-left: auto;
}
button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 44px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 5px;
  color: var(--vp-c-text-2);
  font-size: 11px;
  cursor: pointer;
}
button svg {
  width: 14px;
  height: 14px;
  fill: currentColor;
}
button svg[fill='none'] {
  fill: none;
}
button:hover:enabled {
  color: var(--docs-home-accent-strong);
  background: var(--docs-home-primary-soft);
}
button:disabled {
  opacity: 0.45;
  cursor: default;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: pre;
}
@keyframes markdown-cursor {
  0%,
  55% {
    opacity: 1;
  }
  56%,
  100% {
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .terminal-cursor {
    display: none;
  }
}
</style>
