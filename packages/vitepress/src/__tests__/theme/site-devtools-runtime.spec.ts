import { describe, expect, it } from 'vitest';
import { isSiteDevToolsAiReportRuntimeAvailable } from '../../../theme/site-devtools-runtime';

describe('isSiteDevToolsAiReportRuntimeAvailable', () => {
  it('disables AI reports in dev', () => {
    expect(isSiteDevToolsAiReportRuntimeAvailable(true)).toBe(false);
  });

  it('keeps AI reports available outside dev', () => {
    expect(isSiteDevToolsAiReportRuntimeAvailable(false)).toBe(true);
  });
});
