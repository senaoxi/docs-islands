import picocolors from 'picocolors';
import {
  BROWSER_STYLES,
  type BrowserStyleName,
  CONSOLE_METHOD_BY_KIND,
} from '../constants/console';
import { formatElapsedTime } from '../helper/elapsed';
import type { LoggerLogOptions, LoggerScopeId, LogKind } from '../types';
import { resolveLoggerContext } from './config';

interface PicocolorsType {
  blueBright: (str: string) => string;
  bold: (str: string) => string;
  cyan: (str: string) => string;
  dim: (str: string) => string;
  gray: (str: string) => string;
  green: (str: string) => string;
  red: (str: string) => string;
  yellow: (str: string) => string;
}

export type ConsoleMessageSegmentStyle =
  | 'body'
  | 'command'
  | 'debug'
  | 'default'
  | 'error'
  | 'errorTitle'
  | 'fix'
  | 'location'
  | 'path'
  | 'reason'
  | 'success'
  | 'warn';

export interface ConsoleMessageSegment {
  style: ConsoleMessageSegmentStyle;
  text: string;
}

const colors: PicocolorsType | null = picocolors.isColorSupported
  ? picocolors
  : null;

const LOCATION_LABELS = new Set([
  'checker',
  'command',
  'config',
  'cwd',
  'default',
  'dependencies',
  'details',
  'directory',
  'entry',
  'exit code',
  'file',
  'files',
  'imports',
  'items',
  'local',
  'option',
  'output',
  'package',
  'package manifest',
  'preset',
  'reference',
  'resolved',
  'rule',
  'scope',
  'source',
  'task',
  'target',
  'targets',
  'tool',
]);

const FIX_LABELS = new Set([
  'fix',
  'fixes',
  'suggested fix',
  'suggested fixes',
]);

const LABEL_LINE_PATTERN =
  /^(\s*(?:[|│]\s*)?(?:-\s*)?)([A-Za-z][A-Za-z ]*):(?=\s|$)(.*)$/u;
const COMMAND_LINE_PATTERN =
  /^(\s*(?:[|│]\s*)?)((?:git|limina|node|npm|npx|pnpm)\b.*)$/u;
const INLINE_REFERENCE_PATTERN =
  /(?:\.{1,2}\/)?(?:[\w@.-]+\/)+[\w@.+~-]+|\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+\b|\bsource\.knip\.\S+/gu;

const formatRuleLabelPrefix = (labels: string[]): string => {
  if (labels.length === 0) {
    return '';
  }

  return `${labels.map((label) => `[${label}]`).join('')} `;
};

const isNodeRuntime = (): boolean => {
  const maybeProcess = (
    globalThis as {
      process?: {
        versions?: {
          node?: string;
        };
      };
    }
  ).process;

  return maybeProcess !== undefined && Boolean(maybeProcess.versions?.node);
};

const isBrowserConsole = (): boolean =>
  !isNodeRuntime() &&
  globalThis.window !== undefined &&
  globalThis.document !== undefined;

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

const MESSAGE_SEGMENT_STYLE_BY_KIND: Record<
  LogKind,
  ConsoleMessageSegmentStyle
> = {
  debug: 'debug',
  error: 'error',
  info: 'default',
  success: 'success',
  warn: 'warn',
};

function normalizeSemanticLabel(label: string): string {
  return label.trim().toLowerCase().replaceAll(/\s+/gu, ' ');
}

function getSemanticLabelStyle(
  label: string,
): ConsoleMessageSegmentStyle | null {
  const normalizedLabel = normalizeSemanticLabel(label);

  if (normalizedLabel === 'reason') {
    return 'reason';
  }

  if (FIX_LABELS.has(normalizedLabel)) {
    return 'fix';
  }

  if (LOCATION_LABELS.has(normalizedLabel)) {
    return 'location';
  }

  return null;
}

function createBodySegments(text: string): ConsoleMessageSegment[] {
  if (!text) {
    return [];
  }

  const commandMatch = COMMAND_LINE_PATTERN.exec(text);

  if (commandMatch) {
    const [, prefix = '', command = ''] = commandMatch;
    const boxSuffixMatch = /(\s+[|│])$/u.exec(command);
    const boxSuffix = boxSuffixMatch?.[1] ?? '';
    const commandText = boxSuffix
      ? command.slice(0, -boxSuffix.length)
      : command;

    return [
      ...(prefix
        ? [
            {
              style: 'body' as const,
              text: prefix,
            },
          ]
        : []),
      {
        style: 'command',
        text: commandText,
      },
      ...(boxSuffix
        ? [
            {
              style: 'body' as const,
              text: boxSuffix,
            },
          ]
        : []),
    ];
  }

  const segments: ConsoleMessageSegment[] = [];
  let previousIndex = 0;

  for (const match of text.matchAll(INLINE_REFERENCE_PATTERN)) {
    const reference = match[0];
    const index = match.index ?? 0;

    if (index > previousIndex) {
      segments.push({
        style: 'body',
        text: text.slice(previousIndex, index),
      });
    }

    segments.push({
      style: 'path',
      text: reference,
    });
    previousIndex = index + reference.length;
  }

  if (previousIndex < text.length) {
    segments.push({
      style: 'body',
      text: text.slice(previousIndex),
    });
  }

  return segments.length > 0
    ? segments
    : [
        {
          style: 'body',
          text,
        },
      ];
}

