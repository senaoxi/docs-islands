import { createElapsedTimer } from 'logaria/helper';
import { formatCheckIssueHumanReport } from '../check-reporting/human';
import {
  appendCheckIssues,
  completeCheckIssueSnapshot,
  createTaskFailureIssue,
  type LiminaCheckIssue,
  type LiminaCheckTaskName,
} from '../check-reporting/snapshot';
import { clearCliScreen, formatErrorMessage, TypecheckLogger } from '../logger';
import {
  type CheckerFailureTarget,
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

function createCheckerFailureIssues(options: {
  failedTargets: readonly CheckerFailureTarget[];
  fallbackReason: string;
  fix: string;
  projectRootDir: string;
  task: Extract<LiminaCheckTaskName, 'checker:build' | 'checker:typecheck'>;
  title: string;
}): LiminaCheckIssue[] {
  if (options.failedTargets.length === 0) {
    return [
      createTaskFailureIssue({
        code:
          options.task === 'checker:build'
            ? 'LIMINA_CHECKER_BUILD_FAILED'
            : 'LIMINA_CHECKER_TYPECHECK_FAILED',
        fix: options.fix,
        reason: options.fallbackReason,
        rootDir: options.projectRootDir,
        task: options.task,
        title: options.title,
      }),
    ];
  }

  return options.failedTargets.map((target) =>
    createTaskFailureIssue({
      checkerName: target.checkerName,
      code:
        options.task === 'checker:build'
          ? 'LIMINA_CHECKER_BUILD_FAILED'
          : 'LIMINA_CHECKER_TYPECHECK_FAILED',
      filePath: target.configPath,
      fix: options.fix,
      reason: [
        target.checkerName
          ? `Checker "${target.checkerName}" failed.`
          : 'Checker target failed.',
        `Exit code: ${target.exitCode}.`,
        ...(target.message ? [`Error: ${target.message}.`] : []),
      ].join(' '),
      rootDir: options.projectRootDir,
      task: options.task,
      title: options.title,
    }),
  );
}

function formatCheckerIssueReport(options: {
  command: string;
  issues: readonly LiminaCheckIssue[];
  title: string;
  verbose?: boolean;
}): string {
  return formatCheckIssueHumanReport({
    command: options.command,
    issues: options.issues,
    title: options.title,
    verbose: options.verbose,
  });
}

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

  if (!options.flow) {
    TypecheckLogger.info('checker build started');
  }

  try {
    const result = await runCheckerBuildImpl(options);

    if (result.passed) {
      await completeCheckIssueSnapshot({
        rootDir: options.config.rootDir,
      });

      if (!options.flow?.interactive) {
        TypecheckLogger.success('checker build finished', elapsed());
      }

      task?.pass();
    } else {
      const issues = createCheckerFailureIssues({
        failedTargets: result.failedTargets,
        fallbackReason: 'Checker build finished with failures.',
        fix: 'Inspect the checker build output above, then rerun `limina checker build` or `limina check`.',
        projectRootDir: result.projectRootDir,
        task: 'checker:build',
        title: 'Checker build failed',
      });

      await appendCheckIssues({
        issues,
        rootDir: options.config.rootDir,
      });
      TypecheckLogger.error(
        formatCheckerIssueReport({
          command: options.report?.command ?? 'limina checker build',
          issues,
          title: 'Checker build summary',
          verbose: options.report?.verbose,
        }),
        elapsed(),
      );
      task?.fail('checker build finished with failures');
    }
    return result;
  } catch (error) {
    const issue = createTaskFailureIssue({
      code: 'LIMINA_CHECKER_BUILD_FAILED',
      detailLines: [formatErrorMessage(error)],
      fix: 'Inspect the checker build error above, then rerun `limina checker build` or `limina check`.',
      reason: `Checker build failed: ${formatErrorMessage(error)}.`,
      rootDir: options.config.rootDir,
      task: 'checker:build',
      title: 'Checker build failed',
    });

    await appendCheckIssues({
      issues: [issue],
      rootDir: options.config.rootDir,
    });
    TypecheckLogger.error(
      formatCheckerIssueReport({
        command: options.report?.command ?? 'limina checker build',
        issues: [issue],
        title: 'Checker build summary',
        verbose: options.report?.verbose,
      }),
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

  if (!options.flow) {
    TypecheckLogger.info('build started');
  }

  try {
    const result = await runBuildImpl(options);

    if (result.passed) {
      await completeCheckIssueSnapshot({
        rootDir: options.config.rootDir,
      });

      if (!options.flow?.interactive) {
        TypecheckLogger.success('build finished', elapsed());
      }

      task?.pass();
    } else {
      const issues = createCheckerFailureIssues({
        failedTargets: result.failedTargets,
        fallbackReason: 'Checker build finished with failures.',
        fix: 'Inspect the checker build output above, then rerun `limina checker build`.',
        projectRootDir: result.projectRootDir,
        task: 'checker:build',
        title: 'Checker build failed',
      });

      await appendCheckIssues({
        issues,
        rootDir: options.config.rootDir,
      });
      TypecheckLogger.error(
        formatCheckerIssueReport({
          command: options.report?.command ?? 'limina checker build',
          issues,
          title: 'Build summary',
          verbose: options.report?.verbose,
        }),
        elapsed(),
      );
      task?.fail('build finished with failures');
    }

    return result;
  } catch (error) {
    const issue = createTaskFailureIssue({
      code: 'LIMINA_CHECKER_BUILD_FAILED',
      detailLines: [formatErrorMessage(error)],
      fix: 'Inspect the build error above, then rerun `limina checker build`.',
      reason: `Checker build failed: ${formatErrorMessage(error)}.`,
      rootDir: options.config.rootDir,
      task: 'checker:build',
      title: 'Checker build failed',
    });

    await appendCheckIssues({
      issues: [issue],
      rootDir: options.config.rootDir,
    });
    TypecheckLogger.error(
      formatCheckerIssueReport({
        command: options.report?.command ?? 'limina checker build',
        issues: [issue],
        title: 'Build summary',
        verbose: options.report?.verbose,
      }),
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

  if (!options.flow) {
    TypecheckLogger.info('checker typecheck started');
  }

  try {
    const result = await runCheckerTypecheckImpl(options);

    if (result.passed) {
      await completeCheckIssueSnapshot({
        rootDir: options.config.rootDir,
      });

      if (!options.flow?.interactive) {
        TypecheckLogger.success('checker typecheck finished', elapsed());
      }

      task?.pass();
    } else {
      const issues = createCheckerFailureIssues({
        failedTargets: result.failedTargets,
        fallbackReason: 'Checker typecheck finished with failures.',
        fix: 'Inspect the checker typecheck output above, then rerun `limina checker typecheck` or `limina check`.',
        projectRootDir: result.projectRootDir,
        task: 'checker:typecheck',
        title: 'Checker typecheck failed',
      });

      await appendCheckIssues({
        issues,
        rootDir: options.config.rootDir,
      });
      TypecheckLogger.error(
        formatCheckerIssueReport({
          command: options.report?.command ?? 'limina checker typecheck',
          issues,
          title: 'Checker typecheck summary',
          verbose: options.report?.verbose,
        }),
        elapsed(),
      );
      task?.fail('checker typecheck finished with failures');
    }

    return result;
  } catch (error) {
    const issue = createTaskFailureIssue({
      code: 'LIMINA_CHECKER_TYPECHECK_FAILED',
      detailLines: [formatErrorMessage(error)],
      fix: 'Inspect the checker typecheck error above, then rerun `limina checker typecheck` or `limina check`.',
      reason: `Checker typecheck failed: ${formatErrorMessage(error)}.`,
      rootDir: options.config.rootDir,
      task: 'checker:typecheck',
      title: 'Checker typecheck failed',
    });

    await appendCheckIssues({
      issues: [issue],
      rootDir: options.config.rootDir,
    });
    TypecheckLogger.error(
      formatCheckerIssueReport({
        command: options.report?.command ?? 'limina checker typecheck',
        issues: [issue],
        title: 'Checker typecheck summary',
        verbose: options.report?.verbose,
      }),
      elapsed(),
    );
    task?.fail('checker typecheck failed', { error });
    throw error;
  }
}
