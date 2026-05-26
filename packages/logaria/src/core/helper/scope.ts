import type { LoggerScopeId } from '../../types';

export const DEFAULT_LOGGER_SCOPE_ID = '__default__';

/**
 * Creates a unique logger scope identifier.
 *
 * This function generates a unique scope ID using a combination of timestamp
 * and cryptographic or pseudo-random entropy. The resulting ID is guaranteed
 * to be unique within the application's lifetime and is useful for creating
 * isolated logger scopes with independent configurations.
 *
 * @returns A unique logger scope identifier string
 *
 * @example
 * ```ts
 * const scopeId = createLoggerScopeId();
 * setScopedLoggerConfig(scopeId, { levels: ['error'] });
 * const logger = createScopedLogger({ main: 'app' }, scopeId);
 * ```
 */
export const createLoggerScopeId = (): LoggerScopeId => {
  const timestamp = Date.now().toString(36);
  const entropy =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID().replaceAll('-', '')
      : Array.from({ length: 4 }, () =>
          Math.floor(Math.random() * 0xff_ff_ff_ff)
            .toString(16)
            .padStart(8, '0'),
        ).join('');

  return `logaria-scope-${timestamp}-${entropy}`;
};

export const normalizeLoggerScopeId = (
  scopeId?: LoggerScopeId,
): LoggerScopeId => {
  if (typeof scopeId !== 'string') {
    return DEFAULT_LOGGER_SCOPE_ID;
  }

  const normalizedScopeId = scopeId.trim();

  return normalizedScopeId || DEFAULT_LOGGER_SCOPE_ID;
};
