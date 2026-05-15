import { createElapsedTimer } from '@docs-islands/logger/helper';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  applyPackageVersion,
  createReleasePlanFromVersionSelection,
  writeChangelogForPlan,
} from './changelog';
import {
  REPO_ROOT,
  ReleaseLogger,
  commandExists,
  discoverReleasePackages,
  formatReleasePlans,
  getGhCommand,
  getGitCommand,
  getNpmCommand,
  getPnpmCommand,
  isValidVersion,
  promptForExecutionMode,
  promptForPackageSelections,
  promptForVersionSelection,
  readPublishBranch,
  resolvePackageSelections,
  runCommand,
  sortReleasePackageConfigs,
  type ReleaseCliOptions,
  type ReleasePackageManifest,
  type ReleasePlan,
  type ResolvedReleasePackageConfig,
} from './shared';

interface ReleaseRunContext {
  options: ReleaseCliOptions;
  plans: ReleasePlan[];
}

function getPackageScriptRunner(
  config: ResolvedReleasePackageConfig,
  scriptName: string,
  env?: NodeJS.ProcessEnv,
): void {
  ReleaseLogger.info(`Running ${config.packageName}:${scriptName}`);
  runCommand(getPnpmCommand(), ['run', scriptName], {
    cwd: config.packageDir,
    env,
    stdio: 'inherit',
    logger: ReleaseLogger,
  });
}

function getWorkspaceDependencies(manifest: ReleasePackageManifest): string[] {
  const dependencies: string[] = [];
  const candidates = [manifest.dependencies, manifest.devDependencies];

  for (const dependencyMap of candidates) {
    if (!dependencyMap) {
      continue;
    }
    for (const [dependencyName, versionRange] of Object.entries(
      dependencyMap,
    )) {
      if (
        versionRange.startsWith('workspace:') &&
        !dependencyName.includes('eslint')
      ) {
        dependencies.push(dependencyName);
      }
    }
  }

  return dependencies;
}

function cleanDirectory(relativeDir: string, cwd: string): void {
  if (!existsSync(path.join(cwd, relativeDir))) {
    return;
  }

  runCommand(getPnpmCommand(), ['exec', 'del-cli', relativeDir], {
    cwd,
    logger: ReleaseLogger,
  });
}

function buildVitepressProject(
  config: ResolvedReleasePackageConfig,
  options: {
    localTest?: boolean;
  } = {},
): void {
  const { localTest = false } = options;
  const workspaceDependencies = getWorkspaceDependencies(config.manifest);

  cleanDirectory('dist', config.packageDir);

  for (const dependencyName of workspaceDependencies) {
    ReleaseLogger.info(`Building workspace dependency ${dependencyName}`);
    runCommand(getPnpmCommand(), ['--filter', dependencyName, 'build'], {
      cwd: REPO_ROOT,
      env: {
        DOCS_ISLANDS_MODE: 'production',
        DOCS_ISLANDS_TEST: localTest ? '1' : '0',
      },
      stdio: 'inherit',
      logger: ReleaseLogger,
    });
  }

  getPackageScriptRunner(config, 'build', {
    DOCS_ISLANDS_MODE: 'production',
    DOCS_ISLANDS_TEST: localTest ? '1' : '0',
  });
}

function verifyDistVersion(plan: ReleasePlan): void {
  const distPackageJsonPath = path.join(plan.config.publishDir, 'package.json');
  if (!existsSync(distPackageJsonPath)) {
    throw new Error(
      `Missing published manifest at ${path.relative(REPO_ROOT, distPackageJsonPath)}`,
    );
  }

  const distManifest = JSON.parse(
    readFileSync(distPackageJsonPath, 'utf8'),
  ) as { version?: string };
  if (distManifest.version !== plan.newVersion) {
    throw new Error(
      `dist/package.json version mismatch for ${plan.config.packageName}: expected ${plan.newVersion}, got ${distManifest.version}`,
    );
  }
}

