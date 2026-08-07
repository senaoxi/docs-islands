import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';

import type {
  CheckerDependencyCategory,
  CheckerDependencyRequirement,
  CheckerPackageResolver,
} from '#checkers';
import { normalizeSlashes, toRelativePath } from '#utils/path';
import path from 'pathe';
import {
  isResolvedFromLeafInstalledPackage,
  resolveLeafInstalledPackageDirectory,
} from '../core/packages/leaf-package-resolution';
import type { TypecheckTarget } from './target-types';

type FrameworkFamily = NonNullable<TypecheckTarget['checkerFamily']>;

export interface FrameworkTargetPreflightFailure {
  checkerName: string;
  family: FrameworkFamily;
  problems: string[];
}

const dependencyCategoryLabels: Record<CheckerDependencyCategory, string> = {
  'analysis-runtime': 'analysis runtime',
  'checker-binary': 'checker binary',
  'checker-runtime-peer': 'checker runtime peer',
};

function getErrorCode(error: unknown): string | undefined {
  return error instanceof Error && 'code' in error
    ? String(error.code)
    : undefined;
}

function handlePackageResolutionError(
  error: unknown,
  packageName: string,
): string | undefined {
  const code = getErrorCode(error);
  if (code === 'ERR_PACKAGE_PATH_NOT_EXPORTED') return packageName;
  if (code === 'MODULE_NOT_FOUND') return undefined;
  throw error;
}

function resolvePackageFromRoot(options: {
  packageName: string;
  projectRootDir: string;
}): string | undefined {
  if (
    resolveLeafInstalledPackageDirectory({
      packageName: options.packageName,
      packageRootDir: options.projectRootDir,
    }) === null
  ) {
    return undefined;
  }
  const requireFromRoot = createRequire(
    path.join(options.projectRootDir, 'package.json'),
  );
  try {
    const resolvedPath = requireFromRoot.resolve(
      `${options.packageName}/package.json`,
    );
    return resolveVerifiedLeafPackagePath({ ...options, resolvedPath });
  } catch (error) {
    return handlePackageResolutionError(error, options.packageName);
  }
}

function resolveVerifiedLeafPackagePath(options: {
  packageName: string;
  projectRootDir: string;
  resolvedPath: string;
}): string | undefined {
  if (
    isResolvedFromLeafInstalledPackage({
      packageName: options.packageName,
      packageRootDir: options.projectRootDir,
      resolvedPath: options.resolvedPath,
    })
  ) {
    return options.resolvedPath;
  }
  return undefined;
}

function quoteCommandPath(value: string): string {
  return /\s/u.test(value) ? JSON.stringify(value) : value;
}

function relativePath(workspaceRootDir: string, filePath: string): string {
  return normalizeSlashes(toRelativePath(workspaceRootDir, filePath));
}

function createLeafCommandPrefix(
  workspaceRootDir: string,
  dependencyRootDir: string,
): string {
  const relativeRoot = relativePath(workspaceRootDir, dependencyRootDir);
  return relativeRoot === '.'
    ? 'pnpm '
    : `pnpm --dir ${quoteCommandPath(relativeRoot)} `;
}

function createLeafInstallCommand(options: {
  dependencyRootDir: string;
  packageNames: readonly string[];
  workspaceRootDir: string;
}): string {
  return `${createLeafCommandPrefix(
    options.workspaceRootDir,
    options.dependencyRootDir,
  )}add -D ${options.packageNames.join(' ')}`;
}

function formatMissingFrameworkDependencies(options: {
  missing: readonly CheckerDependencyRequirement[];
  target: TypecheckTarget;
  workspaceRootDir: string;
}): string {
  const sourceConfigPath = options.target.sourceConfigPath!;
  const dependencyRootDir = options.target.dependencyRootDir!;
  const missingLines = options.missing.flatMap((requirement) => [
    `  missing package: ${requirement.packageName}`,
    `  dependency category: ${dependencyCategoryLabels[requirement.category]}`,
  ]);
  return [
    'Missing framework checker dependencies:',
    `  checker family: ${options.target.checkerFamily}`,
    `  checker: ${options.target.checkerName}`,
    `  source config: ${relativePath(options.workspaceRootDir, sourceConfigPath)}`,
    `  leaf package root: ${relativePath(options.workspaceRootDir, dependencyRootDir)}`,
    ...missingLines,
    `Fix: ${createLeafInstallCommand({
      dependencyRootDir,
      packageNames: options.missing.map(
        (requirement) => requirement.packageName,
      ),
      workspaceRootDir: options.workspaceRootDir,
    })}`,
  ].join('\n');
}

