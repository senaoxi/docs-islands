import { createElapsedTimer } from 'logaria/helper';
import type { ResolvedLiminaConfig } from '../config/runner';
import { clearCliScreen, formatErrorMessage, SourceLogger } from '../logger';
import {
  runSourceCheckImpl,
  type RunSourceCheckOptions,
} from '../source-check/runner';

export type { RunSourceCheckOptions } from '../source-check/runner';

export async function runSourceCheck(
  config: ResolvedLiminaConfig,
  options: RunSourceCheckOptions = {},
): Promise<boolean> {
  if (options.clearScreen ?? true) {
    clearCliScreen();
  }

  const elapsed = createElapsedTimer();
  const task = options.flow?.start('source check', {
    depth: options.flowDepth ?? 0,
  });

  if (!options.flow) {
    SourceLogger.info('source check started');
  }

  try {
    const logSuccess = !options.flow?.interactive;
    const passed = await runSourceCheckImpl(config, {
      core: options.core,
      generatedGraphProvider: options.generatedGraphProvider,
      knipRunner: options.knipRunner,
      logSuccess,
      report: options.report,
    });

    if (passed) {
      if (logSuccess) {
        SourceLogger.success('source check finished', elapsed());
      }

      task?.pass();
    } else {
      if (!options.flow) {
        SourceLogger.error('source check failed', elapsed());
      }

      task?.fail('source check failed');
    }

    return passed;
  } catch (error) {
    SourceLogger.error(
      `source check failed: ${formatErrorMessage(error)}`,
      elapsed(),
    );
    task?.fail('source check failed', { error });
    throw error;
  }
}
