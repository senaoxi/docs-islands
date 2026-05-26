import { scanFiles } from '@docs-islands/utils/fs-utils';
import { createLogger } from '@docs-islands/utils/logger';
import { createElapsedTimer, formatErrorMessage } from 'logaria/helper';
import { existsSync, readFileSync } from 'node:fs';
import { copyFile, mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { glob } from 'tinyglobby';

const { dirname, join, resolve } = path;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');

const MergeDocsLogger = createLogger({
  main: 'docs-islands-monorepo',
}).getLoggerByGroup('task.docs.merge');

interface PackageInfo {
  name: string;
  path: string;
  distPath: string;
  targetName: string;
}

async function findDocsPackages(): Promise<PackageInfo[]> {
  const findElapsed = createElapsedTimer();
  const packages: PackageInfo[] = [];

  const packageJsonPaths = await glob(
    ['docs/package.json', 'packages/*/docs/package.json'],
    {
      cwd: projectRoot,
      absolute: true,
      onlyFiles: true,
      ignore: [
        '**/node_modules/**',
        '**/.*/**',
        '**/dist/**',
        '**/build/**',
        '**/coverage/**',
      ],
    },
  );

  MergeDocsLogger.success(
    `found ${packageJsonPaths.length} package.json files to check`,
    findElapsed(),
  );

  for (const packageJsonPath of packageJsonPaths) {
    await processPackageJson(packageJsonPath, packages);
  }

  return packages;
}

async function processPackageJson(
  packageJsonPath: string,
  packages: PackageInfo[],
): Promise<void> {
  const processElapsed = createElapsedTimer();

  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    const packageName = packageJson.name;

    // Check if it matches the @docs-islands/xxx-docs pattern.
    const match = packageName?.match(/^@docs-islands\/(.+)-docs$/);
    if (match) {
      const targetName = match[1];
      const packageDir = dirname(packageJsonPath);
      const distPath = join(packageDir, '.vitepress/dist');

      MergeDocsLogger.info(`checking docs package: ${packageName}`);
      MergeDocsLogger.info(`  package path: ${packageDir}`);
      MergeDocsLogger.info(`  expected dist path: ${distPath}`);

      if (existsSync(distPath)) {
        packages.push({
          name: packageName,
          path: packageDir,
          distPath,
          targetName,
        });
        MergeDocsLogger.success(
          `docs package found: ${packageName} -> ${targetName}`,
          processElapsed(),
        );
      } else {
        MergeDocsLogger.warn(
          `${packageName} dist directory not found: ${distPath}`,
          processElapsed(),
        );
      }
    } else if (packageName?.startsWith('@docs-islands/')) {
      MergeDocsLogger.warn(
        `Skipping @docs-islands package (not docs): ${packageName}`,
        processElapsed(),
      );
    }
  } catch (error) {
    MergeDocsLogger.error(
      `failed to parse ${packageJsonPath}: ${formatErrorMessage(error)}`,
      processElapsed(),
    );
  }
}

async function mergeDistDirectories(packages: PackageInfo[]): Promise<void> {
  const mergeElapsed = createElapsedTimer();
  const mainPackage = packages.find(
    (pkg) => pkg.name === '@docs-islands/monorepo-docs',
  );

  if (!mainPackage) {
    MergeDocsLogger.error(
      'Main package(@docs-islands/monorepo-docs) not found',
      mergeElapsed(),
    );
    return;
  }

  const mainDistPath = mainPackage.distPath;

  await mkdir(mainDistPath, { recursive: true });

  MergeDocsLogger.info(`main dist directory: ${mainDistPath}`);

  for (const pkg of packages) {
    const packageMergeElapsed = createElapsedTimer();
    try {
      const targetPath = join(mainDistPath, pkg.targetName);

      const normalizedSrc = resolve(pkg.distPath);
      const normalizedMain = resolve(mainDistPath);

      if (normalizedSrc === normalizedMain) {
        continue;
      }

      const srcStat = await stat(pkg.distPath);
      if (!srcStat.isDirectory()) {
        MergeDocsLogger.info(
          `skip ${pkg.name}: source path is not a directory`,
        );
        continue;
      }

      const srcFiles = await readdir(pkg.distPath);
      if (srcFiles.length === 0) {
        MergeDocsLogger.info(`skip ${pkg.name}: source directory is empty`);
        continue;
      }

      MergeDocsLogger.info(`merging ${pkg.name}`);
      MergeDocsLogger.info(`  source: ${pkg.distPath}`);
      MergeDocsLogger.info(`  target: ${targetPath}`);

      await scanFiles(pkg.distPath, async (relativePath, absolutePath) => {
        const destPath = join(targetPath, relativePath);
        // Ensure the parent directory exists before copying
        await mkdir(dirname(destPath), { recursive: true });
        await copyFile(absolutePath, destPath);
      });

      MergeDocsLogger.success(
        `merged ${pkg.name} to ${pkg.targetName}`,
        packageMergeElapsed(),
      );
    } catch (error) {
      MergeDocsLogger.error(
        `failed to merge ${pkg.name}: ${formatErrorMessage(error)}`,
        packageMergeElapsed(),
      );
    }
  }
}

async function main(): Promise<void> {
  let totalElapsed = createElapsedTimer();
  try {
    MergeDocsLogger.info('docs merge started');
    totalElapsed = createElapsedTimer();
    MergeDocsLogger.info(`project root: ${projectRoot}`);

    const packages = await findDocsPackages();

    if (packages.length === 0) {
      MergeDocsLogger.info('no @docs-islands/xxx-docs packages found');
      return;
    }

    MergeDocsLogger.info(`found ${packages.length} docs packages:`);
    for (const pkg of packages) {
      MergeDocsLogger.info(`  - ${pkg.name} (${pkg.targetName})`);
    }

    MergeDocsLogger.info('dist directory merge started');
    await mergeDistDirectories(packages);

    MergeDocsLogger.success('docs merge finished', totalElapsed());
  } catch (error) {
    MergeDocsLogger.error(
      `docs merge failed: ${formatErrorMessage(error)}`,
      totalElapsed(),
    );
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
