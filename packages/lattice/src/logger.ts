import { createLogger } from '@docs-islands/logger';
import { formatErrorMessage } from '@docs-islands/logger/helper';
import type { ScopedLogger } from '@docs-islands/logger/types';

const logger = createLogger({
  main: '@docs-islands/lattice',
});

export const CliLogger: ScopedLogger = logger.getLoggerByGroup('task.cli');
export const GraphLogger: ScopedLogger = logger.getLoggerByGroup('task.graph');
export const PackageLogger: ScopedLogger =
  logger.getLoggerByGroup('task.package');
export const PathsLogger: ScopedLogger = logger.getLoggerByGroup('task.paths');
export const ProofLogger: ScopedLogger = logger.getLoggerByGroup('task.proof');
export const TypecheckLogger: ScopedLogger =
  logger.getLoggerByGroup('task.typecheck');

export { formatErrorMessage };
