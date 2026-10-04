import { createLogger, resetLoggerConfig, setLoggerConfig } from 'logaria';
import { getScopedLoggerConfig } from 'logaria/core';
import { DEFAULT_LOGGER_SCOPE_ID } from 'logaria/core/helper';
import vm from 'node:vm';
import { rollup } from 'rollup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loggerPlugin, transformLoggerTreeShaking } from '../plugin';

const prelude = "import { createLogger } from 'logaria';\n";
const binding =
  "const logger = createLogger({main:'fixture-app'}).getLoggerByGroup('build');\n";

const transform = (code: string) =>
  transformLoggerTreeShaking(code, 'fixture.js', {
    loggerModuleId: 'logaria',
    loggerScopeId: DEFAULT_LOGGER_SCOPE_ID,
  });

const execute = (code: string, flag = false): unknown[] => {
  const events: unknown[] = [];
  const body = code.replace(prelude, '');
  vm.runInNewContext(body, { createLogger, events, flag });
  return events;
};

const build = async (
  code: string,
  plugin: ReturnType<typeof loggerPlugin.rollup>,
) => {
  const id = 'virtual:logaria-safety.js';
  const bundle = await rollup({
    input: id,
    external: ['logaria'],
    plugins: [
      {
        name: 'fixture-entry',
        resolveId: (entry) => (entry === id ? id : null),
        load: (entry) => (entry === id ? code : null),
      },
      plugin,
    ],
  });
  try {
    const result = await bundle.generate({ format: 'esm' });
    return result.output
      .filter((item) => item.type === 'chunk')
      .map((item) => item.code)
      .join('\n');
  } finally {
    await bundle.close();
  }
};

beforeEach(() => {
  setLoggerConfig({ levels: [] });
});
afterEach(() => {
  vi.restoreAllMocks();
  resetLoggerConfig();
});

describe('tree-shaking preserves JavaScript behavior', () => {
  it.each([
    ["if (flag) logger.info('hidden');\nevents.push('always');", ['always']],
    ["if (flag) logger.info('hidden'); else events.push('else');", ['else']],
    [
      "for (let i=0;i<2;i++) logger.info('hidden');\nevents.push('after');",
      ['after'],
    ],
    [
      "let count=0; while (count++<2) logger.info('hidden');\nevents.push(count);",
      [3],
    ],
    [
      "let count=0; do logger.info('hidden'); while (++count<2); events.push(count);",
      [2],
    ],
  ])(
    'preserves a suppressed single-statement body: %s',
    async (statement, expected) => {
      const code = `${prelude}${binding}${statement}`;
      expect(execute(code)).toEqual(expected);
      const result = await transform(code);
      expect(result).not.toBeNull();
      expect(result?.code).not.toContain('hidden');
      expect(execute(result?.code ?? code)).toEqual(expected);
    },
  );

  it('builds and executes a bare if/else through the public Rollup adapter', async () => {
    const code = `${prelude}${binding}if (flag) logger.info('hidden'); else events.push('else');`;
    const result = await build(
      code,
      loggerPlugin.rollup({ config: { levels: [] }, treeshake: true }),
    );
    expect(result).not.toContain('hidden');
    expect(execute(result)).toEqual(['else']);
    expect(execute(result, true)).toEqual([]);
  });

  it('preserves side effects in the elapsed-time argument', async () => {
    const code = `${prelude}${binding}logger.info('hidden', {elapsedTimeMs: events.push('evaluated')});`;
    expect(execute(code)).toEqual(['evaluated']);
    const result = await transform(code);
    expect(execute(result?.code ?? code)).toEqual(['evaluated']);
  });

  it('preserves evaluation of extra and spread arguments', async () => {
    for (const argumentsText of [
      "'hidden', {elapsedTimeMs: 1}, events.push('evaluated')",
      "'hidden', ...[{elapsedTimeMs: events.push('evaluated')}]",
    ]) {
      const code = `${prelude}${binding}logger.info(${argumentsText});`;
      const result = await transform(code);
      expect(execute(result?.code ?? code)).toEqual(['evaluated']);
    }
  });

  it.each(['12', '-12', '+12'])(
    'still prunes literal elapsed-time options: %s',
    async (elapsed) => {
      const code = `${prelude}${binding}logger.info('hidden', {elapsedTimeMs: ${elapsed}});`;
      const result = await transform(code);
      expect(result).not.toBeNull();
      expect(result?.code).not.toContain('hidden');
    },
  );

  it.each([
    "{main:'hidden', ...{main:'visible'}}",
    "{main:'hidden', main:'visible'}",
    "{main:'hidden', ['main']:'visible'}",
    "{main:'hidden', get main(){return 'visible'}}",
  ])('keeps an ambiguous final main: %s', async (options) => {
    setLoggerConfig({
      levels: [],
      rules: { visible: { main: 'visible', levels: ['info'] } },
    });
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const code = `${prelude}const logger = createLogger(${options}).getLoggerByGroup('build');\nlogger.info('visible message');`;
    execute(code);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockClear();
    const result = await transform(code);
    execute(result?.code ?? code);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('plugin config ownership', () => {
  it('keeps each plugin policy when another instance is constructed', async () => {
    const a = loggerPlugin.rollup({
      config: { levels: ['info'] },
      treeshake: true,
    });
    const b = loggerPlugin.rollup({ config: { levels: [] }, treeshake: true });
    const code = `${prelude}${binding}logger.info('allowed by A');`;
    expect(await build(code, a)).toContain('allowed by A');
    expect(await build(code, b)).not.toContain('allowed by A');
    expect(await build(code, a)).toContain('allowed by A');
  });

  it('does not configure the host process default scope', () => {
    setLoggerConfig({ levels: ['warn'] });
    loggerPlugin.rollup({ config: { levels: [] }, treeshake: false });
    expect(getScopedLoggerConfig(DEFAULT_LOGGER_SCOPE_ID)?.levels).toEqual([
      'warn',
    ]);
  });
});
