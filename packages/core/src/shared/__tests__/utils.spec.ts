/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RENDER_STRATEGY_CONSTANTS } from '../constants/render-strategy';
import { validateLegalRenderElements } from '../utils';

vi.mock('@docs-islands/utils/logger', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@docs-islands/utils/logger')>();

  return {
    ...actual,
    createLogger: () => ({
      getLoggerByGroup: () => ({
        debug: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        success: vi.fn(),
        warn: vi.fn(),
      }),
    }),
  };
});

describe('core shared utils', () => {
  let mockElement: Element;

  beforeEach(() => {
    mockElement = document.createElement('div');
    vi.clearAllMocks();
  });

  it('accepts elements that carry the required render strategy attributes', () => {
    mockElement.setAttribute(
      RENDER_STRATEGY_CONSTANTS.renderId.toLowerCase(),
      '12345678',
    );
    mockElement.setAttribute(
      RENDER_STRATEGY_CONSTANTS.renderComponent.toLowerCase(),
      'TestComponent',
    );
    mockElement.setAttribute(
      RENDER_STRATEGY_CONSTANTS.renderDirective.toLowerCase(),
      'client:load',
    );
    mockElement.setAttribute(
      RENDER_STRATEGY_CONSTANTS.renderWithSpaSync.toLowerCase(),
      'true',
    );

    expect(validateLegalRenderElements(mockElement)).toBe(true);
  });

  it('rejects elements that are missing render strategy attributes', () => {
    mockElement.setAttribute(
      RENDER_STRATEGY_CONSTANTS.renderId.toLowerCase(),
      '12345678',
    );

    expect(validateLegalRenderElements(mockElement)).toBe(false);
  });
});
