import type {
  CreateLoggerOptions,
  Logger as LoggerApi,
  LoggerLogOptions,
  LoggerScopeId,
  LogKind,
  ScopedLogger as ScopedLoggerApi,
} from '../types';
import { assertLoggerConfigRegisteredForScope } from './config';
import { emitLoggerMessage } from './console';
import { normalizeLoggerGroup, normalizeLoggerMain } from './helper/normalize';
import {
  DEFAULT_LOGGER_SCOPE_ID,
  normalizeLoggerScopeId,
} from './helper/scope';

declare const MAIN_LOGGER_CACHE_KEY: unique symbol;

type MainLoggerCacheKey = string & {
  readonly [MAIN_LOGGER_CACHE_KEY]: true;
};

// Length-prefixing keeps adjacent arbitrary strings from sharing boundaries.
const createCacheKeySegment = (value: string): string =>
  `${value.length}:${value}`;

const createMainLoggerCacheKey = (
  scopeId: LoggerScopeId,
  main: string,
): MainLoggerCacheKey => {
  const normalizedScopeId = normalizeLoggerScopeId(scopeId);
  const normalizedMain = normalizeLoggerMain(main);

  return `${createCacheKeySegment(normalizedScopeId)}:${createCacheKeySegment(
    normalizedMain,
  )}` as MainLoggerCacheKey;
};

class LoggerImpl implements LoggerApi {
  readonly #main: string;
  readonly #scopeId: LoggerScopeId;
  readonly #scopedLoggers = new Map<string, ScopedLoggerImpl>();

  /** Cache for main loggers. */
  static readonly #mainCacheMap = new Map<MainLoggerCacheKey, LoggerImpl>();

  private constructor(scopeId: LoggerScopeId, main: string) {
    this.#main = normalizeLoggerMain(main);
    this.#scopeId = normalizeLoggerScopeId(scopeId);
  }

  static getOrCreate(main: string, scopeId: LoggerScopeId): LoggerImpl {
    const cacheKey = createMainLoggerCacheKey(scopeId, main);
    const cachedLogger = LoggerImpl.#mainCacheMap.get(cacheKey);

    if (cachedLogger) {
      return cachedLogger;
    }

    const logger = new LoggerImpl(scopeId, main);
    LoggerImpl.#mainCacheMap.set(cacheKey, logger);

    return logger;
  }

  getLoggerByGroup(group: string): ScopedLoggerApi {
    const normalizedGroup = normalizeLoggerGroup(group);
    const cachedScopedLogger = this.#scopedLoggers.get(normalizedGroup);

    if (cachedScopedLogger) {
      return cachedScopedLogger;
    }

    const scopedLogger = new ScopedLoggerImpl(
      this.#scopeId,
      this.#main,
      normalizedGroup,
    );

    this.#scopedLoggers.set(normalizedGroup, scopedLogger);
    return scopedLogger;
  }
}

class ScopedLoggerImpl implements ScopedLoggerApi {
  readonly #group: string;
  readonly #main: string;
  readonly #scopeId: LoggerScopeId;

  constructor(scopeId: LoggerScopeId, main: string, group: string) {
    this.#main = normalizeLoggerMain(main);
    this.#group = normalizeLoggerGroup(group);
    this.#scopeId = normalizeLoggerScopeId(scopeId);
  }

  /**
   * Logs an informational message.
   * @param message - The message to log
   */
  public info(message: string, options?: LoggerLogOptions): void {
    this.#log('info', message, options);
  }

  /**
   * Logs a success message.
   * @param message - The message to log
   */
  public success(message: string, options?: LoggerLogOptions): void {
    this.#log('success', message, options);
  }

  /**
   * Logs a warning message.
   * @param message - The message to log
   */
  public warn(message: string, options?: LoggerLogOptions): void {
    this.#log('warn', message, options);
  }

  /**
   * Logs an error message.
   * @param message - The message to log
   */
  public error(message: string, options?: LoggerLogOptions): void {
    this.#log('error', message, options);
  }

  /**
   * Logs a debug message.
   * @param message - The message to log
   */
  public debug(message: string): void {
    this.#log('debug', message);
  }

  #log(kind: LogKind, message: string, options?: LoggerLogOptions): void {
    emitLoggerMessage({
      group: this.#group,
      kind,
      main: this.#main,
      message,
      options,
      scopeId: this.#scopeId,
    });
  }
}

/**
 * Creates a logger instance for a specific scope with a given main module identifier.
 *
 * This function returns a Logger instance that can create scoped loggers by group,
 * filtered according to the configuration registered for the given scope. If no
 * configuration exists for the scope, an error is thrown.
 *
 * @param options - Logger creation options containing the main module name
 * @param scopeId - The identifier for the logger scope; determines which configuration is used
 * @returns A logger instance for the specified scope
 * @throws {Error} If no logger configuration is registered for the provided scope ID
 *
 * @example
 * ```ts
 * // Create a logger for a custom scope
 * const customLogger = createScopedLogger({ main: 'analyzer' }, 'custom-scope');
 * const groupLogger = customLogger.getLoggerByGroup('vitepress');
 * groupLogger.info('Message');
 * ```
 */
export const createScopedLogger = (
  options: CreateLoggerOptions,
  scopeId: LoggerScopeId,
): LoggerApi => {
  const normalizedScopeId = assertLoggerConfigRegisteredForScope(scopeId);

  return LoggerImpl.getOrCreate(options.main, normalizedScopeId);
};

/**
 * Creates a logger instance using the default logger scope.
 *
 * This is a convenience wrapper around createScopedLogger() that automatically
 * uses the default scope. Use this for general-purpose logging in applications
 * that don't require multiple logger scopes.
 *
 * @param options - Logger creation options containing the main module name
 * @returns A logger instance for the default scope
 *
 * @example
 * ```ts
 * const logger = createLogger({ main: 'app' });
 * const groupLogger = logger.getLoggerByGroup('startup');
 * groupLogger.info('Application initialized');
 * ```
 */
export function createLogger(options: CreateLoggerOptions): LoggerApi {
  return createScopedLogger(options, DEFAULT_LOGGER_SCOPE_ID);
}
