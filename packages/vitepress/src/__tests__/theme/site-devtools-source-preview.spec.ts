import { describe, expect, it, vi } from 'vitest';
import {
  createWindowedCodePreviewRangeRenderer,
  WINDOWED_HIGHLIGHT_BATCH_LINES,
} from '../../../theme/site-devtools-source-highlight';
import {
  createBackgroundPlainTextPreviewIndexer,
  createBackgroundWindowedCodePreviewHighlighter,
  createPlainTextPreviewLineIndex,
  getCodePreviewBudget,
} from '../../../theme/site-devtools-source-preview';

describe('site-devtools-source-preview plain text indexing', () => {
  it('creates line offsets for mixed newline sequences', () => {
    const lineIndex = createPlainTextPreviewLineIndex(
      'alpha\nbeta\r\ngamma\rdelta',
    );

    expect(lineIndex.lineCount).toBe(4);
    expect([...lineIndex.lineStartOffsets]).toEqual([0, 6, 12, 18]);
  });

  it('falls back to foreground indexing when worker construction fails', async () => {
    const originalWorker = globalThis.Worker;
    const ThrowingWorker = vi.fn(() => {
      throw new Error('blocked by runtime policy');
    });

    vi.stubGlobal('Worker', ThrowingWorker as unknown as typeof Worker);

    const indexer = createBackgroundPlainTextPreviewIndexer();

    try {
      const lineIndex = await indexer.index('first\nsecond');

      expect(ThrowingWorker).toHaveBeenCalledOnce();
      expect(lineIndex.lineCount).toBe(2);
      expect([...lineIndex.lineStartOffsets]).toEqual([0, 6]);
    } finally {
      indexer.dispose();

      if (originalWorker === undefined) {
        delete (globalThis as { Worker?: typeof Worker }).Worker;
      } else {
        vi.stubGlobal('Worker', originalWorker);
      }
    }
  });

  it('selects rich, windowed-highlight, and plain-text preview modes by budget', () => {
    expect(getCodePreviewBudget('const value = 1;\n').mode).toBe('rich-html');
    expect(getCodePreviewBudget('x'.repeat(160 * 1024)).mode).toBe(
      'virtual-highlight',
    );
    expect(getCodePreviewBudget('x'.repeat(2 * 1024 * 1024)).mode).toBe(
      'plain-text',
    );
  });

  it('preserves grammar state across windowed highlight batches', async () => {
    const sourceContent = [
      ...Array.from(
        { length: WINDOWED_HIGHLIGHT_BATCH_LINES - 1 },
        (_, index) => `const value${index} = ${index};`,
      ),
      '/* comment starts',
      'comment continues',
      'comment ends */',
      'const afterComment = true;',
    ].join('\n');
    const renderer = createWindowedCodePreviewRangeRenderer();
    const result = await renderer.render({
      rangeEnd: WINDOWED_HIGHLIGHT_BATCH_LINES + 3,
      rangeStart: WINDOWED_HIGHLIGHT_BATCH_LINES,
      sourceContent,
      sourceKey: 'comment-boundary',
      sourcePath: 'boundary.ts',
      theme: 'light',
    });
    const continuedCommentLine = result.tokenLines.find(
      (line) => line.lineNumber === WINDOWED_HIGHLIGHT_BATCH_LINES,
    );
    const closingCommentLine = result.tokenLines.find(
      (line) => line.lineNumber === WINDOWED_HIGHLIGHT_BATCH_LINES + 1,
    );
    const postCommentLine = result.tokenLines.find(
      (line) => line.lineNumber === WINDOWED_HIGHLIGHT_BATCH_LINES + 2,
    );

    expect(continuedCommentLine?.tokens[0]?.content).toBe('comment continues');
    expect(continuedCommentLine?.tokens[0]?.htmlStyle).toEqual(
      closingCommentLine?.tokens[0]?.htmlStyle,
    );
    expect(postCommentLine?.tokens[0]?.htmlStyle).not.toEqual(
      continuedCommentLine?.tokens[0]?.htmlStyle,
    );
  });

  it('falls back to foreground range highlighting when worker construction fails', async () => {
    const originalWorker = globalThis.Worker;
    const ThrowingWorker = vi.fn(() => {
      throw new Error('blocked by runtime policy');
    });

    vi.stubGlobal('Worker', ThrowingWorker as unknown as typeof Worker);

    const highlighter = createBackgroundWindowedCodePreviewHighlighter();

    try {
      const result = await highlighter.render({
        rangeEnd: 2,
        rangeStart: 0,
        sourceContent: 'const total = 1;\nconst next = total + 1;\n',
        sourceKey: 'foreground-fallback',
        sourcePath: 'fallback.ts',
        theme: 'light',
      });

      expect(ThrowingWorker).toHaveBeenCalledOnce();
      expect(result.tokenLines.length).toBeGreaterThan(0);
      expect(result.rootStyle).toContain('--shiki-dark');
    } finally {
      highlighter.dispose();

      if (originalWorker === undefined) {
        delete (globalThis as { Worker?: typeof Worker }).Worker;
      } else {
        vi.stubGlobal('Worker', originalWorker);
      }
    }
  });
});
