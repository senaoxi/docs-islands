import type { ConsoleMethod, LogKind } from '../types';

type BrowserStyleName = LogKind | 'default' | 'dim' | 'group' | 'main';

export const BROWSER_STYLES: Record<BrowserStyleName, string> = {
  debug: 'color: #6c757d;',
  default: '',
  dim: 'color: #6b7280;',
  error: 'color: #dc2626; font-weight: 600;',
  group: 'color: #c2410c;',
  info: '',
  main: 'color: #2563eb; font-weight: 700;',
  success: 'color: #15803d;',
  warn: 'color: #b45309; font-weight: 600;',
};

export const CONSOLE_METHOD_BY_KIND: Record<LogKind, ConsoleMethod> = {
  debug: 'debug',
  error: 'error',
  info: 'log',
  success: 'log',
  warn: 'warn',
};
