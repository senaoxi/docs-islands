import { describe, expect, it } from 'vitest';
import { resolveSiteDevToolsAiCopyPrompt } from '../../../theme/site-devtools-ai-copy-prompt';
import type { SiteDevToolsAiAnalysisTarget } from '../../shared/site-devtools-ai';
import { buildSiteDevToolsAiAnalysisPrompt } from '../../shared/site-devtools-ai';

const createAnalysisTarget = (
  overrides: Partial<SiteDevToolsAiAnalysisTarget> = {},
): SiteDevToolsAiAnalysisTarget => ({
  artifactKind: 'bundle-chunk',
  artifactLabel: 'Demo Chunk',
  content: 'export const demo = true;',
  displayPath: '/assets/demo.js',
  language: 'js',
  ...overrides,
});

describe('resolveSiteDevToolsAiCopyPrompt', () => {
  it('uses the live analysis target prompt during real-time analysis', () => {
    const liveTarget = createAnalysisTarget();

    expect(
      resolveSiteDevToolsAiCopyPrompt({
        activeBuildReport: null,
        analysisSource: 'live-analysis',
        buildReportPromptByFile: {},
        liveAnalysisTarget: liveTarget,
        resolvedAnalysisTarget: null,
      }),
    ).toBe(buildSiteDevToolsAiAnalysisPrompt(liveTarget));
  });

  it('prefers the prompt attached to the active build report', () => {
    const buildTarget = createAnalysisTarget({
      artifactKind: 'page-build',
      artifactLabel: 'How It Works Page',
      displayPath: '/guide/how-it-works',
      language: 'md',
    });

    expect(
      resolveSiteDevToolsAiCopyPrompt({
        activeBuildReport: {
          generatedAt: '2026-04-05T00:00:00.000Z',
          model: 'doubao-test-model',
          prompt: 'prompt from active build report',
          provider: 'doubao',
          reportFile: '/docs/assets/page-metafiles/ai/pages/how-it-works.json',
          reportId: 'report-1',
          reportLabel: 'Doubao Pro',
        },
        analysisSource: 'build-report',
        buildReportPromptByFile: {
          '/docs/assets/page-metafiles/ai/pages/how-it-works.json':
            'prompt from cached report file',
        },
        liveAnalysisTarget: createAnalysisTarget(),
        resolvedAnalysisTarget: buildTarget,
      }),
    ).toBe('prompt from active build report');
  });

  it('falls back to the loaded build report prompt cache before rebuilding a prompt', () => {
    const buildTarget = createAnalysisTarget({
      artifactKind: 'page-build',
      artifactLabel: 'How It Works Page',
      displayPath: '/guide/how-it-works',
      language: 'md',
    });

    expect(
      resolveSiteDevToolsAiCopyPrompt({
        activeBuildReport: {
          generatedAt: '2026-04-05T00:00:00.000Z',
          model: 'doubao-test-model',
          provider: 'doubao',
          reportFile: '/docs/assets/page-metafiles/ai/pages/how-it-works.json',
          reportId: 'report-1',
          reportLabel: 'Doubao Pro',
        },
        analysisSource: 'build-report',
        buildReportPromptByFile: {
          '/docs/assets/page-metafiles/ai/pages/how-it-works.json':
            'prompt from loaded build report payload',
        },
        liveAnalysisTarget: createAnalysisTarget(),
        resolvedAnalysisTarget: buildTarget,
      }),
    ).toBe('prompt from loaded build report payload');
  });

  it('rebuilds a prompt from the resolved build report target when no saved prompt exists', () => {
    const buildTarget = createAnalysisTarget({
      artifactKind: 'page-build',
      artifactLabel: 'How It Works Page',
      displayPath: '/guide/how-it-works',
      language: 'md',
    });

    expect(
      resolveSiteDevToolsAiCopyPrompt({
        activeBuildReport: {
          generatedAt: '2026-04-05T00:00:00.000Z',
          model: 'doubao-test-model',
          provider: 'doubao',
          reportFile: '/docs/assets/page-metafiles/ai/pages/how-it-works.json',
          reportId: 'report-1',
          reportLabel: 'Doubao Pro',
        },
        analysisSource: 'build-report',
        buildReportPromptByFile: {},
        liveAnalysisTarget: createAnalysisTarget(),
        resolvedAnalysisTarget: buildTarget,
      }),
    ).toBe(buildSiteDevToolsAiAnalysisPrompt(buildTarget));
  });
});