function runPackageReleaseChecks(
  plan: ReleasePlan,
  options: ReleaseCliOptions,
): void {
  const { config } = plan;

  if (config.key === 'logger') {
    if (!options.skipTests) {
      getPackageScriptRunner(config, 'test');
    }
    if (!options.skipBuild) {
      getPackageScriptRunner(config, 'build');
      verifyDistVersion(plan);
      getPackageScriptRunner(config, 'lint:package');
      runCommand(getNpmCommand(), ['pack', '--dry-run'], {
        cwd: config.publishDir,
        stdio: 'inherit',
        logger: ReleaseLogger,
      });
    }
    return;
  }

  if (!options.skipTests) {
    buildVitepressProject(config, {
      localTest: true,
    });
    getPackageScriptRunner(config, 'test');
    getPackageScriptRunner(config, 'smoke');
  }

  if (!options.skipBuild) {
    buildVitepressProject(config);
    verifyDistVersion(plan);
    getPackageScriptRunner(config, 'lint:package');
    runCommand(getNpmCommand(), ['pack', '--dry-run'], {
      cwd: config.publishDir,
      stdio: 'inherit',
      logger: ReleaseLogger,
    });
  }
}

function ensureWorkingTreeIsClean(options: ReleaseCliOptions): void {
  if (options.dryRun) {
    return;
  }

  const status = runCommand(getGitCommand(), ['status', '--porcelain'], {
    cwd: REPO_ROOT,
    logger: ReleaseLogger,
  }).trim();

  if (status) {
    throw new Error(
      'Working directory is not clean. Commit or stash changes first.',
    );
  }
}

function warnOnBranchMismatch(options: ReleaseCliOptions): void {
  const currentBranch = runCommand(
    getGitCommand(),
    ['rev-parse', '--abbrev-ref', 'HEAD'],
    {
      cwd: REPO_ROOT,
      logger: ReleaseLogger,
    },
  ).trim();
  const publishBranch = readPublishBranch();
  if (!options.dryRun && currentBranch !== publishBranch) {
    ReleaseLogger.warn(
      `Publishing from ${currentBranch} while pnpm-workspace.yaml expects ${publishBranch}`,
    );
  }
}

function checkNpmAuth(options: ReleaseCliOptions): void {
  if (options.dryRun) {
    ReleaseLogger.info('Dry-run mode skips npm authentication checks');
    return;
  }

  runCommand(getNpmCommand(), ['whoami'], {
    cwd: REPO_ROOT,
    logger: ReleaseLogger,
  });
}

function refreshGitTags(): void {
  try {
    runCommand(getGitCommand(), ['fetch', '--tags'], {
      cwd: REPO_ROOT,
      logger: ReleaseLogger,
    });
  } catch {
    ReleaseLogger.warn(
      'Failed to refresh git tags, continuing with local tags',
    );
  }
}

function warnOnAheadBehind(): void {
  try {
    const upstream = runCommand(
      getGitCommand(),
      ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'],
      {
        cwd: REPO_ROOT,
        logger: ReleaseLogger,
      },
    ).trim();
    const [behindCount, aheadCount] = runCommand(
      getGitCommand(),
      ['rev-list', '--left-right', '--count', '@{u}...HEAD'],
      {
        cwd: REPO_ROOT,
        logger: ReleaseLogger,
      },
    )
      .trim()
      .split('\t')
      .map((value) => Number.parseInt(value, 10));

    if (behindCount > 0) {
      ReleaseLogger.warn(
        `Your branch is behind ${upstream} by ${behindCount} commit(s).`,
      );
    }
    if (aheadCount > 0) {
      ReleaseLogger.warn(
        `Your branch is ahead of ${upstream} by ${aheadCount} commit(s).`,
      );
    }
  } catch {
    ReleaseLogger.info(
      'No upstream branch detected, skipping ahead/behind checks',
    );
  }
}

function ensureVersionNotPublished(
  plan: ReleasePlan,
  options: ReleaseCliOptions,
): void {
  if (options.dryRun) {
    ReleaseLogger.info(
      `Dry-run mode skips npm registry existence checks for ${plan.config.packageName}@${plan.newVersion}`,
    );
    return;
  }

  const publishedVersion = runCommand(
    getNpmCommand(),
    ['view', `${plan.config.packageName}@${plan.newVersion}`, 'version'],
    {
      cwd: REPO_ROOT,
      allowFailure: true,
      logger: ReleaseLogger,
    },
  ).trim();

  if (publishedVersion) {
    throw new Error(
      `Version already exists on npm: ${plan.config.packageName}@${plan.newVersion}`,
    );
  }

  ReleaseLogger.info(
    `Version is available on npm: ${plan.config.packageName}@${plan.newVersion}`,
  );
}

