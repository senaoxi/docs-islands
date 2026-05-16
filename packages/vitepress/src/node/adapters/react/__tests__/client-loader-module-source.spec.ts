import { describe, expect, it } from 'vitest';
import { createReactClientLoaderModuleSource } from '../client-loader-module-source';

describe('createReactClientLoaderModuleSource', () => {
  it('uses createLogger from the public logger entry in emitted runtime helpers', () => {
    const code = createReactClientLoaderModuleSource({
      base: '/',
      cleanUrls: false,
      componentEntries: [
        {
          componentName: 'HelloWorld',
          loaderImportedName: 'default',
          modulePath: '/assets/HelloWorld.js',
        },
      ],
    });

    expect(code).toContain('@docs-islands/vitepress/logger');
    expect(code).toContain('@docs-islands/logger/helper');
    expect(code).toContain(
      "import {\n  formatDebugMessage as __docs_islands_format_debug__,\n  formatErrorMessage as __docs_islands_format_error__\n} from '@docs-islands/logger/helper';",
    );
    expect(code).toContain(
      "import { createLogger } from '@docs-islands/vitepress/logger';",
    );
    expect(code).toContain('const Logger = createLogger({');
    expect(code).toContain(
      "}).getLoggerByGroup('runtime.react.client-loader');",
    );
    expect(code).not.toContain('emitRuntimeLog');
    expect(code).not.toContain('__docs_islands_runtime_log__');
  });
});
