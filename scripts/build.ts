import { loadEnv } from '@docs-islands/utils/env';
import { createLogger } from '@docs-islands/utils/logger';
import { createElapsedTimer, formatErrorMessage } from 'logaria/helper';
import { execSync, spawn } from 'node:child_process';
import {
  BUILD_AUTO_DISCOVER_PLACEHOLDER,
  BUILD_FALLBACK_PACKAGES,
  BUILD_PIPELINE,
  BUILD_SKIP_ARG_KEYS,
} from './constants/build';

type BuildPhase = string | string[];

const { build } = loadEnv();

const BuildLogger = createLogger({
  main: 'docs-islands-monorepo',
}).getLoggerByGroup('task.build.pipeline');
const scriptElapsed = createElapsedTimer();

function parsePackageList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseSkippedPackages(argv = process.argv.slice(2)): Set<string> {
  const parseElapsed = createElapsedTimer();
  const skippedPackages = new Set<string>();

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === undefined) {
      continue;
    }

    const [key, inlineValue] = argument.split('=', 2);
    if (inlineValue !== undefined && BUILD_SKIP_ARG_KEYS.has(key)) {
      for (const pkg of parsePackageList(inlineValue)) {
        skippedPackages.add(pkg);
      }
      continue;
    }

    if (!BUILD_SKIP_ARG_KEYS.has(argument)) {
      continue;
    }

    const nextArg = argv[index + 1];
    if (nextArg === undefined || nextArg.startsWith('--')) {
      BuildLogger.warn(
        `Missing package list for "${argument}", this option is ignored`,
        parseElapsed(),
      );
      continue;
    }

    for (const pkg of parsePackageList(nextArg)) {
      skippedPackages.add(pkg);
    }
    index++;
  }

  const envValue = build.skipPackages;
  if (envValue) {
    for (const pkg of parsePackageList(envValue)) {
      skippedPackages.add(pkg);
    }
  }

  return skippedPackages;
}

function getAllMonorepoPackages(): string[] {
  const lookupElapsed = createElapsedTimer();
  try {
    const result = execSync('pnpm ls -r --depth -1 --json', {
      encoding: 'utf8',
      stdio: 'pipe',
    });

    const data = JSON.parse(result);
    const packages: string[] = [];
    const ignoredPackages = new Set(['docs-islands-monorepo']);

    if (Array.isArray(data)) {
      for (const item of data) {
        if (item.name && !ignoredPackages.has(item.name)) {
          packages.push(item.name);
        }
      }
    }

    return packages;
  } catch (error) {
    BuildLogger.warn(
      `monorepo package discovery failed, using fallback packages: ${formatErrorMessage(error)}`,
      lookupElapsed(),
    );
    return BUILD_FALLBACK_PACKAGES;
  }
}

function getConfiguredPackages(pipeline: BuildPhase[]): string[] {
  const configured: string[] = [];

  for (const phase of pipeline) {
    if (Array.isArray(phase)) {
      configured.push(...phase);
    } else if (phase !== BUILD_AUTO_DISCOVER_PLACEHOLDER) {
      configured.push(phase);
    }
  }

  return configured;
}

function resolveSkippedPackages(
  skippedPackages: Set<string>,
  allPackages: string[],
): { valid: Set<string>; invalid: string[] } {
  const allPackagesSet = new Set(allPackages);
  const valid = new Set<string>();
  const invalid: string[] = [];

  for (const pkg of skippedPackages) {
    if (allPackagesSet.has(pkg)) {
      valid.add(pkg);
    } else {
      invalid.push(pkg);
    }
  }

  return { valid, invalid };
}

function applySkipFilterToPipeline(
  pipeline: BuildPhase[],
  skippedPackages: Set<string>,
): BuildPhase[] {
  const filteredPipeline: BuildPhase[] = [];

  for (const phase of pipeline) {
    if (phase === BUILD_AUTO_DISCOVER_PLACEHOLDER) {
      filteredPipeline.push(phase);
      continue;
    }

    if (Array.isArray(phase)) {
      const filteredPackages = phase.filter((pkg) => !skippedPackages.has(pkg));
      if (filteredPackages.length > 0) {
        filteredPipeline.push(filteredPackages);
      }
      continue;
    }

    if (!skippedPackages.has(phase)) {
      filteredPipeline.push(phase);
    }
  }

  return filteredPipeline;
}

function getRemainingPackages(
  allPackages: string[],
  configuredPackages: string[],
  skippedPackages: Set<string>,
): string[] {
  const configuredPackagesSet = new Set(configuredPackages);

  const remainingPackages = allPackages.filter(
    (pkg) => !configuredPackagesSet.has(pkg) && !skippedPackages.has(pkg),
  );

  return remainingPackages;
}

function resolveBuildPipeline(
  pipeline: BuildPhase[],
  remainingPackages: string[],
): BuildPhase[] {
  const fullPipeline = [...pipeline];
  const autoPhaseIndex = fullPipeline.indexOf(BUILD_AUTO_DISCOVER_PLACEHOLDER);

  if (remainingPackages.length === 0) {
    if (autoPhaseIndex !== -1) {
      fullPipeline.splice(autoPhaseIndex, 1);
    }
    return fullPipeline;
  }

  if (autoPhaseIndex === -1) {
    fullPipeline.push(remainingPackages);
  } else {
    fullPipeline[autoPhaseIndex] = remainingPackages;
  }

  return fullPipeline;
}

