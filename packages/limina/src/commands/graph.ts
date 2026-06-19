import { createElapsedTimer } from 'logaria/helper';
import type { ResolvedLiminaConfig } from '../config/runner';
import type { DependencyGraphDocument } from '../dependency-graph/runner';
import {
  runGraphCheckImpl,
  type RunGraphCheckOptions,
  runGraphExportImpl,
  type RunGraphExportOptions,
  runGraphPrepareImpl,
  type RunGraphPrepareOptions,
} from '../graph-check/runner';
import { clearCliScreen, formatErrorMessage, GraphLogger } from '../logger';

export type {
  RunGraphCheckOptions,
  RunGraphExportOptions,
  RunGraphPrepareOptions,
} from '../graph-check/runner';

export async function runGraphPrepare(
  config: ResolvedLiminaConfig,
  options: RunGraphPrepareOptions = {},
): Promise<boolean> {
  if (options.clearScreen ?? true) {
    clearCliScreen();
  }

  const elapsed = createElapsedTimer();
  const task = options.flow?.start('graph prepare', {
    depth: options.flowDepth ?? 0,
  });

  GraphLogger.info('graph prepare started');

  try {
    const result = await runGraphPrepareImpl(config, options);

    if (!options.flow?.interactive) {
      GraphLogger.success(
        result.changed
          ? 'graph prepare generated files'
          : 'graph prepare found generated files up to date',
        elapsed(),
      );
    }

    task?.pass();
    return true;
  } catch (error) {
    GraphLogger.error(
      `graph prepare failed: ${formatErrorMessage(error)}`,
      elapsed(),
    );
    task?.fail('graph prepare failed', { error });
    throw error;
  }
}

export async function runGraphCheck(
  config: ResolvedLiminaConfig,
  options: RunGraphCheckOptions = {},
): Promise<boolean> {
  if (options.clearScreen ?? true) {
    clearCliScreen();
  }

  const elapsed = createElapsedTimer();
  const task = options.flow?.start('graph check', {
    depth: options.flowDepth ?? 0,
  });

  GraphLogger.info('graph check started');

  try {
    const logSuccess = !options.flow?.interactive;
    const passed = await runGraphCheckImpl(config, {
      core: options.core,
      generatedGraphProvider: options.generatedGraphProvider,
      logSuccess,
    });

    if (passed) {
      if (logSuccess) {
        GraphLogger.success('graph check finished', elapsed());
      }

      task?.pass();
    } else {
      GraphLogger.error('graph check finished with failures', elapsed());
      task?.fail('graph check finished with failures');
    }

    return passed;
  } catch (error) {
    GraphLogger.error(
      `graph check failed: ${formatErrorMessage(error)}`,
      elapsed(),
    );
    task?.fail('graph check failed', { error });
    throw error;
  }
}

export async function runGraphExport(
  config: ResolvedLiminaConfig,
  options: RunGraphExportOptions = {},
): Promise<DependencyGraphDocument> {
  return await runGraphExportImpl(config, options);
}
