<script setup lang="ts">
import {
  createLogger,
  resetLoggerConfig,
  setLoggerConfig,
} from '@docs-islands/logger';
import { computed, onBeforeUnmount, ref } from 'vue';
import './logger-pruning-fixture';

type LoggerConfigInput = Parameters<typeof setLoggerConfig>[0];
type Locale = 'en' | 'zh';
type ScenarioId = 'default' | 'quiet' | 'debug' | 'rules';
type ConsoleMethod = 'debug' | 'error' | 'log' | 'warn';

interface ScenarioDefinition {
  config?: LoggerConfigInput;
  id: ScenarioId;
  labels: Record<Locale, string>;
  notes: Record<Locale, string>;
}

interface CapturedLog {
  id: number;
  message: string;
  method: ConsoleMethod;
}

const props = withDefaults(
  defineProps<{
    locale?: Locale;
  }>(),
  {
    locale: 'en',
  },
);

const copy = {
  en: {
    clear: 'Clear',
    config: 'Active config',
    empty: 'Run a scenario to capture logger output here.',
    output: 'Captured output',
    run: 'Run scenario',
    title: 'Runtime logger demo',
  },
  zh: {
    clear: '清空',
    config: '当前配置',
    empty: '运行一个场景后，这里会显示捕获到的 logger 输出。',
    output: '捕获输出',
    run: '运行场景',
    title: 'Runtime logger 演示',
  },
} satisfies Record<Locale, Record<string, string>>;

const scenarios: ScenarioDefinition[] = [
  {
    id: 'default',
    labels: {
      en: 'Default',
      zh: '默认策略',
    },
    notes: {
      en: 'Default visibility keeps info, success, warn, and error; debug stays hidden.',
      zh: '默认可见 info、success、warn、error；debug 保持隐藏。',
    },
  },
  {
    config: {
      levels: ['warn', 'error'],
    },
    id: 'quiet',
    labels: {
      en: 'Warn and error',
      zh: '仅 warn/error',
    },
    notes: {
      en: 'A quiet runtime profile keeps only warning and error messages visible.',
      zh: '安静的 runtime 配置只保留 warning 与 error 输出。',
    },
  },
  {
    config: {
      debug: true,
      levels: ['info', 'success', 'warn', 'error'],
    },
    id: 'debug',
    labels: {
      en: 'Debug mode',
      zh: 'Debug 模式',
    },
    notes: {
      en: 'Debug mode reveals debug calls and appends elapsed-time metadata to visible non-debug logs.',
      zh: 'Debug 模式会显示 debug 调用，并为可见的非 debug 日志追加耗时信息。',
    },
  },
  {
    config: {
      debug: true,
      levels: ['error'],
      rules: {
        'docs-demo-flow': {
          group: 'runtime.demo',
          levels: ['info', 'warn'],
          main: 'docs.logger',
        },
        'docs-demo-error': {
          group: 'runtime.demo',
          levels: ['error'],
          main: 'docs.logger',
          message: 'error survives strict filters',
        },
      },
    },
    id: 'rules',
    labels: {
      en: 'Rule mode',
      zh: '规则模式',
    },
    notes: {
      en: 'Rules can narrow output by main, group, message, and level while debug labels explain each match.',
      zh: '规则可以按 main、group、message 与 level 收窄输出，并用 debug label 标记命中来源。',
    },
  },
];

const DEFAULT_LOGGER_CONFIG_PREVIEW = null;

const activeScenarioId = ref<ScenarioId>('default');
const capturedLogs = ref<CapturedLog[]>([]);

const localized = computed(() => copy[props.locale]);

const activeScenario = computed(
  () =>
    scenarios.find((scenario) => scenario.id === activeScenarioId.value) ??
    scenarios[0],
);

const activeConfig = computed(() =>
  JSON.stringify(
    activeScenario.value.config ?? DEFAULT_LOGGER_CONFIG_PREVIEW,
    null,
    2,
  ),
);

const stringifyConsoleArg = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const renderConsoleMessage = (args: unknown[]): string => {
  const [firstArg] = args;

  if (typeof firstArg === 'string' && firstArg.includes('%c')) {
    return firstArg.replaceAll('%c', '');
  }

  return args.map((arg) => stringifyConsoleArg(arg)).join(' ');
};

const captureConsole = (run: () => void): CapturedLog[] => {
  const methods: readonly ConsoleMethod[] = ['debug', 'error', 'log', 'warn'];
  const originals = new Map<ConsoleMethod, (...data: unknown[]) => void>();
  const rows: CapturedLog[] = [];

  for (const method of methods) {
    originals.set(method, globalThis.console[method].bind(globalThis.console));
    globalThis.console[method] = (...args: unknown[]) => {
      rows.push({
        id: rows.length + 1,
        message: renderConsoleMessage(args),
        method,
      });

      originals.get(method)?.(...args);
    };
  }

  try {
    run();
  } finally {
    for (const method of methods) {
      const original = originals.get(method);

      if (original) {
        globalThis.console[method] = original;
      }
    }
  }

  return rows;
};

