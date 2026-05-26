/**
 * Formats an error object or value into a readable error message string.
 *
 * This function safely extracts error messages from Error objects and converts
 * other values to strings. It handles edge cases like non-serializable objects
 * and ensures a fallback message is always returned.
 *
 * @param error - The error object or value to format
 * @returns A formatted error message string
 *
 * @example
 * ```ts
 * formatErrorMessage(new Error('Connection failed'));
 * // Returns: "Connection failed"
 *
 * formatErrorMessage('Invalid input');
 * // Returns: "Invalid input"
 * ```
 */
export function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  try {
    return String(error);
  } catch {
    return 'Unknown error';
  }
}
