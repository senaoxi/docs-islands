import { createScopedLogger } from 'logaria/core';
import type { ScopedLogger } from 'logaria/types';

const MAIN_NAME = '@docs-islands/vitepress';

export type { LoggerElapsedLogOptions } from 'logaria/types';

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
