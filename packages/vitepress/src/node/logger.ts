import { createScopedLogger } from '@docs-islands/logger/core';
import type { ScopedLogger } from '@docs-islands/logger/types';

const MAIN_NAME = '@docs-islands/vitepress';

export type { LoggerElapsedLogOptions } from '@docs-islands/logger/types';

export const getVitePressGroupLogger = (
  group: string,
  scopeId: string,
): ScopedLogger =>
  createScopedLogger(
    {
      main: MAIN_NAME,
    },
    scopeId,
  ).getLoggerByGroup(group);
