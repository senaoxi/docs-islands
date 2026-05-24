import { createLogger } from 'logaria';

const logger = createLogger({
  main: 'logaria-fixture',
}).getLoggerByGroup('tree_shaking.debug');

logger.debug('fixture debug visible debug');
