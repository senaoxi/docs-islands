import picocolors from 'picocolors';
import { BROWSER_STYLES, CONSOLE_METHOD_BY_KIND } from '../constants/console';
import { formatElapsedTime } from '../helper/elapsed';
import type { LoggerLogOptions, LoggerScopeId, LogKind } from '../types';
import { resolveLoggerContext } from './config';

interface PicocolorsType {
  blueBright: (str: string) => string;
  bold: (str: string) => string;
  dim: (str: string) => string;
  gray: (str: string) => string;
  green: (str: string) => string;
  red: (str: string) => string;
  yellow: (str: string) => string;
}

const colors: PicocolorsType | null = picocolors.isColorSupported
  ? picocolors
  : null;

const formatRuleLabelPrefix = (labels: string[]): string => {
  if (labels.length === 0) {
    return '';
  }

  return `${labels.map((label) => `[${label}]`).join('')} `;
};

const isBrowserConsole = (): boolean =>
  globalThis.window !== undefined && globalThis.document !== undefined;

const formatNodePrefix = (main: string, group: string): string => {
  if (!colors) {
    return `${main}[${group}]: `;
  }

  return (
    colors.bold(colors.blueBright(main)) +
    colors.dim('[') +
    colors.yellow(group) +
    colors.dim(']: ')
  );
};

const NODE_MESSAGE_COLOR_BY_KIND: Record<LogKind, keyof PicocolorsType | null> =
  {
    debug: 'gray',
    error: 'red',
    info: null,
    success: 'green',
    warn: 'yellow',
  };

const formatNodeMessage = (kind: LogKind, message: string): string => {
  if (!colors) {
    return message;
  }

  const colorKey = NODE_MESSAGE_COLOR_BY_KIND[kind];

  return colorKey ? colors[colorKey](message) : message;
};

const formatBrowserPrefix = (
  main: string,
  group: string,
): { styles: string[]; texts: string[] } => ({
  styles: [
    BROWSER_STYLES.main,
    BROWSER_STYLES.dim,
    BROWSER_STYLES.group,
    BROWSER_STYLES.dim,
  ],
  texts: [`%c${main}`, '%c[', `%c${group}`, '%c]: '],
});

const createRenderedLogMessage = (
  message: string,
  options?: LoggerLogOptions,
  shouldAppendElapsedTime?: boolean,
): string =>
  shouldAppendElapsedTime && typeof options?.elapsedTimeMs === 'number'
    ? `${message} ${formatElapsedTime(options.elapsedTimeMs)}`
    : message;

export const emitLoggerMessage = ({
  group,
  kind,
  main,
  message,
  options,
  scopeId,
}: {
  group: string;
  kind: LogKind;
  main: string;
  message: string;
  options?: LoggerLogOptions;
  scopeId?: LoggerScopeId;
}): void => {
  const resolvedContext = resolveLoggerContext(
    {
      group,
      kind,
      main,
      message,
    },
    scopeId,
  );

  if (resolvedContext.suppress) {
    return;
  }

  const level = CONSOLE_METHOD_BY_KIND[kind];
  const labelPrefix = formatRuleLabelPrefix(resolvedContext.ruleLabels);
  const renderedMessage = createRenderedLogMessage(
    message,
    options,
    resolvedContext.appendElapsedTime,
  );

  if (!isBrowserConsole()) {
    console[level](
      `${labelPrefix}${formatNodePrefix(main, group)}${formatNodeMessage(kind, renderedMessage)}`,
    );
    return;
  }

  const { texts, styles } = formatBrowserPrefix(main, group);

  texts[0] = `${labelPrefix}${texts[0]}`;
  texts.push(`%c${renderedMessage}`);
  styles.push(BROWSER_STYLES[kind] ?? BROWSER_STYLES.default);

  console[level](texts.join(''), ...styles);
};
