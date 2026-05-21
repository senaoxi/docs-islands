import { createElapsedTimer } from '@docs-islands/logger/helper';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { glob } from 'tinyglobby';
import ts from 'typescript';
import {
  getActiveCheckerExtensions,
  getActiveCheckers,
  getTypeScriptRoute,
  type CheckerRouteKind,
  type ResolvedCheckerConfig,
  type ResolvedLatticeConfig,
} from '../config';
import type { LatticeFlowReporter } from '../flow';
import { ProofLogger, clearCliScreen, formatErrorMessage } from '../logger';
import {
  collectGraphProjectRoute,
  collectTypecheckTargetProjectPaths,
  createExtensionPattern,
  createFormatHost,
  parseProjectFileNames,
  parseProjectFileNamesForExtensions,
} from '../tsconfig';
import { normalizeAbsolutePath, toRelativePath } from '../utils/path';

interface CheckerCoverageTarget {
  checker: ResolvedCheckerConfig;
  configPath: string;
  label: string;
  routeKind: CheckerRouteKind;
}

interface CheckerCoverageTargetCollection {
  problems: string[];
  targets: CheckerCoverageTarget[];
}

interface AllowlistEntry {
  filePath: string;
  reason: string;
}

interface AllowlistEntryCollection {
  entries: AllowlistEntry[];
  problems: string[];
}

interface CoverageSource {
  label: string;
  type: 'allowlist' | 'checker' | 'graph';
}

export interface RunProofCheckOptions {
  clearScreen?: boolean;
  flow?: LatticeFlowReporter;
  flowDepth?: number;
}

type ConfigFileOwners = Map<string, string[]>;

interface ParsedConfig {
  fileNames: string[];
  options: ts.CompilerOptions;
}

const buildConfigPattern = '**/tsconfig*.build.json';
const defaultSourceExclude = [
  'node_modules',
  'dist',
  '.git',
  '.tsbuild',
  'coverage',
  '**/tsconfig*.json',
  '**/package.json',
  '.prettierrc.json',
  '.markdownlint.json',
  'vercel.json',
];

const ignoredSemanticCompilerOptions = new Set([
  'baseUrl',
  'build',
  'composite',
  'configFilePath',
  'declaration',
  'declarationDir',
  'declarationMap',
  'emitBOM',
  'emitDeclarationOnly',
  'incremental',
  'inlineSourceMap',
  'inlineSources',
  'mapRoot',
  'newLine',
  'noEmit',
  'noEmitOnError',
  'out',
  'outDir',
  'outFile',
  'paths',
  'pathsBasePath',
  'preserveConstEnums',
  'project',
  'removeComments',
  'rootDir',
  'showConfig',
  'sourceMap',
  'sourceRoot',
  'tsBuildInfoFile',
]);

async function collectBuildConfigPaths(
  config: ResolvedLatticeConfig,
): Promise<string[]> {
  const paths = await glob(buildConfigPattern, {
    cwd: config.rootDir,
    absolute: true,
    ignore: [
      '**/.git/**',
      '**/.tsbuild/**',
      '**/coverage/**',
      '**/dist/**',
      '**/node_modules/**',
    ],
  });

  return paths.map(normalizeAbsolutePath).sort();
}