const emitDemoLogs = (): void => {
  const mainLogger = createLogger({ main: 'docs.logger' });
  const logger = mainLogger.getLoggerByGroup('runtime.demo');

  logger.info('info survives the active logger config', {
    elapsedTimeMs: 8,
  });
  logger.success('success survives the active logger config', {
    elapsedTimeMs: 13,
  });
  logger.warn('warn survives the active logger config', {
    elapsedTimeMs: 21,
  });
  logger.error('error survives strict filters', {
    elapsedTimeMs: 34,
  });
  logger.debug('debug only appears when debug is enabled');
};

const runScenario = (scenario: ScenarioDefinition): void => {
  activeScenarioId.value = scenario.id;
  if (scenario.config === undefined) {
    resetLoggerConfig();
  } else {
    setLoggerConfig(scenario.config);
  }
  capturedLogs.value = captureConsole(emitDemoLogs);
};

const clearOutput = (): void => {
  capturedLogs.value = [];
};

onBeforeUnmount(() => {
  resetLoggerConfig();
});
</script>

<template>
  <section class="logger-demo">
    <div class="logger-demo__header">
      <h2>{{ localized.title }}</h2>
      <div class="logger-demo__actions">
        <button
          v-for="scenario in scenarios"
          :key="scenario.id"
          :aria-pressed="activeScenarioId === scenario.id"
          class="logger-demo__scenario"
          type="button"
          @click="runScenario(scenario)"
        >
          {{ scenario.labels[locale] }}
        </button>
      </div>
    </div>

    <p class="logger-demo__note">{{ activeScenario.notes[locale] }}</p>

    <div class="logger-demo__grid">
      <section class="logger-demo__panel">
        <div class="logger-demo__panel-head">
          <h3>{{ localized.config }}</h3>
          <button
            class="logger-demo__run"
            type="button"
            @click="runScenario(activeScenario)"
          >
            {{ localized.run }}
          </button>
        </div>
        <pre><code>{{ activeConfig }}</code></pre>
      </section>

      <section class="logger-demo__panel">
        <div class="logger-demo__panel-head">
          <h3>{{ localized.output }}</h3>
          <button class="logger-demo__ghost" type="button" @click="clearOutput">
            {{ localized.clear }}
          </button>
        </div>
        <ol v-if="capturedLogs.length > 0" class="logger-demo__output">
          <li
            v-for="entry in capturedLogs"
            :key="entry.id"
            :data-method="entry.method"
          >
            <span>{{ entry.method }}</span>
            <code>{{ entry.message }}</code>
          </li>
        </ol>
        <p v-else class="logger-demo__empty">{{ localized.empty }}</p>
      </section>
    </div>
  </section>
</template>

<style scoped>
.logger-demo {
  margin: 32px 0;
  padding: 20px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg-soft);
}

.logger-demo__header,
.logger-demo__panel-head {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
}

.logger-demo__header {
  flex-wrap: wrap;
}

.logger-demo h2,
.logger-demo h3,
.logger-demo p {
  margin: 0;
}

.logger-demo h2 {
  font-size: 20px;
  line-height: 1.3;
}

.logger-demo h3 {
  font-size: 14px;
  line-height: 1.4;
}

.logger-demo__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.logger-demo button {
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease,
    color 0.2s ease;
}

.logger-demo button:hover {
  border-color: var(--vp-c-brand-1);
}

.logger-demo__scenario[aria-pressed='true'],
.logger-demo__run {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-bg);
  background: var(--vp-c-brand-1);
}

.logger-demo__ghost {
  color: var(--vp-c-text-2);
}

.logger-demo__note {
  margin-top: 14px;
  color: var(--vp-c-text-2);
  font-size: 14px;
  line-height: 1.7;
}

.logger-demo__grid {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  gap: 16px;
  margin-top: 18px;
}

.logger-demo__panel {
  min-width: 0;
  padding: 16px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg);
}

.logger-demo pre {
  min-height: 180px;
  margin: 14px 0 0;
  padding: 14px;
  overflow: auto;
  border-radius: 6px;
  background: var(--vp-code-block-bg);
}

.logger-demo code {
  white-space: pre-wrap;
  word-break: break-word;
}

.logger-demo__output {
  display: grid;
  gap: 10px;
  margin: 14px 0 0;
  padding: 0;
  list-style: none;
}

.logger-demo__output li {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr);
  gap: 10px;
  align-items: start;
  padding: 10px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: var(--vp-c-bg-soft);
}

.logger-demo__output span {
  color: var(--vp-c-text-2);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
}

.logger-demo__output li[data-method='error'] span {
  color: var(--vp-c-danger-1);
}

.logger-demo__output li[data-method='warn'] span {
  color: var(--vp-c-warning-1);
}

.logger-demo__output li[data-method='debug'] span {
  color: var(--vp-c-text-3);
}

.logger-demo__empty {
  margin-top: 20px;
  color: var(--vp-c-text-2);
  font-size: 14px;
}

@media (max-width: 760px) {
  .logger-demo {
    padding: 16px;
  }

  .logger-demo__grid {
    grid-template-columns: 1fr;
  }

  .logger-demo__panel-head,
  .logger-demo__output li {
    grid-template-columns: 1fr;
  }
}
</style>
