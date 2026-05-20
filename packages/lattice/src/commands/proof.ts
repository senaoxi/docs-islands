import { existsSync } from 'node:fs';
import path from 'node:path';
import { glob } from 'tinyglobby';
import ts from 'typescript';
import type { ResolvedLatticeConfig } from '../config';
import { ProofLogger } from '../logger';
import {
  collectGraphProjectPaths,
  collectTypecheckTargetProjectPaths,
  createFormatHost,
  parseProjectFileNames,
} from '../tsconfig';
import { normalizeAbsolutePath, toRelativePath } from '../utils/path';

type TypecheckTool = 'tsc' | 'vue-tsc' | string;

interface SidecarTarget {
  configPath: string;
  label: string;
  tool: TypecheckTool;
}

interface CoverageSource {
  label: string;
  type: 'allowlist' | 'graph' | 'sidecar';
}

type ConfigFileOwners = Map<string, string[]>;

interface ParsedConfig {
  fileNames: string[];
  options: ts.CompilerOptions;
}

const buildConfigPattern = '**/tsconfig*.build.json';

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

function sourceFilePattern(config: ResolvedLatticeConfig): RegExp {
  return new RegExp(
    config.proof?.sourceFilePattern ??
      String.raw`\.(?:[cm]?tsx?|d\.[cm]?ts|json)$`,
    'u',
  );
}

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

function collectConfiguredSidecarTargets(
  config: ResolvedLatticeConfig,
): SidecarTarget[] {
  return (config.proof?.sidecarTargets ?? []).map((target) => ({
    configPath: normalizeAbsolutePath(path.join(config.rootDir, target.config)),
    label: target.label ?? 'configured-sidecar',
    tool: target.tool,
  }));
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
  sidecarTargets: SidecarTarget[];
}): Map<string, CoverageSource[]> {
  const coverageByFile = new Map<string, CoverageSource[]>();
  const pattern = sourceFilePattern(options.config);

  for (const graphProjectPath of options.graphProjectPaths) {
    for (const filePath of parseProjectFileNames(
      options.config,
      graphProjectPath,
      pattern,
    )) {
      addCoverage(coverageByFile, filePath, {
        label: toRelativePath(options.config.rootDir, graphProjectPath),
        type: 'graph',
      });
    }
  }

  for (const sidecarTarget of options.sidecarTargets) {
    for (const filePath of parseProjectFileNames(
      options.config,
      sidecarTarget.configPath,
      pattern,
    )) {
      addCoverage(coverageByFile, filePath, {
        label: `${toRelativePath(options.config.rootDir, sidecarTarget.configPath)} via ${sidecarTarget.tool}`,
        type: 'sidecar',
      });
    }
  }

  if (options.includeAllowlist !== false) {
    for (const entry of options.config.proof?.allowlist ?? []) {
      addCoverage(
        coverageByFile,
        normalizeAbsolutePath(path.join(options.config.rootDir, entry.file)),
        {
          label: entry.reason,
          type: 'allowlist',
        },
      );
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
): ConfigFileOwners {
  const ownersByFile: ConfigFileOwners = new Map();
  const pattern = sourceFilePattern(config);

  for (const configPath of configPaths) {
    if (!existsSync(configPath)) {
      continue;
    }

    for (const filePath of parseProjectFileNames(config, configPath, pattern)) {
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
        `  root: ${options.config.proof?.typecheckRootConfig ?? 'tsconfig.json'}`,
        '  reason: every tsconfig*.build.json companion must be reachable from the ordinary tsconfig.json route used by editors and local typecheck analysis.',
      ].join('\n'),
    );
  }
}

function addAllowlistProblems(options: {
  baseCoverageByFile: Map<string, CoverageSource[]>;
  config: ResolvedLatticeConfig;
  problems: string[];
}): void {
  for (const entry of options.config.proof?.allowlist ?? []) {
    const filePath = normalizeAbsolutePath(
      path.join(options.config.rootDir, entry.file),
    );

    if (!existsSync(filePath)) {
      options.problems.push(
        [
          'Typecheck proof allowlist references a missing file:',
          `  file: ${toRelativePath(options.config.rootDir, filePath)}`,
        ].join('\n'),
      );
    }

    if (options.baseCoverageByFile.has(filePath)) {
      options.problems.push(
        [
          'Typecheck proof allowlist file is already covered without the allowlist:',
          `  file: ${toRelativePath(options.config.rootDir, filePath)}`,
        ].join('\n'),
      );
    }
  }
}

export async function runProofCheck(
  config: ResolvedLatticeConfig,
): Promise<boolean> {
  const problems: string[] = [];
  const graphProjectPaths = collectGraphProjectPaths(config);
  const graphProjectPathSet = new Set(graphProjectPaths);
  const buildConfigPaths = await collectBuildConfigPaths(config);
  const typecheckRoute = collectTypecheckTargetProjectPaths({
    rootConfigPath: path.join(
      config.rootDir,
      config.proof?.typecheckRootConfig ?? 'tsconfig.json',
    ),
    rootDir: config.rootDir,
  });
  const typecheckProjectPaths = typecheckRoute.projectPaths;

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

  const sidecarTargets = collectConfiguredSidecarTargets(config);
  const baseCoverageByFile = collectCoverage({
    config,
    graphProjectPaths,
    includeAllowlist: false,
    sidecarTargets,
  });
  const coverageByFile = collectCoverage({
    config,
    graphProjectPaths,
    sidecarTargets,
  });
  const graphFileOwners = collectConfigFileOwners(config, graphProjectPaths);
  const typecheckFileOwners = collectConfigFileOwners(
    config,
    typecheckProjectPaths,
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
    baseCoverageByFile,
    config,
    problems,
  });

  if (problems.length > 0) {
    ProofLogger.error(problems.join('\n\n'));
    return false;
  }

  const graphFileCount = [...coverageByFile.values()].filter((sources) =>
    sources.some((source) => source.type === 'graph'),
  ).length;
  const sidecarFileCount = [...coverageByFile.values()].filter((sources) =>
    sources.some((source) => source.type === 'sidecar'),
  ).length;

  ProofLogger.success(
    [
      `Checked ${graphProjectPaths.length} graph projects and ${buildConfigPaths.length} build configs.`,
      `IDE/typecheck route covers ${typecheckProjectPaths.length} configs from ${config.proof?.typecheckRootConfig ?? 'tsconfig.json'}.`,
      `Root graph covers ${graphFileCount} files; configured sidecars cover ${sidecarFileCount} files.`,
    ].join('\n'),
  );

  if ((config.proof?.allowlist ?? []).length > 0) {
    ProofLogger.info(
      `Explicit typecheck proof allowlist: ${(config.proof?.allowlist ?? [])
        .map((entry) => entry.file)
        .join(', ')}`,
    );
  }

  return true;
}