function stageReleaseFiles(context: ReleaseRunContext): void {
  const pathsToStage: string[] = [];

  for (const plan of context.plans) {
    pathsToStage.push(path.relative(REPO_ROOT, plan.config.manifestPath));
    if (!context.options.skipChangelog) {
      pathsToStage.push(path.relative(REPO_ROOT, plan.config.changelogPath));
    }
  }

  runCommand(getGitCommand(), ['add', '--', ...pathsToStage], {
    cwd: REPO_ROOT,
    logger: ReleaseLogger,
  });
}

function createCombinedCommitMessage(plans: ReleasePlan[]): string {
  const summary = plans
    .map((plan) => `${plan.config.key}@${plan.newVersion}`)
    .join(', ');
  return `release: ${summary}`;
}

function createGitTags(context: ReleaseRunContext): void {
  for (const plan of context.plans) {
    const tagExists = runCommand(
      getGitCommand(),
      ['tag', '--list', plan.gitTag],
      {
        cwd: REPO_ROOT,
        logger: ReleaseLogger,
      },
    ).trim();
    if (tagExists) {
      throw new Error(`Git tag already exists: ${plan.gitTag}`);
    }
  }

  runCommand(
    getGitCommand(),
    ['commit', '-m', createCombinedCommitMessage(context.plans)],
    {
      cwd: REPO_ROOT,
      logger: ReleaseLogger,
    },
  );

  for (const plan of context.plans) {
    runCommand(
      getGitCommand(),
      [
        'tag',
        '-a',
        plan.gitTag,
        '-m',
        `Release ${plan.config.packageName}@${plan.newVersion}`,
      ],
      {
        cwd: REPO_ROOT,
        logger: ReleaseLogger,
      },
    );
  }
}

function publishPackage(plan: ReleasePlan, options: ReleaseCliOptions): void {
  const args = ['publish', '--no-git-checks'];
  if (plan.npmTag) {
    args.push('--tag', plan.npmTag);
  }
  if (options.registry) {
    args.push('--registry', options.registry);
  }

  ReleaseLogger.info(
    `Publishing ${plan.config.packageName}@${plan.newVersion} from ${path.relative(REPO_ROOT, plan.config.publishDir)}`,
  );
  runCommand(getPnpmCommand(), args, {
    cwd: plan.config.publishDir,
    stdio: 'inherit',
    logger: ReleaseLogger,
  });
}

function pushRelease(context: ReleaseRunContext): void {
  if (context.options.skipPush) {
    ReleaseLogger.info('Skipping git push as requested');
    return;
  }

  runCommand(getGitCommand(), ['push', 'origin', '--follow-tags'], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    logger: ReleaseLogger,
  });
}

function createGithubReleases(context: ReleaseRunContext): void {
  if (context.options.skipGithubRelease) {
    ReleaseLogger.info('Skipping GitHub release creation as requested');
    return;
  }
  if (context.options.skipPush) {
    ReleaseLogger.warn('Skipping GitHub releases because --skip-push was used');
    return;
  }
  if (!commandExists(getGhCommand())) {
    ReleaseLogger.warn(
      'GitHub CLI not found, skipping GitHub release creation',
    );
    return;
  }

  for (const plan of context.plans) {
    runCommand(
      getGhCommand(),
      ['release', 'create', plan.gitTag, '--generate-notes'],
      {
        cwd: REPO_ROOT,
        logger: ReleaseLogger,
      },
    );
  }
}

