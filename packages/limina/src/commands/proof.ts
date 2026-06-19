import { createElapsedTimer } from 'logaria/helper';
import type { ResolvedLiminaConfig } from '../config/runner';
import { clearCliScreen, formatErrorMessage, ProofLogger } from '../logger';
import { runProofCheckImpl, type RunProofCheckOptions } from '../proof/runner';

export type { RunProofCheckOptions } from '../proof/runner';

export async function runProofCheck(
  config: ResolvedLiminaConfig,
  options: RunProofCheckOptions = {},
): Promise<boolean> {
  if (options.clearScreen ?? true) {
    clearCliScreen();
  }

  const elapsed = createElapsedTimer();
  const task = options.flow?.start('proof check', {
    depth: options.flowDepth ?? 0,
  });

  ProofLogger.info('proof check started');

  try {
    const logSuccess = !options.flow?.interactive;
    const passed = await runProofCheckImpl(config, {
      core: options.core,
      generatedGraphProvider: options.generatedGraphProvider,
      logSuccess,
    });

    if (passed) {
      if (logSuccess) {
        ProofLogger.success('proof check finished', elapsed());
      }

      task?.pass();
    } else {
      ProofLogger.error('proof check finished with failures', elapsed());
      task?.fail('proof check finished with failures');
    }

    return passed;
  } catch (error) {
    ProofLogger.error(
      `proof check failed: ${formatErrorMessage(error)}`,
      elapsed(),
    );
    task?.fail('proof check failed', { error });
    throw error;
  }
}