function formatMissingAstroTypes(options: {
  target: TypecheckTarget;
  workspaceRootDir: string;
}): string {
  const dependencyRootDir = options.target.dependencyRootDir!;
  const generatedTypesPath = path.join(dependencyRootDir, '.astro/types.d.ts');
  return [
    'Astro generated types are missing:',
    '  checker family: astro',
    `  source config: ${relativePath(options.workspaceRootDir, options.target.sourceConfigPath!)}`,
    `  leaf package root: ${relativePath(options.workspaceRootDir, dependencyRootDir)}`,
    `  expected generated type: ${relativePath(options.workspaceRootDir, generatedTypesPath)}`,
    'Limina never runs Astro sync automatically.',
    `Fix: ${createLeafCommandPrefix(options.workspaceRootDir, dependencyRootDir)}exec astro sync`,
  ].join('\n');
}

function findMissingRequirements(options: {
  resolvePackage: CheckerPackageResolver;
  target: TypecheckTarget;
}): CheckerDependencyRequirement[] {
  return (options.target.dependencyRequirements ?? []).filter(
    (requirement) =>
      options.resolvePackage({
        packageName: requirement.packageName,
        projectRootDir: options.target.dependencyRootDir!,
      }) === undefined,
  );
}

function appendMissingDependencies(
  problems: string[],
  options: Parameters<typeof collectTargetProblems>[0],
): void {
  const missing = findMissingRequirements(options);
  if (missing.length > 0) {
    problems.push(formatMissingFrameworkDependencies({ ...options, missing }));
  }
}

function hasMissingAstroTypes(
  options: Parameters<typeof collectTargetProblems>[0],
): boolean {
  if (options.target.checkerFamily !== 'astro') return false;
  return !options.generatedTypeExists(
    path.join(options.target.dependencyRootDir!, '.astro/types.d.ts'),
  );
}

function appendMissingAstroTypes(
  problems: string[],
  options: Parameters<typeof collectTargetProblems>[0],
): void {
  if (hasMissingAstroTypes(options)) {
    problems.push(formatMissingAstroTypes(options));
  }
}

function collectTargetProblems(options: {
  generatedTypeExists: (filePath: string) => boolean;
  resolvePackage: CheckerPackageResolver;
  target: TypecheckTarget;
  workspaceRootDir: string;
}): string[] {
  const problems: string[] = [];
  appendMissingDependencies(problems, options);
  appendMissingAstroTypes(problems, options);
  return problems;
}

function createTargetFailure(options: {
  generatedTypeExists: (filePath: string) => boolean;
  resolvePackage: CheckerPackageResolver;
  target: TypecheckTarget;
  workspaceRootDir: string;
}): FrameworkTargetPreflightFailure[] {
  if (options.target.checkerFamily === undefined) return [];
  const problems = collectTargetProblems(options);
  if (problems.length === 0) return [];
  return [
    {
      checkerName: options.target.checkerName!,
      family: options.target.checkerFamily,
      problems,
    },
  ];
}

export function collectFrameworkTargetPreflightFailures(options: {
  generatedTypeExists?: (filePath: string) => boolean;
  resolvePackage?: CheckerPackageResolver;
  targets: readonly TypecheckTarget[];
  workspaceRootDir: string;
}): FrameworkTargetPreflightFailure[] {
  const generatedTypeExists = options.generatedTypeExists ?? existsSync;
  const resolvePackage = options.resolvePackage ?? resolvePackageFromRoot;
  return options.targets.flatMap((target) =>
    createTargetFailure({
      generatedTypeExists,
      resolvePackage,
      target,
      workspaceRootDir: options.workspaceRootDir,
    }),
  );
}