function createSemanticLineSegments(line: string): ConsoleMessageSegment[] {
  const match = LABEL_LINE_PATTERN.exec(line);

  if (!match) {
    return createBodySegments(line);
  }

  const [, prefix = '', label = '', suffix = ''] = match;
  const labelStyle = getSemanticLabelStyle(label);

  if (!labelStyle) {
    return createBodySegments(line);
  }

  return [
    ...(prefix
      ? [
          {
            style: 'body' as const,
            text: prefix,
          },
        ]
      : []),
    {
      style: labelStyle,
      text: `${label}:`,
    },
    ...(suffix ? createBodySegments(suffix) : []),
  ];
}

function createMultilineErrorSegments(
  message: string,
): ConsoleMessageSegment[] {
  const lines = message.split('\n');
  const firstTitleLineIndex = lines.findIndex((line) => line.trim().length > 0);
  const summaryBlockRange = findErrorSummaryBoxRange(lines);
  const segments: ConsoleMessageSegment[] = [];

  for (const [lineIndex, line] of lines.entries()) {
    if (lineIndex > 0) {
      segments.push({
        style: 'default',
        text: '\n',
      });
    }

    if (
      summaryBlockRange &&
      lineIndex >= summaryBlockRange.start &&
      lineIndex <= summaryBlockRange.end
    ) {
      segments.push({
        style: 'error',
        text: line,
      });
      continue;
    }

    if (lineIndex === firstTitleLineIndex) {
      segments.push({
        style: 'errorTitle',
        text: line,
      });
      continue;
    }

    segments.push(...createSemanticLineSegments(line));
  }

  return segments;
}

function isErrorSummaryBoxTopLine(line: string): boolean {
  return /^[┌╭]/u.test(line) && /\bsummary\b/iu.test(line);
}

function findErrorSummaryBoxRange(
  lines: readonly string[],
): { end: number; start: number } | null {
  const start = lines.findIndex((line) => isErrorSummaryBoxTopLine(line));

  if (start === -1) {
    return null;
  }

  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^[└╰]/u.test(lines[index] ?? '')) {
      return {
        end: index,
        start,
      };
    }
  }

  return {
    end: start,
    start,
  };
}

export function createConsoleMessageSegments(
  kind: LogKind,
  message: string,
): ConsoleMessageSegment[] {
  if (kind === 'error') {
    return message.includes('\n')
      ? createMultilineErrorSegments(message)
      : [
          {
            style: 'error',
            text: message,
          },
        ];
  }

  return [
    {
      style: MESSAGE_SEGMENT_STYLE_BY_KIND[kind],
      text: message,
    },
  ];
}

function formatNodeMessageSegment(
  segment: ConsoleMessageSegment,
  colorSupport: PicocolorsType | null,
): string {
  if (!colorSupport) {
    return segment.text;
  }

  switch (segment.style) {
    case 'body':
    case 'debug': {
      return colorSupport.gray(segment.text);
    }
    case 'command': {
      return colorSupport.cyan(segment.text);
    }
    case 'error': {
      return colorSupport.red(segment.text);
    }
    case 'errorTitle': {
      return colorSupport.bold(colorSupport.red(segment.text));
    }
    case 'fix':
    case 'success': {
      return colorSupport.green(segment.text);
    }
    case 'location': {
      return colorSupport.cyan(segment.text);
    }
    case 'path': {
      return colorSupport.blueBright(segment.text);
    }
    case 'reason':
    case 'warn': {
      return colorSupport.yellow(segment.text);
    }
    case 'default': {
      return segment.text;
    }
  }

  return segment.text;
}

export function formatNodeMessageSegments(
  segments: readonly ConsoleMessageSegment[],
  colorSupport: PicocolorsType | null = colors,
): string {
  return segments
    .map((segment) => formatNodeMessageSegment(segment, colorSupport))
    .join('');
}

const formatNodeMessage = (kind: LogKind, message: string): string => {
  return formatNodeMessageSegments(createConsoleMessageSegments(kind, message));
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

function getBrowserStyleNameForSegment(
  segment: ConsoleMessageSegment,
): BrowserStyleName {
  if (segment.style === 'errorTitle') {
    return 'error';
  }

  return segment.style === 'default' ? 'default' : segment.style;
}

export function formatBrowserMessageSegments(
  segments: readonly ConsoleMessageSegment[],
): { styles: string[]; texts: string[] } {
  return {
    styles: segments.map(
      (segment) => BROWSER_STYLES[getBrowserStyleNameForSegment(segment)],
    ),
    texts: segments.map((segment) => `%c${segment.text}`),
  };
}

const createRenderedLogMessage = (
  message: string,
  options?: LoggerLogOptions,
  shouldAppendElapsedTime?: boolean,
): string =>
  shouldAppendElapsedTime && typeof options?.elapsedTimeMs === 'number'
    ? `${message} ${formatElapsedTime(options.elapsedTimeMs)}`
    : message;

const startsWithErrorSummaryBox = (message: string): boolean => {
  const firstContentLine =
    message.split('\n').find((line) => line.trim().length > 0) ?? '';

  return isErrorSummaryBoxTopLine(firstContentLine);
};

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
    const formattedMessage = formatNodeMessage(kind, renderedMessage);

    console[level](
      kind === 'error' && startsWithErrorSummaryBox(renderedMessage)
        ? formattedMessage
        : `${labelPrefix}${formatNodePrefix(main, group)}${formattedMessage}`,
    );
    return;
  }

  const { texts, styles } = formatBrowserPrefix(main, group);
  const messageParts = formatBrowserMessageSegments(
    createConsoleMessageSegments(kind, renderedMessage),
  );

  texts[0] = `${labelPrefix}${texts[0]}`;
  texts.push(...messageParts.texts);
  styles.push(...messageParts.styles);

  console[level](texts.join(''), ...styles);
};
