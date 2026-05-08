import { createLogger, createLogger as makeLogger } from '@docs-islands/logger';

const staticLogger = createLogger({
  main: '@docs-islands/logger-fixture',
}).getLoggerByGroup('tree_shaking.levels');

staticLogger.debug('fixture levels hidden debug');
staticLogger.info('fixture levels hidden info');
staticLogger.success('fixture levels hidden success');
staticLogger.warn('fixture levels visible warn');
staticLogger.error('fixture levels visible error');

const aliasedLogger = makeLogger({
  main: '@docs-islands/logger-fixture',
}).getLoggerByGroup('tree_shaking.levels');

aliasedLogger.info('fixture unsupported aliased import');

const dynamicMain = '@docs-islands/logger-fixture';
const dynamicMainLogger = createLogger({
  main: dynamicMain,
}).getLoggerByGroup('tree_shaking.levels');

dynamicMainLogger.info('fixture unsupported dynamic main');

const dynamicGroup = 'tree_shaking.levels';
const dynamicGroupLogger = createLogger({
  main: '@docs-islands/logger-fixture',
}).getLoggerByGroup(dynamicGroup);

dynamicGroupLogger.info('fixture unsupported dynamic group');

const dynamicMessageLogger = createLogger({
  main: '@docs-islands/logger-fixture',
}).getLoggerByGroup('tree_shaking.levels');
const dynamicMessage = 'fixture unsupported dynamic message';

dynamicMessageLogger.info(dynamicMessage);

let mutableLogger = createLogger({
  main: '@docs-islands/logger-fixture',
}).getLoggerByGroup('tree_shaking.levels');
mutableLogger = createLogger({
  main: '@docs-islands/logger-fixture',
}).getLoggerByGroup('tree_shaking.other');

mutableLogger.info('fixture unsupported mutable binding');

const destructuredLogger = createLogger({
  main: '@docs-islands/logger-fixture',
}).getLoggerByGroup('tree_shaking.levels');
const { info } = destructuredLogger;

info('fixture unsupported destructured method');

const computedLogger = createLogger({
  main: '@docs-islands/logger-fixture',
}).getLoggerByGroup('tree_shaking.levels');
const computedMethod = Math.random() > -1 ? 'info' : 'warn';

computedLogger[computedMethod]('fixture unsupported computed method');

const assignedLogger = createLogger({
  main: '@docs-islands/logger-fixture',
}).getLoggerByGroup('tree_shaking.levels');

const assignedResult = assignedLogger.info(
  'fixture unsupported assigned log call',
);

console.log(assignedResult);
