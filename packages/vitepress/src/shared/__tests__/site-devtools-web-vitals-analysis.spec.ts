import { describe, expect, it } from 'vitest';
import type { SiteDevToolsRenderMetric } from '../internal/devtools';
import { analyzeRenderMetricWebVitals } from '../site-devtools-web-vitals-analysis';

const createMetric = (
  overrides: Partial<SiteDevToolsRenderMetric> = {},
): SiteDevToolsRenderMetric => ({
  componentName: 'HeroSection',
  detectedAt: 100,
  hasSsrContent: true,
  renderDirective: 'client:load',
  renderId: 'render-1',
  renderMode: 'hydrate',
  source: 'react-render-strategy',
  status: 'completed',
  totalDurationMs: 40,
  updatedAt: 140,
  ...overrides,
});

describe('analyzeRenderMetricWebVitals', () => {
  it('returns a strong initial-load score for a fast hydration window', () => {
    const analysis = analyzeRenderMetricWebVitals(createMetric(), {
      snapshot: {
        cls: 0,
        fcpMs: 900,
        inpMs: 120,
        lcpMs: 1500,
        ttfbMs: 120,
      },
    });

    expect(analysis).not.toBeNull();
    expect(analysis?.context).toBe('initial-load');
    expect(analysis?.completedBeforeFcp).toBe(true);
    expect(analysis?.completedBeforeLcp).toBe(true);
    expect(analysis?.performanceScore).toBeGreaterThanOrEqual(90);
    expect(analysis?.performanceScoreRating).toBe('good');
  });

  it('penalizes late client rendering with blocking and layout shift', () => {
    const analysis = analyzeRenderMetricWebVitals(
      createMetric({
        detectedAt: 1800,
        hasSsrContent: false,
        renderDirective: 'client:only',
        renderMode: 'render',
        totalDurationMs: 950,
        updatedAt: 2750,
      }),
      {
        layoutShifts: [
          {
            startTime: 2860,
            value: 0.072,
          },
        ],
        longTasks: [
          {
            duration: 140,
            startTime: 2200,
          },
        ],
        snapshot: {
          cls: 0.072,
          fcpMs: 1200,
          inpMs: 290,
          lcpMs: 2400,
          ttfbMs: 180,
        },
      },
    );

    expect(analysis).not.toBeNull();
    expect(analysis?.context).toBe('initial-load');
    expect(analysis?.completedBeforeFcp).toBe(false);
    expect(analysis?.completedBeforeLcp).toBe(false);
    expect(analysis?.clsDelta).toBeCloseTo(0.072, 4);
    expect(analysis?.longTaskCount).toBe(1);
    expect(analysis?.performanceScore).toBeLessThan(50);
    expect(analysis?.performanceScoreRating).toBe('poor');
  });

  it('treats late metrics as route transitions instead of initial-load paint work', () => {
    const analysis = analyzeRenderMetricWebVitals(
      createMetric({
        detectedAt: 5200,
        renderMode: 'render',
        totalDurationMs: 120,
        updatedAt: 5320,
      }),
      {
        snapshot: {
          cls: 0.01,
          fcpMs: 950,
          inpMs: 140,
          lcpMs: 1800,
          ttfbMs: 90,
        },
      },
    );

    expect(analysis).not.toBeNull();
    expect(analysis?.context).toBe('route-transition');
    expect(analysis?.completedBeforeFcp).toBeUndefined();
    expect(analysis?.completedBeforeLcp).toBeUndefined();
    expect(analysis?.performanceScore).toBeGreaterThan(70);
  });
});
