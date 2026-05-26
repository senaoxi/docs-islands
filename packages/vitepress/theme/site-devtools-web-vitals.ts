import type { SiteDevToolsRenderMetric } from '@docs-islands/vitepress/internal/devtools';
import {
  analyzeRenderMetricWebVitals,
  type SiteDevToolsRenderMetricWebVitalsAnalysis,
  type SiteDevToolsWebVitalsLayoutShift,
  type SiteDevToolsWebVitalsLongTask,
  type SiteDevToolsWebVitalsSnapshot,
} from '../src/shared/site-devtools-web-vitals-analysis';

type ObserverEntry = PerformanceEntry & {
  duration?: number;
  hadRecentInput?: boolean;
  interactionId?: number;
  name?: string;
  startTime: number;
  value?: number;
};

const MAX_CAPTURED_LONG_TASKS = 200;
const MAX_CAPTURED_LAYOUT_SHIFTS = 400;

export const SITE_DEVTOOLS_WEB_VITALS_EVENT_NAME =
  'docs-islands:site-devtools-web-vitals';

const webVitalsSnapshot: SiteDevToolsWebVitalsSnapshot = {};
const longTaskEntries: SiteDevToolsWebVitalsLongTask[] = [];
const layoutShiftEntries: SiteDevToolsWebVitalsLayoutShift[] = [];
const observers: PerformanceObserver[] = [];

let isTracking = false;
let notifyTimer: ReturnType<typeof globalThis.setTimeout> | undefined;

const canUseBrowserPerformance = () =>
  globalThis.window !== undefined && globalThis.performance !== undefined;

const scheduleVitalsUpdate = () => {
  if (globalThis.window === undefined || notifyTimer !== undefined) {
    return;
  }

  notifyTimer = globalThis.setTimeout(() => {
    notifyTimer = undefined;
    globalThis.dispatchEvent(
      new CustomEvent(SITE_DEVTOOLS_WEB_VITALS_EVENT_NAME),
    );
  }, 80);
};

const trimEntries = <T>(entries: T[], limit: number) => {
  if (entries.length > limit) {
    entries.splice(0, entries.length - limit);
  }
};

const seedInitialSnapshot = () => {
  if (!canUseBrowserPerformance()) {
    return;
  }

  const paintEntries = performance.getEntriesByType('paint');
  const fcpEntry = paintEntries.find(
    (entry) => entry.name === 'first-contentful-paint',
  );

  if (fcpEntry) {
    webVitalsSnapshot.fcpMs = Number(fcpEntry.startTime.toFixed(2));
  }

  const navigationEntry = performance.getEntriesByType('navigation')[0] as
    | PerformanceNavigationTiming
    | undefined;

  if (
    navigationEntry &&
    typeof navigationEntry.responseStart === 'number' &&
    Number.isFinite(navigationEntry.responseStart)
  ) {
    webVitalsSnapshot.ttfbMs = Number(navigationEntry.responseStart.toFixed(2));
  }
};

const supportsObserverType = (type: string) =>
  typeof PerformanceObserver !== 'undefined' &&
  Array.isArray(PerformanceObserver.supportedEntryTypes) &&
  PerformanceObserver.supportedEntryTypes.includes(type);

const observeEntries = (
  type: string,
  onEntries: (entries: ObserverEntry[]) => void,
  options?: Record<string, unknown>,
) => {
  if (!supportsObserverType(type)) {
    return;
  }

  try {
    const observer = new PerformanceObserver((list) => {
      onEntries(list.getEntries() as ObserverEntry[]);
    });

    observer.observe({
      buffered: true,
      type,
      ...options,
    });
    observers.push(observer);
  } catch {
    // Ignore browsers that reject a supported entry type or extra options.
  }
};