async function resolveReleasePlans(options: ReleaseCliOptions): Promise<{
  plans: ReleasePlan[];
  options: ReleaseCliOptions;
}> {
  const availableConfigs = discoverReleasePackages();
  let usedInteractivePrompts = false;

  const packageConfigs =
    options.packageSelectors.length > 0
      ? resolvePackageSelections(options.packageSelectors, availableConfigs)
      : process.stdin.isTTY
        ? (() => {
            usedInteractivePrompts = true;
            return promptForPackageSelections(
              availableConfigs,
              'Select package(s) to release',
            );
          })()
        : (() => {
            throw new Error(
              'Missing --package. Use --package <name> or run the command in an interactive terminal.',
            );
          })();

  const resolvedPackageConfigs = Array.isArray(packageConfigs)
    ? packageConfigs
    : resolvePackageSelections(
        (await packageConfigs).packageSelectors,
        availableConfigs,
      );
  const sortedConfigs = sortReleasePackageConfigs(resolvedPackageConfigs);
  const plans: ReleasePlan[] = [];

  if (options.version) {
    if (!isValidVersion(options.version)) {
      throw new Error(`Invalid version: ${options.version}`);
    }
    for (const config of sortedConfigs) {
      plans.push(
        createReleasePlanFromVersionSelection(
          config,
          {
            mode: 'custom',
            version: options.version,
          },
          {
            explicitNpmTag: options.npmTag,
          },
        ),
      );
    }
  } else if (options.type) {
    for (const config of sortedConfigs) {
      plans.push(
        createReleasePlanFromVersionSelection(
          config,
          {
            mode: options.type,
            preId: options.preId,
          },
          {
            explicitNpmTag: options.npmTag,
          },
        ),
      );
    }
  } else if (process.stdin.isTTY) {
    usedInteractivePrompts = true;
    for (const config of sortedConfigs) {
      const selection = await promptForVersionSelection(config);
      plans.push(
        createReleasePlanFromVersionSelection(config, selection, {
          explicitNpmTag: options.npmTag,
        }),
      );
    }
  } else {
    throw new Error(
      'Missing version information. Use --type/--version or run in an interactive terminal.',
    );
  }

  if (usedInteractivePrompts && !options.yes) {
    const executionMode = await promptForExecutionMode();
    if (!executionMode.confirmed) {
      throw new Error('Release cancelled');
    }
    options.dryRun = executionMode.dryRun;
  }

  return {
    plans,
    options,
  };
}

function previewReleasePlan(context: ReleaseRunContext): void {
  ReleaseLogger.info(
    [
      context.options.dryRun
        ? 'Dry-run release plan:'
        : 'Release execution plan:',
      formatReleasePlans(context.plans),
      '',
      context.options.dryRun
        ? 'Dry-run mode only previews the plan. No files will be changed and no publish steps will run.'
        : 'The steps above will now be executed in order.',
    ].join('\n'),
  );
}

function prepareReleaseFiles(context: ReleaseRunContext): void {
  for (const plan of context.plans) {
    applyPackageVersion(plan.config, plan.newVersion);
    if (!context.options.skipChangelog) {
      writeChangelogForPlan(plan, {
        fromTag: context.options.fromTag,
      });
    }
  }
}

function performPreflightChecks(context: ReleaseRunContext): void {
  ensureWorkingTreeIsClean(context.options);
  warnOnBranchMismatch(context.options);
  checkNpmAuth(context.options);
  refreshGitTags();
  warnOnAheadBehind();

  for (const plan of context.plans) {
    ensureVersionNotPublished(plan, context.options);
  }
}

export async function runReleaseCommand(
  options: ReleaseCliOptions,
): Promise<void> {
  const { plans } = await resolveReleasePlans(options);
  const context: ReleaseRunContext = { plans, options };

  previewReleasePlan(context);

  if (context.options.dryRun) {
    return;
  }

  ReleaseLogger.info('release started');
  const releaseElapsed = createElapsedTimer();
  performPreflightChecks(context);
  prepareReleaseFiles(context);

  for (const plan of context.plans) {
    runPackageReleaseChecks(plan, context.options);
  }

  stageReleaseFiles(context);
  createGitTags(context);

  for (const plan of context.plans) {
    publishPackage(plan, context.options);
  }

  pushRelease(context);
  createGithubReleases(context);

  ReleaseLogger.success(
    `Release completed: ${context.plans
      .map((plan) => `${plan.config.packageName}@${plan.newVersion}`)
      .join(', ')}`,
    releaseElapsed(),
  );
}