async function buildPackagesParallel(packages: string[]): Promise<boolean> {
  if (packages.length === 0) {
    BuildLogger.info('empty parallel phase skipped');
    return true;
  }

  BuildLogger.info(`building packages in parallel: [${packages.join(', ')}]`);
  const buildElapsed = createElapsedTimer();
  try {
    const commands = packages.map((pkg, index) => {
      const color = ['blue', 'green', 'yellow', 'magenta', 'cyan'][index % 5];
      return `--color ${color} --label "[${pkg}]" "pnpm --filter ${pkg} --if-present build"`;
    });

    const concurrentlyOptions = [
      ...commands,
      '--kill-others-on-fail',
      '--restart-tries 0',
      '--max-restarts 0',
      '--raw',
    ];

    const child = spawn(
      'pnpm',
      ['exec', 'concurrently', ...concurrentlyOptions],
      {
        stdio: ['inherit', 'pipe', 'pipe'],
        shell: true,
      },
    );

    child.stdout.on('data', (data) => {
      process.stdout.write(data);
    });

    child.stderr.on('data', (data) => {
      process.stderr.write(data);
    });

    return new Promise((resolve) => {
      child.on('close', (code) => {
        if (code === 0) {
          BuildLogger.success(
            `parallel build finished for ${packages.length} packages`,
            buildElapsed(),
          );
          resolve(true);
        } else {
          BuildLogger.error(
            `parallel build failed with code ${code}`,
            buildElapsed(),
          );
          resolve(false);
        }
      });
    });
  } catch (error) {
    BuildLogger.error(
      `parallel build failed: ${formatErrorMessage(error)}`,
      buildElapsed(),
    );
    return false;
  }
}

async function buildPackagesSerial(packageName: string): Promise<boolean> {
  BuildLogger.info(`building ${packageName}`);
  const buildElapsed = createElapsedTimer();
  try {
    const child = spawn('pnpm', ['--filter', packageName, 'build'], {
      stdio: ['inherit', 'pipe', 'pipe'],
      shell: true,
    });

    child.stdout.on('data', (data) => {
      process.stdout.write(data);
    });

    child.stderr.on('data', (data) => {
      process.stderr.write(data);
    });

    return new Promise((resolve) => {
      child.on('close', (code) => {
        if (code === 0) {
          BuildLogger.success(`${packageName} build finished`, buildElapsed());
          resolve(true);
        } else {
          BuildLogger.error(
            `${packageName} build failed with code ${code}`,
            buildElapsed(),
          );
          resolve(false);
        }
      });
    });
  } catch (error) {
    BuildLogger.error(
      `${packageName} build failed: ${formatErrorMessage(error)}`,
      buildElapsed(),
    );
    return false;
  }
}

async function buildPackages(packages: string | string[]): Promise<boolean> {
  if (Array.isArray(packages)) {
    return await buildPackagesParallel(packages);
  }
  return await buildPackagesSerial(packages);
}

async function main() {
  BuildLogger.info('build started');
  const totalElapsed = createElapsedTimer();

  const allPackages = getAllMonorepoPackages();
  const skippedPackages = parseSkippedPackages();
  const { valid: validSkippedPackages, invalid: invalidSkippedPackages } =
    resolveSkippedPackages(skippedPackages, allPackages);

  if (validSkippedPackages.size > 0) {
    BuildLogger.info(
      `Skip build packages: [${[...validSkippedPackages].join(', ')}]`,
    );
  }
  if (invalidSkippedPackages.length > 0) {
    BuildLogger.warn(
      `Ignored unknown skip packages: [${invalidSkippedPackages.join(', ')}]`,
    );
  }

  const filteredBasePipeline = applySkipFilterToPipeline(
    BUILD_PIPELINE,
    validSkippedPackages,
  );
  const configuredPackages = getConfiguredPackages(filteredBasePipeline);
  const remainingPackages = getRemainingPackages(
    allPackages,
    configuredPackages,
    validSkippedPackages,
  );

  if (remainingPackages.length > 0) {
    BuildLogger.info(
      `Found ${remainingPackages.length} remaining packages:

${remainingPackages.map((pkg) => `- ${pkg}`).join('\n')}
`,
    );
  } else {
    BuildLogger.info('no remaining packages found');
  }

  const fullPipeline = resolveBuildPipeline(
    filteredBasePipeline,
    remainingPackages,
  );
  if (fullPipeline.length === 0) {
    BuildLogger.warn(
      'build skipped: no packages to build after applying skip filters',
      totalElapsed(),
    );
    process.exit(0);
  }

  BuildLogger.info('build pipeline:');
  for (const [index, phase] of fullPipeline.entries()) {
    if (Array.isArray(phase)) {
      BuildLogger.info(
        `  Phase ${index + 1}: [${phase.join(', ')}] (parallel)`,
      );
    } else {
      BuildLogger.info(`  Phase ${index + 1}: ${phase}`);
    }
  }
  BuildLogger.info('');

  let successCount = 0;
  const totalPhases = fullPipeline.length;

  for (const [i, phase] of fullPipeline.entries()) {
    if (await buildPackages(phase)) {
      successCount++;
    } else {
      BuildLogger.error(`phase ${i + 1} failed`, totalElapsed());
      process.exit(1);
    }

    BuildLogger.info('');
  }

  if (successCount === totalPhases) {
    BuildLogger.success('build finished', totalElapsed());
    process.exit(0);
  } else {
    BuildLogger.warn('build finished with failed phases', totalElapsed());
    process.exit(1);
  }
}

main().catch((error) => {
  BuildLogger.error(
    `build failed: ${formatErrorMessage(error)}`,
    scriptElapsed(),
  );
  process.exit(1);
});
