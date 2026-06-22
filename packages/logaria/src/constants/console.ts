import type { ConsoleMethod, LogKind } from '../types';

export type BrowserStyleName =
  | 'body'
  | 'command'
  | LogKind
  | 'default'
  | 'dim'
  | 'fix'
  | 'group'
  | 'location'
  | 'main'
  | 'path'
  | 'reason';

export const BROWSER_STYLES: Record<BrowserStyleName, string> = {
  body: 'color: #6b7280;',
  command: 'color: #2563eb; font-weight: 600;',
  debug: 'color: #6c757d;',
  default: '',
  dim: 'color: #6b7280;',
  error: 'color: #dc2626; font-weight: 600;',
  fix: 'color: #15803d; font-weight: 600;',
  group: 'color: #c2410c;',
  info: '',
  location: 'color: #0891b2; font-weight: 600;',
  main: 'color: #2563eb; font-weight: 700;',
  path: 'color: #0284c7;',
  reason: 'color: #b45309; font-weight: 600;',
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