export const ensureSiteDevToolsWebVitalsTracking = () => {
  if (isTracking || !canUseBrowserPerformance()) {
    return;
  }

  isTracking = true;
  seedInitialSnapshot();

  observeEntries('paint', (entries) => {
    let changed = false;

    for (const entry of entries) {
      if (entry.name === 'first-contentful-paint') {
        const nextValue = Number(entry.startTime.toFixed(2));
        if (webVitalsSnapshot.fcpMs !== nextValue) {
          webVitalsSnapshot.fcpMs = nextValue;
          changed = true;
        }
      }
    }

    if (changed) {
      scheduleVitalsUpdate();
    }
  });

  observeEntries('largest-contentful-paint', (entries) => {
    const latestEntry = entries.at(-1);

    if (!latestEntry) {
      return;
    }

    const nextValue = Number(latestEntry.startTime.toFixed(2));
    if (webVitalsSnapshot.lcpMs !== nextValue) {
      webVitalsSnapshot.lcpMs = nextValue;
      scheduleVitalsUpdate();
    }
  });

  observeEntries('layout-shift', (entries) => {
    let changed = false;

    for (const entry of entries) {
      if (entry.hadRecentInput || typeof entry.value !== 'number') {
        continue;
      }

      layoutShiftEntries.push({
        startTime: Number(entry.startTime.toFixed(2)),
        value: Number(entry.value.toFixed(4)),
      });
      trimEntries(layoutShiftEntries, MAX_CAPTURED_LAYOUT_SHIFTS);
      webVitalsSnapshot.cls = Number(
        ((webVitalsSnapshot.cls ?? 0) + Number(entry.value.toFixed(4))).toFixed(
          4,
        ),
      );
      changed = true;
    }

    if (changed) {
      scheduleVitalsUpdate();
    }
  });

  observeEntries(
    'event',
    (entries) => {
      let changed = false;

      for (const entry of entries) {
        if (
          typeof entry.interactionId !== 'number' ||
          entry.interactionId <= 0 ||
          typeof entry.duration !== 'number'
        ) {
          continue;
        }

        const nextValue = Number(entry.duration.toFixed(2));
        if ((webVitalsSnapshot.inpMs ?? 0) < nextValue) {
          webVitalsSnapshot.inpMs = nextValue;
          changed = true;
        }
      }

      if (changed) {
        scheduleVitalsUpdate();
      }
    },
    { durationThreshold: 40 },
  );

  observeEntries('longtask', (entries) => {
    let changed = false;

    for (const entry of entries) {
      if (typeof entry.duration !== 'number') {
        continue;
      }

      longTaskEntries.push({
        duration: Number(entry.duration.toFixed(2)),
        startTime: Number(entry.startTime.toFixed(2)),
      });
      trimEntries(longTaskEntries, MAX_CAPTURED_LONG_TASKS);
      changed = true;
    }

    if (changed) {
      scheduleVitalsUpdate();
    }
  });

  scheduleVitalsUpdate();
};

export const destroySiteDevToolsWebVitalsTracking = () => {
  for (const observer of observers.splice(0)) {
    observer.disconnect();
  }

  if (notifyTimer !== undefined && globalThis.window !== undefined) {
    globalThis.clearTimeout(notifyTimer);
    notifyTimer = undefined;
  }

  longTaskEntries.length = 0;
  layoutShiftEntries.length = 0;

  delete webVitalsSnapshot.cls;
  delete webVitalsSnapshot.fcpMs;
  delete webVitalsSnapshot.inpMs;
  delete webVitalsSnapshot.lcpMs;
  delete webVitalsSnapshot.ttfbMs;

  isTracking = false;
};

export const getSiteDevToolsWebVitalsSnapshot = () =>
  Object.keys(webVitalsSnapshot).length > 0 ? { ...webVitalsSnapshot } : null;

export const analyzeSiteDevToolsRenderMetricWebVitals = (
  metric: SiteDevToolsRenderMetric,
): SiteDevToolsRenderMetricWebVitalsAnalysis | null => {
  if (metric.source !== 'react-render-strategy') {
    return null;
  }

  return analyzeRenderMetricWebVitals(metric, {
    layoutShifts: layoutShiftEntries,
    longTasks: longTaskEntries,
    snapshot: getSiteDevToolsWebVitalsSnapshot(),
  });
};

export type {
  SiteDevToolsRenderMetricWebVitalsAnalysis,
  SiteDevToolsWebVitalsSnapshot,
} from '../src/shared/site-devtools-web-vitals-analysis';