function typecheckRootConfig(config: ResolvedLatticeConfig): string {
  return getTypeScriptRoute(config, 'typecheck');
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function formatUnknownValue(value: unknown): string {
  if (value === undefined) {
    return 'undefined';
  }

  return JSON.stringify(value);
}

function hasGlobSyntax(pattern: string): boolean {
  return /[*?[\]{}()!+@]/u.test(pattern);
}

function isDirectoryShorthand(pattern: string): boolean {
  return (
    !hasGlobSyntax(pattern) && !pattern.includes('/') && !path.extname(pattern)
  );
}

function normalizeSourceExcludePattern(pattern: string): string[] {
  const normalized = pattern.replaceAll('\\', '/').replace(/\/+$/u, '');

  if (!normalized) {
    return [];
  }

  if (isDirectoryShorthand(normalized)) {
    return [`${normalized}/**`, `**/${normalized}/**`];
  }

  if (hasGlobSyntax(normalized)) {
    return [normalized];
  }

  if (normalized.includes('/')) {
    return [normalized, `${normalized}/**`];
  }

  return [normalized, `**/${normalized}`];
}

function sourceIncludePatterns(config: ResolvedLatticeConfig): string[] {
  if (config.config?.source?.include) {
    return config.config.source.include;
  }

  return getActiveCheckerExtensions(config).map(
    (extension) => `**/*${extension}`,
  );
}

function sourceExcludePatterns(config: ResolvedLatticeConfig): string[] {
  return (config.config?.source?.exclude ?? defaultSourceExclude).flatMap(
    normalizeSourceExcludePattern,
  );
}

async function collectExpectedSourceFiles(
  config: ResolvedLatticeConfig,
): Promise<Set<string>> {
  const explicitInclude = config.config?.source?.include !== undefined;
  const proofFilePattern = explicitInclude
    ? null
    : createExtensionPattern(getActiveCheckerExtensions(config));
  const files = await glob(sourceIncludePatterns(config), {
    cwd: config.rootDir,
    absolute: true,
    ignore: sourceExcludePatterns(config),
    onlyFiles: true,
  });

  return new Set(
    files
      .map(normalizeAbsolutePath)
      .filter((filePath) => proofFilePattern?.test(filePath) ?? true)
      .sort(),
  );
}

function collectCheckerCoverageTargets(
  config: ResolvedLatticeConfig,
): CheckerCoverageTargetCollection {
  const problems: string[] = [];
  const targets: CheckerCoverageTarget[] = [];

  for (const checker of getActiveCheckers(config)) {
    if (checker.preset === 'tsc') {
      continue;
    }

    for (const routeKind of ['typecheck', 'build'] as const) {
      const route = checker.routes[routeKind];

      if (!route) {
        continue;
      }

      const configPath = normalizeAbsolutePath(
        path.join(config.rootDir, route),
      );

      if (!existsSync(configPath)) {
        problems.push(
          [
            'Checker proof route references a missing tsconfig:',
            `  checker: ${checker.name}`,
            `  route: ${routeKind}`,
            `  config: ${toRelativePath(config.rootDir, configPath)}`,
          ].join('\n'),
        );
        continue;
      }

      targets.push({
        checker,
        configPath,
        label: `${checker.name}:${routeKind}`,
        routeKind,
      });
    }
  }

  return {
    problems,
    targets,
  };
}

function collectConfiguredAllowlistEntries(
  config: ResolvedLatticeConfig,
): AllowlistEntryCollection {
  const entries: AllowlistEntry[] = [];
  const problems: string[] = [];
  const rawEntries = config.proof?.allowlist;

  if (rawEntries === undefined) {
    return {
      entries,
      problems,
    };
  }

  if (!Array.isArray(rawEntries)) {
    problems.push(
      [
        'Invalid proof allowlist config:',
        '  field: proof.allowlist',
        `  value: ${formatUnknownValue(rawEntries)}`,
        '  reason: proof.allowlist must be an array.',
      ].join('\n'),
    );
    return {
      entries,
      problems,
    };
  }

  rawEntries.forEach((entry, index) => {
    const field = `proof.allowlist[${index}]`;

    if (!isPlainRecord(entry)) {
      problems.push(
        [
          'Invalid proof allowlist config:',
          `  field: ${field}`,
          `  value: ${formatUnknownValue(entry)}`,
          '  reason: allowlist entries must be objects with non-empty file and reason fields.',
        ].join('\n'),
      );
      return;
    }

    const fileValue = entry.file;
    const reasonValue = entry.reason;

    if (typeof fileValue !== 'string' || fileValue.trim().length === 0) {
      problems.push(
        [
          'Invalid proof allowlist config:',
          `  field: ${field}.file`,
          `  value: ${formatUnknownValue(fileValue)}`,
          '  reason: allowlist file must be a non-empty string.',
        ].join('\n'),
      );
      return;
    }

    if (typeof reasonValue !== 'string' || reasonValue.trim().length === 0) {
      problems.push(
        [
          'Invalid proof allowlist config:',
          `  field: ${field}.reason`,
          `  value: ${formatUnknownValue(reasonValue)}`,
          '  reason: allowlist reason must be a non-empty string.',
        ].join('\n'),
      );
      return;
    }

    entries.push({
      filePath: normalizeAbsolutePath(path.join(config.rootDir, fileValue)),
      reason: reasonValue.trim(),
    });
  });

  return {
    entries,
    problems,
  };
}

function addCoverage(
  coverageByFile: Map<string, CoverageSource[]>,
  filePath: string,
  source: CoverageSource,
): void {
  const sources = coverageByFile.get(filePath) ?? [];

  sources.push(source);
  coverageByFile.set(filePath, sources);
}

function collectCoverage(options: {
  config: ResolvedLatticeConfig;
  graphProjectPaths: string[];
  includeAllowlist?: boolean;
  allowlistEntries: AllowlistEntry[];
  checkerTargets: CheckerCoverageTarget[];
  sourceFiles: Set<string>;
}): Map<string, CoverageSource[]> {
  const coverageByFile = new Map<string, CoverageSource[]>();
  const proofFilePattern = createExtensionPattern(
    getActiveCheckerExtensions(options.config),
  );
  const typeScriptChecker = getActiveCheckers(options.config).find(
    (checker) => checker.preset === 'tsc',
  );

  for (const graphProjectPath of options.graphProjectPaths) {
    for (const filePath of parseProjectFileNames(
      options.config,
      graphProjectPath,
      proofFilePattern,
    )) {
      if (!options.sourceFiles.has(filePath)) {
        continue;
      }

      addCoverage(coverageByFile, filePath, {
        label: toRelativePath(options.config.rootDir, graphProjectPath),
        type: 'graph',
      });
    }
  }

  for (const checkerTarget of options.checkerTargets) {
    const checkerExtensions = [
      ...(typeScriptChecker?.extensions ?? []),
      ...checkerTarget.checker.extensions,
    ];

    for (const filePath of parseProjectFileNamesForExtensions(
      options.config,
      checkerTarget.configPath,
      checkerExtensions,
    )) {
      if (!options.sourceFiles.has(filePath)) {
        continue;
      }

      addCoverage(coverageByFile, filePath, {
        label: `${toRelativePath(
          options.config.rootDir,
          checkerTarget.configPath,
        )} via ${checkerTarget.label}`,
        type: 'checker',
      });
    }
  }

  if (options.includeAllowlist !== false) {
    for (const entry of options.allowlistEntries) {
      if (!options.sourceFiles.has(entry.filePath)) {
        continue;
      }

      addCoverage(coverageByFile, entry.filePath, {
        label: entry.reason,
        type: 'allowlist',
      });
    }
  }

  return coverageByFile;
}

function getStrictLocalConfigPath(buildConfigPath: string): string {
  return normalizeAbsolutePath(
    path.join(
      path.dirname(buildConfigPath),
      path.basename(buildConfigPath).replace(/\.build\.json$/u, '.json'),
    ),
  );
}

function parseConfig(
  config: ResolvedLatticeConfig,
  configPath: string,
): ParsedConfig {
  const diagnostics: ts.Diagnostic[] = [];
  const parsed = ts.getParsedCommandLineOfConfigFile(
    configPath,
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
        diagnostics.push(diagnostic);
      },
    },
  );

  if (!parsed) {
    throw new Error(
      ts.formatDiagnosticsWithColorAndContext(
        diagnostics,
        createFormatHost(config.rootDir),
      ),
    );
  }

  if (parsed.errors.length > 0) {
    throw new Error(
      ts.formatDiagnosticsWithColorAndContext(
        parsed.errors,
        createFormatHost(config.rootDir),
      ),
    );
  }

  return {
    fileNames: parsed.fileNames.map(normalizeAbsolutePath).sort(),
    options: parsed.options,
  };
}

