import { createElapsedTimer } from 'logaria/helper';
import { clearCliScreen, formatErrorMessage, TypecheckLogger } from '../logger';
import {
  runBuildImpl,
  type RunBuildOptions,
  type RunBuildResult,
  runCheckerBuildImpl,
  type RunCheckerBuildOptions,
  type RunCheckerBuildResult,
  runCheckerTypecheckImpl,
  type RunCheckerTypecheckOptions,
  type RunCheckerTypecheckResult,
} from '../typecheck/runner';

export type {
  RunBuildOptions,
  RunBuildResult,
  RunCheckerBuildOptions,
  RunCheckerBuildResult,
  RunCheckerTypecheckOptions,
  RunCheckerTypecheckResult,
} from '../typecheck/runner';
export type {
  TypecheckRunner,
  TypecheckTarget,
  TypecheckTargetResult,
} from '../typecheck/targets';

export async function runCheckerBuild(
  options: RunCheckerBuildOptions,
): Promise<RunCheckerBuildResult> {
  if (options.clearScreen ?? true) {
    clearCliScreen();
  }

  const elapsed = createElapsedTimer();
  const task = options.flow?.start('checker build', {
    depth: options.flowDepth ?? 0,
  });

  TypecheckLogger.info('checker build started');

  try {
    const result = await runCheckerBuildImpl(options);

    if (result.passed) {
      if (!options.flow?.interactive) {
        TypecheckLogger.success('checker build finished', elapsed());
      }

      task?.pass();
    } else {
      TypecheckLogger.error('checker build finished with failures', elapsed());
      task?.fail('checker build finished with failures');
    }
    return result;
  } catch (error) {
    TypecheckLogger.error(
      `checker build failed: ${formatErrorMessage(error)}`,
      elapsed(),
    );
    task?.fail('checker build failed', { error });
    throw error;
  }
}

export async function runBuild(
  options: RunBuildOptions,
): Promise<RunBuildResult> {
  if (options.clearScreen ?? true) {
    clearCliScreen();
  }

  const elapsed = createElapsedTimer();
  const task = options.flow?.start('build', {
    depth: options.flowDepth ?? 0,
  });

  TypecheckLogger.info('build started');

  try {
    const result = await runBuildImpl(options);

    if (result.passed) {
      if (!options.flow?.interactive) {
        TypecheckLogger.success('build finished', elapsed());
      }

      task?.pass();
    } else {
      TypecheckLogger.error('build finished with failures', elapsed());
      task?.fail('build finished with failures');
    }

    return result;
  } catch (error) {
    TypecheckLogger.error(
      `build failed: ${formatErrorMessage(error)}`,
      elapsed(),
    );
    task?.fail('build failed', { error });
    throw error;
  }
}

export async function runCheckerTypecheck(
  options: RunCheckerTypecheckOptions,
): Promise<RunCheckerTypecheckResult> {
  if (options.clearScreen ?? true) {
    clearCliScreen();
  }

  const elapsed = createElapsedTimer();
  const task = options.flow?.start('checker typecheck', {
    depth: options.flowDepth ?? 0,
  });

  TypecheckLogger.info('checker typecheck started');

  try {
    const result = await runCheckerTypecheckImpl(options);

    if (result.passed) {
      if (!options.flow?.interactive) {
        TypecheckLogger.success('checker typecheck finished', elapsed());
      }

      task?.pass();
    } else {
      TypecheckLogger.error(
        'checker typecheck finished with failures',
        elapsed(),
      );
      task?.fail('checker typecheck finished with failures');
    }

    return result;
  } catch (error) {
    TypecheckLogger.error(
      `checker typecheck failed: ${formatErrorMessage(error)}`,
      elapsed(),
    );
    task?.fail('checker typecheck failed', { error });
    throw error;
  }
}
