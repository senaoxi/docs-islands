import { createLogger } from 'logaria';

const logger = createLogger({
  main: 'logaria-fixture',
}).getLoggerByGroup('tree_shaking.disabled');

logger.debug('fixture disabled hidden debug');
logger.info('fixture disabled hidden info');