function formatJsonValue(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function normalizeCompilerOptionValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value;
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    );
  }

  return value;
}

function addBuildConfigSemanticProblems(options: {
  buildConfigPath: string;
  buildConfig: ParsedConfig;
  config: ResolvedLatticeConfig;
  localConfigPath: string;
  localConfig: ParsedConfig;
  problems: string[];
}): void {
  const buildFileNames = new Set(options.buildConfig.fileNames);
  const localFileNames = new Set(options.localConfig.fileNames);
  const onlyInBuild = options.buildConfig.fileNames.filter(
    (fileName) => !localFileNames.has(fileName),
  );
  const onlyInLocal = options.localConfig.fileNames.filter(
    (fileName) => !buildFileNames.has(fileName),
  );

  if (onlyInBuild.length > 0 || onlyInLocal.length > 0) {
    options.problems.push(
      [
        'Build config file set does not match its strict same-name local tsconfig:',
        `  config: ${toRelativePath(options.config.rootDir, options.buildConfigPath)}`,
        `  local: ${toRelativePath(options.config.rootDir, options.localConfigPath)}`,
        ...(onlyInBuild.length > 0
          ? [
              '  only in build config:',
              ...onlyInBuild
                .slice(0, 10)
                .map(
                  (fileName) =>
                    `    - ${toRelativePath(options.config.rootDir, fileName)}`,
                ),
              onlyInBuild.length > 10
                ? `    ... ${onlyInBuild.length - 10} more`
                : '',
            ]
          : []),
        ...(onlyInLocal.length > 0
          ? [
              '  only in local config:',
              ...onlyInLocal
                .slice(0, 10)
                .map(
                  (fileName) =>
                    `    - ${toRelativePath(options.config.rootDir, fileName)}`,
                ),
              onlyInLocal.length > 10
                ? `    ... ${onlyInLocal.length - 10} more`
                : '',
            ]
          : []),
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }

  const optionNames = new Set([
    ...Object.keys(options.localConfig.options),
    ...Object.keys(options.buildConfig.options),
  ]);

  for (const optionName of [...optionNames].sort()) {
    if (ignoredSemanticCompilerOptions.has(optionName)) {
      continue;
    }

    const localValue = normalizeCompilerOptionValue(
      (options.localConfig.options as Record<string, unknown>)[optionName],
    );
    const buildValue = normalizeCompilerOptionValue(
      (options.buildConfig.options as Record<string, unknown>)[optionName],
    );

    if (formatJsonValue(localValue) === formatJsonValue(buildValue)) {
      continue;
    }

    options.problems.push(
      [
        'Build config overrides a typecheck compiler option from its strict same-name local tsconfig:',
        `  config: ${toRelativePath(options.config.rootDir, options.buildConfigPath)}`,
        `  local: ${toRelativePath(options.config.rootDir, options.localConfigPath)}`,
        `  option: compilerOptions.${optionName}`,
        `  local: ${formatJsonValue(localValue)}`,
        `  build: ${formatJsonValue(buildValue)}`,
      ].join('\n'),
    );
  }
}

function addBuildConfigProblems(options: {
  config: ResolvedLatticeConfig;
  graphProjectPaths: Set<string>;
  problems: string[];
  buildConfigPaths: string[];
}): void {
  for (const configPath of options.buildConfigPaths) {
    if (!options.graphProjectPaths.has(configPath)) {
      options.problems.push(
        [
          'Build config is not reachable from root graph config:',
          `  config: ${toRelativePath(options.config.rootDir, configPath)}`,
        ].join('\n'),
      );
    }

    const localConfigPath = getStrictLocalConfigPath(configPath);

    if (!existsSync(localConfigPath)) {
      options.problems.push(
        [
          'Build config is missing its strict same-name local tsconfig:',
          `  config: ${toRelativePath(options.config.rootDir, configPath)}`,
          `  expected: ${toRelativePath(options.config.rootDir, localConfigPath)}`,
        ].join('\n'),
      );
      continue;
    }

    const buildConfig = parseConfig(options.config, configPath);
    const localConfig = parseConfig(options.config, localConfigPath);

    if (buildConfig.options.composite !== true) {
      options.problems.push(
        [
          'Build config is not valid for tsc -b:',
          `  config: ${toRelativePath(options.config.rootDir, configPath)}`,
          '  reason: final compilerOptions.composite must be true.',
        ].join('\n'),
      );
    }

    if (buildConfig.options.noEmit === true) {
      options.problems.push(
        [
          'Build config is not valid for tsc -b:',
          `  config: ${toRelativePath(options.config.rootDir, configPath)}`,
          '  reason: final compilerOptions.noEmit must not be true.',
        ].join('\n'),
      );
    }

    addBuildConfigSemanticProblems({
      buildConfig,
      buildConfigPath: configPath,
      config: options.config,
      localConfig,
      localConfigPath,
      problems: options.problems,
    });
  }
}

function collectConfigFileOwners(
  config: ResolvedLatticeConfig,
  configPaths: string[],
  sourceFiles: Set<string>,
): ConfigFileOwners {
  const ownersByFile: ConfigFileOwners = new Map();
  const proofFilePattern = createExtensionPattern(
    getActiveCheckerExtensions(config),
  );

  for (const configPath of configPaths) {
    if (!existsSync(configPath)) {
      continue;
    }

    for (const filePath of parseProjectFileNames(
      config,
      configPath,
      proofFilePattern,
    )) {
      if (!sourceFiles.has(filePath)) {
        continue;
      }

      const owners = ownersByFile.get(filePath) ?? [];

      owners.push(configPath);
      ownersByFile.set(filePath, owners);
    }
  }

  return ownersByFile;
}

function addDuplicateGraphCoverageProblems(options: {
  config: ResolvedLatticeConfig;
  ownersByFile: ConfigFileOwners;
  problems: string[];
}): void {
  for (const [filePath, owners] of [...options.ownersByFile.entries()].sort(
    ([left], [right]) =>
      toRelativePath(options.config.rootDir, left).localeCompare(
        toRelativePath(options.config.rootDir, right),
      ),
  )) {
    const uniqueOwners = [...new Set(owners)];

    if (uniqueOwners.length <= 1) {
      continue;
    }

    options.problems.push(
      [
        'Duplicate root graph coverage:',
        `  file: ${toRelativePath(options.config.rootDir, filePath)}`,
        '  covered by:',
        ...uniqueOwners
          .sort((left, right) =>
            toRelativePath(options.config.rootDir, left).localeCompare(
              toRelativePath(options.config.rootDir, right),
            ),
          )
          .map(
            (configPath) =>
              `    - ${toRelativePath(options.config.rootDir, configPath)}`,
          ),
        '  reason: a root graph file must have a single build owner; move the file to one build leaf or narrow include/exclude patterns.',
      ].join('\n'),
    );
  }
}

function addDuplicateTypecheckCoverageProblems(options: {
  config: ResolvedLatticeConfig;
  ownersByFile: ConfigFileOwners;
  problems: string[];
}): void {
  for (const [filePath, owners] of [...options.ownersByFile.entries()].sort(
    ([left], [right]) =>
      toRelativePath(options.config.rootDir, left).localeCompare(
        toRelativePath(options.config.rootDir, right),
      ),
  )) {
    const uniqueOwners = [...new Set(owners)];

    if (uniqueOwners.length <= 1) {
      continue;
    }

    options.problems.push(
      [
        'Duplicate IDE/typecheck route coverage:',
        `  file: ${toRelativePath(options.config.rootDir, filePath)}`,
        '  covered by:',
        ...uniqueOwners
          .sort((left, right) =>
            toRelativePath(options.config.rootDir, left).localeCompare(
              toRelativePath(options.config.rootDir, right),
            ),
          )
          .map(
            (configPath) =>
              `    - ${toRelativePath(options.config.rootDir, configPath)}`,
          ),
        '  reason: a file in the IDE/typecheck route should have a single local tsconfig owner; move the file to one layer or narrow include/exclude patterns.',
      ].join('\n'),
    );
  }
}

function addTypecheckRouteProblems(options: {
  buildConfigPaths: string[];
  config: ResolvedLatticeConfig;
  problems: string[];
  typecheckProjectPaths: string[];
}): void {
  const typecheckProjectPathSet = new Set(options.typecheckProjectPaths);

  for (const buildConfigPath of options.buildConfigPaths) {
    const localConfigPath = getStrictLocalConfigPath(buildConfigPath);

    if (!existsSync(localConfigPath)) {
      continue;
    }

    if (typecheckProjectPathSet.has(localConfigPath)) {
      continue;
    }

    options.problems.push(
      [
        'Build companion config is not reachable from IDE/typecheck route:',
        `  build config: ${toRelativePath(options.config.rootDir, buildConfigPath)}`,
        `  expected local config: ${toRelativePath(options.config.rootDir, localConfigPath)}`,
        `  root: ${typecheckRootConfig(options.config)}`,
        '  reason: every tsconfig*.build.json companion must be reachable from the ordinary tsconfig.json route used by editors and local typecheck analysis.',
      ].join('\n'),
    );
  }
}

function addAllowlistProblems(options: {
  allowlistEntries: AllowlistEntry[];
  baseCoverageByFile: Map<string, CoverageSource[]>;
  config: ResolvedLatticeConfig;
  problems: string[];
  sourceFiles: Set<string>;
}): void {
  for (const entry of options.allowlistEntries) {
    if (!existsSync(entry.filePath)) {
      options.problems.push(
        [
          'Typecheck proof allowlist references a missing file:',
          `  file: ${toRelativePath(options.config.rootDir, entry.filePath)}`,
        ].join('\n'),
      );
      continue;
    }

    if (!options.sourceFiles.has(entry.filePath)) {
      options.problems.push(
        [
          'Typecheck proof allowlist file is outside the configured source boundary:',
          `  file: ${toRelativePath(options.config.rootDir, entry.filePath)}`,
          '  reason: allowlist entries should only describe source files that proof would otherwise require coverage for.',
        ].join('\n'),
      );
      continue;
    }

    if (options.baseCoverageByFile.has(entry.filePath)) {
      options.problems.push(
        [
          'Typecheck proof allowlist file is already covered without the allowlist:',
          `  file: ${toRelativePath(options.config.rootDir, entry.filePath)}`,
        ].join('\n'),
      );
    }
  }
}

function addUncoveredSourceProblems(options: {
  config: ResolvedLatticeConfig;
  coverageByFile: Map<string, CoverageSource[]>;
  problems: string[];
  sourceFiles: Set<string>;
}): void {
  const uncoveredFiles = [...options.sourceFiles].filter(
    (filePath) => !options.coverageByFile.has(filePath),
  );

  if (uncoveredFiles.length === 0) {
    return;
  }

  options.problems.push(
    [
      'Source files are not covered by typecheck proof:',
      ...uncoveredFiles
        .slice(0, 20)
        .map(
          (filePath) =>
            `  - ${toRelativePath(options.config.rootDir, filePath)}`,
        ),
      uncoveredFiles.length > 20
        ? `  ... ${uncoveredFiles.length - 20} more`
        : '',
      '  reason: every file in config.source must be covered by the root graph, an active checker route, or an explicit allowlist entry.',
    ]
      .filter(Boolean)
      .join('\n'),
  );
}

async function runProofCheckInternal(
  config: ResolvedLatticeConfig,
  options: { logSuccess?: boolean } = {},
): Promise<boolean> {
  const problems: string[] = [];
  const graphRoute = collectGraphProjectRoute(config);
  const graphProjectPaths = graphRoute.projectPaths;
  const graphProjectPathSet = new Set(graphProjectPaths);
  const buildConfigPaths = await collectBuildConfigPaths(config);
  const typecheckRoute = collectTypecheckTargetProjectPaths({
    rootConfigPath: path.join(config.rootDir, typecheckRootConfig(config)),
    rootDir: config.rootDir,
  });
  const typecheckProjectPaths = typecheckRoute.projectPaths;

  problems.push(...graphRoute.problems);
  problems.push(...typecheckRoute.problems);

  addBuildConfigProblems({
    buildConfigPaths,
    config,
    graphProjectPaths: graphProjectPathSet,
    problems,
  });
  addTypecheckRouteProblems({
    buildConfigPaths,
    config,
    problems,
    typecheckProjectPaths,
  });

  if (problems.length > 0) {
    ProofLogger.error(problems.join('\n\n'));
    return false;
  }

  const checkerTargetCollection = collectCheckerCoverageTargets(config);
  const checkerTargets = checkerTargetCollection.targets;

  problems.push(...checkerTargetCollection.problems);

  if (problems.length > 0) {
    ProofLogger.error(problems.join('\n\n'));
    return false;
  }

  const sourceFiles = await collectExpectedSourceFiles(config);
  const allowlistCollection = collectConfiguredAllowlistEntries(config);
  const allowlistEntries = allowlistCollection.entries;

  problems.push(...allowlistCollection.problems);

  const baseCoverageByFile = collectCoverage({
    allowlistEntries,
    checkerTargets,
    config,
    graphProjectPaths,
    includeAllowlist: false,
    sourceFiles,
  });
  const coverageByFile = collectCoverage({
    allowlistEntries,
    checkerTargets,
    config,
    graphProjectPaths,
    sourceFiles,
  });
  const graphFileOwners = collectConfigFileOwners(
    config,
    graphProjectPaths,
    sourceFiles,
  );
  const typecheckFileOwners = collectConfigFileOwners(
    config,
    typecheckProjectPaths,
    sourceFiles,
  );

  addDuplicateGraphCoverageProblems({
    config,
    ownersByFile: graphFileOwners,
    problems,
  });
  addDuplicateTypecheckCoverageProblems({
    config,
    ownersByFile: typecheckFileOwners,
    problems,
  });
  addAllowlistProblems({
    allowlistEntries,
    baseCoverageByFile,
    config,
    problems,
    sourceFiles,
  });
  addUncoveredSourceProblems({
    config,
    coverageByFile,
    problems,
    sourceFiles,
  });

  if (problems.length > 0) {
    ProofLogger.error(problems.join('\n\n'));
    return false;
  }

  const graphFileCount = [...coverageByFile.values()].filter((sources) =>
    sources.some((source) => source.type === 'graph'),
  ).length;
  const checkerFileCount = [...coverageByFile.values()].filter((sources) =>
    sources.some((source) => source.type === 'checker'),
  ).length;

  if (options.logSuccess ?? true) {
    ProofLogger.success(
      [
        `Checked ${graphProjectPaths.length} graph projects and ${buildConfigPaths.length} build configs.`,
        `IDE/typecheck route covers ${typecheckProjectPaths.length} configs from ${typecheckRootConfig(config)}.`,
        `Root graph covers ${graphFileCount} files; active checker routes cover ${checkerFileCount} files.`,
        `Configured source boundary covers ${sourceFiles.size} files.`,
      ].join('\n'),
    );
  }

  if (
    (options.logSuccess ?? true) &&
    (config.proof?.allowlist ?? []).length > 0
  ) {
    ProofLogger.info(
      `Explicit typecheck proof allowlist: ${(config.proof?.allowlist ?? [])
        .map((entry) => entry.file)
        .join(', ')}`,
    );
  }

  return true;
}

export async function runProofCheck(
  config: ResolvedLatticeConfig,
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
    const passed = await runProofCheckInternal(config, { logSuccess });

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
