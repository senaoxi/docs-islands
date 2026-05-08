import { createLogger } from '@docs-islands/logger';

const logger = createLogger({
  main: '@docs-islands/logger-fixture',
}).getLoggerByGroup('tree_shaking.debug');

logger.debug('fixture debug visible debug');
