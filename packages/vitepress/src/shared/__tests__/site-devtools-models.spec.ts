import { describe, expect, it } from 'vitest';
import {
  claude,
  doubao,
  getSiteDevToolsAnalysisModelMetadata,
  getSiteDevToolsAnalysisProviderMetadata,
  isSiteDevToolsAnalysisBuildReportModelConfig,
  isSiteDevToolsAnalysisProviderConfig,
} from '../site-devtools-models';

describe('site-devtools model helpers', () => {
  it('creates branded Claude providers and models without enumerable helper fields', () => {
    const claudeUS = claude.provider({
      apiKey: 'test-key',
      label: 'Claude US',
    });
    const claudeSonnet = claudeUS.model({
      label: 'Claude Sonnet',
      maxTokens: 4096,
      model: 'claude-sonnet-4-20250514',
      temperature: 0.2,
    });

    expect(isSiteDevToolsAnalysisProviderConfig(claudeUS)).toBe(true);
    expect(isSiteDevToolsAnalysisBuildReportModelConfig(claudeSonnet)).toBe(
      true,
    );
    expect(Object.keys(claudeUS)).toEqual(['apiKey', 'label']);
    expect(Object.keys(claudeSonnet)).toEqual([
      'label',
      'maxTokens',
      'model',
      'temperature',
    ]);
    expect(getSiteDevToolsAnalysisProviderMetadata(claudeUS)).toMatchObject({
      provider: 'claude',
    });
    expect(getSiteDevToolsAnalysisModelMetadata(claudeSonnet)).toMatchObject({
      provider: 'claude',
    });
  });

  it('defaults Doubao thinking to false and keeps provider bindings separate', () => {
    const doubaoCN = doubao.provider({
      apiKey: 'cn-key',
    });
    const doubaoIntl = doubao.provider({
      apiKey: 'intl-key',
    });
    const cnModel = doubaoCN.model({
      model: 'doubao-seed-2-0-pro-260215',
    });
    const intlModel = doubaoIntl.model({
      model: 'doubao-seed-2-0-pro-260215',
      thinking: true,
    });

    expect(cnModel.thinking).toBe(false);
    expect(intlModel.thinking).toBe(true);
    expect(getSiteDevToolsAnalysisModelMetadata(cnModel).providerKey).not.toBe(
      getSiteDevToolsAnalysisModelMetadata(intlModel).providerKey,
    );
  });
});
