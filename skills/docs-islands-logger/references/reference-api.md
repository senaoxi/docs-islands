# API Reference

Use this as the compact public API map for `@docs-islands/logger`.

## Contents

- [Root Entry](#root-entry)
- [Plugin Entry](#plugin-entry)
- [Core Entry](#core-entry)
- [Helper Entries](#helper-entries)
- [Types Entry](#types-entry)

## Root Entry

```ts
import {
  createLogger,
  resetLoggerConfig,
  resolveLoggerConfig,
  setLoggerConfig,
} from '@docs-islands/logger';
```

```ts
createLogger(options: { main: string }): Logger;
resolveLoggerConfig(config: LoggerConfig): NormalizedLoggerConfig;
setLoggerConfig(config: LoggerConfig): void;
resetLoggerConfig(): void;
```

`Logger` exposes:

```ts
getLoggerByGroup(group: string): ScopedLogger;
```

`ScopedLogger` exposes:

```ts
info(message: string, options?: { elapsedTimeMs: number }): void;
success(message: string, options?: { elapsedTimeMs: number }): void;
warn(message: string, options?: { elapsedTimeMs: number }): void;
error(message: string, options?: { elapsedTimeMs: number }): void;
debug(message: string): void;
```

## Plugin Entry

```ts
import {
  LOGGER_TREE_SHAKING_PLUGIN_NAME,
  loggerPlugin,
  transformLoggerTreeShaking,
} from '@docs-islands/logger/plugin';
```

Common adapters:

```ts
loggerPlugin.vite(options);
loggerPlugin.rollup(options);
loggerPlugin.rolldown(options);
loggerPlugin.esbuild(options);
loggerPlugin.webpack(options);
loggerPlugin.rspack(options);
loggerPlugin.farm(options);
```

## Core Entry

```ts
import {
  createScopedLogger,
  getScopedLoggerConfig,
  resetScopedLoggerConfig,
  setScopedLoggerConfig,
  shouldSuppressLog,
} from '@docs-islands/logger/core';
```

Use `@docs-islands/logger/core` only for framework or host integrations that need explicit scope ownership.

## Helper Entries

```ts
import {
  createElapsedLogOptions,
  createElapsedTimer,
  formatDebugMessage,
  formatElapsedTime,
  formatErrorMessage,
  sanitizeDebugSummary,
} from '@docs-islands/logger/helper';

import {
  createLoggerScopeId,
  normalizeLoggerConfig,
  resolveLoggerConfig,
} from '@docs-islands/logger/core/helper';
```

## Types Entry

```ts
import type {
  Logger,
  LoggerConfig,
  LoggerLogOptions,
  LoggerPresetPlugin,
  LoggerRuleSetting,
  LoggerRulesUserConfig,
  LoggerVisibilityLevel,
  LogKind,
  NormalizedLoggerConfig,
  NormalizedLoggerRule,
  ScopedLogger,
} from '@docs-islands/logger/types';
```

Core config shape:

```ts
interface LoggerConfig {
  debug?: boolean;
  levels?: Array<'error' | 'warn' | 'info' | 'success'>;
  plugins?: Record<string, LoggerPresetPlugin>;
  extends?: string[];
  rules?: LoggerRulesUserConfig;
}

type LoggerRuleLevelsUserConfig = 'inherit' | Array<'error' | 'warn' | 'info' | 'success'>;

type LoggerRuleSetting = 'off' | LoggerRuleUserConfig;

interface LoggerRuleUserConfig {
  main?: string;
  group?: string;
  message?: string;
  levels: LoggerRuleLevelsUserConfig;
}

interface LoggerPresetRuleUserConfig {
  main?: string;
  group?: string;
  message?: string;
}

interface NormalizedLoggerConfig {
  debug?: boolean;
  levels?: Array<'error' | 'warn' | 'info' | 'success'>;
  rules?: NormalizedLoggerRule[];
}

interface NormalizedLoggerRule {
  groupMatcher?: (value: string) => boolean;
  label: string;
  main?: string;
  messageMatcher?: (value: string) => boolean;
  levels?: Array<'error' | 'warn' | 'info' | 'success'>;
}
```

## Related

- [Getting Started](guide-getting-started.md)
- [Configuration Guide](guide-configuration.md)
- [Scoped API](api-scoped.md)
