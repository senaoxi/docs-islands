import boxen from 'boxen';

const CHECK_SUMMARY_BLOCK_MIN_WIDTH = 88;
const CHECK_SUMMARY_BLOCK_PADDING = 4;
const CHECK_BLOCK_HORIZONTAL_PADDING = 2;
const CHECK_BLOCK_BORDER_WIDTH = 2;

function plural(count: number, singular: string, pluralForm: string): string {
  return count === 1 ? singular : pluralForm;
}

function splitDetailBlocks(
  details: string | readonly string[] | undefined,
): string[][] {
  if (!details) {
    return [];
  }

  if (typeof details !== 'string') {
    return [[...details]];
  }

  return details
    .split(/\n{2,}/u)
    .map((block) => block.split('\n'))
    .filter((lines) => lines.some((line) => line.trim().length > 0));
}

function getBlockContentWidth(blockWidth: number): number {
  return Math.max(
    1,
    blockWidth - CHECK_BLOCK_BORDER_WIDTH - CHECK_BLOCK_HORIZONTAL_PADDING,
  );
}

function getLineWrapPrefix(line: string): {
  content: string;
  firstPrefix: string;
  nextPrefix: string;
} {
  const labelPrefix = /^\s*(?:-\s+|\d+\.\s+)?[A-Za-z][A-Za-z ]*:\s+/u.exec(
    line,
  )?.[0];

  if (labelPrefix) {
    return {
      content: line.slice(labelPrefix.length),
      firstPrefix: labelPrefix,
      nextPrefix: ' '.repeat(labelPrefix.length),
    };
  }

  const firstPrefix = /^\s*(?:-\s+|\d+\.\s+)?/u.exec(line)?.[0] ?? '';

  return {
    content: line.slice(firstPrefix.length),
    firstPrefix,
    nextPrefix: ' '.repeat(firstPrefix.length),
  };
}

function wrapDetailLine(line: string, contentWidth: number): string[] {
  if (!line) {
    return [line];
  }

  const { content, firstPrefix, nextPrefix } = getLineWrapPrefix(line);
  const continuationWidth = Math.max(1, contentWidth - firstPrefix.length);

  if (content.length <= continuationWidth) {
    return [line];
  }

  const wrapped: string[] = [];
  let current = '';

  const splitLongWord = (word: string): string[] => {
    const chunks: string[] = [];

    if (word.includes('/')) {
      let chunk = '';
      const pathParts = word
        .split('/')
        .map((part, index, parts) =>
          index === parts.length - 1 ? part : `${part}/`,
        );

      for (const part of pathParts) {
        if (part.length > continuationWidth) {
          if (chunk) {
            chunks.push(chunk);
            chunk = '';
          }

          for (let index = 0; index < part.length; index += continuationWidth) {
            chunks.push(part.slice(index, index + continuationWidth));
          }

          continue;
        }

        if (chunk && chunk.length + part.length > continuationWidth) {
          chunks.push(chunk);
          chunk = '';
        }

        chunk = `${chunk}${part}`;
      }

      if (chunk) {
        chunks.push(chunk);
      }

      return chunks;
    }

    for (let index = 0; index < word.length; index += continuationWidth) {
      chunks.push(word.slice(index, index + continuationWidth));
    }

    return chunks;
  };

  const pushLongWord = (word: string): void => {
    wrapped.push(...splitLongWord(word));
  };

  for (const word of content.split(/\s+/u)) {
    if (!word) {
      continue;
    }

    if (!current) {
      if (word.length > continuationWidth) {
        pushLongWord(word);
        continue;
      }

      current = word;
      continue;
    }

    if (current.length + 1 + word.length <= continuationWidth) {
      current = `${current} ${word}`;
      continue;
    }

    wrapped.push(current);
    current = '';

    if (word.length > continuationWidth) {
      pushLongWord(word);
      continue;
    }

    current = word;
  }

  if (current) {
    wrapped.push(current);
  }

  return wrapped.map((part, index) =>
    index === 0 ? `${firstPrefix}${part}` : `${nextPrefix}${part}`,
  );
}

export function formatCheckDetailBlock(lines: readonly string[]): string[] {
  const contentWidth = getBlockContentWidth(CHECK_SUMMARY_BLOCK_MIN_WIDTH);
  const wrappedLines = lines.flatMap((line) =>
    wrapDetailLine(line, contentWidth),
  );

  return boxen(wrappedLines.join('\n'), {
    borderStyle: 'single',
    padding: {
      left: 1,
      right: 1,
    },
    width: CHECK_SUMMARY_BLOCK_MIN_WIDTH,
  }).split('\n');
}

export function formatCheckSummaryBlock(options: {
  lines: readonly string[];
  title: string;
}): string[] {
  const width = Math.max(
    CHECK_SUMMARY_BLOCK_MIN_WIDTH,
    options.title.length + CHECK_SUMMARY_BLOCK_PADDING,
    ...options.lines.map((line) => line.length + CHECK_SUMMARY_BLOCK_PADDING),
  );

  return boxen(options.lines.join('\n'), {
    borderStyle: 'single',
    padding: {
      left: 1,
      right: 1,
    },
    title: options.title,
    width,
  }).split('\n');
}

export function formatCheckSummaryReport(options: {
  details?: string | readonly string[];
  lines: readonly string[];
  title: string;
}): string {
  const detailBlocks = splitDetailBlocks(options.details);

  return [
    ...formatCheckSummaryBlock({
      lines: options.lines,
      title: options.title,
    }),
    ...detailBlocks.flatMap((detailLines) => [
      '',
      ...formatCheckDetailBlock(detailLines),
    ]),
  ].join('\n');
}

export function formatCheckIssueSummaryReport(options: {
  details?: string | readonly string[];
  issueCount: number;
  pluralIssueLabel: string;
  singularIssueLabel: string;
  title: string;
}): string {
  return formatCheckSummaryReport({
    details: options.details,
    lines: [
      `Found ${options.issueCount} ${plural(
        options.issueCount,
        options.singularIssueLabel,
        options.pluralIssueLabel,
      )}.`,
    ],
    title: options.title,
  });
}
