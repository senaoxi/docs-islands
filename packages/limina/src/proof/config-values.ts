export function isPlainRecord(
  value: unknown,
): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function formatUnknownValue(value: unknown): string {
  if (value === undefined) {
    return 'undefined';
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
