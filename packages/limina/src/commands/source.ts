import type { ResolvedLiminaConfig } from '#config/runner';
import { createElapsedTimer } from 'logaria/helper';
import { clearCliScreen, formatErrorMessage, SourceLogger } from '../logger';
import {
  runSourceCheckImpl,
  type RunSourceCheckOptions,
} from '../source-check/runner';
import {
  appendCheckIssues,
  appendTaskFailureIssueIfMissing,
  completeCheckIssueSnapshot,
  createTaskFailureIssue,
  writeNotRunSourceIssueSnapshot,
} from '../source-check/snapshot';

export type { RunSourceCheckOptions } from '../source-check/runner';

export async function runSourceCheck(
  config: ResolvedLiminaConfig,
  options: RunSourceCheckOptions = {},
): Promise<boolean> {
  await writeNotRunSourceIssueSnapshot({
    command: options.report?.command ?? 'limina source check',
    rootDir: config.rootDir,
  });

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
      await completeCheckIssueSnapshot({
        rootDir: config.rootDir,
      });

      if (logSuccess) {
        SourceLogger.success('source check finished', elapsed());
      }

      task?.pass();
    } else {
      await appendTaskFailureIssueIfMissing({
        issue: createTaskFailureIssue({
          code: 'LIMINA_SOURCE_CHECK_FAILED',
          filePath: config.configPath,
          fix: 'Inspect the source check report above, then rerun `limina source check` or `limina check`.',
          reason: 'Source check finished with unfilterable legacy failures.',
          rootDir: config.rootDir,
          task: 'source:check',
          title: 'Source check failed',
        }),
        rootDir: config.rootDir,
      });
      if (!options.flow) {
        SourceLogger.error('source check failed', elapsed());
      }

      task?.fail('source check failed');
    }

    return passed;
  } catch (error) {
    await appendCheckIssues({
      issues: [
        createTaskFailureIssue({
          code: 'LIMINA_SOURCE_CHECK_FAILED',
          filePath: config.configPath,
          fix: 'Inspect the source check error above, then rerun `limina source check` or `limina check`.',
          reason: `Source check failed: ${formatErrorMessage(error)}.`,
          rootDir: config.rootDir,
          task: 'source:check',
          title: 'Source check failed',
        }),
      ],
      rootDir: config.rootDir,
    });
    SourceLogger.error(
      `source check failed: ${formatErrorMessage(error)}`,
      elapsed(),
    );
    task?.fail('source check failed', { error });
    throw error;
  }
}
