import { createLogger } from 'logaria';

const staticLogger = createLogger({
  main: 'logaria-fixture',
}).getLoggerByGroup('tree_shaking.boundaries');

staticLogger.info('fixture boundaries hidden static info');
staticLogger.error('fixture boundaries visible static error');

const dynamicMain = 'logaria-fixture';
const dynamicMainLogger = createLogger({
  main: dynamicMain,
}).getLoggerByGroup('tree_shaking.boundaries');

dynamicMainLogger.info('fixture boundaries kept dynamic main');

const dynamicGroup = 'tree_shaking.boundaries';
const dynamicGroupLogger = createLogger({
  main: 'logaria-fixture',
}).getLoggerByGroup(dynamicGroup);

dynamicGroupLogger.info('fixture boundaries kept dynamic group');

const dynamicMessageLogger = createLogger({
  main: 'logaria-fixture',
}).getLoggerByGroup('tree_shaking.boundaries');
const dynamicMessage = 'fixture boundaries kept dynamic message';

dynamicMessageLogger.info(dynamicMessage);

const templateMessageLogger = createLogger({
  main: 'logaria-fixture',
}).getLoggerByGroup('tree_shaking.boundaries');
const templateMessage = `fixture boundaries kept template message`;

templateMessageLogger.info(templateMessage);

const directTemplateLogger = createLogger({
  main: 'logaria-fixture',
}).getLoggerByGroup('tree_shaking.boundaries');

directTemplateLogger.info(`fixture boundaries kept direct template message`);
