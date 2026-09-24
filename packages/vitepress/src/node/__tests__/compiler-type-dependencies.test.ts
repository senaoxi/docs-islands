import { existsSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const vueRequire = createRequire(require.resolve('vue/package.json'));
const sfcRequire = createRequire(
  vueRequire.resolve('@vue/compiler-sfc/package.json'),
);

describe('Vue compiler declaration dependencies', () => {
  it.each(['@vue/compiler-core', '@vue/compiler-sfc'])(
    '%s resolves Babel types from its own pnpm dependency scope',
    (compiler) => {
      const manifest = sfcRequire.resolve(`${compiler}/package.json`);
      const compilerRequire = createRequire(manifest);
      const parserRequire = createRequire(
        compilerRequire.resolve('@babel/parser/package.json'),
      );
      // An ancestor node_modules can hide a missing dependency locally while
      // the same declarations fail on a clean CI runner with hoist=false.
      const localTypes = path.resolve(
        path.dirname(manifest),
        '../../@babel/types/package.json',
      );

      expect(existsSync(localTypes)).toBe(true);
      expect(realpathSync(localTypes)).toBe(
        realpathSync(parserRequire.resolve('@babel/types/package.json')),
      );
    },
  );
});
