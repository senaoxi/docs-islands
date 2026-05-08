import { createLogger } from '@docs-islands/logger';

const metricsLogger = createLogger({
  main: '@docs-islands/logger-fixture',
}).getLoggerByGroup('tree_shaking.metrics');
const otherMainLogger = createLogger({
  main: '@docs-islands/other-fixture',
}).getLoggerByGroup('tree_shaking.metrics');
const apiLogger = createLogger({
  main: '@docs-islands/logger-fixture',
}).getLoggerByGroup('tree_shaking.api');

metricsLogger.info('fixture rules hidden unmatched info');
metricsLogger.warn('fixture rules visible metrics warning');
metricsLogger.warn('fixture rules hidden wrong message');
metricsLogger.success('fixture rules hidden disabled success');
otherMainLogger.warn('fixture rules hidden wrong main');
apiLogger.error('fixture rules visible api error');
apiLogger.warn('fixture rules hidden api warn');
