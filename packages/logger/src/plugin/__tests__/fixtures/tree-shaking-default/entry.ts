import { createLogger } from '@docs-islands/logger';

const logger = createLogger({
  main: '@docs-islands/logger-fixture',
}).getLoggerByGroup('tree_shaking.default');

logger.debug('fixture default hidden debug');
logger.info('fixture default visible info');
logger.success('fixture default visible success');
logger.warn('fixture default visible warn');
logger.error('fixture default visible error');
