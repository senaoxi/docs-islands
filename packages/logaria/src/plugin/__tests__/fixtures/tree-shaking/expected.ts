export interface LoggerTreeShakingExpectation {
  kept: string[];
  removed: string[];
}

export const LOGGER_TREE_SHAKING_LEVELS_EXPECTED: LoggerTreeShakingExpectation =
  {
    kept: [
      'fixture levels visible warn',
      'fixture levels visible error',
      'fixture unsupported aliased import',
      'fixture unsupported dynamic main',
      'fixture unsupported dynamic group',
      'fixture unsupported dynamic message',
      'fixture unsupported mutable binding',
      'fixture unsupported destructured method',
      'fixture unsupported computed method',
      'fixture unsupported assigned log call',
    ],
    removed: [
      'fixture levels hidden debug',
      'fixture levels hidden info',
      'fixture levels hidden success',
    ],
  };

export const LOGGER_TREE_SHAKING_RULES_EXPECTED: LoggerTreeShakingExpectation =
  {
    kept: [
      'fixture rules visible metrics warning',
      'fixture rules visible api error',
    ],
    removed: [
      'fixture rules hidden unmatched info',
      'fixture rules hidden wrong message',
      'fixture rules hidden disabled success',
      'fixture rules hidden wrong main',
      'fixture rules hidden api warn',
    ],
  };

export const LOGGER_TREE_SHAKING_BOUNDARIES_EXPECTED: LoggerTreeShakingExpectation =
  {
    kept: [
      'fixture boundaries visible static error',
      'fixture boundaries kept dynamic main',
      'fixture boundaries kept dynamic group',
      'fixture boundaries kept dynamic message',
      'fixture boundaries kept template message',
      'fixture boundaries kept direct template message',
    ],
    removed: ['fixture boundaries hidden static info'],
  };

export const LOGGER_TREE_SHAKING_DEFAULT_EXPECTED: LoggerTreeShakingExpectation =
  {
    kept: [
      'fixture default visible info',
      'fixture default visible success',
      'fixture default visible warn',
      'fixture default visible error',
    ],
    removed: ['fixture default hidden debug'],
  };

export const LOGGER_TREE_SHAKING_DEBUG_ENABLED_EXPECTED: LoggerTreeShakingExpectation =
  {
    kept: ['fixture debug visible debug'],
    removed: [],
  };

export const LOGGER_TREE_SHAKING_DISABLED_EXPECTED: LoggerTreeShakingExpectation =
  {
    kept: ['fixture disabled hidden debug', 'fixture disabled hidden info'],
    removed: [],
  };
