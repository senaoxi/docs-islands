import type { CreateLoggerOptions, Logger } from 'logaria/types';

export function createLogger(options: CreateLoggerOptions): Logger;
export function createLogger(): Logger {
  throw new Error(
    '@docs-islands/vitepress/logger must be resolved by createDocsIslands()',
  );
}
