import { createLogger } from 'logaria';

const pruningLogger = createLogger({
  main: 'docs.logger.pruning',
}).getLoggerByGroup('fixture');

pruningLogger.debug('__docs_islands_logaria_docs_pruned_debug__');
