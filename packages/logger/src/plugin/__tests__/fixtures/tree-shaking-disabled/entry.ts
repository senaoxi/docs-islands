import { createLogger } from '@docs-islands/logger';

const logger = createLogger({
  main: '@docs-islands/logger-fixture',
}).getLoggerByGroup('tree_shaking.disabled');

logger.debug('fixture disabled hidden debug');
logger.info('fixture disabled hidden info');
