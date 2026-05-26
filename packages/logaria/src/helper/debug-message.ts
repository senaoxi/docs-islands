import {
  DEBUG_MESSAGE_MAX_LENGTH,
  DEBUG_SUMMARY_MAX_DEPTH,
  DEBUG_SUMMARY_MAX_ITEMS,
  DEBUG_SUMMARY_MAX_KEYS,
} from '../constants/debug';
import type { DebugMessageOptions } from '../types';

const sanitizeDebugText = (
  value: string,
  maxLength = DEBUG_MESSAGE_MAX_LENGTH,
): string => {
  const normalizedValue = value.replaceAll(/\s+/g, ' ').trim();

  if (normalizedValue.length <= maxLength) {
    return normalizedValue;
  }

  return `${normalizedValue.slice(0, maxLength - 3)}...`;
};

const sanitizeDebugSummaryValue = (
  value: unknown,
  depth = 0,
): boolean | number | string | null | Record<string, unknown> | unknown[] => {
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'number'
  ) {
    return value;
  }

  if (typeof value === 'string') {
    return sanitizeDebugText(value);
  }

  if (typeof value === 'bigint') {
    return sanitizeDebugText(value.toString());
  }

  if (typeof value === 'function') {
    return '[function]';
  }

  if (value instanceof Error) {
    return sanitizeDebugText(value.message);
  }

  if (Array.isArray(value)) {
    if (depth >= DEBUG_SUMMARY_MAX_DEPTH) {
      return `[array(${value.length})]`;
    }

    const sanitizedItems = value
      .slice(0, DEBUG_SUMMARY_MAX_ITEMS)
      .map((item) => sanitizeDebugSummaryValue(item, depth + 1));

    if (value.length > DEBUG_SUMMARY_MAX_ITEMS) {
      sanitizedItems.push(`[+${value.length - DEBUG_SUMMARY_MAX_ITEMS} more]`);
    }

    return sanitizedItems;
  }

  if (typeof value === 'object') {
    if (depth >= DEBUG_SUMMARY_MAX_DEPTH) {
      return '[object]';
    }

    const objectEntries = Object.entries(value as Record<string, unknown>)
      .toSorted(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      .slice(0, DEBUG_SUMMARY_MAX_KEYS)
      .map(([key, entryValue]) => [
        key,
        sanitizeDebugSummaryValue(entryValue, depth + 1),
      ]);
    const sanitizedObject = Object.fromEntries(objectEntries);
    const totalKeyCount = Object.keys(value as Record<string, unknown>).length;

    if (totalKeyCount > DEBUG_SUMMARY_MAX_KEYS) {
      sanitizedObject.__truncatedKeys__ =
        totalKeyCount - DEBUG_SUMMARY_MAX_KEYS;
    }

    return sanitizedObject;
  }

  return sanitizeDebugText(String(value));
};

export const sanitizeDebugSummary = (summary: unknown): string => {
  if (summary === undefined) {
    return 'n/a';
  }

  const sanitizedSummary = sanitizeDebugSummaryValue(summary);

  if (typeof sanitizedSummary === 'string') {
    return sanitizedSummary;
  }

  try {
    return sanitizeDebugText(JSON.stringify(sanitizedSummary));
  } catch {
    return '[unserializable summary]';
  }
};

const formatDebugTiming = (timingMs: number | null | undefined): string => {
  if (
    timingMs === null ||
    timingMs === undefined ||
    !Number.isFinite(timingMs)
  ) {
    return 'n/a';
  }

  return `${timingMs.toFixed(2)}ms`;
};

/**
 * Formats debug message options into a standardized debug output string.
 *
 * This function creates a debug log message with the canonical format:
 * `context=... | decision=... | summary=... | timing=...`
 *
 * It sanitizes all input values to prevent excessively long output and ensures
 * complex objects are safely serialized for logging. Each field is validated
 * and formatted for readability.
 *
 * @param options - Debug message configuration
 * @param options.context - The context or phase of execution (e.g., "build phase")
 * @param options.decision - The conclusion or decision made (e.g., "skipping optimization")
 * @param options.summary - Optional data or object providing additional context
 * @param options.timingMs - Optional elapsed time in milliseconds
 * @returns A formatted debug message string ready for logging
 *
 * @example
 * ```ts
 * const message = formatDebugMessage({
 *   context: 'resolve dependencies',
 *   decision: 'using cached version',
 *   summary: { version: '1.2.3', cacheAge: 120 },
 *   timingMs: 45.5,
 * });
 * // Returns: "context=resolve dependencies | decision=using cached version | summary={...} | timing=45.50ms"
 * ```
 */
export const formatDebugMessage = ({
  context,
  decision,
  summary,
  timingMs,
}: DebugMessageOptions): string =>
  [
    `context=${sanitizeDebugText(context) || 'n/a'}`,
    `decision=${sanitizeDebugText(decision) || 'n/a'}`,
    `summary=${sanitizeDebugSummary(summary)}`,
    `timing=${formatDebugTiming(timingMs)}`,
  ].join(' | ');
