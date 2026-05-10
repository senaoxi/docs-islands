import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';
import { unifiedLogEntry } from '../rules/create-logger-rule';

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
});

describe('unified-log-entry rule', () => {
  it('should enforce @docs-islands/utils/logger usage', () => {
    ruleTester.run('unified-log-entry', unifiedLogEntry, {
      valid: [
        { code: "import { createLogger } from '@docs-islands/utils/logger';" },
        { code: "import { otherFunction } from 'some-package';" },
        {
          code: "import { createLogger as logger } from '@docs-islands/utils/logger';",
        },
      ],
      invalid: [
        {
          code: "import { createLogger } from '@docs-islands/logger';",
          errors: [{ messageId: 'useUtilsLogger' }],
        },
        {
          code: "import { createLogger } from 'pino';",
          errors: [{ messageId: 'useUtilsLogger' }],
        },
        {
          code: "export { createLogger } from '@docs-islands/logger';",
          errors: [{ messageId: 'useUtilsLogger' }],
        },
      ],
    });
  });
});
