import { describe, expect, it } from 'vitest';
import {
  baseScriptFileRules,
  baseTestFileRules,
  untypedModuleTypeScriptRules,
  untypedTypeScriptRules,
} from '../rules';

describe('Shared Rule Configurations', () => {
  describe('baseTestFileRules', () => {
    it('should disable complexity rules for test files', () => {
      expect(baseTestFileRules.complexity).toBe('off');
      expect(baseTestFileRules['max-lines']).toBe('off');
      expect(baseTestFileRules['max-lines-per-function']).toBe('off');
    });

    it('should allow console.log in test files', () => {
      expect(baseTestFileRules['no-console']).toBe('off');
    });

    it('should relax TypeScript safety rules', () => {
      expect(baseTestFileRules['@typescript-eslint/no-explicit-any']).toBe(
        'off',
      );
      expect(baseTestFileRules['@typescript-eslint/no-unsafe-assignment']).toBe(
        'off',
      );
    });
  });

  describe('baseScriptFileRules', () => {
    it('should have moderate complexity limits', () => {
      expect(baseScriptFileRules.complexity).toEqual(['warn', { max: 30 }]);
      expect(baseScriptFileRules['max-lines']).toEqual([
        'warn',
        { max: 800, skipBlankLines: true, skipComments: true },
      ]);
    });

    it('should allow process.exit in scripts', () => {
      expect(baseScriptFileRules['unicorn/no-process-exit']).toBe('off');
    });

    it('should relax TypeScript rules for scripts', () => {
      expect(baseScriptFileRules['@typescript-eslint/no-unsafe-call']).toBe(
        'off',
      );
      expect(baseScriptFileRules['require-await']).toBe('off');
    });
  });

  describe('untypedTypeScriptRules', () => {
    it('should disable type-checking rules', () => {
      expect(
        untypedTypeScriptRules['@typescript-eslint/no-floating-promises'],
      ).toBe('off');
      expect(
        untypedTypeScriptRules['@typescript-eslint/no-unsafe-assignment'],
      ).toBe('off');
    });

    it('should have at least 20 disabled rules', () => {
      const ruleCount = Object.keys(untypedTypeScriptRules).length;
      expect(ruleCount).toBeGreaterThanOrEqual(20);
    });
  });

  describe('untypedModuleTypeScriptRules', () => {
    it('should extend untypedTypeScriptRules', () => {
      expect(
        untypedModuleTypeScriptRules['@typescript-eslint/no-floating-promises'],
      ).toBe('off');
    });

    it('should additionally disable CommonJS rules', () => {
      expect(
        untypedModuleTypeScriptRules['@typescript-eslint/no-require-imports'],
      ).toBe('off');
      expect(
        untypedModuleTypeScriptRules['@typescript-eslint/no-var-requires'],
      ).toBe('off');
    });
  });
});
