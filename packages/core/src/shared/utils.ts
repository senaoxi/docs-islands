import { createLogger } from '@docs-islands/utils/logger';
import type { RenderDirective } from '../types/render';
import { CORE_RUNTIME_LOG_GROUPS } from './constants/log-groups/runtime';
import {
  ALLOWED_RENDER_DIRECTIVES,
  RENDER_STRATEGY_ATTRS,
  RENDER_STRATEGY_CONSTANTS,
} from './constants/render-strategy';

const loggerInstance = createLogger({
  main: '@docs-islands/core',
});

export const validateLegalRenderElements = (element: Element): boolean => {
  const logger = loggerInstance.getLoggerByGroup(
    CORE_RUNTIME_LOG_GROUPS.renderValidation,
  );
  const renderStrategyProps: Record<string, string> = {};

  const missingRenderStrategyAttrs = RENDER_STRATEGY_ATTRS.filter((attr) => {
    if (element.hasAttribute(attr)) {
      renderStrategyProps[attr] = element.getAttribute(attr) || '';
      return false;
    }
    return true;
  });

  if (missingRenderStrategyAttrs.length > 0) {
    logger.warn(
      `The element is missing rendering attributes: ${missingRenderStrategyAttrs.join(', ')}, skipping compilation.`,
    );
    return false;
  }

  const renderId =
    renderStrategyProps[RENDER_STRATEGY_CONSTANTS.renderId.toLowerCase()];
  if (!/^[\da-f]{8}$/i.test(renderId)) {
    logger.warn(
      `The element with renderId: [${renderId}] is not a valid renderId, skipping compilation.`,
    );
    return false;
  }

  const renderComponent =
    renderStrategyProps[
      RENDER_STRATEGY_CONSTANTS.renderComponent.toLowerCase()
    ];
  if (!/^[A-Z][\dA-Za-z]*$/.test(renderComponent)) {
    logger.warn(
      `The element with renderComponent: [${renderComponent}] is not a valid component name, component name must be in PascalCase, skipping compilation.`,
    );
    return false;
  }

  const renderDirective =
    renderStrategyProps[
      RENDER_STRATEGY_CONSTANTS.renderDirective.toLowerCase()
    ];
  if (!ALLOWED_RENDER_DIRECTIVES.includes(renderDirective as RenderDirective)) {
    logger.warn(
      `The element with renderDirective: [${renderDirective}] is not a valid render directive, allowed render directives: ${ALLOWED_RENDER_DIRECTIVES.join(', ')}, skipping compilation.`,
    );
    return false;
  }

  return true;
};
