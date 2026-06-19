import { createElapsedTimer } from 'logaria/helper';
import { clearCliScreen, formatErrorMessage, PackageLogger } from '../logger';
import {
  runPackageCheckImpl,
  type RunPackageCheckOptions,
} from '../package-check/runner';

export type { RunPackageCheckOptions } from '../package-check/runner';

export async function runPackageCheck(
  options: RunPackageCheckOptions,
): Promise<boolean> {
  if (options.clearScreen ?? true) {
    clearCliScreen();
  }

  const elapsed = createElapsedTimer();
  const task = options.flow?.start('package check', {
    depth: options.flowDepth ?? 0,
  });

  try {
    PackageLogger.info('package check started');

    const passed = await runPackageCheckImpl(options);

    if (passed) {
      if (!options.flow?.interactive) {
        PackageLogger.success('package check finished', elapsed());
      }

      task?.pass();
    } else {
      PackageLogger.error('package check finished with failures', elapsed());
      task?.fail('package check finished with failures');
    }

    return passed;
  } catch (error) {
    PackageLogger.error(
      `package check failed: ${formatErrorMessage(error)}`,
      elapsed(),
    );
    task?.fail('package check failed', { error });
    throw error;
  }
}
